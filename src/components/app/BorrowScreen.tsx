"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowSquareOut, CheckCircle } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { useFlowSession } from "@/components/app/useFlowSession";
import { Button, ButtonLink } from "@/components/ui/Button";
import {
  ADDRESSES,
  CREDITCOIN_ID,
  TOKEN_DECIMALS,
  creditcoinTxUrl,
  truncateHex,
} from "@/lib/chain";
import type { Statement, StatementsPayload } from "@/lib/statements";

const UNITS = 1_000_000;

function money(base: bigint | number): string {
  return (Number(base) / UNITS).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function toBase(input: string): bigint {
  const clean = input.replace(/[^0-9.]/g, "");
  if (!clean) return 0n;
  const [whole, fraction = ""] = clean.split(".");
  const micros = `${fraction}000000`.slice(0, 6);
  return BigInt(whole || "0") * BigInt(UNITS) + BigInt(micros);
}

async function readStatements(
  address: string,
  sessionToken: string,
  fresh = false,
): Promise<StatementsPayload> {
  const response = await fetch(`/api/statements/${address}${fresh ? "?fresh=1" : ""}`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${sessionToken}` },
    cache: "no-store",
  });
  if (response.status === 401) throw new Error("expired");
  if (!response.ok) throw new Error("lookup");
  return (await response.json()) as StatementsPayload;
}

export function BorrowScreen() {
  const { session, ready } = useFlowSession();
  const [data, setData] = useState<StatementsPayload | null>(null);
  const [failed, setFailed] = useState<"expired" | "error" | null>(null);
  const [amount, setAmount] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<{
    amount: string;
    txHash: string;
    blockNumber: string;
  } | null>(null);
  const [pending, setPending] = useState<{
    amount: string;
    txHash: string;
    credentialId: string;
  } | null>(null);

  const signedOut =
    (ready && (!session.address || !session.sessionToken)) || failed === "expired";
  const loading = !signedOut && !data && !failed;

  const refreshStatements = useCallback(async () => {
    if (!session.address || !session.sessionToken) return null;
    const payload = await readStatements(session.address, session.sessionToken, true);
    setData(payload);
    setFailed(null);
    return payload;
  }, [session.address, session.sessionToken]);

  useEffect(() => {
    if (!ready || !session.address || !session.sessionToken) return;
    let cancelled = false;
    readStatements(session.address, session.sessionToken)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((cause: Error) => {
        // A failed lookup is not the same as having nothing.
        if (!cancelled) setFailed(cause.message === "expired" ? "expired" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session.address, session.sessionToken]);

  const applyConfirmedDraw = useCallback(
    (credentialId: string, amountBase: string, remainingBase?: string) => {
      setData((current) => {
        if (!current) return current;
        const amountValue = BigInt(amountBase);
        const drawn = BigInt(current.credit.drawn) + amountValue;
        return {
          ...current,
          statements: current.statements.map((row) => {
            if (row.credentialId.toLowerCase() !== credentialId.toLowerCase()) return row;
            const remaining = remainingBase
              ? BigInt(remainingBase)
              : BigInt(row.remaining) > amountValue
                ? BigInt(row.remaining) - amountValue
                : 0n;
            return { ...row, remaining: remaining.toString() };
          }),
          credit: {
            ...current.credit,
            drawn: drawn.toString(),
            drawnFormatted: money(drawn).replace(/,/g, ""),
          },
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (!pending || !session.sessionToken) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        const response = await fetch(
          `/api/credit/status/${encodeURIComponent(pending.txHash)}`,
          {
            credentials: "include",
            headers: { Authorization: `Bearer ${session.sessionToken}` },
            cache: "no-store",
          },
        );
        const body = (await response.json()) as {
          status?: string;
          blockNumber?: string;
          error?: string;
        };
        if (cancelled) return;

        if (body.status === "confirmed" && body.blockNumber) {
          applyConfirmedDraw(pending.credentialId, pending.amount);
          setPaid({
            amount: pending.amount,
            txHash: pending.txHash,
            blockNumber: body.blockNumber,
          });
          setPending(null);
          try {
            await refreshStatements();
          } catch {
            setError("The transfer arrived, but the available amount could not be refreshed.");
          }
          return;
        }

        if (body.status === "failed") {
          setPending(null);
          setError("The transfer did not complete. Please try again.");
          return;
        }

        if (response.status === 401) {
          setPending(null);
          setFailed("expired");
          return;
        }
      } catch {
        if (cancelled) return;
      }
      timer = setTimeout(() => void check(), 3_000);
    };

    timer = setTimeout(() => void check(), 3_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [applyConfirmedDraw, pending, refreshStatements, session.sessionToken]);

  const statement: Statement | null = useMemo(() => {
    const live = (data?.statements ?? []).filter(
      (row) => row.status === "valid",
    );
    return live.sort((a, b) => Number(b.remaining) - Number(a.remaining))[0] ?? null;
  }, [data]);

  const headroom = statement ? BigInt(statement.remaining) : 0n;
  const limit = statement ? BigInt(statement.limit) : 0n;
  const drawn = data ? BigInt(data.credit.drawn) : 0n;
  const drawnPercent = limit > 0n
    ? Math.min(100, Number((drawn * 10_000n) / limit) / 100)
    : 0;
  const allDrawn = Boolean(statement) && headroom === 0n;
  const wanted = toBase(amount);
  const tooMuch = wanted > headroom;
  const canSend =
    Boolean(statement) && wanted > 0n && !tooMuch && !working && !pending;

  async function onSend() {
    if (!statement || !session.sessionToken) return;
    setError(null);
    setWorking(true);
    try {
      const response = await fetch("/api/credit/disburse", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.sessionToken}`,
        },
        body: JSON.stringify({
          credentialId: statement.credentialId,
          amount: wanted.toString(),
        }),
      });
      const body = (await response.json()) as {
        status?: string;
        amount?: string;
        remaining?: string;
        txHash?: string;
        blockNumber?: string;
        error?: string;
      };

      if (response.status === 202 && body.txHash) {
        setPending({
          amount: body.amount ?? wanted.toString(),
          txHash: body.txHash,
          credentialId: statement.credentialId,
        });
        setAmount("");
        return;
      }

      if (!response.ok || !body.txHash || !body.blockNumber) {
        setError(body.error ?? "That could not be sent. Please try again.");
        return;
      }
      const paidAmount = body.amount ?? wanted.toString();
      applyConfirmedDraw(statement.credentialId, paidAmount, body.remaining);
      setPaid({ amount: paidAmount, txHash: body.txHash, blockNumber: body.blockNumber });
      setAmount("");
      try {
        await refreshStatements();
      } catch {
        setError("The transfer arrived, but the available amount could not be refreshed.");
      }
    } catch {
      setError("That could not be sent. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  if (signedOut) {
    return (
      <ScreenFrame kicker="Borrow" title="Sign in to draw against your income.">
        <Callout
          tone="empty"
          title="No account connected"
          body="Connect the payout account you get paid into to see what you can draw."
          actionLabel="Connect an account"
          actionHref="/connect"
        />
      </ScreenFrame>
    );
  }

  if (failed === "error") {
    return (
      <ScreenFrame kicker="Borrow" title="We could not read your statements.">
        <Callout
          tone="error"
          title="The lookup did not come back"
          body="This is a problem reading the chain, not a problem with your income. Refresh the page to try again."
          actionLabel="Back to your account"
          actionHref="/app"
        />
      </ScreenFrame>
    );
  }

  if (!loading && !statement && !paid) {
    return (
      <ScreenFrame kicker="Borrow" title="Nothing to draw against yet.">
        <Callout
          tone="empty"
          title="You need a statement first"
          body="Once your income is confirmed and you have issued a statement, what you can borrow appears here."
          actionLabel="Check your income"
          actionHref="/review"
        />
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame
      kicker="Borrow"
      title="Draw against what you earn."
      lede="No collateral is locked and nothing is sold. Your limit comes from the bottom of your income range, so taking the full amount tells a lender nothing your statement did not already say."
    >
      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:gap-14">
        <section>
          <h2 className="display-sm text-ink">How much do you need?</h2>

          <label className="sr-only" htmlFor="borrow-amount">
            Amount in mUSDC
          </label>
          <div className="mt-6 flex items-baseline gap-3 border-b-2 border-rule-strong pb-4 focus-within:border-brand">
            <input
              id="borrow-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amount}
              disabled={loading || working || allDrawn || Boolean(pending)}
              onChange={(event) => setAmount(event.target.value)}
              className="display-lg w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-ink-faint"
            />
            <span className="meta shrink-0 text-ink-faint">mUSDC</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { label: "25%", value: headroom / 4n },
              { label: "50%", value: headroom / 2n },
              { label: "Max", value: headroom },
            ].map((quick) => (
              <button
                key={quick.label}
                type="button"
                disabled={loading || working || headroom === 0n || Boolean(pending)}
                onClick={() => setAmount(money(quick.value).replace(/,/g, ""))}
                className="meta min-h-9 rounded-control border border-rule px-3 text-ink-soft transition-tone hover:border-ink-faint hover:text-ink disabled:opacity-40"
              >
                {quick.label}
              </button>
            ))}
          </div>

          {tooMuch ? (
            <p className="meta mt-4 text-ev-failed-fg">
              The most available right now is {money(headroom)} mUSDC.
            </p>
          ) : null}

          {allDrawn ? (
            <p className="meta mt-4 text-ink-faint">
              You have drawn everything available against this statement.
            </p>
          ) : null}

          {error ? (
            <div className="mt-6">
              <Callout tone="error" title="That did not go through" body={error} />
            </div>
          ) : null}

          {pending ? (
            <div className="mt-6">
              <Callout
                tone="info"
                title={`${money(BigInt(pending.amount))} mUSDC is on its way`}
                body="The chain is taking longer than usual to confirm. It has been sent. Do not send it again. Follow the confirmation to watch it land."
              >
                <ButtonLink
                  href={creditcoinTxUrl(pending.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4"
                  variant="outline"
                >
                  Follow the chain confirmation
                  <ArrowSquareOut size={16} />
                </ButtonLink>
              </Callout>
            </div>
          ) : null}

          {paid ? (
            <div className="mt-6">
              <Callout
                tone="info"
                title={`${money(BigInt(paid.amount))} mUSDC has arrived in your wallet`}
                body={`Confirmed on Creditcoin in block ${paid.blockNumber}. Nothing was locked and nothing was sold.`}
              >
                <div className="mt-5 flex gap-3 rounded-control border border-rule bg-paper p-4">
                  <CheckCircle
                    size={28}
                    weight="fill"
                    className="borrow-success__icon shrink-0 text-brand"
                  />
                  <div>
                    <p className="font-medium text-ink">Check your wallet</p>
                    <p className="mt-1 break-all text-sm leading-relaxed text-ink-soft">
                      mUSDC at {ADDRESSES[CREDITCOIN_ID].settlementToken}
                    </p>
                    <p className="meta mt-1 text-ink-faint">
                      {TOKEN_DECIMALS} decimals. Creditcoin testnet, chain id {CREDITCOIN_ID}.
                    </p>
                  </div>
                </div>
                <ButtonLink
                  href={creditcoinTxUrl(paid.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4"
                  variant="outline"
                >
                  Open the chain confirmation
                  <ArrowSquareOut size={16} />
                </ButtonLink>
              </Callout>
            </div>
          ) : null}

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button onClick={() => void onSend()} disabled={!canSend}>
              {working ? "Sending…" : "Send it to my account"}
            </Button>
            <ButtonLink href="/app" variant="quiet">
              Back to your account
            </ButtonLink>
          </div>
        </section>

        <aside className="border-t-2 border-brand pt-6">
          <p className="eyebrow text-ink-faint">Available to draw</p>
          <p className="display-md mt-3 text-ink">
            {loading ? "Loading" : `${money(headroom)} mUSDC`}
          </p>

          {statement ? (
            <>
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">
                Limit {money(limit)} mUSDC. Drawn {money(drawn)}. Remaining {money(headroom)}.
              </p>
              <div
                className="borrow-progress mt-4"
                role="progressbar"
                aria-label="Amount drawn"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(drawnPercent)}
              >
                <span
                  className="borrow-progress__fill"
                  style={{ width: `${drawnPercent}%` }}
                />
              </div>
              <dl className="mt-8 border-t border-rule">
                <Row label="Against" value={statement.bandLabel} />
                <Row label="Statement" value={truncateHex(statement.credentialId)} />
                <Row label="Pay cycles" value={`${statement.periodsProven}`} />
              </dl>
            </>
          ) : null}

          <p className="mt-8 text-sm leading-relaxed text-ink-faint">
            This pool holds test funds, not real money. It exists so the whole
            journey can be walked end to end.
          </p>
        </aside>
      </div>
    </ScreenFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-3">
      <dt className="meta text-ink-faint">{label}</dt>
      <dd className="meta text-ink">{value}</dd>
    </div>
  );
}
