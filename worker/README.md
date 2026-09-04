# Orru worker

Carries payment commitments from Ethereum Sepolia to Creditcoin through
Attestcoin, then builds the income proof.

Nothing on Creditcoin knows a payment happened until this runs. The contracts
are complete and tested, but `AttestationRegistry` only ever learns about a
payment from a proof bundle that something submits — that something is here.

## The four stages

```
DemoPayroll.runPayroll()  on Sepolia
    emits PaymentMade(recipient, amount, period, salt, commitment)
    and    PaymentAnchored(payer, commitment)   via PayerAnchor
                    |
      (1) scan      |  Etherscan or eth_getLogs. Convenience only.
                    v
      (2) attest    |  wait for attestation, fetch the proof bundle,
                    |  submit execute(...) to AttestationRegistry
                    v
              Creditcoin: acceptedByPayer[commitment][payer] = true
                    |
      (3) prove     |  Noir witness -> nargo -> bb -> UltraHonk proof
                    v
      (4) issue     |  the SUBJECT signs EIP-712, then calls
                       CredentialRegistry.issue. Not done here.
```

Stage 4 is deliberately not automated. Issuing requires a signature from the
worker's owner, so it belongs to the frontend, not to an unattended relayer.

## Setup

```bash
npm install
cp .env.example .env   # most values already live in ../contracts/.env
```

## Commands

```bash
npm run status                    # configuration and what is outstanding
npm run scan                      # read Sepolia, record anchors and payments
npm run attest                    # dry run: writes calldata, broadcasts nothing
npm run attest -- --submit        # broadcasts to Creditcoin
npm run prove -- --recipient 0x.. --payer 0x..
```

`attest` without `--submit` writes `out/attest-<txhash>.json` and sends nothing.
That is the default on purpose.

## What the worker refuses to do

- **Trust the discovery layer.** Every commitment read from Etherscan or an RPC
  is recomputed locally with `shared/commitment.ts` and dropped if it disagrees.
  A mismatch aborts the scan rather than recording a payment the circuit could
  never prove.
- **Mix payers.** Period numbers are payer-local. Two payrolls paying the same
  worker produce two independent timelines, and a window is only ever built from
  one of them.
- **Build a window with a gap.** The circuit requires consecutive periods.
- **Prove across bands.** All three amounts must fall in one band.
- **Submit a proof it did not check.** The prover service is remote, so the
  returned bundle's transaction hash, chain key and header number are compared
  against what was scanned before anything is broadcast.
- **Issue a credential.** That needs the subject's signature.

## Configuration notes

`SOURCE_CHAIN_KEY` is an Attestcoin key, not an EVM chain id — Sepolia is `1`
and Ethereum mainnet is `3`. The worker rejects values that look like chain ids.

Discovery uses the Etherscan v2 log API when `ETHERSCAN_API_KEY` is set, because
free-tier JSON-RPC providers cap `eth_getLogs` at ten blocks, which turns a
30,000-block backfill into thousands of requests. Without a key the worker falls
back to `eth_getLogs` and shrinks its range until the provider accepts it.

For `attest --submit`, prefer an encrypted Foundry keystore (`WORKER_ACCOUNT`
plus `WORKER_PASSWORD_FILE`) over a plaintext key.

## State

`state/source-<chainKey>.json` holds the scan cursor, every anchor transaction
and its status, and the payment preimages. It is written atomically after each
checkpoint, so an interrupted scan resumes rather than restarting.

The file records which `PayerAnchor` it was built against and refuses to load
against a different one — a stale cursor would silently skip everything a new
anchor had emitted.

## Regenerating the contract test fixture

`contracts/test/fixtures/income-proof.json` is a real proof, used by
`contracts/test/verifier/RealProof.t.sol` to check the generated verifier
against something other than a mock. Regenerate it after any circuit change:

```bash
npm run prove -- --recipient 0x.. --payer 0x..
cp out/proof-0x..-<period>.json ../contracts/test/fixtures/income-proof.json
```
