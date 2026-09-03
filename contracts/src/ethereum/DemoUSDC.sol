// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title DemoUSDC
/// @notice Mintable demo token used to fund payroll on testnets. Not a
///         stablecoin and not affiliated with any issuer.
contract DemoUSDC is ERC20, Ownable {
    error ZeroAddress();

    constructor(address initialOwner) ERC20("Orru Demo Dollar", "dUSD") Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
    }

    /// @notice Six decimals. Downstream band bounds and formatting assume six.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mints to `to`. Owner only.
    /// @param amount Amount in base units.
    function mint(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        _mint(to, amount);
    }
}
