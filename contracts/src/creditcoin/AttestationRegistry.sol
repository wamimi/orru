// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
import {USCBase} from "../attestcoin/USCBase.sol";

/// @title AttestationRegistry
/// @notice Accepts payment commitments proven to exist on the source chain.
/// @dev The precompile establishes only that a transaction was included. This
///      contract adds what it does not: the source chain, the receipt status,
///      the emitting contract, and whether the payer is recognised.
contract AttestationRegistry is USCBase, Ownable {
    /// @dev Source chain key, not an EVM chain id.
    uint64 public immutable SOURCE_CHAIN_KEY;

    /// @dev The only contract whose events are accepted. Immutable: a settable
    ///      trusted source is a settable trust root.
    address public immutable TRUSTED_ANCHOR;

    bytes32 public constant PAYMENT_ANCHORED_SIG = keccak256("PaymentAnchored(address,bytes32)");

    /// @dev Bounds how many TRUSTED_ANCHOR logs one receipt may carry. Counted
    ///      after the trust filter: one source transaction is one query, so
    ///      letting lookalike logs count here would let anything that can emit
    ///      alongside a genuine anchor bury that payment permanently.
    uint256 public constant MAX_LOGS_PER_RECEIPT = 32;

    /// @dev Bounds the scan over caller-supplied receipt data. Reverting rather
    ///      than truncating leaves the query unconsumed, so an oversized receipt
    ///      fails retryably instead of silently dropping commitments.
    uint256 public constant MAX_RECEIPT_LOGS = 256;

    mapping(address payer => bool approved) public approvedPayer;
    mapping(bytes32 commitment => bool accepted) public acceptedCommitment;

    /// @dev A commitment may legitimately be anchored by more than one payer,
    ///      so attribution is a pair, not a single winner.
    mapping(bytes32 commitment => mapping(address payer => bool)) public acceptedByPayer;

    /// @dev Source block height each payer's proof was at. Per payer, because
    ///      acceptance is per payer: a global height would date one payer's
    ///      credential from another payer's event.
    mapping(bytes32 commitment => mapping(address payer => uint64 height)) public provenAtHeight;

    event CommitmentAccepted(
        bytes32 indexed commitment, address indexed payer, bytes32 indexed queryId, uint64 blockHeight
    );
    event PayerApprovalSet(address indexed payer, bool approved);

    error ZeroAddress();
    error UnsupportedAction(uint8 action);
    error WrongSourceChain(uint64 given, uint64 expected);
    error SourceTransactionFailed();
    error UnsupportedTransactionType(uint8 txType);
    error NoTrustedLogs();
    error TooManyLogs(uint256 count, uint256 max);
    error TooManyReceiptLogs(uint256 count, uint256 max);

    constructor(uint64 sourceChainKey, address trustedAnchor, address initialOwner)
        Ownable(initialOwner)
    {
        if (trustedAnchor == address(0)) revert ZeroAddress();
        SOURCE_CHAIN_KEY = sourceChainKey;
        TRUSTED_ANCHOR = trustedAnchor;
    }

    /// @notice Marks a payer as recognised. Owner only.
    function setPayerApproval(address payer, bool approved) external onlyOwner {
        if (payer == address(0)) revert ZeroAddress();
        approvedPayer[payer] = approved;
        emit PayerApprovalSet(payer, approved);
    }

    function _processAndEmitEvent(
        uint8 action,
        uint64 chainKey,
        uint64 blockHeight,
        bytes32 queryId,
        bytes memory encodedTransaction
    ) internal override {
        if (action != 0) revert UnsupportedAction(action);
        if (chainKey != SOURCE_CHAIN_KEY) revert WrongSourceChain(chainKey, SOURCE_CHAIN_KEY);

        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        if (!EvmV1Decoder.isValidTransactionType(txType)) revert UnsupportedTransactionType(txType);

        EvmV1Decoder.ReceiptFields memory receipt =
            EvmV1Decoder.decodeReceiptFields(encodedTransaction);

        // The precompile proves inclusion, not success. A reverted transaction
        // is still included.
        if (receipt.receiptStatus != 1) revert SourceTransactionFailed();

        EvmV1Decoder.LogEntry[] memory logs =
            EvmV1Decoder.getLogsByEventSignature(receipt, PAYMENT_ANCHORED_SIG);

        if (logs.length > MAX_RECEIPT_LOGS) {
            revert TooManyReceiptLogs(logs.length, MAX_RECEIPT_LOGS);
        }

        // Counted in its own scope, before the main loop: the cap must apply to
        // logs that survived the trust filter, and `via_ir` is unavailable here
        // so the counter must not stay live alongside the loop below.
        {
            uint256 trusted;
            for (uint256 i; i < logs.length; ++i) {
                if (_isTrustedAnchorLog(logs[i])) {
                    unchecked {
                        ++trusted;
                    }
                }
            }
            if (trusted > MAX_LOGS_PER_RECEIPT) {
                revert TooManyLogs(trusted, MAX_LOGS_PER_RECEIPT);
            }
        }

        uint256 accepted;

        // Every matching log must be processed. One transaction is one query and
        // consumable once, so stopping early would strand the rest permanently.
        for (uint256 i; i < logs.length; ++i) {
            EvmV1Decoder.LogEntry memory log = logs[i];

            if (!_isTrustedAnchorLog(log)) continue;

            address payer = address(uint160(uint256(log.topics[1])));
            if (!approvedPayer[payer]) continue;

            bytes32 commitment = log.topics[2];
            if (commitment == bytes32(0)) continue;

            unchecked {
                ++accepted;
            }

            // Earliest authenticated height wins, and this runs before the
            // idempotency check: a proof relayed later may still carry an
            // earlier height, and the date must not depend on submission order.
            uint64 known = provenAtHeight[commitment][payer];
            if (known == 0 || blockHeight < known) {
                provenAtHeight[commitment][payer] = blockHeight;
            }

            // Idempotent rather than reverting: a repeat inside one receipt must
            // not discard the other commitments alongside it.
            if (acceptedByPayer[commitment][payer]) continue;

            acceptedCommitment[commitment] = true;
            acceptedByPayer[commitment][payer] = true;

            emit CommitmentAccepted(commitment, payer, queryId, blockHeight);
        }

        if (accepted == 0) revert NoTrustedLogs();
    }

    /// @dev A log the application will consider at all: emitted by the trusted
    ///      anchor, and shaped like PaymentAnchored(address,bytes32).
    function _isTrustedAnchorLog(EvmV1Decoder.LogEntry memory log) internal view returns (bool) {
        return log.address_ == TRUSTED_ANCHOR && log.topics.length == 3
            && log.topics[0] == PAYMENT_ANCHORED_SIG;
    }
}
