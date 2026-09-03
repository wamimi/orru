"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CaretDown, Check, CircleNotch, Minus } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { useFlowSession } from "@/components/app/useFlowSession";
import { ButtonLink } from "@/components/ui/Button";
import { EvidenceBadge } from "@/components/ui/EvidenceBadge";
import { parseOutcome } from "@/lib/app";
import type { IncomeLookup } from "@/lib/income-types";
import {
  evidenceLinks,
  paymentsFromIncome,
  scenarioFromIncome,
} from "@/lib/income-view";
import type { Payment } from "@/lib/mock/types";
import {
  reviewAt,
  scenarioFromState,
  type ReviewScenario,
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

  return (
    <ScreenFrame
      kicker="02 · Review"
      title="Each payment is found, then confirmed."
      lede="Looking something up is not the same as confirming it. A payment only counts once it has been confirmed and the sender is recognised."
    >
      <ol className="divide-y divide-rule border-y border-rule">
        {display.stages.map((stage) => (
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

      {display.payments.length > 0 ? (
        <ul className="mt-10 divide-y divide-rule border-y border-rule">
          {display.payments.map((payment) => {
            const links = evidenceLinks(payment);
            const open = expanded === payment.id;
            return (
              <li key={payment.id} className="py-4">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 text-left"
                  onClick={() =>
                    setExpanded((current) =>
                      current === payment.id ? null : payment.id,
                    )
                  }
                  aria-expanded={open}
                >
                  <div>
                    <p className="meta text-ink">{payment.period}</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {payment.payer} · {payment.received}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <EvidenceBadge state={payment.evidence} />
                    <CaretDown
                      size={16}
                      className={`text-ink-faint transition-tone ${open ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>
                {open ? (
                  <div className="mt-3 pl-0 text-sm leading-relaxed text-ink-soft">
                    <p>
                      {payment.sourceChain ?? "Payment record"}
                      {payment.sourceTx ? " · incoming payment" : null}
                    </p>
                    {links.length > 0 ? (
                      <div className="mt-2 flex flex-col items-start gap-1">
                        {links.map((link) => (
                          <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            className="meta text-brand hover:text-brand-hover"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="meta mt-2 text-ink-faint">
                        No public record is attached to this row.
                      </p>
                    )}
                    {payment.sourceTx && !payment.verifiedTx ? (
                      <p className="meta mt-2 text-ink-faint">
                        Found on Sepolia, chain confirmation pending.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {display.recovery ? (
        <div className="mt-10">
          <Callout
            tone={display.stages[0].status === "empty" ? "empty" : "error"}
            title={display.recovery.title}
            body={display.recovery.body}
            actionLabel={display.recovery.actionLabel}
            actionHref={display.recovery.actionHref}
          />
        </div>
      ) : null}

      <div className="mt-10">
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
