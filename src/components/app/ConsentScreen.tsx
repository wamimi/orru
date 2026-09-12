"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { ShareTicket } from "@/components/app/ShareTicket";
import { useFlowSession } from "@/components/app/useFlowSession";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CredentialCard } from "@/components/ui/CredentialCard";
import { aliasFromCredentialId } from "@/lib/alias";
import { parseOutcome } from "@/lib/app";
import { credentialFromIncome } from "@/lib/income-view";
import { demoCredential, demoRequest, expiredRequest } from "@/lib/mock";

export function ConsentScreen() {
  const search = useSearchParams();
  const outcome = parseOutcome(search.get("state"));
  const requestParam = search.get("request");
  const { session } = useFlowSession();
  const [shared, setShared] = useState(outcome === "success");
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const request =
    requestParam === expiredRequest.id || outcome === "error"
      ? expiredRequest
      : demoRequest;
  const bound = Boolean(requestParam || session.requestId);
  const expired = request.id === expiredRequest.id || outcome === "error";

  const card = (() => {
    if (session.income && session.credentialId) {
      return {
        ...credentialFromIncome(session.income),
        id: aliasFromCredentialId(session.credentialId),
        hexId: session.credentialId,
        issuedOn: "Issued",
        status: "Valid" as const,
      };
    }
    if (session.income) return credentialFromIncome(session.income);
    return {
      ...demoCredential,
      id: session.credentialId
        ? aliasFromCredentialId(session.credentialId)
        : "Not issued yet",
      hexId: session.credentialId,
      issuedOn: session.credentialId ? "Issued" : "Not issued yet",
      status: session.credentialId ? ("Valid" as const) : ("Preview" as const),
    };
  })();

  if (outcome === "empty") {
    return (
      <ScreenFrame kicker="05 · Share" title="There is nothing to share yet.">
        <Callout
          tone="empty"
          title="No statement on this address"
          body="Confirm your payments first. Sharing is a separate step, and you choose when it happens."
          actionLabel="Start from the beginning"
          actionHref="/connect"
        />
      </ScreenFrame>
    );
  }

  if (outcome === "loading") {
    return (
      <ScreenFrame kicker="05 · Share" title="Loading the share request.">
        <div className="h-64 bg-canvas-raised" aria-busy="true" />
      </ScreenFrame>
    );
  }

  if (expired && !shared) {
    return (
      <ScreenFrame kicker="05 · Share" title="This request is no longer open.">
        <Callout
          tone="error"
          title="The share window has ended"
          body="Ask the requester to send a new link. Your credential is unchanged. Only this window closed."
          actionLabel="Back to your profile"
          actionHref="/profile"
        />
      </ScreenFrame>
    );
  }

  if (shared) {
    return (
      <ScreenFrame
        kicker="05 · Share"
        title="Shared."
        lede="They can look this up without an account. You can stop sharing from your profile; the statement itself stays yours."
        aside={<CredentialCard data={card} />}
      >
        <div className="border-t-2 border-brand pt-6 md:pt-8">
          <p className="meta flex items-center gap-2 text-brand">
            <Check size={16} />
            Shared
          </p>
          <h2 className="display-md mt-3 text-ink">{request.party}</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
            {request.purpose}. Window: {request.expires}.
          </p>
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink href="/borrow">Draw against this statement</ButtonLink>
          <ButtonLink href="/profile" variant="quiet">
            Back to your profile
          </ButtonLink>
        </div>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame
      kicker="05 · Share"
      title="Share these fields, for this window."
      lede={
        bound
          ? "This page is tied to a specific requester. Nothing is sent until you confirm."
          : "You choose the requester and the window. Nothing is sent until you confirm."
      }
      aside={<CredentialCard data={card} />}
    >
      <ShareTicket
        party={request.party}
        purpose={request.purpose}
        expires={request.expires}
        id={request.id}
        fields={request.fields}
      />

      <p className="mt-10 max-w-xl text-sm leading-relaxed text-ink-faint">
        You can stop sharing later. Stopping does not delete the statement.
        Exact pay never goes into your statement, only a range.
      </p>

      {shareError ? (
        <div className="mt-8">
          <Callout tone="error" title="Nothing was shared" body={shareError} />
        </div>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-3">
        <Button
          disabled={sharing}
          onClick={() => {
            if (outcome === "success") {
              setShared(true);
              return;
            }
            setSharing(true);
            setShareError(null);
            fetch(`/api/share/${request.id}/consent`, {
              method: "POST",
              credentials: "include",
              headers: session.sessionToken
                ? { Authorization: `Bearer ${session.sessionToken}` }
                : undefined,
            })
              .then(async (response) => {
                if (!response.ok) {
                  const body = (await response.json()) as { error?: string };
                  throw new Error(body.error ?? "Nothing was shared.");
                }
                setShared(true);
              })
              .catch((error: unknown) => {
                setShareError(
                  error instanceof Error
                    ? error.message
                    : "Nothing was shared.",
                );
              })
              .finally(() => setSharing(false));
          }}
        >
          {sharing ? "Sharing…" : "Share these fields"}
        </Button>
        <ButtonLink href="/credential" variant="quiet">
          Back
        </ButtonLink>
      </div>
    </ScreenFrame>
  );
}
