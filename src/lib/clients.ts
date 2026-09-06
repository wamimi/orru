import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { creditcoin } from "@/lib/chain";

export { creditcoin };

function creditcoinRpc(): string {
  return process.env.CREDITCOIN_RPC_URL || creditcoin.rpcUrls.default.http[0];
}

function sepoliaRpc(): string {
  return process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
}

export const creditcoinClient = createPublicClient({
  chain: creditcoin,
  transport: http(creditcoinRpc()),
});

export const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(sepoliaRpc()),
});
