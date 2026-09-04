import type { AbiEvent, GetLogsReturnType, PublicClient } from "viem"
import { log } from "./log.js"

/// Providers disagree wildly on how many blocks one eth_getLogs may cover —
/// Alchemy's free tier allows ten, others allow ten thousand — and they only say
/// so by failing. The fetcher discovers the limit once and reuses it.
const RANGE_ERROR = /block range|range is too large|limited to|query returned more than|too many results|exceeds the limit|up to a \d+ block/i

const MIN_SPAN = 1

export class LogFetcher {
  private span: number
  private probed = false

  constructor(
    private readonly client: PublicClient,
    span: number,
    private readonly concurrency: number = 8,
  ) {
    this.span = Math.max(span, MIN_SPAN)
  }

  get currentSpan(): number {
    return this.span
  }

  /// Fetches [from, to] inclusive, shrinking the span on range errors and
  /// issuing several requests at a time once the span is known to work.
  async collect<TEvent extends AbiEvent>(
    address: `0x${string}`,
    event: TEvent,
    from: number,
    to: number,
  ): Promise<GetLogsReturnType<TEvent>> {
    const out = [] as unknown as GetLogsReturnType<TEvent>
    let cursor = from

    while (cursor <= to) {
      const windows: [number, number][] = []
      const width = this.probed ? this.concurrency : 1

      for (let i = 0; i < width && cursor <= to; i++) {
        const end = Math.min(cursor + this.span - 1, to)
        windows.push([cursor, end])
        cursor = end + 1
      }

      const batches = await Promise.all(
        windows.map(([a, b]) => this.fetchWindow(address, event, a, b)),
      )
      for (const batch of batches) out.push(...batch)
      this.probed = true
    }

    return out
  }

  private async fetchWindow<TEvent extends AbiEvent>(
    address: `0x${string}`,
    event: TEvent,
    from: number,
    to: number,
  ): Promise<GetLogsReturnType<TEvent>> {
    try {
      return (await this.client.getLogs({
        address,
        event,
        fromBlock: BigInt(from),
        toBlock: BigInt(to),
      })) as GetLogsReturnType<TEvent>
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const width = to - from + 1

      if (!RANGE_ERROR.test(message) || width <= MIN_SPAN) throw error

      const half = Math.max(Math.floor(width / 2), MIN_SPAN)
      if (half < this.span) {
        this.span = half
        this.probed = false
        log.warn("RPC rejected the block range, shrinking", { span: half })
      }

      const mid = from + half - 1
      const left = await this.fetchWindow(address, event, from, mid)
      const right = to > mid ? await this.fetchWindow(address, event, mid + 1, to) : []
      return [...left, ...right] as GetLogsReturnType<TEvent>
    }
  }
}
