/// <reference lib="webworker" />
import { Noir } from "@noir-lang/noir_js"
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js"
import { toNoirInputs } from "./witness"
import { PUBLIC_INPUTS, type ProveInput, type ProveResult } from "./types"

type Request =
  | { id: number; warm: true; circuitUrl?: string }
  | { id: number; input: ProveInput; circuitUrl?: string }
type Response =
  | { id: number; ok: true; result: ProveResult }
  | { id: number; ok: true; warmed: true }
  | { id: number; ok: false; error: string }
  | { id: number; progress: "loading" | "witness" | "proving" }

const DEFAULT_CIRCUIT = "/circuit/income_proof.json"

let circuitPromise: Promise<{ bytecode: string; abi: unknown }> | null = null
let apiPromise: Promise<Barretenberg> | null = null

function loadCircuit(url: string) {
  circuitPromise ??= fetch(url).then((r) => {
    if (!r.ok) throw new Error(`circuit fetch failed: ${r.status}`)
    return r.json()
  })
  return circuitPromise
}

// Held open rather than created per proof: starting it fetches the WASM and the
// reference string, which is most of the wall clock. Terminating the worker
// releases it.
function api() {
  apiPromise ??= Barretenberg.new({
    threads: self.crossOriginIsolated ? (navigator.hardwareConcurrency ?? 4) : 1,
  })
  return apiPromise
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, circuitUrl = DEFAULT_CIRCUIT } = event.data
  const post = (m: Response) => self.postMessage(m)

  try {
    if ("warm" in event.data) {
      await Promise.all([loadCircuit(circuitUrl), api()])
      post({ id, ok: true, warmed: true })
      return
    }

    post({ id, progress: "loading" })
    const circuit = await loadCircuit(circuitUrl)

    post({ id, progress: "witness" })
    const noir = new Noir(circuit as never)
    const { witness } = await noir.execute(toNoirInputs(event.data.input) as never)

    post({ id, progress: "proving" })
    // 'evm' is the keccak transcript with ZK — the same setting the verification
    // key and the deployed Solidity verifier were generated with. Any other
    // target produces a proof that fails on-chain for no visible reason.
    const backend = new UltraHonkBackend(circuit.bytecode, await api())
    const { proof, publicInputs } = await backend.generateProof(witness, {
      verifierTarget: "evm",
    })

    if (publicInputs.length !== PUBLIC_INPUTS) {
      throw new Error(`expected ${PUBLIC_INPUTS} public inputs, got ${publicInputs.length}`)
    }

    post({
      id,
      ok: true,
      result: {
        proof: `0x${Array.from(proof, (b) => b.toString(16).padStart(2, "0")).join("")}`,
        publicInputs: publicInputs as `0x${string}`[],
      },
    })
  } catch (error) {
    post({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
