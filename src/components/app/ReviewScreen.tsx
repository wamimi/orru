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
import type { IncomeLookup } from "@/lib/income-types";
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
        return (await response.json()) as IncomeLookup;
      })
      .then((income) => {
        if (cancelled) return;
        update({ income });
        setLivePayments(paymentsFromIncome(income));
        setLiveScenario(scenarioFromIncome(income));
      })
      .catch(() => {
        if (cancelled) return;
        setLookupError(true);
        setLiveScenario("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [qa, ready, session.address, session.sessionToken, session.signed, update]);

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

  return (
    <ScreenFrame
      kicker="02 · Review"
      title="Each payment is found, then confirmed."
      lede="Looking something up is not the same as confirming it. A payment only counts once it has been confirmed and the sender is recognised."
      aside={
        <StageAside>
          <p className="eyebrow text-ink-faint">On this address</p>
          <p className="display-md mt-4 text-ink">
            {display.payments.length === 0
              ? waitingForLive
                ? "Checking"
                : "No payments yet"
              : `${confirmed} confirmed`}
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
        {display.canContinue ? (
          <ButtonLink href="/profile">
            See your income profile
            <ArrowRight size={18} />
          </ButtonLink>
        ) : display.recovery ? null : (
          <p className="meta text-ink-faint">
            Continue unlocks when every payment that can count has been confirmed.
          </p>
        )}
      </div>
    </ScreenFrame>
  );
}
