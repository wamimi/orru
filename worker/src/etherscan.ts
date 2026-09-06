import { ConfigError } from "./config.js"
import { log } from "./log.js"

export interface RawLog {
  address: `0x${string}`
  topics: `0x${string}`[]
  data: `0x${string}`
  blockNumber: number
  transactionHash: `0x${string}`
  logIndex: number
}

const BASE = "https://api.etherscan.io/v2/api"
const PAGE_SIZE = 1000

/// Free-tier Etherscan allows three calls a second, and answers a fourth with a
/// NOTOK body rather than an HTTP error.
/// Read on use, not at import: a bad value thrown during module evaluation
/// escapes the CLI's error handler and surfaces as a stack trace.
///
/// A non-numeric value here used to become NaN, and `attempt >= NaN` is never
/// true — so a persistent rate limit retried forever instead of giving up.
function bounded(name: string, fallback: number, min: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
    throw new ConfigError(`${name} must be an integer >= ${min}, got ${raw}`)
  }
  return parsed
}

const minIntervalMs = () => bounded("ETHERSCAN_MIN_INTERVAL_MS", 400, 0)
const maxRetries = () => bounded("ETHERSCAN_MAX_RETRIES", 5, 0)
const RATE_LIMITED = /rate limit|too many/i
let lastCall = 0

async function throttle(): Promise<void> {
  const wait = lastCall + minIntervalMs() - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
}

export function etherscanConfigured(): boolean {
  return Boolean(process.env.ETHERSCAN_API_KEY?.trim())
}

/// Discovery only. Nothing here is trusted: every commitment is recomputed
/// locally and every payment is re-proved through Attestcoin before it counts.
export async function fetchLogs(
  chainId: number,
  address: `0x${string}`,
  topic0: `0x${string}`,
  fromBlock: number,
  toBlock: number,
): Promise<RawLog[]> {
  const apiKey = process.env.ETHERSCAN_API_KEY?.trim()
  if (!apiKey) throw new Error("ETHERSCAN_API_KEY is not set")

  // Validated here rather than at import, so a bad value is reported by the
  // CLI's handler instead of escaping as a stack trace — and on every scan
  // rather than only when a rate limit happens to be hit.
  minIntervalMs()
  maxRetries()

  const out: RawLog[] = []

  for (let page = 1; ; page++) {
    const url =
      `${BASE}?chainid=${chainId}&module=logs&action=getLogs` +
      `&address=${address}&topic0=${topic0}` +
      `&fromBlock=${fromBlock}&toBlock=${toBlock}` +
      `&page=${page}&offset=${PAGE_SIZE}&apikey=${apiKey}`

    const body = await getWithBackoff(url)

    // "No records found" comes back as status 0, which is not an error.
    if (body.status !== "1") {
      if (typeof body.result === "string" && /no records/i.test(body.message ?? "")) break
      if (Array.isArray(body.result) && body.result.length === 0) break
      throw new Error(`Etherscan: ${body.message} ${typeof body.result === "string" ? body.result : ""}`)
    }

    const rows = body.result as Record<string, string>[]
    for (const row of rows) {
      out.push({
        address: row.address as `0x${string}`,
        topics: (row.topics ?? []) as `0x${string}`[],
        data: (row.data === "0x" || !row.data ? "0x" : row.data) as `0x${string}`,
        blockNumber: Number(BigInt(row.blockNumber ?? "0x0")),
        transactionHash: row.transactionHash as `0x${string}`,
        logIndex: Number(BigInt(row.logIndex ?? "0x0")),
      })
    }

    if (rows.length < PAGE_SIZE) break
    log.info("etherscan page", { page, records: out.length })
  }

  return out
}

interface EtherscanBody {
  status: string
  message: string
  result: unknown
}

/// Rate limiting arrives as a 200 with a NOTOK body, so it has to be read out of
/// the payload rather than the status code. Backs off and retries; anything else
/// is returned for the caller to interpret.
async function getWithBackoff(url: string): Promise<EtherscanBody> {
  let delay = minIntervalMs()

  for (let attempt = 0; ; attempt++) {
    await throttle()

    const response = await fetch(url)
    if (!response.ok) {
      if (response.status !== 429 || attempt >= maxRetries()) {
        throw new Error(`Etherscan HTTP ${response.status}`)
      }
    } else {
      const body = (await response.json()) as EtherscanBody
      const limited =
        body.status !== "1" &&
        typeof body.result === "string" &&
        RATE_LIMITED.test(body.result)

      if (!limited) return body
      if (attempt >= maxRetries()) {
        throw new Error(`Etherscan rate limit persisted after ${maxRetries()} retries: ${body.result}`)
      }
    }

    delay *= 2
    log.warn("etherscan rate limited, backing off", { ms: delay, attempt: attempt + 1 })
    await new Promise((r) => setTimeout(r, delay))
  }
}
