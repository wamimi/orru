import { decodeEventLog, toEventSelector, type AbiEvent } from "viem"
import { sourceClient } from "./chains.js"
import { config } from "./config.js"
import { etherscanConfigured, fetchLogs } from "./etherscan.js"
import { log } from "./log.js"
import { LogFetcher } from "./logs.js"

export interface Found<TArgs> {
  args: TArgs
  blockNumber: number
  transactionHash: `0x${string}`
}

/// Etherscan when a key is present, otherwise eth_getLogs. Both are the FIND
/// layer: convenient, replaceable, and trusted for nothing. Attestcoin is what
/// makes a payment count.
export function discoveryBackend(): "etherscan" | "rpc" {
  const forced = process.env.WORKER_LOG_SOURCE?.trim().toLowerCase()
  if (forced === "rpc") return "rpc"
  if (forced === "etherscan") return "etherscan"
  return etherscanConfigured() ? "etherscan" : "rpc"
}

export async function findEvents<TArgs>(
  address: `0x${string}`,
  event: AbiEvent,
  fromBlock: number,
  toBlock: number,
  fetcher: LogFetcher,
): Promise<Found<TArgs>[]> {
  if (discoveryBackend() === "etherscan") {
    const raw = await fetchLogs(11155111, address, toEventSelector(event), fromBlock, toBlock)
    const out: Found<TArgs>[] = []

    for (const entry of raw) {
      try {
        const decoded = decodeEventLog({ abi: [event], topics: entry.topics as never, data: entry.data })
        out.push({
          args: decoded.args as TArgs,
          blockNumber: entry.blockNumber,
          transactionHash: entry.transactionHash,
        })
      } catch (error) {
        log.warn("undecodable log skipped", {
          tx: entry.transactionHash,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return out
  }

  const logs = await fetcher.collect(address, event, fromBlock, toBlock)
  return logs
    .filter((l) => l.transactionHash !== null && l.blockNumber !== null)
    .map((l) => ({
      args: l.args as TArgs,
      blockNumber: Number(l.blockNumber),
      transactionHash: l.transactionHash as `0x${string}`,
    }))
}

export function newFetcher(): LogFetcher {
  const c = config()
  return new LogFetcher(sourceClient(), c.logRange, c.concurrency)
}
