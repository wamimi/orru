"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, CircleNotch, Minus } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { ButtonLink } from "@/components/ui/Button";
import { EvidenceBadge } from "@/components/ui/EvidenceBadge";
import { parseOutcome } from "@/lib/app";
import {
  reviewAt,
  scenarioFromState,
  type StageStatus,
} from "@/lib/review-machine";

function StageMark({ status }: { status: StageStatus }) {
  if (status === "running") {
    return (
      <CircleNotch
        size={18}
        className="mt-0.5 shrink-0 animate-spin text-brand"
      />
    );
  }
  if (status === "done") {
    return <Check size={18} className="mt-0.5 shrink-0 text-brand" />;
  }
  if (status === "failed" || status === "empty") {
    return <Minus size={18} className="mt-0.5 shrink-0 text-ink-faint" />;
  }
  return (
    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-rule-strong" />
  );
}

export function ReviewScreen() {
  const search = useSearchParams();
  const outcome = parseOutcome(search.get("state"));
  const scenario = scenarioFromState(search.get("state"), search.get("error"));
  const frozen =
    outcome === "success" ? 20_000 : outcome === "loading" ? 400 : null;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (frozen !== null) return;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = now - started;
      setElapsed(t);
      const next = reviewAt(t, scenario);
      if (next.canContinue || next.recovery) return;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [frozen, scenario]);

  const snap = reviewAt(frozen ?? elapsed, scenario);

  return (
    <ScreenFrame
      kicker="02 · Review"
      title="Each payment is found, then confirmed."
      lede="Looking something up is not the same as confirming it. A payment only counts once it has been confirmed and the sender is recognised."
    >
      <ol className="divide-y divide-rule border-y border-rule">
        {snap.stages.map((stage) => (
          <li key={stage.id} className="flex gap-4 py-5">
            <StageMark status={stage.status} />
            <div>
              <p className="display-sm text-ink">{stage.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {stage.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {snap.payments.length > 0 ? (
        <ul className="mt-10 divide-y divide-rule border-y border-rule">
          {snap.payments.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4"
            >
              <div>
                <p className="meta text-ink">{payment.period}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {payment.payer} · {payment.received}
                </p>
              </div>
              <EvidenceBadge state={payment.evidence} />
            </li>
          ))}
        </ul>
      ) : null}

      {snap.recovery ? (
        <div className="mt-10">
          <Callout
            tone={snap.stages[0].status === "empty" ? "empty" : "error"}
            title={snap.recovery.title}
            body={snap.recovery.body}
            actionLabel={snap.recovery.actionLabel}
            actionHref={snap.recovery.actionHref}
          />
        </div>
      ) : null}

      <div className="mt-10">
        {snap.canContinue ? (
          <ButtonLink href="/profile">
            See your income profile
            <ArrowRight size={18} />
          </ButtonLink>
        ) : snap.recovery ? null : (
          <p className="meta text-ink-faint">
            Continue unlocks when every payment that can count has been confirmed.
          </p>
        )}
      </div>
    </ScreenFrame>
  );
}
