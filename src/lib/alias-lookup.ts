import { isCredentialId } from "@/lib/alias";

/** First eight hex chars of a 32-byte credential id, without `0x`. */
export function tokenFromCredentialId(credentialId: string): string {
  return credentialId.slice(2, 10).toLowerCase();
}

/**
 * Fold issued ids into the alias map. Later logs win on a 32-bit prefix
 * collision so we do not guess among equals.
 */
export function applyIssuedIds(
  aliases: Map<string, `0x${string}`>,
  credentialIds: readonly string[],
): void {
  for (const raw of credentialIds) {
    if (!isCredentialId(raw)) continue;
    const id = raw.toLowerCase() as `0x${string}`;
    aliases.set(tokenFromCredentialId(id), id);
  }
}
