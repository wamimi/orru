import { formatUnits, parseAbiItem } from "viem";
import { credentialRegistryAbi, creditPoolAbi, CREDENTIAL_STATUS } from "@/lib/abi";
import { BANDS } from "@/lib/bands";
import { ADDRESSES, CREDITCOIN_ID, TOKEN_DECIMALS } from "@/lib/chain";
import { creditcoinClient } from "@/lib/clients";

const ISSUED = parseAbiItem(
  "event CredentialIssued(bytes32 indexed credentialId, address indexed subject, address indexed evidencePayer, uint8 band, uint64 evidenceEndHeight, bytes32 documentHash)",
);

/** CredentialRegistry's deployment block. The RPC times out past ~20k per call. */
const FIRST_BLOCK = 5_436_656n;
const CHUNK = 10_000n;

/** Short hold; dropped on issue and disburse. */
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; payload: StatementsPayload }>();

export type Statement = {
  credentialId: `0x${string}`;
  status: (typeof CREDENTIAL_STATUS)[number];
  band: number;
  bandLabel: string;
  evidencePayer: `0x${string}`;
  periodsProven: number;
  issuedAt: string | null;
  revokedAt: string | null;
  issuanceTx: `0x${string}` | null;
  /** Base units for the statement's full limit. */
  limit: string;
  /** Base units, drawable now. */
  remaining: string;
};

export type CreditSummary = {
  drawn: string;
  drawnFormatted: string;
  symbol: string;
};

export type StatementsPayload = {
  address: `0x${string}`;
  statements: Statement[];
  credit: CreditSummary;
};

function bandLabel(band: number): string {
  return BANDS.find((entry) => entry.id === band)?.label ?? "Unknown range";
}

function asDate(seconds: bigint): string | null {
  return seconds > 0n ? new Date(Number(seconds) * 1000).toISOString() : null;
}

/** A wallet's statements and credit, read from Creditcoin. */
export async function statementsFor(
  address: `0x${string}`,
  options: { fresh?: boolean } = {},
): Promise<StatementsPayload> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (!options.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.payload;

  const registry = ADDRESSES[CREDITCOIN_ID].credentialRegistry;
  const pool = ADDRESSES[CREDITCOIN_ID].creditPool;

  const head = await creditcoinClient.getBlockNumber();

  const ranges: { from: bigint; to: bigint }[] = [];
  for (let from = FIRST_BLOCK; from <= head; from += CHUNK) {
    const to = from + CHUNK - 1n;
    ranges.push({ from, to: to > head ? head : to });
  }

  const logs = (
    await Promise.all(
      ranges.map((range) =>
        creditcoinClient.getLogs({
          address: registry,
          event: ISSUED,
          args: { subject: address },
          fromBlock: range.from,
          toBlock: range.to,
        }),
      ),
    )
  ).flat();

  const ids = [...new Set(logs.map((log) => log.args.credentialId))].filter(
    (id): id is `0x${string}` => Boolean(id),
  );
  const issuanceTx = new Map(
    logs.flatMap((log) =>
      log.args.credentialId && log.transactionHash
        ? [[log.args.credentialId.toLowerCase(), log.transactionHash] as const]
        : [],
    ),
  );

  const statements = await Promise.all(
    ids.map(async (credentialId) => {
      const [statusCode, record, remaining] = await Promise.all([
        creditcoinClient.readContract({
          address: registry,
          abi: credentialRegistryAbi,
          functionName: "statusOf",
          args: [credentialId],
        }),
        creditcoinClient.readContract({
          address: registry,
          abi: credentialRegistryAbi,
          functionName: "credentialOf",
          args: [credentialId],
        }),
        creditcoinClient.readContract({
          address: pool,
          abi: creditPoolAbi,
          functionName: "remainingFor",
          args: [credentialId],
        }),
      ]);

      const limit = await creditcoinClient.readContract({
        address: pool,
        abi: creditPoolAbi,
        functionName: "limitForBand",
        args: [record.band],
      });

      return {
        credentialId,
        status: CREDENTIAL_STATUS[Number(statusCode)] ?? "unknown",
        band: Number(record.band),
        bandLabel: bandLabel(Number(record.band)),
        evidencePayer: record.evidencePayer,
        periodsProven: Number(record.periodsProven),
        issuedAt: asDate(record.issuedAt),
        revokedAt: asDate(record.revokedAt),
        issuanceTx: issuanceTx.get(credentialId.toLowerCase()) ?? null,
        limit: limit.toString(),
        remaining: remaining.toString(),
      } satisfies Statement;
    }),
  );

  const drawn = await creditcoinClient.readContract({
    address: pool,
    abi: creditPoolAbi,
    functionName: "drawnBySubject",
    args: [address],
  });

  statements.sort((a, b) => (b.issuedAt ?? "").localeCompare(a.issuedAt ?? ""));

  const payload: StatementsPayload = {
    address,
    statements,
    credit: {
      drawn: drawn.toString(),
      drawnFormatted: formatUnits(drawn, TOKEN_DECIMALS),
      symbol: "mUSDC",
    },
  };

  cache.set(key, { at: Date.now(), payload });
  return payload;
}

/** Called after issuing or drawing. */
export function forgetStatements(address: string): void {
  cache.delete(address.toLowerCase());
}
