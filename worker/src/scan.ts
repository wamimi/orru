import { getAddress } from "viem"
import { commitmentFor } from "../../shared/commitment.ts"
import { payerAnchorAbi, demoPayrollAbi } from "./abi.js"
import { sourceClient } from "./chains.js"
import { config } from "./config.js"
import { discoveryBackend, findEvents, newFetcher } from "./discovery.js"
import { log, short } from "./log.js"
import { loadState, saveState, type WorkerState } from "./state.js"

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

  const head = Number(await sourceClient().getBlockNumber())
  const toBlock = head - c.confirmations
  const fromBlock = Math.max(state.lastScannedBlock + 1, c.startBlock)

  if (toBlock < fromBlock) {
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
          continue
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

    state.lastScannedBlock = end
    saveState(state)

    if (end < toBlock) log.info("progress", { at: end, remaining: toBlock - end })
  }

  log.info("scan complete", {
    anchorTxs: newAnchorTxs,
    payments: newPayments,
    mismatches,
    cursor: state.lastScannedBlock,
  })

  if (mismatches > 0) {
    throw new Error(
      `${mismatches} commitment(s) did not match shared/commitment.ts — refusing to continue, the encoding has drifted`,
    )
  }

  return { fromBlock, toBlock, newAnchorTxs, newPayments, mismatches }
}

export function summarise(state: WorkerState): Record<string, number> {
  const counts: Record<string, number> = { pending: 0, submitted: 0, accepted: 0, failed: 0 }
  for (const a of Object.values(state.anchors)) counts[a.status] = (counts[a.status] ?? 0) + 1
  return counts
}
