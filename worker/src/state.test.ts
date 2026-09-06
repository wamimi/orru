import { test } from "node:test"
import assert from "node:assert/strict"
import { addedPayrolls, planCursor } from "./state.js"

const START = 100
const CONFIRMATIONS = 5
const PAYROLLS = ["0xAAaAaA00000000000000000000000000000000aa"]

function state(lastScannedBlock: number, demoPayrolls: string[] = PAYROLLS) {
  return { lastScannedBlock, demoPayrolls }
}

test("a fresh cursor starts at the start block, not one past it", () => {
  const plan = planCursor(state(START - 1), PAYROLLS, START, CONFIRMATIONS, true)
  assert.equal(plan.fromBlock, START)
  assert.equal(plan.rewoundTo, null)
})

test("a settled cursor advances by one", () => {
  const plan = planCursor(state(500), PAYROLLS, START, CONFIRMATIONS, true)
  assert.equal(plan.fromBlock, 501)
  assert.equal(plan.rewoundTo, null)
})

test("adding a payroll rewinds to the start block", () => {
  const configured = [...PAYROLLS, "0xBBbBbB00000000000000000000000000000000bb"]
  const plan = planCursor(state(500), configured, START, CONFIRMATIONS, true)
  assert.equal(plan.fromBlock, START, "the new payroll's history predates the cursor")
  assert.match(plan.reason ?? "", /payroll added/)
})

test("removing a payroll does not rewind", () => {
  const plan = planCursor(state(500, [...PAYROLLS, "0xCc"]), PAYROLLS, START, CONFIRMATIONS, true)
  assert.equal(plan.fromBlock, 501)
  assert.equal(plan.rewoundTo, null)
})

test("payroll comparison ignores address casing", () => {
  const shouted = PAYROLLS.map((x) => x.toUpperCase())
  assert.deepEqual(addedPayrolls(PAYROLLS, shouted), [])
  const plan = planCursor(state(500), shouted, START, CONFIRMATIONS, true)
  assert.equal(plan.fromBlock, 501, "the same payroll in another case is not a new one")
})

test("a reorg rewinds twice the confirmation window", () => {
  const plan = planCursor(state(500), PAYROLLS, START, CONFIRMATIONS, false)
  assert.equal(plan.rewoundTo, 490)
  assert.equal(plan.fromBlock, 491)
  assert.match(plan.reason ?? "", /reorg/)
})

test("a reorg never rewinds below the start block", () => {
  const plan = planCursor(state(START), PAYROLLS, START, CONFIRMATIONS, false)
  assert.equal(plan.rewoundTo, START - 1)
  assert.equal(plan.fromBlock, START)
})

test("the floor is clamped at zero when the start block is zero", () => {
  const plan = planCursor(state(0, PAYROLLS), PAYROLLS, 0, CONFIRMATIONS, false)
  assert.ok(plan.fromBlock >= 0)
  assert.ok((plan.rewoundTo ?? 0) >= 0)
})

// ------------------------------------------------------------ attest queue

import { backoffMs, payersOf, pendingAnchors, relayable, type AnchorTx, type WorkerState } from "./state.js"

const APPROVED = "0xAAaAaA00000000000000000000000000000000aa"
const UNAPPROVED = "0xBBbBbB00000000000000000000000000000000bb"

function anchor(block: number, payer: string, over: Partial<AnchorTx> = {}): AnchorTx {
  return {
    blockNumber: block,
    commitments: [{ payer: payer as `0x${string}`, commitment: `0x${"11".repeat(32)}` }],
    status: "pending",
    attempts: 0,
    ...over,
  }
}

function worldWith(entries: Record<string, AnchorTx>): WorkerState {
  return {
    version: 1,
    payerAnchor: "0x0",
    demoPayrolls: [],
    lastScannedBlock: 0,
    anchors: entries,
    payments: [],
  }
}

test("unapproved anchors do not occupy the pass", () => {
  const entries: Record<string, AnchorTx> = {}
  for (let i = 0; i < 10; i++) entries[`0xnoise${i}`] = anchor(i, UNAPPROVED)
  entries["0xreal"] = anchor(99, APPROVED)

  const approved = new Set([APPROVED.toLowerCase()])
  const queue = relayable(pendingAnchors(worldWith(entries)), approved).slice(0, 10)

  assert.equal(queue.length, 1)
  assert.equal(queue[0]?.[0], "0xreal", "the legitimate anchor must survive the limit")
})

test("a mixed anchor is still relayable if one payer is approved", () => {
  const mixed = anchor(1, UNAPPROVED)
  mixed.commitments.push({ payer: APPROVED as `0x${string}`, commitment: `0x${"22".repeat(32)}` })
  const queue = relayable([["0xmixed", mixed]], new Set([APPROVED.toLowerCase()]))
  assert.equal(queue.length, 1)
})

test("backoff is not applied until the deadline passes", () => {
  const future = new Date(Date.now() + 60_000).toISOString()
  const past = new Date(Date.now() - 60_000).toISOString()
  const entries = {
    "0xwaiting": anchor(1, APPROVED, { status: "failed", nextAttemptAt: future }),
    "0xready": anchor(2, APPROVED, { status: "failed", nextAttemptAt: past }),
  }
  const ids = pendingAnchors(worldWith(entries)).map(([id]) => id)
  assert.deepEqual(ids, ["0xready"])
})

test("backoff grows and is capped at a day", () => {
  assert.equal(backoffMs(1), 60_000)
  assert.equal(backoffMs(2), 120_000)
  assert.ok(backoffMs(20) <= 86_400_000)
  assert.ok(backoffMs(20) >= backoffMs(5))
})

test("payersOf deduplicates case-insensitively", () => {
  const a = anchor(1, APPROVED)
  const b = anchor(2, APPROVED.toUpperCase())
  assert.equal(payersOf([a, b]).length, 1)
})

test("accepted and submitted anchors are never re-queued", () => {
  const entries = {
    "0xdone": anchor(1, APPROVED, { status: "accepted" }),
    "0xsent": anchor(2, APPROVED, { status: "submitted" }),
    "0xtodo": anchor(3, APPROVED),
  }
  assert.deepEqual(pendingAnchors(worldWith(entries)).map(([id]) => id), ["0xtodo"])
})

// ----------------------------------------------------------- window picking

import { pickWindow } from "./prove.js"
import type { PaymentRecord } from "./state.js"

function rec(period: number): PaymentRecord {
  return {
    payer: "0xAA" as `0x${string}`,
    recipient: "0xBB" as `0x${string}`,
    amount: "2500000000",
    period: String(period),
    salt: "0x00" as `0x${string}`,
    commitment: `0xc${period}` as `0x${string}`,
    txHash: "0x00" as `0x${string}`,
    blockNumber: period,
  }
}

test("the newest consecutive run wins", () => {
  const w = pickWindow([2, 3, 4, 9, 10, 11].map(rec), 3)
  assert.deepEqual(w?.map((p) => p.period), ["9", "10", "11"])
})

test("a gap at the end falls back to the older complete run", () => {
  const w = pickWindow([2, 3, 4, 9, 11].map(rec), 3)
  assert.deepEqual(w?.map((p) => p.period), ["2", "3", "4"])
})

test("no consecutive run returns null rather than a wrong window", () => {
  assert.equal(pickWindow([1, 3, 5, 7].map(rec), 3), null)
})

test("exactly enough periods is a valid window", () => {
  const w = pickWindow([15, 16, 17].map(rec), 3)
  assert.deepEqual(w?.map((p) => p.period), ["15", "16", "17"])
})

test("fewer records than periods returns null", () => {
  assert.equal(pickWindow([15, 16].map(rec), 3), null)
})

// ------------------------------------------------------- approval throttling

import { approvalIsFresh, APPROVAL_TTL_MS, withinAllowlist } from "./state.js"

test("a fresh approval is reused, a stale one is rechecked", () => {
  const now = Date.now()
  const recent = new Date(now - 1000).toISOString()
  assert.equal(approvalIsFresh({ approved: true, checkedAt: recent }, now), true)
  assert.equal(approvalIsFresh({ approved: false, checkedAt: recent }, now), true)

  const oldDenial = new Date(now - APPROVAL_TTL_MS.denied - 1000).toISOString()
  assert.equal(
    approvalIsFresh({ approved: false, checkedAt: oldDenial }, now),
    false,
    "a denial must expire so a newly approved payer is picked up",
  )
  assert.equal(
    approvalIsFresh({ approved: true, checkedAt: oldDenial }, now),
    true,
    "an approval outlives a denial",
  )
})

test("missing, unparsable or future-dated approvals are not trusted", () => {
  const now = Date.now()
  assert.equal(approvalIsFresh(undefined, now), false)
  assert.equal(approvalIsFresh({ approved: true, checkedAt: "nonsense" }, now), false)
  const future = new Date(now + 60_000).toISOString()
  assert.equal(approvalIsFresh({ approved: true, checkedAt: future }, now), false)
})

test("the allowlist discards spam before any RPC call", () => {
  const entries: [string, AnchorTx][] = []
  for (let i = 0; i < 10_000; i++) {
    entries.push([`0xspam${i}`, anchor(i, `0x${i.toString(16).padStart(40, "0")}`)])
  }
  entries.push(["0xreal", anchor(99_999, APPROVED)])

  const kept = withinAllowlist(entries, new Set([APPROVED.toLowerCase()]))
  assert.equal(kept.length, 1)
  assert.equal(kept[0]?.[0], "0xreal")
})

test("an empty allowlist keeps everything, so the filter is opt-in", () => {
  const entries: [string, AnchorTx][] = [["0xa", anchor(1, APPROVED)], ["0xb", anchor(2, UNAPPROVED)]]
  assert.equal(withinAllowlist(entries, new Set()).length, 2)
})
