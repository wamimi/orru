import type { IncomeRecord } from "@/lib/income-types";
import {
  evidenceForStatement,
  incomeForPayer,
  reasonsForUnknown,
  reasonsFromCredential,
  type ReasonCode,
} from "@/lib/report-scope";
import { incomesForAddress, snapshotAvailable } from "@/lib/snapshot";
import { readCredential, type VerifyPayload } from "@/lib/verify";

export type { ReasonCode };

export type ReportPayload = {
  requestId: string;
  result: "pass" | "fail" | "review";
  reasonCodes: ReasonCode[];
  evidence: IncomeRecord["evidence"];
  income: IncomeRecord | null;
  credential: VerifyPayload | null;
  creditcoinTxs: `0x${string}`[];
};

export async function buildReport(requestId: string): Promise<ReportPayload> {
  const credential = await readCredential(requestId);
  if (credential.status === "unknown") {
    return {
      requestId,
      result: "fail",
      reasonCodes: reasonsForUnknown(),
      evidence: [],
      income: null,
      credential: null,
      creditcoinTxs: [],
    };
  }

  const incomes =
    snapshotAvailable() && credential.subjectAddress
      ? incomesForAddress(credential.subjectAddress)
      : [];
  const named = incomeForPayer(incomes, credential.evidencePayer);
  const evidence = evidenceForStatement(incomes, credential);
  const reasonCodes = reasonsFromCredential(credential);
  const failed = reasonCodes.some((row) => !row.pass);
  const income = named
    ? {
        ...named,
        incomeBand: credential.incomeBand,
        periodsAttested: credential.periodsProven,
        periodsVerified: credential.periodsProven,
        evidence,
      }
    : null;

  return {
    requestId,
    result: failed ? "fail" : "pass",
    reasonCodes,
    evidence,
    income,
    credential,
    creditcoinTxs: evidence
      .map((row) => row.verifiedTx)
      .filter((hash): hash is `0x${string}` => Boolean(hash)),
  };
}
