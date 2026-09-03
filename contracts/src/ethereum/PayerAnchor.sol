// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @title PayerAnchor
/// @notice Records payment commitments on Ethereum for later verification on
///         Creditcoin. A payer anchors its own payments; `msg.sender` is the
///         only claim of authenticity.
/// @dev Unowned and immutable. Whether a payer is legitimate is decided
///      downstream, never here.
contract PayerAnchor {
    uint256 public constant MAX_BATCH = 32;

    /// @dev Scoped per payer so a third party cannot burn a commitment the real
    ///      payer has not yet anchored.
    mapping(address payer => mapping(bytes32 commitment => bool anchored)) public anchoredBy;

    event PaymentAnchored(address indexed payer, bytes32 indexed commitment);

    error EmptyCommitment();
    error AlreadyAnchored(address payer, bytes32 commitment);
    error EmptyBatch();
    error BatchTooLarge(uint256 length, uint256 max);

    /// @notice Anchors a single commitment for the caller.
    function anchorPayment(bytes32 commitment) external {
        _anchor(commitment);
    }

    /// @notice Anchors up to `MAX_BATCH` commitments in one transaction.
    /// @dev One transaction is one verification downstream, so a payroll run
    ///      should anchor as a single batch.
    function anchorBatch(bytes32[] calldata commitments) external {
        uint256 len = commitments.length;
        if (len == 0) revert EmptyBatch();
        if (len > MAX_BATCH) revert BatchTooLarge(len, MAX_BATCH);

        for (uint256 i; i < len; ++i) {
            _anchor(commitments[i]);
        }
    }

    function _anchor(bytes32 commitment) internal {
        if (commitment == bytes32(0)) revert EmptyCommitment();
        if (anchoredBy[msg.sender][commitment]) revert AlreadyAnchored(msg.sender, commitment);

        anchoredBy[msg.sender][commitment] = true;

        emit PaymentAnchored(msg.sender, commitment);
    }
}
