import { attest } from "./attest.js"
import { config, ConfigError, LOADED_ENV_FILES } from "./config.js"
import { exportWitness } from "./export-witness.js"
import { log } from "./log.js"
import { prove } from "./prove.js"
import { scan, summarise } from "./scan.js"
import { anchorCommand, issueSlips } from "./slips.js"
import { writeSnapshot } from "./snapshot.js"
import { loadState } from "./state.js"

const USAGE = `orru worker

  scan                     read PaymentAnchored and PaymentMade from Sepolia
  attest [--submit]        relay pending anchors to Creditcoin through Attestcoin
                           (without --submit it writes calldata and broadcasts nothing)
  prove --recipient 0x..   build the income proof for one recipient
        --payer 0x..
        [--allow-unattested]
  status                   what is recorded and what is outstanding
  snapshot                 write out/income-snapshot.json for the web app
  slips --recipient 0x..   issue off-chain payment slips as a private payer, and
        --payer 0x..       print the command to anchor their commitments
        --amount N
        [--from-period N] [--count N] [--name "Acme Ltd"]
  export-witness           write fixtures/slips.json so the browser can rebuild
        [--private]        each proof bundle itself; --private prints the books
                           whose salts are secret, for ORRU_SLIP_BOOKS
  run [--submit]           scan then attest, once

Options
  --limit N                cap how many anchors one attest pass handles (default 10)

Configuration is read from contracts/.env then worker/.env, or from the file
named by ORRU_ENV_FILE.
`

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function requiredOption(name: string): string {
  const value = option(name)
  if (!value || value.startsWith("--")) throw new ConfigError(`--${name} is required`)
  return value
}

async function status(): Promise<void> {
  const c = config()
  const state = loadState()
  const counts = summarise(state)

  log.step("configuration")
  log.info("env files", { files: LOADED_ENV_FILES.join(", ") || "none" })
  log.info("source chain key", { key: c.sourceChainKey })
  log.info("payer anchor", { address: c.payerAnchor })
  log.info("demo payrolls", { addresses: c.demoPayrolls.join(", ") || "not set" })
  log.info("attestation registry", { address: c.attestationRegistry ?? "NOT DEPLOYED" })
  log.info("credential registry", { address: c.credentialRegistry ?? "NOT DEPLOYED" })

  log.step("recorded state")
  log.info("scan cursor", { block: state.lastScannedBlock })
  log.info("anchor transactions", counts)
  log.info("payments", { count: state.payments.length })

  const byRecipient = new Map<string, number>()
  for (const p of state.payments) {
    byRecipient.set(p.recipient, (byRecipient.get(p.recipient) ?? 0) + 1)
  }
  for (const [recipient, count] of byRecipient) {
    log.info("recipient", { address: recipient, periods: count })
  }
}

async function main(): Promise<void> {
  const command = process.argv[2]

  const rawLimit = option("limit")
  const limit = rawLimit === undefined ? 10 : Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ConfigError(`--limit must be an integer >= 1, got ${rawLimit}`)
  }

  switch (command) {
    case "scan":
      await scan()
      break
    case "attest":
      await attest({ submit: flag("submit"), limit })
      break
    case "prove":
      await prove({
        recipient: requiredOption("recipient"),
        payer: requiredOption("payer"),
        allowUnattested: flag("allow-unattested"),
      })
      break
    case "status":
      await status()
      break
    case "snapshot":
      writeSnapshot()
      break
    case "slips": {
      const amount = BigInt(requiredOption("amount"))
      const book = issueSlips({
        payer: requiredOption("payer"),
        recipient: requiredOption("recipient"),
        amount,
        fromPeriod: Number(option("from-period") ?? 1),
        count: Number(option("count") ?? 3),
        payerName: option("name") ?? "Private payer",
      })
      process.stdout.write(`\nAnchor them with:\n\n${anchorCommand(book)}\n\n`)
      break
    }
    case "export-witness":
      exportWitness(flag("private"))
      break
    case "run":
      await scan()
      await attest({ submit: flag("submit"), limit })
      writeSnapshot()
      break
    default:
      process.stdout.write(USAGE)
      process.exit(command ? 1 : 0)
  }
}

main().catch((error) => {
  if (error instanceof ConfigError) {
    log.error(`configuration: ${error.message}`)
  } else {
    log.error(error instanceof Error ? error.message : String(error))
    if (process.env.WORKER_DEBUG && error instanceof Error) console.error(error.stack)
  }
  process.exit(1)
})
