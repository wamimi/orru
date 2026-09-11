import { getAddress } from "viem";
import { bandFor } from "@/lib/bands";
import { ADDRESSES, SEPOLIA_ID } from "@/lib/chain";
import { payrollHistory } from "@/lib/payroll-history";
import { PERIODS } from "@/lib/prove/types";
import type { SlipBook } from "@/lib/slips";

/**
 * The newest run of consecutive attested periods sharing one band. The circuit
 * proves a single band, so a window spanning two is unprovable.
 */
export async function derivePayrollSlips(
  recipient: string,
): Promise<SlipBook | null> {
  const subject = getAddress(recipient);
  const history = await payrollHistory(subject);
  if (history.length === 0) return null;

  for (let end = history.length - 1; end >= PERIODS - 1; end--) {
    const run = history.slice(end - PERIODS + 1, end + 1);
    if (!run.every((row) => row.attested)) continue;

    const consecutive = run.every(
      (row, index) => index === 0 || row.period === run[index - 1].period + 1,
    );
    if (!consecutive) continue;

    const band = bandFor(run[0].amount).id;
    if (!run.every((row) => bandFor(row.amount).id === band)) continue;

    return {
      payer: ADDRESSES[SEPOLIA_ID].demoPayroll,
      recipient: subject,
      band,
      slips: run.map((row) => ({
        amount: row.amount.toString(),
        period: row.period.toString(),
        salt: row.salt,
        commitment: row.commitment,
      })),
    };
  }

  return null;
}
