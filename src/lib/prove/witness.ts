import { PERIODS, type ProveInput } from "./types"

/** Noir input map. Field order does not matter; names must match main.nr. */
export interface NoirInputs {
  amounts: string[]
  periods: string[]
  salts: string[][]
  recipient: string
  band: string
  commitments: [string, string][]
}

/** High 16 bytes then low 16. A 32-byte digest exceeds the bn254 scalar field. */
export function splitLimbs(commitment: `0x${string}`): [string, string] {
  const value = BigInt(commitment)
  return [(value >> 128n).toString(), (value & ((1n << 128n) - 1n)).toString()]
}

function saltBytes(salt: `0x${string}`): string[] {
  const body = salt.slice(2)
  if (body.length !== 64) throw new Error(`salt must be 32 bytes, got ${body.length / 2}`)
  return Array.from({ length: 32 }, (_, i) => String(parseInt(body.slice(i * 2, i * 2 + 2), 16)))
}

/**
 * Fails loudly on anything the circuit would reject anyway, so a bad window
 * surfaces here rather than as an opaque constraint failure minutes later.
 */
export function toNoirInputs(input: ProveInput): NoirInputs {
  if (input.slips.length !== PERIODS) {
    throw new Error(`need exactly ${PERIODS} slips, got ${input.slips.length}`)
  }

  const sorted = [...input.slips].sort((a, b) => (BigInt(a.period) < BigInt(b.period) ? -1 : 1))
  for (let i = 1; i < sorted.length; i++) {
    if (BigInt(sorted[i]!.period) !== BigInt(sorted[i - 1]!.period) + 1n) {
      throw new Error(
        `periods must be consecutive: ${sorted.map((s) => s.period).join(", ")}`,
      )
    }
  }

  return {
    amounts: sorted.map((s) => BigInt(s.amount).toString()),
    periods: sorted.map((s) => BigInt(s.period).toString()),
    salts: sorted.map((s) => saltBytes(s.salt)),
    recipient: input.recipient,
    band: String(input.band),
    commitments: sorted.map((s) => splitLimbs(s.commitment)),
  }
}
