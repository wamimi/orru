import type { IncomeEvidence, IncomeRecord } from "@/lib/income-types";
import type { VerifyPayload } from "@/lib/verify";

export type ReasonCode = {
  code: string;
  detail: string;
  pass: boolean;
};

const MIN_PERIODS = 3;
const MIN_BAND = 2;

/** Pass/fail copy from the issued statement, never the live payroll snapshot. */
export function reasonsFromCredential(credential: VerifyPayload): ReasonCode[] {
  const periodsOk = credential.periodsProven >= MIN_PERIODS;
  const bandOk = Boolean(
    credential.incomeBand && credential.incomeBand.id >= MIN_BAND,
  );
  const payerOk = Boolean(credential.evidencePayer);
  const statusOk = credential.status === "valid";

  return [
    {
      code: periodsOk ? "PERIODS_OK" : "PERIODS_FAIL",
      detail: periodsOk
        ? `${credential.periodsProven} consecutive periods verified`
        : "Fewer than three consecutive periods",
      pass: periodsOk,
    },
    {
      code: bandOk ? "BAND_OK" : "BAND_FAIL",
      detail: bandOk
        ? `Income band meets the ${credential.incomeBand?.label ?? "required"} range`
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

export function reasonsForUnknown(): ReasonCode[] {
  return [
    {
      code: "STATEMENT_UNKNOWN",
      detail: "Nothing on Creditcoin matches this id",
      pass: false,
    },
  ];
}

export function incomeForPayer(
  incomes: IncomeRecord[],
  evidencePayer: `0x${string}` | null,
): IncomeRecord | null {
  if (!evidencePayer) return null;
  const needle = evidencePayer.toLowerCase();
  return (
    incomes.find(
      (row) =>
        row.payerAddress.toLowerCase() === needle ||
        row.evidencePayer?.toLowerCase() === needle,
    ) ?? null
  );
}

/**
 * Snapshot evidence that can sit on the statement: same payer, not after the
 * attested end height, newest `periodsProven` periods only.
 */
export function evidenceForStatement(
  incomes: IncomeRecord[],
  credential: VerifyPayload,
): IncomeEvidence[] {
  const row = incomeForPayer(incomes, credential.evidencePayer);
  if (!row || credential.periodsProven <= 0) return [];

  const endHeight = credential.evidenceEndHeight;
  const matching = row.evidence.filter((item) => {
    if (item.attested === false) return false;
    if (endHeight == null || item.sourceBlock == null) return true;
    return item.sourceBlock <= endHeight;
  });

  return matching
    .slice()
    .sort((a, b) => b.period - a.period)
    .slice(0, credential.periodsProven)
    .sort((a, b) => a.period - b.period);
}
