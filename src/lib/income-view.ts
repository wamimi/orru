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
    .map((row) => ({
      id: `${row.period}-${row.sourceTx}`,
      received: formatReceivedAt(row.verifiedAt),
      period: `Period ${row.period}`,
      payer: income.payerName,
      recognised: true,
      evidence: row.verifiedTx ? "attested" : "found",
      sourceChain: row.sourceChain,
      sourceTx: row.sourceTx,
      verifiedTx: row.verifiedTx,
    }));
}

export function credentialFromIncome(income: IncomeLookup): CredentialData {
  const periods = income.periodsVerified;
  const last = income.evidence
    .slice()
    .sort((a, b) => b.period - a.period)[0];

  return {
    id: "Not issued yet",
    band: income.incomeBand?.label ?? "—",
    bandUnit: "per month",
    periods: income.periodsConsecutive
      ? `${periods} consecutive`
      : `${periods} periods`,
    lastPayment: last ? formatReceivedAt(last.verifiedAt) : "—",
    payer: income.payerName,
    issuedOn: "Not issued yet",
    status: "Preview",
  };
}

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
): "happy" | "empty" | "unrecognised" | "failed" | "gap" | "short" {
  if (income.verified) return "happy";
  if (income.reason === "no_payments") return "empty";
  if (income.reason === "payer_not_approved") return "unrecognised";
  if (income.reason === "not_consecutive") return "gap";
  if (income.reason === "too_few_periods") return "short";
  return "failed";
}
