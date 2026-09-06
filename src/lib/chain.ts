import { defineChain } from "viem";
import creditcoinDeployments from "../../contracts/deployments/102031.json";
import sepoliaDeployments from "../../contracts/deployments/11155111.json";

export const CREDITCOIN_ID = 102031 as const;
export const SEPOLIA_ID = 11155111 as const;

export const ADDRESSES = {
  [CREDITCOIN_ID]: {
    credentialRegistry: creditcoinDeployments.CredentialRegistry as `0x${string}`,
    attestationRegistry: creditcoinDeployments.AttestationRegistry as `0x${string}`,
    creditPool: creditcoinDeployments.DemoCreditPool as `0x${string}`,
    settlementToken: creditcoinDeployments.mUSDC as `0x${string}`,
    verifier: creditcoinDeployments.IncomeVerifier as `0x${string}`,
    nullifierRegistry: creditcoinDeployments.NullifierRegistry as `0x${string}`,
  },
  [SEPOLIA_ID]: {
    payerAnchor: sepoliaDeployments.PayerAnchor as `0x${string}`,
    demoPayroll: sepoliaDeployments.DemoPayroll as `0x${string}`,
    paymentToken: sepoliaDeployments.DemoUSDC as `0x${string}`,
  },
} as const;

/** Both dUSD (Sepolia) and mUSDC (Creditcoin) use six decimals. */
export const TOKEN_DECIMALS = 6;
export const usdcDecimals = TOKEN_DECIMALS;

export const creditcoin = defineChain({
  id: CREDITCOIN_ID,
  name: "Creditcoin Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://creditcoin-testnet.blockscout.com",
    },
  },
  testnet: true,
});

export const creditcoinTestnet = creditcoin;

export const sepoliaChainId = SEPOLIA_ID;

export const sepoliaAddresses = {
  DemoPayroll: ADDRESSES[SEPOLIA_ID].demoPayroll,
  PayerAnchor: ADDRESSES[SEPOLIA_ID].payerAnchor,
};

export function sepoliaTxUrl(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

export function creditcoinTxUrl(hash: string): string {
  return `https://creditcoin-testnet.blockscout.com/tx/${hash}`;
}

export function creditcoinAddressUrl(address: string): string {
  return `https://creditcoin-testnet.blockscout.com/address/${address}`;
}

export function truncateHex(value: string): string {
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
