// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DemoUSDC} from "../../src/ethereum/DemoUSDC.sol";

contract DemoUSDCTest is Test {
    DemoUSDC internal token;
    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        token = new DemoUSDC(owner);
    }

    /// @dev The single most consequential property. Every downstream component
    ///      assumes six: the commitment scheme, the circuit's band bounds and
    ///      the frontend formatter. Eighteen would break all three silently.
    function test_hasSixDecimalsLikeUSDC() public view {
        assertEq(token.decimals(), 6, "SIX decimals, not OpenZeppelin's default 18");
        assertEq(token.name(), "Orru Demo Dollar");
        assertEq(token.symbol(), "dUSD", "must not be mistakable for real USDC");
    }

    function test_ownerCanMint() public {
        vm.prank(owner);
        token.mint(stranger, 2_500e6); // one 2,500 dollar pay cycle
        assertEq(token.balanceOf(stranger), 2_500e6);
        assertEq(token.totalSupply(), 2_500e6);
    }

    function test_strangerCannotMint() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        token.mint(stranger, 1e6);
    }

    function test_mintRejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(DemoUSDC.ZeroAddress.selector);
        token.mint(address(0), 1e6);
    }

    function test_constructorRejectsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new DemoUSDC(address(0));
    }

    function test_transfersLikeAnyERC20() public {
        vm.prank(owner);
        token.mint(owner, 10_000e6);

        vm.prank(owner);
        token.transfer(stranger, 2_500e6);

        assertEq(token.balanceOf(stranger), 2_500e6);
        assertEq(token.balanceOf(owner), 7_500e6);
    }

    /// @dev A realistic salary must be representable without overflow concerns.
    function testFuzz_mintAndTransferArbitrarySalaries(uint96 salary) public {
        vm.assume(salary > 0);
        vm.prank(owner);
        token.mint(owner, salary);
        vm.prank(owner);
        token.transfer(stranger, salary);
        assertEq(token.balanceOf(stranger), salary);
    }
}
