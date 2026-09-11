"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowSquareOut } from "@phosphor-icons/react";
import { isAddress } from "viem";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { useFlowSession } from "@/components/app/useFlowSession";
import { Button, ButtonLink } from "@/components/ui/Button";
import { sepoliaTxUrl, truncateHex } from "@/lib/chain";

type Status = {
  address: `0x${string}`;
  anchored: boolean;
  attested: boolean;
  ready: boolean;
  /** Broadcast, not yet mined. */
  pending?: boolean;
};

/** The relayer runs on a schedule. */
const POLL_MS = 15_000;

export function FaucetScreen() {
  const { session, ready } = useFlowSession();
  const [typed, setTyped] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const address = typed ?? (ready ? (session.address ?? "") : "");

  const token = session.sessionToken;
  const check = useCallback(
    async (target: string) => {
    try {
      const response = await fetch(`/api/faucet/status/${target}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) return;
      setStatus((await response.json()) as Status);
    } catch {
      /* a missed poll is retried on the next tick */
    }
    },
    [token],
  );

  // `anchored` reads false until the transaction mines, so a txHash is the
  // signal to start watching.
  const watching = Boolean(status && !status.attested && (status.anchored || txHash));

  useEffect(() => {
    if (!watching || !status) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    const target = status.address;
    timer.current = setInterval(() => void check(target), POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [watching, status, check]);

  async function onClaim() {
    setError(null);
    if (!isAddress(address)) {
      setError("That does not look like a wallet address.");
      return;
    }
    setWorking(true);
    try {
      const response = await fetch("/api/faucet/claim", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ address }),
      });
      const body = (await response.json()) as Status & { txHash?: string; error?: string };
      if (!response.ok) {
        setError(body.error ?? "That could not be sent. Try again in a moment.");
        return;
      }
      setStatus(body);
      if (body.txHash) setTxHash(body.txHash);
    } catch {
      setError("That could not be sent. Try again in a moment.");
    } finally {
      setWorking(false);
    }
  }

  const confirming = watching;

  return (
    <ScreenFrame
      kicker="Try it"
      title="Give this wallet an income history."
      lede="Orru needs three pay cycles from a verified employer before it can prove anything. This pays a demo wallet on a test network so you can walk the whole journey with your own address."
    >
      <div className="max-w-xl">
        <label className="eyebrow block text-ink-faint" htmlFor="faucet-address">
          Wallet address
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            id="faucet-address"
            value={address}
            spellCheck={false}
            autoComplete="off"
            placeholder="0x…"
            disabled={working || Boolean(status?.anchored)}
            onChange={(event) => setTyped(event.target.value.trim())}
            className="min-h-12 flex-1 rounded-control border border-rule bg-canvas px-4 font-mono text-sm text-ink outline-none transition-tone focus:border-brand disabled:opacity-60"
          />
          <Button
            onClick={() => void onClaim()}
            disabled={working || Boolean(status?.anchored)}
          >
            {working ? "Sending…" : "Pay this wallet"}
          </Button>
        </div>

        {error ? (
          <div className="mt-6">
            <Callout tone="error" title="That did not go through" body={error} />
          </div>
        ) : null}

        {confirming ? (
          <div className="mt-8">
            <Callout
              tone="info"
              title={
                status?.anchored
                  ? "Confirming your payments against the chain"
                  : "Recording your payments on Ethereum"
              }
              body={
                status?.anchored
                  ? "Three payments are on Ethereum. Creditcoin is now verifying them for itself, which usually takes a few minutes. You can leave this page open."
                  : "The payments have been sent and are waiting for a block. This page keeps watching."
              }
            >
              {txHash ? (
                <a
                  href={sepoliaTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="meta mt-4 inline-flex items-center gap-1.5 text-brand hover:text-brand-hover"
                >
                  See the payments on Ethereum · {truncateHex(txHash)}
                  <ArrowSquareOut size={14} />
                </a>
              ) : null}
            </Callout>
          </div>
        ) : null}

        {status?.attested ? (
          <div className="mt-8">
            <Callout
              tone="info"
              title="This wallet has an income history"
              body="Three confirmed pay cycles from a verified employer. Connect that wallet and Orru will read them."
            >
              <div className="mt-5">
                <ButtonLink href="/connect">
                  Connect and check your income
                  <ArrowRight size={18} />
                </ButtonLink>
              </div>
            </Callout>
          </div>
        ) : null}

        <ol className="mt-14 border-t border-rule">
          {[
            ["Paid", "A verified employer records three payments to your address."],
            ["Confirmed", "Creditcoin checks those payments against Ethereum itself."],
            ["Proved", "Your browser proves the range without revealing the amounts."],
            ["Borrowed", "Draw against it, with nothing locked as collateral."],
          ].map(([title, body], index) => (
            <li key={title} className="grid gap-1 border-b border-rule py-4 md:grid-cols-[8rem_minmax(0,1fr)] md:gap-6">
              <span className="meta text-brand">
                {String(index + 1).padStart(2, "0")} · {title}
              </span>
              <span className="text-[0.9375rem] leading-relaxed text-ink-soft">{body}</span>
            </li>
          ))}
        </ol>

        <p className="mt-8 text-sm leading-relaxed text-ink-faint">
          Everything here runs on test networks. The money is not real and the
          wallet you name is only ever paid, never charged.
        </p>
      </div>
    </ScreenFrame>
  );
}
