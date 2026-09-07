/**
 * Bands are declared here and again as globals in the circuit. Nothing enforces
 * agreement, so this asserts it by parsing the circuit source.
 *   npx tsx shared/bands.test.ts
 */
import { readFileSync } from 'node:fs'
import { BANDS, BAND_CEILING, bandFor, assertTableIsContiguous, DEMO_SALARIES } from './bands'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`)
  if (!ok) {
    console.log(`        expected ${expected}`)
    console.log(`        got      ${actual}`)
    failures++
  }
}

console.log('income bands')

assertTableIsContiguous()
check('table is contiguous and ends at the ceiling', true, true)

// Parse BAND_LO / BAND_HI out of the circuit
const nr = readFileSync(new URL('../circuits/income_proof/src/main.nr', import.meta.url), 'utf8')
function parseGlobal(name: string): bigint[] {
  const m = nr.match(new RegExp(`global ${name}: \\[u64; \\d+\\] = \\[([^\\]]*)\\]`, 's'))
  if (!m) throw new Error(`could not find ${name} in the circuit`)
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/_/g, ''))
    .filter((s) => s.length > 0)
    .map((s) => BigInt(s))
}

const circuitLo = parseGlobal('BAND_LO')
const circuitHi = parseGlobal('BAND_HI')

check('circuit declares the same number of bands', circuitLo.length, BANDS.length)
check('circuit BAND_HI has the same length', circuitHi.length, BANDS.length)

for (let i = 0; i < BANDS.length; i++) {
  check(`band ${i} lower bound matches the circuit`, circuitLo[i], BANDS[i].lo)
  check(`band ${i} upper bound matches the circuit`, circuitHi[i], BANDS[i].hi)
}

check('circuit ceiling matches', circuitHi[circuitHi.length - 1], BAND_CEILING)

// The pool declares the floors a third time
const sol = readFileSync(
  new URL('../contracts/src/creditcoin/DemoCreditPool.sol', import.meta.url),
  'utf8',
)
const floorsBlock = sol.match(/uint256\[10\] memory floors = \[([^\]]*)\]/s)
if (!floorsBlock) throw new Error('could not find the floor table in DemoCreditPool')
const solFloors = floorsBlock[1]
  .split(',')
  .map((x) => x.trim().replace(/uint256\(|\)|_/g, ''))
  .filter((x) => x.length > 0)
  .map((x) => BigInt(x))

check('pool declares the same number of floors', solFloors.length, BANDS.length)
for (let i = 0; i < BANDS.length; i++) {
  check(`band ${i} floor matches the credit pool`, solFloors[i], BANDS[i].lo)
}

// Demo salaries must land where the screens expect
check('worker1 is band 4', bandFor(DEMO_SALARIES.worker1).id, 4)
check('worker2 is band 5', bandFor(DEMO_SALARIES.worker2).id, 5)
check('worker3 is band 1', bandFor(DEMO_SALARIES.worker3).id, 1)

// Boundaries are half-open: lo inclusive, hi exclusive
check('lower bound is inclusive', bandFor(BANDS[4].lo).id, 4)
check('upper bound belongs to the next band', bandFor(BANDS[4].hi).id, 5)

let threw = false
try {
  bandFor(BAND_CEILING)
} catch {
  threw = true
}
check('rejects an amount at the ceiling', threw, true)

// Band ids must equal their index, or a lookup by id reads the wrong row.
for (let i = 0; i < BANDS.length; i++) {
  check(`band ${i} id equals its index`, BANDS[i].id, i)
}

// Structural constants duplicated across the language boundary.
const sol2 = readFileSync(
  new URL('../contracts/src/creditcoin/CredentialRegistry.sol', import.meta.url),
  'utf8',
)
const num = (src: string, re: RegExp, label: string): bigint => {
  const m = src.match(re)
  if (!m) throw new Error(`could not find ${label}`)
  return BigInt(m[1].replace(/_/g, ''))
}

const solPeriods = num(sol2, /uint256 public constant PERIODS = (\d+)/, 'PERIODS')
const solBandCount = num(sol2, /uint256 public constant BAND_COUNT = (\d+)/, 'BAND_COUNT')
const nrPeriods = num(nr, /global PERIODS: u32 = (\d+)/, 'circuit PERIODS')
const nrBandCount = num(nr, /global BAND_COUNT: u32 = (\d+)/, 'circuit BAND_COUNT')

check('PERIODS agrees across circuit and contract', nrPeriods, solPeriods)
check('BAND_COUNT agrees across circuit and contract', nrBandCount, solBandCount)
check('BAND_COUNT matches the table length', Number(solBandCount), BANDS.length)

// Public input count must equal 2 + 2 per period, and match the verifier.
const solPublicInputs = 2n + solPeriods * 2n
const verifier = readFileSync(
  new URL('../contracts/src/verifier/IncomeVerifier.sol', import.meta.url),
  'utf8',
)
const vkInputs = num(verifier, /NUMBER_OF_PUBLIC_INPUTS = (\d+)/, 'verifier public inputs')
check('verifier public inputs = app inputs + 16 pairing points', vkInputs, solPublicInputs + 16n)

// The pool's floor lookup must be indexed the same way.
const poolBandCount = num(sol, /uint256 public constant BAND_COUNT = (\d+)/, 'pool BAND_COUNT')
check('pool BAND_COUNT agrees', poolBandCount, solBandCount)

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
