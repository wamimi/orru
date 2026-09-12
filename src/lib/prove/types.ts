/** Must match circuits/income_proof/src/main.nr and CredentialRegistry.PERIODS. */
export const PERIODS = 3
export const PUBLIC_INPUTS = 2 + PERIODS * 2

/**
 * One pay cycle, as the payer recorded it. These are the circuit's PRIVATE
 * witness — they are what the proof exists to keep off the chain and out of any
 * server. They must reach the browser and go no further.
 */
export interface PaymentSlip {
  /** Base units of a six-decimal token. */
  amount: string
  period: string
  /** 32 bytes, hex. */
  salt: `0x${string}`
  /** keccak256(abi.encode(recipient, amount, period, salt)). */
  commitment: `0x${string}`
}

export interface ProveInput {
  recipient: `0x${string}`
  band: number
  /** Exactly PERIODS slips, consecutive periods, all in the same band. */
  slips: PaymentSlip[]
}

export interface ProveResult {
  proof: `0x${string}`
  publicInputs: `0x${string}`[]
}

export type ProveProgress =
  | { stage: "loading" }
  | { stage: "witness" }
  | { stage: "proving" }
  | { stage: "done" }
