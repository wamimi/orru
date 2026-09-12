export const ALIAS_PREFIX = "orru:cred:";

const BYTES32 = /^0x[0-9a-f]{64}$/i;
const TOKEN = /^[0-9a-f]{8}$/i;

export type ParsedStatementRef =
  | { kind: "bytes32"; credentialId: `0x${string}` }
  | { kind: "alias"; token: string; display: string }
  | { kind: "invalid" };

function tokenFromCredentialId(credentialId: string): string {
  return credentialId.slice(2, 10).toLowerCase();
}

/** Short public id derived from the on-chain bytes32. */
export function aliasFromCredentialId(credentialId: string): string {
  return `${ALIAS_PREFIX}${tokenFromCredentialId(credentialId)}`;
}

export function isCredentialId(value: string): value is `0x${string}` {
  return BYTES32.test(value);
}

/**
 * Accepts a full hex id, `orru:cred:` plus eight hex chars, or the eight
 * chars alone. Anything else is invalid; do not guess.
 */
export function parseStatementRef(raw: string): ParsedStatementRef {
  const value = decodeRef(raw).trim().toLowerCase();
  if (!value) return { kind: "invalid" };

  if (isCredentialId(value)) {
    return { kind: "bytes32", credentialId: value };
  }

  const without0x = value.startsWith("0x") ? value.slice(2) : value;
  if (without0x.length === 64 && TOKEN.test(without0x.slice(0, 8)) && /^[0-9a-f]{64}$/.test(without0x)) {
    return { kind: "bytes32", credentialId: `0x${without0x}` };
  }

  const token = value.startsWith(ALIAS_PREFIX)
    ? value.slice(ALIAS_PREFIX.length)
    : value;
  if (TOKEN.test(token)) {
    return { kind: "alias", token, display: `${ALIAS_PREFIX}${token}` };
  }

  return { kind: "invalid" };
}

export function verifyPath(ref: string): string {
  return `/verify/${encodeURIComponent(ref)}`;
}

function decodeRef(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
