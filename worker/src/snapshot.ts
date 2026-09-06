import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { getAddress } from "viem"
import { bandFor } from "../../shared/bands.ts"
import { config } from "./config.js"
import { log } from "./log.js"
import { mergeByCommitment, pickWindow, PERIODS } from "./prove.js"
import { allSlipBooks } from "./slips.js"
import { loadState, pairKey, type AnchorTx, type PaymentRecord } from "./state.js"

export interface EvidenceRow {
  period: number
  sourceChain: "Ethereum Sepolia"
  sourceTx: `0x${string}`
  sourceBlock: number
  verifiedTx: string | null
  attested: boolean
}

export interface RecipientSnapshot {
  address: `0x${string}`
  verified: boolean
  reason?: "no_payments" | "not_yet_verified" | "too_few_periods" | "not_consecutive"
  payerAddress: `0x${string}`
  payerName: string
  periodsPaid: number
  periodsAttested: number
  provableWindow: { from: number; to: number } | null
  incomeBand: { id: number; label: string } | null
  evidence: EvidenceRow[]
}

export interface Snapshot {
  generatedAt: string
  sourceChain: "Ethereum Sepolia"
  sourceChainKey: number
  creditcoinChainId: number
  attestationRegistry: string | null
  credentialRegistry: string | null
  payers: Record<string, { name: string }>
  recipients: RecipientSnapshot[]
}

/// Human-readable payer names for the UI. `PAYER_NAMES` is a comma-separated
/// list of `address=Name` pairs; anything unnamed falls back to its address.
function payerNames(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of (process.env.PAYER_NAMES ?? "").split(",")) {
    const [addr, ...rest] = pair.split("=")
    if (!addr?.trim() || rest.length === 0) continue
    out[addr.trim().toLowerCase()] = rest.join("=").trim()
  }
  return out
}

/// Everything the income and verification screens need, and nothing more.
///
/// Deliberately carries the BAND and never an amount or a salt. Those are the
/// circuit's private witness; a snapshot the web app serves is the last place
/// they should appear. The demo payroll happens to publish them on Sepolia, but
/// a payer that does not must not have them leaked by this file.
export function buildSnapshot(): Snapshot {
  const c = config()
  const state = loadState()
  const names = payerNames()

  // Keyed by (payer, commitment), never by commitment alone. Anchoring is
  // permissionless, so anyone can anchor a copy of a public commitment; keying
  // by commitment would let their unaccepted copy display as verified income.
  const attestedPairs = new Set<string>()
  const verifiedTxOf = new Map<string, string>()

  for (const anchor of Object.values(state.anchors) as AnchorTx[]) {
    if (anchor.status !== "accepted") continue

    // Written by attest from the on-chain readback. Older state predates it, so
    // fall back to this anchor's own pairs — still payer-scoped.
    const pairs =
      anchor.acceptedPairs ?? anchor.commitments.map((c) => pairKey(c.payer, c.commitment))

    for (const key of pairs) {
      attestedPairs.add(key)
      if (anchor.creditcoinTx) verifiedTxOf.set(key, anchor.creditcoinTx)
    }
  }

  const byPair = new Map<string, PaymentRecord[]>()
  const add = (p: PaymentRecord) => {
    const key = `${p.recipient.toLowerCase()}|${p.payer.toLowerCase()}`
    byPair.set(key, [...(byPair.get(key) ?? []), p])
  }

  for (const p of state.payments) add(p)

  // Off-chain payers publish no PaymentMade events, so their recipients exist
  // only in the slip books. The books name the pairs, so nothing is inferred.
  const slipNames = new Map<string, string>()
  for (const book of allSlipBooks()) {
    slipNames.set(book.payer.toLowerCase(), book.payerName)
    for (const slip of book.slips) {
      add({
        payer: book.payer,
        recipient: book.recipient,
        amount: slip.amount,
        period: slip.period,
        salt: slip.salt,
        commitment: slip.commitment,
        txHash: "0x" as `0x${string}`,
        blockNumber: 0,
      })
    }
  }

  for (const [key, list] of byPair) byPair.set(key, mergeByCommitment(list, []))

  const recipients: RecipientSnapshot[] = []

  for (const [key, records] of byPair) {
    const [recipientKey, payerKey] = key.split("|")
    const recipient = getAddress(recipientKey!)
    const payer = getAddress(payerKey!)

    const sorted = [...records].sort((a, b) => (BigInt(a.period) < BigInt(b.period) ? -1 : 1))
    const attested = sorted.filter((p) => attestedPairs.has(pairKey(p.payer, p.commitment)))
    const window = attested.length >= PERIODS ? pickWindow(attested, PERIODS) : null

    // The band is a property of the window being proven, not of the whole
    // history, so it is only meaningful once a window exists.
    let band: { id: number; label: string } | null = null
    if (window) {
      const bands = window.map((p) => bandFor(BigInt(p.amount)))
      const first = bands[0]!
      band = bands.every((b) => b.id === first.id) ? { id: first.id, label: first.label } : null
    }

    let reason: RecipientSnapshot["reason"]
    if (sorted.length === 0) reason = "no_payments"
    else if (attested.length === 0) reason = "not_yet_verified"
    else if (attested.length < PERIODS) reason = "too_few_periods"
    else if (!window) reason = "not_consecutive"

    recipients.push({
      address: recipient,
      verified: window !== null && band !== null,
      ...(reason ? { reason } : {}),
      payerAddress: payer,
      payerName: names[payer.toLowerCase()] ?? slipNames.get(payer.toLowerCase()) ?? payer,
      periodsPaid: sorted.length,
      periodsAttested: attested.length,
      provableWindow: window
        ? { from: Number(window[0]!.period), to: Number(window[window.length - 1]!.period) }
        : null,
      incomeBand: band,
      evidence: sorted.map((p) => ({
        period: Number(p.period),
        sourceChain: "Ethereum Sepolia" as const,
        sourceTx: p.txHash,
        sourceBlock: p.blockNumber,
        verifiedTx: verifiedTxOf.get(pairKey(p.payer, p.commitment)) ?? null,
        attested: attestedPairs.has(pairKey(p.payer, p.commitment)),
      })),
    })
  }

  recipients.sort((a, b) => a.address.localeCompare(b.address))

  const payers: Record<string, { name: string }> = {}
  for (const r of recipients) payers[r.payerAddress] = { name: r.payerName }

  return {
    generatedAt: new Date().toISOString(),
    sourceChain: "Ethereum Sepolia",
    sourceChainKey: c.sourceChainKey,
    creditcoinChainId: c.creditcoinChainId,
    attestationRegistry: c.attestationRegistry,
    credentialRegistry: c.credentialRegistry,
    payers,
    recipients,
  }
}

export function writeSnapshot(): string {
  const c = config()
  const snapshot = buildSnapshot()

  mkdirSync(c.outDir, { recursive: true })
  const path = resolve(c.outDir, "income-snapshot.json")
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`)

  log.info("snapshot written", {
    file: path,
    recipients: snapshot.recipients.length,
    verified: snapshot.recipients.filter((r) => r.verified).length,
  })

  for (const r of snapshot.recipients) {
    log.info("  " + r.address, {
      payer: r.payerName,
      paid: r.periodsPaid,
      attested: r.periodsAttested,
      band: r.incomeBand?.id ?? "-",
      window: r.provableWindow ? `${r.provableWindow.from}-${r.provableWindow.to}` : (r.reason ?? "-"),
    })
  }

  return path
}
