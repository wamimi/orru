// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DemoPayroll} from "../../src/ethereum/DemoPayroll.sol";
import {PayerAnchor} from "../../src/ethereum/PayerAnchor.sol";
import {MockUSDC} from "../mocks/Tokens.sol";

contract EmptyBatchTest is Test {
    // regression: a delayed first run must not skip periods since enrollment
    MockUSDC usdc; PayerAnchor anchorC; DemoPayroll p;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");
    uint256 constant PERIOD = 4 hours;

    function setUp() public {
        usdc = new MockUSDC();
        anchorC = new PayerAnchor();
        p = new DemoPayroll(IERC20(address(usdc)), anchorC, owner, keeper, PERIOD);
        usdc.mint(address(p), 1_000_000e6);
        vm.prank(owner); p.addRecipient(alice, 100e6);
        // enrollment at period 1 owes from period 2
        vm.warp(block.timestamp + PERIOD);
    }

    /// @dev A first run delayed past enrollment must catch up, not jump to now.
    function test_delayedFirstRunDoesNotSkipEnrolledPeriods() public {
        // alice enrolled at period 1; nobody runs payroll for 5 periods
        vm.warp(block.timestamp + PERIOD * 5);
        assertEq(p.currentPeriod(), 7);

        vm.roll(block.number + 1);
        vm.prank(keeper);
        p.runPayroll();

        assertEq(p.lastPaidPeriod(), 2, "first run starts at the first OWED period, not now");

        for (uint256 i; i < 5; ++i) {
            vm.roll(block.number + 1);
            vm.prank(keeper);
            p.runPayroll();
        }
        assertEq(p.lastPaidPeriod(), 7, "caught up with no gap");
        assertEq(usdc.balanceOf(alice), 100e6 * 6, "every enrolled period paid, none skipped");
    }

    /// @dev Codex finding: a backlog period with ZERO eligible recipients builds
    ///      an empty commitment array and hands it to anchorBatch, which rejects
    ///      empty batches. The revert rolls lastPaidPeriod back, so every retry
    ///      lands on the same period forever.
    function test_zeroEligibleBacklogPeriodDoesNotBrickPayroll() public {
        vm.roll(block.number + 1);
        vm.prank(keeper); p.runPayroll();          // pays period 2
        assertEq(p.lastPaidPeriod(), 2);

        vm.warp(block.timestamp + PERIOD * 3);      // now period 5

        vm.startPrank(owner);
        p.removeRecipient(alice);                   // full roster replacement
        p.addRecipient(bob, 100e6);                 // bob enrolled at period 6
        vm.stopPrank();

        // With alice gone, the earliest period anyone is owed jumps to bob's
        // enrollment. Nothing may brick on the way there.
        vm.roll(block.number + 1);
        vm.prank(keeper);
        vm.expectRevert(); // bob's period is not due yet
        p.runPayroll();

        vm.warp(block.timestamp + PERIOD);
        vm.roll(block.number + 1);
        vm.prank(keeper);
        p.runPayroll();
        assertEq(p.lastPaidPeriod(), 6, "settles bob's first owed period, skipping the empty prefix");

        assertEq(usdc.balanceOf(bob), 100e6, "bob paid for his first eligible period");
        assertEq(usdc.balanceOf(alice), 100e6, "alice keeps only what she earned, none backdated");

        // no commitment may exist for a period nobody was eligible for
        bytes32 ghost = p.commitmentFor(bob, 100e6, 3, p.saltFor(bob, 3));
        assertFalse(anchorC.anchoredBy(address(p), ghost), "no commitment for an empty period");
    }
}
