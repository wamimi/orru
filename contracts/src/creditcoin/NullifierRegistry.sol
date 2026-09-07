// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title NullifierRegistry
/// @notice Records spent nullifiers so one proof cannot be claimed twice.
/// @dev Shared by every contract that consumes income proofs, so the spent set
///      is global rather than per-consumer.
contract NullifierRegistry is Ownable {
    mapping(bytes32 nullifier => bool used) public spent;
    mapping(address consumer => bool allowed) public authorized;

    event NullifierSpent(bytes32 indexed nullifier, address indexed consumer);
    event ConsumerAuthorized(address indexed consumer, bool allowed);

    error ZeroAddress();
    error NotAuthorized(address caller);
    error AlreadySpent(bytes32 nullifier);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Allows or revokes a consumer. Owner only.
    function setAuthorized(address consumer, bool allowed) external onlyOwner {
        if (consumer == address(0)) revert ZeroAddress();
        authorized[consumer] = allowed;
        emit ConsumerAuthorized(consumer, allowed);
    }

    /// @notice Marks a nullifier spent. Authorized consumers only.
    /// @dev Reverts rather than returning false so a caller cannot ignore it.
    function markSpent(bytes32 nullifier) external {
        if (!authorized[msg.sender]) revert NotAuthorized(msg.sender);
        if (spent[nullifier]) revert AlreadySpent(nullifier);

        spent[nullifier] = true;

        emit NullifierSpent(nullifier, msg.sender);
    }
}
