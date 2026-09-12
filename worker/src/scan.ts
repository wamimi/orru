import { getAddress } from "viem"
import { commitmentFor } from "../../shared/commitment.ts"
import { payerAnchorAbi, demoPayrollAbi } from "./abi.js"
import { sourceClient } from "./chains.js"
import { config } from "./config.js"
import { discoveryBackend, findEvents, newFetcher } from "./discovery.js"
import { log, short } from "./log.js"
import {
  loadState,
  planCursor,
  pruneAbove,
  recordCheckpoint,
  saveState,
  type WorkerState,
} from "./state.js"

interface AnchoredArgs {
  payer: `0x${string}`
  commitment: `0x${string}`
}

interface PaidArgs {
  recipient: `0x${string}`
  amount: bigint
  period: bigint
  salt: `0x${string}`
  commitment: `0x${string}`
}

export interface ScanResult {
  fromBlock: number
  toBlock: number
  newAnchorTxs: number
  newPayments: number
  mismatches: number
}

/// Reads PaymentAnchored from the anchor and PaymentMade from each payroll. The
/// anchor events say what must be attested; the payroll events carry the
/// preimages the circuit needs, and exist only because DemoPayroll emits the
/// salt alongside the commitment.
export async function scan(): Promise<ScanResult> {
  const c = config()
  const state = loadState()

  const client = sourceClient()
  const head = Number(await client.getBlockNumber())
  const toBlock = head - c.confirmations

  const plan = planCursor(state, c.demoPayrolls, c.startBlock, await findAncestor(state))

  if (plan.rewoundTo !== null) {
    log.warn("rewinding the cursor", { to: plan.rewoundTo, reason: plan.reason ?? "" })
    // Records above the ancestor describe transactions the chain no longer has.
    const dropped = pruneAbove(state, plan.rewoundTo)
    if (dropped.anchors > 0 || dropped.payments > 0) {
      log.warn("discarded orphaned records", dropped)
    }
    state.lastScannedBlock = plan.rewoundTo
    state.lastScannedHash = state.checkpoints?.at(-1)?.hash
  }
  // Recorded once the rewind decision is made, so the next run compares against
  // the set actually scanned.
  state.demoPayrolls = c.demoPayrolls
  const fromBlock = plan.fromBlock

  if (toBlock < fromBlock) {
    saveState(state)
    log.info("nothing new", { head, cursor: state.lastScannedBlock })
    return { fromBlock, toBlock: state.lastScannedBlock, newAnchorTxs: 0, newPayments: 0, mismatches: 0 }
  }

  const backend = discoveryBackend()
  log.step("scanning Sepolia", {
    from: fromBlock,
    to: toBlock,
    blocks: toBlock - fromBlock + 1,
    via: backend,
  })

  const fetcher = newFetcher()
  // Etherscan takes an arbitrary range in one request, so checkpointing only
  // buys anything on the RPC path.
  const stride = backend === "etherscan" ? toBlock - fromBlock + 1 : c.checkpoint

  let newAnchorTxs = 0
  let newPayments = 0
  let mismatches = 0

  for (let start = fromBlock; start <= toBlock; start += stride) {
    const end = Math.min(start + stride - 1, toBlock)

    const anchored = await findEvents<AnchoredArgs>(
      c.payerAnchor,
      payerAnchorAbi[0],
      start,
      end,
      fetcher,
    )

    for (const entry of anchored) {
      const { payer, commitment } = entry.args
      if (!payer || !commitment) continue

      const existing = state.anchors[entry.transactionHash]
      if (!existing) {
        state.anchors[entry.transactionHash] = {
          blockNumber: entry.blockNumber,
          commitments: [{ payer: getAddress(payer), commitment }],
          status: "pending",
          attempts: 0,
        }
        newAnchorTxs += 1
        continue
      }

      const already = existing.commitments.some(
        (x) => x.commitment === commitment && x.payer.toLowerCase() === payer.toLowerCase(),
      )
      if (!already) existing.commitments.push({ payer: getAddress(payer), commitment })
    }

    for (const payroll of c.demoPayrolls) {
      const paid = await findEvents<PaidArgs>(payroll, demoPayrollAbi[0], start, end, fetcher)

      for (const entry of paid) {
        const { recipient, amount, period, salt, commitment } = entry.args
        if (!recipient || amount === undefined || period === undefined || !salt || !commitment) continue

        // The encoding is shared with the circuit and the contracts. If it ever
        // drifts, this is where it surfaces — before a proof is built against a
        // commitment nothing on-chain will match.
        const recomputed = commitmentFor({ recipient: getAddress(recipient), amount, period, salt })
        if (recomputed.toLowerCase() !== commitment.toLowerCase()) {
          mismatches += 1
          log.error("commitment mismatch — shared/commitment.ts disagrees with the chain", {
            tx: short(entry.transactionHash),
            onchain: commitment,
            recomputed,
          })
          // Thrown here, not after the loop: the cursor is saved per checkpoint,
          // so continuing would advance past the bad block and the next run
          // would never see it again.
          throw new Error(
            `commitment mismatch at ${entry.transactionHash} — shared/commitment.ts computed ` +
              `${recomputed} but the chain says ${commitment}. The encoding has drifted; ` +
              `the cursor has not advanced past this block.`,
          )
        }

        if (state.payments.some((p) => p.commitment === commitment)) continue

        state.payments.push({
          payer: getAddress(payroll),
          recipient: getAddress(recipient),
          amount: amount.toString(),
          period: period.toString(),
          salt,
          commitment,
          txHash: entry.transactionHash,
          blockNumber: entry.blockNumber,
        })
        newPayments += 1
      }
    }

    // The hash is what makes a later reorg detectable. Advancing without it
    // leaves a cursor that `chainAgrees` reads as agreement, which is fail-open
    // exactly where the check exists to fail closed.
    const hash = await blockHash(end)
    if (!hash) {
      throw new Error(
        `scanned to block ${end} but could not read its hash, so the cursor was not advanced. ` +
          `Re-run when the RPC is healthy; nothing was lost.`,
      )
    }

    state.lastScannedBlock = end
    state.lastScannedHash = hash
    state.checkpoints = recordCheckpoint(state.checkpoints, end, hash)
    saveState(state)

    if (end < toBlock) log.info("progress", { at: end, remaining: toBlock - end })
  }

  log.info("scan complete", {
    anchorTxs: newAnchorTxs,
    payments: newPayments,
    mismatches,
    cursor: state.lastScannedBlock,
  })

  return { fromBlock, toBlock, newAnchorTxs, newPayments, mismatches }
}

/// The highest journalled block the chain still agrees with.
///
/// Returns `lastScannedBlock` when nothing forked, a lower block when it did,
/// and `null` when no checkpoint survives — a fork deeper than the journal,
/// where guessing a rewind depth would silently lose history.
async function findAncestor(state: WorkerState): Promise<number | null> {
  const journal = state.checkpoints ?? []

  // Nothing journalled: either a fresh state, or one written before checkpoints
  // existed. Fall back to the single recorded hash.
  if (journal.length === 0) {
    if (!state.lastScannedHash || state.lastScannedBlock <= 0) return state.lastScannedBlock
    return (await hashMatches(state.lastScannedBlock, state.lastScannedHash))
      ? state.lastScannedBlock
      : null
  }

  for (let i = journal.length - 1; i >= 0; i--) {
    const { block, hash } = journal[i]!
    if (await hashMatches(block, hash)) return block
  }

  return null
}

async function hashMatches(blockNumber: number, expected: string): Promise<boolean> {
  try {
    const block = await sourceClient().getBlock({ blockNumber: BigInt(blockNumber) })
    return block.hash?.toLowerCase() === expected.toLowerCase()
  } catch {
    // Gone or unreachable. Treating that as agreement would scan past a reorg.
    return false
  }
}

async function blockHash(blockNumber: number): Promise<string | undefined> {
  try {
    const block = await sourceClient().getBlock({ blockNumber: BigInt(blockNumber) })
    return block.hash ?? undefined
  } catch {
    return undefined
  }
}

export function summarise(state: WorkerState): Record<string, number> {
  const counts: Record<string, number> = { pending: 0, submitted: 0, accepted: 0, failed: 0 }
  for (const a of Object.values(state.anchors)) counts[a.status] = (counts[a.status] ?? 0) + 1
  return counts
}
