import { sepoliaTxUrl, creditcoinTxUrl } from "@/lib/chain";
import type { IncomeLookup } from "@/lib/income-types";
import type { CredentialData } from "@/components/ui/CredentialCard";
import type { Payment } from "@/lib/mock/types";

export function formatReceivedAt(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function paymentsFromIncome(income: IncomeLookup): Payment[] {
  return income.evidence
    .slice()
    .sort((a, b) => b.period - a.period)
    .map((row) => {
      // Off-chain payments have an anchor but no payment transaction. Older
      // faucet rows use `0x` as the internal sentinel; never turn it into a
      // broken explorer link or an "unconfirmed" label.
      const sourceTx = row.sourceTx.length === 66 ? row.sourceTx : undefined;
      return {
        id: `${row.period}-${sourceTx ?? income.payerAddress}`,
        received: formatReceivedAt(row.verifiedAt),
        period: `Period ${row.period}`,
        payer: income.payerName,
        recognised: true,
        evidence: row.attested || row.verifiedTx ? "attested" : "found",
        sourceChain: row.sourceChain,
        sourceTx,
        verifiedTx: row.verifiedTx,
      };
    });
}

export function credentialFromIncome(income: IncomeLookup): CredentialData {
  const periods = income.periodsAttested;
  const last = income.evidence
    .slice()
    .sort((a, b) => b.period - a.period)[0];

  return {
    id: "Not issued yet",
    band: income.incomeBand?.label ?? "No range yet",
    bandUnit: "per pay cycle",
    periods: income.provableWindow
      ? `${periods} consecutive`
      : `${periods} periods`,
    lastPayment: last ? formatReceivedAt(last.verifiedAt) : "None yet",
    payer: income.payerName,
    issuedOn: "Not issued yet",
    status: "Preview",
  };
}

export function sharedFieldsFromIncome(income: IncomeLookup) {
  return [
    {
      label: "Income band",
      value: income.incomeBand?.label ?? "No range yet",
      state: "verified" as const,
    },
    {
      label: "Consecutive periods",
      value: String(income.periodsAttested),
      state: "verified" as const,
    },
    {
      label: "Most recent payment",
      value: income.evidence[0]
        ? formatReceivedAt(
            [...income.evidence].sort((a, b) => b.period - a.period)[0].verifiedAt,
          )
        : "None yet",
      state: "attested" as const,
    },
    {
      label: "Verified employer",
      value: income.payerName,
      state: "attested" as const,
    },
    {
      label: "Statement status",
      value: "ready to issue",
      state: "verified" as const,
    },
  ];
}

export const withheldFields = [
  "Exact amount of each payment",
  "Who your clients or employer are beyond the verified name",
  "Your address's full payment history",
  "Any other balance you hold",
];

export function explorerHref(payment: Payment): string | null {
  if (payment.verifiedTx) return creditcoinTxUrl(payment.verifiedTx);
  if (payment.sourceTx) return sepoliaTxUrl(payment.sourceTx);
  return null;
}

export function evidenceLinks(
  payment: Payment,
): { href: string; label: string }[] {
  const links: { href: string; label: string }[] = [];
  if (payment.sourceTx) {
    links.push({
      href: sepoliaTxUrl(payment.sourceTx),
      label: "Open the Sepolia record",
    });
  }
  if (payment.verifiedTx) {
    links.push({
      href: creditcoinTxUrl(payment.verifiedTx),
      label: "Open the chain confirmation",
    });
  }
  return links;
}

export function scenarioFromIncome(
  income: IncomeLookup,
): "happy" | "empty" | "unrecognised" | "failed" | "gap" | "short" | "pending" {
  if (income.verified && income.provableWindow) return "happy";
  if (income.reason === "no_payments") return "empty";
  if (income.reason === "payer_not_approved") return "unrecognised";
  if (income.reason === "not_consecutive") return "gap";
  if (income.reason === "too_few_periods") return "short";
  if (income.reason === "not_yet_verified") return "pending";
  if (income.verified && !income.provableWindow) return "gap";
  return "failed";
}
