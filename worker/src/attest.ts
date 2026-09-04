import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { ethers } from "ethers"
import { chainInfo, proofProvider } from "@gluwa/usc-sdk"
import { attestationRegistryAbi, EXECUTE_SIGNATURE } from "./abi.js"
import { creditcoinClient } from "./chains.js"
import { config, requireDeployed } from "./config.js"
import { log, short } from "./log.js"
import { loadState, pendingAnchors, saveState, type AnchorTx } from "./state.js"
import { loadSigner } from "./signer.js"

/// Attestation trails the source head, and a continuity proof needs a later
/// attested point than the block itself.
const LOOKAHEAD = Number(process.env.WORKER_ATTEST_LOOKAHEAD ?? 10)
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5_000)
const WAIT_MS = Number(process.env.WORKER_WAIT_MS ?? 1_200_000)

export interface AttestOptions {
  submit: boolean
  limit: number
}

export async function attest(options: AttestOptions): Promise<void> {
  const c = config()
  const registryAddress = requireDeployed("attestationRegistry", "ATTESTATION_REGISTRY_ADDRESS")

  const state = loadState()
  const queue = pendingAnchors(state).slice(0, options.limit)

  if (queue.length === 0) {
    log.info("no pending anchor transactions")
    return
  }

  const cc = creditcoinClient()
  await assertRegistryMatchesConfig(cc, registryAddress)

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
    try {
      await attestOne(txHash, anchor, { cc, info, builder, signer, registryAddress })
    } catch (error) {
      anchor.status = "failed"
      anchor.attempts += 1
      anchor.lastAttemptAt = new Date().toISOString()
      anchor.error = error instanceof Error ? error.message : String(error)
      log.error("attestation failed", { tx: short(txHash), reason: anchor.error })
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
}

async function attestOne(txHash: string, anchor: AnchorTx, deps: Deps): Promise<void> {
  const c = config()

  if (await alreadyAccepted(deps.cc, deps.registryAddress, anchor)) {
    anchor.status = "accepted"
    log.info("already accepted on Creditcoin", { tx: short(txHash) })
    return
  }

  // execute() reverts with NoTrustedLogs when no log survives its filters, and
  // an unapproved payer is the filter that fails silently in the worker's view.
  const unapproved: string[] = []
  for (const { payer } of anchor.commitments) {
    const approved = await deps.cc.readContract({
      address: deps.registryAddress,
      abi: attestationRegistryAbi,
      functionName: "approvedPayer",
      args: [payer],
    })
    if (!approved) unapproved.push(payer)
  }
  if (unapproved.length === anchor.commitments.length) {
    throw new Error(
      `no approved payer in this transaction (${[...new Set(unapproved)].join(", ")}) — ` +
        `call setPayerApproval on the registry first`,
    )
  }
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
  anchor.attempts += 1
  anchor.lastAttemptAt = new Date().toISOString()

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

  anchor.status = "accepted"
  anchor.error = undefined
  log.info("accepted", {
    tx: short(txHash),
    creditcoinTx: short(tx.hash),
    gasUsed: receipt.gasUsed?.toString() ?? "?",
  })
}

async function alreadyAccepted(
  cc: ReturnType<typeof creditcoinClient>,
  registry: `0x${string}`,
  anchor: AnchorTx,
): Promise<boolean> {
  for (const { payer, commitment } of anchor.commitments) {
    const accepted = await cc.readContract({
      address: registry,
      abi: attestationRegistryAbi,
      functionName: "acceptedByPayer",
      args: [commitment, payer],
    })
    if (!accepted) return false
  }
  return anchor.commitments.length > 0
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
