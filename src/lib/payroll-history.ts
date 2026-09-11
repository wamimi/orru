import { getAddress, parseAbiItem } from "viem";
import { commitmentFor } from "../../shared/commitment";
import { attestationRegistryAbi } from "@/lib/abi";
import { ADDRESSES, CREDITCOIN_ID, SEPOLIA_ID } from "@/lib/chain";
import { creditcoinClient, sepoliaClient, sepoliaLogs } from "@/lib/clients";

const PAID = parseAbiItem(
  "event PaymentMade(address indexed recipient, uint256 amount, uint256 indexed period, bytes32 salt, bytes32 indexed commitment)",
);

/** Public nodes refuse much beyond fifty thousand blocks per call. */
const CHUNK = 40_000n;
const MAX_CHUNKS = 4;

/** Rows kept for the review screen. */
const MAX_ROWS = 40;

export type PaidPeriod = {
  period: number;
  amount: bigint;
  salt: `0x${string}`;
  commitment: `0x${string}`;
  sourceTx: `0x${string}`;
  sourceBlock: number;
  attested: boolean;
};

/**
 * A recipient's payment history from the payer's own events. Amount and salt
 * come from each `PaymentMade`, never from current contract state, which
 * changes. Every commitment must recompute from its preimage and be accepted
 * by the registry for this payer.
 */
export async function payrollHistory(recipient: string): Promise<PaidPeriod[]> {
  const payer = ADDRESSES[SEPOLIA_ID].demoPayroll;
  const subject = getAddress(recipient);

  const head = await sepoliaClient.getBlockNumber();
  const logs: Awaited<ReturnType<typeof slice>> = [];
  let to = head;
  for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
    const from = to > CHUNK ? to - CHUNK : 0n;
    logs.unshift(...(await slice(payer, subject, from, to)));
    if (logs.length >= MAX_ROWS || from === 0n) break;
    to = from - 1n;
  }
  if (logs.length === 0) return [];

  const rows = logs
    .flatMap((log) => {
      const { amount, period, salt, commitment } = log.args;
      if (amount === undefined || period === undefined || !salt || !commitment) {
        return [];
      }

      const recomputed = commitmentFor({ recipient: subject, amount, period, salt });
      if (recomputed.toLowerCase() !== commitment.toLowerCase()) return [];

      return [
        {
          period: Number(period),
          amount,
          salt,
          commitment,
          sourceTx: log.transactionHash,
          sourceBlock: Number(log.blockNumber),
          attested: false,
        },
      ];
    })
    .sort((a, b) => a.period - b.period)
    .slice(-MAX_ROWS);

  const accepted = await Promise.all(
    rows.map((row) =>
      creditcoinClient.readContract({
        address: ADDRESSES[CREDITCOIN_ID].attestationRegistry,
        abi: attestationRegistryAbi,
        functionName: "acceptedByPayer",
        args: [row.commitment, payer],
      }),
    ),
  );

  return rows.map((row, index) => ({ ...row, attested: accepted[index] }));
}

async function slice(
  payer: `0x${string}`,
  subject: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
) {
  return sepoliaLogs((client) =>
    client.getLogs({ address: payer, event: PAID, args: { recipient: subject }, fromBlock, toBlock }),
  );
}
