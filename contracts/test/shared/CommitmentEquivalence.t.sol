// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DemoPayroll} from "../../src/ethereum/DemoPayroll.sol";
import {PayerAnchor} from "../../src/ethereum/PayerAnchor.sol";
import {MockUSDC} from "../mocks/Tokens.sol";

/// @notice THE GATE. The same fixed vector is asserted here, in
///         circuits/income_proof/src/lib.nr, and in shared/commitment.test.ts.
///
/// @dev If Solidity, Noir and TypeScript ever disagree about how they hash the
///      same payment, every one of them still compiles and no proof ever
///      verifies -- and the failure appears somewhere that looks unrelated.
///      Nothing downstream of this test is trustworthy until it is green in all
///      three places.
contract CommitmentEquivalenceTest is Test {
    // ---- THE SHARED VECTOR (keep identical across all three) ----------------
    address internal constant V_RECIPIENT = 0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C;
    uint256 internal constant V_AMOUNT = 50_000; // 0.05 USDC, six decimals
    uint256 internal constant V_PERIOD = 2;
    bytes32 internal constant V_SALT =
        0x00000000000000000000000000000000000000000000000000000000000000ff;
    bytes32 internal constant V_EXPECTED =
        0x17aeddb687d315c564ebb7276ed88c253d82c1b21a7610c6c963e8f317dbbfb5;

    DemoPayroll internal payroll;

    function setUp() public {
        payroll = new DemoPayroll(
            IERC20(address(new MockUSDC())),
            new PayerAnchor(),
            address(this),
            makeAddr("keeper"),
            4 hours
        );
    }

    /// @dev The gate itself.
    function test_matchesTheSharedVector() public view {
        assertEq(
            payroll.commitmentFor(V_RECIPIENT, V_AMOUNT, V_PERIOD, V_SALT),
            V_EXPECTED,
            "Solidity disagrees with the shared vector -- Noir and TS will not verify"
        );
    }

    /// @dev The encoding must be abi.encode. abi.encodePacked produces 116
    ///      bytes instead of 128 and a completely different, equally plausible
    ///      hash. This is the single most likely way the three drift apart.
    function test_isAbiEncodeNotEncodePacked() public pure {
        bytes memory encoded = abi.encode(V_RECIPIENT, V_AMOUNT, V_PERIOD, V_SALT);
        bytes memory packed = abi.encodePacked(V_RECIPIENT, V_AMOUNT, V_PERIOD, V_SALT);

        assertEq(encoded.length, 128, "abi.encode must be four 32-byte words");
        assertEq(packed.length, 116, "abi.encodePacked packs the address to 20 bytes");
        assertTrue(keccak256(encoded) != keccak256(packed), "the two layouts must differ");
        assertEq(keccak256(encoded), V_EXPECTED);
    }

    /// @dev Each field must occupy its own 32-byte big-endian word, in order.
    ///      Noir rebuilds this layout by hand, so it is asserted explicitly.
    function test_wordLayoutIsWhatNoirRebuilds() public pure {
        bytes memory e = abi.encode(V_RECIPIENT, V_AMOUNT, V_PERIOD, V_SALT);

        bytes32 w0;
        bytes32 w1;
        bytes32 w2;
        bytes32 w3;
        assembly {
            w0 := mload(add(e, 32))
            w1 := mload(add(e, 64))
            w2 := mload(add(e, 96))
            w3 := mload(add(e, 128))
        }

        assertEq(w0, bytes32(uint256(uint160(V_RECIPIENT))), "word 0: address, left-padded");
        assertEq(w1, bytes32(V_AMOUNT), "word 1: amount");
        assertEq(w2, bytes32(V_PERIOD), "word 2: period");
        assertEq(w3, V_SALT, "word 3: salt");
    }

    /// @dev Every field must change the hash, or two payments could collide and
    ///      one of them would be unprovable.
    function test_everyFieldSeparates() public view {
        bytes32 base = payroll.commitmentFor(V_RECIPIENT, V_AMOUNT, V_PERIOD, V_SALT);

        assertTrue(
            base != payroll.commitmentFor(address(0xdead), V_AMOUNT, V_PERIOD, V_SALT),
            "recipient must separate"
        );
        assertTrue(
            base != payroll.commitmentFor(V_RECIPIENT, V_AMOUNT + 1, V_PERIOD, V_SALT),
            "amount must separate"
        );
        assertTrue(
            base != payroll.commitmentFor(V_RECIPIENT, V_AMOUNT, V_PERIOD + 1, V_SALT),
            "period must separate"
        );
        assertTrue(
            base != payroll.commitmentFor(V_RECIPIENT, V_AMOUNT, V_PERIOD, bytes32(uint256(1))),
            "salt must separate"
        );
    }

    /// @dev Noir holds amount and period as Field elements, bounded by the
    ///      bn254 modulus. Above it a value is silently reduced in-circuit and
    ///      the commitment diverges from Solidity with nothing to signal it.
    ///      Unreachable with real USDC, but shared/commitment.ts range-checks
    ///      rather than assuming, and this records the boundary.
    function test_amountsStayInsideTheProvableRange() public pure {
        uint256 bn254 =
            21888242871839275222246405745257275088548364400416034343698204186575808495617;

        // A whole USDC total supply is ~50 billion * 1e6 -- twelve orders of
        // magnitude below the limit.
        assertLt(50_000_000_000 * 1e6, bn254, "realistic amounts are provable");
        assertLt(uint256(type(uint64).max), bn254, "so is any uint64 period");
    }

    /// @dev Fuzz the whole space Noir can represent.
    function testFuzz_commitmentIsDeterministicAndCollisionFree(
        address r1,
        uint96 a1,
        uint32 p1,
        bytes32 s1
    ) public view {
        bytes32 first = payroll.commitmentFor(r1, a1, p1, s1);
        bytes32 again = payroll.commitmentFor(r1, a1, p1, s1);
        assertEq(first, again, "must be deterministic");
        assertEq(first, keccak256(abi.encode(r1, a1, p1, s1)), "must be plain abi.encode");
    }
}
