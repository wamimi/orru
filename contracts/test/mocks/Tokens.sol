// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Circle testnet USDC stand-in. SIX decimals, matching the real thing.
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev USDC with Circle's blacklist behaviour — the one realistic way a single
///      transfer fails while every other transfer succeeds.
contract BlacklistUSDC is MockUSDC {
    mapping(address account => bool blocked) public blacklisted;

    function setBlacklisted(address account, bool blocked) external {
        blacklisted[account] = blocked;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        require(!blacklisted[to], "USDC: blacklisted");
        return super.transfer(to, amount);
    }
}

/// @dev Attempts to reenter the payer during its own transfer.
/// @dev The trigger is keyed on the RECIPIENT, not a one-shot flag. A flag would
///      be rolled back along with the propagated revert, so every transfer would
///      re-arm itself and the mock could only ever express "all recipients
///      fail". Keying on `to` lets a test target exactly one victim.
contract ReentrantUSDC is MockUSDC {
    address public target;
    bytes public payload;
    address public triggerOn;

    /// @param triggerOn_ Reenter only when paying this recipient.
    ///                   `address(0)` reenters on every transfer.
    function arm(address target_, bytes calldata payload_, address triggerOn_) external {
        target = target_;
        payload = payload_;
        triggerOn = triggerOn_;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (target != address(0) && (triggerOn == address(0) || to == triggerOn)) {
            (bool ok, bytes memory ret) = target.call(payload);
            // Propagate so the caller sees exactly how the guard rejected it.
            if (!ok) {
                assembly ("memory-safe") {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
        return super.transfer(to, amount);
    }
}

/// @dev Burns a fee on every transfer, so the recipient receives less than the
///      amount recorded in the commitment.
contract FeeOnTransferUSDC is MockUSDC {
    uint256 public constant FEE_BPS = 100; // 1%

    function transfer(address to, uint256 amount) public override returns (bool) {
        uint256 fee = (amount * FEE_BPS) / 10_000;
        _transfer(msg.sender, address(0xdead), fee);
        return super.transfer(to, amount - fee);
    }
}
