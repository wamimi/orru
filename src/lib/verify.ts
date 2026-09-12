import { aliasFromCredentialId, isCredentialId } from "@/lib/alias";
import { resolveCredentialId } from "@/lib/alias-store";
import { BANDS } from "@/lib/bands";
import { CREDENTIAL_STATUS, credentialRegistryAbi, type CredentialStatus } from "@/lib/abi";
import { ADDRESSES, CREDITCOIN_ID } from "@/lib/chain";
import { creditcoinClient, sepoliaClient } from "@/lib/clients";

export type VerifyPayload = {
  credentialId: `0x${string}`;
  alias: string | null;
  status: CredentialStatus;
  issuedAt: string | null;
  revokedAt: string | null;
  subjectAddress: `0x${string}` | null;
  evidencePayer: `0x${string}` | null;
  walletBindingProven: boolean;
  incomeBand: { id: number; label: string } | null;
  periodsProven: number;
  verificationPeriod: { from: string; to: string } | null;
  attestcoinVerifiedFacts: string[];
  documentHash: `0x${string}` | null;
  evidenceEndHeight: number | null;
  evidenceEndDate: string | null;
  issuanceTx: `0x${string}` | null;
  revocationTx: `0x${string}` | null;
};

const heightCache = new Map<string, string>();

function isoFromUnix(seconds: bigint): string | null {
  if (seconds === BigInt(0)) return null;
  return new Date(Number(seconds) * 1000).toISOString();
}

async function dateForSepoliaHeight(height: bigint): Promise<string | null> {
  if (height === BigInt(0)) return null;
  const key = height.toString();
  const cached = heightCache.get(key);
  if (cached) return cached;
  try {
    const block = await sepoliaClient.getBlock({ blockNumber: height });
    const iso = new Date(Number(block.timestamp) * 1000).toISOString();
    heightCache.set(key, iso);
    return iso;
  } catch {
    return null;
  }
}

export function unknownVerify(id: string): VerifyPayload {
  const credentialId = (isCredentialId(id)
    ? id.toLowerCase()
    : `0x${"00".repeat(32)}`) as `0x${string}`;
  return {
    credentialId,
    alias: isCredentialId(id) ? aliasFromCredentialId(credentialId) : null,
    status: "unknown",
    issuedAt: null,
    revokedAt: null,
    subjectAddress: null,
    evidencePayer: null,
    walletBindingProven: false,
    incomeBand: null,
    periodsProven: 0,
    verificationPeriod: null,
    attestcoinVerifiedFacts: [],
    documentHash: null,
    evidenceEndHeight: null,
    evidenceEndDate: null,
    issuanceTx: null,
    revocationTx: null,
  };
}

export async function readCredential(id: string): Promise<VerifyPayload> {
  const credentialId = await resolveCredentialId(id);
  if (!credentialId) return unknownVerify(id);

  const address = ADDRESSES[CREDITCOIN_ID].credentialRegistry;
  const [statusCode, credential] = await Promise.all([
    creditcoinClient.readContract({
      address,
      abi: credentialRegistryAbi,
      functionName: "statusOf",
      args: [credentialId],
    }),
    creditcoinClient.readContract({
      address,
      abi: credentialRegistryAbi,
      functionName: "credentialOf",
      args: [credentialId],
    }),
  ]);

  const status = CREDENTIAL_STATUS[Number(statusCode)] ?? "unknown";
  if (status === "unknown") return unknownVerify(credentialId);

  const evidenceEndDate = await dateForSepoliaHeight(credential.evidenceEndHeight);
  const issuedAt = isoFromUnix(credential.issuedAt);
  const band = BANDS[credential.band] ?? null;

  return {
    credentialId,
    alias: aliasFromCredentialId(credentialId),
    status,
    issuedAt,
    revokedAt: isoFromUnix(credential.revokedAt),
    subjectAddress: credential.subject,
    evidencePayer: credential.evidencePayer,
    walletBindingProven: true,
    incomeBand: band ? { id: band.id, label: band.label } : null,
    periodsProven: Number(credential.periodsProven),
    verificationPeriod: evidenceEndDate
      ? { from: evidenceEndDate.slice(0, 10), to: evidenceEndDate.slice(0, 10) }
      : null,
    attestcoinVerifiedFacts: ["payments_occurred", "payer_identity"],
    documentHash: credential.documentHash,
    evidenceEndHeight: Number(credential.evidenceEndHeight),
    evidenceEndDate,
    issuanceTx: null,
    revocationTx: null,
  };
}
