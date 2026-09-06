import type { IncomeEvidence, IncomeRecord } from "@/lib/income-types";
import { incomesForAddress, snapshotAvailable } from "@/lib/snapshot";
import { readCredential, unknownVerify, type VerifyPayload } from "@/lib/verify";

export type ReasonCode = {
  code: string;
  detail: string;
  pass: boolean;
};

export type ReportPayload = {
  requestId: string;
  result: "pass" | "fail" | "review";
  reasonCodes: ReasonCode[];
  evidence: IncomeEvidence[];
  income: IncomeRecord | null;
  credential: VerifyPayload | null;
  creditcoinTxs: `0x${string}`[];
};

const DEMO_SUBJECT = "0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C";

function reasonsFromIncome(
  income: IncomeRecord | null,
  credential: VerifyPayload | null,
): ReasonCode[] {
  const bandOk = Boolean(income?.incomeBand && income.incomeBand.id >= 2);
  const periodsOk = Boolean(income?.provableWindow);
  const payerOk = (income?.payerTier ?? 0) >= 1;
  const statusOk = credential?.status === "valid" || credential === null;

  return [
    {
      code: periodsOk ? "PERIODS_OK" : "PERIODS_FAIL",
      detail: periodsOk
        ? `${income?.periodsAttested ?? 0} consecutive periods verified`
        : "Fewer than three consecutive periods",
      pass: periodsOk,
    },
    {
      code: bandOk ? "BAND_OK" : "BAND_FAIL",
      detail: bandOk
        ? `Income band meets the ${income?.incomeBand?.label ?? "required"} range`
        : "Income band is below the requested range",
      pass: bandOk,
    },
    {
      code: payerOk ? "PAYER_TIER_1" : "PAYER_UNRECOGNISED",
      detail: payerOk
        ? "Payer is on the verified employer list"
        : "The sender is not a recognised payer",
      pass: payerOk,
    },
    {
      code: statusOk ? "STATEMENT_VALID" : "STATEMENT_INACTIVE",
      detail: statusOk
        ? "The statement is active"
        : "This statement is no longer active",
      pass: statusOk,
    },
  ];
}

export async function buildReport(requestId: string): Promise<ReportPayload> {
  let credential: VerifyPayload | null = null;
  if (requestId.startsWith("0x") && requestId.length === 66) {
    credential = await readCredential(requestId);
    if (credential.status === "unknown") credential = unknownVerify(requestId);
  }

  const subject = credential?.subjectAddress ?? DEMO_SUBJECT;
  const incomes = snapshotAvailable() ? incomesForAddress(subject) : [];
  const income =
    incomes.find((row) => row.verified && row.provableWindow) ?? incomes[0] ?? null;

  const reasonCodes = reasonsFromIncome(
    income,
    credential && credential.status !== "unknown" ? credential : null,
  );
  const failed = reasonCodes.some((row) => !row.pass);
  const txs = income?.evidence
    .map((row) => row.verifiedTx)
    .filter((hash): hash is `0x${string}` => Boolean(hash)) ?? [];

  return {
    requestId,
    result: failed ? "fail" : "pass",
    reasonCodes,
    evidence: income?.evidence ?? [],
    income,
    credential: credential && credential.status !== "unknown" ? credential : null,
    creditcoinTxs: txs,
  };
}
