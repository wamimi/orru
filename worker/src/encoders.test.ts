import { test } from "node:test"
import assert from "node:assert/strict"
import type { Hex } from "viem"
import { hexToBytes, splitLimbs as workerSplit } from "./prove.js"
import { splitLimbs as browserSplit, toNoirInputs } from "../../src/lib/prove/witness"

/**
 * The worker proves with nargo; the browser proves with bb.js. Each has its own
 * implementation of the same encoding, and both must agree with the circuit.
 * A one-byte divergence produces proofs the deployed verifier rejects, and the
 * failure surfaces as an unexplained wallet error.
 */
const VECTORS: Hex[] = [
  `0x${"00".repeat(32)}`,
  `0x${"ff".repeat(32)}`,
  `0x${"80".repeat(32)}`,
  `0x${"01".repeat(32)}`,
  `0x${"aa55".repeat(16)}`,
  // High limb all set, low limb zero, and the reverse: catches a swapped split.
  `0x${"ff".repeat(16)}${"00".repeat(16)}`,
  `0x${"00".repeat(16)}${"ff".repeat(16)}`,
  "0x4324ad13f3fb1babcce363dfa125d40841ae21c665488213a7b4f34f1f6b255d",
]

test("both implementations split limbs identically", () => {
  for (const v of VECTORS) {
    const [wHi, wLo] = workerSplit(v)
    const [bHi, bLo] = browserSplit(v)
    assert.equal(bHi, wHi.toString(), `high limb differs for ${v}`)
    assert.equal(bLo, wLo.toString(), `low limb differs for ${v}`)
  }
})

test("limbs reassemble to the original commitment", () => {
  for (const v of VECTORS) {
    const [hi, lo] = workerSplit(v)
    assert.equal(`0x${((hi << 128n) | lo).toString(16).padStart(64, "0")}`, v.toLowerCase())
    assert.ok(hi < 1n << 128n && lo < 1n << 128n, "each limb must fit 128 bits")
  }
})

test("both implementations encode salt bytes in the same order", () => {
  for (const v of VECTORS) {
    const worker = hexToBytes(v).map(String)
    const browser = toNoirInputs({
      recipient: "0x000000000000000000000000000000000000dEaD",
      band: 0,
      slips: [1, 2, 3].map((period) => ({
        amount: "1",
        period: String(period),
        salt: v,
        commitment: `0x${"11".repeat(32)}`,
      })),
    }).salts[0]!

    assert.deepEqual(browser, worker, `salt byte order differs for ${v}`)
    assert.equal(browser.length, 32)
    // Left-to-right: byte 0 is the most significant, matching Noir's [u8; 32].
    assert.equal(Number(browser[0]), parseInt(v.slice(2, 4), 16))
  }
})

test("the browser encoder rejects a salt that is not 32 bytes", () => {
  assert.throws(() =>
    toNoirInputs({
      recipient: "0x000000000000000000000000000000000000dEaD",
      band: 0,
      slips: [1, 2, 3].map((period) => ({
        amount: "1",
        period: String(period),
        salt: "0xdead" as Hex,
        commitment: `0x${"11".repeat(32)}`,
      })),
    }),
  )
})

test("the browser encoder rejects a non-consecutive window", () => {
  assert.throws(
    () =>
      toNoirInputs({
        recipient: "0x000000000000000000000000000000000000dEaD",
        band: 0,
        slips: [1, 2, 4].map((period) => ({
          amount: "1",
          period: String(period),
          salt: `0x${"00".repeat(32)}` as Hex,
          commitment: `0x${"11".repeat(32)}`,
        })),
      }),
    /consecutive/,
  )
})
