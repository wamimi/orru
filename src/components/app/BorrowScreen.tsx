"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { useFlowSession } from "@/components/app/useFlowSession";
import { Button, ButtonLink } from "@/components/ui/Button";
import { creditcoinTxUrl, truncateHex } from "@/lib/chain";
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

export function BorrowScreen() {
  const { session, ready } = useFlowSession();
  const [data, setData] = useState<StatementsPayload | null>(null);
  const [failed, setFailed] = useState<"expired" | "error" | null>(null);
  const [amount, setAmount] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ amount: string; txHash: string } | null>(null);
  const [pending, setPending] = useState<{ amount: string; txHash: string } | null>(null);

  const signedOut =
    (ready && (!session.address || !session.sessionToken)) || failed === "expired";
  const loading = !signedOut && !data && !failed;

  useEffect(() => {
    if (!ready || !session.address || !session.sessionToken) return;
    let cancelled = false;
    fetch(`/api/statements/${session.address}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${session.sessionToken}` },
    })
      .then(async (response) => {
        if (response.status === 401) throw new Error("expired");
        if (!response.ok) throw new Error("lookup");
        return (await response.json()) as StatementsPayload;
      })
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

  const statement: Statement | null = useMemo(() => {
    const live = (data?.statements ?? []).filter(
      (row) => row.status === "valid" && BigInt(row.remaining) > 0n,
    );
    return live.sort((a, b) => Number(b.remaining) - Number(a.remaining))[0] ?? null;
  }, [data]);

  const headroom = statement ? BigInt(statement.remaining) : 0n;
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
        error?: string;
      };

      if (response.status === 202 && body.txHash) {
        setPending({ amount: body.amount ?? wanted.toString(), txHash: body.txHash });
        setAmount("");
        return;
      }

      if (!response.ok || !body.txHash) {
        setError(body.error ?? "That could not be sent. Please try again.");
        return;
      }
      setPaid({ amount: body.amount ?? wanted.toString(), txHash: body.txHash });
      setData((current) =>
        current
          ? {
              ...current,
              statements: current.statements.map((row) =>
                row.credentialId === statement.credentialId
                  ? { ...row, remaining: body.remaining ?? "0" }
                  : row,
              ),
            }
          : current,
      );
      setAmount("");
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
              disabled={loading || working}
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
                disabled={loading || headroom === 0n}
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
                body="The chain is taking longer than usual to confirm. It has been sent — do not send it again. Follow the confirmation to watch it land."
              >
                <a
                  href={creditcoinTxUrl(pending.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="meta mt-4 inline-flex items-center gap-1.5 text-brand hover:text-brand-hover"
                >
                  Follow the chain confirmation
                  <ArrowSquareOut size={14} />
                </a>
              </Callout>
            </div>
          ) : null}

          {paid ? (
            <div className="mt-6">
              <Callout
                tone="info"
                title={`${money(BigInt(paid.amount))} mUSDC is on its way`}
                body="It was sent to the payout account you connected. Nothing was locked and nothing was sold."
              >
                <a
                  href={creditcoinTxUrl(paid.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="meta mt-4 inline-flex items-center gap-1.5 text-brand hover:text-brand-hover"
                >
                  Open the chain confirmation
                  <ArrowSquareOut size={14} />
                </a>
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
            {loading ? "—" : `${money(headroom)} mUSDC`}
          </p>

          {statement ? (
            <dl className="mt-8 border-t border-rule">
              <Row label="Against" value={statement.bandLabel} />
              <Row label="Statement" value={truncateHex(statement.credentialId)} />
              <Row label="Pay cycles" value={`${statement.periodsProven}`} />
              <Row
                label="Already drawn"
                value={`${data?.credit.drawnFormatted ?? "0"} mUSDC`}
              />
            </dl>
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
