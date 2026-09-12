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
import type { IncomeLookup } from "@/lib/income-types";
import type { ProofBundle } from "@/lib/issue-types";
import { prover, type PaymentSlip, type ProveProgress } from "@/lib/prove";
import {
  sharedFieldsFromIncome,
  withheldFields,
} from "@/lib/income-view";
import { aliasFromCredentialId, verifyPath } from "@/lib/alias";
import { sharedWithLender, withheldFromLender } from "@/lib/mock";

type IssueStage =
  | "idle"
  | "reading"
  | "loading"
  | "witness"
  | "building"
  | "preparing"
  | "signing"
  | "sending"
  | "done"
  | "error";

const STAGE_COPY: Record<Exclude<IssueStage, "idle" | "done" | "error">, string> = {
  reading: "Reading your payment record.",
  loading: "Getting this device ready.",
  witness: "Checking your income pattern.",
  building: "Building your statement here, on this device.",
  preparing: "Preparing the authorisation.",
  signing: "Sign to issue your statement — this is free.",
  sending: "Writing your statement.",
};

const STAGE_FOR: Record<ProveProgress["stage"], IssueStage> = {
  loading: "loading",
  witness: "witness",
  proving: "building",
  done: "preparing",
};

const privyConfigured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

/** Escape hatch: serves the pre-built statement instead of building one here. */
const usePrebuilt = process.env.NEXT_PUBLIC_ORRU_PREBUILT === "1";

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

  const working = stage !== "idle" && stage !== "done" && stage !== "error";

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
        {issued
          ? `${aliasFromCredentialId(issued.id)} · ${truncateHex(issued.id)}`
          : "Not issued yet"}
        <span className="mx-3 text-rule-strong">·</span>
        {session.income?.payerName ?? "Verified employer"}
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
            body={`Anyone can check ${aliasFromCredentialId(issued.id)} without an account.`}
          >
            <div className="mt-5 flex flex-wrap gap-3">
              <ButtonLink href="/borrow">Borrow against it</ButtonLink>
              <ButtonLink href={verifyPath(aliasFromCredentialId(issued.id))} variant="outline">
                Open the public page
              </ButtonLink>
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
            income={session.income}
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
  income,
  sessionToken,
  working,
  onStage,
  onError,
  onIssued,
}: {
  address: string | null;
  income: IncomeLookup | null;
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

    try {
      const employer = income?.evidencePayer ?? income?.payerAddress ?? null;
      const sealed = usePrebuilt
        ? await prebuilt(address, sessionToken, onStage)
        : await buildHere(address, employer, sessionToken, onStage);

      // The subject is the first public field. If it is not this wallet, the
      // statement was built over someone else's record and must not be signed.
      if (!sealed.publicInputs[0]?.toLowerCase().endsWith(address.slice(2).toLowerCase())) {
        throw new Error("That statement was not built for this wallet.");
      }

      onStage("signing");
      const { signature } = await signTypedData(
        {
          domain: sealed.typedData.domain,
          types: sealed.typedData.types,
          primaryType: sealed.typedData.primaryType,
          message: sealed.typedData.message,
        },
        {
          address,
          uiOptions: { title: "Sign to issue your statement — this is free" },
        },
      );

      onStage("sending");
      const issuedResponse = await fetch("/api/credential/issue", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          ...sealed.statement,
          evidencePayer: sealed.evidencePayer,
          documentHash: sealed.typedData.message.documentHash,
          deadline: String(sealed.typedData.message.deadline),
          subjectAuthorization: signature,
        }),
      });
      const issuedBody = (await issuedResponse.json()) as {
        credentialId?: string;
        txHash?: string;
        error?: string;
      };
      // A statement already written for these cycles comes back with its id.
      // That is the outcome the user wanted, so show it rather than an error.
      if (!issuedBody.credentialId) {
        onError(issuedBody.error ?? "Something went wrong. Please try again.");
        onStage("error");
        return;
      }
      onIssued({ id: issuedBody.credentialId, txHash: issuedBody.txHash ?? "" });
      onStage("done");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
      onStage("error");
    }
  }

  return (
    <Button onClick={() => void onIssue()} disabled={working}>
      {working ? "Checking your income…" : "Issue your statement"}
    </Button>
  );
}

type TypedData = {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

type Sealed = {
  statement: { publicInputs: `0x${string}`[] };
  publicInputs: `0x${string}`[];
  evidencePayer: string;
  typedData: TypedData;
};

/**
 * Builds the statement on this machine.
 *
 * The amounts and salts arrive from the employer's record, are used here, and
 * are never sent anywhere. What leaves is the finished statement, which carries
 * a range and nothing else. This is the claim the product rests on, so there is
 * no quiet fallback: if it fails, the flow stops and says so.
 */
async function buildHere(
  address: string,
  employer: string | null,
  sessionToken: string,
  onStage: (stage: IssueStage) => void,
): Promise<Sealed> {
  if (!employer) throw new Error("Choose a verified employer first.");

  onStage("reading");
  const response = await fetch(`/api/slips/${address}?payer=${employer}`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  const book = (await response.json()) as {
    band?: number;
    slips?: PaymentSlip[];
    error?: string;
  };
  if (!response.ok || !book.slips || book.band === undefined) {
    throw new Error(book.error ?? "Your payment record is not ready yet.");
  }

  // Anything the prover reports is a technical failure and reads like one, so
  // it is kept to the console. What the screen shows stays in the flow's own
  // vocabulary.
  let statement;
  try {
    statement = await prover.prove(
      { recipient: address as `0x${string}`, band: book.band, slips: book.slips },
      ({ stage }) => onStage(STAGE_FOR[stage]),
    );
  } catch (cause) {
    console.error("[orru] building the statement failed", cause);
    throw new Error("Your statement could not be built on this device.");
  }

  onStage("preparing");
  const prepare = await fetch("/api/credential/prepare", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ ...statement, evidencePayer: employer }),
  });
  const prepared = (await prepare.json()) as { typedData?: TypedData; error?: string };
  if (!prepare.ok || !prepared.typedData) {
    throw new Error(prepared.error ?? "Your statement could not be prepared.");
  }

  return {
    statement,
    publicInputs: statement.publicInputs,
    evidencePayer: employer,
    typedData: prepared.typedData,
  };
}

/** The pre-built statement. Only reached when NEXT_PUBLIC_ORRU_PREBUILT=1. */
async function prebuilt(
  address: string,
  sessionToken: string,
  onStage: (stage: IssueStage) => void,
): Promise<Sealed> {
  onStage("preparing");
  const prepare = await fetch(`/api/credential/prepare?address=${address}`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  const prepared = (await prepare.json()) as {
    bundle?: ProofBundle;
    typedData?: TypedData;
    error?: string;
  };
  if (!prepare.ok || !prepared.typedData || !prepared.bundle) {
    throw new Error(prepared.error ?? "Checking your income is not ready yet.");
  }
  return {
    statement: prepared.bundle,
    publicInputs: prepared.bundle.publicInputs,
    evidencePayer: prepared.bundle.evidencePayer,
    typedData: prepared.typedData,
  };
}
