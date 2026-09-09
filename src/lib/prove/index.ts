import type { ProveInput, ProveProgress, ProveResult } from "./types"

export * from "./types"
export { splitLimbs, toNoirInputs } from "./witness"

/**
 * Generates the income proof in a Web Worker.
 *
 * Proving stays on the user's machine on purpose. The witness — the actual
 * amounts and the salts — is what the proof exists to keep private, so it must
 * never be sent anywhere. A server-side prover would work and would be faster,
 * and it would make the product's central claim false.
 *
 * Measured at ~2s in Node with 8 threads; expect 3-15s in a browser, most of it
 * the one-time WASM and SRS fetch. Warm it with `prepareProver()` during an
 * earlier screen and the perceived cost mostly disappears.
 */
export class Prover {
  private worker: Worker | null = null
  private nextId = 1

  private ensure(): Worker {
    this.worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
    return this.worker
  }

  /**
   * Fetches the circuit and starts the prover before either is needed. Most of
   * the wait is this, not the proving, so calling it a screen early hides it.
   */
  prepare(): void {
    const worker = this.ensure()
    worker.postMessage({ id: 0, warm: true })
  }

  prove(input: ProveInput, onProgress?: (p: ProveProgress) => void): Promise<ProveResult> {
    const worker = this.ensure()
    const id = this.nextId++

    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const data = event.data
        if (data.id !== id) return

        if ("progress" in data) {
          onProgress?.({ stage: data.progress })
          return
        }

        worker.removeEventListener("message", handler)
        if (data.ok) {
          onProgress?.({ stage: "done" })
          resolve(data.result)
        } else {
          reject(new Error(data.error))
        }
      }

      worker.addEventListener("message", handler)
      worker.postMessage({ id, input })
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
  }
}

/** Module-level instance, so the WASM is fetched once per page load. */
export const prover = new Prover()
