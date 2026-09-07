import { EvidenceBadge } from "./EvidenceBadge";
import { MetaRow } from "./MetaRow";

export type CredentialData = {
  id: string;
  band: string;
  bandUnit: string;
  periods: string;
  lastPayment: string;
  payer: string;
  issuedOn: string;
  status: "Valid" | "Expired" | "Revoked" | "Preview";
};

export const sampleCredential: CredentialData = {
  id: "orru:cred:8f41c2a7",
  band: "$3,000 – $5,000",
  bandUnit: "per month",
  periods: "4 consecutive",
  lastPayment: "6 days ago",
  payer: "Admitted payer",
  issuedOn: "Creditcoin",
  status: "Valid",
};

export function CredentialCard({
  data = sampleCredential,
  chrome = true,
  className,
}: {
  data?: CredentialData;
  chrome?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-card border border-rule bg-paper ${className ?? ""}`}
      style={{ boxShadow: "0 1px 3px rgba(18,48,43,0.04)" }}
    >
      {chrome ? (
        <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rule-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-rule-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-rule-strong" />
          <span className="meta ml-2 text-ink-faint">Income credential</span>
        </div>
      ) : null}

      <div className="px-6 py-6 md:px-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-ink-faint">Verified income band</p>
            <p className="display-md mt-2 whitespace-nowrap text-ink">
              {data.band}
            </p>
            <p className="meta mt-1 text-ink-faint">{data.bandUnit}</p>
          </div>
          <EvidenceBadge
            state={data.status === "Preview" ? "found" : "verified"}
            label={data.status}
          />
        </div>

        <div className="mt-6">
          <MetaRow label="Periods" value={data.periods} />
          <MetaRow
            label="Last payment"
            value={data.lastPayment}
            trailing={<EvidenceBadge state={data.status === "Preview" ? "found" : "attested"} />}
          />
          <MetaRow label="Source" value={data.payer} />
          <MetaRow label="Issued on" value={data.issuedOn} />
          <MetaRow label="Credential" value={data.id} />
        </div>

        <p className="mt-5 text-sm leading-relaxed text-ink-faint">
          Exact payment amounts are not part of this credential.
        </p>
      </div>
    </div>
  );
}
