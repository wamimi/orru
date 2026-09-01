"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { useFlowSession } from "@/components/app/useFlowSession";
import { Button, ButtonLink } from "@/components/ui/Button";
import { parseOutcome } from "@/lib/app";
import { demoRequest, expiredRequest } from "@/lib/mock";

export function ConsentScreen() {
  const search = useSearchParams();
  const outcome = parseOutcome(search.get("state"));
  const requestParam = search.get("request");
  const { session } = useFlowSession();
  const [shared, setShared] = useState(outcome === "success");

  const request =
    requestParam === expiredRequest.id || outcome === "error"
      ? expiredRequest
      : demoRequest;
  const bound = Boolean(requestParam || session.requestId);
  const expired = request.id === expiredRequest.id || outcome === "error";

  if (outcome === "empty") {
    return (
      <ScreenFrame kicker="05 · Share" title="There is nothing to share yet.">
        <Callout
          tone="empty"
          title="No credential on this address"
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
        <div className="h-64 rounded-card bg-canvas-raised" aria-busy="true" />
      </ScreenFrame>
    );
  }

  if (expired && !shared) {
    return (
      <ScreenFrame kicker="05 · Share" title="This request is no longer open.">
        <Callout
          tone="error"
          title="The share window has ended"
          body="Ask the requester to send a new link. Your credential is unchanged — only this window closed."
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
        lede="They can look this up without an account. You can stop sharing from your profile; the credential itself stays yours."
      >
        <div className="flex items-start gap-3 rounded-card border border-rule bg-paper px-5 py-5">
          <Check size={20} className="mt-0.5 text-brand" />
          <div>
            <p className="display-sm text-ink">{request.party}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {request.purpose}. Window: {request.expires}.
            </p>
          </div>
        </div>
        <div className="mt-10">
          <ButtonLink href="/profile">Back to your profile</ButtonLink>
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
    >
      <div className="rounded-card border border-rule bg-paper px-5">
        <div className="flex flex-col gap-1 border-b border-rule py-3">
          <span className="eyebrow text-ink-faint">Requester</span>
          <span className="meta text-ink">{request.party}</span>
        </div>
        <div className="flex flex-col gap-1 border-b border-rule py-3">
          <span className="eyebrow text-ink-faint">Purpose</span>
          <span className="text-sm text-ink">{request.purpose}</span>
        </div>
        <div className="flex flex-col gap-1 border-b border-rule py-3">
          <span className="eyebrow text-ink-faint">Window</span>
          <span className="meta text-ink">{request.expires}</span>
        </div>
        <div className="flex flex-col gap-1 py-3">
          <span className="eyebrow text-ink-faint">Request</span>
          <span className="meta text-ink">{request.id}</span>
        </div>
      </div>

      <div className="mt-8">
        <p className="eyebrow text-ink-faint">Fields included</p>
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {request.fields.map((field) => (
            <li key={field} className="py-3 text-sm text-ink">
              {field}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-8 max-w-xl text-sm leading-relaxed text-ink-faint">
        You can stop sharing later. Stopping does not delete the credential.
        Exact amounts are not in these fields.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button onClick={() => setShared(true)}>Share these fields</Button>
        <ButtonLink href="/credential" variant="quiet">
          Back
        </ButtonLink>
      </div>
    </ScreenFrame>
  );
}
