import {
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { bandFromMonthlyUsdc, monthlyFromPeriodAmount } from "@/lib/bands";
import { sepoliaAddresses } from "@/lib/chain";
import type { IncomeLookup } from "@/lib/income-types";

const demoPayroll = sepoliaAddresses.DemoPayroll;

const MIN_PERIODS = 3;
const PAYER_NAME = "Orru Demo Payroll";
const LOOKBACK_BLOCKS = BigInt(200_000);
const LOG_CHUNK = BigInt(10_000);
const RPC_CONCURRENCY = 4;

const paymentMadeEvent = parseAbiItem(
  "event PaymentMade(address indexed recipient, uint256 amount, uint256 indexed period, bytes32 salt, bytes32 indexed commitment)",
);

const payrollAbi = parseAbi(["function periodSeconds() view returns (uint256)"]);

type PaidPeriod = {
  period: number;
  amount: bigint;
  txHash: Hex;
  at: Date;
};

function sepoliaClient() {
  const url =
    process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  return createPublicClient({
    chain: sepolia,
    transport: http(url),
  });
}

function consecutive(periods: number[]): boolean {
  if (periods.length === 0) return false;
  const sorted = [...periods].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

export async function lookupIncome(recipient: Address): Promise<IncomeLookup> {
  const client = sepoliaClient();
  const latest = await client.getBlockNumber();
  const fromBlock = process.env.SEPOLIA_FROM_BLOCK
    ? BigInt(process.env.SEPOLIA_FROM_BLOCK)
    : latest > LOOKBACK_BLOCKS
      ? latest - LOOKBACK_BLOCKS
      : BigInt(0);

  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  let cursor = fromBlock;
  while (cursor <= latest) {
    const end = cursor + LOG_CHUNK - BigInt(1);
    ranges.push({
      fromBlock: cursor,
      toBlock: end > latest ? latest : end,
    });
    cursor = (end > latest ? latest : end) + BigInt(1);
  }

  const [periodSeconds, logChunks] = await Promise.all([
    client.readContract({
      address: demoPayroll,
      abi: payrollAbi,
      functionName: "periodSeconds",
    }),
    mapPool(ranges, RPC_CONCURRENCY, (range) =>
      client.getLogs({
        address: demoPayroll,
        event: paymentMadeEvent,
        args: { recipient },
        fromBlock: range.fromBlock,
        toBlock: range.toBlock,
        strict: true,
      }),
    ),
  ]);

  const logs = logChunks.flat();
  const uniqueBlocks = [...new Set(logs.map((log) => log.blockNumber))];
  const timestamps = new Map<bigint, bigint>();
  await mapPool(uniqueBlocks, RPC_CONCURRENCY, async (blockNumber) => {
    const block = await client.getBlock({ blockNumber });
    timestamps.set(blockNumber, block.timestamp);
    return blockNumber;
  });

  const paid: PaidPeriod[] = logs.map((log) => ({
    period: Number(log.args.period),
    amount: log.args.amount,
    txHash: log.transactionHash,
    at: new Date(Number(timestamps.get(log.blockNumber) ?? BigInt(0)) * 1000),
  }));

  paid.sort((a, b) => a.period - b.period);

  const uniqueByPeriod = new Map<number, PaidPeriod>();
  for (const row of paid) {
    uniqueByPeriod.set(row.period, row);
  }
  const periods = [...uniqueByPeriod.keys()].sort((a, b) => a - b);

  const base: Omit<IncomeLookup, "verified" | "reason"> = {
    payerName: PAYER_NAME,
    payerAddress: demoPayroll,
    payerTier: 1,
    periodsVerified: periods.length,
    periodsConsecutive: consecutive(periods),
    firstPeriod: periods[0] ?? null,
    latestPeriod: periods[periods.length - 1] ?? null,
    incomeBand: null,
    evidence: [...uniqueByPeriod.values()].map((row) => ({
      period: row.period,
      sourceChain: "Ethereum Sepolia",
      sourceTx: row.txHash,
      verifiedTx: null,
      verifiedAt: row.at.toISOString(),
    })),
  };

  if (periods.length === 0) {
    return { ...base, verified: false, reason: "no_payments" };
  }

  if (periods.length < MIN_PERIODS) {
    return { ...base, verified: false, reason: "too_few_periods" };
  }

  if (!base.periodsConsecutive) {
    return { ...base, verified: false, reason: "not_consecutive" };
  }

  const average =
    [...uniqueByPeriod.values()].reduce(
      (sum, row) => sum + row.amount,
      BigInt(0),
    ) / BigInt(uniqueByPeriod.size);
  const monthly = monthlyFromPeriodAmount(average, periodSeconds);

  return {
    ...base,
    verified: true,
    incomeBand: bandFromMonthlyUsdc(monthly),
  };
}
