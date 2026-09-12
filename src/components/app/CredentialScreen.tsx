"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ArrowSquareOut, ShareNetwork } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { useFlowSession } from "@/components/app/useFlowSession";
import { useLinkedWallet } from "@/components/app/useLinkedWallet";
import { Button, ButtonLink } from "@/components/ui/Button";
import { HiddenFields, SharedFields } from "@/components/ui/FieldDisclosure";
import { parseOutcome, truncateAddress } from "@/lib/app";
import { creditcoinTxUrl, truncateHex } from "@/lib/chain";
import type { IncomeLookup } from "@/lib/income-types";
import type { ProofBundle } from "@/lib/issue-types";
import { prover, type PaymentSlip, type ProveProgress } from "@/lib/prove";
import { signTypedDataWith, signingProblem } from "@/lib/wallet-sign";
import type { Statement, StatementsPayload } from "@/lib/statements";
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
  | "confirming"
  | "done"
  | "error";

const STAGE_COPY: Record<Exclude<IssueStage, "idle" | "done" | "error">, string> = {
  reading: "Reading your payment record.",
  loading: "Getting this device ready.",
  witness: "Checking your income pattern.",
  building: "Building your statement here, on this device.",
  preparing: "Preparing the authorisation.",
  signing: "Sign to issue your statement. This is free.",
  sending: "Writing your statement.",
  confirming: "Written to Creditcoin, confirming…",
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

type IssuedStatement = {
  id: string;
  txHash: string;
  issuedAt: string | null;
  remaining: string | null;
};

async function statementsFor(
  address: string,
  sessionToken: string,
  fresh = false,
): Promise<StatementsPayload> {
  const response = await fetch(`/api/statements/${address}${fresh ? "?fresh=1" : ""}`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${sessionToken}` },
    cache: "no-store",
  });
  if (response.status === 401) throw new Error("expired");
  if (!response.ok) throw new Error("lookup");
  return (await response.json()) as StatementsPayload;
}

function selectedPayer(income: IncomeLookup | null): string | null {
  return income?.evidencePayer ?? income?.payerAddress ?? null;
}

function matchingStatement(
  statements: Statement[],
  payer: string | null,
  credentialId: string | null,
): Statement | null {
  if (payer) {
    return statements.find(
      (row) => row.status === "valid" && row.evidencePayer.toLowerCase() === payer.toLowerCase(),
    ) ?? null;
  }
  if (credentialId) {
    return statements.find(
      (row) => row.status === "valid" && row.credentialId.toLowerCase() === credentialId.toLowerCase(),
    ) ?? null;
  }
  return null;
}

function issuedFrom(statement: Statement, storedTxHash: string | null): IssuedStatement {
  return {
    id: statement.credentialId,
    txHash: statement.issuanceTx ?? storedTxHash ?? "",
    issuedAt: statement.issuedAt,
    remaining: statement.remaining,
  };
}

function formatDate(value: string | null): string {
  if (!value) return "Date pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTokenAmount(value: string | null): string {
  if (value === null) return "See what is available now";
  const amount = Number(BigInt(value)) / 1_000_000;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} mUSDC available now`;
}

async function waitForValidStatement(credentialId: string, signal?: AbortSignal): Promise<void> {
  const attempts = 30;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`/api/verify/${encodeURIComponent(credentialId)}`, {
      cache: "no-store",
      signal,
    });
    if (response.ok) {
      const body = (await response.json()) as { status?: string };
      if (body.status === "valid") return;
      if (body.status === "revoked") throw new Error("This statement is no longer active.");
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
  throw new Error("Creditcoin is still confirming this statement. Refresh this page in a moment.");
}

export function CredentialScreen() {
  const outcome = parseOutcome(useSearchParams().get("state"));
  const { session, ready, update } = useFlowSession();
  const [stage, setStage] = useState<IssueStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedStatement | null>(null);
  const [statementLookup, setStatementLookup] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const confirmingIssue = useRef(false);

  const shared = useMemo(
    () =>
      session.income ? sharedFieldsFromIncome(session.income) : sharedWithLender,
    [session.income],
  );

  useEffect(() => {
    if (outcome !== null || !ready || !session.address || !session.sessionToken) return;

    let cancelled = false;
    let confirmingStored = false;
    const controller = new AbortController();
    const payer = selectedPayer(session.income);
    const address = session.address;
    const sessionToken = session.sessionToken;

    statementsFor(address, sessionToken)
      .then(async (payload) => {
        if (cancelled) return;
        const existing = matchingStatement(
          payload.statements,
          payer,
          session.credentialId,
        );
        setStatementLookup("ready");

        if (existing) {
          const value = issuedFrom(existing, session.credentialTxHash);
          setIssued(value);
          if (confirmingIssue.current) return;
          setStage("done");
          if (
            session.credentialId !== value.id ||
            session.credentialTxHash !== (value.txHash || null)
          ) {
            update({
              credentialId: value.id,
              credentialTxHash: value.txHash || null,
            });
          }
          return;
        }

        if (!session.credentialId || !session.credentialTxHash) return;
        const pending = {
          id: session.credentialId,
          txHash: session.credentialTxHash,
          issuedAt: null,
          remaining: null,
        };
        setIssued(pending);
        setStage("confirming");
        confirmingStored = true;
        await waitForValidStatement(session.credentialId, controller.signal);
        if (cancelled) return;
        setStage("done");

        let refreshed: StatementsPayload;
        try {
          refreshed = await statementsFor(address, sessionToken, true);
        } catch {
          return;
        }
        if (cancelled) return;
        const confirmed = matchingStatement(
          refreshed.statements,
          payer,
          session.credentialId,
        );
        setIssued(confirmed ? issuedFrom(confirmed, session.credentialTxHash) : pending);
      })
      .catch((cause: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        if (confirmingIssue.current) return;
        if (confirmingStored) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Creditcoin is still confirming this statement.",
          );
          setStage("error");
          return;
        }
        setStatementLookup("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    outcome,
    ready,
    session.address,
    session.credentialId,
    session.credentialTxHash,
    session.income,
    session.sessionToken,
    update,
  ]);

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

  const checkingExisting =
    outcome === null &&
    (!ready ||
      (Boolean(session.address && session.sessionToken) && statementLookup === "loading"));
  const working = stage !== "idle" && stage !== "done" && stage !== "error";

  return (
    <ScreenFrame
      kicker="04 · Credential"
      title="This is what leaves."
      lede="Whoever you send it to sees a range and a status. Exact pay never goes into your statement, only a range."
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

      {checkingExisting ? (
        <p className="mt-8 text-sm leading-relaxed text-ink-soft" aria-busy="true">
          Checking for an existing statement…
        </p>
      ) : working && stage !== "confirming" ? (
        <p className="mt-8 text-sm leading-relaxed text-ink-soft">
          {STAGE_COPY[stage]}
        </p>
      ) : null}

      {statementLookup === "error" ? (
        <div className="mt-8">
          <Callout
            tone="error"
            title="Your statements could not be read"
            body="This is a problem reading Creditcoin. Refresh the page to try again."
          />
        </div>
      ) : null}

      {stage === "confirming" && issued ? (
        <div className="mt-8">
          <Callout
            tone="info"
            title="Written to Creditcoin, confirming…"
            body="The public page will open after Creditcoin returns the new statement."
          >
            {issued.txHash ? (
              <div className="mt-5">
                <ButtonLink
                  href={creditcoinTxUrl(issued.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  variant="outline"
                >
                  Open the chain confirmation
                  <ArrowSquareOut size={16} />
                </ButtonLink>
              </div>
            ) : null}
          </Callout>
        </div>
      ) : null}

      {stage === "error" && error ? (
        <div className="mt-8">
          <Callout tone="error" title="Your statement could not be issued" body={error}>
            {issued?.txHash ? (
              <div className="mt-5">
                <ButtonLink
                  href={creditcoinTxUrl(issued.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  variant="outline"
                >
                  Open the chain confirmation
                  <ArrowSquareOut size={16} />
                </ButtonLink>
              </div>
            ) : null}
          </Callout>
        </div>
      ) : null}

      {stage === "done" && issued ? (
        <div className="mt-8">
          <Callout
            tone="info"
            title="Your statement is issued"
            body={
              issued.issuedAt
                ? `Issued on ${formatDate(issued.issuedAt)}. Anyone can check ${aliasFromCredentialId(issued.id)} without an account.`
                : `Anyone can check ${aliasFromCredentialId(issued.id)} without an account.`
            }
          >
            <div className="mt-5 flex flex-wrap gap-3">
              <ButtonLink href={`${verifyPath(issued.id)}?fresh=1`} variant="outline">
                Open the public page
              </ButtonLink>
              {issued.txHash ? (
                <ButtonLink
                  href={creditcoinTxUrl(issued.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  variant="outline"
                >
                  Open the chain confirmation
                  <ArrowSquareOut size={16} />
                </ButtonLink>
              ) : null}
            </div>
          </Callout>

          <section className="mt-10" aria-labelledby="credential-next-heading">
            <h2 id="credential-next-heading" className="display-sm text-ink">
              What next
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr]">
              <Link
                href="/borrow"
                className="flex min-h-40 flex-col justify-between rounded-control bg-brand p-6 text-canvas transition-transform active:scale-[0.985]"
              >
                <span className="display-sm">Borrow against it</span>
                <span className="flex items-center justify-between gap-4 text-sm font-medium">
                  {formatTokenAmount(issued.remaining)}
                  <ArrowRight size={18} />
                </span>
              </Link>
              <Link
                href="/consent"
                className="flex min-h-40 flex-col justify-between rounded-control border border-rule-strong bg-canvas-raised p-6 text-ink transition-tone hover:border-ink-faint active:scale-[0.985]"
              >
                <span className="flex items-center gap-2 display-sm">
                  <ShareNetwork size={19} />
                  Share with a lender
                </span>
                <span className="text-sm leading-relaxed text-ink-soft">
                  Makes a link a lender can open. Nothing is shared until you send it.
                </span>
              </Link>
            </div>
          </section>
        </div>
      ) : null}

      {stage !== "done" && stage !== "confirming" && !checkingExisting ? (
        <div className="mt-10 flex flex-wrap gap-3">
          {statementLookup !== "error" && privyConfigured ? (
            <IssueActions
              address={session.address}
              income={session.income}
              sessionToken={session.sessionToken}
              working={working}
              onStage={setStage}
              onError={setError}
              onIssued={(value) => {
                confirmingIssue.current = true;
                setIssued({ ...value, issuedAt: null, remaining: null });
                update({ credentialId: value.id, credentialTxHash: value.txHash || null });
              }}
              onConfirmed={async (value) => {
                confirmingIssue.current = false;
                setIssued((current) => current ?? { ...value, issuedAt: null, remaining: null });
                if (!session.address || !session.sessionToken) return;
                try {
                  const payload = await statementsFor(
                    session.address,
                    session.sessionToken,
                    true,
                  );
                  const confirmed = payload.statements.find(
                    (row) => row.credentialId.toLowerCase() === value.id.toLowerCase(),
                  );
                  if (confirmed) {
                    const issuedValue = issuedFrom(confirmed, value.txHash);
                    setIssued(issuedValue);
                    update({
                      credentialId: issuedValue.id,
                      credentialTxHash: issuedValue.txHash || null,
                    });
                  }
                } catch {
                  return;
                }
              }}
            />
          ) : statementLookup !== "error" ? (
            <ButtonLink href="/consent">
              Share with a lender
              <ArrowRight size={18} />
            </ButtonLink>
          ) : null}
          {session.address ? (
            <p className="meta self-center text-ink-faint">
              {truncateAddress(session.address)}
            </p>
          ) : null}
        </div>
      ) : null}
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
  onConfirmed,
}: {
  address: string | null;
  income: IncomeLookup | null;
  sessionToken: string | null;
  working: boolean;
  onStage: (stage: IssueStage) => void;
  onError: (message: string) => void;
  onIssued: (value: { id: string; txHash: string }) => void;
  onConfirmed: (value: { id: string; txHash: string }) => Promise<void>;
}) {
  const { wallet } = useLinkedWallet();

  async function onIssue() {
    if (!address || !sessionToken) {
      onError("Sign the short message before we look anything up.");
      onStage("error");
      return;
    }
    if (!wallet || wallet.address.toLowerCase() !== address.toLowerCase()) {
      onError(
        `Your wallet no longer shows ${truncateAddress(address)}. Switch back to it, or reconnect from the top-right corner.`,
      );
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
      const signature = await signTypedDataWith(wallet, {
        domain: sealed.typedData.domain,
        types: sealed.typedData.types,
        primaryType: sealed.typedData.primaryType,
        message: sealed.typedData.message,
      });

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
      const value = { id: issuedBody.credentialId, txHash: issuedBody.txHash ?? "" };
      onIssued(value);
      onStage("confirming");
      await waitForValidStatement(issuedBody.credentialId);
      await onConfirmed(value);
      onStage("done");
    } catch (cause) {
      onError(signingProblem(cause, "Something went wrong. Please try again."));
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
