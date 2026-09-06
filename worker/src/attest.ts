import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { ethers } from "ethers"
import { chainInfo, proofProvider } from "@gluwa/usc-sdk"
import { attestationRegistryAbi, EXECUTE_SIGNATURE } from "./abi.js"
import { creditcoinClient } from "./chains.js"
import { config, positiveInt, requireDeployed } from "./config.js"
import { log, short } from "./log.js"
import {
  approvalIsFresh,
  backoffMs,
  loadState,
  payersOf,
  pairKey,
  pendingAnchors,
  relayable,
  saveState,
  withinAllowlist,
  type AnchorTx,
} from "./state.js"
import { loadSigner } from "./signer.js"

/// Attestation trails the source head, and a continuity proof needs a later
/// attested point than the block itself.
const LOOKAHEAD = positiveInt("WORKER_ATTEST_LOOKAHEAD", 10)
const POLL_MS = positiveInt("WORKER_POLL_MS", 5_000)
const WAIT_MS = positiveInt("WORKER_WAIT_MS", 1_200_000)

/// New payers checked on-chain per pass. Cached results persist, so a genuine
/// backlog clears over a few passes while spam cannot amplify.
const MAX_APPROVAL_LOOKUPS = positiveInt("WORKER_MAX_APPROVAL_LOOKUPS", 25)

export interface AttestOptions {
  submit: boolean
  limit: number
}

export async function attest(options: AttestOptions): Promise<void> {
  const c = config()
  const registryAddress = requireDeployed("attestationRegistry", "ATTESTATION_REGISTRY_ADDRESS")

  const state = loadState()
  const candidates = pendingAnchors(state)

  if (candidates.length === 0) {
    log.info("no pending anchor transactions")
    return
  }

  const cc = creditcoinClient()
  await assertRegistryMatchesConfig(cc, registryAddress)

  // Anyone can anchor a commitment, so the filter runs BEFORE the limit or
  // unapproved anchors fill every pass, oldest first. Three layers, cheapest
  // first: a local allowlist costs nothing, the cache costs nothing, and only
  // genuinely unknown payers reach the chain — bounded, so ten thousand spam
  // addresses cannot force ten thousand sequential reads every pass.
  const allowlist = new Set(c.payerAllowlist.map((a) => a.toLowerCase()))
  const shortlist = withinAllowlist(candidates, allowlist)
  if (shortlist.length < candidates.length) {
    log.info("outside the payer allowlist", { ignored: candidates.length - shortlist.length })
  }

  state.payerApprovals ??= {}
  const approved = new Set<string>()
  let lookups = 0

  for (const payer of payersOf(shortlist.map(([, a]) => a))) {
    const key = payer.toLowerCase()
    const cached = state.payerApprovals[key]

    if (approvalIsFresh(cached)) {
      if (cached!.approved) approved.add(key)
      continue
    }

    if (lookups >= MAX_APPROVAL_LOOKUPS) {
      log.warn("approval lookup budget reached; remaining payers retry next pass", {
        budget: MAX_APPROVAL_LOOKUPS,
      })
      break
    }

    lookups += 1
    const ok = await cc.readContract({
      address: registryAddress,
      abi: attestationRegistryAbi,
      functionName: "approvedPayer",
      args: [payer as `0x${string}`],
    })
    state.payerApprovals[key] = { approved: Boolean(ok), checkedAt: new Date().toISOString() }
    if (ok) approved.add(key)
  }
  saveState(state)

  const eligible = relayable(shortlist, approved)
  if (eligible.length < shortlist.length) {
    log.warn("skipping anchors with no approved payer", {
      skipped: shortlist.length - eligible.length,
    })
  }

  const queue = eligible.slice(0, options.limit)
  if (queue.length === 0) {
    log.info("nothing relayable — approve a payer on the registry first")
    return
  }

  const ccProvider = new ethers.JsonRpcProvider(c.creditcoinRpcUrl, undefined, { staticNetwork: true })
  const info = new chainInfo.PrecompileChainInfoProvider(ccProvider)
  const builder = new proofProvider.service.ProofBuilder(c.sourceChainKey, c.proofBuilderUrl)

  let signer: ethers.Signer | null = null
  if (options.submit) {
    signer = await loadSigner(ccProvider)
    log.info("relayer", { address: await signer.getAddress() })
  } else {
    log.warn("dry run — calldata will be written to disk, nothing is broadcast")
  }

  log.step("attesting", { pending: queue.length, chainKey: c.sourceChainKey })

  for (const [txHash, anchor] of queue) {
    // Retry bookkeeping belongs to real attempts. A dry run that counted itself
    // would inflate the backoff a later genuine failure is given.
    if (options.submit) {
      anchor.attempts += 1
      anchor.lastAttemptAt = new Date().toISOString()
    }

    try {
      await attestOne(txHash, anchor, { cc, info, builder, signer, registryAddress, approved })
      if (options.submit) {
        anchor.error = undefined
        anchor.nextAttemptAt = undefined
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      anchor.error = reason

      if (options.submit) {
        anchor.status = "failed"
        anchor.nextAttemptAt = new Date(Date.now() + backoffMs(anchor.attempts)).toISOString()
      }

      log.error("attestation failed", {
        tx: short(txHash),
        attempt: anchor.attempts,
        retryAfter: anchor.nextAttemptAt ?? "not deferred (dry run)",
        reason,
      })
    }
    saveState(state)
  }

  const counts = pendingAnchors(state).length
  log.info("attest pass complete", { stillPending: counts })
}

interface Deps {
  cc: ReturnType<typeof creditcoinClient>
  info: InstanceType<typeof chainInfo.PrecompileChainInfoProvider>
  builder: InstanceType<typeof proofProvider.service.ProofBuilder>
  signer: ethers.Signer | null
  registryAddress: `0x${string}`
  approved: ReadonlySet<string>
}

async function attestOne(txHash: string, anchor: AnchorTx, deps: Deps): Promise<void> {
  const c = config()

  if (await allExpectedAccepted(deps, anchor)) {
    anchor.status = "accepted"
    log.info("already accepted on Creditcoin", { tx: short(txHash) })
    return
  }

  const unapproved = anchor.commitments
    .map((c) => c.payer)
    .filter((p) => !deps.approved.has(p.toLowerCase()))
  if (unapproved.length > 0) {
    log.warn("some payers are not approved and will be skipped on-chain", {
      payers: [...new Set(unapproved)].join(","),
    })
  }

  const target = anchor.blockNumber + LOOKAHEAD

  log.step("waiting for attestation", { tx: short(txHash), source: anchor.blockNumber, target })

  const latest = await deps.info.getLatestAttestedHeightAndHash(c.sourceChainKey)
  log.info("latest attested height", { height: latest.height, exists: latest.exists })

  // Both, and in this order: the precompile is what execute() consults on-chain,
  // and the prover service is what getProof reads. Either alone can be ahead.
  await deps.info.waitUntilHeightAttested(c.sourceChainKey, target, POLL_MS, WAIT_MS)
  await deps.builder.waitUntilHeightAttested(c.sourceChainKey, target, POLL_MS, WAIT_MS)

  const result = await deps.builder.getProof(txHash)
  if (!result.success || !result.data) {
    throw new Error(`proof generation failed: ${result.error ?? "no data returned"}`)
  }

  const proof = result.data
  assertProofMatches(proof, txHash, anchor.blockNumber, c.sourceChainKey)

  const iface = new ethers.Interface([EXECUTE_SIGNATURE])
  const calldata = iface.encodeFunctionData("execute", [
    0,
    proof.chainKey,
    proof.headerNumber,
    proof.txBytes,
    proof.merkleProof.root,
    proof.merkleProof.siblings.map((s) => [s.hash, s.isLeft]),
    proof.continuityProof.lowerEndpointDigest,
    proof.continuityProof.roots,
  ])

  if (!deps.signer) {
    mkdirSync(c.outDir, { recursive: true })
    const path = resolve(c.outDir, `attest-${txHash}.json`)
    writeFileSync(
      path,
      `${JSON.stringify({ to: deps.registryAddress, sourceTx: txHash, sourceBlock: anchor.blockNumber, calldata }, null, 2)}\n`,
    )
    log.info("calldata written", { file: path, bytes: (calldata.length - 2) / 2 })
    return
  }

  const contract = new ethers.Contract(deps.registryAddress, [EXECUTE_SIGNATURE], deps.signer)

  const tx = await contract.getFunction("execute")(
    0,
    proof.chainKey,
    proof.headerNumber,
    proof.txBytes,
    proof.merkleProof.root,
    proof.merkleProof.siblings.map((s) => [s.hash, s.isLeft]),
    proof.continuityProof.lowerEndpointDigest,
    proof.continuityProof.roots,
  )

  anchor.status = "submitted"
  anchor.creditcoinTx = tx.hash
  log.info("submitted", { tx: short(txHash), creditcoinTx: short(tx.hash) })

  const receipt = await tx.wait()
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Creditcoin transaction reverted: ${tx.hash}`)
  }

  // The registry, not the receipt, decides what was accepted. A prover that
  // returned a proof for a different transaction can still mine successfully
  // here, and marking this one accepted would strand it forever.
  if (!(await allExpectedAccepted(deps, anchor))) {
    throw new Error(
      `Creditcoin transaction ${tx.hash} succeeded but not every expected commitment is ` +
        `recorded for its payer. The query may have been consumed by a different receipt; ` +
        `inspect before retrying.`,
    )
  }

  anchor.status = "accepted"
  log.info("accepted", {
    tx: short(txHash),
    creditcoinTx: short(tx.hash),
    gasUsed: receipt.gasUsed?.toString() ?? "?",
  })
}

/// Whether every commitment whose payer is approved is recorded on-chain.
/// Commitments from unapproved payers are excluded: the registry will never
/// accept them, so requiring them would make this permanently false.
async function allExpectedAccepted(deps: Deps, anchor: AnchorTx): Promise<boolean> {
  const expected = anchor.commitments.filter((c) => deps.approved.has(c.payer.toLowerCase()))
  if (expected.length === 0) return false

  const confirmed: string[] = []
  for (const { payer, commitment } of expected) {
    const accepted = await deps.cc.readContract({
      address: deps.registryAddress,
      abi: attestationRegistryAbi,
      functionName: "acceptedByPayer",
      args: [commitment, payer],
    })
    if (!accepted) return false
    confirmed.push(pairKey(payer, commitment))
  }

  // Recorded so downstream consumers report what the registry actually accepted
  // rather than everything the transaction happened to contain.
  anchor.acceptedPairs = confirmed
  return true
}

/// The proof is served by a remote service. Nothing downstream re-derives these
/// fields, so a mismatch would submit a valid proof for the wrong transaction.
function assertProofMatches(
  proof: { chainKey: number; headerNumber: number; txHash: string },
  txHash: string,
  sourceBlock: number,
  chainKey: number,
): void {
  if (proof.txHash.toLowerCase() !== txHash.toLowerCase()) {
    throw new Error(`prover returned a proof for ${proof.txHash}, expected ${txHash}`)
  }
  if (proof.chainKey !== chainKey) {
    throw new Error(`prover returned chainKey ${proof.chainKey}, expected ${chainKey}`)
  }
  if (proof.headerNumber !== sourceBlock) {
    throw new Error(`prover returned header ${proof.headerNumber}, expected source block ${sourceBlock}`)
  }
}

/// A registry pointed at another chain key or another anchor accepts nothing.
/// Cheaper to find out here than after a fifteen-minute attestation wait.
async function assertRegistryMatchesConfig(
  cc: ReturnType<typeof creditcoinClient>,
  registry: `0x${string}`,
): Promise<void> {
  const c = config()

  const [chainKey, trustedAnchor] = await Promise.all([
    cc.readContract({ address: registry, abi: attestationRegistryAbi, functionName: "SOURCE_CHAIN_KEY" }),
    cc.readContract({ address: registry, abi: attestationRegistryAbi, functionName: "TRUSTED_ANCHOR" }),
  ])

  if (Number(chainKey) !== c.sourceChainKey) {
    throw new Error(
      `registry SOURCE_CHAIN_KEY is ${chainKey} but the worker is configured for ${c.sourceChainKey}`,
    )
  }
  if (trustedAnchor.toLowerCase() !== c.payerAnchor.toLowerCase()) {
    throw new Error(
      `registry TRUSTED_ANCHOR is ${trustedAnchor} but PAYER_ANCHOR_ADDRESS is ${c.payerAnchor}`,
    )
  }
}
