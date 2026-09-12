"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowSquareOut, Drop } from "@phosphor-icons/react";
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
  progress?: {
    phase: "ethereum" | "attestcoin" | "relayer" | "ready";
    sourceBlock: string | null;
    targetBlock: string | null;
    latestAttestedBlock: string | null;
    blocksRemaining: string | null;
  };
  /** Broadcast, not yet mined. */
  pending?: boolean;
};

/** The relayer runs on a schedule. */
const POLL_MS = 15_000;

export function FaucetScreen() {
  const { session, ready, update } = useFlowSession();
  const [typed, setTyped] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const address = typed ?? (ready ? (session.address ?? "") : "");
  const txHash =
    session.faucetAddress?.toLowerCase() === address.toLowerCase()
      ? session.faucetTxHash
      : null;

  const token = session.sessionToken;
  const check = useCallback(
    async (target: string, sourceTx?: string) => {
      try {
        const query = sourceTx
          ? `?txHash=${encodeURIComponent(sourceTx)}`
          : "";
        const response = await fetch(`/api/faucet/status/${target}${query}`, {
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

  useEffect(() => {
    if (!ready || !token || !isAddress(address)) return;
    const frame = requestAnimationFrame(() => {
      void check(address, txHash ?? undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, token, address, txHash, check]);

  // `anchored` reads false until the transaction mines, so a txHash is the
  // signal to start watching.
  const watching = Boolean(status && !status.attested && (status.anchored || txHash));

  useEffect(() => {
    if (!watching || !status) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    const target = status.address;
    timer.current = setInterval(
      () => void check(target, txHash ?? undefined),
      POLL_MS,
    );
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [watching, status, check, txHash]);

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
      if (body.txHash) {
        update({
          faucetAddress: body.address,
          faucetTxHash: body.txHash,
        });
      }
    } catch {
      setError("That could not be sent. Try again in a moment.");
    } finally {
      setWorking(false);
    }
  }

  const confirming = watching;
  const progressPhase = status?.progress?.phase;
  const completedStages = status?.attested
    ? 4
    : progressPhase === "relayer"
      ? 3
      : status?.anchored
        ? 2
        : txHash
          ? 1
          : 0;
  const progressStages = [
    "Sent to Ethereum",
    "Ethereum confirmed",
    "Attestcoin covered",
    "Creditcoin accepted",
  ];

  let progressDetail = status?.anchored
    ? "Waiting for Attestcoin's next published block update."
    : "Ethereum is confirming the transaction.";
  if (progressPhase === "attestcoin") {
    const latest = status?.progress?.latestAttestedBlock;
    const target = status?.progress?.targetBlock;
    const remaining = status?.progress?.blocksRemaining;
    progressDetail =
      latest && target && remaining
        ? `Attestcoin has reached Ethereum block ${formatBlock(latest)}. It needs block ${formatBlock(target)} for this history. ${formatBlock(remaining)} blocks remain.`
        : "Waiting for Attestcoin's next published block update.";
  } else if (progressPhase === "relayer") {
    progressDetail =
      "Attestcoin now covers this record. Orru checks for completed records every five minutes.";
  }

  return (
    <ScreenFrame
      kicker="Demo faucet"
      title="Give any wallet a demo income history."
      lede="Use a wallet you control. It signs once and pays nothing. Orru covers the Sepolia and Creditcoin network costs."
    >
      <div className="max-w-xl">
        <dl className="mb-10 grid gap-6 border-y border-rule py-5 sm:grid-cols-2">
          <div>
            <dt className="eyebrow text-ink-faint">Wallet cost</dt>
            <dd className="mt-2 text-base font-medium text-ink">No ETH or CTC</dd>
          </div>
          <div>
            <dt className="eyebrow text-ink-faint">Typical wait</dt>
            <dd className="mt-2 text-base font-medium text-ink">10 to 15 minutes</dd>
          </div>
        </dl>

        {ready && !token ? (
          <div className="mb-10">
            <Callout
              tone="empty"
              title="Connect the wallet first"
              body="The demo pays the wallet you signed in with. Connect it, sign the short message, then come back here."
              actionLabel="Connect a wallet"
              actionHref="/connect"
            />
          </div>
        ) : null}

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
            disabled={!token || working || Boolean(status?.anchored)}
            onChange={(event) => setTyped(event.target.value.trim())}
            className="min-h-12 flex-1 rounded-control border border-rule bg-canvas px-4 font-mono text-sm text-ink outline-none transition-tone focus:border-brand disabled:opacity-60"
          />
          <Button
            onClick={() => void onClaim()}
            disabled={!token || working || Boolean(status?.anchored)}
          >
            <Drop size={18} weight="fill" aria-hidden="true" />
            {working ? "Creating…" : "Create demo history"}
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
                  ? "Creditcoin is confirming your history"
                  : "Creating your history on Ethereum"
              }
              body={
                status?.anchored
                  ? "Attestcoin waits for later Ethereum blocks so it can verify the record in context. This usually takes 10 to 15 minutes."
                  : "Orru sent one record containing three demo pay cycles and covered the network cost. Ethereum is waiting to confirm it."
              }
            >
              <ol
                className="mt-5 grid gap-3 sm:grid-cols-4"
                aria-label="Demo history progress"
              >
                {progressStages.map((label, index) => {
                  const done = index < completedStages;
                  const active = index === completedStages;
                  return (
                    <li
                      key={label}
                      className={`border-t-2 pt-3 ${
                        done || active
                          ? "border-brand text-ink"
                          : "border-rule text-ink-faint"
                      }`}
                      aria-current={active ? "step" : undefined}
                    >
                      <span className="meta block text-brand">
                        {done ? "Done" : active ? "Now" : "Waiting"}
                      </span>
                      <span className="mt-1 block text-xs leading-snug">
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-5 text-sm leading-relaxed text-ink-soft">
                {progressDetail}
              </p>
              {txHash ? (
                <a
                  href={sepoliaTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="meta mt-4 inline-flex items-center gap-1.5 text-brand hover:text-brand-hover"
                >
                  Open the Sepolia transaction · {truncateHex(txHash)}
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
              title="This wallet has a demo income history"
              body="Three confirmed demo pay cycles from Semuni are ready. Connect this wallet and Orru will read them."
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
          Everything here runs on test networks. The faucet creates income
          records, not spendable money. It never charges your wallet. Borrowing
          later sends demo mUSDC on Creditcoin.
        </p>
      </div>
    </ScreenFrame>
  );
}

function formatBlock(value: string): string {
  return BigInt(value).toLocaleString("en-US");
}
