// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PayerAnchor} from "./PayerAnchor.sol";

/// @title DemoPayroll
/// @notice Pays a fixed recipient set once per period and anchors one
///         commitment per payment.
/// @dev Downstream proofs require a worker's paid periods to be consecutive, so
///      periods are settled in order and never skipped.
contract DemoPayroll is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_RECIPIENTS = 10;
    uint256 public constant MIN_PERIOD_SECONDS = 15 minutes;
    uint256 public constant MAX_PERIOD_SECONDS = 30 days;

    IERC20 public immutable usdc;

    /// @dev Zero disables anchoring, for deployments on chains the verifier
    ///      cannot read. Commitments are still emitted for anchoring elsewhere.
    PayerAnchor public immutable anchor;

    address public keeper;

    uint256 public periodSeconds;
    uint256 public periodStart;
    uint256 public periodOffset;

    /// @dev Zero means no period has been settled.
    uint256 public lastPaidPeriod;
    uint256 public lastRunBlock;

    mapping(address recipient => uint256 amount) public amountOf;

    /// @dev First period a recipient is owed for.
    mapping(address recipient => uint256 period) public enrolledPeriod;

    mapping(address recipient => uint256 index) private _indexOf;
    address[] private _recipients;

    /// @dev `salt` is emitted so a recipient can reconstruct the commitment
    ///      without an off-chain channel.
    event PaymentMade(
        address indexed recipient,
        uint256 amount,
        uint256 indexed period,
        bytes32 salt,
        bytes32 indexed commitment
    );
    event PayrollRun(uint256 indexed period, uint256 paid, uint256 eligible);
    event RecipientAdded(address indexed recipient, uint256 amount, uint256 enrolledPeriod);
    event RecipientRemoved(address indexed recipient);
    event AmountSet(address indexed recipient, uint256 amount);
    event KeeperSet(address indexed keeper);
    event PeriodSecondsSet(uint256 periodSeconds, uint256 fromPeriod);
    event Withdrawn(address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error NotKeeperOrOwner(address caller);
    error NoRecipients();
    error TooManyRecipients(uint256 max);
    error AlreadyRecipient(address recipient);
    error NotRecipient(address recipient);
    error NoPeriodDue(uint256 nextPeriod, uint256 currentPeriod);
    error OneRunPerBlock();
    error PeriodTooShort(uint256 given, uint256 min);
    error PeriodTooLong(uint256 given, uint256 max);
    error InsufficientFunding(uint256 required, uint256 available);
    error TransferFailed(address recipient, uint256 period);
    error OnlySelf();
    error RenounceDisabled();

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
        periodOffset = 1;

        emit KeeperSet(_keeper);
        emit PeriodSecondsSet(_periodSeconds, 1);
    }

    /// @notice Settles the next due period. Keeper or owner only.
    function runPayroll() external nonReentrant {
        if (msg.sender != keeper && msg.sender != owner()) revert NotKeeperOrOwner(msg.sender);

        uint256 len = _recipients.length;
        if (len == 0) revert NoRecipients();

        uint256 period = nextDuePeriod();
        uint256 nowPeriod = currentPeriod();
        if (period > nowPeriod) revert NoPeriodDue(period, nowPeriod);

        // Bounds how fast a backlog can be settled.
        if (block.number == lastRunBlock) revert OneRunPerBlock();

        (uint256 required, uint256 eligible) = _requirementFor(period);

        uint256 available = usdc.balanceOf(address(this));
        if (available < required) revert InsufficientFunding(required, available);

        lastPaidPeriod = period;
        lastRunBlock = block.number;

        bytes32[] memory collected = new bytes32[](eligible);
        uint256 paid;

        for (uint256 i; i < len; ++i) {
            address recipient = _recipients[i];
            if (enrolledPeriod[recipient] > period) continue;

            uint256 amount = amountOf[recipient];

            // All or nothing: a partial run would leave the skipped recipient
            // with an unfillable gap. The catch names who blocked it.
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

        if (eligible != 0 && address(anchor) != address(0)) {
            anchor.anchorBatch(collected);
        }

        emit PayrollRun(period, paid, eligible);
    }

    /// @notice Transfers to one recipient. Callable only by this contract.
    /// @dev External so the caller can catch a failure and name the recipient.
    function selfTransfer(address to, uint256 amount) external {
        if (msg.sender != address(this)) revert OnlySelf();
        usdc.safeTransfer(to, amount);
    }

    /// @notice Adds a recipient, owed from the next whole period. Owner only.
    function addRecipient(address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (_indexOf[recipient] != 0) revert AlreadyRecipient(recipient);
        if (_recipients.length >= MAX_RECIPIENTS) revert TooManyRecipients(MAX_RECIPIENTS);

        _recipients.push(recipient);
        _indexOf[recipient] = _recipients.length;
        amountOf[recipient] = amount;
        enrolledPeriod[recipient] = currentPeriod() + 1;

        emit RecipientAdded(recipient, amount, enrolledPeriod[recipient]);
    }

    /// @notice Removes a recipient. Owner only.
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

    /// @notice Updates a recipient's per-period amount. Owner only.
    function setAmount(address recipient, uint256 amount) external onlyOwner {
        if (_indexOf[recipient] == 0) revert NotRecipient(recipient);
        if (amount == 0) revert ZeroAmount();

        amountOf[recipient] = amount;

        emit AmountSet(recipient, amount);
    }

    /// @notice Replaces the keeper. Owner only.
    function setKeeper(address newKeeper) external onlyOwner {
        if (newKeeper == address(0)) revert ZeroAddress();

        keeper = newKeeper;

        emit KeeperSet(newKeeper);
    }

    /// @notice Changes the period length. Owner only.
    /// @dev Freezes the current period number and restarts the clock, so the
    ///      counter stays continuous and non-decreasing across the change.
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

    /// @notice Disabled. Renouncing would leave the contract unadministrable.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    /// @notice The current period. One-indexed and non-decreasing.
    function currentPeriod() public view returns (uint256) {
        return periodOffset + (block.timestamp - periodStart) / periodSeconds;
    }

    /// @notice The period the next successful run will settle.
    /// @dev Skips periods that predate every current enrollment.
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

    function saltFor(address recipient, uint256 period) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), recipient, period));
    }

    /// @dev `abi.encode`, not `abi.encodePacked`. The circuit mirrors this
    ///      layout byte for byte.
    function commitmentFor(address recipient, uint256 amount, uint256 period, bytes32 salt)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(recipient, amount, period, salt));
    }

    /// @notice Total owed across all current recipients for one period.
    function payrollTotal() public view returns (uint256 total) {
        uint256 len = _recipients.length;
        for (uint256 i; i < len; ++i) {
            total += amountOf[_recipients[i]];
        }
    }

    /// @notice Shortfall against what the next run needs. Zero if funded.
    function fundingShortfall() external view returns (uint256) {
        (uint256 required,) = _requirementFor(nextDuePeriod());

        uint256 available = usdc.balanceOf(address(this));
        return available >= required ? 0 : required - available;
    }

    function recipients() external view returns (address[] memory) {
        return _recipients;
    }

    function recipientCount() external view returns (uint256) {
        return _recipients.length;
    }

    function isRecipient(address recipient) external view returns (bool) {
        return _indexOf[recipient] != 0;
    }

    /// @dev Shared by `runPayroll` and `fundingShortfall` so execution and
    ///      monitoring cannot diverge.
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
