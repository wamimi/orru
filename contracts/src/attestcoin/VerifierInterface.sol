// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @title INativeQueryVerifier
/// @notice Interface to the Creditcoin Native Query Verifier precompile, which
///         authenticates that an encoded source-chain transaction genuinely
///         existed in attested source-chain history.
/// @dev Ported verbatim (struct layout and function signatures unchanged) from
///      the 19 August 2026 Attestcoin + Noir smoke test, where this exact
///      interface produced a successful on-chain verification at Creditcoin
///      block 5336478 (tx 0xa1a7484f4cfa14e196be313a2b6e71ee7f6c0f7c204b8c2eefc61fc6b0e51d1a).
///
///      WHAT THIS PRECOMPILE DOES NOT DO — read twice before writing a caller:
///      it establishes transaction inclusion and confirmed-chain membership
///      ONLY. It does not check that the source transaction succeeded, and it
///      does not interpret the transaction. Every caller is responsible for
///      checking receipt status, confirming the emitting contract is the
///      expected trusted source, and decoding the log itself. Skipping any of
///      those is a security bug, not a style choice.
interface INativeQueryVerifier {
    /// @param hash   Sibling node hash.
    /// @param isLeft Whether the sibling sits on the left of the path.
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    /// @notice Proof that the transaction is included in the source block.
    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    /// @notice Proof that the source block is part of the attested chain.
    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    /// @notice Verifies a source-chain transaction against attested history and
    ///         emits the precompile's own verification event.
    /// @dev Callable by anyone. State-changing (emits), so it cannot be `view`.
    /// @param chainKey           Attestcoin source chain key. NOT an EVM chain id.
    ///                           Sepolia = 1, Ethereum Mainnet = 3 on Creditcoin testnet.
    /// @param height             Source block height containing the transaction.
    /// @param encodedTransaction RLP-ish encoded source transaction and receipt.
    /// @param merkleProof        Inclusion proof for the transaction in the block.
    /// @param continuityProof    Proof the block belongs to the attested chain.
    /// @return True when the transaction is authenticated; reverts otherwise.
    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);

    /// @notice Derives the transaction's index within its block from the shape
    ///         of its Merkle path.
    /// @dev Callable by anyone. Used to build a replay-protection key.
    /// @param merkleProof The inclusion proof whose path encodes the index.
    /// @return The zero-based transaction index within the source block.
    function calculateTxIndex(MerkleProof calldata merkleProof) external view returns (uint64);
}

/// @title NativeQueryVerifierLib
/// @notice Pins the Creditcoin Native Query Verifier precompile address.
library NativeQueryVerifierLib {
    /// @notice The Native Query Verifier precompile on Creditcoin.
    address internal constant PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000FD2;

    /// @notice Returns a typed handle to the precompile.
    /// @dev Internal; callable only by contracts that link this library.
    function getVerifier() internal pure returns (INativeQueryVerifier) {
        return INativeQueryVerifier(PRECOMPILE_ADDRESS);
    }
}
