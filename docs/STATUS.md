# Orru · product status as of 6 September 2026

**For:** the team, and anyone who has to say what is done
**Against:** the twelve MVP MUSTs from the original project description (the same M1–M12 list as the contracts status)
**From:** the app — Next.js, the live Creditcoin reads and writes, the screens a judge will actually open
**Companion:** `docs/FRONTEND-INTEGRATION.md` is the contract of record. This file is where we are against that contract, tonight.

The contracts write-up from this morning is still right about the chain. It is stale about the app. The signature is no longer the missing piece. A statement has been issued from the product flow. What is left is the last demo beat, honest proving, and a short list of leaks that would fail a judge.

---

## What's blocking Orru

Every contract is deployed and running. The consumer spine is built and has been walked once with a real wallet. Money has still not moved, and a judge still cannot type a short human id into a phone and land on a live statement.

The morning block was **M5**: nobody could call `issue()` without an EIP-712 signature only the frontend can collect. That path exists now. The evening block is **M11 plus demo honesty**:

- the pool will pay against a valid credential, and we have a disburse API, but there is no lender beat that shows money moving
- issue still consumes a **fixture proof** generated on Nelly's machine, not a proof built in the browser
- those fixtures go stale when the payroll window moves — the next Issue can fail with `CommitmentNotAttestedToPayer` even though the wallet and the signature are fine
- the profile and marketing card still show a hard-coded `orru:cred:8f41c2a7`. That is not a credential. The real id is `0x` plus 64 hex. Opening `/verify/orru:cred:8f41c2a7` is the unknown state.

Say this in one sentence: everything up to and including a human signing and a statement landing on Creditcoin has been built; the remaining risk is the last beat of the demo, proving that still lives on a laptop, and copy that still looks like a mock.

```
9   requirements done, or close enough to demo
2   partial (M7 confirm on-chain · M9 no policy builder)
1   still open (M11 money-moved beat)
```

---

## The dependency

These are still a chain. The first link is no longer the one that is missing.

```
M1–M4, M6     payroll → anchor → Attestcoin → payer registry → ZK verifier
                    all live. Do not rebuild.

        ↓
M5      subject signs EIP-712 IssueAuthorization
        built. Proven once from /credential with the attested wallet.

        ↓
M7      CredentialRegistry.issue
        the path is live. At least one local Issue succeeded this evening.
        Confirm the count on Blockscout before saying "credentials exist"
        in a judging room. A second Issue on the same window is supposed
        to fail with CredentialExists.

        ↓
M10     /verify/[id]   built. Anyone, no wallet, three states + disclosure.

        ↓
M8      connect → review → profile → issue → consent
        built. Proving is the hole inside the spine: fixture, not WASM.

        ↓
M9      /report/[id]   built as the scoped-down lender page.
        No policy builder. That was already cut once in the integration spec.

        ↓
M11     DemoCreditPool.disburse
        API exists. UI does not. Liquidity is sitting there. This is the
        beat at 1:30 in the demo. It cannot fire until someone disbursed
        against the live credential id and a screen shows it.
```

M12 (evidence rows) is not on this chain. It is rendering. It is done.

---

## All twelve requirements

Where each one stands against the original MVP MUST. Status words:

- **Done** — both halves exist, or the half that was ours exists and has been used
- **Partial** — the MUST can be shown, with a named hole
- **Open** — the MUST cannot be shown yet

### M1 — Payroll pays on a schedule

**Done.** Contracts.

Live on Sepolia. Demo Payroll keeps settling. The worker cron is what makes periods appear in the snapshot. We do not call the payroll from the app. We must never prompt the user's wallet onto Sepolia.

### M2 — Payments anchored on Ethereum

**Done.** Contracts.

`PayerAnchor` is live and immutable. It is the trust root. The app never talks to it. FIND (Etherscan / Alchemy) is convenience only. If a credit decision ever depends on a FIND result that was not Attestcoin-verified, the trusted middleman is back.

### M3 — Attestcoin verification on Creditcoin

**Done.** Contracts + worker.

Commitments are authenticated through the native query precompile and accepted on-chain. By the time a user connects, verification has already happened. "Checking your income" reads a snapshot. It does not produce an attestation.

Source chain key for Sepolia on Creditcoin is **1**, not `11155111`. That appearing in a source-chain field is a bug.

### M4 — Payer registry

**Done.** Contracts.

Two approved payers: Demo Payroll (transparent, on-chain amounts) and Semuni (off-chain pay, commitment only). The app must never merge two payers into one band. `0xBb605cf7…` has both. The picker on `/review` and `/profile` is the product of that rule, not decoration.

### M5 — Wallet ownership signature

**Done.** This morning: contract half only. Tonight: both halves.

The user signs twice, and they are different calls:

1. `personal_sign` at connect — session, wallet control, free
2. EIP-712 `IssueAuthorization` on `/credential` — authorizes this specific proof, free

Conflating them fails with `InvalidSubjectAuthorization` and looks like a wallet bug.

`publicInputsHash` is `keccak256(concat(publicInputs))` — eight 32-byte words, no `encodeAbiParameters`, no offset, no length prefix. That encoding is in `src/lib/issue.ts`. Wrong once and a day disappears.

The UI half is `CredentialScreen` → `GET /api/credential/prepare` → Privy `signTypedData` → `POST /api/credential/issue` through the relayer. Relayer address: `0x1BEBB5EF8D85Bd2f92e94410615c52A2655bC217`. The private key lives in `.env.local` / Vercel only. Never in git, never in chat.

### M6 — Zero-knowledge income proof

**Partial, on our side. Done on hers.**

Circuit and verifier are deployed. Real proofs have verified on-chain. Browser proving (`bb.js` in a Web Worker) exists on the circuits branch and is **not wired into this app**.

What the user issues against today is a JSON fixture from `fixtures/`, generated on Nelly's machine at `2026-09-06T19:58:28+00:00`. The only issuable bundle for the wallet we hold is `proof-f6A48D18-payroll-band4.json` — periods 18–20, band 4.

That is honest for a demo if we say it. It is not the architecture. A server-side prover that sees amounts would make the central claim false. Do not "fix" staleness by installing Noir on the Next server.

When the attested window moves, the same file still verifies as a proof and `issue()` rejects it with `CommitmentNotAttestedToPayer`. That is staleness, not a signing bug. Ask Nelly to regenerate. One command on her side.

### M7 — Credential issued and revocable

**Partial.** Path live. Count must be read from the chain, not from memory.

This morning the registry had zero credentials because `issue()` refused every call without M5. M5 has been collected. At least one Issue from `/credential` succeeded this evening against Demo Payroll / band 4 / the attested wallet `0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C`.

A second Issue on the same window must fail. That is `CredentialExists`, and the copy is *"You already have a statement for these pay cycles."* If the UI shows the generic *"Something went wrong. Please try again."* instead, the revert is being swallowed in the client `catch`, not missing from `src/lib/errors.ts`. That is a one-line leak, not a missing feature.

Revocation is on the contract. There is no revoke screen. We do not need one for the MVP if `/verify/[id]` already renders **revoked** as a different page, which it does.

The real credential id is `bytes32`: `0x` + 64 hex. `/verify/<that>` is the public page. `orru:cred:8f41c2a7` is a leftover mock in `CredentialCard` / `demoCredential`. It has never been issued.

### M8 — Consumer flow, end to end

**Done as a spine. Partial as a proving story.**

This is the product. The screens exist and are wired to live data, in this order:

| Step | Route | What it actually does |
|---|---|---|
| Connect | `/connect` | Privy, Creditcoin only (`102031`). One `personal_sign`. |
| Review | `/review` | Reads `fixtures/income-snapshot.json` (then `worker/out/`). Multi-payer picker. Continue gated on `provableWindow`. Expandable evidence per period (M12). |
| Profile | `/profile` | Band only. Never an amount. We do not have the amount on this side. |
| Statement | `/credential` | Shared vs withheld. Prepare → EIP-712 → relayer `issue`. |
| Consent | `/consent` | Explicit action before share. `POST /api/share/[requestId]/consent`. |

Production `/` is still the waitlist. The in-progress marketing site is `/preview`. The product starts at `/connect`. Do not put the waitlist in front of a judge and call it the app.

Banned copy is enforced by `npm run check-copy`. The rule from the spec still holds: they see *payout account*, *statement*, *verified employer*, *checking your income*. They never see contract, gas, proof, circuit, attestation, ZK, commitment, nullifier, hash.

Do not say "your income stays private." Say "exact pay never goes into your statement — only a range."

Empty states that exist: no recognised payer (self-payment), not enough periods, snapshot miss, issue revert. Walk them before judging day.

### M9 — Business flow

**Partial.** Already scoped down once. The scoped-down shape is what shipped.

The original MUST was a lender product. The integration spec cut it to an API plus one read-only page so the 20-second lender beat at 1:30 still exists. That page is `/report/[id]` plus `GET /api/report/[id]`.

It renders pass/fail, reason codes, band, and evidence links. It does **not** include a policy builder, request inbox, or lender auth. There is no `/api/policy`. If someone says M9 is "not started," they are reading this morning's contracts status.

What a judge should open: `/report/<live-credential-id>` after Issue, not a JSON blob.

### M10 — Public verification page

**Done.**

`/verify/[id]` is a server-rendered page. No login, no wallet, works in a fresh window. Two reads:

```
statusOf(credentialId)     → 0 unknown · 1 valid · 2 revoked
credentialOf(credentialId) → subject, band, periods, issuedAt, evidenceEndHeight
```

Render on **status**, never on whether a struct came back. A revoked credential still returns a full record. Showing that as valid is a negative test we would fail live.

Three states look different: valid, revoked (unmistakable, not a badge tweak), unknown. The page carries the required disclosure:

> This does not prove future income, affordability, legal credit eligibility, or guaranteed repayment.

`GET /api/verify/[id]` is the same data as JSON. The page is the demo surface.

### M11 — Funds actually move

**Open.** This is the remaining MUST that cannot be shown.

`DemoCreditPool` holds 1,000,000 mUSDC. `POST /api/credit/disburse` can call `disburse(bytes32 credentialId, uint256 amount)` through the relayer. There is no screen, no payoff confirmation, no "money moved" beat.

Until someone disbursed against the live credential id and a judge can see a receipt — pool balance down, worker wallet up, or a Creditcoin explorer link — M11 is not done. Do not demo a JSON 200 and call it credit.

USDC / mUSDC is **6 decimals**. 100 is `100000000`. This is still the likely bug.

### M12 — Evidence labels per period

**Done.**

Each verified period on `/review` is an expandable row: period, payer, source chain, Sepolia incoming tx, Creditcoin verification tx, attested vs still found. The snapshot already carried the fields. This is the difference between a judge believing the claim and seeing it.

---

## What the original description also required, that is not an M-number

These sat in the project description and in `AGENTS.md`. They are not extra polish. They are the reason the twelve MUSTs are worth anything.

| Invariant | Status | If you break it |
|---|---|---|
| FIND vs PROVE | Held. Income API reads the snapshot, not Sepolia `getLogs` as truth. | Creditcoin takes someone's word. |
| TRUSTED-SOURCE | Held on-chain. App must not invent a third payer. | Attacker deploys a lookalike event. |
| SAME-COMMITMENT | Held. `shared/commitment.ts` is the only encoding. | Everything compiles and nothing verifies. |
| Payer identity is `topics[1]`, never `from` | Held in the worker. App must not "fix" it. | Relayer / 7702 income attributed to the gas payer. |
| User wallet only touches Creditcoin 102031 | Held in Privy `defaultChain` / `supportedChains`. | A Sepolia prompt in the demo is a fail. |
| Relayer pays gas | Held. User only signs. | "Approve" appears and the pitch is ordinary DeFi. |
| Bands from `shared/bands.ts`, 10 multiplicative | Held. | Frontend band ≠ circuit band. |
| Attestcoin reads Ethereum only | Held. No Base / Polygon / Solana as a source. | Out of spec. |
| Writability is not live | Held. No Inbox dependency. | We ship a lie about v2. |

---

## The work remaining

What each open item actually needs. None of this is a new product.

### 1. The money-moved beat — M11 — do this next

Needs the live `credentialId` from the successful Issue (the `0x…` bytes32, not `orru:cred:…`). Then:

- call `POST /api/credit/disburse` against that id, or a one-screen lender action that does
- show the result: amount, explorer link, pool still funded
- walk `/verify/[id]` and `/report/[id]` on the same id so the three public surfaces agree

Blocked on: a funded relayer on the environment you are demoing from, and a credential that is still `valid`.

### 2. Stop the mock id from appearing in a judging room

`sampleCredential.id` is `orru:cred:8f41c2a7`. It still renders on `/profile` whenever the session has no income (QA / empty), and on `/credential` before Issue. A dual display — short alias plus full hex — is fine as a **display layer** with a lookup written at issue time. The contract stays `bytes32`. Do not invent an on-chain alias.

Until that exists, the only id a judge should be handed is the hex from the Issue success callout, and the link `/verify/<hex>`.

### 3. Make `CredentialExists` visible

The mapping is already in `friendlyError`. The Issue client `catch` still collapses some failures to the generic line. A second Issue during rehearsal should read as a success of the invariant, not a broken button.

### 4. Browser proving — M6 hole inside M8

Wire `src/lib/prove` + `public/circuit/` from the circuits branch when she hands the artifacts. Budget 10–40 seconds and a staged wait. A server break-glass path may exist only if it is disclosed and chosen, never silent.

Until then, the honest line in a room is: *the statement was issued against a proof built over the attested window; the proving step is not yet running in this browser.*

### 5. Fixture freshness

When Issue says "still confirming your payments," the fixture is stale. Ask Nelly to regenerate `fixtures/`. Do not install nargo on Vercel to work around it.

### 6. Relayer and Vercel, so the demo is not localhost

- Relayer `0x1BEBB5EF…` must be funded with CTC on the environment that will be shown (local is already in `.env.local`; production Vercel must have the same key and RPC URLs).
- Add Nelly to the Vercel project so she can set RPC URLs, addresses, and `PAYER_NAMES` without a key ever crossing chat.
- Confirm Creditcoin is configured in the **frontend** Privy providers, not only in a dashboard Networks page.

---

## Verified against the product, not against memory

What is running in this repo tonight.

| Surface | State |
|---|---|
| Waitlist | `/` live on orru.xyz |
| Marketing preview | `/preview` |
| Consumer spine | `/connect` → `/review` → `/profile` → `/credential` → `/consent` |
| Public statement | `/verify/[id]` |
| Lender report | `/report/[id]` |
| Income | `GET /api/income/[address]` from snapshot |
| Issue | `GET /api/credential/prepare` + `POST /api/credential/issue` |
| Consent | `POST /api/share/[requestId]/consent` |
| Disburse | `POST /api/credit/disburse` — no UI |
| Snapshot | `fixtures/income-snapshot.json` generated 2026-09-06 19:58 UTC |
| Issuable proof we hold | `proof-f6A48D18-payroll-band4.json` · band 4 · periods 18–20 |
| Second wallet (hers) | `0xBb605cf7…` · Demo Payroll band 4 **and** Semuni band 6 · never merge |
| Creditcoin registry | `0xc4694C8db29C668Bebb2502664228156F11a8481` |
| Creditcoin pool | `0x1B906254Ceca488c301E7063d437c8B18da10e9e` |
| Relayer | `0x1BEBB5EF8D85Bd2f92e94410615c52A2655bC217` |

Test wallet the frontend can sign with: `0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C`. Snapshot also has an older payroll row for that address (`0x41C2f146…`, `not_yet_verified`). In the picker, keep **Demo Payroll**.

Two payers are still the pitch. Demo Payroll pays on-chain so the whole chain can be audited. Semuni pays off-chain and anchors 164 bytes. Both produce an identical kind of statement. The app already refuses to add them together.

---

## If time runs short

Cut in this order. Same spirit as this morning, updated for what is already built.

1. **Policy builder** — already cut. `/report/[id]` is the MUST as scoped.
2. **Human alias for the credential id** — nice. The hex link is the product.
3. **Browser proving in this app** — say the fixture line out loud before you cut it from the architecture. Do not silently move proving to the server.
4. **Consumer polish** — the spine matters, the finish does not.

**Never cut these:**

- the signature (M5) — three requirements still sit on it
- the public page (M10) — cheapest credible proof a judge can open on their own phone
- the connect → review → issue spine (M8) — without it there is no product
- FIND vs PROVE — a working demo that trusts Etherscan is a different company
- band-only disclosure — an amount on `/profile` or `/verify` is a fail
- the money-moved beat (M11) if there is any time left — that is the last sentence of the pitch

---

## To agree

1. **Read the live credential id off Creditcoin** (Blockscout, registry `0xc4694C8d…`) and treat that hex as the only id we hand to anyone. Confirm whether we are at 1 issued or still 0 if the success was local-only.
2. **Disburse against that id** and add the smallest possible "paid" surface so M11 can be shown. This is the last MUST that is actually open.
3. **Add Nelly to Vercel.** She sets RPC and addresses. He already generated the relayer key; she funds the address. No private key over chat.
4. **Regenerate fixtures** the morning of the demo, or Issue will fail with a sentence about "still confirming your payments" and look like a product bug.
5. **Do not install a server prover** to save the morning. If the browser artifacts are not in this branch by then, say the fixture line and keep the claim.

Contracts, circuits, deployment and the off-chain worker: complete, as of this morning, and still complete.

App spine, public verify, report page, evidence rows, and the issue signature: complete, as of this evening.

Money moving in a room a judge can see: not yet.
