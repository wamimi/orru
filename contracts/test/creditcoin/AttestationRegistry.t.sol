// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

import {AttestationRegistry} from "../../src/creditcoin/AttestationRegistry.sol";
import {USCBase} from "../../src/attestcoin/USCBase.sol";
import {INativeQueryVerifier, NativeQueryVerifierLib} from "../../src/attestcoin/VerifierInterface.sol";

contract AttestationRegistryTest is Test {
    address internal constant NQV = NativeQueryVerifierLib.PRECOMPILE_ADDRESS;
    uint64 internal constant SEPOLIA = 1;
    uint64 internal constant MAINNET = 3;
    uint64 internal constant HEIGHT = 11_605_464;

    AttestationRegistry internal registry;

    address internal owner = makeAddr("owner");
    address internal anchorContract = makeAddr("payerAnchor");
    address internal impostor = makeAddr("impostor");
    address internal payer = makeAddr("payroll");
    address internal unapprovedPayer = makeAddr("stranger");

    bytes32 internal sig;

    function setUp() public {
        registry = new AttestationRegistry(SEPOLIA, anchorContract, owner);
        sig = registry.PAYMENT_ANCHORED_SIG();

        vm.prank(owner);
        registry.setPayerApproval(payer, true);

        _mockTxIndex(118);
        _mockVerify(true);
    }

    // ---------------------------------------------------------------- happy

    function test_acceptsACommitmentFromTheTrustedAnchor() public {
        bytes32 c = keccak256("commitment-1");
        _submit(_receipt(1, _oneLog(anchorContract, payer, c)));

        assertTrue(registry.acceptedCommitment(c));
        assertTrue(registry.acceptedByPayer(c, payer));
        assertEq(registry.provenAtHeight(c, payer), HEIGHT, "evidence is dated by source height");
    }

    /// @dev One source transaction is one query, consumable once. Stopping after
    ///      the first log would strand the rest permanently.
    function test_batchOfTen_allAcceptedFromOneVerification() public {
        bytes32[] memory cs = new bytes32[](10);
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](10);
        for (uint256 i; i < 10; ++i) {
            cs[i] = keccak256(abi.encode("payroll", i));
            logs[i] = _log(anchorContract, payer, cs[i]);
        }

        _submit(_receipt(1, logs));

        for (uint256 i; i < 10; ++i) {
            assertTrue(registry.acceptedCommitment(cs[i]), "every commitment must be accepted");
            assertTrue(registry.acceptedByPayer(cs[i], payer));
        }
    }

    // ------------------------------------------------------------- negatives

    /// @dev INVARIANT 1. An identically shaped event from another contract must
    ///      be rejected even though the proof over it is genuine.
    function test_rejectsAnIdenticalEventFromAnUntrustedContract() public {
        bytes32 c = keccak256("forged");
        vm.expectRevert(AttestationRegistry.NoTrustedLogs.selector);
        _submit(_receipt(1, _oneLog(impostor, payer, c)));

        assertFalse(registry.acceptedCommitment(c));
    }

    /// @dev The precompile proves inclusion, not success. A reverted source
    ///      transaction is still included.
    function test_rejectsARevertedSourceTransaction() public {
        bytes32 c = keccak256("from-a-failed-tx");
        vm.expectRevert(AttestationRegistry.SourceTransactionFailed.selector);
        _submit(_receipt(0, _oneLog(anchorContract, payer, c)));

        assertFalse(registry.acceptedCommitment(c));
    }

    function test_rejectsAnUnapprovedPayer() public {
        bytes32 c = keccak256("self-payment");
        vm.expectRevert(AttestationRegistry.NoTrustedLogs.selector);
        _submit(_receipt(1, _oneLog(anchorContract, unapprovedPayer, c)));

        assertFalse(registry.acceptedCommitment(c));
    }

    /// @dev Sepolia and mainnet are not interchangeable. The same address can
    ///      exist on both.
    function test_rejectsTheWrongSourceChain() public {
        bytes32 c = keccak256("wrong-chain");
        vm.expectRevert(
            abi.encodeWithSelector(AttestationRegistry.WrongSourceChain.selector, MAINNET, SEPOLIA)
        );
        registry.execute(
            0, MAINNET, HEIGHT, _receipt(1, _oneLog(anchorContract, payer, c)),
            keccak256("root"), _siblings(), bytes32(0), _roots()
        );

        assertFalse(registry.acceptedCommitment(c));
    }

    function test_rejectsAReplayedQuery() public {
        bytes32 c = keccak256("replayed");
        _submit(_receipt(1, _oneLog(anchorContract, payer, c)));

        vm.expectRevert();
        _submit(_receipt(1, _oneLog(anchorContract, payer, c)));
    }

    function test_rejectsAReceiptWithNoMatchingLogs() public {
        EvmV1Decoder.LogEntryTuple[] memory none = new EvmV1Decoder.LogEntryTuple[](0);
        vm.expectRevert(AttestationRegistry.NoTrustedLogs.selector);
        _submit(_receipt(1, none));
    }

    function test_rejectsAnUnsupportedAction() public {
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.UnsupportedAction.selector, 1));
        registry.execute(
            1, SEPOLIA, HEIGHT, _receipt(1, _oneLog(anchorContract, payer, keccak256("c"))),
            keccak256("root"), _siblings(), bytes32(0), _roots()
        );
    }

    // ------------------------------------------------------------- behaviour

    /// @dev A repeat inside one receipt must not discard the others alongside it.
    function test_duplicateInsideOneReceiptIsIdempotent() public {
        bytes32 dup = keccak256("dup");
        bytes32 other = keccak256("other");

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](3);
        logs[0] = _log(anchorContract, payer, dup);
        logs[1] = _log(anchorContract, payer, dup);
        logs[2] = _log(anchorContract, payer, other);

        _submit(_receipt(1, logs));

        assertTrue(registry.acceptedCommitment(dup));
        assertTrue(registry.acceptedCommitment(other), "the duplicate must not discard the rest");
    }

    /// @dev A mixed receipt accepts the trusted logs and ignores the rest.
    function test_mixedReceiptAcceptsOnlyTheTrustedLogs() public {
        bytes32 good = keccak256("good");
        bytes32 forged = keccak256("forged");

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        logs[0] = _log(impostor, payer, forged);
        logs[1] = _log(anchorContract, payer, good);

        _submit(_receipt(1, logs));

        assertTrue(registry.acceptedCommitment(good));
        assertFalse(registry.acceptedCommitment(forged), "untrusted source must be ignored");
    }

    function test_rejectsTooManyLogs() public {
        uint256 n = registry.MAX_LOGS_PER_RECEIPT() + 1;
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](n);
        for (uint256 i; i < n; ++i) {
            logs[i] = _log(anchorContract, payer, keccak256(abi.encode(i)));
        }

        vm.expectRevert(
            abi.encodeWithSelector(
                AttestationRegistry.TooManyLogs.selector, n, registry.MAX_LOGS_PER_RECEIPT()
            )
        );
        _submit(_receipt(1, logs));
    }

    /// @dev One source transaction is one Attestcoin query, consumable once. If
    ///      lookalike logs count toward the cap before the trust filter runs,
    ///      anything that can emit alongside a genuine anchor buries that
    ///      payment permanently.
    function test_lookalikeLogsCannotBuryAGenuineAnchor() public {
        uint256 noise = registry.MAX_LOGS_PER_RECEIPT();
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](noise + 1);
        for (uint256 i; i < noise; ++i) {
            logs[i] = _log(impostor, payer, keccak256(abi.encode("noise", i)));
        }
        bytes32 real = keccak256("genuine-alongside-noise");
        logs[noise] = _log(anchorContract, payer, real);

        _submit(_receipt(1, logs));

        assertTrue(registry.acceptedCommitment(real), "the genuine anchor must still be accepted");
        assertTrue(registry.acceptedByPayer(real, payer));
    }

    /// @dev The scan bound still exists; reverting keeps the query unconsumed,
    ///      so an oversized receipt fails retryably rather than losing logs.
    function test_rejectsAnOversizedReceipt() public {
        uint256 n = registry.MAX_RECEIPT_LOGS() + 1;
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](n);
        for (uint256 i; i < n; ++i) {
            logs[i] = _log(impostor, payer, keccak256(abi.encode("bulk", i)));
        }

        vm.expectRevert(
            abi.encodeWithSelector(
                AttestationRegistry.TooManyReceiptLogs.selector, n, registry.MAX_RECEIPT_LOGS()
            )
        );
        _submit(_receipt(1, logs));
    }

    function test_onlyOwnerApprovesPayers() public {
        vm.prank(impostor);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, impostor));
        registry.setPayerApproval(impostor, true);
    }

    /// @dev A commitment may be anchored by more than one payer, so attribution
    ///      must not collapse to whichever proof was relayed first.
    function test_attributionIsPerPayerNotFirstRelayerWins() public {
        bytes32 c = keccak256("shared");
        address second = makeAddr("secondPayer");
        vm.prank(owner);
        registry.setPayerApproval(second, true);

        _submit(_receipt(1, _oneLog(anchorContract, payer, c)));

        _mockTxIndex(999); // a different source transaction
        _submit(_receipt(1, _oneLog(anchorContract, second, c)));

        assertTrue(registry.acceptedByPayer(c, payer), "first payer retained");
        assertTrue(registry.acceptedByPayer(c, second), "second payer also recorded");
    }

    /// @dev Earliest proof wins per payer, so the date does not depend on relay
    ///      order.
    function test_evidenceHeightKeepsTheEarliestProofPerPayer() public {
        bytes32 c = keccak256("dated");

        registry.execute(
            0, SEPOLIA, 900, _receipt(1, _oneLog(anchorContract, payer, c)),
            keccak256("root"), _siblings(), bytes32(0), _roots()
        );
        assertEq(registry.provenAtHeight(c, payer), 900);

        _mockTxIndex(555);
        registry.execute(
            0, SEPOLIA, 700, _receipt(1, _oneLog(anchorContract, payer, c)),
            keccak256("root"), _siblings(), bytes32(0), _roots()
        );
        assertEq(registry.provenAtHeight(c, payer), 700, "earlier proof wins");
    }

    /// @dev One payer's date must never be read from another payer's event.
    function test_evidenceHeightDoesNotLeakAcrossPayers() public {
        bytes32 c = keccak256("shared-date");
        address second = makeAddr("secondPayer");
        vm.prank(owner);
        registry.setPayerApproval(second, true);

        registry.execute(
            0, SEPOLIA, 900, _receipt(1, _oneLog(anchorContract, payer, c)),
            keccak256("root"), _siblings(), bytes32(0), _roots()
        );

        _mockTxIndex(777);
        registry.execute(
            0, SEPOLIA, 500, _receipt(1, _oneLog(anchorContract, second, c)),
            keccak256("root"), _siblings(), bytes32(0), _roots()
        );

        assertEq(registry.provenAtHeight(c, payer), 900, "payer keeps its own date");
        assertEq(registry.provenAtHeight(c, second), 500, "and so does the other");
    }

    function test_trustedAnchorIsImmutable() public view {
        assertEq(registry.TRUSTED_ANCHOR(), anchorContract);
        assertEq(registry.SOURCE_CHAIN_KEY(), SEPOLIA);
    }

    /// @dev Approval is checked at acceptance time, not retroactively.
    function test_revokingApprovalStopsFutureAcceptances() public {
        vm.prank(owner);
        registry.setPayerApproval(payer, false);

        bytes32 c = keccak256("after-revocation");
        vm.expectRevert(AttestationRegistry.NoTrustedLogs.selector);
        _submit(_receipt(1, _oneLog(anchorContract, payer, c)));
    }

    // --------------------------------------------------------------- helpers

    function _submit(bytes memory encodedTx) internal {
        registry.execute(
            0, SEPOLIA, HEIGHT, encodedTx, keccak256("root"), _siblings(), bytes32(0), _roots()
        );
    }

    /// @dev usc-abi-encoding V1: abi.encode(uint8 txType, bytes[] chunks) with
    ///      the receipt in chunks[2] for types 0-2.
    function _receipt(uint8 status, EvmV1Decoder.LogEntryTuple[] memory logs)
        internal
        pure
        returns (bytes memory)
    {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = "";
        chunks[1] = "";
        chunks[2] = abi.encode(status, uint64(21000), logs, bytes(""));
        return abi.encode(uint8(2), chunks);
    }

    function _log(address emitter, address logPayer, bytes32 commitment)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = sig;
        topics[1] = bytes32(uint256(uint160(logPayer)));
        topics[2] = commitment;
        return EvmV1Decoder.LogEntryTuple({address_: emitter, topics: topics, data: ""});
    }

    function _oneLog(address emitter, address logPayer, bytes32 commitment)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple[] memory logs)
    {
        logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _log(emitter, logPayer, commitment);
    }

    function _siblings() internal pure returns (INativeQueryVerifier.MerkleProofEntry[] memory s) {
        s = new INativeQueryVerifier.MerkleProofEntry[](2);
        s[0] = INativeQueryVerifier.MerkleProofEntry({hash: keccak256("s0"), isLeft: true});
        s[1] = INativeQueryVerifier.MerkleProofEntry({hash: keccak256("s1"), isLeft: false});
    }

    function _roots() internal pure returns (bytes32[] memory r) {
        r = new bytes32[](1);
        r[0] = keccak256("continuity");
    }

    function _mockTxIndex(uint64 idx) internal {
        vm.mockCall(
            NQV, abi.encodeWithSelector(INativeQueryVerifier.calculateTxIndex.selector), abi.encode(idx)
        );
    }

    function _mockVerify(bool ok) internal {
        vm.mockCall(
            NQV, abi.encodeWithSelector(INativeQueryVerifier.verifyAndEmit.selector), abi.encode(ok)
        );
    }
}
