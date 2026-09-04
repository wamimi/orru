/**
 * Commitment encoding shared by the contracts, the circuit and the frontend.
 * Do not reimplement this elsewhere.
 */

import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem'

/** The circuit holds amounts and periods as u64 witnesses. */
const U64_MAX = (1n << 64n) - 1n

export interface Payment {
  /** The worker being paid. */
  recipient: Address
  /** Amount in token base units. USDC has SIX decimals: 1 USDC === 1_000_000n. */
  amount: bigint
  /** Payroll period index. 1-indexed; see DemoPayroll.currentPeriod(). */
  period: bigint
  /** 32-byte salt. Emitted in PaymentMade so the worker can reconstruct. */
  salt: Hex
}

/**
 * keccak256(abi.encode(address, uint256, uint256, bytes32)).
 * `abi.encode`, not `abi.encodePacked`: four 32-byte words, 128 bytes total.
 */
export function commitmentFor({ recipient, amount, period, salt }: Payment): Hex {
  assertProvable(amount, 'amount')
  assertProvable(period, 'period')

  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes32' }],
      [recipient, amount, period, salt],
    ),
  )
}

/**
 * Mirrors DemoPayroll.saltFor. Binds the payer so two deployments never collide.
 * Deterministic over public inputs, so the commitment is not hiding on the
 * source chain.
 */
export function saltFor(payer: Address, recipient: Address, period: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }],
      [payer, recipient, period],
    ),
  )
}

/** Anything the circuit cannot represent must fail here, not at proving time. */
function assertProvable(value: bigint, label: string): void {
  if (value < 0n) {
    throw new Error(`commitment: ${label} must not be negative, got ${value}`)
  }
  if (value > U64_MAX) {
    throw new Error(
      `commitment: ${label} exceeds the circuit's u64 witness range. Got ${value}.`,
    )
  }
}

/** Fixed vector asserted in Solidity, Noir and TypeScript. */
export const SHARED_VECTOR = {
  recipient: '0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C' as Address,
  amount: 50_000n, // 0.05 USDC
  period: 2n,
  salt: '0x00000000000000000000000000000000000000000000000000000000000000ff' as Hex,
  expected: '0x17aeddb687d315c564ebb7276ed88c253d82c1b21a7610c6c963e8f317dbbfb5' as Hex,
} as const
