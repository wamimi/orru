# Orru — contracts

Foundry workspace. Solidity for both chains lives here.

## Bootstrap

`lib/forge-std` is committed, so a fresh clone needs one command:

```bash
cd contracts && npm install && forge build
```

`npm install` brings in OpenZeppelin and `@gluwa/usc-contracts`, both of which
are Solidity source dependencies resolved through `libs = ["lib", "node_modules"]`.

If you ever re-add a Foundry dependency, use `forge install --no-git`. Without
that flag Forge adds a git submodule to the parent Next.js repo.

## Layout

| Path | Chain | Contents |
|---|---|---|
| `src/ethereum/` | Ethereum Sepolia, Base Sepolia | `PayerAnchor`, `DemoPayroll` — where real payments happen |
| `src/creditcoin/` | Creditcoin testnet (102031) | `AttestationRegistry`, `NullifierRegistry`, `CredentialRegistry`, `DemoCreditPool`, `mUSDC`, `ISettlementAdapter` |
| `src/attestcoin/` | Creditcoin testnet | `USCBase`, `VerifierInterface` — precompile plumbing, ported from the 19 Aug 2026 smoke test |
| `src/verifier/` | Creditcoin testnet | Barretenberg-generated `HonkVerifier` + `ZKTranscriptLib` |

Note there are two `src/` directories in this repo. Repo-root `src/` is Next.js.
This one is Solidity. Check `pwd`.

## Config is load-bearing

`solc 0.8.27`, `optimizer_runs = 1`, `bytecode_hash = "none"`, `via_ir = false`.
Every one of those was required to get the generated verifier deployed. See the
comments in `foundry.toml` before changing any of them.

## Deployment

Deploy scripts are run by a human with an encrypted keystore
(`--account cc3-deployer`), never by an agent and never with a raw private key.
Put `--broadcast` BEFORE `--constructor-args` — Forge's variadic parsing
swallows flags that come after it and silently stays in dry-run.
