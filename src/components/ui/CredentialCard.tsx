import { CheckCircle, EyeSlash } from "@phosphor-icons/react/dist/ssr";
import { Mark } from "@/components/brand/Mark";
import { CopyButton } from "@/components/ui/CopyButton";

export type CredentialData = {
  id: string;
  band: string;
  bandUnit: string;
  periods: string;
  lastPayment: string;
  payer: string;
  issuedOn: string;
  status: "Valid" | "Expired" | "Revoked" | "Preview";
  /** Optional full hex id for copy/paste into /check */
  hexId?: string | null;
};

export const sampleCredential: CredentialData = {
  id: "orru:cred:7b6a24eb",
  band: "$2,500 – $4,000",
  bandUnit: "per pay cycle",
  periods: "3 consecutive",
  lastPayment: "6 days ago",
  payer: "Verified employer",
  issuedOn: "Example",
  status: "Preview",
};

const STATUS_LABEL: Record<CredentialData["status"], string> = {
  Valid: "Valid",
  Expired: "Expired",
  Revoked: "Revoked",
  Preview: "Preview",
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
  const statusTone =
    data.status === "Valid"
      ? "is-valid"
      : data.status === "Revoked" || data.status === "Expired"
        ? "is-revoked"
        : "is-preview";
  const copyValue = data.id.startsWith("orru:cred:")
    ? data.id
    : (data.hexId ?? data.id);
  const canCopy =
    data.id.startsWith("orru:cred:") || Boolean(data.hexId?.startsWith("0x"));

  return (
    <div
      className={`credential-card ${statusTone} ${className ?? ""}`}
      data-chrome={chrome ? "true" : "false"}
    >
      <div className="credential-card__top">
        <div className="credential-card__brand">
          <Mark size={18} />
          <span>orru statement</span>
        </div>
        <span className="credential-card__status">
          <CheckCircle size={14} weight="fill" />
          {STATUS_LABEL[data.status]}
        </span>
      </div>

      <div className="credential-card__range">
        <span>Verified income range</span>
        <strong>{data.band}</strong>
        <small>{data.bandUnit}</small>
      </div>

      <dl className="credential-card__rows">
        <div>
          <dt>Periods</dt>
          <dd>{data.periods}</dd>
        </div>
        <div>
          <dt>Last payment</dt>
          <dd>{data.lastPayment}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{data.payer}</dd>
        </div>
        <div>
          <dt>Issued</dt>
          <dd>{data.issuedOn}</dd>
        </div>
        <div className="credential-card__id-row">
          <dt>Statement</dt>
          <dd>
            <span className="credential-card__id">{data.id}</span>
            {canCopy ? <CopyButton value={copyValue} label="Copy statement id" /> : null}
          </dd>
        </div>
      </dl>

      <div className="credential-card__privacy">
        <EyeSlash size={15} />
        <span>Exact pay excluded</span>
      </div>
    </div>
  );
}
