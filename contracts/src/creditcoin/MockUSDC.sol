// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDC
/// @notice Mintable settlement token for the Creditcoin side. Creditcoin testnet
///         has no canonical stablecoin, so one is deployed here and disclosed.
contract MockUSDC is ERC20, Ownable {
    error ZeroAddress();

    constructor(address initialOwner) ERC20("Orru Mock USD", "mUSDC") Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
    }

    /// @notice Six decimals, matching the source-chain token and the band table.
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
