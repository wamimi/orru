// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @title PayerAnchor
/// @notice The source event Attestcoin verifies. A payer — a payroll platform, a
///         grant programme, a DAO — writes one commitment per payment to
///         Ethereum, and Creditcoin later proves that write happened.
/// @dev `msg.sender` is the entire authenticity guarantee: the payer is
///      confirming **their own payment**, so no third party vouches for anyone
///      and no oracle is introduced. This is also what makes the cross-chain
///      flow honest — a payer who paid on Base anchoring the commitment here is
///      still only attesting to its own payment.
///
///      Deliberately unowned, unpausable and immutable. This contract is trust
///      infrastructure; an admin key over it would be an admin key over the
///      trust model. Legitimacy is decided downstream by
///      `AttestationRegistry.approvedPayer`, never here.
///
///      Privacy note: the event reveals the payer, never the worker. Every
///      worker paid by the same platform shares one anonymity set, which grows
///      as the platform grows.
contract PayerAnchor {
    /// @notice Maximum commitments per `anchorBatch` call.
    /// @dev Bounds gas on a loop over caller-supplied input, and matches the
    ///      per-receipt log bound in AttestationRegistry.
    uint256 public constant MAX_BATCH = 32;

    /// @notice Whether a given payer has already anchored a given commitment.
    /// @dev Scoped **per payer**, not globally. Global scoping is griefable: a
    ///      payer with a deterministic salt has predictable commitments, so an
    ///      attacker could front-run with the predicted value, block the real
    ///      anchor as a duplicate, and leave behind a log naming themselves as
    ///      payer. Per-payer scoping makes that attack inert — the real payer's
    ///      anchor still succeeds, and only the real payer's log carries a payer
    ///      address the registry approves.
    mapping(address payer => mapping(bytes32 commitment => bool anchored)) public anchoredBy;

    /// @notice Emitted for every accepted commitment. This is the event
    ///         Attestcoin proves and AttestationRegistry decodes.
    /// @param payer      The address that confirmed the payment (`msg.sender`).
    /// @param commitment keccak256(abi.encode(recipient, amount, period, salt)).
    event PaymentAnchored(address indexed payer, bytes32 indexed commitment);

    /// @notice Thrown when the zero commitment is submitted.
    error EmptyCommitment();
    /// @notice Thrown when this payer has already anchored this commitment.
    error AlreadyAnchored(address payer, bytes32 commitment);
    /// @notice Thrown when a batch contains no commitments.
    error EmptyBatch();
    /// @notice Thrown when a batch exceeds `MAX_BATCH`.
    error BatchTooLarge(uint256 length, uint256 max);

    /// @notice Anchors a single payment commitment.
    /// @dev Callable by anyone — being the caller is the claim. The caller is
    ///      recorded as the payer, and whether that payer counts as a real
    ///      employer is decided on Creditcoin, not here.
    /// @param commitment keccak256(abi.encode(recipient, amount, period, salt)).
    function anchorPayment(bytes32 commitment) external {
        _anchor(commitment);
    }

    /// @notice Anchors many commitments in one transaction.
    /// @dev Callable by anyone. Batching is the intended path for a payroll run:
    ///      one Ethereum transaction is one Attestcoin query, so a whole payroll
    ///      verifies for the price of a single proof.
    ///
    ///      A duplicate inside the batch reverts the whole call rather than
    ///      being skipped — this contract is generic infrastructure and silently
    ///      dropping a caller's input would hide a bug in the caller.
    /// @param commitments The commitments to anchor. Length 1..MAX_BATCH.
    function anchorBatch(bytes32[] calldata commitments) external {
        uint256 len = commitments.length;
        if (len == 0) revert EmptyBatch();
        if (len > MAX_BATCH) revert BatchTooLarge(len, MAX_BATCH);

        for (uint256 i; i < len; ++i) {
            _anchor(commitments[i]);
        }
    }

    /// @dev Records and emits one commitment for `msg.sender`.
    function _anchor(bytes32 commitment) internal {
        if (commitment == bytes32(0)) revert EmptyCommitment();
        if (anchoredBy[msg.sender][commitment]) revert AlreadyAnchored(msg.sender, commitment);

        anchoredBy[msg.sender][commitment] = true;

        emit PaymentAnchored(msg.sender, commitment);
    }
}
