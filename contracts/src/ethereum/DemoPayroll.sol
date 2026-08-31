// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PayerAnchor} from "./PayerAnchor.sol";

/// @title DemoPayroll
/// @notice A stand-in for a real payroll platform. It holds Circle testnet USDC,
///         pays a fixed recipient set on a schedule, and anchors one commitment
///         per payment.
/// @dev This is NOT a simplification of the trust model. The transfers are real
///      ERC-20 transfers to real wallets in real Sepolia blocks, and every
///      commitment it anchors is genuinely provable through Attestcoin. Only the
///      payer's *identity* is simulated — disclosed in the README.
///
///      Why not the Circle faucet: a faucet pays from Circle's address, so
///      counting faucet claims as income would require putting Circle's faucet
///      in the payer registry, after which anyone claiming a faucet has
///      "income". That demonstrates a bug, not a product.
///
///      USDC HAS 6 DECIMALS, NOT 18. 100 USDC is 100_000_000.
contract DemoPayroll is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    /// @notice Hard cap on the recipient set, bounding the `runPayroll` loop.
    uint256 public constant MAX_RECIPIENTS = 10;

    /// @notice Floor for `periodSeconds`.
    uint256 public constant MIN_PERIOD_SECONDS = 15 minutes;

    /// @notice Ceiling for `periodSeconds`, so a fat-fingered value cannot halt
    ///         payroll indefinitely.
    uint256 public constant MAX_PERIOD_SECONDS = 30 days;

    // -----------------------------------------------------------------------
    // Immutables
    // -----------------------------------------------------------------------

    /// @notice The payment token. Circle testnet USDC on Sepolia, 6 decimals.
    IERC20 public immutable usdc;

    /// @notice The anchor this payer writes commitments to.
    /// @dev May be `address(0)`. On Base Sepolia there is no PayerAnchor to call,
    ///      because Attestcoin reads Ethereum only — the contract then pays and
    ///      emits `PaymentMade`, and the same payer anchors those commitments on
    ///      Ethereum Sepolia in a separate transaction carrying nothing but
    ///      hashes. Creditcoin learns a payment happened on Base without ever
    ///      reading Base, and no oracle is introduced because the payer is still
    ///      confirming its own payment.
    PayerAnchor public immutable anchor;

    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    /// @notice The cron caller. May only call `runPayroll`.
    address public keeper;

    /// @notice Length of one payroll period in seconds.
    uint256 public periodSeconds;

    /// @notice Timestamp the current period clock started counting from.
    uint256 public periodStart;

    /// @notice Period count accumulated before the last `periodSeconds` change.
    uint256 public periodOffset;

    /// @notice Last period successfully paid. Zero means never run, because
    ///         periods are 1-indexed.
    uint256 public lastPaidPeriod;

    /// @notice Block of the most recent run. Bounds backlog settlement to one
    ///         period per block.
    uint256 public lastRunBlock;

    /// @notice The first period each recipient is owed for. A recipient can
    ///         never be paid for a period that predates their enrollment.
    mapping(address recipient => uint256 period) public enrolledPeriod;

    /// @notice Amount owed to each recipient per period, in token base units.
    mapping(address recipient => uint256 amount) public amountOf;

    /// @dev 1-based index into `_recipients`; 0 means "not a recipient".
    mapping(address recipient => uint256 index) private _indexOf;

    /// @dev The iteration set. Bounded by MAX_RECIPIENTS.
    address[] private _recipients;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    /// @notice A recipient was paid and a commitment derived for them.
    /// @dev The salt is emitted so the worker can reconstruct the commitment
    ///      with no off-chain channel. DISCLOSED CONSEQUENCE: the commitment is
    ///      therefore not hiding on Sepolia — anyone reading these events can
    ///      recover the amount. A production payer delivers the salt off-chain
    ///      and emits only the commitment. This does not weaken the ZK proof;
    ///      the circuit still never reveals an amount to Creditcoin.
    event PaymentMade(
        address indexed recipient,
        uint256 amount,
        uint256 indexed period,
        bytes32 salt,
        bytes32 indexed commitment
    );

    /// @notice A recipient's transfer reverted and was skipped for this period.
    /// @dev They are not paid and get no commitment, so the gap is confined to
    ///      them instead of costing every recipient the period.
    event PaymentSkipped(address indexed recipient, uint256 amount, uint256 indexed period);

    /// @notice A payroll period completed.
    event PayrollRun(uint256 indexed period, uint256 paid, uint256 attempted);

    event RecipientAdded(address indexed recipient, uint256 amount, uint256 enrolledPeriod);
    event RecipientRemoved(address indexed recipient);
    event AmountSet(address indexed recipient, uint256 amount);
    event KeeperSet(address indexed keeper);
    event PeriodSecondsSet(uint256 periodSeconds, uint256 fromPeriod);
    event Withdrawn(address indexed to, uint256 amount);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error ZeroAddress();
    error ZeroAmount();
    error NotKeeperOrOwner(address caller);
    error NoRecipients();
    error TooManyRecipients(uint256 max);
    error AlreadyRecipient(address recipient);
    error NotRecipient(address recipient);
    error NoPeriodDue(uint256 nextPeriod, uint256 currentPeriod);
    error PeriodTooShort(uint256 given, uint256 min);
    error PeriodTooLong(uint256 given, uint256 max);
    error InsufficientFunding(uint256 required, uint256 available);
    error TransferFailed(address recipient, uint256 period);
    error OnlySelf();
    error RenounceDisabled();
    error OneRunPerBlock();

    // -----------------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------------

    /// @param _usdc          Payment token. Circle testnet USDC on Sepolia.
    /// @param _anchor        PayerAnchor, or `address(0)` for cross-chain mode.
    /// @param _owner         Owner. Nelly's keystore account.
    /// @param _keeper        Cron caller.
    /// @param _periodSeconds Initial period length. 4 hours in the demo.
    constructor(
        IERC20 _usdc,
        PayerAnchor _anchor,
        address _owner,
        address _keeper,
        uint256 _periodSeconds
    ) Ownable(_owner) {
        if (address(_usdc) == address(0)) revert ZeroAddress();
        if (_keeper == address(0)) revert ZeroAddress();
        _checkPeriodBounds(_periodSeconds);

        usdc = _usdc;
        anchor = _anchor;
        keeper = _keeper;
        periodSeconds = _periodSeconds;
        periodStart = block.timestamp;

        // Periods are 1-indexed so that lastPaidPeriod == 0 unambiguously means
        // "never run" and the very first run is not mistaken for a repeat.
        periodOffset = 1;

        emit KeeperSet(_keeper);
        emit PeriodSecondsSet(_periodSeconds, 1);
    }

    // -----------------------------------------------------------------------
    // Payroll
    // -----------------------------------------------------------------------

    /// @notice Pays every recipient for the current period and anchors the
    ///         resulting commitments.
    /// @dev Callable by the keeper or the owner only. Refuses to run twice in
    ///      the same period. The keeper is a hot key on a cron, so it is
    ///      deliberately given no power beyond triggering a run that was going
    ///      to happen anyway.
    function runPayroll() external nonReentrant {
        if (msg.sender != keeper && msg.sender != owner()) revert NotKeeperOrOwner(msg.sender);

        uint256 len = _recipients.length;
        if (len == 0) revert NoRecipients();

        // Pay forward from HISTORY, never from the wall clock. Selecting
        // currentPeriod() here would skip every period between two runs, and a
        // skipped period can never be paid or anchored afterwards — there is no
        // backfill path anywhere in the system, and the circuit's consecutive-
        // period assertion fails permanently for every affected worker.
        // Catching up one period per call converges: the cron fires hourly and
        // periods are four hours, so it recovers four times faster than the
        // clock advances.
        // Periods are 1-indexed and lastPaidPeriod starts at 0, so this is
        // uniform: the very first run pays period 1 and every later run pays
        // the one after the last. There is deliberately NO special case for the
        // first run — exempting it reintroduced the gap bug it was meant to fix,
        // because a first run delayed past enrollment would skip everything in
        // between. Periods with no eligible recipients cost nothing and advance.
        uint256 period = nextDuePeriod();
        uint256 nowPeriod = currentPeriod();
        if (period > nowPeriod) revert NoPeriodDue(period, nowPeriod);

        // Settling a backlog is legitimate; settling it ALL IN ONE BLOCK is
        // how forged history gets minted. Catch-up must cost wall-clock time,
        // because wall-clock time is the only thing an attacker cannot buy.
        if (block.number == lastRunBlock) revert OneRunPerBlock();

        (uint256 required, uint256 eligible) = _requirementFor(period);

        uint256 available = usdc.balanceOf(address(this));
        if (available < required) revert InsufficientFunding(required, available);

        // Effects before interactions.
        lastPaidPeriod = period;
        lastRunBlock = block.number;

        bytes32[] memory collected = new bytes32[](eligible);
        uint256 paid;

        for (uint256 i; i < len; ++i) {
            address recipient = _recipients[i];

            // Nobody is paid for a period that predates their enrollment.
            // Without this, adding a recipient and settling a backlog forges
            // arbitrary consecutive income history for a brand-new address.
            if (enrolledPeriod[recipient] > period) continue;

            uint256 amount = amountOf[recipient];

            // ALL-OR-NOTHING. An earlier design isolated each transfer so one
            // failure cost only that recipient the period. That was the right
            // call before catch-up existed, when reverting lost the period for
            // everyone — but catch-up means a reverted run is simply RETRIED, so
            // isolation now destroys one worker's history in exchange for
            // nothing. A blocked recipient stalls payroll until the owner
            // removes them, and nobody's history is lost in the meantime.
            //
            // The try/catch survives only to name the failing recipient: a raw
            // token revert tells the cron operator nothing about who to remove.
            try this.selfTransfer(recipient, amount) {
                bytes32 salt = saltFor(recipient, period);
                bytes32 commitment = commitmentFor(recipient, amount, period, salt);

                collected[paid] = commitment;
                unchecked {
                    ++paid;
                }

                emit PaymentMade(recipient, amount, period, salt, commitment);
            } catch {
                revert TransferFailed(recipient, period);
            }
        }

        // Only anchor when there is something to anchor. A period with no
        // eligible recipients owes nothing and must still advance — handing an
        // empty array to anchorBatch reverts EmptyBatch, which rolls back
        // lastPaidPeriod and stalls catch-up on that period forever.
        if (eligible != 0 && address(anchor) != address(0)) {
            // Deliberately not wrapped in try/catch. If anchoring fails the
            // payments are unprovable, and continuing would produce paid-but-
            // invisible income. Reverting retries the period an hour later with
            // identical commitments against an anchor whose state also rolled
            // back, so there is no duplicate and no permanent stall.
            anchor.anchorBatch(collected);
        }

        emit PayrollRun(period, paid, eligible);
    }

    /// @notice Transfers to one recipient. Not for external use.
    /// @dev External only because `try/catch` requires an external call, and
    ///      routing through `this` preserves SafeERC20 semantics rather than
    ///      dropping to a raw `transfer` that mishandles non-standard tokens.
    ///      `onlySelf` makes it unreachable by anyone else, including a
    ///      malicious token reentering during its own transfer.
    /// @param to     Recipient.
    /// @param amount Amount in token base units.
    function selfTransfer(address to, uint256 amount) external {
        if (msg.sender != address(this)) revert OnlySelf();
        usdc.safeTransfer(to, amount);
    }

    // -----------------------------------------------------------------------
    // Administration
    // -----------------------------------------------------------------------

    /// @notice Adds a recipient with a per-period amount. Owner only.
    function addRecipient(address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (_indexOf[recipient] != 0) revert AlreadyRecipient(recipient);
        if (_recipients.length >= MAX_RECIPIENTS) revert TooManyRecipients(MAX_RECIPIENTS);

        _recipients.push(recipient);
        _indexOf[recipient] = _recipients.length;
        amountOf[recipient] = amount;
        // The next WHOLE period. Enrolling mid-period must not pay a full wage
        // for a sliver of it, and must never land on an already-consumed period.
        enrolledPeriod[recipient] = currentPeriod() + 1;

        emit RecipientAdded(recipient, amount, enrolledPeriod[recipient]);
    }

    /// @notice Removes a recipient. Owner only.
    /// @dev Swap-and-pop from the iteration array AND clears `amountOf`, so a
    ///      removed recipient can never be paid again by any path.
    function removeRecipient(address recipient) external onlyOwner {
        uint256 idx = _indexOf[recipient];
        if (idx == 0) revert NotRecipient(recipient);

        uint256 lastIdx = _recipients.length;
        if (idx != lastIdx) {
            address moved = _recipients[lastIdx - 1];
            _recipients[idx - 1] = moved;
            _indexOf[moved] = idx;
        }

        _recipients.pop();
        delete _indexOf[recipient];
        delete amountOf[recipient];
        delete enrolledPeriod[recipient];

        emit RecipientRemoved(recipient);
    }

    /// @notice Changes an existing recipient's per-period amount. Owner only.
    function setAmount(address recipient, uint256 amount) external onlyOwner {
        if (_indexOf[recipient] == 0) revert NotRecipient(recipient);
        if (amount == 0) revert ZeroAmount();

        amountOf[recipient] = amount;

        emit AmountSet(recipient, amount);
    }

    /// @notice Replaces the cron caller. Owner only.
    function setKeeper(address newKeeper) external onlyOwner {
        if (newKeeper == address(0)) revert ZeroAddress();

        keeper = newKeeper;

        emit KeeperSet(newKeeper);
    }

    /// @notice Changes the period length without disturbing the period counter.
    ///         Owner only.
    /// @dev Settable rather than immutable because a stalled cron must be
    ///      fixable in place: redeploying would discard accumulated payment
    ///      history, which is the one thing in this project that cannot be
    ///      rebuilt.
    ///
    ///      The naive `block.timestamp / periodSeconds` would teleport the
    ///      counter on every change — shortening the period multiplies the index
    ///      (a permanent gap, killing consecutiveness for every existing proof),
    ///      and lengthening it rewinds the index below `lastPaidPeriod`, which
    ///      the equality guard does not catch, so payroll re-derives identical
    ///      commitments and the anchor rejects them as duplicates forever.
    ///
    ///      Anchoring the counter instead makes `currentPeriod()` evaluate to
    ///      exactly the same number immediately before and after a change, so
    ///      the sequence stays continuous and monotonically non-decreasing.
    function setPeriodSeconds(uint256 newPeriodSeconds) external onlyOwner {
        _checkPeriodBounds(newPeriodSeconds);

        uint256 frozen = currentPeriod();

        periodOffset = frozen;
        periodStart = block.timestamp;
        periodSeconds = newPeriodSeconds;

        emit PeriodSecondsSet(newPeriodSeconds, frozen);
    }

    /// @notice Withdraws unspent funding. Owner only.
    function withdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();

        usdc.safeTransfer(to, amount);

        emit Withdrawn(to, amount);
    }

    /// @notice Disabled. Renouncing would permanently freeze the recipient set,
    ///         the keeper, the period length and the ability to withdraw
    ///         funding, with no recovery path.
    /// @dev Overrides Ownable. Always reverts.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    /// @notice The current payroll period. 1-indexed, monotonically
    ///         non-decreasing across `setPeriodSeconds` changes.
    function currentPeriod() public view returns (uint256) {
        return periodOffset + (block.timestamp - periodStart) / periodSeconds;
    }

    /// @notice The salt for a given recipient and period.
    /// @dev Deterministic, and includes `address(this)` so two deployments never
    ///      collide. Determinism is safe here because per-payer duplicate
    ///      scoping in PayerAnchor removes the front-running griefing vector
    ///      that predictable commitments would otherwise create.
    function saltFor(address recipient, uint256 period) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), recipient, period));
    }

    /// @notice The commitment for a payment.
    /// @dev `abi.encode`, NOT `abi.encodePacked` — 32-byte padded per field.
    ///      Noir must mirror this byte layout exactly or nothing ever verifies.
    ///      `shared/commitment.ts` is the single source of truth.
    function commitmentFor(address recipient, uint256 amount, uint256 period, bytes32 salt)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(recipient, amount, period, salt));
    }

    /// @notice Total owed across all recipients for one period.
    function payrollTotal() public view returns (uint256 total) {
        uint256 len = _recipients.length;
        for (uint256 i; i < len; ++i) {
            total += amountOf[_recipients[i]];
        }
    }

    /// @notice How much additional funding one more period needs. Zero if
    ///         funded. For cron monitoring — alarm before a run fails.
    function fundingShortfall() external view returns (uint256) {
        // Mirrors runPayroll exactly — same period selection, same eligibility
        // filter — or the cron alarms on wages the next run was never going to pay.
        (uint256 required,) = _requirementFor(nextDuePeriod());

        uint256 available = usdc.balanceOf(address(this));
        return available >= required ? 0 : required - available;
    }

    /// @notice The full recipient set.
    function recipients() external view returns (address[] memory) {
        return _recipients;
    }

    /// @notice Number of recipients.
    function recipientCount() external view returns (uint256) {
        return _recipients.length;
    }

    /// @notice Whether an address is currently a recipient.
    function isRecipient(address recipient) external view returns (bool) {
        return _indexOf[recipient] != 0;
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    /// @dev The period the next successful run will settle, whether or not it is
    ///      due yet. Skips a provably empty prefix so a contract that sat idle
    ///      before anyone was enrolled does not have to grind through every
    ///      dormant period one block at a time. Only ever moves FORWARD, so the
    ///      sequence stays monotonic, and only to a period a current recipient
    ///      is actually owed.
    function nextDuePeriod() public view returns (uint256 period) {
        uint256 len = _recipients.length;
        period = lastPaidPeriod + 1;
        if (len == 0) return period;

        uint256 firstOwed = type(uint256).max;
        for (uint256 i; i < len; ++i) {
            uint256 enrolled = enrolledPeriod[_recipients[i]];
            if (enrolled < firstOwed) firstOwed = enrolled;
        }
        if (period < firstOwed) period = firstOwed;
    }

    /// @dev What a given period owes, and to how many recipients. `runPayroll`
    ///      and `fundingShortfall` MUST both go through this — computing
    ///      eligibility twice is what let monitoring drift from execution.
    function _requirementFor(uint256 period)
        internal
        view
        returns (uint256 required, uint256 eligible)
    {
        uint256 len = _recipients.length;
        for (uint256 i; i < len; ++i) {
            address r = _recipients[i];
            if (enrolledPeriod[r] > period) continue;
            required += amountOf[r];
            unchecked {
                ++eligible;
            }
        }
    }

    function _checkPeriodBounds(uint256 value) internal pure {
        if (value < MIN_PERIOD_SECONDS) revert PeriodTooShort(value, MIN_PERIOD_SECONDS);
        if (value > MAX_PERIOD_SECONDS) revert PeriodTooLong(value, MAX_PERIOD_SECONDS);
    }
}
