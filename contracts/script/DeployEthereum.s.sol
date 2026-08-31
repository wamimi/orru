// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PayerAnchor} from "../src/ethereum/PayerAnchor.sol";
import {DemoPayroll} from "../src/ethereum/DemoPayroll.sol";

/// @dev Shared helpers. Deployment records go to deployments/<chainid>.json —
///      shell scrollback is not a deployment record.
abstract contract DeployBase is Script {
    function _record(string memory key, address value) internal {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");

        string memory existing = "{}";
        try vm.readFile(path) returns (string memory contents) {
            if (bytes(contents).length > 0) existing = contents;
        } catch {}

        // forge-std's serializeJson merges into an in-memory object keyed by id.
        string memory obj = "deployment";
        vm.serializeJson(obj, existing);
        string memory out = vm.serializeAddress(obj, key, value);

        vm.writeJson(out, path);
        console2.log("  recorded ->", path);
    }
}

/// @notice Deploys PayerAnchor on its own.
/// @dev Ethereum Sepolia only. Run once — this address is a trust root and every
///      AttestationRegistry pins it immutably, so redeploying invalidates the
///      registry and every commitment already accepted against it.
///
///      forge script script/DeployEthereum.s.sol:DeployPayerAnchor \
///        --rpc-url $SEPOLIA_RPC_URL --account cc3-deployer --broadcast
contract DeployPayerAnchor is DeployBase {
    function run() external returns (PayerAnchor payerAnchor) {
        vm.startBroadcast();
        payerAnchor = new PayerAnchor();
        vm.stopBroadcast();

        console2.log("");
        console2.log("=== PayerAnchor ===");
        console2.log("  chainid       ", block.chainid);
        console2.log("  address       ", address(payerAnchor));
        console2.log("  MAX_BATCH     ", payerAnchor.MAX_BATCH());
        _record("PayerAnchor", address(payerAnchor));

        console2.log("");
        console2.log("  Set PAYER_ANCHOR_ADDRESS to this before deploying DemoPayroll.");
        console2.log("  This is the TRUSTED_ANCHOR that AttestationRegistry pins immutably.");
    }
}

/// @notice Deploys DemoPayroll against an existing PayerAnchor.
/// @dev Reads from env:
///        USDC_ADDRESS          Circle testnet USDC. 6 decimals.
///        PAYER_ANCHOR_ADDRESS  The anchor, or 0x0 for cross-chain mode (Base Sepolia)
///        PAYROLL_OWNER         Owner — the keystore account
///        PAYROLL_KEEPER        Cron caller — a hot key, funded thinly
///        PERIOD_SECONDS        Optional, defaults to 4 hours
///
///      forge script script/DeployEthereum.s.sol:DeployDemoPayroll \
///        --rpc-url $SEPOLIA_RPC_URL --account cc3-deployer --broadcast
contract DeployDemoPayroll is DeployBase {
    function run() external returns (DemoPayroll payroll) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address payerAnchor = vm.envAddress("PAYER_ANCHOR_ADDRESS");
        address owner = vm.envAddress("PAYROLL_OWNER");
        address keeper = vm.envAddress("PAYROLL_KEEPER");
        uint256 periodSeconds = vm.envOr("PERIOD_SECONDS", uint256(4 hours));

        require(usdc != address(0), "USDC_ADDRESS is required");
        require(owner != address(0), "PAYROLL_OWNER is required");
        require(keeper != address(0), "PAYROLL_KEEPER is required");
        require(owner != keeper, "owner and keeper must differ: the keeper is a hot cron key");

        vm.startBroadcast();
        payroll = new DemoPayroll(IERC20(usdc), PayerAnchor(payerAnchor), owner, keeper, periodSeconds);
        vm.stopBroadcast();

        console2.log("");
        console2.log("=== DemoPayroll ===");
        console2.log("  chainid       ", block.chainid);
        console2.log("  address       ", address(payroll));
        console2.log("  usdc          ", usdc);
        console2.log("  anchor        ", payerAnchor);
        console2.log("  owner         ", owner);
        console2.log("  keeper        ", keeper);
        console2.log("  periodSeconds ", periodSeconds);
        console2.log("  firstPeriod   ", payroll.currentPeriod());
        _record("DemoPayroll", address(payroll));

        if (payerAnchor == address(0)) {
            console2.log("");
            console2.log("  CROSS-CHAIN MODE: no local anchoring.");
            console2.log("  Commitments are emitted in PaymentMade only. The payer must anchor");
            console2.log("  them on Ethereum Sepolia separately, or Creditcoin never sees them.");
        }

        console2.log("");
        console2.log("  NEXT, in order:");
        console2.log("   1. Transfer USDC to the DemoPayroll address (6 decimals!)");
        console2.log("   2. owner: addRecipient(worker, amountPerPeriod) for each worker");
        console2.log("   3. Fund the keeper with a little ETH for gas");
        console2.log("   4. START THE HOURLY CRON calling runPayroll()");
        console2.log("   5. Add this DemoPayroll address to AttestationRegistry.approvedPayer");
        console2.log("");
        console2.log("  History accrues in wall-clock time and cannot be backfilled.");
        console2.log("  Every hour the cron is not running is an hour that cannot be recovered.");
    }
}

/// @notice First-run convenience: PayerAnchor then DemoPayroll in one broadcast.
/// @dev Ethereum Sepolia. Reads the same env as DeployDemoPayroll except
///      PAYER_ANCHOR_ADDRESS, which it produces.
///
///      forge script script/DeployEthereum.s.sol:DeployEthereum \
///        --rpc-url $SEPOLIA_RPC_URL --account cc3-deployer --broadcast
contract DeployEthereum is DeployBase {
    function run() external returns (PayerAnchor payerAnchor, DemoPayroll payroll) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address owner = vm.envAddress("PAYROLL_OWNER");
        address keeper = vm.envAddress("PAYROLL_KEEPER");
        uint256 periodSeconds = vm.envOr("PERIOD_SECONDS", uint256(4 hours));

        require(usdc != address(0), "USDC_ADDRESS is required");
        require(owner != address(0), "PAYROLL_OWNER is required");
        require(keeper != address(0), "PAYROLL_KEEPER is required");
        require(owner != keeper, "owner and keeper must differ: the keeper is a hot cron key");

        vm.startBroadcast();
        payerAnchor = new PayerAnchor();
        payroll = new DemoPayroll(IERC20(usdc), payerAnchor, owner, keeper, periodSeconds);
        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Orru / Ethereum ===");
        console2.log("  chainid       ", block.chainid);
        console2.log("  PayerAnchor   ", address(payerAnchor));
        console2.log("  DemoPayroll   ", address(payroll));
        console2.log("  usdc          ", usdc);
        console2.log("  owner         ", owner);
        console2.log("  keeper        ", keeper);
        console2.log("  periodSeconds ", periodSeconds);

        _record("PayerAnchor", address(payerAnchor));
        _record("DemoPayroll", address(payroll));

        console2.log("");
        console2.log("  .env additions:");
        console2.log("    PAYER_ANCHOR_ADDRESS=", address(payerAnchor));
        console2.log("    DEMO_PAYROLL_ADDRESS=", address(payroll));
        console2.log("");
        console2.log("  NEXT, in order:");
        console2.log("   1. Transfer USDC to the DemoPayroll address (6 decimals!)");
        console2.log("   2. owner: addRecipient(worker, amountPerPeriod) for each worker");
        console2.log("   3. Fund the keeper with a little ETH for gas");
        console2.log("   4. START THE HOURLY CRON calling runPayroll()");
        console2.log("");
        console2.log("  History accrues in wall-clock time and cannot be backfilled.");
    }
}
