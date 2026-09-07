// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {AttestationRegistry} from "./AttestationRegistry.sol";
import {NullifierRegistry} from "./NullifierRegistry.sol";

interface IHonkVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs)
        external
        view
        returns (bool);
}

/// @title CredentialRegistry
/// @notice Issues income credentials against a proof, and answers the public
///         verification page.
/// @dev Requires that every commitment was attested to the named payer, that
///      the proof verifies over those same commitments, and that the subject
///      authorized the issuance.
contract CredentialRegistry is Ownable, ReentrancyGuard, EIP712 {
    /// @dev Circuit public inputs: recipient, band, then two 128-bit limbs per
    ///      commitment, high first.
    uint256 public constant PERIODS = 3;
    uint256 public constant PUBLIC_INPUTS = 2 + PERIODS * 2;
    uint256 public constant BAND_COUNT = 10;

    /// @dev The verifier reduces each public word modulo this. Solidity does
    ///      not, so a non-canonical representative would mean one thing to the
    ///      proof and another to this contract.
    uint256 internal constant BN254_SCALAR_MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    bytes32 public constant CLAIM_DOMAIN = keccak256("ORRU_CREDENTIAL_V1");

    bytes32 public constant ISSUE_TYPEHASH = keccak256(
        "Issue(bytes32 proofHash,bytes32 publicInputsHash,address evidencePayer,bytes32 documentHash,uint256 nonce,uint256 deadline)"
    );

    enum Status {
        Unknown,
        Valid,
        Revoked
    }

    /// @dev Grouped so the call stays within Solidity's stack limits; via_ir is
    ///      not available here because it breaks the generated verifier.
    struct IssueRequest {
        bytes proof;
        bytes32[] publicInputs;
        address evidencePayer;
        bytes32 documentHash;
        uint256 deadline;
        bytes subjectAuthorization;
    }

    struct Credential {
        address subject;
        address evidencePayer;
        uint8 band;
        uint8 periodsProven;
        uint64 issuedAt;
        /// @dev Source block height of the newest payment proven. Credentials do
        ///      not expire; consumers apply their own freshness policy to this.
        uint64 evidenceEndHeight;
        uint64 revokedAt;
        bytes32 documentHash;
    }

    AttestationRegistry public immutable attestations;
    NullifierRegistry public immutable nullifiers;
    IHonkVerifier public immutable verifier;

    mapping(bytes32 credentialId => Credential) private _credentials;

    /// @dev Replay protection for subject authorizations.
    mapping(address subject => uint256) public nonces;

    event CredentialIssued(
        bytes32 indexed credentialId,
        address indexed subject,
        address indexed evidencePayer,
        uint8 band,
        uint64 evidenceEndHeight,
        bytes32 documentHash
    );
    event CredentialRevoked(bytes32 indexed credentialId, address indexed revokedBy);

    error ZeroAddress();
    error WrongPublicInputCount(uint256 given, uint256 expected);
    error NonCanonicalPublicInput(uint256 index);
    error InvalidSubjectEncoding();
    error InvalidCommitmentLimb(uint256 index);
    error UnknownBand(uint256 band);
    error CommitmentNotAttestedToPayer(bytes32 commitment, address payer);
    error InvalidProof();
    error CredentialExists(bytes32 credentialId);
    error NoSuchCredential(bytes32 credentialId);
    error AlreadyRevoked(bytes32 credentialId);
    error NotOwnerOrSubject(address caller);
    error AuthorizationExpired(uint256 deadline);
    error InvalidSubjectAuthorization(address subject);

    constructor(
        AttestationRegistry _attestations,
        NullifierRegistry _nullifiers,
        IHonkVerifier _verifier,
        address initialOwner
    ) Ownable(initialOwner) EIP712("Orru", "1") {
        if (address(_attestations) == address(0)) revert ZeroAddress();
        if (address(_nullifiers) == address(0)) revert ZeroAddress();
        if (address(_verifier) == address(0)) revert ZeroAddress();

        attestations = _attestations;
        nullifiers = _nullifiers;
        verifier = _verifier;
    }

    /// @notice Issues a credential to the subject named in the proof.
    /// @dev Permissionless so a relayer can pay gas. The credential is bound to
    ///      the subject in the public inputs, never to the caller.
    ///      `req.evidencePayer` is the payer all commitments must be attested
    ///      to; period numbers are payer-local, so mixing them would let
    ///      unrelated timelines read as one recurring income.
    ///      `req.subjectAuthorization` is an EIP-712 signature from the subject:
    ///      a valid proof shows the payments exist, not that whoever submitted
    ///      it controls the address they name. Supports ERC-1271.
    function issue(IssueRequest calldata req) external nonReentrant returns (bytes32 credentialId) {
        if (req.publicInputs.length != PUBLIC_INPUTS) {
            revert WrongPublicInputCount(req.publicInputs.length, PUBLIC_INPUTS);
        }
        if (req.evidencePayer == address(0)) revert ZeroAddress();

        _assertCanonical(req.publicInputs);

        address subject = address(uint160(uint256(req.publicInputs[0])));
        if (subject == address(0)) revert ZeroAddress();
        if (uint256(req.publicInputs[1]) >= BAND_COUNT) {
            revert UnknownBand(uint256(req.publicInputs[1]));
        }

        _assertAuthorized(subject, req);

        if (!verifier.verify(req.proof, req.publicInputs)) revert InvalidProof();

        credentialId = claimKeyFor(req.publicInputs, subject);
        if (_credentials[credentialId].subject != address(0)) {
            revert CredentialExists(credentialId);
        }

        _credentials[credentialId] = Credential({
            subject: subject,
            evidencePayer: req.evidencePayer,
            band: uint8(uint256(req.publicInputs[1])),
            periodsProven: uint8(PERIODS),
            issuedAt: uint64(block.timestamp),
            evidenceEndHeight: _checkAttestedAndDate(req.publicInputs, req.evidencePayer),
            revokedAt: 0,
            documentHash: req.documentHash
        });

        nullifiers.markSpent(credentialId);

        emit CredentialIssued(
            credentialId,
            subject,
            req.evidencePayer,
            uint8(uint256(req.publicInputs[1])),
            _credentials[credentialId].evidenceEndHeight,
            req.documentHash
        );
    }

    /// @notice Revokes a credential. Owner or the subject.
    function revoke(bytes32 credentialId) external {
        Credential storage c = _credentials[credentialId];
        if (c.subject == address(0)) revert NoSuchCredential(credentialId);
        if (c.revokedAt != 0) revert AlreadyRevoked(credentialId);
        if (msg.sender != owner() && msg.sender != c.subject) {
            revert NotOwnerOrSubject(msg.sender);
        }

        c.revokedAt = uint64(block.timestamp);

        emit CredentialRevoked(credentialId, msg.sender);
    }

    /// @notice Status for the public verification page. No login required.
    /// @dev Credentials do not expire. They attest a dated past window, which
    ///      stays true; whether that window is recent enough is the consumer's
    ///      policy, applied to `evidenceEndHeight`.
    function statusOf(bytes32 credentialId) external view returns (Status) {
        Credential storage c = _credentials[credentialId];
        if (c.subject == address(0)) return Status.Unknown;
        return c.revokedAt == 0 ? Status.Valid : Status.Revoked;
    }

    /// @notice EIP-712 domain separator, for building subject authorizations.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Full credential record. Zeroed for an unknown id.
    function credentialOf(bytes32 credentialId) external view returns (Credential memory) {
        return _credentials[credentialId];
    }

    /// @dev Every commitment must be attested to the same payer. Returns the
    ///      newest source height, which dates the evidence.
    function _checkAttestedAndDate(bytes32[] calldata publicInputs, address evidencePayer)
        internal
        view
        returns (uint64 evidenceEndHeight)
    {
        for (uint256 i; i < PERIODS; ++i) {
            bytes32 commitment = _commitmentAt(publicInputs, i);
            if (!attestations.acceptedByPayer(commitment, evidencePayer)) {
                revert CommitmentNotAttestedToPayer(commitment, evidencePayer);
            }
            uint64 h = attestations.provenAtHeight(commitment, evidencePayer);
            if (h > evidenceEndHeight) evidenceEndHeight = h;
        }
    }

    /// @notice The replay identity for a claim. Public so future consumers
    ///         derive it rather than reimplement it.
    /// @dev Deliberately excludes `evidencePayer`. One commitment may be
    ///      attested under several payers, so including it would let the same
    ///      evidence issue once per payer.
    function claimKeyFor(bytes32[] calldata publicInputs, address subject)
        public
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                CLAIM_DOMAIN,
                subject,
                _commitmentAt(publicInputs, 0),
                _commitmentAt(publicInputs, 1),
                _commitmentAt(publicInputs, 2)
            )
        );
    }

    /// @dev Binds every mutable issuance value, so a copied pending transaction
    ///      cannot be resubmitted with a substituted document hash or payer.
    function _assertAuthorized(address subject, IssueRequest calldata req) internal {
        if (block.timestamp > req.deadline) revert AuthorizationExpired(req.deadline);

        uint256 nonce = nonces[subject];
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ISSUE_TYPEHASH,
                    keccak256(req.proof),
                    keccak256(abi.encodePacked(req.publicInputs)),
                    req.evidencePayer,
                    req.documentHash,
                    nonce,
                    req.deadline
                )
            )
        );

        if (!SignatureChecker.isValidSignatureNow(subject, digest, req.subjectAuthorization)) {
            revert InvalidSubjectAuthorization(subject);
        }

        nonces[subject] = nonce + 1;
    }

    /// @dev Rejects representations the verifier and Solidity would read
    ///      differently, then enforces the widths the public ABI implies.
    function _assertCanonical(bytes32[] calldata publicInputs) internal pure {
        for (uint256 i; i < publicInputs.length; ++i) {
            if (uint256(publicInputs[i]) >= BN254_SCALAR_MODULUS) {
                revert NonCanonicalPublicInput(i);
            }
        }

        if (uint256(publicInputs[0]) > type(uint160).max) revert InvalidSubjectEncoding();

        for (uint256 i; i < PERIODS; ++i) {
            if (
                uint256(publicInputs[2 + i * 2]) > type(uint128).max
                    || uint256(publicInputs[3 + i * 2]) > type(uint128).max
            ) {
                revert InvalidCommitmentLimb(i);
            }
        }
    }

    /// @dev Reassembles a commitment from its two 128-bit limbs, high first.
    function _commitmentAt(bytes32[] calldata publicInputs, uint256 index)
        internal
        pure
        returns (bytes32)
    {
        uint256 hi = uint256(publicInputs[2 + index * 2]);
        uint256 lo = uint256(publicInputs[3 + index * 2]);
        return bytes32((hi << 128) | lo);
    }
}
