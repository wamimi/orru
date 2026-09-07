import type { IncomeBand } from "@/lib/bands";

export type IncomeReason =
  | "no_payments"
  | "payer_not_approved"
  | "not_consecutive"
  | "too_few_periods"
  | "not_yet_verified";

export type ProvableWindow = {
  from: number;
  to: number;
  consecutive?: boolean;
} | null;

export type IncomeEvidence = {
  period: number;
  sourceChain: string;
  sourceTx: `0x${string}`;
  verifiedTx: `0x${string}` | null;
  verifiedAt: string;
  sourceBlock?: number;
  attested?: boolean;
};

export type IncomeRecord = {
  address: string;
  verified: boolean;
  reason?: IncomeReason;
  payerName: string;
  payerAddress: `0x${string}`;
  payerTier: number;
  periodsPaid?: number;
  periodsAttested: number;
  periodsVerified: number;
  periodsConsecutive: boolean;
  firstPeriod: number | null;
  latestPeriod: number | null;
  evidencePayer?: `0x${string}`;
  provableWindow: ProvableWindow;
  incomeBand: IncomeBand | null;
  evidence: IncomeEvidence[];
};

export type IncomeLookup = IncomeRecord;

export type IncomeResponse = {
  address: string;
  incomes: IncomeRecord[];
};
