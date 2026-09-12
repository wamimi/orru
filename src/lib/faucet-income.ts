import { getAddress } from "viem";
import { BANDS } from "@/lib/bands";
import {
  faucetAttested,
  faucetBand,
  faucetPayer,
  faucetSlips,
} from "@/lib/faucet";
import type { IncomeRecord } from "@/lib/income-types";

/**
 * The income view for a claimed wallet. An off-chain payer has no source
 * transaction, only the anchored commitment and its attestation.
 */
export async function faucetIncome(recipient: string): Promise<IncomeRecord | null> {
  const subject = getAddress(recipient);
  const attested = await faucetAttested(subject);
  if (!attested) return null;

  const slips = faucetSlips(subject);
  const band = faucetBand();
  const bandDefinition = BANDS.find((entry) => entry.id === band);
  const periods = slips.map((slip) => Number(slip.period)).sort((a, b) => a - b);
  const payer = faucetPayer();

  return {
    address: subject,
    verified: true,
    payerName: "Semuni",
    payerAddress: payer,
    payerTier: 1,
    periodsPaid: slips.length,
    periodsAttested: slips.length,
    periodsVerified: slips.length,
    periodsConsecutive: true,
    firstPeriod: periods[0] ?? null,
    latestPeriod: periods[periods.length - 1] ?? null,
    evidencePayer: payer,
    provableWindow: {
      from: periods[0],
      to: periods[periods.length - 1],
      consecutive: true,
    },
    // Shared band definitions also contain bigint boundaries, which cannot be
    // serialized in the API response. The client only receives public display
    // metadata, matching the regular payroll income reader.
    incomeBand: bandDefinition
      ? { id: bandDefinition.id, label: bandDefinition.label }
      : null,
    evidence: slips.map((slip) => ({
      period: Number(slip.period),
      sourceChain: "Paid off-chain, anchored on Ethereum Sepolia",
      sourceTx: "0x" as `0x${string}`,
      sourceBlock: 0,
      attested: true,
      verifiedTx: null,
      verifiedAt: "",
    })),
  };
}
