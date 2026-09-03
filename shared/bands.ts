/**
 * Income bands, in base units of a six-decimal token per pay cycle.
 * Compiled into the circuit; changing them means regenerating the verifier.
 */

export interface Band {
  readonly id: number
  /** Inclusive. */
  readonly lo: bigint
  /** Exclusive. */
  readonly hi: bigint
  readonly label: string
}

/** The circuit compares against a fixed value, so the top band needs a bound. */
/** The circuit compares against a fixed value, so the top band needs a bound. */
export const BAND_CEILING = 10_000_000_000_000n // 10,000,000 units

/**
 * Spaced multiplicatively rather than linearly: income is roughly log-normal,
 * so even steps are too coarse at the bottom and too wide at the top. Relative
 * width is held at 50-67%.
 */
export const BANDS: readonly Band[] = [
  { id: 0, lo: 0n, hi: 500_000_000n, label: '$0 - $500' },
  { id: 1, lo: 500_000_000n, hi: 1_000_000_000n, label: '$500 - $1,000' },
  { id: 2, lo: 1_000_000_000n, hi: 1_500_000_000n, label: '$1,000 - $1,500' },
  { id: 3, lo: 1_500_000_000n, hi: 2_500_000_000n, label: '$1,500 - $2,500' },
  { id: 4, lo: 2_500_000_000n, hi: 4_000_000_000n, label: '$2,500 - $4,000' },
  { id: 5, lo: 4_000_000_000n, hi: 6_000_000_000n, label: '$4,000 - $6,000' },
  { id: 6, lo: 6_000_000_000n, hi: 10_000_000_000n, label: '$6,000 - $10,000' },
  { id: 7, lo: 10_000_000_000n, hi: 15_000_000_000n, label: '$10,000 - $15,000' },
  { id: 8, lo: 15_000_000_000n, hi: 25_000_000_000n, label: '$15,000 - $25,000' },
  { id: 9, lo: 25_000_000_000n, hi: BAND_CEILING, label: '$25,000+' },
]

/** The band an amount falls in. Throws at or above the ceiling. */
export function bandFor(amountBaseUnits: bigint): Band {
  if (amountBaseUnits < 0n) {
    throw new Error(`bands: amount must not be negative, got ${amountBaseUnits}`)
  }
  if (amountBaseUnits >= BAND_CEILING) {
    throw new Error(
      `bands: ${amountBaseUnits} is at or above the ceiling ${BAND_CEILING} and has no provable band`,
    )
  }
  const band = BANDS.find((b) => amountBaseUnits >= b.lo && amountBaseUnits < b.hi)
  if (!band) throw new Error(`bands: no band covers ${amountBaseUnits} -- the table has a hole`)
  return band
}

/** Every amount below the ceiling must land in exactly one band. */
export function assertTableIsContiguous(): void {
  if (BANDS[0].lo !== 0n) throw new Error('bands: table must start at zero')
  for (let i = 1; i < BANDS.length; i++) {
    if (BANDS[i].lo !== BANDS[i - 1].hi) {
      throw new Error(`bands: gap or overlap between band ${i - 1} and ${i}`)
    }
  }
  if (BANDS[BANDS.length - 1].hi !== BAND_CEILING) {
    throw new Error('bands: table must end at the ceiling')
  }
}

/** Demo payroll salaries, per pay cycle. */
export const DEMO_SALARIES = {
  worker1: 2_500_000_000n, // $2,500 -> band 2
  worker2: 4_100_000_000n, // $4,100 -> band 3
  worker3: 850_000_000n, //   $850  -> band 0
} as const
