// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {USCBase} from "../../src/attestcoin/USCBase.sol";
import {INativeQueryVerifier, NativeQueryVerifierLib} from "../../src/attestcoin/VerifierInterface.sol";

/// @dev Minimal concrete subclass so the abstract base can be exercised.
contract USCBaseHarness is USCBase {
    uint8 public lastAction;
    uint64 public lastChainKey;
    uint64 public lastBlockHeight;
    bytes32 public lastQueryId;
    bytes public lastEncodedTransaction;
    uint256 public processCount;

    function _processAndEmitEvent(
        uint8 action,
        uint64 chainKey,
        uint64 blockHeight,
        bytes32 queryId,
        bytes memory encodedTransaction
    ) internal override {
        lastAction = action;
        lastChainKey = chainKey;
        lastBlockHeight = blockHeight;
        lastQueryId = queryId;
        lastEncodedTransaction = encodedTransaction;
        ++processCount;
    }

    function exposedComputeQueryId(
        uint64 chainKey,
        uint64 blockHeight,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings
    ) external view returns (bytes32) {
        return _computeQueryId(chainKey, blockHeight, merkleRoot, siblings);
    }
}

contract USCBaseTest is Test {
    address internal constant NQV = NativeQueryVerifierLib.PRECOMPILE_ADDRESS;

    USCBaseHarness internal base;

    uint64 internal constant CHAIN_KEY = 1; // Sepolia — Attestcoin key, NOT 11155111
    uint64 internal constant BLOCK_HEIGHT = 11_521_265;
    uint64 internal constant TX_INDEX = 118;
    bytes32 internal constant MERKLE_ROOT = keccak256("root");

    function setUp() public {
        base = new USCBaseHarness();
        _mockTxIndex(TX_INDEX);
        _mockVerify(true);
    }

    // ---------------------------------------------------------------------
    // The port must not have changed the replay key.
    // ---------------------------------------------------------------------

    /// @dev Recomputes queryId with the ORIGINAL un-annotated assembly from the
    ///      19 Aug smoke test. Adding ("memory-safe") must not change the hash.
    function _referenceQueryId(uint64 chainKey, uint64 blockHeight, uint256 txIndex)
        internal
        pure
        returns (bytes32 queryId)
    {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, chainKey)
            mstore(add(ptr, 32), shl(192, blockHeight))
            mstore(add(ptr, 40), txIndex)
            queryId := keccak256(ptr, 72)
        }
    }

    function test_computeQueryId_matchesProvenImplementation() public view {
        bytes32 got = base.exposedComputeQueryId(CHAIN_KEY, BLOCK_HEIGHT, MERKLE_ROOT, _siblings());
        bytes32 want = _referenceQueryId(CHAIN_KEY, BLOCK_HEIGHT, TX_INDEX);
        assertEq(got, want, "queryId drifted from the proven implementation");
    }

    function testFuzz_computeQueryId_matchesProvenImplementation(
        uint64 chainKey,
        uint64 blockHeight,
        uint64 txIndex
    ) public {
        _mockTxIndex(txIndex);
        bytes32 got = base.exposedComputeQueryId(chainKey, blockHeight, MERKLE_ROOT, _siblings());
        assertEq(got, _referenceQueryId(chainKey, blockHeight, txIndex));
    }

    /// @dev The key must separate on every field it claims to separate on.
    function test_computeQueryId_isDistinctPerField() public {
        bytes32 a = base.exposedComputeQueryId(CHAIN_KEY, BLOCK_HEIGHT, MERKLE_ROOT, _siblings());

        bytes32 b = base.exposedComputeQueryId(3, BLOCK_HEIGHT, MERKLE_ROOT, _siblings());
        assertTrue(a != b, "chainKey does not separate");

        bytes32 c = base.exposedComputeQueryId(CHAIN_KEY, BLOCK_HEIGHT + 1, MERKLE_ROOT, _siblings());
        assertTrue(a != c, "blockHeight does not separate");

        _mockTxIndex(TX_INDEX + 1);
        bytes32 d = base.exposedComputeQueryId(CHAIN_KEY, BLOCK_HEIGHT, MERKLE_ROOT, _siblings());
        assertTrue(a != d, "txIndex does not separate");
    }

    // ---------------------------------------------------------------------
    // execute()
    // ---------------------------------------------------------------------

    function test_execute_verifiesThenProcesses() public {
        bool ok = _execute();
        assertTrue(ok);
        assertEq(base.processCount(), 1);
        assertEq(base.lastAction(), 0);
        assertTrue(base.processedQueries(base.lastQueryId()));
    }

    function test_execute_revertsOnReplay() public {
        _execute();
        bytes32 queryId = base.lastQueryId();
        vm.expectRevert(abi.encodeWithSelector(USCBase.QueryAlreadyProcessed.selector, queryId));
        _execute();
        assertEq(base.processCount(), 1, "replay must not reach the application hook");
    }

    function test_execute_revertsWhenPrecompileRejects() public {
        _mockVerify(false);
        vm.expectRevert(USCBase.ProofVerificationFailed.selector);
        _execute();
        assertEq(base.processCount(), 0);
    }

    /// @dev A rejected proof must leave no replay marker behind, or a later
    ///      valid submission of the same transaction would be permanently blocked.
    function test_execute_rejectedProofDoesNotBurnTheQueryId() public {
        _mockVerify(false);
        vm.expectRevert(USCBase.ProofVerificationFailed.selector);
        _execute();

        _mockVerify(true);
        assertTrue(_execute());
        assertEq(base.processCount(), 1);
    }

    /// @dev A subclass must be able to pin the source chain. Without these the
    ///      trusted-source check degrades to "any chain the precompile attests".
    function test_hookReceivesTheAuthenticatedProvenance() public {
        _execute();
        assertEq(base.lastChainKey(), CHAIN_KEY, "hook must see the source chain");
        assertEq(base.lastBlockHeight(), BLOCK_HEIGHT, "hook must see the block height");
    }

    function test_verifierPointsAtThePrecompile() public view {
        assertEq(address(base.VERIFIER()), 0x0000000000000000000000000000000000000FD2);
    }

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    function _siblings() internal pure returns (INativeQueryVerifier.MerkleProofEntry[] memory s) {
        s = new INativeQueryVerifier.MerkleProofEntry[](2);
        s[0] = INativeQueryVerifier.MerkleProofEntry({hash: keccak256("s0"), isLeft: true});
        s[1] = INativeQueryVerifier.MerkleProofEntry({hash: keccak256("s1"), isLeft: false});
    }

    function _mockTxIndex(uint64 idx) internal {
        vm.mockCall(NQV, abi.encodeWithSelector(INativeQueryVerifier.calculateTxIndex.selector), abi.encode(idx));
    }

    function _mockVerify(bool ok) internal {
        vm.mockCall(NQV, abi.encodeWithSelector(INativeQueryVerifier.verifyAndEmit.selector), abi.encode(ok));
    }

    function _execute() internal returns (bool) {
        bytes32[] memory roots = new bytes32[](1);
        roots[0] = keccak256("continuity");
        return base.execute(0, CHAIN_KEY, BLOCK_HEIGHT, hex"deadbeef", MERKLE_ROOT, _siblings(), bytes32(0), roots);
    }
}
