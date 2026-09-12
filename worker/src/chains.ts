import { createPublicClient, defineChain, http, type PublicClient } from "viem"
import { sepolia } from "viem/chains"
import { config } from "./config.js"

export const creditcoinTestnet = defineChain({
  id: 102031,
  name: "Creditcoin Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://creditcoin-testnet.blockscout.com" },
  },
  testnet: true,
})

export function sourceClient(): PublicClient {
  return createPublicClient({ chain: sepolia, transport: http(config().sepoliaRpcUrl) }) as PublicClient
}

export function creditcoinClient(): PublicClient {
  const c = config()
  return createPublicClient({
    chain: { ...creditcoinTestnet, id: c.creditcoinChainId },
    transport: http(c.creditcoinRpcUrl),
  }) as PublicClient
}
