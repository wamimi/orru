import { getAddress, parseAbiItem } from "viem";
import { bandFor } from "@/lib/bands";
import { ADDRESSES, CREDITCOIN_ID, SEPOLIA_ID } from "@/lib/chain";
import { creditcoinClient } from "@/lib/clients";
import type { IncomeEvidence, IncomeRecord } from "@/lib/income-types";
import { payrollHistory, type PaidPeriod } from "@/lib/payroll-history";
import { PERIODS } from "@/lib/prove/types";

const ACCEPTED = parseAbiItem(
  "event CommitmentAccepted(bytes32 indexed commitment, address indexed payer, bytes32 indexed queryId, uint64 blockHeight)",
);

/** Under the RPC's per-call ceiling. */
const CC_FIRST_BLOCK = 5_436_656n;
const CC_CHUNK = 10_000n;

/** A recipient's income view, read from the chains rather than the snapshot. */
export async function deriveIncome(recipient: string): Promise<IncomeRecord | null> {
  const payer = ADDRESSES[SEPOLIA_ID].demoPayroll;
  const subject = getAddress(recipient);

  const history = await payrollHistory(subject);
  if (history.length === 0) return null;

  const window = newestWindow(history);
  const verifiedTx = await attestationTransactions(
    payer,
    history.filter((row) => row.attested).map((row) => row.commitment),
  );

  const evidence: IncomeEvidence[] = history.map((row) => ({
    period: row.period,
    sourceChain: "Ethereum Sepolia",
    sourceTx: row.sourceTx,
    sourceBlock: row.sourceBlock,
    attested: row.attested,
    verifiedTx: verifiedTx.get(row.commitment.toLowerCase()) ?? null,
    verifiedAt: "",
  }));

  const attestedCount = history.filter((row) => row.attested).length;
  const band = window ? bandFor(window[0].amount) : null;

  return {
    address: subject,
    verified: Boolean(window),
    reason: window ? undefined : attestedCount > 0 ? "too_few_periods" : "not_yet_verified",
    payerName: "Orru Demo Payroll",
    payerAddress: payer,
    payerTier: 1,
    periodsPaid: history.length,
    periodsAttested: attestedCount,
    periodsVerified: attestedCount,
    periodsConsecutive: Boolean(window),
    firstPeriod: window ? window[0].period : (history[0]?.period ?? null),
    latestPeriod: window
      ? window[window.length - 1].period
      : (history[history.length - 1]?.period ?? null),
    evidencePayer: payer,
    provableWindow: window
      ? { from: window[0].period, to: window[window.length - 1].period, consecutive: true }
      : null,
    incomeBand: band ? { id: band.id, label: band.label } : null,
    evidence,
  };
}

/** Newest run of consecutive attested periods sharing one band. */
function newestWindow(history: PaidPeriod[]): PaidPeriod[] | null {
  for (let end = history.length - 1; end >= PERIODS - 1; end--) {
    const run = history.slice(end - PERIODS + 1, end + 1);
    if (!run.every((row) => row.attested)) continue;
    if (!run.every((row, i) => i === 0 || row.period === run[i - 1].period + 1)) continue;

    const band = bandFor(run[0].amount).id;
    if (!run.every((row) => bandFor(row.amount).id === band)) continue;
    return run;
  }
  return null;
}

/** Which Creditcoin transaction attested each commitment, for this payer. */
async function attestationTransactions(
  payer: `0x${string}`,
  commitments: `0x${string}`[],
): Promise<Map<string, `0x${string}`>> {
  const found = new Map<string, `0x${string}`>();
  if (commitments.length === 0) return found;

  try {
    const head = await creditcoinClient.getBlockNumber();
    const ranges: { from: bigint; to: bigint }[] = [];
    for (let from = CC_FIRST_BLOCK; from <= head; from += CC_CHUNK) {
      const to = from + CC_CHUNK - 1n;
      ranges.push({ from, to: to > head ? head : to });
    }

    const logs = (
      await Promise.all(
        ranges.map((range) =>
          creditcoinClient.getLogs({
            address: ADDRESSES[CREDITCOIN_ID].attestationRegistry,
            event: ACCEPTED,
            args: { commitment: commitments, payer },
            fromBlock: range.from,
            toBlock: range.to,
          }),
        ),
      )
    ).flat();

    for (const log of logs) {
      if (log.args.commitment) {
        found.set(log.args.commitment.toLowerCase(), log.transactionHash);
      }
    }
  } catch {
  }

  return found;
}
