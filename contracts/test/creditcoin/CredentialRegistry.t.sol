// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

import {CredentialRegistry, IHonkVerifier} from "../../src/creditcoin/CredentialRegistry.sol";
import {AttestationRegistry} from "../../src/creditcoin/AttestationRegistry.sol";
import {NullifierRegistry} from "../../src/creditcoin/NullifierRegistry.sol";
import {INativeQueryVerifier, NativeQueryVerifierLib} from "../../src/attestcoin/VerifierInterface.sol";

/// @dev Stands in for the generated HonkVerifier. The real one is exercised
///      against a genuine proof in the end-to-end run, not in unit tests.
contract MockVerifier is IHonkVerifier {
    bool public accepts = true;

    function setAccepts(bool v) external {
        accepts = v;
    }

    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        return accepts;
    }
}

/// @dev Minimal ERC-1271 wallet: valid when its owner signed.
contract SmartAccount {
    address public immutable signerOwner;

    constructor(address owner_) {
        signerOwner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4)
    {
        (bytes32 r, bytes32 s, uint8 v) = _split(signature);
        return ecrecover(hash, v, r, s) == signerOwner ? bytes4(0x1626ba7e) : bytes4(0);
    }

    function _split(bytes calldata sig) private pure returns (bytes32 r, bytes32 s, uint8 v) {
        r = bytes32(sig[0:32]);
        s = bytes32(sig[32:64]);
        v = uint8(sig[64]);
    }
}

contract CredentialRegistryTest is Test {
    address internal constant NQV = NativeQueryVerifierLib.PRECOMPILE_ADDRESS;
    uint64 internal constant SEPOLIA = 1;

    CredentialRegistry internal credentials;
    AttestationRegistry internal attestations;
    NullifierRegistry internal nullifiers;
    MockVerifier internal verifier;

    address internal owner = makeAddr("owner");
    address internal anchorContract = makeAddr("payerAnchor");
    address internal payer = makeAddr("payroll");
    address internal subject;
    uint256 internal subjectPk;
    address internal relayer = makeAddr("relayer");
    address internal stranger = makeAddr("stranger");

    bytes32[] internal commitments;

    function setUp() public {
        (subject, subjectPk) = makeAddrAndKey("worker");
        attestations = new AttestationRegistry(SEPOLIA, anchorContract, owner);
        nullifiers = new NullifierRegistry(owner);
        verifier = new MockVerifier();
        credentials = new CredentialRegistry(attestations, nullifiers, verifier, owner);

        vm.startPrank(owner);
        attestations.setPayerApproval(payer, true);
        nullifiers.setAuthorized(address(credentials), true);
        vm.stopPrank();

        vm.mockCall(NQV, abi.encodeWithSelector(INativeQueryVerifier.calculateTxIndex.selector), abi.encode(uint64(1)));
        vm.mockCall(NQV, abi.encodeWithSelector(INativeQueryVerifier.verifyAndEmit.selector), abi.encode(true));

        for (uint256 i; i < 3; ++i) {
            commitments.push(keccak256(abi.encode("commitment", i)));
        }
        _attest(commitments);
    }

    // ---------------------------------------------------------------- happy

    function test_issuesAgainstAttestedCommitments() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);

        vm.prank(relayer);
        bytes32 id = _issueSigned(pub, payer, keccak256("statement"));

        assertEq(uint8(credentials.statusOf(id)), uint8(CredentialRegistry.Status.Valid));

        CredentialRegistry.Credential memory c = credentials.credentialOf(id);
        assertEq(c.subject, subject, "credential belongs to the proof subject, not the caller");
        assertEq(c.band, 4);
        assertEq(c.periodsProven, 3);
        assertEq(c.documentHash, keccak256("statement"));
        assertTrue(nullifiers.spent(id), "the claim key must be consumed");
    }

    // ------------------------------------------------------------- negatives

    /// @dev SAME-COMMITMENT. A proof over commitments nobody attested must fail
    ///      even when the proof itself verifies.
    function test_rejectsCommitmentsThatWereNeverAttested() public {
        bytes32[] memory unattested = new bytes32[](3);
        for (uint256 i; i < 3; ++i) {
            unattested[i] = keccak256(abi.encode("never-attested", i));
        }
        bytes32[] memory pub = _publicInputs(subject, 4, unattested);

        CredentialRegistry.IssueRequest memory _r = _req(pub, payer, bytes32(0));
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.CommitmentNotAttestedToPayer.selector, unattested[0], payer)
        );
        credentials.issue(_r);
    }

    /// @dev One attested commitment among unattested ones is not enough.
    function test_rejectsAPartiallyAttestedClaim() public {
        bytes32[] memory mixed = new bytes32[](3);
        mixed[0] = commitments[0];
        mixed[1] = keccak256("not-attested");
        mixed[2] = commitments[2];

        bytes32[] memory pub = _publicInputs(subject, 4, mixed);
        CredentialRegistry.IssueRequest memory _r = _req(pub, payer, bytes32(0));
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.CommitmentNotAttestedToPayer.selector, mixed[1], payer)
        );
        credentials.issue(_r);
    }

    function test_rejectsAnInvalidProof() public {
        verifier.setAccepts(false);
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);

        CredentialRegistry.IssueRequest memory _r = _req(pub, payer, bytes32(0));
        vm.expectRevert(CredentialRegistry.InvalidProof.selector);
        credentials.issue(_r);
    }

    /// @dev Identical evidence is the replay, and the claim key is derived
    ///      from it rather than supplied, so there is nothing to vary.
    function test_rejectsAReplayOfTheSameEvidence() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        bytes32 id = _issueSigned(pub, payer, bytes32(0));

        CredentialRegistry.IssueRequest memory _r = _req(pub, payer, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.CredentialExists.selector, id));
        credentials.issue(_r);

        // The global spent set is the second line of defence and is also set.
        assertTrue(nullifiers.spent(id), "the claim key stays spent");
    }

    /// @dev One evidence set, one claim. A commitment may be attested under
    ///      several payers, so the replay identity must not include the payer or
    ///      the same evidence issues once per payer.
    function test_sameEvidenceCannotIssueTwiceUnderDifferentPayers() public {
        address secondPayer = makeAddr("secondPayer");
        vm.prank(owner);
        attestations.setPayerApproval(secondPayer, true);

        // The same three commitments, also attested to the second payer.
        _attestTo(commitments, secondPayer);

        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        bytes32 id = _issueSigned(pub, payer, bytes32(0));

        CredentialRegistry.IssueRequest memory r = _req(pub, secondPayer, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.CredentialExists.selector, id));
        credentials.issue(r);
    }

    /// @dev The date must come from the payer the credential names.
    function test_evidenceDateComesFromTheNamedPayer() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        bytes32 id = _issueSigned(pub, payer, bytes32(0));
        assertGt(credentials.credentialOf(id).evidenceEndHeight, 0);
        assertEq(credentials.credentialOf(id).evidencePayer, payer);
    }

    /// @dev Commitments attested to a different payer must not compose. Period
    ///      numbers are payer-local, so mixing them would read unrelated
    ///      timelines as one recurring income.
    function test_rejectsCommitmentsAttestedToAnotherPayer() public {
        address otherPayer = makeAddr("otherPayer");
        vm.prank(owner);
        attestations.setPayerApproval(otherPayer, true);

        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        CredentialRegistry.IssueRequest memory _r = _req(pub, otherPayer, bytes32(0));
        vm.expectRevert(
            abi.encodeWithSelector(
                CredentialRegistry.CommitmentNotAttestedToPayer.selector, commitments[0], otherPayer
            )
        );
        credentials.issue(_r);
    }

    /// @dev A word at or above the field modulus reads as one value to the
    ///      verifier and another to Solidity.
    function test_rejectsANonCanonicalPublicInput() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        pub[1] = bytes32(
            uint256(21888242871839275222246405745257275088548364400416034343698204186575808495617)
        );
        CredentialRegistry.IssueRequest memory _r = _req(pub, payer, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.NonCanonicalPublicInput.selector, 1));
        credentials.issue(_r);
    }

    function test_rejectsASubjectWiderThanAnAddress() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        pub[0] = bytes32(uint256(type(uint160).max) + 1);
        CredentialRegistry.IssueRequest memory _r = _req(pub, payer, bytes32(0));
        vm.expectRevert(CredentialRegistry.InvalidSubjectEncoding.selector);
        credentials.issue(_r);
    }

    function test_rejectsAnOversizedCommitmentLimb() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        pub[2] = bytes32(uint256(type(uint128).max) + 1);
        CredentialRegistry.IssueRequest memory _r = _req(pub, payer, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.InvalidCommitmentLimb.selector, 0));
        credentials.issue(_r);
    }

    /// @dev Credentials never expire; they carry the dated evidence instead.
    function test_recordsEvidenceHeightAndNeverExpires() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        bytes32 id = _issueSigned(pub, payer, bytes32(0));

        CredentialRegistry.Credential memory c = credentials.credentialOf(id);
        assertGt(c.evidenceEndHeight, 0, "evidence must be dated");
        assertEq(c.evidencePayer, payer);

        vm.warp(block.timestamp + 3650 days);
        assertEq(
            uint8(credentials.statusOf(id)),
            uint8(CredentialRegistry.Status.Valid),
            "a dated past fact stays true"
        );
    }

    function test_rejectsAnUnknownBand() public {
        bytes32[] memory pub = _publicInputs(subject, 10, commitments);
        CredentialRegistry.IssueRequest memory _r = _req(pub, payer, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.UnknownBand.selector, 10));
        credentials.issue(_r);
    }

    function test_rejectsTheWrongPublicInputCount() public {
        bytes32[] memory pub = new bytes32[](7);
        CredentialRegistry.IssueRequest memory _r = _req(pub, payer, bytes32(0));
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.WrongPublicInputCount.selector, 7, 8)
        );
        credentials.issue(_r);
    }

    function test_rejectsAZeroSubject() public {
        bytes32[] memory pub = _publicInputs(address(0), 4, commitments);
        CredentialRegistry.IssueRequest memory _r = _req(pub, payer, bytes32(0));
        vm.expectRevert(CredentialRegistry.ZeroAddress.selector);
        credentials.issue(_r);
    }

    // --------------------------------------------------- subject authorization

    function test_rejectsASignatureFromTheWrongSigner() public {
        (, uint256 impostorPk) = makeAddrAndKey("impostor");
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        uint256 deadline = block.timestamp + 1 hours;

        CredentialRegistry.IssueRequest memory r = CredentialRegistry.IssueRequest({
            proof: hex"01",
            publicInputs: pub,
            evidencePayer: payer,
            documentHash: bytes32(0),
            deadline: deadline,
            subjectAuthorization: _sign(impostorPk, pub, payer, bytes32(0), deadline)
        });

        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.InvalidSubjectAuthorization.selector, subject)
        );
        credentials.issue(r);
    }

    function test_rejectsAnExpiredAuthorization() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        CredentialRegistry.IssueRequest memory r = _req(pub, payer, bytes32(0));

        vm.warp(r.deadline + 1);
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.AuthorizationExpired.selector, r.deadline)
        );
        credentials.issue(r);
    }

    /// @dev Every mutable field must be bound, or a copied pending transaction
    ///      can be resubmitted with one of them swapped.
    function test_rejectsMutationOfEachSignedField() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);

        // document hash swapped after signing
        CredentialRegistry.IssueRequest memory r = _req(pub, payer, bytes32(0));
        r.documentHash = keccak256("substituted");
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.InvalidSubjectAuthorization.selector, subject)
        );
        credentials.issue(r);

        // evidence payer swapped after signing
        address other = makeAddr("otherPayer");
        vm.prank(owner);
        attestations.setPayerApproval(other, true);
        _attestTo(commitments, other);

        CredentialRegistry.IssueRequest memory r2 = _req(pub, payer, bytes32(0));
        r2.evidencePayer = other;
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.InvalidSubjectAuthorization.selector, subject)
        );
        credentials.issue(r2);

        // proof swapped after signing
        CredentialRegistry.IssueRequest memory r3 = _req(pub, payer, bytes32(0));
        r3.proof = hex"02";
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.InvalidSubjectAuthorization.selector, subject)
        );
        credentials.issue(r3);

        // deadline extended after signing
        CredentialRegistry.IssueRequest memory r4 = _req(pub, payer, bytes32(0));
        r4.deadline = r4.deadline + 1;
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.InvalidSubjectAuthorization.selector, subject)
        );
        credentials.issue(r4);
    }

    /// @dev A public input swapped after signing must invalidate it.
    function test_rejectsMutationOfThePublicInputs() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        CredentialRegistry.IssueRequest memory r = _req(pub, payer, bytes32(0));

        bytes32[] memory tampered = _publicInputs(subject, 5, commitments);
        r.publicInputs = tampered;

        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.InvalidSubjectAuthorization.selector, subject)
        );
        credentials.issue(r);
    }

    /// @dev A failed issuance must not consume the subject's nonce, or a
    ///      griefer could invalidate signatures by forcing reverts.
    function test_aFailedIssuanceDoesNotBurnTheNonce() public {
        uint256 before = credentials.nonces(subject);

        verifier.setAccepts(false);
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        CredentialRegistry.IssueRequest memory r = _req(pub, payer, bytes32(0));

        vm.expectRevert(CredentialRegistry.InvalidProof.selector);
        credentials.issue(r);

        assertEq(credentials.nonces(subject), before, "nonce must roll back");

        verifier.setAccepts(true);
        _issueSigned(pub, payer, bytes32(0));
        assertEq(credentials.nonces(subject), before + 1, "and advance only on success");
    }

    /// @dev Smart accounts authorize via ERC-1271.
    function test_acceptsAnERC1271SmartAccount() public {
        SmartAccount wallet = new SmartAccount(subject);
        bytes32[] memory cs = new bytes32[](3);
        for (uint256 i; i < 3; ++i) {
            cs[i] = keccak256(abi.encode("smart", i));
        }
        _attest(cs);

        bytes32[] memory pub = _publicInputs(address(wallet), 4, cs);
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 h = _structHash(pub, payer, bytes32(0), deadline, credentials.nonces(address(wallet)));
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", credentials.domainSeparator(), h));
        (uint8 v, bytes32 r_, bytes32 sg) = vm.sign(subjectPk, digest);

        bytes32 id = credentials.issue(
            CredentialRegistry.IssueRequest({
                proof: hex"01",
                publicInputs: pub,
                evidencePayer: payer,
                documentHash: bytes32(0),
                deadline: deadline,
                subjectAuthorization: abi.encodePacked(r_, sg, v)
            })
        );
        assertEq(credentials.credentialOf(id).subject, address(wallet));
    }

    // ------------------------------------------------------------ revocation

    /// @dev Negative test 8: a revoked credential must read as revoked.
    function test_revokedCredentialReadsAsRevoked() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        bytes32 id = _issueSigned(pub, payer, bytes32(0));

        vm.prank(owner);
        credentials.revoke(id);

        assertEq(uint8(credentials.statusOf(id)), uint8(CredentialRegistry.Status.Revoked));
        assertGt(credentials.credentialOf(id).revokedAt, 0);
    }

    function test_subjectCanRevokeTheirOwn() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        bytes32 id = _issueSigned(pub, payer, bytes32(0));

        vm.prank(subject);
        credentials.revoke(id);
        assertEq(uint8(credentials.statusOf(id)), uint8(CredentialRegistry.Status.Revoked));
    }

    function test_strangerCannotRevoke() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        bytes32 id = _issueSigned(pub, payer, bytes32(0));

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.NotOwnerOrSubject.selector, stranger)
        );
        credentials.revoke(id);
    }

    function test_cannotRevokeTwice() public {
        bytes32[] memory pub = _publicInputs(subject, 4, commitments);
        bytes32 id = _issueSigned(pub, payer, bytes32(0));

        vm.startPrank(owner);
        credentials.revoke(id);
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.AlreadyRevoked.selector, id));
        credentials.revoke(id);
        vm.stopPrank();
    }

    function test_unknownCredentialReadsAsUnknown() public view {
        assertEq(
            uint8(credentials.statusOf(keccak256("never-issued"))),
            uint8(CredentialRegistry.Status.Unknown)
        );
    }

    function test_revokingAnUnknownCredentialReverts() public {
        bytes32 id = keccak256("never-issued");
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.NoSuchCredential.selector, id));
        credentials.revoke(id);
    }

    // --------------------------------------------------------------- helpers

    /// @dev Mirrors the circuit's declared public input order.
    function _publicInputs(address subject_, uint256 band, bytes32[] memory cs)
        internal
        pure
        returns (bytes32[] memory pub)
    {
        pub = new bytes32[](8);
        pub[0] = bytes32(uint256(uint160(subject_)));
        pub[1] = bytes32(band);
        for (uint256 i; i < 3; ++i) {
            pub[2 + i * 2] = bytes32(uint256(cs[i]) >> 128);
            pub[3 + i * 2] = bytes32(uint256(cs[i]) & type(uint128).max);
        }
    }

    function _structHash(
        bytes32[] memory pub,
        address evidencePayer,
        bytes32 documentHash,
        uint256 deadline,
        uint256 nonce
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                credentials.ISSUE_TYPEHASH(),
                keccak256(hex"01"),
                keccak256(abi.encodePacked(pub)),
                evidencePayer,
                documentHash,
                nonce,
                deadline
            )
        );
    }

    function _sign(
        uint256 pk,
        bytes32[] memory pub,
        address evidencePayer,
        bytes32 documentHash,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 h = _structHash(pub, evidencePayer, documentHash, deadline, credentials.nonces(vm.addr(pk)));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", credentials.domainSeparator(), h));
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(pk, digest);
        return abi.encodePacked(r, sg, v);
    }

    /// @dev Builds a signed request. All external reads happen here so a test
    ///      can call vm.expectRevert immediately before `issue` itself.
    function _req(bytes32[] memory pub, address evidencePayer, bytes32 documentHash)
        internal
        view
        returns (CredentialRegistry.IssueRequest memory)
    {
        uint256 deadline = block.timestamp + 1 hours;
        return CredentialRegistry.IssueRequest({
            proof: hex"01",
            publicInputs: pub,
            evidencePayer: evidencePayer,
            documentHash: documentHash,
            deadline: deadline,
            subjectAuthorization: _sign(subjectPk, pub, evidencePayer, documentHash, deadline)
        });
    }

    /// @dev Issues with a valid subject authorization from `subjectPk`.
    function _issueSigned(bytes32[] memory pub, address evidencePayer, bytes32 documentHash)
        internal
        returns (bytes32)
    {
        uint256 deadline = block.timestamp + 1 hours;
        return credentials.issue(
            CredentialRegistry.IssueRequest({
                proof: hex"01",
                publicInputs: pub,
                evidencePayer: evidencePayer,
                documentHash: documentHash,
                deadline: deadline,
                subjectAuthorization: _sign(subjectPk, pub, evidencePayer, documentHash, deadline)
            })
        );
    }

    function _attest(bytes32[] memory cs) internal {
        _attestTo(cs, payer);
    }

    function _attestTo(bytes32[] memory cs, address asPayer) internal {
        bytes32 sig = attestations.PAYMENT_ANCHORED_SIG();
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](cs.length);
        for (uint256 i; i < cs.length; ++i) {
            bytes32[] memory topics = new bytes32[](3);
            topics[0] = sig;
            topics[1] = bytes32(uint256(uint160(asPayer)));
            topics[2] = cs[i];
            logs[i] = EvmV1Decoder.LogEntryTuple({address_: anchorContract, topics: topics, data: ""});
        }

        bytes[] memory chunks = new bytes[](3);
        chunks[2] = abi.encode(uint8(1), uint64(21000), logs, bytes(""));

        INativeQueryVerifier.MerkleProofEntry[] memory s =
            new INativeQueryVerifier.MerkleProofEntry[](1);
        s[0] = INativeQueryVerifier.MerkleProofEntry({hash: keccak256("s"), isLeft: true});
        bytes32[] memory roots = new bytes32[](1);
        roots[0] = keccak256("c");

        vm.mockCall(
            NQV,
            abi.encodeWithSelector(INativeQueryVerifier.calculateTxIndex.selector),
            abi.encode(uint64((uint256(uint160(asPayer)) ^ uint256(cs[0])) % 1000000))
        );

        attestations.execute(
            0, SEPOLIA, 1, abi.encode(uint8(2), chunks), keccak256("root"), s, bytes32(0), roots
        );
    }
}
