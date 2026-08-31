// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {INativeQueryVerifier, NativeQueryVerifierLib} from "./VerifierInterface.sol";

/// @title USCBase
/// @notice Base contract for any Orru contract that consumes Attestcoin-verified
///         source-chain facts. Handles precompile invocation and replay
///         protection; leaves all interpretation to the subclass.
/// @dev Ported from the 19 August 2026 smoke test with logic and the queryId
///      assembly preserved exactly. Only revert strings became custom errors and
///      the pragma was pinned. Do not alter `_computeQueryId` — its byte layout
///      defines the replay key that has already been used on-chain.
///
///      DIVISION OF RESPONSIBILITY, which the subclass must honour:
///        - This contract proves the source transaction is authentic.
///        - `_processAndEmitEvent` must check receipt status, require the exact
///          trusted source contract (INVARIANT 1: TRUSTED-SOURCE), decode the
///          log, and apply application policy.
///      Attestcoin proving an event existed is never sufficient reason to
///      accept it.
abstract contract USCBase {
    /// @notice Handle to the Creditcoin Native Query Verifier precompile.
    INativeQueryVerifier public immutable VERIFIER;

    /// @notice Source queries already consumed, keyed by (chainKey, height, txIndex).
    mapping(bytes32 queryId => bool processed) public processedQueries;

    /// @notice Thrown when the same source transaction is submitted twice.
    error QueryAlreadyProcessed(bytes32 queryId);

    /// @notice Thrown when the precompile rejects the inclusion proof.
    error ProofVerificationFailed();

    constructor() {
        VERIFIER = NativeQueryVerifierLib.getVerifier();
    }

    /// @notice Application hook invoked only after the source transaction has
    ///         been authenticated by the precompile.
    /// @dev Implemented by the subclass. MUST verify receipt status and the
    ///      trusted source contract before acting on any log.
    /// @param action             Application-defined action selector.
    /// @param queryId            Replay key for this source transaction.
    /// @param encodedTransaction The authenticated source transaction and receipt.
    function _processAndEmitEvent(uint8 action, bytes32 queryId, bytes memory encodedTransaction)
        internal
        virtual;

    /// @notice Submits an Attestcoin proof bundle for a source-chain transaction.
    /// @dev Permissionless by design — the proof itself is the authorization, so
    ///      anyone (typically the Orru worker, but equally a user or a third
    ///      party) may relay a valid bundle. Reverts on replay or on a failed
    ///      inclusion proof, so the bool return is always true on success.
    /// @param action              Application-defined action selector.
    /// @param chainKey            Attestcoin source chain key (Sepolia = 1), NOT an EVM chain id.
    /// @param blockHeight         Source block height containing the transaction.
    /// @param encodedTransaction  Encoded source transaction and receipt.
    /// @param merkleRoot          Root of the transaction inclusion proof.
    /// @param siblings            Merkle path siblings for the transaction.
    /// @param lowerEndpointDigest Lower endpoint of the continuity proof.
    /// @param continuityRoots     Continuity proof roots.
    /// @return success Always true; failures revert.
    function execute(
        uint8 action,
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external returns (bool success) {
        bytes32 queryId = _computeQueryId(chainKey, blockHeight, merkleRoot, siblings);

        if (processedQueries[queryId]) revert QueryAlreadyProcessed(queryId);

        bool verified = _verifyProof(
            chainKey,
            blockHeight,
            encodedTransaction,
            merkleRoot,
            siblings,
            lowerEndpointDigest,
            continuityRoots
        );

        if (!verified) revert ProofVerificationFailed();

        // Effects before the interaction in `_processAndEmitEvent`.
        processedQueries[queryId] = true;

        _processAndEmitEvent(action, queryId, encodedTransaction);

        return true;
    }

    /// @dev Calls the precompile with the reassembled proof structs.
    function _verifyProof(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) internal returns (bool verified) {
        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: merkleRoot, siblings: siblings});

        INativeQueryVerifier.ContinuityProof memory continuityProof = INativeQueryVerifier
            .ContinuityProof({lowerEndpointDigest: lowerEndpointDigest, roots: continuityRoots});

        verified = VERIFIER.verifyAndEmit(
            chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof
        );

        return verified;
    }

    /// @dev Derives the replay key for a source transaction.
    ///      Byte layout hashed, total 72 bytes — preserved exactly from the
    ///      proven implementation:
    ///        [ 0..32) chainKey,   zero-padded to 32 bytes
    ///        [32..40) blockHeight, 8 bytes big-endian (via shl(192, ...))
    ///        [40..72) txIndex,    zero-padded to 32 bytes
    ///      The write at offset 40 deliberately overlaps and truncates the
    ///      32-byte word written at offset 32, leaving blockHeight occupying
    ///      exactly 8 bytes. Scratch memory above the free pointer is used
    ///      transiently and consumed immediately, so the free pointer is not
    ///      advanced.
    function _computeQueryId(
        uint64 chainKey,
        uint64 blockHeight,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings
    ) internal view returns (bytes32 queryId) {
        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: merkleRoot, siblings: siblings});

        uint256 txIndex = VERIFIER.calculateTxIndex(merkleProof);

        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, chainKey)
            mstore(add(ptr, 32), shl(192, blockHeight))
            mstore(add(ptr, 40), txIndex)
            queryId := keccak256(ptr, 72)
        }
    }
}
