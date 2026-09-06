"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { useFlowSession } from "@/components/app/useFlowSession";
import { ButtonLink } from "@/components/ui/Button";
import { CredentialCard } from "@/components/ui/CredentialCard";
import { parseOutcome } from "@/lib/app";
import type { IncomeLookup } from "@/lib/income-types";
import { credentialFromIncome } from "@/lib/income-view";
import { demoCredential } from "@/lib/mock";

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
        return (await response.json()) as IncomeLookup;
      })
      .then((income) => {
        if (!cancelled) update({ income });
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
      <ScreenFrame
        kicker="03 · Profile"
        title="No income profile yet."
      >
        <Callout
          tone="empty"
          title="Nothing to show"
          body="Connect the address you get paid into and let us confirm the payments first."
          actionLabel="Connect an address"
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
          title="The credential is not available"
          body="It may have expired, or the lookup failed. Confirm your payments again."
          actionLabel="Review payments"
          actionHref="/review"
        />
      </ScreenFrame>
    );
  }

  if (outcome === "loading") {
    return (
      <ScreenFrame kicker="03 · Profile" title="Loading your income profile.">
        <div className="h-72 max-w-md border border-rule bg-canvas-raised" aria-busy="true" />
      </ScreenFrame>
    );
  }

  if (!qa && (lookupFailed || (ready && !session.sessionToken))) {
    return (
      <ScreenFrame kicker="03 · Profile" title="This profile could not be loaded.">
        <Callout
          tone="error"
          title="The credential is not available"
          body="It may have expired, or the lookup failed. Confirm your payments again."
          actionLabel="Review payments"
          actionHref="/review"
        />
      </ScreenFrame>
    );
  }

  if (!qa && session.income && !session.income.verified) {
    const reason = session.income.reason;
    if (reason === "no_payments") {
      return (
        <ScreenFrame kicker="03 · Profile" title="No income profile yet.">
          <Callout
            tone="empty"
            title="Nothing to show"
            body="Connect the address you get paid into and let us confirm the payments first."
            actionLabel="Connect an address"
            actionHref="/connect"
          />
        </ScreenFrame>
      );
    }
    if (reason === "payer_not_approved") {
      return (
        <ScreenFrame kicker="03 · Profile" title="No income profile yet.">
          <Callout
            tone="error"
            title="We could not recognise who paid you"
            body="Orru only counts payments from employers, platforms and grant programmes."
            actionLabel="Use a different address"
            actionHref="/connect"
          />
        </ScreenFrame>
      );
    }
    if (reason === "not_consecutive") {
      return (
        <ScreenFrame kicker="03 · Profile" title="No income profile yet.">
          <Callout
            tone="error"
            title="There is a gap in the payment record"
            body="Consecutive periods are needed before a credential can be issued."
            actionLabel="Review payments"
            actionHref="/review"
          />
        </ScreenFrame>
      );
    }
    return (
      <ScreenFrame kicker="03 · Profile" title="No income profile yet.">
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
      <ScreenFrame kicker="03 · Profile" title="Loading your income profile.">
        <div className="h-72 max-w-md border border-rule bg-canvas-raised" aria-busy="true" />
      </ScreenFrame>
    );
  }

  const card =
    !qa && session.income
      ? credentialFromIncome(session.income)
      : demoCredential;

  return (
    <ScreenFrame
      kicker="03 · Profile"
      title="Your income, as a band."
      lede="This is what the credential will say. Exact payment amounts are not part of it."
      aside={<CredentialCard data={card} />}
    >
      <ul className="max-w-md">
        <li className="border-t border-rule py-4">
          <p className="display-sm text-ink">A band, not a number</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            The individual payment amounts are never written into this credential.
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
          See what gets shared
          <ArrowRight size={18} />
        </ButtonLink>
        <ButtonLink href="/consent" variant="outline">
          Share this credential
        </ButtonLink>
      </div>
    </ScreenFrame>
  );
}
