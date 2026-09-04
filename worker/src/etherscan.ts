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

/// Free-tier Etherscan allows five calls a second.
const MIN_INTERVAL_MS = Number(process.env.ETHERSCAN_MIN_INTERVAL_MS ?? 250)
let lastCall = 0

async function throttle(): Promise<void> {
  const wait = lastCall + MIN_INTERVAL_MS - Date.now()
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

  const out: RawLog[] = []

  for (let page = 1; ; page++) {
    await throttle()

    const url =
      `${BASE}?chainid=${chainId}&module=logs&action=getLogs` +
      `&address=${address}&topic0=${topic0}` +
      `&fromBlock=${fromBlock}&toBlock=${toBlock}` +
      `&page=${page}&offset=${PAGE_SIZE}&apikey=${apiKey}`

    const response = await fetch(url)
    if (!response.ok) throw new Error(`Etherscan HTTP ${response.status}`)

    const body = (await response.json()) as { status: string; message: string; result: unknown }

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
