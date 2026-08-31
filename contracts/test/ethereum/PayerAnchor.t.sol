// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {PayerAnchor} from "../../src/ethereum/PayerAnchor.sol";

contract PayerAnchorTest is Test {
    PayerAnchor internal anchorContract;

    address internal payerA = makeAddr("payerA");
    address internal payerB = makeAddr("payerB");
    address internal attacker = makeAddr("attacker");

    bytes32 internal constant C1 = keccak256("commitment-1");
    bytes32 internal constant C2 = keccak256("commitment-2");

    event PaymentAnchored(address indexed payer, bytes32 indexed commitment);

    function setUp() public {
        anchorContract = new PayerAnchor();
    }

    // ---------------------------------------------------------------------
    // Happy path
    // ---------------------------------------------------------------------

    function test_anchorPayment_recordsAndEmits() public {
        vm.expectEmit(true, true, false, false);
        emit PaymentAnchored(payerA, C1);

        vm.prank(payerA);
        anchorContract.anchorPayment(C1);

        assertTrue(anchorContract.anchoredBy(payerA, C1));
    }

    function test_anchorBatch_recordsAll() public {
        bytes32[] memory batch = new bytes32[](3);
        batch[0] = C1;
        batch[1] = C2;
        batch[2] = keccak256("commitment-3");

        vm.prank(payerA);
        anchorContract.anchorBatch(batch);

        for (uint256 i; i < batch.length; ++i) {
            assertTrue(anchorContract.anchoredBy(payerA, batch[i]));
        }
    }

    /// @dev One payroll run is one Ethereum transaction, and one Ethereum
    ///      transaction is one Attestcoin query. Ten commitments must therefore
    ///      fit in a single transaction or the verification cost multiplies.
    function test_anchorBatch_tenCommitmentsInOneTransaction() public {
        bytes32[] memory batch = new bytes32[](10);
        for (uint256 i; i < 10; ++i) {
            batch[i] = keccak256(abi.encode("payroll", i));
        }

        vm.recordLogs();
        vm.prank(payerA);
        anchorContract.anchorBatch(batch);

        assertEq(vm.getRecordedLogs().length, 10, "one log per commitment, one transaction");
    }

    // ---------------------------------------------------------------------
    // Rejections
    // ---------------------------------------------------------------------

    function test_anchorPayment_revertsOnEmptyCommitment() public {
        vm.prank(payerA);
        vm.expectRevert(PayerAnchor.EmptyCommitment.selector);
        anchorContract.anchorPayment(bytes32(0));
    }

    function test_anchorBatch_revertsOnEmptyCommitmentInBatch() public {
        bytes32[] memory batch = new bytes32[](2);
        batch[0] = C1;
        batch[1] = bytes32(0);

        vm.prank(payerA);
        vm.expectRevert(PayerAnchor.EmptyCommitment.selector);
        anchorContract.anchorBatch(batch);

        assertFalse(anchorContract.anchoredBy(payerA, C1), "whole batch must roll back");
    }

    function test_anchorPayment_revertsOnSamePayerDuplicate() public {
        vm.startPrank(payerA);
        anchorContract.anchorPayment(C1);

        vm.expectRevert(abi.encodeWithSelector(PayerAnchor.AlreadyAnchored.selector, payerA, C1));
        anchorContract.anchorPayment(C1);
        vm.stopPrank();
    }

    function test_anchorBatch_revertsOnEmptyBatch() public {
        vm.prank(payerA);
        vm.expectRevert(PayerAnchor.EmptyBatch.selector);
        anchorContract.anchorBatch(new bytes32[](0));
    }

    function test_anchorBatch_revertsAboveMaxBatch() public {
        uint256 max = anchorContract.MAX_BATCH();
        bytes32[] memory batch = new bytes32[](max + 1);
        for (uint256 i; i < batch.length; ++i) {
            batch[i] = keccak256(abi.encode(i));
        }

        vm.prank(payerA);
        vm.expectRevert(abi.encodeWithSelector(PayerAnchor.BatchTooLarge.selector, max + 1, max));
        anchorContract.anchorBatch(batch);
    }

    // ---------------------------------------------------------------------
    // D2 — the griefing vector that global duplicate scoping would open
    // ---------------------------------------------------------------------

    /// @dev DemoPayroll's salt is deterministic, so its commitments are
    ///      predictable. Under GLOBAL duplicate scoping an attacker could
    ///      front-run with the predicted value and permanently block the real
    ///      payer. Per-payer scoping must make that inert.
    function test_attackerFrontRunningDoesNotBlockTheRealPayer() public {
        bytes32 predicted = C1;

        vm.prank(attacker);
        anchorContract.anchorPayment(predicted);

        // The real payer's anchor must still succeed.
        vm.prank(payerA);
        anchorContract.anchorPayment(predicted);

        assertTrue(anchorContract.anchoredBy(attacker, predicted), "attacker's own record stands");
        assertTrue(anchorContract.anchoredBy(payerA, predicted), "real payer must not be blocked");
    }

    /// @dev And the two are distinguishable downstream: each log carries its own
    ///      payer, so only the real payer's log passes `approvedPayer` on
    ///      Creditcoin. Front-running produces a log nobody approves.
    function test_frontRunProducesADistinctPayerInTheLog() public {
        vm.recordLogs();

        vm.prank(attacker);
        anchorContract.anchorPayment(C1);
        vm.prank(payerA);
        anchorContract.anchorPayment(C1);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);

        address loggedAttacker = address(uint160(uint256(logs[0].topics[1])));
        address loggedPayer = address(uint160(uint256(logs[1].topics[1])));

        assertEq(loggedAttacker, attacker);
        assertEq(loggedPayer, payerA);
        assertTrue(loggedAttacker != loggedPayer, "payer must be distinguishable in the log");
        assertEq(logs[0].topics[2], logs[1].topics[2], "same commitment, different payer");
    }

    function test_differentPayersMayAnchorTheSameCommitment() public {
        vm.prank(payerA);
        anchorContract.anchorPayment(C1);

        vm.prank(payerB);
        anchorContract.anchorPayment(C1);

        assertTrue(anchorContract.anchoredBy(payerA, C1));
        assertTrue(anchorContract.anchoredBy(payerB, C1));
    }

    // ---------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------

    function testFuzz_anchorPayment_isPerPayer(address p1, address p2, bytes32 commitment) public {
        vm.assume(commitment != bytes32(0));
        vm.assume(p1 != p2);

        vm.prank(p1);
        anchorContract.anchorPayment(commitment);

        assertTrue(anchorContract.anchoredBy(p1, commitment));
        assertFalse(anchorContract.anchoredBy(p2, commitment), "must not leak across payers");
    }
}
