import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  IncomeEvidence,
  IncomeReason,
  IncomeRecord,
  ProvableWindow,
} from "@/lib/income-types";

type SnapshotEvidence = {
  period: number;
  sourceChain: string;
  sourceTx: string;
  verifiedTx?: string | null;
  verifiedAt?: string;
  sourceBlock?: number;
  attested?: boolean;
};

type SnapshotRow = {
  address: string;
  verified: boolean;
  reason?: IncomeReason;
  payerName?: string;
  payerAddress: string;
  payerTier?: number;
  periodsPaid?: number;
  periodsAttested?: number;
  evidencePayer?: string;
  provableWindow?: { from: number; to: number; consecutive?: boolean } | null;
  incomeBand?: { id: number; label: string } | null;
  evidence?: SnapshotEvidence[];
};

type SnapshotFile = {
  generatedAt?: string;
  payers?: Record<string, { name?: string; tier?: number }>;
  recipients: SnapshotRow[];
};

const REASONS: IncomeReason[] = [
  "no_payments",
  "payer_not_approved",
  "not_consecutive",
  "too_few_periods",
  "not_yet_verified",
];

const DATA_DIRS = [
  join(process.cwd(), "fixtures"),
  join(process.cwd(), "worker", "out"),
];

function firstExisting(...candidates: string[]): string | null {
  return candidates.find((path) => existsSync(path)) ?? null;
}

function snapshotPath(): string | null {
  return firstExisting(
    join(process.cwd(), "fixtures", "income-snapshot.json"),
    join(process.cwd(), "worker", "out", "income-snapshot.json"),
  );
}

export function snapshotAvailable(): boolean {
  return snapshotPath() !== null;
}

export function readIncomeSnapshot(): SnapshotFile {
  const path = snapshotPath();
  if (!path) {
    throw new Error("income snapshot is missing");
  }
  return JSON.parse(readFileSync(path, "utf8")) as SnapshotFile;
}

function asReason(value: string | undefined): IncomeReason | undefined {
  return value && (REASONS as string[]).includes(value)
    ? (value as IncomeReason)
    : undefined;
}

function mapEvidence(row: SnapshotEvidence): IncomeEvidence {
  return {
    period: row.period,
    sourceChain: row.sourceChain,
    sourceTx: row.sourceTx as `0x${string}`,
    verifiedTx: (row.verifiedTx as `0x${string}` | null | undefined) ?? null,
    verifiedAt: row.verifiedAt ?? "",
    sourceBlock: row.sourceBlock,
    attested: row.attested,
  };
}

export function toIncomeRecord(row: SnapshotRow): IncomeRecord {
  const window: ProvableWindow = row.provableWindow
    ? {
        from: row.provableWindow.from,
        to: row.provableWindow.to,
        consecutive: row.provableWindow.consecutive ?? true,
      }
    : null;
  const evidence = (row.evidence ?? []).map(mapEvidence);
  const periods = evidence.map((item) => item.period).sort((a, b) => a - b);
  const attested = row.periodsAttested ?? evidence.length;

  return {
    address: row.address,
    verified: Boolean(row.verified),
    reason: asReason(row.reason),
    payerName: row.payerName ?? "Verified employer",
    payerAddress: row.payerAddress as `0x${string}`,
    payerTier: row.payerTier ?? 1,
    periodsPaid: row.periodsPaid,
    periodsAttested: attested,
    periodsVerified: attested,
    periodsConsecutive: window?.consecutive ?? Boolean(window),
    firstPeriod: window?.from ?? periods[0] ?? null,
    latestPeriod: window?.to ?? periods[periods.length - 1] ?? null,
    evidencePayer: (row.evidencePayer ?? row.payerAddress) as `0x${string}`,
    provableWindow: window,
    incomeBand: row.incomeBand ?? null,
    evidence,
  };
}

/** Every payer that has paid this address. One wallet can have several. */
export function incomesForAddress(address: string): IncomeRecord[] {
  const needle = address.toLowerCase();
  return readIncomeSnapshot()
    .recipients.filter((row) => row.address.toLowerCase() === needle)
    .map(toIncomeRecord);
}

/**
 * Bundle filenames carry a short address prefix, so a match here is a candidate
 * and not proof of ownership. The caller compares `subject` before using it.
 */
export function findProofBundlePath(address: string): string | null {
  const lower = address.toLowerCase();
  const prefix = lower.slice(2, 10);

  for (const dir of DATA_DIRS) {
    if (!existsSync(dir)) continue;
    const names = readdirSync(dir).filter((name) => {
      if (!name.startsWith("proof-") || !name.endsWith(".json")) return false;
      const file = name.toLowerCase();
      return file.includes(lower) || file.includes(prefix);
    });
    if (names.length === 0) continue;
    const ranked = names.sort((a, b) => {
      const score = (name: string) =>
        name.includes("payroll-band4") ? 0 : name.includes("payroll") ? 1 : 2;
      return score(a) - score(b);
    });
    return join(dir, ranked[0]);
  }
  return null;
}
