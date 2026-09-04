// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

import {DemoCreditPool} from "../../src/creditcoin/DemoCreditPool.sol";
import {MockUSDC} from "../../src/creditcoin/MockUSDC.sol";
import {SixDecimalFeeToken} from "../mocks/Tokens.sol";
import {CredentialRegistry, IHonkVerifier} from "../../src/creditcoin/CredentialRegistry.sol";
import {AttestationRegistry} from "../../src/creditcoin/AttestationRegistry.sol";
import {NullifierRegistry} from "../../src/creditcoin/NullifierRegistry.sol";
import {INativeQueryVerifier, NativeQueryVerifierLib} from "../../src/attestcoin/VerifierInterface.sol";

contract AlwaysAccepts is IHonkVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

contract DemoCreditPoolTest is Test {
    address internal constant NQV = NativeQueryVerifierLib.PRECOMPILE_ADDRESS;
    uint64 internal constant SEPOLIA = 1;

    DemoCreditPool internal pool;
    MockUSDC internal musd;
    CredentialRegistry internal credentials;
    AttestationRegistry internal attestations;
    NullifierRegistry internal nullifiers;

    address internal owner = makeAddr("owner");
    address internal anchorContract = makeAddr("payerAnchor");
    address internal payer = makeAddr("payroll");
    address internal subject;
    uint256 internal subjectPk;
    address internal relayer = makeAddr("relayer");
    address internal stranger = makeAddr("stranger");
    address internal lowEarner;
    uint256 internal lowEarnerPk;

    uint256 internal constant LIQUIDITY = 1_000_000e6;
    bytes32 internal validCredential;

    function setUp() public {
        (subject, subjectPk) = makeAddrAndKey("worker");
        (lowEarner, lowEarnerPk) = makeAddrAndKey("lowEarner");
        attestations = new AttestationRegistry(SEPOLIA, anchorContract, owner);
        nullifiers = new NullifierRegistry(owner);
        credentials = new CredentialRegistry(attestations, nullifiers, new AlwaysAccepts(), owner);
        musd = new MockUSDC(owner);
        pool = new DemoCreditPool(IERC20(address(musd)), credentials, owner);

        vm.startPrank(owner);
        attestations.setPayerApproval(payer, true);
        nullifiers.setAuthorized(address(credentials), true);
        musd.mint(address(pool), LIQUIDITY);
        vm.stopPrank();

        vm.mockCall(NQV, abi.encodeWithSelector(INativeQueryVerifier.calculateTxIndex.selector), abi.encode(uint64(1)));
        vm.mockCall(NQV, abi.encodeWithSelector(INativeQueryVerifier.verifyAndEmit.selector), abi.encode(true));

        // Band 4 is $2,500-$4,000, so the limit is 30% of the $2,500 floor.
        validCredential = _issue(subject, 4, keccak256("n1"));
    }

    // ---------------------------------------------------------------- happy

    function test_disbursesAgainstAValidCredential() public {
        uint256 limit = pool.limitForBand(4);
        assertEq(limit, 750e6, "30% of the band 4 floor");

        vm.prank(relayer);
        pool.disburse(validCredential, limit);

        assertEq(musd.balanceOf(subject), limit, "funds go to the subject, not the caller");
        assertEq(pool.remainingFor(validCredential), 0);
    }

    function test_allowsPartialDrawsUpToTheLimit() public {
        vm.startPrank(subject);
        pool.disburse(validCredential, 300e6);
        assertEq(pool.remainingFor(validCredential), 450e6);
        pool.disburse(validCredential, 450e6);
        vm.stopPrank();

        assertEq(musd.balanceOf(subject), 750e6);
        assertEq(pool.remainingFor(validCredential), 0);
    }

    /// @dev The limit comes from the band floor, which is already public, so
    ///      drawing the maximum reveals nothing the band did not.
    function test_limitDerivesFromTheBandFloor() public view {
        assertEq(pool.limitForBand(0), 0, "band 0 spans $0-500 and permits nothing");
        assertEq(pool.limitForBand(1), 150e6);
        assertEq(pool.limitForBand(4), 750e6);
        assertEq(pool.limitForBand(9), 7_500e6);
    }

    // ------------------------------------------------------------- negatives

    /// @dev Negative test 8, at the money. A revoked credential must not pay out.
    function test_rejectsARevokedCredential() public {
        vm.prank(owner);
        credentials.revoke(validCredential);

        vm.prank(subject);
        vm.expectRevert(
            abi.encodeWithSelector(DemoCreditPool.CredentialNotValid.selector, validCredential)
        );
        pool.disburse(validCredential, 100e6);

        assertEq(musd.balanceOf(subject), 0);
    }

    function test_rejectsAnUnknownCredential() public {
        bytes32 id = keccak256("never-issued");
        vm.expectRevert(abi.encodeWithSelector(DemoCreditPool.CredentialNotValid.selector, id));
        pool.disburse(id, 1e6);
    }

    function test_rejectsAboveTheLimit() public {
        vm.prank(subject);
        vm.expectRevert(abi.encodeWithSelector(DemoCreditPool.ExceedsLimit.selector, 751e6, 750e6));
        pool.disburse(validCredential, 751e6);
    }

    function test_rejectsASecondDrawBeyondTheLimit() public {
        vm.startPrank(subject);
        pool.disburse(validCredential, 700e6);
        vm.expectRevert(abi.encodeWithSelector(DemoCreditPool.ExceedsLimit.selector, 100e6, 50e6));
        pool.disburse(validCredential, 100e6);
        vm.stopPrank();
    }

    /// @dev Band 0 spans $0-$500. Inside it $50 and $499 are indistinguishable,
    ///      so no advance is possible.
    function test_bandZeroCannotDraw() public {
        bytes32 id = _issue(lowEarner, 0, keccak256("n-low"));
        vm.expectRevert(abi.encodeWithSelector(DemoCreditPool.ExceedsLimit.selector, 1e6, 0));
        pool.disburse(id, 1e6);
    }

    function test_rejectsWhenThePoolIsDry() public {
        vm.prank(owner);
        pool.withdraw(owner, LIQUIDITY);

        vm.prank(subject);
        vm.expectRevert(
            abi.encodeWithSelector(DemoCreditPool.InsufficientLiquidity.selector, 100e6, 0)
        );
        pool.disburse(validCredential, 100e6);
    }

    function test_rejectsZeroAmount() public {
        vm.expectRevert(DemoCreditPool.ZeroAmount.selector);
        pool.disburse(validCredential, 0);
    }

    /// @dev A credential revoked mid-draw stops further advances but does not
    ///      claw back what was already released.
    function test_revocationStopsFurtherDrawsOnly() public {
        vm.prank(subject);
        pool.disburse(validCredential, 300e6);

        vm.prank(owner);
        credentials.revoke(validCredential);

        assertEq(musd.balanceOf(subject), 300e6, "already-released funds stay released");
        assertEq(pool.remainingFor(validCredential), 0, "but nothing more is drawable");

        vm.prank(subject);
        vm.expectRevert(
            abi.encodeWithSelector(DemoCreditPool.CredentialNotValid.selector, validCredential)
        );
        pool.disburse(validCredential, 1e6);
    }

    /// @dev Credentials never expire, so this pool is the consumer that has to
    ///      apply a freshness rule. Without it, arbitrarily old evidence draws.
    function test_rejectsEvidenceBelowTheFreshnessFloor() public {
        uint64 height = credentials.credentialOf(validCredential).evidenceEndHeight;

        vm.prank(owner);
        pool.setMinimumEvidenceHeight(height + 1);

        assertEq(pool.remainingFor(validCredential), 0, "stale evidence is not drawable");

        vm.prank(subject);
        vm.expectRevert(
            abi.encodeWithSelector(DemoCreditPool.EvidenceTooOld.selector, height, height + 1)
        );
        pool.disburse(validCredential, 100e6);
    }

    function test_freshEvidenceStillDrawsAboveTheFloor() public {
        uint64 height = credentials.credentialOf(validCredential).evidenceEndHeight;

        vm.prank(owner);
        pool.setMinimumEvidenceHeight(height);

        vm.prank(subject);
        pool.disburse(validCredential, 100e6);
        assertEq(musd.balanceOf(subject), 100e6);
    }

    /// @dev Monotonic, so a floor once raised cannot be quietly lowered to let
    ///      stale evidence back in.
    function test_freshnessFloorCannotDecrease() public {
        vm.startPrank(owner);
        pool.setMinimumEvidenceHeight(1000);
        vm.expectRevert(
            abi.encodeWithSelector(
                DemoCreditPool.MinimumEvidenceHeightCannotDecrease.selector, 999, 1000
            )
        );
        pool.setMinimumEvidenceHeight(999);
        vm.stopPrank();
    }

    function test_onlyOwnerSetsTheFreshnessFloor() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        pool.setMinimumEvidenceHeight(1);
    }

    /// @dev The limit is charged in full, so a token delivering less must revert
    ///      rather than leave the credential debited for funds never received.
    function test_rejectsATokenThatDeliversLessThanCharged() public {
        SixDecimalFeeToken fee = new SixDecimalFeeToken();
        DemoCreditPool p = new DemoCreditPool(IERC20(address(fee)), credentials, owner);
        fee.mint(address(p), LIQUIDITY);

        vm.prank(subject);
        vm.expectRevert(
            abi.encodeWithSelector(
                DemoCreditPool.IncorrectAmountReceived.selector, subject, 100e6, 99e6
            )
        );
        p.disburse(validCredential, 100e6);

        assertEq(p.drawnAgainst(validCredential), 0, "the debit rolls back");
    }

    // ------------------------------------------------------------------ admin

    function test_onlyOwnerWithdraws() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        pool.withdraw(stranger, 1e6);
    }

    function test_anyoneCanFund() public {
        vm.prank(owner);
        musd.mint(stranger, 500e6);

        vm.startPrank(stranger);
        musd.approve(address(pool), 500e6);
        pool.fund(500e6);
        vm.stopPrank();

        assertEq(musd.balanceOf(address(pool)), LIQUIDITY + 500e6);
    }

    function test_rejectsAnUnknownBand() public {
        vm.expectRevert(abi.encodeWithSelector(DemoCreditPool.UnknownBand.selector, 10));
        pool.limitForBand(10);
    }

    // --------------------------------------------------------------- helpers

    function _issue(address to, uint256 band, bytes32 seed) internal returns (bytes32) {
        bytes32[] memory cs = new bytes32[](3);
        for (uint256 i; i < 3; ++i) {
            cs[i] = keccak256(abi.encode(seed, i));
        }
        _attest(cs);

        bytes32[] memory pub = new bytes32[](8);
        pub[0] = bytes32(uint256(uint160(to)));
        pub[1] = bytes32(band);
        for (uint256 i; i < 3; ++i) {
            pub[2 + i * 2] = bytes32(uint256(cs[i]) >> 128);
            pub[3 + i * 2] = bytes32(uint256(cs[i]) & type(uint128).max);
        }
        uint256 deadline = block.timestamp + 1 hours;
        return credentials.issue(
            CredentialRegistry.IssueRequest({
                proof: hex"01",
                publicInputs: pub,
                evidencePayer: payer,
                documentHash: bytes32(0),
                deadline: deadline,
                subjectAuthorization: _auth(to == subject ? subjectPk : lowEarnerPk, to, pub, deadline)
            })
        );
    }

    function _auth(uint256 pk, address who, bytes32[] memory pub, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                credentials.ISSUE_TYPEHASH(),
                keccak256(hex"01"),
                keccak256(abi.encodePacked(pub)),
                payer,
                bytes32(0),
                credentials.nonces(who),
                deadline
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", credentials.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(pk, digest);
        return abi.encodePacked(r, sg, v);
    }

    function _attest(bytes32[] memory cs) internal {
        bytes32 sig = attestations.PAYMENT_ANCHORED_SIG();
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](cs.length);
        for (uint256 i; i < cs.length; ++i) {
            bytes32[] memory topics = new bytes32[](3);
            topics[0] = sig;
            topics[1] = bytes32(uint256(uint160(payer)));
            topics[2] = cs[i];
            logs[i] = EvmV1Decoder.LogEntryTuple({address_: anchorContract, topics: topics, data: ""});
        }

        bytes[] memory chunks = new bytes[](3);
        chunks[2] = abi.encode(uint8(1), uint64(21000), logs, bytes(""));

        INativeQueryVerifier.MerkleProofEntry[] memory s =
            new INativeQueryVerifier.MerkleProofEntry[](1);
        s[0] = INativeQueryVerifier.MerkleProofEntry({hash: keccak256(abi.encode(cs[0])), isLeft: true});
        bytes32[] memory roots = new bytes32[](1);
        roots[0] = keccak256("c");

        vm.mockCall(
            NQV,
            abi.encodeWithSelector(INativeQueryVerifier.calculateTxIndex.selector),
            abi.encode(uint64(uint256(cs[0]) % 1000))
        );

        attestations.execute(
            0, SEPOLIA, 1, abi.encode(uint8(2), chunks), keccak256("root"), s, bytes32(0), roots
        );
    }
}
