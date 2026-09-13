import type { Metadata } from "next";
import { Suspense } from "react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { PublicChrome } from "@/components/public/PublicChrome";
import { LocalWhen } from "@/components/ui/LocalWhen";
import { CopyableId } from "@/components/ui/CopyableId";
import { aliasFromCredentialId, parseStatementRef } from "@/lib/alias";
import { truncateHex } from "@/lib/chain";
import { readCredential } from "@/lib/verify";

export const dynamic = "force-dynamic";

const DISCLOSURE =
  "This does not prove future income, affordability, legal credit eligibility, or guaranteed repayment.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  let label = id;
  try {
    label = decodeURIComponent(id);
  } catch {
    /* keep raw */
  }
  return { title: `Statement ${label}` };
}

function labelFromParam(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fresh?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const fresh = query.fresh === "1";
  return (
    <PublicChrome>
      <Suspense fallback={<ConfirmingStatement />}>
        <StatementResult id={id} fresh={fresh} />
      </Suspense>
    </PublicChrome>
  );
}

async function StatementResult({ id, fresh }: { id: string; fresh: boolean }) {
  const credential = fresh ? await readFreshCredential(id) : await readCredential(id);
  const alias = credential.alias ?? aliasFromCredentialId(credential.credentialId);
  const shortHex = truncateHex(credential.credentialId);

  if (credential.status === "unknown") {
    return (
      <ScreenFrame kicker="Public statement" title="This statement was not found.">
        <Callout
          tone="empty"
          title="Unknown statement"
          body="Nothing on Creditcoin matches this id. Check the link and try again."
        />
        <p className="meta mt-8 text-ink-faint">{labelFromParam(id)}</p>
      </ScreenFrame>
    );
  }

  const revoked = credential.status === "revoked";

  return (
    <ScreenFrame
      kicker="Public statement"
      title={revoked ? "This statement is no longer active." : "This statement is valid."}
      lede={
        revoked
          ? "The range below was issued, then withdrawn. Do not treat it as current."
          : "Anyone can open this page. It shows a range and a dated window, never an exact amount."
      }
    >
      <div
        className={`border-t-2 pt-6 md:pt-8 ${
          revoked ? "border-[color:var(--ev-failed-fg)]" : "border-brand"
        }`}
      >
        <p className="meta flex flex-wrap items-center gap-x-3 gap-y-2 text-ink-faint">
          <span>{revoked ? "Revoked" : "Valid"}</span>
          <span className="text-rule-strong">·</span>
          <CopyableId value={alias} />
          <span className="text-rule-strong">·</span>
          <CopyableId value={credential.credentialId} display={shortHex} />
        </p>
        <p className="display-md mt-3 text-ink">
          {credential.incomeBand?.label ?? "No range yet"}
        </p>
        <p className="meta mt-1 text-ink-faint">per pay cycle · range only</p>
      </div>

      <dl className="mt-10 max-w-md">
        <div className="border-t border-rule py-4">
          <dt className="meta text-ink-faint">Periods</dt>
          <dd className="mt-1 text-ink">{credential.periodsProven} consecutive</dd>
        </div>
        <div className="border-t border-rule py-4">
          <dt className="meta text-ink-faint">Issued</dt>
          <dd className="mt-1 text-ink"><LocalWhen iso={credential.issuedAt} /></dd>
        </div>
        <div className="border-t border-rule py-4">
          <dt className="meta text-ink-faint">Newest payment through</dt>
          <dd className="mt-1 text-ink"><LocalWhen iso={credential.evidenceEndDate} /></dd>
        </div>
        {revoked ? (
          <div className="border-t border-rule py-4">
            <dt className="meta text-ink-faint">Withdrawn</dt>
            <dd className="mt-1 text-ink"><LocalWhen iso={credential.revokedAt} /></dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-12 max-w-xl border-t-2 border-rule-strong pt-6">
        <p className="eyebrow text-ink-faint">What this does not show</p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{DISCLOSURE}</p>
      </div>
    </ScreenFrame>
  );
}

/**
 * A link opened right after issuing can reach a node that has not seen the
 * write yet. Bounded so an unknown id never holds a function for long.
 */
async function readFreshCredential(id: string) {
  const canAppearAfterWrite = parseStatementRef(id).kind === "bytes32";
  const attempts = 3;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const credential = await readCredential(id);
    if (
      credential.status !== "unknown" ||
      !canAppearAfterWrite ||
      attempt === attempts - 1
    ) {
      return credential;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return readCredential(id);
}

function ConfirmingStatement() {
  return (
    <ScreenFrame kicker="Public statement" title="Confirming this statement…">
      <div className="product-callout border-t-2 border-brand pt-6 md:pt-8" aria-busy="true">
        <p className="text-sm leading-relaxed text-ink-soft">
          Creditcoin may take a few seconds to return a new statement.
        </p>
      </div>
    </ScreenFrame>
  );
}
