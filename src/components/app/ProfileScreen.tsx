"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { useFlowSession } from "@/components/app/useFlowSession";
import { ButtonLink } from "@/components/ui/Button";
import { CredentialCard } from "@/components/ui/CredentialCard";
import { aliasFromCredentialId } from "@/lib/alias";
import { parseOutcome } from "@/lib/app";
import type { IncomeLookup, IncomeResponse } from "@/lib/income-types";
import { credentialFromIncome } from "@/lib/income-view";
import { demoCredential } from "@/lib/mock";

function pickIncome(incomes: IncomeLookup[], selectedPayer: string | null): IncomeLookup | null {
  if (incomes.length === 0) return null;
  if (selectedPayer) {
    const match = incomes.find(
      (row) => row.payerAddress.toLowerCase() === selectedPayer.toLowerCase(),
    );
    if (match) return match;
  }
  return incomes.find((row) => row.verified && row.provableWindow) ?? incomes[0];
}

export function ProfileScreen() {
  const outcome = parseOutcome(useSearchParams().get("state"));
  const { session, ready, update } = useFlowSession();
  const qa = outcome !== null;
  const [lookupFailed, setLookupFailed] = useState(false);

  useEffect(() => {
    if (qa || !ready || session.income) return;
    if (!session.address || !session.sessionToken) {
      setLookupFailed(true);
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
        update({
          incomes: rows,
          income: pickIncome(rows, null),
        });
      })
      .catch(() => {
        if (!cancelled) setLookupFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [qa, ready, session.address, session.income, session.sessionToken, update]);

  if (outcome === "empty") {
    return (
      <ScreenFrame kicker="03 · Profile" title="No income yet.">
        <Callout
          tone="empty"
          title="Nothing to show"
          body="Connect the payout account you get paid into and let us confirm the payments first."
          actionLabel="Connect a payout account"
          actionHref="/connect"
        />
      </ScreenFrame>
    );
  }

  if (outcome === "error") {
    return (
      <ScreenFrame kicker="03 · Profile" title="This profile could not be loaded.">
        <Callout
          tone="error"
          title="The statement is not available"
          body="It may have been withdrawn, or the lookup failed. Confirm your payments again."
          actionLabel="Review payments"
          actionHref="/review"
        />
      </ScreenFrame>
    );
  }

  if (outcome === "loading") {
    return (
      <ScreenFrame kicker="03 · Profile" title="Loading your income.">
        <div className="h-72 max-w-md border border-rule bg-canvas-raised" aria-busy="true" />
      </ScreenFrame>
    );
  }

  if (!qa && (lookupFailed || (ready && !session.sessionToken))) {
    return (
      <ScreenFrame kicker="03 · Profile" title="This profile could not be loaded.">
        <Callout
          tone="error"
          title="The statement is not available"
          body="It may have been withdrawn, or the lookup failed. Confirm your payments again."
          actionLabel="Review payments"
          actionHref="/review"
        />
      </ScreenFrame>
    );
  }

  if (!qa && session.income && !session.income.provableWindow) {
    const reason = session.income.reason;
    if (reason === "no_payments" || !reason) {
      if (reason === "no_payments") {
        return (
          <ScreenFrame kicker="03 · Profile" title="No income yet.">
            <Callout
              tone="empty"
              title="Nothing to show"
              body="Connect the payout account you get paid into and let us confirm the payments first."
              actionLabel="Connect a payout account"
              actionHref="/connect"
            />
          </ScreenFrame>
        );
      }
    }
    if (reason === "payer_not_approved") {
      return (
        <ScreenFrame kicker="03 · Profile" title="No income yet.">
          <Callout
            tone="error"
            title="We couldn't recognise who paid you"
            body="Orru only counts payments from employers, platforms and grant programmes."
            actionLabel="Use a different address"
            actionHref="/connect"
          />
        </ScreenFrame>
      );
    }
    if (reason === "not_consecutive") {
      return (
        <ScreenFrame kicker="03 · Profile" title="No income yet.">
          <Callout
            tone="error"
            title="Your payments look irregular"
            body="Orru needs three pay cycles in a row before a statement can be issued."
            actionLabel="Review payments"
            actionHref="/review"
          />
        </ScreenFrame>
      );
    }
    if (reason === "not_yet_verified") {
      return (
        <ScreenFrame kicker="03 · Profile" title="Still confirming your income.">
          <Callout
            tone="info"
            title="We're still confirming your most recent payments"
            body="This usually clears on its own in a few minutes."
            actionLabel="Check again"
            actionHref="/review"
          />
        </ScreenFrame>
      );
    }
    return (
      <ScreenFrame kicker="03 · Profile" title="No income yet.">
        <Callout
          tone="error"
          title="Not enough periods yet"
          body="Fewer than three periods of pay have been confirmed. Come back after more payments land."
          actionLabel="Review payments"
          actionHref="/review"
        />
      </ScreenFrame>
    );
  }

  if (!qa && !session.income) {
    return (
      <ScreenFrame kicker="03 · Profile" title="Loading your income.">
        <div className="h-72 max-w-md border border-rule bg-canvas-raised" aria-busy="true" />
      </ScreenFrame>
    );
  }

  const card = (() => {
    if (qa) {
      return {
        ...demoCredential,
        id: "Example statement",
        issuedOn: "Example",
        status: "Preview" as const,
      };
    }
    if (session.income && session.credentialId) {
      return {
        ...credentialFromIncome(session.income),
        id: aliasFromCredentialId(session.credentialId),
        issuedOn: "Issued",
        status: "Valid" as const,
      };
    }
    if (session.income) return credentialFromIncome(session.income);
    return {
      ...demoCredential,
      id: "Not issued yet",
      issuedOn: "Not issued yet",
      status: "Preview" as const,
    };
  })();

  return (
    <ScreenFrame
      kicker="03 · Profile"
      title="Your income, as a range."
      lede="Exact pay never goes into your statement, only a range."
      aside={<CredentialCard data={card} />}
    >
      {session.incomes.length > 1 ? (
        <div className="mb-8 max-w-md">
          <p className="eyebrow text-ink-faint">Verified employer</p>
          <ul className="mt-3">
            {session.incomes.map((row) => {
              const active =
                session.income?.payerAddress.toLowerCase() ===
                row.payerAddress.toLowerCase();
              return (
                <li key={row.payerAddress} className="border-t border-rule">
                  <button
                    type="button"
                    onClick={() => update({ income: row })}
                    className="flex w-full items-center justify-between py-4 text-left"
                  >
                    <span>
                      <span className="display-sm text-ink">{row.payerName}</span>
                      <span className="meta mt-1 block text-ink-faint">
                        {row.incomeBand?.label ?? "No range yet"}
                      </span>
                    </span>
                    <span className="meta text-ink-faint">
                      {active ? "Selected" : "Use this"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <ul className="max-w-md">
        <li className="border-t border-rule py-4">
          <p className="display-sm text-ink">A range, not a number</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Exact pay never goes into your statement, only a range.
          </p>
        </li>
        <li className="border-t border-rule py-4">
          <p className="display-sm text-ink">You choose who sees it</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Sharing is a separate step. Nothing is sent until you confirm.
          </p>
        </li>
      </ul>
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/credential">
          Issue your statement
          <ArrowRight size={18} />
        </ButtonLink>
        <ButtonLink href="/consent" variant="outline">
          Share this statement
        </ButtonLink>
      </div>
    </ScreenFrame>
  );
}
