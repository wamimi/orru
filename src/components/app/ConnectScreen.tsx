"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, Wallet } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { useFlowSession } from "@/components/app/useFlowSession";
import { ButtonLink } from "@/components/ui/Button";
import { parseOutcome, truncateAddress } from "@/lib/app";

export function ConnectScreen() {
  const search = useSearchParams();
  const outcome = parseOutcome(search.get("state"));
  const requestId = search.get("request");
  const { session, ready, update } = useFlowSession();

  useEffect(() => {
    if (!requestId || requestId === session.requestId) return;
    const frame = requestAnimationFrame(() => update({ requestId }));
    return () => cancelAnimationFrame(frame);
  }, [requestId, session.requestId, update]);

  const qaReady = outcome === "success";
  const connected = qaReady || session.connected;
  const signed = qaReady || session.signed;
  const canContinue = qaReady || (ready && connected && signed);
  const reviewHref = requestId
    ? `/review?request=${encodeURIComponent(requestId)}`
    : "/review";

  if (outcome === "empty") {
    return (
      <ScreenFrame
        kicker="Set up"
        title="No wallet was found."
        lede="Install a wallet, then use the control in the top-right corner to connect the payout account where you receive income."
      >
        <Callout
          tone="empty"
          title="A wallet is required"
          body="Orru reads the connected address and asks for a free signature. It never receives permission to move funds."
          actionLabel="Back to the website"
          actionHref="/"
        />
      </ScreenFrame>
    );
  }

  if (outcome === "error") {
    return (
      <ScreenFrame
        kicker="Set up"
        title="The wallet setup did not complete."
        lede="Use the wallet control in the top-right corner to try again."
      >
        <Callout
          tone="error"
          title="Nothing was connected"
          body="Check the selected account and network, then reconnect. No funds moved."
        />
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame
      kicker="Set up"
      title="Connect the account where you get paid."
      lede="Wallet setup now stays in the top-right corner, so your workspace remains available while you move through every step."
    >
      <div className="connect-status">
        <div className={connected ? "is-complete" : ""}>
          <span className="connect-status__icon">
            {connected ? <Check size={17} weight="bold" /> : <Wallet size={17} />}
          </span>
          <div>
            <p>Connected payout account</p>
            <span>
              {connected
                ? session.address
                  ? truncateAddress(session.address)
                  : "Connected"
                : "Use Connect wallet in the top-right corner"}
            </span>
          </div>
          <strong>{connected ? "Connected" : "Required"}</strong>
        </div>

        <div className={signed ? "is-complete" : ""}>
          <span className="connect-status__icon">
            <Check size={17} weight={signed ? "bold" : "regular"} />
          </span>
          <div>
            <p>Ownership confirmation</p>
            <span>
              {signed
                ? "Free signature confirmed"
                : connected
                  ? "Choose Verify wallet in the top-right corner"
                  : "Available after connecting"}
            </span>
          </div>
          <strong>{signed ? "Confirmed" : "Pending"}</strong>
        </div>
      </div>

      <div className="connect-actions">
        {canContinue ? (
          <ButtonLink href={reviewHref}>
            Review your income
            <ArrowRight size={17} />
          </ButtonLink>
        ) : (
          <p className="meta text-ink-faint">
            Complete both checks from the wallet control above to continue.
          </p>
        )}
        <ButtonLink href="/app" variant="quiet">
          Back to overview
        </ButtonLink>
      </div>
    </ScreenFrame>
  );
}
