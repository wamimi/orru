"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSignTypedData } from "@privy-io/react-auth";
import { ArrowRight } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { useFlowSession } from "@/components/app/useFlowSession";
import { Button, ButtonLink } from "@/components/ui/Button";
import { HiddenFields, SharedFields } from "@/components/ui/FieldDisclosure";
import { parseOutcome, truncateAddress } from "@/lib/app";
import { creditcoinTxUrl, truncateHex } from "@/lib/chain";
import type { ProofBundle } from "@/lib/issue-types";
import {
  sharedFieldsFromIncome,
  withheldFields,
} from "@/lib/income-view";
import { demoCredential, sharedWithLender, withheldFromLender } from "@/lib/mock";

type IssueStage = "idle" | "preparing" | "signing" | "sending" | "done" | "error";

const STAGE_COPY: Record<Exclude<IssueStage, "idle" | "done" | "error">, string> = {
  preparing: "Checking your income pattern.",
  signing: "Sign to issue your statement — this is free.",
  sending: "Writing your statement.",
};

const privyConfigured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export function CredentialScreen() {
  const outcome = parseOutcome(useSearchParams().get("state"));
  const { session, update } = useFlowSession();
  const [stage, setStage] = useState<IssueStage>(
    session.credentialId ? "done" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ id: string; txHash: string } | null>(
    session.credentialId ? { id: session.credentialId, txHash: "" } : null,
  );

  const shared = useMemo(
    () =>
      session.income ? sharedFieldsFromIncome(session.income) : sharedWithLender,
    [session.income],
  );

  if (outcome === "empty") {
    return (
      <ScreenFrame kicker="04 · Credential" title="No statement to preview.">
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
      <ScreenFrame kicker="04 · Credential" title="This statement cannot be shown.">
        <Callout
          tone="error"
          title="Status could not be read"
          body="The issuance record was not found. Without it, this statement cannot be checked."
          actionLabel="Back to profile"
          actionHref="/profile"
        />
      </ScreenFrame>
    );
  }

  if (outcome === "loading") {
    return (
      <ScreenFrame kicker="04 · Credential" title="Loading the statement.">
        <div className="grid gap-8 md:grid-cols-2" aria-busy="true">
          <div className="h-56 bg-canvas-raised" />
          <div className="h-56 bg-canvas-raised" />
        </div>
      </ScreenFrame>
    );
  }

  const working = stage === "preparing" || stage === "signing" || stage === "sending";

  return (
    <ScreenFrame
      kicker="04 · Credential"
      title="This is what leaves."
      lede="Whoever you send it to sees a range and a status. Exact pay never goes into your statement — only a range."
    >
      <div className="grid gap-12 md:grid-cols-2 md:gap-16">
        <div className="border-t-2 border-brand pt-6 md:pt-8">
          <h2 className="display-md text-ink">Shared</h2>
          <div className="mt-6">
            <SharedFields fields={shared} />
          </div>
        </div>
        <div className="border-t-2 border-rule-strong pt-6 md:pt-8">
          <h2 className="display-md text-ink-faint">Withheld</h2>
          <div className="mt-6">
            <HiddenFields fields={session.income ? withheldFields : withheldFromLender} />
          </div>
        </div>
      </div>

      <p className="meta mt-12 text-ink-faint">
        {issued ? truncateHex(issued.id) : demoCredential.id}
        <span className="mx-3 text-rule-strong">·</span>
        {session.income?.payerName ?? demoCredential.issuanceRef}
      </p>

      {working ? (
        <p className="mt-8 text-sm leading-relaxed text-ink-soft">
          {STAGE_COPY[stage]}
        </p>
      ) : null}

      {stage === "error" && error ? (
        <div className="mt-8">
          <Callout tone="error" title="Your statement could not be issued" body={error} />
        </div>
      ) : null}

      {stage === "done" && issued ? (
        <div className="mt-8">
          <Callout
            tone="info"
            title="Your statement is issued"
            body={`Anyone can check ${truncateHex(issued.id)} without an account.`}
          >
            <div className="mt-5 flex flex-wrap gap-3">
              <ButtonLink href={`/verify/${issued.id}`}>Open the public page</ButtonLink>
              {issued.txHash ? (
                <a
                  href={creditcoinTxUrl(issued.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="meta text-brand hover:text-brand-hover"
                >
                  Open the chain confirmation
                </a>
              ) : null}
            </div>
          </Callout>
        </div>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-3">
        {stage !== "done" && privyConfigured ? (
          <IssueActions
            address={session.address}
            sessionToken={session.sessionToken}
            working={working}
            onStage={setStage}
            onError={setError}
            onIssued={(value) => {
              setIssued(value);
              update({ credentialId: value.id });
            }}
          />
        ) : stage !== "done" ? (
          <ButtonLink href="/consent">
            Continue to sharing
            <ArrowRight size={18} />
          </ButtonLink>
        ) : (
          <ButtonLink href="/consent">
            Continue to sharing
            <ArrowRight size={18} />
          </ButtonLink>
        )}
        {session.address ? (
          <p className="meta self-center text-ink-faint">
            {truncateAddress(session.address)}
          </p>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

function IssueActions({
  address,
  sessionToken,
  working,
  onStage,
  onError,
  onIssued,
}: {
  address: string | null;
  sessionToken: string | null;
  working: boolean;
  onStage: (stage: IssueStage) => void;
  onError: (message: string) => void;
  onIssued: (value: { id: string; txHash: string }) => void;
}) {
  const { signTypedData } = useSignTypedData();

  async function onIssue() {
    if (!address || !sessionToken) {
      onError("Sign the short message before we look anything up.");
      onStage("error");
      return;
    }
    onError("");
    onStage("preparing");
    try {
      const prepare = await fetch(`/api/credential/prepare?address=${address}`, {
        credentials: "include",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const prepared = (await prepare.json()) as {
        bundle?: ProofBundle;
        typedData?: {
          domain: Record<string, unknown>;
          types: Record<string, { name: string; type: string }[]>;
          primaryType: string;
          message: Record<string, unknown>;
        };
        error?: string;
      };
      if (!prepare.ok || !prepared.typedData || !prepared.bundle) {
        onError(prepared.error ?? "Checking your income is not ready yet.");
        onStage("error");
        return;
      }

      onStage("signing");
      const { signature } = await signTypedData(
        {
          domain: prepared.typedData.domain,
          types: prepared.typedData.types,
          primaryType: prepared.typedData.primaryType,
          message: prepared.typedData.message,
        },
        {
          address,
          uiOptions: { title: "Sign to issue your statement — this is free" },
        },
      );

      onStage("sending");
      const bundle = prepared.bundle;
      const issuedResponse = await fetch("/api/credential/issue", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          ...bundle,
          documentHash: prepared.typedData.message.documentHash,
          deadline: String(prepared.typedData.message.deadline),
          subjectAuthorization: signature,
        }),
      });
      const issuedBody = (await issuedResponse.json()) as {
        credentialId?: string;
        txHash?: string;
        error?: string;
      };
      if (!issuedResponse.ok || !issuedBody.credentialId) {
        onError(issuedBody.error ?? "Something went wrong. Please try again.");
        onStage("error");
        return;
      }
      onIssued({ id: issuedBody.credentialId, txHash: issuedBody.txHash ?? "" });
      onStage("done");
    } catch {
      onError("Something went wrong. Please try again.");
      onStage("error");
    }
  }

  return (
    <Button onClick={() => void onIssue()} disabled={working}>
      {working ? "Checking your income…" : "Issue your statement"}
    </Button>
  );
}
