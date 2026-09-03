import type { IncomeBand } from "@/lib/bands";

export type IncomeReason =
  | "no_payments"
  | "payer_not_approved"
  | "not_consecutive"
  | "too_few_periods";

export type IncomeEvidence = {
  period: number;
  sourceChain: string;
  sourceTx: `0x${string}`;
  verifiedTx: `0x${string}` | null;
  verifiedAt: string;
};

export type IncomeLookup = {
  verified: boolean;
  reason?: IncomeReason;
  payerName: string;
  payerAddress: `0x${string}`;
  payerTier: number;
  periodsVerified: number;
  periodsConsecutive: boolean;
  firstPeriod: number | null;
  latestPeriod: number | null;
  incomeBand: IncomeBand | null;
  evidence: IncomeEvidence[];
};
