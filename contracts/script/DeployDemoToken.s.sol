// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DemoUSDC} from "../src/ethereum/DemoUSDC.sol";
import {DemoPayroll} from "../src/ethereum/DemoPayroll.sol";
import {PayerAnchor} from "../src/ethereum/PayerAnchor.sol";

/// @notice Deploys DemoUSDC and a fresh DemoPayroll wired to it, reusing the
///         existing PayerAnchor.
/// @dev `DemoPayroll.usdc` is immutable, so switching the payment token means a
///      new payroll. PayerAnchor never references the token and is deliberately
///      NOT redeployed — it is a trust root and the registry pins it.
///
///      Reads from env: PAYER_ANCHOR_ADDRESS, PAYROLL_OWNER, PAYROLL_KEEPER,
///      PERIOD_SECONDS (optional), MINT_AMOUNT (optional).
///
///      forge script script/DeployDemoToken.s.sol:DeployDemoToken \
///        --rpc-url sepolia --account cc3-deployer --broadcast --verify
contract DeployDemoToken is Script {
    function run() external returns (DemoUSDC token, DemoPayroll payroll) {
        address payerAnchor = vm.envAddress("PAYER_ANCHOR_ADDRESS");
        address owner = vm.envAddress("PAYROLL_OWNER");
        address keeper = vm.envAddress("PAYROLL_KEEPER");
        uint256 periodSeconds = vm.envOr("PERIOD_SECONDS", uint256(4 hours));

        // Enough for ~60 pay cycles across three workers at demo salaries, with
        // a wide margin. Minting is free; running dry costs periods.
        uint256 mintAmount = vm.envOr("MINT_AMOUNT", uint256(1_000_000e6));

        require(payerAnchor != address(0), "PAYER_ANCHOR_ADDRESS is required");
        require(owner != address(0), "PAYROLL_OWNER is required");
        require(keeper != address(0), "PAYROLL_KEEPER is required");
        require(owner != keeper, "owner and keeper must differ: the keeper is a hot cron key");

        vm.startBroadcast();
        token = new DemoUSDC(owner);
        payroll = new DemoPayroll(IERC20(address(token)), PayerAnchor(payerAnchor), owner, keeper, periodSeconds);
        token.mint(address(payroll), mintAmount);
        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Orru / Sepolia demo token ===");
        console2.log("  DemoUSDC       ", address(token));
        console2.log("  DemoPayroll    ", address(payroll));
        console2.log("  PayerAnchor    ", payerAnchor, "(reused, not redeployed)");
        console2.log("  minted to payroll", token.balanceOf(address(payroll)) / 1e6, "dUSD");
        console2.log("  periodSeconds  ", periodSeconds);
        console2.log("  firstDuePeriod ", payroll.nextDuePeriod());

        console2.log("");
        console2.log("  .env additions:");
        console2.log("    USDC_ADDRESS=", address(token));
        console2.log("    DEMO_PAYROLL_ADDRESS=", address(payroll));

        console2.log("");
        console2.log("  NEXT:");
        console2.log("   1. Update USDC_ADDRESS and DEMO_PAYROLL_ADDRESS in contracts/.env");
        console2.log("   2. Update the DEMO_PAYROLL_ADDRESS GitHub secret, or the cron pays the OLD payroll");
        console2.log("   3. addRecipient() each worker at their pay-cycle salary (six decimals)");
        console2.log("   4. Wait one period, then the cron settles the first one");
    }
}
