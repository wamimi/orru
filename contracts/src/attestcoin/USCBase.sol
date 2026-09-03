// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {INativeQueryVerifier, NativeQueryVerifierLib} from "./VerifierInterface.sol";

/// @title USCBase
/// @notice Base for contracts consuming source-chain facts authenticated by the
///         Creditcoin native query verifier.
/// @dev Handles proof submission and replay protection. Subclasses interpret
///      the receipt and must check its status and the emitting contract.
abstract contract USCBase {
    INativeQueryVerifier public immutable VERIFIER;

    /// @dev Keyed by (chainKey, blockHeight, txIndex).
    mapping(bytes32 queryId => bool processed) public processedQueries;

    error QueryAlreadyProcessed(bytes32 queryId);
    error ProofVerificationFailed();

    constructor() {
        VERIFIER = NativeQueryVerifierLib.getVerifier();
    }

    /// @dev Invoked only after the source transaction is authenticated.
    function _processAndEmitEvent(uint8 action, bytes32 queryId, bytes memory encodedTransaction)
        internal
        virtual;

    /// @notice Submits a proof bundle for a source-chain transaction.
    /// @dev Permissionless: the proof is the authorization.
    /// @param chainKey Source chain key, not an EVM chain id.
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

        processedQueries[queryId] = true;

        _processAndEmitEvent(action, queryId, encodedTransaction);

        return true;
    }

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

    /// @dev Hashes 72 bytes: chainKey padded to 32, blockHeight as 8, txIndex
    ///      padded to 32. The write at offset 40 truncates the word written at
    ///      32. Layout is fixed; changing it invalidates existing replay keys.
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
