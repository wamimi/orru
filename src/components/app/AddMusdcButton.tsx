"use client";

import { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { Check, Coins } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import {
  CREDITCOIN_WALLET_CHAIN,
  MUSDC,
  MUSDC_WATCH_ASSET,
} from "@/lib/musdc";

type WalletProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

async function ensureCreditcoin(provider: WalletProvider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CREDITCOIN_WALLET_CHAIN.chainId }],
    });
  } catch {
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [CREDITCOIN_WALLET_CHAIN],
      });
    } catch {
      /* still try to add the asset */
    }
  }
}

async function watchMusdc(provider: WalletProvider) {
  return provider.request({
    method: "wallet_watchAsset",
    params: MUSDC_WATCH_ASSET,
  });
}

type Variant = "solid" | "outline" | "quiet";

const privyConfigured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export function AddMusdcButton({
  variant = "outline",
}: {
  variant?: Variant;
}) {
  if (!privyConfigured) {
    return <AddMusdcFallback variant={variant} />;
  }
  return <LiveAddMusdcButton variant={variant} />;
}

function LiveAddMusdcButton({ variant }: { variant: Variant }) {
  const { wallets } = useWallets();
  const [state, setState] = useState<"idle" | "working" | "added" | "error">(
    "idle",
  );
  const wallet = wallets.find((item) => item.address);

  async function onAdd() {
    setState("working");
    try {
      if (wallet) {
        try {
          await wallet.switchChain(MUSDC.chainId);
        } catch {
          /* still try to add the asset */
        }
        const provider = (await wallet.getEthereumProvider()) as WalletProvider;
        await ensureCreditcoin(provider);
        const added = await watchMusdc(provider);
        setState(added === false ? "error" : "added");
        return;
      }

      const injected = (
        window as unknown as { ethereum?: WalletProvider }
      ).ethereum;
      if (!injected) {
        setState("error");
        return;
      }
      await ensureCreditcoin(injected);
      const added = await watchMusdc(injected);
      setState(added === false ? "error" : "added");
    } catch {
      setState("error");
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant={variant}
        onClick={() => void onAdd()}
        disabled={state === "working"}
      >
        {state === "added" ? <Check size={18} weight="bold" /> : <Coins size={18} />}
        {state === "working"
          ? "Waiting for wallet…"
          : state === "added"
            ? "mUSDC is in this wallet"
            : "Show mUSDC in this wallet"}
      </Button>
      {state === "error" ? (
        <p className="meta mt-3 text-[color:var(--ev-failed-fg)]">
          The wallet did not add mUSDC. Add it from the wallet token list on
          Creditcoin testnet if you want to see the balance.
        </p>
      ) : null}
    </div>
  );
}

function AddMusdcFallback({ variant }: { variant: Variant }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(MUSDC.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant={variant} onClick={() => void onCopy()}>
      {copied ? <Check size={18} weight="bold" /> : <Coins size={18} />}
      {copied ? "Address copied" : "Copy the mUSDC address"}
    </Button>
  );
}
