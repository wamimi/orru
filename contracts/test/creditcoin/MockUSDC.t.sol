// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MockUSDC} from "../../src/creditcoin/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC internal token;
    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        token = new MockUSDC(owner);
    }

    /// @dev Six, matching the source-chain token and the band table. Eighteen
    ///      would silently misprice every limit in the credit pool.
    function test_hasSixDecimals() public view {
        assertEq(token.decimals(), 6);
        assertEq(token.symbol(), "mUSDC");
    }

    function test_ownerCanMint() public {
        vm.prank(owner);
        token.mint(stranger, 2_500e6);
        assertEq(token.balanceOf(stranger), 2_500e6);
    }

    function test_strangerCannotMint() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        token.mint(stranger, 1e6);
    }

    function test_mintRejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(MockUSDC.ZeroAddress.selector);
        token.mint(address(0), 1e6);
    }

    function test_constructorRejectsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new MockUSDC(address(0));
    }

    function testFuzz_transfersArbitraryAmounts(uint96 amount) public {
        vm.assume(amount > 0);
        vm.prank(owner);
        token.mint(owner, amount);
        vm.prank(owner);
        token.transfer(stranger, amount);
        assertEq(token.balanceOf(stranger), amount);
    }
}
