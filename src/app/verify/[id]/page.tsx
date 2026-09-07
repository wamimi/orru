import type { Metadata } from "next";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { PublicChrome } from "@/components/public/PublicChrome";
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
  return { title: `Statement ${truncateHex(id)}` };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const credential = await readCredential(id);
  const shortId = truncateHex(id);

  if (credential.status === "unknown") {
    return (
      <PublicChrome>
        <ScreenFrame kicker="Public statement" title="This statement was not found.">
          <Callout
            tone="empty"
            title="Unknown statement"
            body="Nothing on Creditcoin matches this id. Check the link and try again."
          />
          <p className="meta mt-8 text-ink-faint">{shortId}</p>
        </ScreenFrame>
      </PublicChrome>
    );
  }

  const revoked = credential.status === "revoked";

  return (
    <PublicChrome>
      <ScreenFrame
        kicker="Public statement"
        title={revoked ? "This statement is no longer active." : "This statement is valid."}
        lede={
          revoked
            ? "The range below was issued, then withdrawn. Do not treat it as current."
            : "Anyone can open this page. It shows a range and a dated window — never an exact amount."
        }
      >
        <div
          className={`border-t-2 pt-6 md:pt-8 ${
            revoked
              ? "border-[color:var(--ev-failed-fg)]"
              : "border-brand"
          }`}
        >
          <p className="meta text-ink-faint">
            {revoked ? "Revoked" : "Valid"}
            <span className="mx-3 text-rule-strong">·</span>
            {shortId}
          </p>
          <p className="display-md mt-3 text-ink">
            {credential.incomeBand?.label ?? "—"}
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
            <dd className="mt-1 text-ink">{formatDate(credential.issuedAt)}</dd>
          </div>
          <div className="border-t border-rule py-4">
            <dt className="meta text-ink-faint">Newest payment through</dt>
            <dd className="mt-1 text-ink">{formatDate(credential.evidenceEndDate)}</dd>
          </div>
          {revoked ? (
            <div className="border-t border-rule py-4">
              <dt className="meta text-ink-faint">Withdrawn</dt>
              <dd className="mt-1 text-ink">{formatDate(credential.revokedAt)}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-12 max-w-xl border-t-2 border-rule-strong pt-6">
          <p className="eyebrow text-ink-faint">What this does not show</p>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{DISCLOSURE}</p>
        </div>
      </ScreenFrame>
    </PublicChrome>
  );
}
