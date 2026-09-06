import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { getAddress, type Hex } from "viem"
import { bandFor } from "../../shared/bands.ts"
import { commitmentFor } from "../../shared/commitment.ts"
import { config, WORKER_ROOT } from "./config.js"
import { log } from "./log.js"
import type { PaymentRecord } from "./state.js"

/// A payment the payer made OFF-CHAIN — a bank transfer, a payout, anything the
/// chain never sees. Only the commitment is anchored, so no amount and no salt
/// ever appear on any chain.
///
/// The salt is random and secret, which is what makes the commitment hiding.
/// DemoPayroll derives its salt deterministically and publishes the amount, so
/// its commitments bind but do not hide; these do both.
export interface Slip {
  payer: `0x${string}`
  recipient: `0x${string}`
  amount: string
  period: string
  salt: Hex
  commitment: Hex
  issuedAt: string
}

export interface SlipBook {
  version: 1
  payer: `0x${string}`
  payerName: string
  recipient: `0x${string}`
  slips: Slip[]
}

function slipDir(): string {
  return resolve(WORKER_ROOT, process.env.WORKER_SLIP_DIR ?? "slips")
}

function slipPath(payer: string, recipient: string): string {
  return resolve(slipDir(), `${payer.toLowerCase()}-${recipient.toLowerCase()}.json`)
}

export interface IssueSlipsOptions {
  payer: string
  recipient: string
  amount: bigint
  fromPeriod: number
  count: number
  payerName: string
}

/// Generates slips and returns the commitments to anchor. Nothing is sent; the
/// caller anchors them with the payer's own key.
export function issueSlips(options: IssueSlipsOptions): SlipBook {
  const payer = getAddress(options.payer)
  const recipient = getAddress(options.recipient)

  const band = bandFor(options.amount)
  const slips: Slip[] = []

  for (let i = 0; i < options.count; i++) {
    const period = BigInt(options.fromPeriod + i)
    // 32 random bytes. A deterministic salt would let anyone recompute the
    // commitment for a guessed amount, which is how DemoPayroll's ends up
    // binding-but-not-hiding.
    const salt = `0x${randomBytes(32).toString("hex")}` as Hex

    slips.push({
      payer,
      recipient,
      amount: options.amount.toString(),
      period: period.toString(),
      salt,
      commitment: commitmentFor({ recipient, amount: options.amount, period, salt }),
      issuedAt: new Date().toISOString(),
    })
  }

  const book: SlipBook = { version: 1, payer, payerName: options.payerName, recipient, slips }

  mkdirSync(slipDir(), { recursive: true })
  const path = slipPath(payer, recipient)

  // Merge rather than overwrite: a payer issuing a second run must not destroy
  // the recipient's earlier slips, which are the only copy of those preimages.
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, "utf8")) as SlipBook
    const seen = new Set(book.slips.map((s) => s.commitment))
    book.slips = [...existing.slips.filter((s) => !seen.has(s.commitment)), ...book.slips].sort(
      (a, b) => (BigInt(a.period) < BigInt(b.period) ? -1 : 1),
    )
  }

  writeFileSync(path, `${JSON.stringify(book, null, 2)}\n`)

  log.step("slips issued", {
    payer: options.payerName,
    recipient,
    band: `${band.id} (${band.label})`,
    periods: `${options.fromPeriod}-${options.fromPeriod + options.count - 1}`,
  })
  log.info("written", { file: path })
  log.warn("this file is the ONLY copy of these salts — the chain never sees them")

  return book
}

/// Every slip the worker holds for one recipient and payer, in PaymentRecord
/// shape so the proving path treats them identically to scanned payments.
export function slipsAsPayments(recipient: string, payer: string): PaymentRecord[] {
  const path = slipPath(payer, recipient)
  if (!existsSync(path)) return []

  const book = JSON.parse(readFileSync(path, "utf8")) as SlipBook
  if (book.version !== 1) throw new Error(`${path} is version ${book.version}, expected 1`)

  return book.slips.map((s) => ({
    payer: s.payer,
    recipient: s.recipient,
    amount: s.amount,
    period: s.period,
    salt: s.salt,
    commitment: s.commitment,
    // Off-chain payments have no source transaction of their own. The anchoring
    // transaction is found by the scanner from the PaymentAnchored event.
    txHash: "0x" as `0x${string}`,
    blockNumber: 0,
  }))
}

/// Every slip book on disk. The books are the record of which payer/recipient
/// pairs exist off-chain, so nothing has to be inferred from on-chain data.
export function allSlipBooks(): SlipBook[] {
  const dir = slipDir()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")) as SlipBook)
    .filter((b) => b.version === 1)
}

export function anchorCommand(book: SlipBook, account = "orru-payer"): string {
  const list = book.slips.map((s) => s.commitment).join(" ")
  return (
    `cast send ${config().payerAnchor} "anchorBatch(bytes32[])" "[${book.slips
      .map((s) => s.commitment)
      .join(",")}]" \\\n` +
    `  --rpc-url $SEPOLIA_RPC_URL --account ${account} --password-file ~/.orru/${account}.pwd` +
    `\n\n# commitments: ${list}`
  )
}
