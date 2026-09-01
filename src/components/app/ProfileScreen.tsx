"use client";

import { useSearchParams } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { ButtonLink } from "@/components/ui/Button";
import { CredentialCard } from "@/components/ui/CredentialCard";
import { parseOutcome } from "@/lib/app";
import { demoCredential } from "@/lib/mock";

export function ProfileScreen() {
  const outcome = parseOutcome(useSearchParams().get("state"));

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
        <div className="max-w-md" aria-busy="true">
          <div className="h-72 rounded-card border border-rule bg-canvas-raised" />
        </div>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame
      kicker="03 · Profile"
      title="Your income, as a band."
      lede="This is what the credential will say. Exact payment amounts are not part of it."
    >
      <div className="max-w-md">
        <CredentialCard data={demoCredential} />
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/credential">
          See what a lender sees
          <ArrowRight size={18} />
        </ButtonLink>
        <ButtonLink href="/consent" variant="outline">
          Share this credential
        </ButtonLink>
      </div>
    </ScreenFrame>
  );
}
