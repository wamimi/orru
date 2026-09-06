"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { PaymentRow } from "@/components/app/PaymentRow";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { StageAside, StageList } from "@/components/app/StageList";
import { useFlowSession } from "@/components/app/useFlowSession";
import { ButtonLink } from "@/components/ui/Button";
import { parseOutcome } from "@/lib/app";
import type { IncomeLookup, IncomeResponse } from "@/lib/income-types";
import {
  paymentsFromIncome,
  scenarioFromIncome,
} from "@/lib/income-view";
import type { Payment } from "@/lib/mock/types";
import {
  reviewAt,
  scenarioFromState,
  type ReviewScenario,
} from "@/lib/review-machine";

function pickIncome(incomes: IncomeLookup[], selectedPayer: string | null): IncomeLookup | null {
  if (incomes.length === 0) return null;
  if (selectedPayer) {
    const match = incomes.find(
      (row) => row.payerAddress.toLowerCase() === selectedPayer.toLowerCase(),
    );
    if (match) return match;
  }
  return (
    incomes.find((row) => row.verified && row.provableWindow) ??
    incomes[0]
  );
}

export function ReviewScreen() {
  const search = useSearchParams();
  const outcome = parseOutcome(search.get("state"));
  const qaScenario = scenarioFromState(search.get("state"), search.get("error"));
  const { session, ready, update } = useFlowSession();
  const qa = outcome !== null;
  const frozen =
    outcome === "success" ? 20_000 : outcome === "loading" ? 400 : null;

  const [elapsed, setElapsed] = useState(0);
  const [liveScenario, setLiveScenario] = useState<ReviewScenario | null>(
    qa ? qaScenario : null,
  );
  const [livePayments, setLivePayments] = useState<Payment[] | undefined>(
    undefined,
  );
  const [lookupError, setLookupError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [incomes, setIncomes] = useState<IncomeLookup[]>(session.incomes);

  useEffect(() => {
    if (qa || !ready) return;
    if (!session.address || !session.sessionToken || !session.signed) {
      setLiveScenario("failed");
      setLookupError(true);
      return;
    }

    let cancelled = false;
    fetch(`/api/income/${session.address}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${session.sessionToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("lookup");
        return (await response.json()) as IncomeResponse;
      })
      .then((payload) => {
        if (cancelled) return;
        const rows = payload.incomes ?? [];
        const selected = pickIncome(rows, session.income?.payerAddress ?? null);
        setIncomes(rows);
        update({
          incomes: rows,
          income: selected,
        });
        if (!selected) {
          setLivePayments([]);
          setLiveScenario("empty");
          return;
        }
        setLivePayments(paymentsFromIncome(selected));
        setLiveScenario(scenarioFromIncome(selected));
      })
      .catch(() => {
        if (cancelled) return;
        setLookupError(true);
        setLiveScenario("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [qa, ready, session.address, session.sessionToken, session.signed, session.income?.payerAddress, update]);

  const scenario = qa ? qaScenario : (liveScenario ?? "happy");
  const source = qa ? undefined : livePayments;
  const waitingForLive = !qa && liveScenario === null && !lookupError;

  useEffect(() => {
    if (frozen !== null) return;
    if (!qa && liveScenario === null) return;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = now - started;
      setElapsed(t);
      const next = reviewAt(t, scenario, source);
      if (next.canContinue || next.recovery) return;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [frozen, qa, scenario, source, liveScenario]);

  const snap = reviewAt(
    waitingForLive ? 0 : (frozen ?? elapsed),
    waitingForLive ? "happy" : scenario,
    source,
  );
  const display = waitingForLive
    ? reviewAt(400, "happy", [])
    : snap;

  const confirmed = display.payments.filter(
    (payment) => payment.evidence === "attested" || payment.evidence === "verified",
  ).length;
  const selected = session.income;
  const canContinue = display.canContinue && (qa || Boolean(selected?.provableWindow));

  function selectPayer(row: IncomeLookup) {
    update({ income: row, incomes });
    setLivePayments(paymentsFromIncome(row));
    setLiveScenario(scenarioFromIncome(row));
    setElapsed(20_000);
  }

  return (
    <ScreenFrame
      kicker="02 · Review"
      title="Checking your income."
      lede="This is a short reveal of a record that is already confirmed. A payment only counts once the sender is a verified employer."
      aside={
        <StageAside>
          <p className="eyebrow text-ink-faint">On this payout account</p>
          <p className="display-md mt-4 text-ink">
            {display.payments.length === 0
              ? waitingForLive
                ? "Checking"
                : "No payments yet"
              : `${selected?.periodsAttested ?? confirmed} confirmed`}
          </p>
          <p className="meta mt-2 text-ink-faint">
            {display.payments.length > 0
              ? `${display.payments.length} found`
              : "Waiting on the chain"}
          </p>
        </StageAside>
      }
    >
      <StageList stages={display.stages} />

      {incomes.length > 1 ? (
        <div className="mt-10 max-w-xl">
          <p className="eyebrow text-ink-faint">Verified employer</p>
          <ul className="mt-3">
            {incomes.map((row) => {
              const active =
                selected?.payerAddress.toLowerCase() === row.payerAddress.toLowerCase();
              return (
                <li key={row.payerAddress} className="border-t border-rule">
                  <button
                    type="button"
                    onClick={() => selectPayer(row)}
                    className={`flex w-full items-center justify-between py-4 text-left ${
                      active ? "text-ink" : "text-ink-soft"
                    }`}
                  >
                    <span>
                      <span className="display-sm">{row.payerName}</span>
                      <span className="meta mt-1 block text-ink-faint">
                        {row.incomeBand?.label ?? "No range yet"}
                      </span>
                    </span>
                    <span className="meta">{active ? "Selected" : "Use this"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {display.payments.length > 0 ? (
        <ul className="mt-12 border-t border-rule">
          {display.payments.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              open={expanded === payment.id}
              onToggle={() =>
                setExpanded((current) =>
                  current === payment.id ? null : payment.id,
                )
              }
            />
          ))}
        </ul>
      ) : null}

      {display.recovery ? (
        <div className="mt-12">
          <Callout
            tone={display.stages[0].status === "empty" ? "empty" : "error"}
            title={display.recovery.title}
            body={display.recovery.body}
            actionLabel={display.recovery.actionLabel}
            actionHref={display.recovery.actionHref}
          />
        </div>
      ) : null}

      <div className="mt-12">
        {canContinue ? (
          <ButtonLink href="/profile">
            See your income
            <ArrowRight size={18} />
          </ButtonLink>
        ) : display.recovery ? null : (
          <p className="meta text-ink-faint">
            Continue unlocks when three pay cycles in a row have been confirmed.
          </p>
        )}
      </div>
    </ScreenFrame>
  );
}
