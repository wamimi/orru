import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aliasFromCredentialId,
  isCredentialId,
  parseStatementRef,
} from "@/lib/alias";

type AliasFile = {
  aliases?: Record<string, string>;
};

const memory = new Map<string, `0x${string}`>();
let seeded = false;

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
    for (const [token, id] of Object.entries(file.aliases ?? {})) {
      if (isCredentialId(id)) memory.set(token.toLowerCase(), id.toLowerCase() as `0x${string}`);
    }
  } catch {
    console.error("fixtures/aliases.json could not be read");
  }
}

/** Remember a statement so `orru:cred:` plus its first eight hex chars resolve. */
export function registerAlias(credentialId: string): string {
  loadSeed();
  if (!isCredentialId(credentialId)) {
    throw new Error("credential id must be 32 bytes");
  }
  const id = credentialId.toLowerCase() as `0x${string}`;
  memory.set(id.slice(2, 10), id);
  return aliasFromCredentialId(id);
}

export function credentialIdForAlias(token: string): `0x${string}` | null {
  loadSeed();
  return memory.get(token.toLowerCase()) ?? null;
}

/**
 * Turn a pasted or URL id into the on-chain bytes32, or null if it cannot
 * be resolved. Unknown short ids stay unknown — they are not guessed.
 */
export function resolveCredentialId(raw: string): `0x${string}` | null {
  const parsed = parseStatementRef(raw);
  if (parsed.kind === "invalid") return null;
  if (parsed.kind === "bytes32") {
    registerAlias(parsed.credentialId);
    return parsed.credentialId;
  }
  return credentialIdForAlias(parsed.token);
}
