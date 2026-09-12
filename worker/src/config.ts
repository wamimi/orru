import { existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

export const WORKER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const REPO_ROOT = resolve(WORKER_ROOT, "..")

/// Reads contracts/.env first so deployment addresses live in one place, then
/// worker/.env on top for anything the worker alone needs.
function loadEnvFiles(): string[] {
  const loaded: string[] = []
  const candidates = process.env.ORRU_ENV_FILE
    ? [process.env.ORRU_ENV_FILE]
    : [resolve(REPO_ROOT, "contracts/.env"), resolve(WORKER_ROOT, ".env")]

  for (const file of candidates) {
    if (!existsSync(file)) continue
    process.loadEnvFile(file)
    loaded.push(file)
  }
  return loaded
}

export const LOADED_ENV_FILES = loadEnvFiles()

export class ConfigError extends Error {}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new ConfigError(`${name} is not set`)
  return value
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  return value ? value : fallback
}

function integer(name: string, fallback: number, min = 0): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new ConfigError(`${name} must be an integer >= ${min}, got ${raw}`)
  }
  return parsed
}

/// For values a loop divides or strides by. Zero there does not mean "unset", it
/// means a cursor that never advances.
export function positiveInt(name: string, fallback: number): number {
  return integer(name, fallback, 1)
}

function address(name: string, value: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new ConfigError(`${name} is not a 20-byte address: ${value}`)
  }
  return value as `0x${string}`
}

function optionalAddress(name: string): `0x${string}` | null {
  const value = process.env[name]?.trim()
  if (!value) return null
  return address(name, value)
}

/// Accepts a comma-separated list. More than one payroll may anchor to the same
/// PayerAnchor, and each is a distinct payer on the Creditcoin side.
function addressList(name: string): `0x${string}`[] {
  const value = process.env[name]?.trim()
  if (!value) return []
  return value
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => address(name, x))
}

/// EVM chain ids that are known to be mistaken for source chain keys. Sepolia is
/// key 1 and mainnet is key 3 on Creditcoin testnet; a chain id here means the
/// wrong constant was copied, and every proof built with it would target the
/// wrong chain.
const EVM_CHAIN_IDS = new Set([1n, 11155111n, 8453n, 84532n, 137n, 42161n, 10n])

function sourceChainKey(): number {
  const raw = optional("SOURCE_CHAIN_KEY", "1")
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`SOURCE_CHAIN_KEY must be a positive integer, got ${raw}`)
  }
  if (parsed > 3 && EVM_CHAIN_IDS.has(BigInt(parsed))) {
    throw new ConfigError(
      `SOURCE_CHAIN_KEY is ${parsed}, which is an EVM chain id, not an Attestcoin source chain key. ` +
        `Sepolia is 1 and Ethereum mainnet is 3 on Creditcoin testnet.`,
    )
  }
  return parsed
}

export interface Config {
  sepoliaRpcUrl: string
  creditcoinRpcUrl: string
  proofBuilderUrl: string
  sourceChainKey: number
  creditcoinChainId: number
  payerAnchor: `0x${string}`
  demoPayrolls: `0x${string}`[]
  payerAllowlist: `0x${string}`[]
  attestationRegistry: `0x${string}` | null
  credentialRegistry: `0x${string}` | null
  startBlock: number
  confirmations: number
  logRange: number
  checkpoint: number
  concurrency: number
  stateDir: string
  outDir: string
  circuitDir: string
}

let cached: Config | null = null

export function config(): Config {
  if (cached) return cached

  cached = {
    sepoliaRpcUrl: required("SEPOLIA_RPC_URL"),
    creditcoinRpcUrl: optional("CREDITCOIN_RPC_URL", "https://rpc.cc3-testnet.creditcoin.network"),
    proofBuilderUrl: optional("PROOF_BUILDER_URL", "https://prover.cc3-testnet.creditcoin.network/"),
    sourceChainKey: sourceChainKey(),
    creditcoinChainId: positiveInt("CREDITCOIN_CHAIN_ID", 102031),
    payerAnchor: address("PAYER_ANCHOR_ADDRESS", required("PAYER_ANCHOR_ADDRESS")),
    demoPayrolls: addressList("DEMO_PAYROLL_ADDRESS"),
    // Optional. When set, only these payers are ever relayed, and
    // everything else is discarded before any RPC call is made.
    payerAllowlist: addressList("CREDITCOIN_PAYERS"),
    attestationRegistry: optionalAddress("ATTESTATION_REGISTRY_ADDRESS"),
    credentialRegistry: optionalAddress("CREDENTIAL_REGISTRY_ADDRESS"),
    startBlock: integer("WORKER_START_BLOCK", 0),
    // Attestation needs roughly ten further blocks anyway, so waiting for a few
    // costs nothing and keeps a reorged transaction out of the state file.
    confirmations: integer("WORKER_CONFIRMATIONS", 5),
    logRange: positiveInt("WORKER_LOG_RANGE", 5_000),
    checkpoint: positiveInt("WORKER_CHECKPOINT", 2_000),
    concurrency: positiveInt("WORKER_CONCURRENCY", 8),
    stateDir: resolve(WORKER_ROOT, optional("WORKER_STATE_DIR", "state")),
    outDir: resolve(WORKER_ROOT, optional("WORKER_OUT_DIR", "out")),
    circuitDir: resolve(REPO_ROOT, "circuits/income_proof"),
  }

  return cached
}

/// Throws with the missing name rather than letting a null address reach ethers.
export function requireDeployed<K extends keyof Config>(key: K, envName: string): NonNullable<Config[K]> {
  const value = config()[key]
  if (value === null || value === undefined) {
    throw new ConfigError(`${envName} is not set — deploy the contract and record its address`)
  }
  return value as NonNullable<Config[K]>
}
