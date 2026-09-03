import deployments from "../../contracts/deployments/11155111.json";

export const sepoliaChainId = 11155111;

export const sepoliaAddresses = {
  DemoPayroll: deployments.DemoPayroll as `0x${string}`,
  PayerAnchor: deployments.PayerAnchor as `0x${string}`,
};

export const creditcoinTestnet = {
  id: 102031,
  name: "Creditcoin Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://creditcoin-testnet.blockscout.com",
    },
  },
} as const;

export const usdcDecimals = 6;

export function sepoliaTxUrl(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

export function creditcoinTxUrl(hash: string): string {
  return `https://creditcoin-testnet.blockscout.com/tx/${hash}`;
}
