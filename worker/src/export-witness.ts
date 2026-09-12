import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import { getAddress, isAddressEqual, type Hex } from "viem"
import { commitmentFor, saltFor } from "../../shared/commitment.ts"
import { REPO_ROOT } from "./config.js"
import { log, short } from "./log.js"
import { mergeByCommitment, type ProofBundle } from "./prove.js"
import { slipsAsPayments } from "./slips.js"
import { loadState, paymentsFor } from "./state.js"

/// The preimage of one attested commitment. `amount` and `salt` are the
/// circuit's private witness and are what browser proving exists to keep on the
/// user's machine.
export interface WitnessSlip {
  amount: string
  period: string
  salt: Hex
  commitment: Hex
}

export interface WitnessBook {
  payer: `0x${string}`
  recipient: `0x${string}`
  band: number
  slips: WitnessSlip[]
}

export interface WitnessFile {
  version: 1
  generatedAt: string
  note: string
  books: WitnessBook[]
}

export const WITNESS_FILE = resolve(REPO_ROOT, "fixtures", "slips.json")

const PUBLIC_NOTE =
  "Preimages of the attested window each proof bundle was built over, so the " +
  "browser can rebuild that bundle itself. Every book here has a salt equal to " +
  "keccak256(abi.encode(payer, recipient, period)), which DemoPayroll derives " +
  "on-chain and emits in PaymentMade beside the amount: nothing in this file is " +
  "secret. A payer that salts randomly is private and is never written here — " +
  "run `npm run export-witness -- --private` for those."

const PRIVATE_NOTE = "PRIVATE. Set as ORRU_SLIP_BOOKS in the hosting environment. Never commit."

/// A salt DemoPayroll derives on-chain is recomputable by anyone, and the amount
/// sits beside it in the event log, so that window is already public. A random
/// salt is the only copy of a secret and must never reach the repository.
export function isPublicPreimage(
  payer: `0x${string}`,
  recipient: `0x${string}`,
  slip: WitnessSlip,
): boolean {
  return saltFor(payer, recipient, BigInt(slip.period)).toLowerCase() === slip.salt.toLowerCase()
}

function bundles(): ProofBundle[] {
  const dir = resolve(REPO_ROOT, "fixtures")
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith("proof-") && f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")) as ProofBundle)
}

/// The preimages of exactly the commitments a bundle carries. Selecting on the
/// bundle rather than re-picking a window is what makes a browser proof carry
/// the same public inputs, so the registry accepts it for the same reason.
export function bookFor(bundle: ProofBundle): WitnessBook | null {
  const recipient = getAddress(bundle.subject)
  const payer = getAddress(bundle.evidencePayer)
  const state = loadState()

  const known = new Map(
    mergeByCommitment(
      paymentsFor(state, recipient, payer),
      slipsAsPayments(recipient, payer),
    ).map((p) => [p.commitment.toLowerCase(), p]),
  )

  const slips: WitnessSlip[] = []
  for (const commitment of bundle.commitments) {
    const record = known.get(commitment.toLowerCase())
    if (!record) return null
    if (!isAddressEqual(record.recipient, recipient)) return null

    const recomputed = commitmentFor({
      recipient: record.recipient,
      amount: BigInt(record.amount),
      period: BigInt(record.period),
      salt: record.salt,
    })
    if (recomputed.toLowerCase() !== commitment.toLowerCase()) {
      throw new Error(`period ${record.period} does not recompute to ${short(commitment)}`)
    }

    slips.push({
      amount: record.amount,
      period: record.period,
      salt: record.salt,
      commitment: record.commitment,
    })
  }

  return { payer, recipient, band: bundle.band, slips }
}

/// `privateOnly` writes nothing and prints the books that must stay out of git.
export function exportWitness(privateOnly: boolean): WitnessFile {
  const books: WitnessBook[] = []
  const withheld: string[] = []

  for (const bundle of bundles()) {
    const book = bookFor(bundle)
    if (!book) {
      log.warn("no preimages recorded", {
        recipient: short(bundle.subject),
        payer: short(bundle.evidencePayer),
      })
      continue
    }

    const isPublic = book.slips.every((s) => isPublicPreimage(book.payer, book.recipient, s))
    if (isPublic === privateOnly) {
      if (!isPublic) withheld.push(`${short(book.payer)} -> ${short(book.recipient)}`)
      continue
    }
    books.push(book)
  }

  const file: WitnessFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: privateOnly ? PRIVATE_NOTE : PUBLIC_NOTE,
    books,
  }

  if (privateOnly) {
    process.stdout.write(`${JSON.stringify(file)}\n`)
    log.warn("the line above holds salts that exist nowhere else — it goes in the hosting environment, never in git")
    return file
  }

  mkdirSync(resolve(REPO_ROOT, "fixtures"), { recursive: true })
  writeFileSync(WITNESS_FILE, `${JSON.stringify(file, null, 2)}\n`)
  log.info("written", { file: basename(WITNESS_FILE), books: books.length })
  for (const pair of withheld) log.warn("withheld, salt is private", { pair })
  return file
}
