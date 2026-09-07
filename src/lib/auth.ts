import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isAddress } from "viem";

const CHALLENGE_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const sessionCookieName = "orru_session";

type ChallengePayload = {
  address: string;
  nonce: string;
  issued: string;
  exp: number;
};

type SessionPayload = {
  address: string;
  exp: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET || process.env.PRIVY_APP_SECRET;
  if (!value) {
    throw new Error("Missing SESSION_SECRET");
  }
  return value;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

function encode<T>(payload: T): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode<T>(token: string): T | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function normalizeAddress(value: string): `0x${string}` | null {
  if (!isAddress(value)) return null;
  return value.toLowerCase() as `0x${string}`;
}

export function buildChallenge(address: `0x${string}`): {
  message: string;
  challenge: string;
} {
  const nonce = randomBytes(16).toString("hex");
  const issued = new Date().toISOString();
  const payload: ChallengePayload = {
    address,
    nonce,
    issued,
    exp: Date.now() + CHALLENGE_TTL_MS,
  };
  const message = [
    "This address is mine. Orru will only look up incoming payments to it. Nothing is moved.",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${issued}`,
  ].join("\n");
  return { message, challenge: encode(payload) };
}

export function readChallenge(
  token: string,
): { address: `0x${string}`; message: string } | null {
  const payload = decode<ChallengePayload>(token);
  if (!payload || payload.exp < Date.now()) return null;
  const address = normalizeAddress(payload.address);
  if (!address) return null;
  const message = [
    "This address is mine. Orru will only look up incoming payments to it. Nothing is moved.",
    `Address: ${address}`,
    `Nonce: ${payload.nonce}`,
    `Issued: ${payload.issued}`,
  ].join("\n");
  return { address, message };
}

export function issueSession(address: `0x${string}`): string {
  const payload: SessionPayload = {
    address,
    exp: Date.now() + SESSION_TTL_MS,
  };
  return encode(payload);
}

export function readSession(token: string | undefined | null): `0x${string}` | null {
  if (!token) return null;
  const payload = decode<SessionPayload>(token);
  if (!payload || payload.exp < Date.now()) return null;
  return normalizeAddress(payload.address);
}
