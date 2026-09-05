import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { config } from "./config.js"

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
  lastScannedBlock: number
  /// @dev Hash of `lastScannedBlock`, so a reorg deeper than the confirmation
  ///      window is detected instead of being scanned past.
  lastScannedHash?: string
  anchors: Record<string, AnchorTx>
  payments: PaymentRecord[]
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

/// Where the next scan starts, and whether anything forced it backwards.
/// `chainAgrees` is false when the stored hash no longer matches the chain at
/// `lastScannedBlock`, which means a reorg went deeper than the confirmations.
export function planCursor(
  state: Pick<WorkerState, "lastScannedBlock" | "demoPayrolls">,
  configured: readonly string[],
  startBlock: number,
  confirmations: number,
  chainAgrees: boolean,
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

  if (!chainAgrees) {
    const rewound = Math.max(state.lastScannedBlock - confirmations * 2, floor)
    return {
      fromBlock: rewound + 1,
      rewoundTo: rewound,
      reason: "the chain no longer agrees with the recorded block hash — reorg",
    }
  }

  return { fromBlock: Math.max(state.lastScannedBlock + 1, startBlock), rewoundTo: null, reason: null }
}
