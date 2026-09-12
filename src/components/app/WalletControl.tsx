"use client";

import { useEffect, useState } from "react";
import {
  useLogin,
  useLogout,
  useModalStatus,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { UserPill } from "@privy-io/react-auth/ui";
import { Wallet } from "@phosphor-icons/react";
import { useFlowSession } from "@/components/app/useFlowSession";
import { useLinkedWallet } from "@/components/app/useLinkedWallet";
import { truncateAddress } from "@/lib/app";
import { forgetSite, signMessageWith, signingProblem, withLimit } from "@/lib/wallet-sign";

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
  const { ready, authenticated, logout } = usePrivy();
  const { wallets } = useWallets();
  const { wallet, ready: walletsReady } = useLinkedWallet();
  const { isOpen: modalOpen } = useModalStatus();
  const [working, setWorking] = useState<"idle" | "connecting" | "signing">("idle");
  const [error, setError] = useState<string | null>(null);
  // A login restored by the wallet library is not adopted on its own; the
  // user connects in this tab, or continues a session this tab already has.
  const [chosen, setChosen] = useState(false);
  const { login } = useLogin({
    onComplete: ({ wasAlreadyAuthenticated }) => {
      setWorking("idle");
      if (wasAlreadyAuthenticated) {
        setError("Still signed in to the previous wallet. Reload the page and try again.");
        return;
      }
      setChosen(true);
    },
    onError: () => {
      setWorking("idle");
      setError("Wallet connection was not completed.");
    },
  });

  const address = wallet?.address ?? null;
  const live = ready && authenticated && address !== null && (chosen || session.connected);

  // Privy's account pill logs the user out itself; keep the Orru session in step.
  useLogout({
    onSuccess: () => {
      setChosen(false);
      void Promise.all(wallets.map(forgetSite)).catch(() => {
        /* cleared locally regardless */
      });
      void fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      }).catch(() => {
        /* session is still cleared locally */
      });
      clear();
    },
  });

  useEffect(() => {
    if (!live || !address) return;
    const same = session.address?.toLowerCase() === address.toLowerCase();
    if (session.connected && same) return;
    const frame = requestAnimationFrame(() => {
      update({
        address,
        connected: true,
        signed: same ? session.signed : false,
        sessionToken: same ? session.sessionToken : null,
        income: same ? session.income : null,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    live,
    address,
    session.address,
    session.connected,
    session.income,
    session.sessionToken,
    session.signed,
    update,
  ]);

  // A stored login that no longer matches this tab's session, or a session
  // whose wallet is gone, is dropped so no screen shows a stale address.
  useEffect(() => {
    if (!ready || !session.connected) return;
    if (!authenticated) {
      clear();
      return;
    }
    if (!walletsReady || wallet) return;
    const timer = setTimeout(() => clear(), 4_000);
    return () => clearTimeout(timer);
  }, [ready, authenticated, walletsReady, wallet, session.connected, clear]);

  // The wallet library opens no modal while a stored login is still being
  // torn down; a connect that shows nothing is reset instead of spinning.
  useEffect(() => {
    if (working !== "connecting" || modalOpen) return;
    const timer = setTimeout(() => {
      setWorking("idle");
      setError("The wallet picker did not open. Try again.");
    }, 8_000);
    return () => clearTimeout(timer);
  }, [working, modalOpen]);

  // Forgets the site in every connected wallet, so the next connection asks
  // which account to use instead of reusing the last one. Bounded: a wallet
  // that never answers must not block the next step.
  async function forget() {
    await Promise.all(wallets.map(forgetSite));
    try {
      await withLimit(logout(), 3_000, undefined);
    } catch {
      /* cleared locally regardless */
    }
  }

  async function connect() {
    setError(null);
    setWorking("connecting");
    if (authenticated) await forget();
    try {
      login({ loginMethods: ["wallet"] });
    } catch {
      setWorking("idle");
      setError("Wallet connection was not completed.");
    }
  }

  async function verifyOwnership() {
    if (!wallet) return;
    setError(null);
    setWorking("signing");
    try {
      const challengeResponse = await fetch(
        `/api/auth/challenge?address=${wallet.address}`,
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

      const signature = await signMessageWith(wallet, challenge.message);
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address: wallet.address,
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
        address: wallet.address,
        connected: true,
        signed: true,
        sessionToken: verified.sessionToken,
        income: null,
      });
    } catch (cause) {
      setError(signingProblem(cause));
    } finally {
      setWorking("idle");
    }
  }

  if (!ready) {
    return <span className="wallet-control wallet-control--disabled">Loading…</span>;
  }

  if (!live) {
    const switched =
      authenticated && walletsReady && !wallet && session.connected && session.address;
    return (
      <div className="wallet-control-wrap">
        <button
          type="button"
          className="wallet-control"
          onClick={() => void connect()}
          disabled={working !== "idle"}
        >
          <Wallet size={16} />
          {working === "connecting"
            ? "Connecting…"
            : switched
              ? "Reconnect wallet"
              : "Connect wallet"}
        </button>
        {error ? (
          <p className="wallet-control__error">{error}</p>
        ) : switched ? (
          <p className="wallet-control__error">
            Your wallet no longer shows {truncateAddress(session.address as string)}.
            Reconnect and choose the account to use.
          </p>
        ) : null}
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
    <div className="wallet-control-wrap wallet-control-wrap--pill">
      <UserPill
        size={40}
        ui={{ background: "secondary" }}
        action={{ type: "login", options: { loginMethods: ["wallet"] } }}
        label={
          <span className="wallet-control__pill-label">
            <span className="wallet-control__dot" />
            {truncateAddress(address as string)}
          </span>
        }
      />
    </div>
  );
}
