import { createWalletClient, http, type Account, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { creditcoin } from "@/lib/chain";

let cached: Account | null = null;

export function relayerAccount(): Account {
  if (cached) return cached;
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!key) {
    throw new Error("RELAYER_PRIVATE_KEY is not set");
  }
  cached = privateKeyToAccount(key);
  return cached;
}

export function relayerWallet() {
  return createWalletClient({
    account: relayerAccount(),
    chain: creditcoin,
    transport: http(
      process.env.CREDITCOIN_RPC_URL ||
        "https://rpc.cc3-testnet.creditcoin.network",
    ),
  });
}

export function relayerConfigured(): boolean {
  return Boolean(process.env.RELAYER_PRIVATE_KEY);
}
