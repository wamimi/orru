import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { config } from "./config.js"

export interface Checkpoint {
  block: number
  hash: string
}

/// How far back a reorg can be resolved. Beyond this the worker rescans from the
/// start block rather than pretending to know where the fork was.
export const MAX_CHECKPOINTS = 64

export type AnchorStatus = "pending" | "submitted" | "accepted" | "failed"

export interface AnchoredCommitment {
  payer: `0x${string}`
  commitment: `0x${string}`
}

export interface AnchorTx {
  blockNumber: number
  commitments: AnchoredCommitment[]
  status: AnchorStatus
  creditcoinTx?: string
  error?: string
  attempts: number
  lastAttemptAt?: string
  /// @dev Lowercased `payer|commitment` pairs the registry confirmed on readback.
  ///      Acceptance is per pair, never per transaction: one receipt can carry
  ///      an approved payer's commitment alongside an unapproved payer's, and
  ///      only the former is accepted.
  acceptedPairs?: string[]
  /// @dev ISO timestamp before which this anchor is not retried. Without it a
  ///      handful of permanently failing anchors, sorted oldest first, occupy
  ///      every pass and nothing behind them is ever relayed.
  nextAttemptAt?: string
}

export interface PaymentRecord {
  payer: `0x${string}`
  recipient: `0x${string}`
  amount: string
  period: string
  salt: `0x${string}`
  commitment: `0x${string}`
  txHash: `0x${string}`
  blockNumber: number
}

export interface WorkerState {
  version: 1
  payerAnchor: string
  demoPayrolls: string[]
  /// @dev The Creditcoin registry the acceptance statuses below were recorded
  ///      against. Attestation is a fact about one registry, not about the
  ///      world; pointing at a fresh one makes every cached status meaningless.
  creditcoinChainId?: number
  attestationRegistry?: string | null
  lastScannedBlock: number
  /// @dev Hash of `lastScannedBlock`, so a reorg deeper than the confirmation
  ///      window is detected instead of being scanned past.
  lastScannedHash?: string
  /// @dev Recent (block, hash) pairs, ascending. A reorg is resolved by walking
  ///      back through these to a block the chain still agrees with, rather than
  ///      guessing a fixed rewind depth.
  checkpoints?: Checkpoint[]
  anchors: Record<string, AnchorTx>
  payments: PaymentRecord[]
  /// @dev Cached `approvedPayer` results, so anchor spam cannot force a fresh
  ///      on-chain read per payer on every pass.
  payerApprovals?: Record<string, { approved: boolean; checkedAt: string }>
}

const VERSION = 1 as const

function statePath(): string {
  return resolve(config().stateDir, `source-${config().sourceChainKey}.json`)
}

function empty(): WorkerState {
  const c = config()
  return {
    version: VERSION,
    payerAnchor: c.payerAnchor,
    demoPayrolls: c.demoPayrolls,
    // One before the start block: the cursor names the last block SCANNED, and
    // initialising it to startBlock would skip startBlock itself.
    lastScannedBlock: Math.max(c.startBlock - 1, 0),
    creditcoinChainId: c.creditcoinChainId,
    attestationRegistry: c.attestationRegistry,
    anchors: {},
    payments: [],
  }
}

export function loadState(): WorkerState {
  const path = statePath()
  if (!existsSync(path)) return empty()

  const parsed = JSON.parse(readFileSync(path, "utf8")) as WorkerState
  if (parsed.version !== VERSION) {
    throw new Error(`state file ${path} is version ${parsed.version}, expected ${VERSION}`)
  }

  // Addresses are part of the state's meaning. Silently reusing a cursor taken
  // against a different anchor would skip every event the new one has emitted.
  const c = config()
  if (parsed.payerAnchor.toLowerCase() !== c.payerAnchor.toLowerCase()) {
    throw new Error(
      `state file was built against PayerAnchor ${parsed.payerAnchor} but PAYER_ANCHOR_ADDRESS is ${c.payerAnchor}. ` +
        `Delete ${path} to rescan, or point the worker back at the original anchor.`,
    )
  }

  // Source scan data stays valid across a destination change; acceptance does
  // not. Rather than refuse to load, forget what the old registry accepted.
  const destination = c.attestationRegistry?.toLowerCase() ?? null
  const recorded = parsed.attestationRegistry?.toLowerCase() ?? null
  const chainChanged =
    parsed.creditcoinChainId !== undefined && parsed.creditcoinChainId !== c.creditcoinChainId

  if (destination !== null && recorded !== null && (recorded !== destination || chainChanged)) {
    let reset = 0
    for (const anchor of Object.values(parsed.anchors)) {
      if (anchor.status === "pending") continue
      anchor.status = "pending"
      anchor.acceptedPairs = undefined
      anchor.creditcoinTx = undefined
      anchor.nextAttemptAt = undefined
      reset += 1
    }
    console.error(
      `   !  destination registry changed (${recorded} -> ${destination}); ` +
        `${reset} anchor(s) reset to pending. Source scan data kept.`,
    )
  }

  parsed.creditcoinChainId = c.creditcoinChainId
  parsed.attestationRegistry = c.attestationRegistry

  return parsed
}

export function saveState(state: WorkerState): void {
  mkdirSync(config().stateDir, { recursive: true })
  const path = statePath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(tmp, path)
}

export function pendingAnchors(state: WorkerState, now: number = Date.now()): [string, AnchorTx][] {
  return Object.entries(state.anchors)
    .filter(([, a]) => a.status === "pending" || a.status === "failed")
    .filter(([, a]) => !a.nextAttemptAt || Date.parse(a.nextAttemptAt) <= now)
    .sort((a, b) => a[1].blockNumber - b[1].blockNumber)
}

/// Doubles per attempt from one minute, capped at a day. Anything permanently
/// broken drifts to the back instead of blocking the queue, but nothing is ever
/// abandoned: a payer approved later still gets its commitments relayed.
export function backoffMs(attempts: number): number {
  const base = 60_000
  const capped = Math.min(Math.max(attempts, 1), 11)
  return Math.min(base * 2 ** (capped - 1), 86_400_000)
}

/// The distinct payers named across a set of anchors.
export function payersOf(anchors: readonly AnchorTx[]): string[] {
  const seen = new Map<string, string>()
  for (const a of anchors) {
    for (const c of a.commitments) seen.set(c.payer.toLowerCase(), c.payer)
  }
  return [...seen.values()]
}

/// Anchors with at least one approved payer. Applied BEFORE any limit, so
/// unapproved anchors cannot occupy the whole pass.
export function relayable(
  anchors: [string, AnchorTx][],
  approved: ReadonlySet<string>,
): [string, AnchorTx][] {
  return anchors.filter(([, a]) =>
    a.commitments.some((c) => approved.has(c.payer.toLowerCase())),
  )
}

/// Payments for one recipient from one payer, oldest period first. The payer
/// filter is not optional: period numbers are payer-local, so two payrolls both
/// paying this recipient would interleave into a window that looks consecutive
/// and describes no real income history.
export function paymentsFor(
  state: WorkerState,
  recipient: string,
  payer: string,
): PaymentRecord[] {
  const seen = new Set<string>()
  return state.payments
    .filter((p) => p.recipient.toLowerCase() === recipient.toLowerCase())
    .filter((p) => p.payer.toLowerCase() === payer.toLowerCase())
    .filter((p) => (seen.has(p.commitment) ? false : (seen.add(p.commitment), true)))
    .sort((a, b) => (BigInt(a.period) < BigInt(b.period) ? -1 : 1))
}


/// Payrolls the configured set has that the stored set does not. Their history
/// predates the cursor, so it would never be scanned without a rewind.
export function addedPayrolls(stored: readonly string[], configured: readonly string[]): string[] {
  const known = new Set(stored.map((x) => x.toLowerCase()))
  return configured.filter((x) => !known.has(x.toLowerCase()))
}

export interface CursorPlan {
  fromBlock: number
  rewoundTo: number | null
  reason: string | null
}

/// Appends a checkpoint, keeping the most recent MAX_CHECKPOINTS in ascending
/// order. Re-scanning a block replaces its entry rather than duplicating it.
export function recordCheckpoint(
  checkpoints: Checkpoint[] | undefined,
  block: number,
  hash: string,
): Checkpoint[] {
  const kept = (checkpoints ?? []).filter((c) => c.block < block)
  kept.push({ block, hash })
  return kept.slice(-MAX_CHECKPOINTS)
}

/// Where the next scan starts, and whether anything forced it backwards.
///
/// `ancestor` is the highest block the chain still agrees with: equal to
/// `lastScannedBlock` when nothing forked, lower after a reorg, and `null` when
/// no journalled checkpoint survived — which means the fork is deeper than the
/// journal and the only honest answer is a full rescan.
export function planCursor(
  state: Pick<WorkerState, "lastScannedBlock" | "demoPayrolls">,
  configured: readonly string[],
  startBlock: number,
  ancestor: number | null,
): CursorPlan {
  const floor = Math.max(startBlock - 1, 0)

  const added = addedPayrolls(state.demoPayrolls, configured)
  if (added.length > 0) {
    return {
      fromBlock: startBlock,
      rewoundTo: floor,
      reason: `payroll added (${added.join(", ")}) — its history predates the cursor`,
    }
  }

  if (ancestor === null) {
    return {
      fromBlock: startBlock,
      rewoundTo: floor,
      reason: "no journalled block still matches the chain — rescanning from the start block",
    }
  }

  if (ancestor < state.lastScannedBlock) {
    const rewound = Math.max(ancestor, floor)
    return {
      fromBlock: rewound + 1,
      rewoundTo: rewound,
      reason: `reorg — the chain last agrees at block ${rewound}`,
    }
  }

  return { fromBlock: Math.max(state.lastScannedBlock + 1, startBlock), rewoundTo: null, reason: null }
}

/// Discards everything discovered above `block`. Records from orphaned blocks
/// are not merely stale, they describe transactions that no longer exist, and a
/// proof window built from them could never be attested.
export function pruneAbove(state: WorkerState, block: number): { anchors: number; payments: number } {
  let anchors = 0
  for (const [txHash, anchor] of Object.entries(state.anchors)) {
    if (anchor.blockNumber <= block) continue
    delete state.anchors[txHash]
    anchors += 1
  }

  const before = state.payments.length
  state.payments = state.payments.filter((p) => p.blockNumber <= block)

  state.checkpoints = (state.checkpoints ?? []).filter((c) => c.block <= block)

  return { anchors, payments: before - state.payments.length }
}

/// Canonical key for an acceptance fact. Never key by commitment alone — the
/// same commitment can be anchored by more than one payer, and acceptance is
/// scoped to the pair.
export function pairKey(payer: string, commitment: string): string {
  return `${payer.toLowerCase()}|${commitment.toLowerCase()}`
}

/// Approval rarely changes, and the two directions carry different risk. A stale
/// `true` costs a reverted relay; a stale `false` delays a legitimate payer, so
/// it expires sooner.
export const APPROVAL_TTL_MS = { approved: 86_400_000, denied: 3_600_000 } as const

export function approvalIsFresh(
  entry: { approved: boolean; checkedAt: string } | undefined,
  now: number = Date.now(),
): boolean {
  if (!entry) return false
  const age = now - Date.parse(entry.checkedAt)
  if (Number.isNaN(age) || age < 0) return false
  return age < (entry.approved ? APPROVAL_TTL_MS.approved : APPROVAL_TTL_MS.denied)
}

/// Anchors whose payers are all outside the allowlist. Applied before any RPC,
/// so an attacker anchoring from ten thousand addresses costs nothing to ignore.
export function withinAllowlist(
  anchors: [string, AnchorTx][],
  allowlist: ReadonlySet<string>,
): [string, AnchorTx][] {
  if (allowlist.size === 0) return anchors
  return anchors.filter((entry) =>
    entry[1].commitments.some((c) => allowlist.has(c.payer.toLowerCase())),
  )
}
