import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { getAddress, isAddressEqual, type Hex } from "viem"
import { bandFor } from "../../shared/bands.ts"
import { commitmentFor } from "../../shared/commitment.ts"
import { attestationRegistryAbi } from "./abi.js"
import { creditcoinClient } from "./chains.js"
import { config } from "./config.js"
import { log, short } from "./log.js"
import { slipsAsPayments } from "./slips.js"
import { loadState, paymentsFor, type PaymentRecord } from "./state.js"

/// Must match circuits/income_proof/src/main.nr and CredentialRegistry.PERIODS.
export const PERIODS = 3
export const PUBLIC_INPUTS = 2 + PERIODS * 2

export interface ProveOptions {
  recipient: string
  payer: string
  allowUnattested: boolean
}

export interface ProofBundle {
  subject: `0x${string}`
  evidencePayer: `0x${string}`
  band: number
  bandLabel: string
  periods: string[]
  commitments: Hex[]
  proof: Hex
  publicInputs: Hex[]
}

export async function prove(options: ProveOptions): Promise<ProofBundle> {
  const c = config()
  const subject = getAddress(options.recipient)
  const payer = getAddress(options.payer)

  const window = await selectWindow(subject, payer, options)
  const band = bandForWindow(window)

  log.step("building proof", {
    subject: short(subject),
    band: band.id,
    periods: window.map((p) => p.period).join(","),
  })

  const attested = await checkAttested(window, payer, options.allowUnattested)
  if (!attested) {
    throw new Error(
      "commitments are not attested on Creditcoin — run `npm run attest` first, " +
        "or pass --allow-unattested to build a proof that cannot yet be issued",
    )
  }

  writeProverToml(window, subject, band.id)
  runToolchain()

  const { proof, publicInputs } = readOutputs()
  assertPublicInputsMatch(publicInputs, subject, band.id, window)

  const bundle: ProofBundle = {
    subject,
    evidencePayer: payer,
    band: band.id,
    bandLabel: band.label,
    periods: window.map((p) => p.period),
    commitments: window.map((p) => p.commitment),
    proof,
    publicInputs,
  }

  mkdirSync(c.outDir, { recursive: true })
  const path = resolve(c.outDir, `proof-${subject}-${window[0]!.period}.json`)
  writeFileSync(path, `${JSON.stringify(bundle, null, 2)}\n`)

  log.info("proof written", { file: path, proofBytes: (proof.length - 2) / 2 })
  log.info("next step", {
    action: "the subject must sign the EIP-712 Issue authorization, then call CredentialRegistry.issue",
  })

  return bundle
}

/// The newest run of PERIODS consecutive periods. The circuit requires
/// `periods[i] == periods[i-1] + 1`, so a gap makes the window unprovable.
/// Union of two payment sources, deduplicated by commitment, oldest period first.
export function mergeByCommitment(a: PaymentRecord[], b: PaymentRecord[]): PaymentRecord[] {
  const seen = new Set<string>()
  return [...a, ...b]
    .filter((p) => (seen.has(p.commitment) ? false : (seen.add(p.commitment), true)))
    .sort((x, y) => (BigInt(x.period) < BigInt(y.period) ? -1 : 1))
}

/// The newest run of PERIODS consecutive periods within `records`. Pure, so the
/// selection rule can be tested without a chain.
export function pickWindow(records: PaymentRecord[], periods: number): PaymentRecord[] | null {
  for (let end = records.length - 1; end >= periods - 1; end--) {
    const window = records.slice(end - periods + 1, end + 1)
    const consecutive = window.every(
      (p, i) => i === 0 || BigInt(p.period) === BigInt(window[i - 1]!.period) + 1n,
    )
    if (consecutive) return window
  }
  return null
}

async function selectWindow(
  subject: `0x${string}`,
  payer: `0x${string}`,
  options: ProveOptions,
): Promise<PaymentRecord[]> {
  const state = loadState()
  // Scanned PaymentMade events, plus any off-chain slips the recipient holds for
  // this payer. A payer that never publishes amounts produces only the latter.
  const all = mergeByCommitment(
    paymentsFor(state, subject, payer),
    slipsAsPayments(subject, payer),
  )

  if (all.length === 0) {
    throw new Error(
      `no payments recorded for ${subject} from payer ${payer} — run \`npm run scan\` first`,
    )
  }

  if (options.allowUnattested) {
    const window = pickWindow(all, PERIODS)
    if (!window) {
      throw new Error(
        `no ${PERIODS} consecutive periods for ${subject} — recorded periods: ` +
          all.map((p) => p.period).join(", "),
      )
    }
    return window
  }

  // Anchored on Sepolia is not the same as attested on Creditcoin. Selecting on
  // the former picks the newest window the payroll emitted, which is usually the
  // one the relayer has not reached yet — and the proof then cannot be issued.
  const anchored = new Set(
    Object.values(state.anchors)
      .flatMap((a) => a.commitments)
      .filter((x) => isAddressEqual(x.payer, payer))
      .map((x) => x.commitment.toLowerCase()),
  )

  const attested = await attestedCommitments(
    all.filter((p) => anchored.has(p.commitment.toLowerCase())),
    payer,
  )
  const eligible = all.filter((p) => attested.has(p.commitment.toLowerCase()))

  if (eligible.length < PERIODS) {
    throw new Error(
      `need ${PERIODS} attested payments from ${payer}, found ${eligible.length} for ${subject}. ` +
        `Run \`npm run attest -- --submit\` first.`,
    )
  }

  const window = pickWindow(eligible, PERIODS)
  if (!window) {
    throw new Error(
      `no ${PERIODS} consecutive ATTESTED periods for ${subject} — attested periods: ` +
        eligible.map((p) => p.period).join(", ") +
        `. Attest more anchors and retry.`,
    )
  }
  return window
}

/// Which of these commitments the registry has accepted for this payer.
async function attestedCommitments(
  records: PaymentRecord[],
  payer: `0x${string}`,
): Promise<Set<string>> {
  const registry = config().attestationRegistry
  if (!registry) {
    throw new Error("ATTESTATION_REGISTRY_ADDRESS is not set — deploy it, or pass --allow-unattested")
  }

  const cc = creditcoinClient()
  const accepted = new Set<string>()

  for (const p of records) {
    const ok = await cc.readContract({
      address: registry,
      abi: attestationRegistryAbi,
      functionName: "acceptedByPayer",
      args: [p.commitment, payer],
    })
    if (ok) accepted.add(p.commitment.toLowerCase())
  }
  return accepted
}

function bandForWindow(window: PaymentRecord[]): { id: number; label: string } {
  const bands = window.map((p) => bandFor(BigInt(p.amount)))
  const first = bands[0]!
  for (const b of bands) {
    if (b.id !== first.id) {
      throw new Error(
        `amounts span bands ${bands.map((x) => x.id).join(",")} — the circuit proves one band for the whole window`,
      )
    }
  }
  return { id: first.id, label: first.label }
}

async function checkAttested(
  window: PaymentRecord[],
  payer: `0x${string}`,
  allowUnattested: boolean,
): Promise<boolean> {
  const registry = config().attestationRegistry
  if (!registry) {
    if (allowUnattested) {
      log.warn("ATTESTATION_REGISTRY_ADDRESS is not set — skipping the attestation check")
      return true
    }
    return false
  }

  const cc = creditcoinClient()
  for (const p of window) {
    const accepted = await cc.readContract({
      address: registry,
      abi: attestationRegistryAbi,
      functionName: "acceptedByPayer",
      args: [p.commitment, payer],
    })
    if (!accepted) {
      log.warn("commitment not attested", { period: p.period, commitment: short(p.commitment) })
      if (!allowUnattested) return false
    }
  }
  return true
}

function writeProverToml(window: PaymentRecord[], subject: `0x${string}`, band: number): void {
  const c = config()

  const amounts = window.map((p) => `"${p.amount}"`).join(", ")
  const periods = window.map((p) => `"${p.period}"`).join(", ")
  const salts = window
    .map((p) => {
      const bytes = hexToBytes(p.salt)
      return `  [${bytes.map((b) => `"${b}"`).join(", ")}]`
    })
    .join(",\n")
  const commitments = window
    .map((p) => {
      const [hi, lo] = splitLimbs(p.commitment)
      return `  ["${hi}", "${lo}"]`
    })
    .join(",\n")

  const toml = [
    "# Generated by worker/src/prove.ts. Overwritten on every run.",
    `amounts = [${amounts}]`,
    `periods = [${periods}]`,
    "salts = [",
    salts,
    "]",
    `recipient = "${subject}"`,
    `band = "${band}"`,
    "commitments = [",
    commitments,
    "]",
    "",
  ].join("\n")

  writeFileSync(resolve(c.circuitDir, "Prover.toml"), toml)
}

function runToolchain(): void {
  const cwd = config().circuitDir
  const run = (cmd: string, args: string[]) => {
    log.info(`${cmd} ${args.join(" ")}`)
    execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
  }

  run("nargo", ["compile"])
  run("nargo", ["execute", "income_witness"])
  // Keccak everywhere: the VK, the proof and the Solidity verifier must share
  // one transcript or on-chain verification fails without a useful error.
  run("bb", ["write_vk", "-b", "./target/income_proof.json", "-o", "./target", "--oracle_hash", "keccak"])
  run("bb", [
    "prove",
    "-b",
    "./target/income_proof.json",
    "-w",
    "./target/income_witness.gz",
    "-k",
    "./target/vk",
    "-o",
    "./target",
    "--oracle_hash",
    "keccak",
  ])
  run("bb", [
    "verify",
    "-p",
    "./target/proof",
    "-k",
    "./target/vk",
    "-i",
    "./target/public_inputs",
    "--oracle_hash",
    "keccak",
  ])
}

function readOutputs(): { proof: Hex; publicInputs: Hex[] } {
  const target = resolve(config().circuitDir, "target")
  const proofPath = resolve(target, "proof")
  const inputsPath = resolve(target, "public_inputs")

  if (!existsSync(proofPath)) throw new Error(`bb produced no proof at ${proofPath}`)
  if (!existsSync(inputsPath)) throw new Error(`bb produced no public inputs at ${inputsPath}`)

  const proof = `0x${readFileSync(proofPath).toString("hex")}` as Hex

  const raw = readFileSync(inputsPath)
  if (raw.length % 32 !== 0) {
    throw new Error(`public_inputs is ${raw.length} bytes, not a whole number of 32-byte words`)
  }
  const publicInputs: Hex[] = []
  for (let i = 0; i < raw.length; i += 32) {
    publicInputs.push(`0x${raw.subarray(i, i + 32).toString("hex")}` as Hex)
  }

  return { proof, publicInputs }
}

/// The contract reads these positionally. If bb ever reorders them the proof
/// still verifies and the credential is issued against the wrong values.
function assertPublicInputsMatch(
  publicInputs: Hex[],
  subject: `0x${string}`,
  band: number,
  window: PaymentRecord[],
): void {
  if (publicInputs.length !== PUBLIC_INPUTS) {
    throw new Error(`bb returned ${publicInputs.length} public inputs, expected ${PUBLIC_INPUTS}`)
  }

  if (BigInt(publicInputs[0]!) !== BigInt(subject)) {
    throw new Error(`public input 0 is ${publicInputs[0]}, expected the subject ${subject}`)
  }
  if (BigInt(publicInputs[1]!) !== BigInt(band)) {
    throw new Error(`public input 1 is ${publicInputs[1]}, expected band ${band}`)
  }

  window.forEach((p, i) => {
    const [hi, lo] = splitLimbs(p.commitment)
    if (BigInt(publicInputs[2 + i * 2]!) !== hi) {
      throw new Error(`commitment ${i} high limb mismatch at public input ${2 + i * 2}`)
    }
    if (BigInt(publicInputs[3 + i * 2]!) !== lo) {
      throw new Error(`commitment ${i} low limb mismatch at public input ${3 + i * 2}`)
    }

    const recomputed = commitmentFor({
      recipient: p.recipient,
      amount: BigInt(p.amount),
      period: BigInt(p.period),
      salt: p.salt,
    })
    if (recomputed.toLowerCase() !== p.commitment.toLowerCase()) {
      throw new Error(`commitment ${i} does not recompute from its preimage`)
    }
  })
}

/// High 16 bytes then low 16 bytes. A full 32-byte digest exceeds the bn254
/// scalar field, so the circuit carries it as two 128-bit Fields.
function splitLimbs(commitment: Hex): [bigint, bigint] {
  const value = BigInt(commitment)
  return [value >> 128n, value & ((1n << 128n) - 1n)]
}

function hexToBytes(hex: Hex): number[] {
  const body = hex.slice(2)
  const out: number[] = []
  for (let i = 0; i < body.length; i += 2) out.push(parseInt(body.slice(i, i + 2), 16))
  return out
}
