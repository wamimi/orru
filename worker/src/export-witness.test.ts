import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { getAddress } from "viem"
import { commitmentFor, saltFor } from "../../shared/commitment.ts"
import { REPO_ROOT } from "./config.js"
import type { WitnessFile } from "./export-witness.js"
import type { ProofBundle } from "./prove.js"

/**
 * fixtures/slips.json is what the browser proves from. If it drifts from the
 * proof bundles the browser builds a statement over commitments the registry
 * never attested, and issue() fails with CommitmentNotAttestedToPayer — which
 * reads as a product bug and is not one.
 *
 * These read only fixtures/, so they pass on a fresh clone with no worker state.
 */
const FIXTURES = resolve(REPO_ROOT, "fixtures")
const WITNESS = resolve(FIXTURES, "slips.json")

function witness(): WitnessFile {
  return JSON.parse(readFileSync(WITNESS, "utf8")) as WitnessFile
}

function bundles(): ProofBundle[] {
  return readdirSync(FIXTURES)
    .filter((f) => f.startsWith("proof-") && f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(FIXTURES, f), "utf8")) as ProofBundle)
}

test("every slip recomputes to its own commitment", { skip: !existsSync(WITNESS) }, () => {
  for (const book of witness().books) {
    for (const slip of book.slips) {
      assert.equal(
        commitmentFor({
          recipient: book.recipient,
          amount: BigInt(slip.amount),
          period: BigInt(slip.period),
          salt: slip.salt,
        }).toLowerCase(),
        slip.commitment.toLowerCase(),
        `period ${slip.period} of ${book.recipient} does not recompute`,
      )
    }
  }
})

test("every book matches the proof bundle it is proved against", { skip: !existsSync(WITNESS) }, () => {
  const all = bundles()
  for (const book of witness().books) {
    const bundle = all.find(
      (b) =>
        getAddress(b.subject) === getAddress(book.recipient) &&
        getAddress(b.evidencePayer) === getAddress(book.payer),
    )
    assert.ok(bundle, `no bundle for ${book.recipient} from ${book.payer}`)
    assert.equal(book.band, bundle.band, "band differs from the bundle")
    assert.deepEqual(
      book.slips.map((s) => s.commitment.toLowerCase()),
      bundle.commitments.map((c) => c.toLowerCase()),
      "commitments differ from the bundle, in value or in order",
    )
  }
})

/// The committed file may only hold preimages the source chain already
/// publishes. A random salt is the only copy of a secret; this is the check that
/// stops one reaching the repository.
test("nothing committed here is secret", { skip: !existsSync(WITNESS) }, () => {
  for (const book of witness().books) {
    for (const slip of book.slips) {
      assert.equal(
        saltFor(book.payer, book.recipient, BigInt(slip.period)).toLowerCase(),
        slip.salt.toLowerCase(),
        `period ${slip.period} of ${book.recipient} has a private salt and must not be committed`,
      )
    }
  }
})
