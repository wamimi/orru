"use client";

import { usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";

/**
 * The connected wallet that belongs to the signed-in user. Null while the
 * extension shows a different account, or is locked.
 */
export function useLinkedWallet(): { wallet: ConnectedWallet | null; ready: boolean } {
  const { user } = usePrivy();
  const { wallets, ready } = useWallets();
  const login = user?.wallet?.address.toLowerCase();
  const wallet =
    wallets.find((item) => item.linked) ??
    wallets.find((item) => item.address.toLowerCase() === login) ??
    null;
  return { wallet, ready };
}
