// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {NullifierRegistry} from "../../src/creditcoin/NullifierRegistry.sol";

contract NullifierRegistryTest is Test {
    NullifierRegistry internal registry;

    address internal owner = makeAddr("owner");
    address internal consumer = makeAddr("consumer");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant N = keccak256("nullifier");

    function setUp() public {
        registry = new NullifierRegistry(owner);
        vm.prank(owner);
        registry.setAuthorized(consumer, true);
    }

    function test_authorizedConsumerCanSpend() public {
        vm.prank(consumer);
        registry.markSpent(N);
        assertTrue(registry.spent(N));
    }

    /// @dev One claim per period. The whole replay defence rests on this.
    function test_rejectsAReplay() public {
        vm.prank(consumer);
        registry.markSpent(N);

        vm.prank(consumer);
        vm.expectRevert(abi.encodeWithSelector(NullifierRegistry.AlreadySpent.selector, N));
        registry.markSpent(N);
    }

    /// @dev The spent set is global, so a second consumer cannot re-spend.
    function test_rejectsAReplayFromADifferentConsumer() public {
        address other = makeAddr("other");
        vm.prank(owner);
        registry.setAuthorized(other, true);

        vm.prank(consumer);
        registry.markSpent(N);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(NullifierRegistry.AlreadySpent.selector, N));
        registry.markSpent(N);
    }

    function test_rejectsAnUnauthorizedCaller() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(NullifierRegistry.NotAuthorized.selector, stranger));
        registry.markSpent(N);
        assertFalse(registry.spent(N));
    }

    function test_revokingAuthorizationStopsFurtherSpending() public {
        vm.prank(owner);
        registry.setAuthorized(consumer, false);

        vm.prank(consumer);
        vm.expectRevert(abi.encodeWithSelector(NullifierRegistry.NotAuthorized.selector, consumer));
        registry.markSpent(N);
    }

    function test_onlyOwnerAuthorizes() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.setAuthorized(stranger, true);
    }

    function test_rejectsZeroAddressConsumer() public {
        vm.prank(owner);
        vm.expectRevert(NullifierRegistry.ZeroAddress.selector);
        registry.setAuthorized(address(0), true);
    }

    function testFuzz_distinctNullifiersDoNotCollide(bytes32 a, bytes32 b) public {
        vm.assume(a != b);
        vm.startPrank(consumer);
        registry.markSpent(a);
        registry.markSpent(b);
        vm.stopPrank();
        assertTrue(registry.spent(a));
        assertTrue(registry.spent(b));
    }
}
