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
    lastScannedBlock: c.startBlock,
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

export function pendingAnchors(state: WorkerState): [string, AnchorTx][] {
  return Object.entries(state.anchors)
    .filter(([, a]) => a.status === "pending" || a.status === "failed")
    .sort((a, b) => a[1].blockNumber - b[1].blockNumber)
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
