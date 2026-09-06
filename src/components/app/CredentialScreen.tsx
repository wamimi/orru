"use client";

import { useSearchParams } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { ButtonLink } from "@/components/ui/Button";
import { HiddenFields, SharedFields } from "@/components/ui/FieldDisclosure";
import { parseOutcome } from "@/lib/app";
import { demoCredential, sharedWithLender, withheldFromLender } from "@/lib/mock";

export function CredentialScreen() {
  const outcome = parseOutcome(useSearchParams().get("state"));

  if (outcome === "empty") {
    return (
      <ScreenFrame kicker="04 · Credential" title="No credential to preview.">
        <Callout
          tone="empty"
          title="Nothing has been issued yet"
          body="Once payments are confirmed, you will see exactly which fields would leave this page."
          actionLabel="Review payments"
          actionHref="/review"
        />
      </ScreenFrame>
    );
  }

  if (outcome === "error") {
    return (
      <ScreenFrame kicker="04 · Credential" title="This credential cannot be shown.">
        <Callout
          tone="error"
          title="Status could not be read"
          body="The issuance record was not found. Without it, this credential cannot be checked."
          actionLabel="Back to profile"
          actionHref="/profile"
        />
      </ScreenFrame>
    );
  }

  if (outcome === "loading") {
    return (
      <ScreenFrame kicker="04 · Credential" title="Loading the credential.">
        <div className="grid gap-8 md:grid-cols-2" aria-busy="true">
          <div className="h-56 bg-canvas-raised" />
          <div className="h-56 bg-canvas-raised" />
        </div>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame
      kicker="04 · Credential"
      title="This is what leaves."
      lede="Whoever you send it to sees a band and a status. They do not see amounts, names, or your full history."
    >
      <div className="grid gap-12 md:grid-cols-2 md:gap-16">
        <div className="border-t-2 border-brand pt-6 md:pt-8">
          <h2 className="display-md text-ink">Shared</h2>
          <div className="mt-6">
            <SharedFields fields={sharedWithLender} />
          </div>
        </div>
        <div className="border-t-2 border-rule-strong pt-6 md:pt-8">
          <h2 className="display-md text-ink-faint">Withheld</h2>
          <div className="mt-6">
            <HiddenFields fields={withheldFromLender} />
          </div>
        </div>
      </div>

      <p className="meta mt-12 text-ink-faint">
        {demoCredential.id}
        <span className="mx-3 text-rule-strong">·</span>
        {demoCredential.issuanceRef}
      </p>

      <div className="mt-10">
        <ButtonLink href="/consent">
          Continue to sharing
          <ArrowRight size={18} />
        </ButtonLink>
      </div>
    </ScreenFrame>
  );
}
