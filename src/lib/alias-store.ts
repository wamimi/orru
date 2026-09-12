import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAbiItem } from "viem";
import {
  aliasFromCredentialId,
  isCredentialId,
  parseStatementRef,
} from "@/lib/alias";
import { applyIssuedIds, tokenFromCredentialId } from "@/lib/alias-lookup";
import { ADDRESSES, CREDITCOIN_ID } from "@/lib/chain";
import { creditcoinClient } from "@/lib/clients";

const CREDENTIAL_ISSUED = parseAbiItem(
  "event CredentialIssued(bytes32 indexed credentialId, address indexed subject, address indexed evidencePayer, uint8 band, uint64 evidenceEndHeight, bytes32 documentHash)",
);

type AliasFile = {
  aliases?: Record<string, string>;
};

const REGISTRY_DEPLOY_BLOCK = 5_436_656n;
const LOG_TTL_MS = 60_000;

const memory = new Map<string, `0x${string}`>();
let seeded = false;
let lastLogScan = 0;
let logScan: Promise<void> | null = null;

export type IssuedIdSource = () => Promise<string[]>;

let issuedIdSource: IssuedIdSource | null = null;

function seedPath(): string {
  return join(process.cwd(), "fixtures", "aliases.json");
}

function loadSeed(): void {
  if (seeded) return;
  seeded = true;
  const path = seedPath();
  if (!existsSync(path)) return;
  try {
    const file = JSON.parse(readFileSync(path, "utf8")) as AliasFile;
    applyIssuedIds(memory, Object.values(file.aliases ?? {}));
  } catch {
    console.error("fixtures/aliases.json could not be read");
  }
}

async function defaultIssuedIds(): Promise<string[]> {
  const logs = await creditcoinClient.getLogs({
    address: ADDRESSES[CREDITCOIN_ID].credentialRegistry,
    event: CREDENTIAL_ISSUED,
    fromBlock: REGISTRY_DEPLOY_BLOCK,
    toBlock: "latest",
  });
  return logs
    .map((log) => log.args.credentialId)
    .filter((id): id is `0x${string}` => Boolean(id));
}

async function refreshFromChain(): Promise<void> {
  const now = Date.now();
  if (lastLogScan > 0 && now - lastLogScan < LOG_TTL_MS) return;
  if (logScan) return logScan;

  logScan = (async () => {
    try {
      const ids = await (issuedIdSource ?? defaultIssuedIds)();
      applyIssuedIds(memory, ids);
      lastLogScan = Date.now();
    } catch {
      /* leave the token unknown rather than guess */
    } finally {
      logScan = null;
    }
  })();

  return logScan;
}

/** Remember a statement so `orru:cred:` plus its first eight hex chars resolve. */
export function registerAlias(credentialId: string): string {
  loadSeed();
  if (!isCredentialId(credentialId)) {
    throw new Error("credential id must be 32 bytes");
  }
  const id = credentialId.toLowerCase() as `0x${string}`;
  memory.set(tokenFromCredentialId(id), id);
  return aliasFromCredentialId(id);
}

export function credentialIdForAlias(token: string): `0x${string}` | null {
  loadSeed();
  return memory.get(token.toLowerCase()) ?? null;
}

/**
 * Turn a pasted or URL id into the on-chain bytes32, or null if it cannot
 * be resolved. Unknown short ids stay unknown; they are not guessed.
 */
export async function resolveCredentialId(
  raw: string,
): Promise<`0x${string}` | null> {
  const parsed = parseStatementRef(raw);
  if (parsed.kind === "invalid") return null;
  if (parsed.kind === "bytes32") {
    registerAlias(parsed.credentialId);
    return parsed.credentialId;
  }
  loadSeed();
  const cached = memory.get(parsed.token);
  if (cached) return cached;
  await refreshFromChain();
  return memory.get(parsed.token) ?? null;
}

export function setIssuedIdSource(source: IssuedIdSource | null): void {
  issuedIdSource = source;
}

export function resetAliasStoreForTests(): void {
  memory.clear();
  seeded = false;
  lastLogScan = 0;
  logScan = null;
  issuedIdSource = null;
}
