/**
 * The TypeScript third of the equivalence gate.
 *   npx tsx shared/commitment.test.ts
 */
import { commitmentFor, saltFor, SHARED_VECTOR } from './commitment'
import { encodeAbiParameters, keccak256 } from 'viem'

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

console.log('commitment scheme')

// 1. THE GATE
const { recipient, amount, period, salt, expected } = SHARED_VECTOR
check('matches the shared vector', commitmentFor({ recipient, amount, period, salt }), expected)

// 2. abi.encode, not abi.encodePacked -- the silent killer
const packed = keccak256(
  `0x${recipient.slice(2)}${amount.toString(16).padStart(64, '0')}${period
    .toString(16)
    .padStart(64, '0')}${salt.slice(2)}` as `0x${string}`,
)
check('differs from an encodePacked layout', packed !== expected, true)

// 3. the encoding really is 128 bytes
const encoded = encodeAbiParameters(
  [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes32' }],
  [recipient, amount, period, salt],
)
check('encodes to 128 bytes', (encoded.length - 2) / 2, 128)

// 4. every field separates
const base = commitmentFor({ recipient, amount, period, salt })
check(
  'recipient separates',
  base !== commitmentFor({ recipient: '0xe058c2056249287B429607814C9F21Ed48cE3B34', amount, period, salt }),
  true,
)
check('amount separates', base !== commitmentFor({ recipient, amount: amount + 1n, period, salt }), true)
check('period separates', base !== commitmentFor({ recipient, amount, period: period + 1n, salt }), true)

// 5. salt binds the deployment
const payrollA = '0x41C2f146F009b3C3eE7828f3DCf108d38e1b7EF3'
const payrollB = '0x16EaB9DA91D2AEea1F1138A95E42C37d1D47B7d2'
check('salt binds the payer', saltFor(payrollA, recipient, period) !== saltFor(payrollB, recipient, period), true)

// 6. values the circuit cannot represent are rejected here, not at proving time
const U64_MAX = (1n << 64n) - 1n
let acceptedMax = true
try {
  commitmentFor({ recipient, amount: U64_MAX, period, salt })
} catch {
  acceptedMax = false
}
check('accepts the largest u64 amount', acceptedMax, true)

let threw = false
try {
  commitmentFor({ recipient, amount: U64_MAX + 1n, period, salt })
} catch {
  threw = true
}
check('rejects an amount above the u64 witness range', threw, true)

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
