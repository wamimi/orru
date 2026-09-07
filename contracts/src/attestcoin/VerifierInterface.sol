// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @title INativeQueryVerifier
/// @notice Creditcoin precompile that authenticates a source-chain transaction
///         against attested history.
/// @dev Establishes inclusion and chain membership only. It does not check that
///      the source transaction succeeded and does not interpret it. Callers
///      must check receipt status and the emitting contract themselves.
interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    /// @param chainKey Source chain key, not an EVM chain id.
    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);

    /// @notice Derives the transaction's index within its block from the shape
    ///         of its Merkle path.
    function calculateTxIndex(MerkleProof calldata merkleProof) external view returns (uint64);
}

library NativeQueryVerifierLib {
    address internal constant PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000FD2;

    function getVerifier() internal pure returns (INativeQueryVerifier) {
        return INativeQueryVerifier(PRECOMPILE_ADDRESS);
    }
}
