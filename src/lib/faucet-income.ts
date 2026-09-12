import { getAddress } from "viem";
import { BANDS } from "@/lib/bands";
import { faucetBand, faucetSlips, faucetStatus } from "@/lib/faucet";
import type { IncomeRecord } from "@/lib/income-types";

/**
 * The income view for a claimed wallet. An off-chain payer has no source
 * transaction, only the anchored commitment and its attestation.
 */
export async function faucetIncome(recipient: string): Promise<IncomeRecord | null> {
  const status = await faucetStatus(recipient);
  if (!status.anchored) return null;

  const subject = getAddress(recipient);
  const slips = faucetSlips(subject);
  const band = faucetBand();
  const periods = slips.map((slip) => Number(slip.period)).sort((a, b) => a - b);

  return {
    address: subject,
    verified: status.attested,
    reason: status.attested ? undefined : "not_yet_verified",
    payerName: "Semuni",
    payerAddress: status.payer,
    payerTier: 1,
    periodsPaid: slips.length,
    periodsAttested: status.attested ? slips.length : 0,
    periodsVerified: status.attested ? slips.length : 0,
    periodsConsecutive: true,
    firstPeriod: periods[0] ?? null,
    latestPeriod: periods[periods.length - 1] ?? null,
    evidencePayer: status.payer,
    provableWindow: status.attested
      ? { from: periods[0], to: periods[periods.length - 1], consecutive: true }
      : null,
    incomeBand: status.attested
      ? (BANDS.find((entry) => entry.id === band) ?? null)
      : null,
    evidence: slips.map((slip) => ({
      period: Number(slip.period),
      sourceChain: "Paid off-chain, anchored on Ethereum Sepolia",
      sourceTx: "0x" as `0x${string}`,
      sourceBlock: 0,
      attested: status.attested,
      verifiedTx: null,
      verifiedAt: "",
    })),
  };
}
