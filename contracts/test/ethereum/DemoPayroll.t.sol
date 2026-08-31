// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {DemoPayroll} from "../../src/ethereum/DemoPayroll.sol";
import {PayerAnchor} from "../../src/ethereum/PayerAnchor.sol";
import {MockUSDC, BlacklistUSDC, ReentrantUSDC, FeeOnTransferUSDC} from "../mocks/Tokens.sol";

contract DemoPayrollTest is Test {
    // USDC has SIX decimals. 1_000e6 is one thousand dollars, not 1e-15 of one.
    uint256 internal constant WAGE_A = 1_000e6;
    uint256 internal constant WAGE_B = 2_500e6;
    uint256 internal constant WAGE_C = 750e6;
    uint256 internal constant PERIOD = 4 hours;
    uint256 internal constant FUNDING = 1_000_000e6;

    MockUSDC internal usdc;
    PayerAnchor internal anchorContract;
    DemoPayroll internal payroll;

    address internal owner = makeAddr("owner");
    address internal keeper = makeAddr("keeper");
    address internal stranger = makeAddr("stranger");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    event PaymentMade(
        address indexed recipient,
        uint256 amount,
        uint256 indexed period,
        bytes32 salt,
        bytes32 indexed commitment
    );
    event PaymentSkipped(address indexed recipient, uint256 amount, uint256 indexed period);
    event PayrollRun(uint256 indexed period, uint256 paid, uint256 attempted);

    function setUp() public {
        usdc = new MockUSDC();
        (anchorContract, payroll) = _deploy(IERC20(address(usdc)));
        usdc.mint(address(payroll), FUNDING);

        vm.startPrank(owner);
        payroll.addRecipient(alice, WAGE_A);
        payroll.addRecipient(bob, WAGE_B);
        payroll.addRecipient(carol, WAGE_C);
        vm.stopPrank();

        // Enrollment at period 1 owes from period 2 (a recipient is never paid a
        // full wage for a partial period). Let that period arrive.
        vm.warp(block.timestamp + PERIOD);
    }

    /// @dev FIRST_PERIOD is the first period the setUp roster is owed.
    uint256 internal constant FIRST_PERIOD = 2;

    function _deploy(IERC20 token) internal returns (PayerAnchor a, DemoPayroll p) {
        a = new PayerAnchor();
        p = new DemoPayroll(token, a, owner, keeper, PERIOD);
    }

    // =====================================================================
    // §7.1 — only keeper or owner may run payroll
    // =====================================================================

    function test_runPayroll_revertsForStranger() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.NotKeeperOrOwner.selector, stranger));
        payroll.runPayroll();
    }

    function test_runPayroll_keeperMayRun() public {
        vm.prank(keeper);
        payroll.runPayroll();
        assertEq(payroll.lastPaidPeriod(), FIRST_PERIOD);
    }

    function test_runPayroll_ownerMayRun() public {
        vm.prank(owner);
        payroll.runPayroll();
        assertEq(payroll.lastPaidPeriod(), FIRST_PERIOD);
    }

    /// @dev The keeper is a hot key on an unattended cron. Compromising it must
    ///      not move funds or change who gets paid.
    function test_keeperHasNoPowerBeyondRunningPayroll() public {
        vm.startPrank(keeper);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        payroll.withdraw(keeper, 1);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        payroll.addRecipient(keeper, 1e6);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        payroll.setAmount(alice, 1e6);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        payroll.setKeeper(stranger);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        payroll.setPeriodSeconds(1 hours);

        vm.stopPrank();
    }

    // =====================================================================
    // §7.2 — never twice in one period
    // =====================================================================

    function test_runPayroll_revertsOnSecondRunInSamePeriod() public {
        vm.prank(keeper);
        payroll.runPayroll();

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.NoPeriodDue.selector, FIRST_PERIOD + 1, FIRST_PERIOD));
        payroll.runPayroll();
    }

    /// @dev The cron fires hourly against 4-hour periods, so three of every four
    ///      firings are expected to bounce. Producing a gap needs four
    ///      consecutive failures rather than one.
    function test_hourlyCronAgainstFourHourPeriods_paysOncePerPeriod() public {
        uint256 paidRuns;
        for (uint256 hour; hour < 12; ++hour) {
            vm.roll(block.number + 1);
            vm.prank(keeper);
            try payroll.runPayroll() {
                ++paidRuns;
            } catch {}
            vm.warp(block.timestamp + 1 hours);
        }
        assertEq(paidRuns, 3, "12 hourly firings across 4-hour periods = 3 payrolls");
        assertEq(usdc.balanceOf(alice), WAGE_A * 3);
    }

    function test_runPayroll_advancesAcrossPeriods() public {
        for (uint256 i; i < 3; ++i) {
            vm.roll(block.number + 1);
            vm.prank(keeper);
            payroll.runPayroll();
            vm.warp(block.timestamp + PERIOD);
        }
        assertEq(payroll.lastPaidPeriod(), FIRST_PERIOD + 2);
        assertEq(usdc.balanceOf(bob), WAGE_B * 3);
    }

    // =====================================================================
    // §7.3 — a removed recipient can never be paid again
    // =====================================================================

    function test_removedRecipientIsNotPaid() public {
        vm.prank(keeper);
        payroll.runPayroll();
        uint256 bobAfterFirst = usdc.balanceOf(bob);

        vm.prank(owner);
        payroll.removeRecipient(bob);

        vm.warp(block.timestamp + PERIOD);
        vm.roll(block.number + 1);
        vm.prank(keeper);
        payroll.runPayroll();

        assertEq(usdc.balanceOf(bob), bobAfterFirst, "removed recipient must not be paid again");
        assertEq(payroll.amountOf(bob), 0, "amount must be cleared, not just unlinked");
        assertFalse(payroll.isRecipient(bob));
        assertEq(payroll.recipientCount(), 2);
    }

    function test_removeRecipient_keepsTheRemainingSetIntact() public {
        vm.prank(owner);
        payroll.removeRecipient(alice); // swap-and-pop moves carol into slot 0

        address[] memory left = payroll.recipients();
        assertEq(left.length, 2);
        assertTrue(payroll.isRecipient(bob));
        assertTrue(payroll.isRecipient(carol));

        vm.prank(keeper);
        payroll.runPayroll();

        assertEq(usdc.balanceOf(bob), WAGE_B);
        assertEq(usdc.balanceOf(carol), WAGE_C);
        assertEq(usdc.balanceOf(alice), 0);
    }

    function test_removeRecipient_revertsForNonRecipient() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.NotRecipient.selector, stranger));
        payroll.removeRecipient(stranger);
    }

    // =====================================================================
    // §7.4 — reentrancy via a malicious token
    // =====================================================================

    function test_reentrancy_viaMaliciousTokenIsRejected() public {
        ReentrantUSDC evil = new ReentrantUSDC();
        (, DemoPayroll p) = _deploy(IERC20(address(evil)));
        evil.mint(address(p), FUNDING);

        vm.startPrank(owner);
        p.addRecipient(alice, WAGE_A);
        p.addRecipient(bob, WAGE_B);
        vm.stopPrank();
        vm.warp(block.timestamp + PERIOD);

        // Reenter only while paying alice.
        evil.arm(address(p), abi.encodeWithSelector(DemoPayroll.runPayroll.selector), alice);

        vm.warp(block.timestamp + PERIOD);
        vm.roll(block.number + 1);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.TransferFailed.selector, alice, 2));
        p.runPayroll();

        // The guard rejected the reentrant call and the whole run rolled back.
        assertEq(evil.balanceOf(alice), 0, "reentrant transfer must not settle");
        assertEq(evil.balanceOf(bob), 0, "all-or-nothing: nobody paid");
        assertEq(evil.balanceOf(address(p)), FUNDING, "not one unit moved");
        assertEq(p.lastPaidPeriod(), 0, "period preserved for retry");
    }

    /// @dev A token that reenters on EVERY transfer makes the whole run fail,
    ///      which must revert rather than half-settle — and must leave the
    ///      period available so the next cron firing retries it.
    function test_reentrancy_onEveryTransferRevertsTheWholeRun() public {
        ReentrantUSDC evil = new ReentrantUSDC();
        (, DemoPayroll p) = _deploy(IERC20(address(evil)));
        evil.mint(address(p), FUNDING);

        vm.startPrank(owner);
        p.addRecipient(alice, WAGE_A);
        p.addRecipient(bob, WAGE_B);
        vm.stopPrank();
        vm.warp(block.timestamp + PERIOD);

        evil.arm(address(p), abi.encodeWithSelector(DemoPayroll.runPayroll.selector), address(0));

        vm.warp(block.timestamp + PERIOD);
        vm.roll(block.number + 1);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.TransferFailed.selector, alice, 2));
        p.runPayroll();

        assertEq(evil.balanceOf(address(p)), FUNDING, "not one unit moved");
        assertEq(p.lastPaidPeriod(), 0, "period preserved for retry");
    }

    /// @dev The guard itself, proven directly rather than only through its effect.
    function test_reentrantCallIntoRunPayrollHitsTheGuard() public {
        ReentrantUSDC evil = new ReentrantUSDC();
        (, DemoPayroll p) = _deploy(IERC20(address(evil)));
        evil.mint(address(p), FUNDING);

        vm.prank(owner);
        p.addRecipient(alice, WAGE_A);

        evil.arm(address(p), abi.encodeWithSelector(DemoPayroll.runPayroll.selector), alice);

        vm.warp(block.timestamp + PERIOD);
        vm.roll(block.number + 1);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.TransferFailed.selector, alice, 2));
        p.runPayroll();
    }

    function test_selfTransfer_isUnreachableFromOutside() public {
        vm.prank(stranger);
        vm.expectRevert(DemoPayroll.OnlySelf.selector);
        payroll.selfTransfer(stranger, 1e6);

        vm.prank(owner);
        vm.expectRevert(DemoPayroll.OnlySelf.selector);
        payroll.selfTransfer(owner, 1e6);
    }

    // =====================================================================
    // §7.5–7.8 — recipient set hygiene
    // =====================================================================

    function test_addRecipient_revertsAboveTheCap() public {
        vm.startPrank(owner);
        for (uint256 i = 3; i < payroll.MAX_RECIPIENTS(); ++i) {
            payroll.addRecipient(address(uint160(1000 + i)), 1e6);
        }
        assertEq(payroll.recipientCount(), payroll.MAX_RECIPIENTS());

        vm.expectRevert(
            abi.encodeWithSelector(DemoPayroll.TooManyRecipients.selector, payroll.MAX_RECIPIENTS())
        );
        payroll.addRecipient(stranger, 1e6);
        vm.stopPrank();
    }

    function test_addRecipient_revertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(DemoPayroll.ZeroAddress.selector);
        payroll.addRecipient(address(0), 1e6);
    }

    function test_addRecipient_revertsOnZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(DemoPayroll.ZeroAmount.selector);
        payroll.addRecipient(stranger, 0);
    }

    function test_addRecipient_revertsOnDuplicate() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.AlreadyRecipient.selector, alice));
        payroll.addRecipient(alice, WAGE_A);
    }

    function test_setAmount_revertsOnZeroOrNonRecipient() public {
        vm.startPrank(owner);
        vm.expectRevert(DemoPayroll.ZeroAmount.selector);
        payroll.setAmount(alice, 0);

        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.NotRecipient.selector, stranger));
        payroll.setAmount(stranger, 1e6);
        vm.stopPrank();
    }

    function test_runPayroll_revertsWithNoRecipients() public {
        vm.startPrank(owner);
        payroll.removeRecipient(alice);
        payroll.removeRecipient(bob);
        payroll.removeRecipient(carol);
        vm.stopPrank();

        vm.prank(keeper);
        vm.expectRevert(DemoPayroll.NoRecipients.selector);
        payroll.runPayroll();
    }

    // =====================================================================
    // §7.9 — underfunding fails as a whole, never partially
    // =====================================================================

    function test_runPayroll_revertsWhenUnderfunded() public {
        uint256 total = payroll.payrollTotal();

        vm.prank(owner);
        payroll.withdraw(owner, FUNDING - total + 1); // one unit short

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(DemoPayroll.InsufficientFunding.selector, total, total - 1)
        );
        payroll.runPayroll();

        assertEq(usdc.balanceOf(alice), 0, "no partial payroll");
        assertEq(payroll.lastPaidPeriod(), 0, "period not consumed, cron retries");
    }

    function test_fundingShortfall_reportsBeforeTheRunFails() public {
        assertEq(payroll.fundingShortfall(), 0);

        uint256 total = payroll.payrollTotal();
        vm.prank(owner);
        payroll.withdraw(owner, FUNDING - total + 100e6);

        assertEq(payroll.fundingShortfall(), 100e6);
    }

    // =====================================================================
    // §7.12 — one failing transfer must not cost everyone the period
    // =====================================================================

    /// @dev All-or-nothing. One blocked recipient stalls the period rather than
    ///      silently destroying that recipient's provable history. The period is
    ///      preserved, so removing them and retrying loses nothing.
    function test_blockedRecipientStallsThePeriodRatherThanLosingTheirHistory() public {
        BlacklistUSDC token = new BlacklistUSDC();
        (PayerAnchor a, DemoPayroll p) = _deploy(IERC20(address(token)));
        token.mint(address(p), FUNDING);

        vm.startPrank(owner);
        p.addRecipient(alice, WAGE_A);
        p.addRecipient(bob, WAGE_B);
        p.addRecipient(carol, WAGE_C);
        vm.stopPrank();
        vm.warp(block.timestamp + PERIOD);

        token.setBlacklisted(bob, true);

        vm.warp(block.timestamp + PERIOD);
        vm.roll(block.number + 1);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.TransferFailed.selector, bob, 2));
        p.runPayroll();

        assertEq(p.lastPaidPeriod(), 0, "period preserved, nothing destroyed");
        assertEq(token.balanceOf(alice), 0, "all-or-nothing: nobody paid");

        // Removing the blocked recipient lets the SAME period settle for everyone else.
        vm.prank(owner);
        p.removeRecipient(bob);

        vm.roll(block.number + 1);
        vm.prank(keeper);
        p.runPayroll();

        assertEq(p.lastPaidPeriod(), 2);
        assertEq(token.balanceOf(alice), WAGE_A, "alice keeps her period");
        assertTrue(a.anchoredBy(address(p), p.commitmentFor(alice, WAGE_A, 2, p.saltFor(alice, 2))));
    }

    /// @dev Every transfer failing is systemic, not per-recipient. The run must
    ///      revert so the period is not consumed and the next cron retries.
    function test_allTransfersFailing_revertsAndPreservesThePeriod() public {
        BlacklistUSDC token = new BlacklistUSDC();
        (, DemoPayroll p) = _deploy(IERC20(address(token)));
        token.mint(address(p), FUNDING);

        vm.startPrank(owner);
        p.addRecipient(alice, WAGE_A);
        p.addRecipient(bob, WAGE_B);
        vm.stopPrank();
        vm.warp(block.timestamp + PERIOD);

        token.setBlacklisted(alice, true);
        token.setBlacklisted(bob, true);

        vm.warp(block.timestamp + PERIOD);
        vm.roll(block.number + 1);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.TransferFailed.selector, alice, 2));
        p.runPayroll();

        assertEq(p.lastPaidPeriod(), 0, "period must remain available for retry");

        // ...and once the cause is cleared, the same period still pays.
        token.setBlacklisted(alice, false);
        token.setBlacklisted(bob, false);

        vm.roll(block.number + 1);
        vm.prank(keeper);
        p.runPayroll();
        assertEq(p.lastPaidPeriod(), 2);
    }

    // =====================================================================
    // §7.13–7.14 — the period counter under setPeriodSeconds
    // =====================================================================

    function test_setPeriodSeconds_doesNotTeleportTheCounter() public {
        vm.warp(block.timestamp + PERIOD * 2);
        assertEq(payroll.currentPeriod(), FIRST_PERIOD + 2);

        // Shortening the period is where naive timestamp/periodSeconds would
        // multiply the index and create a permanent gap.
        vm.prank(owner);
        payroll.setPeriodSeconds(1 hours);

        assertEq(payroll.currentPeriod(), FIRST_PERIOD + 2, "must be continuous across the change");

        vm.warp(block.timestamp + 1 hours);
        assertEq(payroll.currentPeriod(), FIRST_PERIOD + 3, "and increment on the NEW interval");
    }

    function test_setPeriodSeconds_lengtheningNeverRewinds() public {
        vm.warp(block.timestamp + PERIOD * 3);
        uint256 before = payroll.currentPeriod();
        assertEq(before, FIRST_PERIOD + 3);

        // Lengthening is the dangerous direction: a naive implementation would
        // rewind below lastPaidPeriod, slip past the equality guard, and re-derive
        // identical commitments that the anchor rejects forever.
        vm.prank(owner);
        payroll.setPeriodSeconds(8 hours);

        assertEq(payroll.currentPeriod(), before, "must not rewind");

        vm.warp(block.timestamp + 8 hours);
        assertEq(payroll.currentPeriod(), before + 1);
    }

    /// @dev After an outage the cron must CATCH UP one period per firing, not
    ///      jump to the wall clock. Jumping leaves a permanent hole in the
    ///      worker's period sequence, and the circuit asserts consecutiveness.
    function test_setPeriodSeconds_survivesAStalledCronWithoutRedeploying() public {
        vm.prank(keeper);
        payroll.runPayroll();
        assertEq(payroll.lastPaidPeriod(), FIRST_PERIOD);

        vm.warp(block.timestamp + PERIOD * 5); // cron was dead for five periods

        vm.prank(owner);
        payroll.setPeriodSeconds(15 minutes);

        // Each firing advances the paid sequence by exactly one, with no gap.
        for (uint256 expected = FIRST_PERIOD + 1; expected <= FIRST_PERIOD + 5; ++expected) {
            vm.roll(block.number + 1);
            vm.prank(keeper);
            payroll.runPayroll();
            assertEq(payroll.lastPaidPeriod(), expected, "must catch up one period at a time");
        }

        assertEq(usdc.balanceOf(alice), WAGE_A * 6, "all six periods paid, none skipped");
    }

    /// @dev The property the whole product rests on: paid periods are
    ///      consecutive, whatever the cron does.
    function test_cronOutage_producesNoGapInThePeriodSequence() public {
        uint256[] memory paid = new uint256[](3);
        paid[0] = _runAndCapturePaidPeriod();

        vm.warp(block.timestamp + PERIOD * 5); // 20h outage
        paid[1] = _runAndCapturePaidPeriod();

        vm.warp(block.timestamp + PERIOD);
        paid[2] = _runAndCapturePaidPeriod();

        assertEq(paid[1], paid[0] + 1, "no gap after an outage");
        assertEq(paid[2], paid[1] + 1, "no gap on the next firing");
    }

    function test_runPayroll_revertsWhenCaughtUp() public {
        vm.prank(keeper);
        payroll.runPayroll(); // pays period 1

        // Cron fires again inside the same period - nothing is due yet.
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.NoPeriodDue.selector, FIRST_PERIOD + 1, FIRST_PERIOD));
        payroll.runPayroll();
    }

    /// @dev THE forgery test. A backlog plus a fresh recipient must not mint
    ///      consecutive history. Wall-clock time is the only thing an attacker
    ///      cannot buy, so it must remain the cost of history.
    function test_backlogCannotMintHistoryForANewRecipient() public {
        vm.prank(keeper);
        payroll.runPayroll(); // period 1

        vm.warp(block.timestamp + PERIOD * 50); // 200h of backlog accrues

        address mallory = makeAddr("mallory");
        vm.prank(owner);
        payroll.addRecipient(mallory, 1_000e6);
        uint256 enrolled = payroll.enrolledPeriod(mallory);

        // Settle the entire backlog, one block at a time.
        for (uint256 i; i < 40; ++i) {
            vm.roll(block.number + 1);
            vm.prank(keeper);
            payroll.runPayroll();
        }

        assertEq(usdc.balanceOf(mallory), 0, "a new recipient must earn NOTHING from a backlog");
        assertGt(payroll.lastPaidPeriod(), 1, "the backlog did settle for real recipients");
        assertGt(enrolled, 1, "mallory enrolled well after period 1");

        bytes32 forged = payroll.commitmentFor(mallory, 1_000e6, 2, payroll.saltFor(mallory, 2));
        assertFalse(anchorContract.anchoredBy(address(payroll), forged), "no backdated commitment");
    }

    /// @dev Settling a backlog must cost one block per period.
    function test_backlogCannotBeSettledInOneBlock() public {
        vm.prank(keeper);
        payroll.runPayroll();

        vm.warp(block.timestamp + PERIOD * 10);

        vm.roll(block.number + 1);
        vm.prank(keeper);
        payroll.runPayroll();

        vm.prank(keeper);
        vm.expectRevert(DemoPayroll.OneRunPerBlock.selector);
        payroll.runPayroll();
    }

    /// @dev An existing recipient's genuine backlog IS still owed.
    function test_existingRecipientStillReceivesTheirBacklog() public {
        vm.prank(keeper);
        payroll.runPayroll(); // period 1

        vm.warp(block.timestamp + PERIOD * 3);
        for (uint256 i; i < 3; ++i) {
            vm.roll(block.number + 1);
            vm.prank(keeper);
            payroll.runPayroll();
        }
        assertEq(usdc.balanceOf(alice), WAGE_A * 4, "four consecutive periods paid");
        assertEq(payroll.lastPaidPeriod(), FIRST_PERIOD + 3);
    }

    // ---- Codex audit regressions -----------------------------------------

    /// @dev Finding 2: enrolling mid-period must not pay a full wage for a
    ///      sliver of it, and must never land on an already-consumed period.
    function test_enrollmentOwesFromTheNextWholePeriod() public {
        vm.prank(keeper);
        payroll.runPayroll();                       // consumes FIRST_PERIOD

        address dave = makeAddr("dave");
        vm.prank(owner);
        payroll.addRecipient(dave, 500e6);

        assertGt(payroll.enrolledPeriod(dave), payroll.lastPaidPeriod(),
            "enrollment must never point at a consumed period");
        assertEq(payroll.enrolledPeriod(dave), payroll.currentPeriod() + 1,
            "owed from the next WHOLE period");

        uint256 daveOwedFrom = payroll.enrolledPeriod(dave);

        // he is paid from his enrollment period onward, and never before it
        vm.warp(block.timestamp + PERIOD);
        vm.roll(block.number + 1);
        vm.prank(keeper);
        payroll.runPayroll();

        assertEq(payroll.lastPaidPeriod(), daveOwedFrom, "settled his first owed period");
        assertEq(usdc.balanceOf(dave), 500e6, "paid exactly once, for his first whole period");

        // and no commitment exists for the period before he was enrolled
        bytes32 tooEarly =
            payroll.commitmentFor(dave, 500e6, daveOwedFrom - 1, payroll.saltFor(dave, daveOwedFrom - 1));
        assertFalse(anchorContract.anchoredBy(address(payroll), tooEarly), "nothing backdated");
    }

    /// @dev Finding 5: monitoring must use the same eligibility set as execution,
    ///      or the cron alarms on wages the next run was never going to pay.
    function test_fundingShortfallMatchesWhatTheNextRunActuallyNeeds() public {
        // Build a backlog so the next due period predates a new enrollment.
        vm.warp(block.timestamp + PERIOD * 3);

        address future = makeAddr("future");
        vm.prank(owner);
        payroll.addRecipient(future, 1_000_000e6); // enrolled far ahead of the backlog

        assertGt(payroll.enrolledPeriod(future), payroll.nextDuePeriod(),
            "future recipient is not owed the next due period");

        // Monitoring must not count a wage the next run will not pay.
        assertEq(payroll.fundingShortfall(), 0, "must not cry wolf over a future wage");

        // and execution must agree
        vm.roll(block.number + 1);
        vm.prank(keeper);
        payroll.runPayroll();
        assertEq(usdc.balanceOf(future), 0);
    }

    /// @dev Finding 6: PayrollRun must report recipients actually owed, not the
    ///      whole roster, or the worker miscounts what to expect.
    function test_payrollRunReportsEligibleNotRosterSize() public {

        // backlog, then a late enrollment that the next due period does not owe
        vm.warp(block.timestamp + PERIOD * 3);
        address future = makeAddr("future");
        vm.prank(owner);
        payroll.addRecipient(future, 100e6);

        vm.roll(block.number + 1);
        vm.recordLogs();
        vm.prank(keeper);
        payroll.runPayroll();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] != PayrollRun.selector) continue;
            (uint256 paid, uint256 attempted) = abi.decode(logs[i].data, (uint256, uint256));
            assertEq(payroll.recipientCount(), 4, "roster is four");
            assertEq(attempted, 3, "but only three were owed this period");
            assertEq(paid, 3);
            return;
        }
        revert("no PayrollRun emitted");
    }

    /// @dev Finding 1: all-or-nothing. Partial success must never advance the cursor.
    function test_partialPayrollIsImpossible() public {
        BlacklistUSDC token = new BlacklistUSDC();
        (, DemoPayroll p) = _deploy(IERC20(address(token)));
        token.mint(address(p), FUNDING);

        vm.startPrank(owner);
        p.addRecipient(alice, WAGE_A);
        p.addRecipient(bob, WAGE_B);
        vm.stopPrank();
        vm.warp(block.timestamp + PERIOD);

        token.setBlacklisted(bob, true);

        vm.roll(block.number + 1);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DemoPayroll.TransferFailed.selector, bob, 2));
        p.runPayroll();

        assertEq(token.balanceOf(alice), 0, "alice must not be paid while bob fails");
        assertEq(p.lastPaidPeriod(), 0, "cursor must not advance on a partial run");
    }

    function test_renounceOwnership_isDisabled() public {
        vm.prank(owner);
        vm.expectRevert(DemoPayroll.RenounceDisabled.selector);
        payroll.renounceOwnership();
        assertEq(payroll.owner(), owner, "owner must survive");
    }

    function _runAndCapturePaidPeriod() internal returns (uint256) {
        vm.roll(block.number + 1);
        vm.recordLogs();
        vm.prank(keeper);
        payroll.runPayroll();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == PaymentMade.selector) return uint256(logs[i].topics[2]);
        }
        revert("no PaymentMade emitted");
    }

    function test_setPeriodSeconds_enforcesBounds() public {
        vm.startPrank(owner);

        vm.expectRevert(
            abi.encodeWithSelector(DemoPayroll.PeriodTooShort.selector, 0, payroll.MIN_PERIOD_SECONDS())
        );
        payroll.setPeriodSeconds(0);

        vm.expectRevert(
            abi.encodeWithSelector(
                DemoPayroll.PeriodTooShort.selector, 60, payroll.MIN_PERIOD_SECONDS()
            )
        );
        payroll.setPeriodSeconds(60);

        vm.expectRevert(
            abi.encodeWithSelector(
                DemoPayroll.PeriodTooLong.selector, 31 days, payroll.MAX_PERIOD_SECONDS()
            )
        );
        payroll.setPeriodSeconds(31 days);

        vm.stopPrank();
    }

    /// @dev The property the circuit depends on: the counter never decreases,
    ///      whatever sequence of changes the owner makes.
    function testFuzz_currentPeriod_isMonotonic(uint32 warp1, uint32 newPeriod, uint32 warp2) public {
        newPeriod = uint32(
            bound(newPeriod, payroll.MIN_PERIOD_SECONDS(), payroll.MAX_PERIOD_SECONDS())
        );

        vm.warp(block.timestamp + bound(warp1, 0, 365 days));
        uint256 p1 = payroll.currentPeriod();

        vm.prank(owner);
        payroll.setPeriodSeconds(newPeriod);
        uint256 p2 = payroll.currentPeriod();
        assertEq(p2, p1, "a period change must be continuous");

        vm.warp(block.timestamp + bound(warp2, 0, 365 days));
        assertGe(payroll.currentPeriod(), p2, "the counter must never decrease");
    }

    // =====================================================================
    // Commitments and anchoring
    // =====================================================================

    function test_commitmentIsReconstructableFromTheEmittedEvent() public {
        vm.recordLogs();
        vm.prank(keeper);
        payroll.runPayroll();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 checked;

        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] != PaymentMade.selector) continue;

            address recipient = address(uint160(uint256(logs[i].topics[1])));
            uint256 period = uint256(logs[i].topics[2]);
            bytes32 commitment = logs[i].topics[3];
            (uint256 amount, bytes32 salt) = abi.decode(logs[i].data, (uint256, bytes32));

            // Exactly what shared/commitment.ts and the Noir circuit must produce.
            assertEq(
                commitment,
                keccak256(abi.encode(recipient, amount, period, salt)),
                "commitment must be reconstructable from public event fields"
            );
            assertTrue(anchorContract.anchoredBy(address(payroll), commitment), "and anchored");
            ++checked;
        }

        assertEq(checked, 3, "one PaymentMade per recipient");
    }

    /// @dev One payroll run must be ONE Ethereum transaction, because one
    ///      transaction is one Attestcoin query. Ten payments verified for the
    ///      price of one proof.
    function test_tenRecipients_anchorInASingleTransaction() public {
        vm.startPrank(owner);
        for (uint256 i = 3; i < 10; ++i) {
            payroll.addRecipient(address(uint160(2000 + i)), 100e6);
        }
        vm.stopPrank();
        assertEq(payroll.recipientCount(), 10);

        // Settle the period only the original three are owed...
        vm.roll(block.number + 1);
        vm.prank(keeper);
        payroll.runPayroll();

        // ...then the period all ten share.
        vm.warp(block.timestamp + PERIOD);
        vm.roll(block.number + 1);
        vm.recordLogs();
        vm.prank(keeper);
        payroll.runPayroll();

        uint256 anchored;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == address(anchorContract)
                    && logs[i].topics[0] == PayerAnchor.PaymentAnchored.selector
            ) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), address(payroll));
                ++anchored;
            }
        }
        assertEq(anchored, 10, "all ten anchored from one runPayroll transaction");
    }

    function test_commitmentsAreUniquePerRecipientAndPeriod() public {
        bytes32 a1 = payroll.commitmentFor(alice, WAGE_A, 1, payroll.saltFor(alice, 1));
        bytes32 a2 = payroll.commitmentFor(alice, WAGE_A, 2, payroll.saltFor(alice, 2));
        bytes32 b1 = payroll.commitmentFor(bob, WAGE_A, 1, payroll.saltFor(bob, 1));

        assertTrue(a1 != a2, "period must separate");
        assertTrue(a1 != b1, "recipient must separate");
    }

    /// @dev Two deployments must never collide, since the salt binds address(this).
    function test_saltBindsTheDeployment() public {
        (, DemoPayroll other) = _deploy(IERC20(address(usdc)));
        assertTrue(
            payroll.saltFor(alice, 1) != other.saltFor(alice, 1), "salt must bind the deployment"
        );
    }

    // =====================================================================
    // Cross-chain mode (S1)
    // =====================================================================

    /// @dev On Base Sepolia there is no PayerAnchor to call — Attestcoin reads
    ///      Ethereum only. The contract pays and emits; the same payer anchors
    ///      those commitments on Ethereum Sepolia separately.
    function test_crossChainMode_paysAndEmitsWithoutAnchoring() public {
        DemoPayroll p = new DemoPayroll(IERC20(address(usdc)), PayerAnchor(address(0)), owner, keeper, PERIOD);
        usdc.mint(address(p), FUNDING);

        vm.prank(owner);
        p.addRecipient(alice, WAGE_A);
        vm.warp(block.timestamp + PERIOD);

        vm.recordLogs();
        vm.prank(keeper);
        p.runPayroll();

        assertEq(usdc.balanceOf(alice), WAGE_A, "the worker is really paid");

        bool sawPaymentMade;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == PaymentMade.selector) sawPaymentMade = true;
            assertTrue(
                logs[i].topics[0] != PayerAnchor.PaymentAnchored.selector,
                "must not anchor locally"
            );
        }
        assertTrue(sawPaymentMade, "the commitment is still published for off-chain anchoring");
    }

    // =====================================================================
    // Documented behaviour
    // =====================================================================

    /// @dev With a fee-on-transfer token the recipient receives less than the
    ///      amount the commitment records. Documented, not fixed: Circle USDC
    ///      takes no fee and this contract handles no other token.
    function test_feeOnTransfer_commitmentRecordsTheIntendedAmount() public {
        FeeOnTransferUSDC token = new FeeOnTransferUSDC();
        (PayerAnchor a, DemoPayroll p) = _deploy(IERC20(address(token)));
        token.mint(address(p), FUNDING);

        vm.prank(owner);
        p.addRecipient(alice, WAGE_A);
        vm.warp(block.timestamp + PERIOD);

        vm.prank(keeper);
        p.runPayroll();

        assertLt(token.balanceOf(alice), WAGE_A, "recipient receives less than face value");
        assertTrue(
            a.anchoredBy(address(p), p.commitmentFor(alice, WAGE_A, 2, p.saltFor(alice, 2))),
            "commitment records the INTENDED amount, not the received amount"
        );
    }

    function test_withdraw_returnsUnspentFunding() public {
        uint256 before = usdc.balanceOf(owner);
        vm.prank(owner);
        payroll.withdraw(owner, 500e6);
        assertEq(usdc.balanceOf(owner), before + 500e6);
    }

    function test_withdraw_revertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(DemoPayroll.ZeroAddress.selector);
        payroll.withdraw(address(0), 1);
    }

    function test_constructor_rejectsBadArguments() public {
        vm.expectRevert(DemoPayroll.ZeroAddress.selector);
        new DemoPayroll(IERC20(address(0)), anchorContract, owner, keeper, PERIOD);

        vm.expectRevert(DemoPayroll.ZeroAddress.selector);
        new DemoPayroll(IERC20(address(usdc)), anchorContract, owner, address(0), PERIOD);

        vm.expectRevert(
            abi.encodeWithSelector(DemoPayroll.PeriodTooShort.selector, 1, 15 minutes)
        );
        new DemoPayroll(IERC20(address(usdc)), anchorContract, owner, keeper, 1);
    }

    function test_periodsAreOneIndexedSoZeroMeansNeverRun() public view {
        assertEq(payroll.currentPeriod(), FIRST_PERIOD);
        assertEq(payroll.lastPaidPeriod(), 0);
    }

    // =====================================================================
    // Fuzz
    // =====================================================================

    function testFuzz_payrollPaysEveryRecipientExactly(uint8 count, uint64 wage) public {
        count = uint8(bound(count, 1, 10));
        uint256 amount = bound(wage, 1, 1_000e6);

        (, DemoPayroll p) = _deploy(IERC20(address(usdc)));
        usdc.mint(address(p), FUNDING);

        vm.startPrank(owner);
        for (uint256 i; i < count; ++i) {
            p.addRecipient(address(uint160(5000 + i)), amount);
        }
        vm.stopPrank();
        vm.warp(block.timestamp + PERIOD);

        vm.prank(keeper);
        p.runPayroll();

        for (uint256 i; i < count; ++i) {
            assertEq(usdc.balanceOf(address(uint160(5000 + i))), amount);
        }
        assertEq(p.payrollTotal(), amount * count);
    }
}
