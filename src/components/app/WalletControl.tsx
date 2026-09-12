"use client";

import { useEffect, useState } from "react";
import {
  useLogin,
  usePrivy,
  useSignMessage,
  useWallets,
} from "@privy-io/react-auth";
import { Check, SignOut, Wallet } from "@phosphor-icons/react";
import { useFlowSession } from "@/components/app/useFlowSession";
import { truncateAddress } from "@/lib/app";

const privyConfigured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export function WalletControl() {
  if (!privyConfigured) {
    return (
      <span className="wallet-control wallet-control--disabled">
        Preview mode
      </span>
    );
  }
  return <LiveWalletControl />;
}

function LiveWalletControl() {
  const { session, update, clear } = useFlowSession();
  const { ready, authenticated, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const [working, setWorking] = useState<"idle" | "connecting" | "signing">("idle");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useLogin({
    onComplete: () => setWorking("idle"),
    onError: () => {
      setWorking("idle");
      setError("Wallet connection was not completed.");
    },
  });

  const wallet = wallets.find((item) => item.address);
  const address = wallet?.address ?? user?.wallet?.address ?? session.address;

  useEffect(() => {
    if (!ready || !authenticated || !address) return;
    if (
      session.connected &&
      session.address?.toLowerCase() === address.toLowerCase()
    ) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      update({
        address,
        connected: true,
        signed:
          session.address?.toLowerCase() === address.toLowerCase()
            ? session.signed
            : false,
        income:
          session.address?.toLowerCase() === address.toLowerCase()
            ? session.income
            : null,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    address,
    authenticated,
    ready,
    session.address,
    session.connected,
    session.income,
    session.signed,
    update,
  ]);

  async function connect() {
    setError(null);
    setWorking("connecting");
    login({ loginMethods: ["wallet"] });
  }

  async function verifyOwnership() {
    if (!address) return;
    setError(null);
    setWorking("signing");
    try {
      const challengeResponse = await fetch(
        `/api/auth/challenge?address=${address}`,
      );
      const challenge = (await challengeResponse.json()) as {
        message?: string;
        challenge?: string;
        error?: string;
      };
      if (
        !challengeResponse.ok ||
        !challenge.message ||
        !challenge.challenge
      ) {
        throw new Error(challenge.error ?? "Could not prepare the ownership check.");
      }

      const { signature } = await signMessage(
        { message: challenge.message },
        {
          address,
          uiOptions: { title: "Confirm this payout account" },
        },
      );
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address,
          signature,
          challenge: challenge.challenge,
        }),
      });
      const verified = (await verifyResponse.json()) as {
        sessionToken?: string;
        error?: string;
      };
      if (!verifyResponse.ok || !verified.sessionToken) {
        throw new Error(verified.error ?? "The ownership check did not complete.");
      }
      update({
        address,
        connected: true,
        signed: true,
        sessionToken: verified.sessionToken,
        income: null,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The ownership check did not complete.",
      );
    } finally {
      setWorking("idle");
    }
  }

  async function disconnect() {
    setOpen(false);
    try {
      await logout();
    } catch {
      /* session is still cleared locally */
    }
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* session is still cleared locally */
    }
    clear();
  }

  if (!ready) {
    return <span className="wallet-control wallet-control--disabled">Loading…</span>;
  }

  if (!authenticated || !address) {
    return (
      <div className="wallet-control-wrap">
        <button
          type="button"
          className="wallet-control"
          onClick={() => void connect()}
          disabled={working !== "idle"}
        >
          <Wallet size={16} />
          {working === "connecting" ? "Connecting…" : "Connect wallet"}
        </button>
        {error ? <p className="wallet-control__error">{error}</p> : null}
      </div>
    );
  }

  if (!session.signed) {
    return (
      <div className="wallet-control-wrap">
        <button
          type="button"
          className="wallet-control wallet-control--verify"
          onClick={() => void verifyOwnership()}
          disabled={working !== "idle"}
        >
          <Wallet size={16} />
          {working === "signing" ? "Waiting for signature…" : "Verify wallet"}
        </button>
        {error ? <p className="wallet-control__error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="wallet-control-wrap">
      <button
        type="button"
        className="wallet-control wallet-control--connected"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="wallet-control__dot" />
        <span>{truncateAddress(address)}</span>
        <Check size={14} weight="bold" />
      </button>
      {open ? (
        <div className="wallet-control__menu">
          <p>Connected payout account</p>
          <button type="button" onClick={() => void disconnect()}>
            <SignOut size={15} />
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
