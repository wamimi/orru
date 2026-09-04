import { readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { ethers } from "ethers"
import { ConfigError } from "./config.js"

/// Resolves a signer without ever putting a private key in the environment when
/// a keystore is available. Order: explicit keystore path, Foundry account name,
/// then a raw key as a last resort.
export async function loadSigner(provider: ethers.Provider): Promise<ethers.Wallet | ethers.HDNodeWallet> {
  const keystorePath = process.env.WORKER_KEYSTORE_PATH?.trim()
  const account = process.env.WORKER_ACCOUNT?.trim()
  const rawKey = process.env.WORKER_PRIVATE_KEY?.trim()

  if (keystorePath || account) {
    const path = keystorePath
      ? resolve(keystorePath)
      : resolve(homedir(), ".foundry/keystores", account as string)

    if (!existsSync(path)) {
      throw new ConfigError(`keystore not found at ${path}`)
    }

    const password = readPassword()
    const wallet = await ethers.Wallet.fromEncryptedJson(readFileSync(path, "utf8"), password)
    return wallet.connect(provider) as ethers.Wallet | ethers.HDNodeWallet
  }

  if (rawKey) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(rawKey)) {
      throw new ConfigError("WORKER_PRIVATE_KEY must be a 32-byte hex string with a 0x prefix")
    }
    return new ethers.Wallet(rawKey, provider)
  }

  throw new ConfigError(
    "no signer configured — set WORKER_ACCOUNT (a Foundry keystore name) with WORKER_PASSWORD_FILE, " +
      "or WORKER_KEYSTORE_PATH, or WORKER_PRIVATE_KEY",
  )
}

function readPassword(): string {
  const file = process.env.WORKER_PASSWORD_FILE?.trim()
  if (file) {
    const path = resolve(file)
    if (!existsSync(path)) throw new ConfigError(`WORKER_PASSWORD_FILE not found at ${path}`)
    // Trailing newlines are what a here-doc or `echo` leaves behind, and they
    // are not part of the password.
    return readFileSync(path, "utf8").replace(/\r?\n$/, "")
  }

  const inline = process.env.WORKER_PASSWORD
  if (inline !== undefined) return inline

  throw new ConfigError("set WORKER_PASSWORD_FILE (preferred) or WORKER_PASSWORD to unlock the keystore")
}
