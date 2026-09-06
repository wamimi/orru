# Frontend ↔ contract integration

**For:** whoever is designing and building the Next.js app
**From:** contracts + circuits
**Status:** **everything is deployed and wired on both chains.** Sepolia payroll,
Attestcoin verification on Creditcoin, the ZK verifier, the credential registry
and the credit pool are all live, and the pipeline has been run end to end with
real payments. Every address and signature below is read from a live deployment,
not planned. Nothing here is waiting on me.

Two things are still open and both are listed in §9 — the issue/disburse tooling,
and everything on your side.

---

## 0. The four things to design around

Read this section even if you read nothing else.

**1. There are two chains, and the user's wallet only ever touches one of them.**
Payments happen on **Ethereum Sepolia**. Everything the user does — credentials,
proofs, funds moving — happens on **Creditcoin testnet (chain id 102031)**. The
frontend never asks the user to switch to Sepolia. If a wallet is on Sepolia when
they arrive, prompt a switch to Creditcoin once, early, and never again.

**2. Verification does not happen while the user waits.** This is the big one.
A background worker continuously watches payments, waits for them to be attested,
and submits them to Creditcoin — on a cron, independent of any user session. By
the time someone connects their wallet, their payments are *already verified*.

So the "Checking your income" screen is **reading a result, not producing one**.
It should take a couple of seconds, not ten minutes. Design it as a confident
reveal with a short animation, not an indefinite progress bar. The only genuinely
slow step in a user session is proof generation (see §5).

**3. The user never pays gas and never sees a wallet transaction prompt** —
except for the one signature in step 2 of the consumer flow, which is free. Every
write goes through our relayer. If your design has the user approving a
transaction, something has gone wrong; come and ask me.

**4. The vocabulary rule is absolute.** These words never appear anywhere a user
can see them:

> contract · deploy · gas · approve · proof · circuit · attestation ·
> zero-knowledge · commitment · nullifier · hash

They see: *payout account*, *your income*, *your limit*, *verified employer*,
*checking your income*, *share*, *statement*. This applies to error messages and
loading states too, which is where it usually leaks.

---

## 1. Live addresses

All deployed and wired. Fourteen post-deployment checks pass, including that the
credential registry points at the right attestation registry and verifier, that
the pool is funded, and that the verifier really links its library.

**Creditcoin testnet — chain id 102031**

| Contract | Address |
|---|---|
| `CredentialRegistry` | `0xc4694C8db29C668Bebb2502664228156F11a8481` |
| `AttestationRegistry` | `0x47172643d148300d2649C475d68a5bD49267e60C` |
| `DemoCreditPool` | `0x1B906254Ceca488c301E7063d437c8B18da10e9e` |
| `mUSDC` (settlement) | `0xD3a8Fd44b63890d518d15e3efECfA11a71276B3d` |
| `IncomeVerifier` | `0x9c9C73aC2de017A47aF61b742147ee3f22a5e593` |
| `NullifierRegistry` | `0x8750311a947B6DC775C053904b106B57028fFE1D` |

**Ethereum Sepolia — chain id 11155111** (the frontend never calls these)

| Contract | Address |
|---|---|
| `PayerAnchor` | `0x16EaB9DA91D2AEea1F1138A95E42C37d1D47B7d2` |
| `DemoPayroll` | `0xD3a8Fd44b63890d518d15e3efECfA11a71276B3d` |
| `dUSD` (payment token) | `0xc4694C8db29C668Bebb2502664228156F11a8481` |

> **Two addresses appear on both lists and are unrelated contracts.**
> `0xD3a8Fd44…` is the payroll on Sepolia and mUSDC on Creditcoin;
> `0xc4694C8d…` is dUSD on Sepolia and the credential registry on Creditcoin.
> Same deployer, same nonce, two chains — `CREATE` addresses are
> `hash(sender, nonce)`, so they collide. **Always key your address book by
> chain id.** Reading the wrong one gets you a contract that answers some calls
> and reverts others, which is a horrible afternoon.

Canonical source is `contracts/deployments/<chainid>.json`. Read from there in
build tooling rather than pasting, so a redeploy is one file change.

### Network config you'll need

```ts
export const creditcoinTestnet = {
  id: 102031,
  name: 'Creditcoin Testnet',
  nativeCurrency: { name: 'Creditcoin', symbol: 'CTC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.cc3-testnet.creditcoin.network'] } },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://creditcoin-testnet.blockscout.com' },
  },
} as const
```

Explorer links: `https://creditcoin-testnet.blockscout.com/tx/{hash}`. Sepolia
links (for evidence panels): `https://sepolia.etherscan.io/tx/{hash}`.

**Six decimals, not eighteen.** Both tokens. Anything you format from a raw
amount divides by `1e6`. This is the single most likely numeric bug in the app.

### Paste-ready address book

```ts
// src/lib/chain.ts
export const CREDITCOIN_ID = 102031 as const
export const SEPOLIA_ID = 11155111 as const

export const ADDRESSES = {
  [CREDITCOIN_ID]: {
    credentialRegistry:  '0xc4694C8db29C668Bebb2502664228156F11a8481',
    attestationRegistry: '0x47172643d148300d2649C475d68a5bD49267e60C',
    creditPool:          '0x1B906254Ceca488c301E7063d437c8B18da10e9e',
    settlementToken:     '0xD3a8Fd44b63890d518d15e3efECfA11a71276B3d', // mUSDC
    verifier:            '0x9c9C73aC2de017A47aF61b742147ee3f22a5e593',
  },
  [SEPOLIA_ID]: {
    payerAnchor:  '0x16EaB9DA91D2AEea1F1138A95E42C37d1D47B7d2',
    demoPayroll:  '0xD3a8Fd44b63890d518d15e3efECfA11a71276B3d',
    paymentToken: '0xc4694C8db29C668Bebb2502664228156F11a8481', // dUSD
  },
} as const
```

Keyed by chain id on purpose — see the collision warning above.

---

## 2. Consumer flow — screen by screen

### S1 · Landing

No chain interaction. Two entry points (consumer / business).

### S2 · Connect your income source

| | |
|---|---|
| **Action** | Connect wallet, then sign one message |
| **Call** | `personal_sign` (EIP-191) via wagmi `useSignMessage` |
| **Chain** | none — a signature is off-chain |
| **Gas** | none |
| **Latency** | instant |

The message text comes from our API so it can carry a nonce and a timestamp:

```
GET  /api/auth/challenge?address=0x...
     → { message: "Orru: prove you control this wallet\nNonce: ...\nIssued: ..." }

POST /api/auth/verify   { address, signature }
     → { ok: true, sessionToken }
```

This establishes **Fact 2** in the trust model — that this person controls the
address. Without it, anyone could borrow against a stranger's income, so it is not
optional and cannot be skipped for a demo.

**UI:** one button, "Connect the wallet you get paid into." Then a signature
prompt. Say *"Sign to prove this wallet is yours — this is free and moves no
money."* Users are conditioned to fear signature prompts; defuse it inline.

### S3 · Reviewing your income

| | |
|---|---|
| **Action** | Fetch the already-verified payment record |
| **Call** | `GET /api/income/:address` |
| **Chain** | none directly — served from the worker's snapshot |
| **Latency** | 1–3s |

> **Where this data comes from — I had this wrong in an earlier draft.**
> Creditcoin stores **commitments**, which are hashes. You cannot derive a band,
> an amount, a period number or an evidence link from a hash. Everything on this
> screen comes from the source chain, which the worker already collects.
>
> Run `npm run snapshot` in `worker/` and it writes `out/income-snapshot.json`:
> every recipient, their payer, period counts, attestation status, the provable
> window, the band, and evidence rows with both Sepolia and Creditcoin links.
> Serve `/api/income/:address` from that file. **Do not rebuild the scanner** —
> it would be a second source of truth for the one encoding that must never
> drift.
>
> The snapshot deliberately carries the **band and never an amount or salt**.
> Those are the circuit's private witness and stay in the worker.

The snapshot's per-recipient shape is close to the payload below; map it rather
than inventing fields.

```jsonc
{
  "verified": true,
  "payerName": "Orru Demo Payroll",       // resolved from the payer registry
  "payerAddress": "0x...",
  "payerTier": 1,                          // 1 = seeded, 2 = many-payees rule
  "periodsAttested": 12,                   // everything verified on Creditcoin
  "evidencePayer": "0x...",                // all periods must share one payer
  "provableWindow": {                      // the newest 3 CONSECUTIVE attested
    "from": 15, "to": 17, "consecutive": true
  },
  "incomeBand": { "id": 4, "label": "$2,500 – $4,000" },
  "evidence": [                            // one row per verified period — M12
    {
      "period": 4,
      "sourceChain": "Ethereum Sepolia",
      "sourceTx": "0x...",                 // Etherscan link
      "verifiedTx": "0x...",               // Blockscout link — the Attestcoin submission
      "verifiedAt": "2026-08-30T11:04:00Z"
    }
  ]
}
```

**Attested is not the same as provable.** The circuit needs **three consecutive**
periods, and a worker can easily have twelve attested with a gap in the middle.
`provableWindow` is the window a proof would actually be built over; if it is
`null`, issuance is blocked even though `periodsAttested` looks healthy. Render
the count from `periodsAttested` and gate the button on `provableWindow`.

**UI:** the three-line checklist animation from the spec. Each line resolves in
sequence — "Looking at your payment history ✓ 12 payments found", "Confirming who
paid you ✓ Verified employer", "Checking your income pattern ⟳". Since the data
is already there, pace the animation deliberately rather than tying it to actual
latency.

**Evidence labels (M12) matter for judging.** Each line should be expandable to
show which chain the fact came from and a link to the on-chain record. That is
where the trust model becomes visible.

**Empty / failure states you must design:**

- `verified: false, reason: "no_payments"` — no inbound payments found
- `reason: "payer_not_approved"` — payments exist, but the sender isn't a
  recognised payer. **This is the self-payment case** and it must read as a
  neutral explanation, not an accusation: *"We couldn't recognise who paid you.
  Orru only counts payments from employers, platforms and grant programmes."*
- `reason: "not_consecutive"` — payments exist and are verified, but no three of
  them run back to back. Real and worth designing: *"Your payments look
  irregular. Orru needs three pay cycles in a row."*
- `reason: "too_few_periods"` — fewer than 3 verified periods
- `reason: "not_yet_verified"` — payments found on Ethereum but not yet confirmed
  on Creditcoin. Transient, clears on its own within minutes. *"We're still
  confirming your most recent payments."*

### S4 · Your income profile

Renders the S3 payload. No new calls. Shows the **band**, never an exact amount —
we never have the exact amount on this side, and the pitch depends on that being
true.

### S5 · Credential preview → issue

This is where the proof is generated and the credential is issued.

| | |
|---|---|
| **Action** | Generate the proof **in the browser**, sign, then submit via relayer |
| **Call** | bb.js in a Web Worker → `POST /api/credential/issue` |
| **Chain** | Creditcoin (relayer sends it) |
| **Gas** | paid by relayer |
| **Latency** | 10–40s proving, then ~15s for the transaction |

```
POST /api/credential/issue
     { sessionToken, proof, publicInputs, evidencePayer, documentHash,
       deadline, subjectAuthorization }
     → { credentialId, txHash, status: "issued" }
```

**The user signs twice.** Once at S2 to prove wallet control, and once here to
authorize issuance. The second is an EIP-712 typed-data signature over the proof,
the public inputs, the payer, the document hash, a nonce and a deadline — without
it anyone could issue a credential for someone else's address.

Build it with `signTypedData`. **The exact domain, types and message are in
§8c** — copy them from there rather than retyping, particularly
`publicInputsHash`, which is `keccak256(concat(publicInputs))` and not
`encodeAbiParameters`. Smart accounts work via ERC-1271.

**UI:** treat it as part of the same "issuing your credential" step, not a
separate screen. Say *"Sign to issue your credential — this is free."*

**This is the only genuinely slow step in the app, and it has to stay in the
browser.** That is what keeps the amounts on the user's machine — §9a.1. Budget
10–40 seconds and design a real progress experience: staged messages, not a
spinner. Never say "generating proof"; say "Checking your income pattern."

Warm the Web Worker early — during S3, while the user is reading their income —
so the WASM and SRS download is already done by the time they press the button.
That is most of the perceived latency and it is free to hide.

**The credential ID is deterministic**: `keccak256(CLAIM_DOMAIN, subject, C0, C1,
C2)`, derivable before you submit via `claimKeyFor(publicInputs, subject)`. You
can render the verification link optimistically and reconcile when the
transaction lands.

### S6 · Consent

| | |
|---|---|
| **Action** | Confirm what gets shared, with whom |
| **Call** | `POST /api/share/:requestId/consent` |
| **Latency** | instant |

**Nothing is shared before this.** Negative test #10 covers exactly this. Show
the requesting institution, the exact fields they'll receive (band, period count,
pass/fail — never amounts), and require an explicit action.

### S8 · Agreement upload (optional, cold-start)

Currently a hash-and-record soft signal that raises a starting limit. Design it as
a secondary path, clearly optional, never blocking the main flow.

---

## 3. Business flow

### B1 · Policy builder

`POST /api/policy` — pure API, no chain.

```jsonc
{
  "minPeriods": 3,
  "minBand": 2,
  "requireConsecutive": true,
  "requirePayerTier": 1
}
```

### B2 · Requests

`POST /api/request` → returns a shareable verification link. `GET /api/requests`
lists them with status: `pending` · `consented` · `passed` · `failed`.

### B3 · Verification report

`GET /api/report/:requestId`

```jsonc
{
  "result": "pass",                        // pass | fail | review
  "reasonCodes": [                         // S5 — required, drives the UI
    { "code": "PERIODS_OK",   "detail": "6 consecutive periods verified" },
    { "code": "BAND_OK",      "detail": "Income band meets the $2,000 minimum" },
    { "code": "PAYER_TIER_1", "detail": "Payer is on the verified employer list" }
  ],
  "evidence": [ /* same shape as S3 */ ],
  "creditcoinTxs": ["0x..."]
}
```

Reason codes must be renderable individually — a lender should see *why*, not
just pass/fail. Design them as a list of chips or rows, with failure codes
visually distinct.

### B4 · Credit decision, funds move

| | |
|---|---|
| **Action** | Approve → mock funds actually transfer on Creditcoin |
| **Call** | `POST /api/credit/disburse` → `DemoCreditPool.disburse(credentialId, amount)` |
| **Chain** | Creditcoin |
| **Latency** | ~15s |

Returns a `txHash`. **Show the Blockscout link prominently** — this is the demo's
final beat, where "approved" becomes "money arrived." Design it as the payoff
moment, not a toast notification.

Read the headroom from `remainingFor(credentialId)` rather than computing it from
the band. The cap is **per subject, not per credential**: overlapping windows such
as periods 5-7 and 6-7-8 are different credentials describing the same income, so
a second one adds no headroom. A credential in a higher band releases only the
difference. Funds always go to the credential's subject, never to the caller.

---

## 4. Public verifier — `/verify/[id]`

**No login. No wallet. Works in a fresh incognito window.** This is the most
demoable surface we have and it must be a plain server-rendered page.

`GET /api/verify/:credentialId` — mostly a direct `CredentialRegistry` read; the
date fields are resolved by the API from the stored source block height:

```jsonc
{
  "credentialId": "0x...",
  "status": "valid",                       // valid | revoked | unknown
  "issuedAt": "2026-08-30T09:00:00Z",
  "revokedAt": null,
  "subjectAddress": "0x...",
  "walletBindingProven": true,
  "incomeBand": { "id": 4, "label": "$2,500 – $4,000" },
  "periodsProven": 3,
  // derived by the API from evidenceEndHeight; the registry stores the height
  "verificationPeriod": { "from": "2026-08-27", "to": "2026-09-08" },
  "attestcoinVerifiedFacts": ["payments_occurred", "payer_identity"],
  "documentHash": "0x...",
  "evidenceEndHeight": 11626539,           // Ethereum block of the newest payment
  "evidenceEndDate": "2026-09-04T09:12:00Z", // resolved from that block
  "issuanceTx": "0x...",
  "revocationTx": null
}
```

Three states to design: **valid**, **revoked** (S4 demos this live on stage — it
must look unmistakably different, not a subtle badge change), and **unknown id**.

**Credentials never expire**, so there is no fourth state. They attest a dated
past window, which stays true. Show `evidenceEndDate` prominently — a consumer
decides for themselves whether evidence that old is fresh enough, and the
business API returns the date so a lender's policy can apply a maximum age.

**The page must include a "what this does not prove" section.** Non-negotiable —
it's a disclosure item and judges will look for it. Verbatim content:

> This does not prove future income, affordability, legal credit eligibility, or
> guaranteed repayment.

Design it as a real part of the page, not fine print.

---

## 5. Timing budget

Measured on the live deployment, not estimated.

| Step | Time | Blocking? |
|---|---|---|
| Wallet connect + signature | instant | yes |
| Income lookup (S3) | 1–3s | yes |
| **Browser proof generation** | **10–40s** (plus a one-time ~30MB WASM/SRS fetch) | **yes** |
| Creditcoin transaction | ~15s | yes |
| Attestcoin verification | 20–30s per batch once attested | **no — background, before the session** |
| Source block becoming attested | minutes | **no — background** |

Two seconds is what the circuit takes **natively**, in the worker. That number is
not available to the app, because proving in the browser is what keeps the
amounts on the user's machine — see §9a.1. In-browser bb.js on a cold cache is
10–40 seconds, and that is the number to design for.

Browser proving is still the only genuinely slow step. Everything else can use
ordinary loading states.

---

## 6. What the frontend must never do

- **Never call `DemoPayroll` or `PayerAnchor` from the browser.** Those are the
  payer's contracts, driven by a cron. Nothing user-facing touches them.
- **Never display an exact income amount.** We don't have it, and the entire
  privacy claim depends on that staying true. Bands only.
- **Never ask the user to switch to Sepolia.** Reads from Sepolia go through our
  API.
- **Never ask the user to send a transaction.** Relayer handles all writes.
- **Never share anything before S6 consent.**
- **Never render a credential as valid without checking `status`** — a revoked
  credential rendering as valid is negative test #8 and would be caught on stage.

---

## 7. Answered — these are now fixed

**1. Credential ID format: `bytes32`**, displayed shortened (`0x17ae…bfb5`). The
public verification page accepts the full hex.

**2. Income bands: ten, in `shared/bands.ts`.** Compiled into the Noir circuit,
so treat them as frozen once the verifier is generated.

Spaced multiplicatively, not linearly, because income is roughly log-normal.
Linear bands are wrong at both ends: a single `$0–1,000` treats $50 and $999
identically, and a `$5,000+` treats $5,000 and $100,000 identically. What is held
constant is **relative width, 50–67% per band** — that is how much the band
narrows a lender's uncertainty.

| id | Range | id | Range |
|---|---|---|---|
| 0 | $0 – $500 | 5 | $4,000 – $6,000 |
| 1 | $500 – $1,000 | 6 | $6,000 – $10,000 |
| 2 | $1,000 – $1,500 | 7 | $10,000 – $15,000 |
| 3 | $1,500 – $2,500 | 8 | $15,000 – $25,000 |
| 4 | $2,500 – $4,000 | 9 | $25,000+ |

Import `BANDS` and `bandFor()` — don't hardcode boundaries or labels.

The three demo workers land in **bands 4, 5 and 1**, so the screens have real
variety to render.

**Worth knowing when you write the copy:** the band is the *public* part of the
credential. Narrower bands are more useful to a lender and less private to the
worker. Never present a band as if it were an exact figure.

**3. Business side is API-only. No dashboard, no wallet connection.**
Authentication is an API key. `POST /api/policy`, `POST /api/request`,
`GET /api/report/:requestId` as specified in §3 — but nothing renders them.

> ⚠️ **This drops M9**, a MUST in the MVP, and the 20-second lender beat at 1:30
> in the demo script. An API returning JSON demos as a terminal window, and two
> of the five judging pillars are product vision and technical alignment.
>
> **Agreed middle path: build API-only, but add one read-only page** at
> `/report/[id]` that renders `GET /api/report/:requestId`. No policy builder, no
> auth UI, no wallet. Roughly an hour, and it restores the whole beat — pass/fail,
> reason codes, evidence rows, Creditcoin transaction links.

**4. Evidence labels: inline per period, expandable.** Each row in the §3
`evidence` array renders as a line with a chain name and a link, collapsed by
default.

---

## 7b. One thing that changed underneath you

**The payment token is no longer Circle's testnet USDC.** It is now `DemoUSDC`
(`dUSD`), six decimals, deployed by us on Sepolia.

Why: Circle's faucet gives ~10 USDC per claim, so every worker necessarily
landed in band 0 and the product's whole point — distinguishing bands — could
not be demonstrated. Minting our own removes that limit. The transfers are still
real ERC-20 transfers in real Sepolia blocks, and Attestcoin proves them
identically; it never inspects which token moved.

For you this changes almost nothing — the frontend never reads the token
directly — but two things matter:

- **Still six decimals.** Divide by `1e6`, same as before.
- **One period is one pay cycle**, and the salary is the monthly figure
  directly. There is no scale factor to apply anywhere. Four-hour periods are a
  time compression so history accrues inside the hackathon window; that is
  disclosed, and the amounts themselves are not manipulated.

## 8. Contract reference

Everything below is read from the live deployment. Three contracts matter to the
app; the rest are internal.

### 8a · viem ABI fragments

```ts
// src/lib/abi.ts
import { parseAbi } from 'viem'

export const credentialRegistryAbi = parseAbi([
  // reads — the public verifier page uses only these
  'function statusOf(bytes32 credentialId) view returns (uint8)',
  'function credentialOf(bytes32 credentialId) view returns ((address subject,address evidencePayer,uint8 band,uint8 periodsProven,uint64 issuedAt,uint64 evidenceEndHeight,uint64 revokedAt,bytes32 documentHash))',
  'function nonces(address subject) view returns (uint256)',
  'function domainSeparator() view returns (bytes32)',
  'function claimKeyFor(bytes32[] publicInputs, address subject) view returns (bytes32)',
  'function PERIODS() view returns (uint256)',
  'function PUBLIC_INPUTS() view returns (uint256)',
  // writes — relayer only, never the user
  'function issue((bytes proof,bytes32[] publicInputs,address evidencePayer,bytes32 documentHash,uint256 deadline,bytes subjectAuthorization) req) returns (bytes32)',
  'function revoke(bytes32 credentialId)',
  // events
  'event CredentialIssued(bytes32 indexed credentialId, address indexed subject, address indexed evidencePayer, uint8 band, uint64 evidenceEndHeight, bytes32 documentHash)',
  'event CredentialRevoked(bytes32 indexed credentialId, address indexed revokedBy)',
])

export const creditPoolAbi = parseAbi([
  'function remainingFor(bytes32 credentialId) view returns (uint256)',
  'function drawnBySubject(address subject) view returns (uint256)',
  'function limitForBand(uint8 band) pure returns (uint256)',
  'function minimumEvidenceHeight() view returns (uint64)',
  'function disburse(bytes32 credentialId, uint256 amount)',
  'event Disbursed(bytes32 indexed credentialId, address indexed subject, uint256 amount, uint256 remaining)',
])

export const attestationRegistryAbi = parseAbi([
  'function acceptedByPayer(bytes32 commitment, address payer) view returns (bool)',
  'function provenAtHeight(bytes32 commitment, address payer) view returns (uint64)',
  'function approvedPayer(address payer) view returns (bool)',
  'event CommitmentAccepted(bytes32 indexed commitment, address indexed payer, bytes32 indexed queryId, uint64 blockHeight)',
])
```

### 8b · `statusOf` returns a uint8, not a string

```ts
export const CREDENTIAL_STATUS = ['unknown', 'valid', 'revoked'] as const
```

`0` unknown · `1` valid · `2` revoked. **Render on `statusOf`, never on the
presence of a record** — `credentialOf` returns a populated struct for a revoked
credential too. A revoked credential rendering as valid is negative test #8.

### 8c · The EIP-712 signature for issuance

This is the only typed-data signature in the app. The user signs it; the relayer
submits it.

```ts
const domain = {
  name: 'Orru',
  version: '1',
  chainId: 102031,
  verifyingContract: ADDRESSES[CREDITCOIN_ID].credentialRegistry,
} as const

const types = {
  Issue: [
    { name: 'proofHash',        type: 'bytes32' },
    { name: 'publicInputsHash', type: 'bytes32' },
    { name: 'evidencePayer',    type: 'address' },
    { name: 'documentHash',     type: 'bytes32' },
    { name: 'nonce',            type: 'uint256' },
    { name: 'deadline',         type: 'uint256' },
  ],
} as const

const message = {
  proofHash:        keccak256(proof),                        // bytes
  publicInputsHash: keccak256(concat(publicInputs)),         // NOT encodeAbiParameters
  evidencePayer,
  documentHash,                                              // 0x00..00 if none
  nonce:    await registry.read.nonces([subject]),
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
}
```

**`publicInputsHash` is `keccak256(abi.encodePacked(publicInputs))`** — the eight
32-byte words concatenated, *not* ABI-encoded with an offset and length. In viem
that is `keccak256(concat(publicInputs))`. Getting this wrong produces a
signature that fails with `InvalidSubjectAuthorization` and looks like a wallet
problem. It is the most likely integration bug in this document.

The nonce increments on every successful issuance, so read it fresh each time.
Smart accounts work unchanged via ERC-1271.

### 8d · Errors, and what to say when you catch them

Every revert is a custom error. Decode with the ABI and map to copy that obeys
the vocabulary rule in §0.

| Error | What actually happened | Suggested copy |
|---|---|---|
| `CommitmentNotAttestedToPayer` | evidence isn't verified on Creditcoin yet | "We're still confirming your payments. Try again in a few minutes." |
| `InvalidSubjectAuthorization` | signature wrong, or signed by the wrong wallet | "That signature didn't match this wallet." |
| `AuthorizationExpired` | deadline passed | "That took too long — let's try again." |
| `CredentialExists` | same evidence already issued | "You already have a statement for this period." |
| `InvalidProof` | proof failed verification | "Something went wrong checking your income." |
| `WrongPublicInputCount` | wrong number of public inputs | never user-facing — a bug, log it |
| `CredentialNotValid` | revoked or unknown at disburse | "This statement is no longer active." |
| `ExceedsLimit(requested, remaining)` | asked for more than the headroom | "The most available right now is {remaining}." |
| `EvidenceTooOld(given, minimum)` | evidence below the pool's freshness floor | "This statement is based on older payments." |
| `InsufficientLiquidity` | the pool is dry | "We can't complete this right now." — and alert us |

The verifier itself **reverts rather than returning false** on a bad proof, so a
tampered proof surfaces as `SumcheckFailed`, not `InvalidProof`. Treat any
unrecognised revert from `issue` as a verification failure.

---

## 9. What I need from you

Contracts, circuits, deployment and the off-chain worker are done. Everything
still open is on the app side, so this is the list that decides whether we ship.

### 9a · Three decisions I need before I can help further

**1. Browser proving — this one is not really a choice.** The proving pipeline
works (`worker/src/prove.ts`, ~2s natively), and I can expose it as a server
route. **Do not build the product on that.**

Proving server-side means the private witness — the actual amounts — is sent to
our server. That is the exact disclosure the zero-knowledge proof exists to
prevent. It would work, it would be fast, and it would make the central claim
false: the first judge who asks "so who sees the salary?" gets the answer "their
server does," and the pitch is over.

So: **bb.js in a Web Worker, in the browser.** I'll export the circuit artifacts
and a worker entry point. Budget 10–40 seconds for a ~58,000-gate circuit plus a
one-time WASM and SRS download, and design the staged waiting experience for it.

A server route may still exist as an explicitly **disclosed** break-glass path if
the browser fails — shown to the user, chosen by the user, never silent. See §9f
for the honest limits of what we currently keep private.

**2. Who runs the relayer, and where?** `issue` and `disburse` are permissionless
but somebody pays gas on Creditcoin. If your API routes send them, you need a
funded Creditcoin key in the Next.js environment — send me the address and I'll
fund it. If you'd rather not hold a key, say so and I'll put a small relayer
service behind an endpoint you call.

**3. Which API routes are yours?** This document specifies about a dozen. I've
assumed you own all of `src/app/api/**` since you own `src/`. If you'd rather I
write the chain-touching ones — `/api/income/:address`, `/api/verify/:id`,
`/api/credential/issue`, `/api/credit/disburse` — say so today and I'll do them;
they're the four that need contract knowledge.

### 9b · What I need handed back

- **A Creditcoin address** for the relayer, so I can fund it with CTC.
- **Confirmation you've read §0 and §8c.** The two-signature model and the
  `publicInputsHash` encoding are the two things that will silently cost a day
  each if they're wrong.
- **A rough order** you'll build the screens in, so I can prioritise the API
  routes you hit first rather than guessing.

### 9c · Already done — please don't rebuild these

- **The off-chain worker.** Watching Sepolia, waiting for attestation, submitting
  proofs to Creditcoin — all built, tested and running (`worker/`). This was
  originally on your list; it isn't any more.
- **Proof generation.** `npm run prove` in `worker/` produces a verified proof
  bundle as JSON: subject, band, periods, commitments, proof, publicInputs.
- **Everything on-chain.** Deployed, wired, and exercised end to end.

### 9d · What only you can build

In the order I'd do them:

1. **`/verify/[id]`** — the public page. Highest demo value per hour, needs no
   wallet, no auth, and only two contract reads. Build this first; it's the
   screen most likely to be opened by a judge on their own phone.
2. **S2 → S5 consumer flow** — connect, review, issue. The main narrative.
3. **`/report/[id]`** — the read-only lender page from §7.3. About an hour, and
   it restores the M9 beat.
4. **S6 consent** — small, but it's negative test #10 and it's checked.
5. **S8 agreement upload** — optional, only if the rest is done.

### 9e · Test data that exists right now

Two payers, five verified income records, four different bands — so the screens
have real variety and the two-payer story in §9f is demonstrable:

| Worker | Payer | Band | Range | Key held by |
|---|---|---|---|---|
| `0xf6A48D18…0b66C` | Demo Payroll | 4 | $2,500 – $4,000 | **you** |
| `0xBb605cf7…Dae75A` | Demo Payroll | 4 | $2,500 – $4,000 | Nelly |
| `0xBb605cf7…Dae75A` | **Semuni** | 6 | $6,000 – $10,000 | Nelly |
| `0xe058c205…cE3B34` | Demo Payroll | 5 | $4,000 – $6,000 | unassigned |
| `0x722533cA…134f27` | Demo Payroll | 1 | $500 – $1,000 | unassigned |

Note the third row: **one wallet with two verified incomes from two payers**, in
different bands. That is a real case to design for — the income screen has to
pick a payer, and a credential is always scoped to one. Never merge periods
across payers; period numbers are payer-local and the contracts reject it.

**Build against `0xf6A48D18…` — that is your own wallet.** It has an attested,
provable window (periods 2–4, band 4) on Creditcoin right now, which means you
can run the *entire* flow today, signature and all, up to and including a
successful `issue`. Nothing is stubbed.

A ready proof bundle for it is at
`worker/out/proof-0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C-2.json`, in exactly
the `ProofBundle` shape §10c expects. Drop it straight into the issue flow: read
the nonce, build the typed data, sign with your wallet, post to the relayer. That
is the whole of §10c working end to end without waiting on browser proving.

The two unassigned addresses are demo workers whose keys nobody holds. They can
produce proofs, and they are useful for rendering variety on the income and
verification screens, but they can never sign an issuance — so don't wire a
signing flow to them.

### 9f · What we actually keep private — read this before writing any copy

Be precise here, because overclaiming is worse than the limitation.

**What the credential discloses:** the subject address, the payer address, a
band, a period count, and the source block height of the newest payment. **Never
an amount.** A lender reading it on Creditcoin learns the band and nothing
sharper. That property is real and enforced by the circuit.

**What is public anyway, today:** the salary, three separate ways, none of which
involve the commitment at all.

1. `DemoPayroll.amountOf(address)` is a **public mapping**. One `eth_call`
   returns any worker's exact pay.
2. `PaymentMade` emits `amount` in the clear.
3. The ERC-20 `Transfer` log carries the amount in its data, as every ERC-20
   transfer does.

The salt is also deterministic — `keccak256(abi.encode(payroll, recipient,
period))` — so the commitment is **binding, not hiding**. But that is not why the
salary is public. It is public because an on-chain payroll pays on-chain. No
commitment scheme can conceal a transfer that anyone can watch.

**So do not describe the commitment as protecting anything.** It binds a payment
to a value that Attestcoin can authenticate. That is its job, and it does it.

**This is still exactly why proving stays in the browser.** The public payroll is
a property of *this demo payer* — a real deployment attests payments that were
not themselves public, and then the salt genuinely matters and the amount is
genuinely secret. A server that proves on the user's behalf is a leak in the
*architecture*, which no change of payer would ever undo. One is a demo choosing
a transparent payer for demonstrability; the other would be the design being
wrong.

If you find yourself writing "your income stays private," change it to something
you can defend: *"Your exact pay never goes into your statement — only a range."*

### The two payers, side by side

There are now two payers on the live deployment, and the difference between them
**is** the pitch. Use this comparison; it is the answer to the question a judge is
most likely to ask.

**Semuni** pays contractors by bank transfer and anchors only a commitment. Here
is the entire on-chain record of three months of salary:

```
tx     0xfd96eaf394b69a08fb6a0a080af3de3a034be57cc6cb66deb2b4222c89df1cbf
from   0x0531203274075Ff79A07000BBDa2B0272C647d01   (Semuni)
to     0x16EaB9DA91D2AEea1F1138A95E42C37d1D47B7d2   (PayerAnchor)
value  0 wei
input  164 bytes

3 logs, all PaymentAnchored(payer, commitment):
  0x4324ad13f3fb1babcce363dfa125d40841ae21c665488213a7b4f34f1f6b255d
  0x7928367c26fea7a964cb58e43e822aad97162c4be227072cd56ad23aaa61670f
  0xe8bd1d0502da34112ea376503b75173b9b9fd2958534de181f7e5454ed518783
```

The salary is `7500000000` base units. Searched as hex and as decimal, it appears
**nowhere** in that transaction or its receipt. The salt is random and held only
by the payer and the recipient, so the commitment cannot be inverted either. And
`0xBb605cf7…` still holds a verified band-6 credential — $6,000–$10,000, three
consecutive periods.

**Orru Demo Payroll** pays on-chain, so:

```
cast call <payroll> "amountOf(address)" 0xBb605cf7…   →  2500000000
```

One call. No proof, no brute force, no cleverness.

| | Demo Payroll | Semuni |
|---|---|---|
| Payment rail | on-chain ERC-20 | off-chain bank transfer |
| On-chain footprint | amount, salt, transfer, public `amountOf` | one hash per period |
| Salt | deterministic, derivable | random, secret |
| Can anyone read the salary? | **yes, one `eth_call`** | **no** |
| Credential produced | band 4, 3 periods | band 6, 3 periods |
| Verifies identically? | yes | yes |

Same pipeline, same circuit, same registry, indistinguishable credentials.

**How to say it:** the payroll is transparent *on purpose* — it is a payer we
control so anyone can audit every step from payment to credential. Semuni is how
it works in production: Orru proves income the payer never published. Do not
present the payroll as a limitation being excused; present it as the auditable
half of a deliberate pair.

---

## 10. Implementation guide

Working code for the three chain-touching surfaces. Written to be followed
directly — the addresses, ABIs and field names are all from the live deployment.

### 10a · Setup

```bash
npm i viem wagmi @tanstack/react-query
```

```ts
// src/lib/clients.ts
import { createPublicClient, defineChain, http } from 'viem'

export const creditcoin = defineChain({
  id: 102031,
  name: 'Creditcoin Testnet',
  nativeCurrency: { name: 'Creditcoin', symbol: 'CTC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.cc3-testnet.creditcoin.network'] } },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://creditcoin-testnet.blockscout.com' },
  },
  testnet: true,
})

export const creditcoinClient = createPublicClient({
  chain: creditcoin,
  transport: http(),
})
```

Use `ADDRESSES` from §1 and the ABIs from §8a.

### 10b · `/verify/[id]` — build this first

Two reads, no wallet, no auth. Server component; nothing here runs on the client.

```tsx
// src/app/verify/[id]/page.tsx
import { creditcoinClient } from '@/lib/clients'
import { credentialRegistryAbi } from '@/lib/abi'
import { ADDRESSES, CREDITCOIN_ID } from '@/lib/chain'
import { BANDS } from '@/../shared/bands'

const STATUS = ['unknown', 'valid', 'revoked'] as const

export default async function VerifyPage({ params }: { params: { id: string } }) {
  const address = ADDRESSES[CREDITCOIN_ID].credentialRegistry
  const id = params.id as `0x${string}`

  const [statusCode, credential] = await Promise.all([
    creditcoinClient.readContract({
      address, abi: credentialRegistryAbi, functionName: 'statusOf', args: [id],
    }),
    creditcoinClient.readContract({
      address, abi: credentialRegistryAbi, functionName: 'credentialOf', args: [id],
    }),
  ])

  const status = STATUS[Number(statusCode)] ?? 'unknown'
  if (status === 'unknown') return <UnknownStatement />

  const band = BANDS[credential.band]

  return (
    <Statement
      status={status}                                   // drives valid vs revoked
      band={band}                                       // NEVER an amount
      periods={credential.periodsProven}
      issuedAt={new Date(Number(credential.issuedAt) * 1000)}
      revokedAt={credential.revokedAt === 0n ? null : new Date(Number(credential.revokedAt) * 1000)}
      evidenceEndHeight={credential.evidenceEndHeight}  // resolve to a date via Sepolia
    />
  )
}
```

**Render on `status`, never on whether `credentialOf` returned data** — it returns
a populated struct for revoked credentials too. That is negative test #8.

`evidenceEndHeight` is a Sepolia block number. Resolve it to a date server-side
with `getBlock({ blockNumber })` against a Sepolia RPC and cache it; it never
changes for a given credential.

### 10c · The issue flow, end to end

Three steps: get a proof, sign it, hand it to the relayer.

```ts
// src/lib/issue.ts
import { keccak256, concat, type Hex } from 'viem'
import { creditcoinClient } from './clients'
import { credentialRegistryAbi } from './abi'
import { ADDRESSES, CREDITCOIN_ID } from './chain'

export interface ProofBundle {
  subject: `0x${string}`
  evidencePayer: `0x${string}`
  band: number
  periods: string[]
  commitments: Hex[]
  proof: Hex
  publicInputs: Hex[]
}

export async function buildIssueTypedData(bundle: ProofBundle, documentHash: Hex = `0x${'00'.repeat(32)}`) {
  const verifyingContract = ADDRESSES[CREDITCOIN_ID].credentialRegistry

  const nonce = await creditcoinClient.readContract({
    address: verifyingContract,
    abi: credentialRegistryAbi,
    functionName: 'nonces',
    args: [bundle.subject],
  })

  return {
    domain: { name: 'Orru', version: '1', chainId: 102031, verifyingContract },
    types: {
      Issue: [
        { name: 'proofHash',        type: 'bytes32' },
        { name: 'publicInputsHash', type: 'bytes32' },
        { name: 'evidencePayer',    type: 'address' },
        { name: 'documentHash',     type: 'bytes32' },
        { name: 'nonce',            type: 'uint256' },
        { name: 'deadline',         type: 'uint256' },
      ],
    },
    primaryType: 'Issue' as const,
    message: {
      proofHash:        keccak256(bundle.proof),
      // abi.encodePacked of a bytes32[] is plain concatenation. NOT
      // encodeAbiParameters, which would add an offset and a length word.
      publicInputsHash: keccak256(concat(bundle.publicInputs)),
      evidencePayer:    bundle.evidencePayer,
      documentHash,
      nonce,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    },
  }
}
```

In the component:

```tsx
const { signTypedDataAsync } = useSignTypedData()

async function issue(bundle: ProofBundle) {
  const typed = await buildIssueTypedData(bundle)
  const signature = await signTypedDataAsync(typed)          // the user's 2nd signature

  const res = await fetch('/api/credential/issue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      proof: bundle.proof,
      publicInputs: bundle.publicInputs,
      evidencePayer: bundle.evidencePayer,
      documentHash: typed.message.documentHash,
      deadline: typed.message.deadline.toString(),
      subjectAuthorization: signature,
    }),
  })
  return res.json() as Promise<{ credentialId: Hex; txHash: Hex }>
}
```

And the relayer route, which is the only place a private key appears:

```ts
// src/app/api/credential/issue/route.ts
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { creditcoin } from '@/lib/clients'
import { credentialRegistryAbi } from '@/lib/abi'
import { ADDRESSES, CREDITCOIN_ID } from '@/lib/chain'

export async function POST(req: Request) {
  const body = await req.json()

  const relayer = createWalletClient({
    account: privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as `0x${string}`),
    chain: creditcoin,
    transport: http(),
  })

  const txHash = await relayer.writeContract({
    address: ADDRESSES[CREDITCOIN_ID].credentialRegistry,
    abi: credentialRegistryAbi,
    functionName: 'issue',
    args: [{
      proof: body.proof,
      publicInputs: body.publicInputs,
      evidencePayer: body.evidencePayer,
      documentHash: body.documentHash,
      deadline: BigInt(body.deadline),
      subjectAuthorization: body.subjectAuthorization,
    }],
  })

  // The id is deterministic — derive it rather than parsing the receipt.
  const credentialId = await creditcoinClient.readContract({
    address: ADDRESSES[CREDITCOIN_ID].credentialRegistry,
    abi: credentialRegistryAbi,
    functionName: 'claimKeyFor',
    args: [body.publicInputs, subjectFrom(body.publicInputs)],
  })

  return Response.json({ credentialId, txHash })
}

// publicInputs[0] is the subject, left-padded to 32 bytes.
const subjectFrom = (pub: `0x${string}`[]) => `0x${pub[0].slice(26)}` as `0x${string}`
```

### 10d · Disburse

```ts
const remaining = await creditcoinClient.readContract({
  address: ADDRESSES[CREDITCOIN_ID].creditPool,
  abi: creditPoolAbi,
  functionName: 'remainingFor',
  args: [credentialId],
})
```

Then `disburse(credentialId, amount)` from the same relayer. Funds always go to
the credential's subject, never to the caller, so there is no recipient argument
to get wrong.

**Read the headroom from `remainingFor`, never compute it from the band.** The
cap is per subject: two overlapping windows are two credentials describing one
income, and the second adds no headroom.

### 10e · Decoding errors into copy

```ts
import { decodeErrorResult, BaseError, ContractFunctionRevertedError } from 'viem'

export function friendlyError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk(e => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      switch (revert.data?.errorName) {
        case 'CommitmentNotAttestedToPayer':
          return "We're still confirming your payments. Try again in a few minutes."
        case 'InvalidSubjectAuthorization':
          return "That signature didn't match this wallet."
        case 'AuthorizationExpired':
          return "That took too long — let's try again."
        case 'CredentialExists':
          return 'You already have a statement for these pay cycles.'
        case 'ExceedsLimit':
          return `The most available right now is ${format(revert.data.args?.[1])}.`
        case 'CredentialNotValid':
          return 'This statement is no longer active.'
      }
    }
  }
  return 'Something went wrong. Please try again.'
}
```

The full error list is in §8d. Anything unrecognised from `issue` — including
`SumcheckFailed` from the verifier — is a verification failure, not a bug in the
wallet.

### 10f · Serving the income snapshot

`worker/out/income-snapshot.json` is the source for S3 and S4. Shape:

```jsonc
{
  "generatedAt": "2026-09-06T12:56:04.000Z",
  "payers": { "0x0531…": { "name": "Semuni" } },
  "recipients": [
    {
      "address": "0xBb605cf7…",
      "verified": true,
      "payerAddress": "0x0531…",
      "payerName": "Semuni",
      "periodsPaid": 3,
      "periodsAttested": 3,
      "provableWindow": { "from": 1, "to": 3 },
      "incomeBand": { "id": 6, "label": "$6,000 - $10,000" },
      "evidence": [
        { "period": 1, "sourceChain": "Ethereum Sepolia", "sourceTx": "0x…",
          "sourceBlock": 11646662, "verifiedTx": "0x…", "attested": true }
      ]
    }
  ]
}
```

```ts
// src/app/api/income/[address]/route.ts
import snapshot from '@/../worker/out/income-snapshot.json'

export async function GET(_: Request, { params }: { params: { address: string } }) {
  const rows = snapshot.recipients.filter(
    r => r.address.toLowerCase() === params.address.toLowerCase(),
  )
  if (rows.length === 0) {
    return Response.json({ verified: false, reason: 'no_payments' }, { status: 404 })
  }
  // One wallet can have income from several payers. A credential is scoped to
  // one payer, so return them all and let the user choose.
  return Response.json({ address: params.address, incomes: rows })
}
```

Regenerate with `npm run snapshot` in `worker/` after any scan or attest — or use
`npm run run`, which scans, attests and writes the snapshot in one pass.

`verified: false` rows carry a `reason`: `no_payments`, `not_yet_verified`,
`too_few_periods` or `not_consecutive`. All four are designed states in §2.

### 10g · Getting a proof into the browser

This is the piece I still owe you. To prove in-browser you need three artifacts
from the circuit:

- `income_proof.json` — the compiled ACIR
- `vk` — the verification key
- the Barretenberg SRS, fetched once and cached

Say the word and I'll commit them under `public/circuit/` with a
`src/lib/prove.worker.ts` that takes the same witness shape the worker uses
(`amounts`, `periods`, `salts`, `recipient`, `band`, `commitments`) and returns
`{ proof, publicInputs }` ready for §10c.

Until then, `worker/out/proof-*.json` files have exactly the `ProofBundle` shape
above and can be dropped into the flow as fixtures, so every screen can be built
and tested before browser proving lands.

---

## 11. Reference

- Product spec: `docs/SPEC.md` · Scope and screens: `docs/MVP.md`
- Chain constraints: `docs/ATTESTCOIN.md`
- Contract specs: `docs/contracts/`
- Deployed addresses: `contracts/deployments/<chainid>.json`
- Commitment encoding (shared with the circuit): `shared/commitment.ts` — **do not
  reimplement this anywhere, import it.** If the frontend and the circuit disagree
  about encoding by one byte, everything compiles and nothing ever verifies.
