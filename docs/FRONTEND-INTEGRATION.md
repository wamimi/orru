# Frontend ↔ contract integration

**For:** whoever is designing and building the Next.js app
**From:** contracts + circuits
**Status:** the Ethereum side is live; the Creditcoin side is specified here and
being built to match. Treat the signatures below as a commitment — if I have to
change one, I'll flag it before it lands.

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

## 1. Status — what you can build against today

| Contract | Chain | Status |
|---|---|---|
| `PayerAnchor` | Sepolia | **live** |
| `DemoPayroll` | Sepolia | **live**, cron running |
| `AttestationRegistry` | Creditcoin | specified, building |
| `IncomeVerifier` (+ `ZKTranscriptLib`) | Creditcoin | generated from the circuit, not yet deployed |
| `NullifierRegistry` | Creditcoin | specified, building |
| `CredentialRegistry` | Creditcoin | specified, building |
| `DemoCreditPool` + `mUSDC` | Creditcoin | specified, building |

Addresses land in `contracts/deployments/<chainid>.json` as each is deployed.
**Read them from there** rather than hardcoding — they will change at least once
more.

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

**USDC has 6 decimals, not 18.** Anything you format from a raw amount must
divide by 1e6. This is the single most likely numeric bug in the app.

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
| **Chain** | none directly — the API reads Creditcoin state |
| **Latency** | 1–3s |

```jsonc
{
  "verified": true,
  "payerName": "Orru Demo Payroll",       // resolved from the payer registry
  "payerAddress": "0x...",
  "payerTier": 1,                          // 1 = seeded, 2 = many-payees rule
  "periodsVerified": 3,
  "evidencePayer": "0x...",                // all periods must share one payer
  "periodsConsecutive": true,              // false blocks credential issuance
  "firstPeriod": 1,
  "latestPeriod": 6,
  "incomeBand": { "id": 2, "label": "$2,000–3,000 / month" },
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

**UI:** the three-line checklist animation from the spec. Each line resolves in
sequence — "Looking at your payment history ✓ 6 payments found", "Confirming who
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
- `reason: "not_consecutive"` — there's a gap in the record
- `reason: "too_few_periods"` — fewer than 3 periods

### S4 · Your income profile

Renders the S3 payload. No new calls. Shows the **band**, never an exact amount —
we never have the exact amount on this side, and the pitch depends on that being
true.

### S5 · Credential preview → issue

This is where the proof is generated and the credential is issued.

| | |
|---|---|
| **Action** | Generate the proof in-browser, then submit via relayer |
| **Call** | bb.js in a Web Worker → `POST /api/credential/issue` |
| **Chain** | Creditcoin (relayer sends it) |
| **Gas** | paid by relayer |
| **Latency** | **5–40s for proving**, then ~15s for the transaction |

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

Build it with `signTypedData`. The domain is `{ name: 'Orru', version: '1',
chainId: 102031, verifyingContract: <CredentialRegistry> }`; the contract also
exposes `domainSeparator()` and `nonces(address)`. Smart accounts work via
ERC-1271.

**UI:** treat it as part of the same "issuing your credential" step, not a
separate screen. Say *"Sign to issue your credential — this is free."*

**This is the only genuinely slow step in the app.** Budget for up to 40 seconds
and design a real progress experience — staged messages, not a spinner. Never say
"generating proof"; say "Checking your income pattern."

**You must also handle the server-side fallback.** If browser proving fails or
takes too long, we fall back to `POST /api/prove` server-side. The UI should not
distinguish them — same screen, same copy. This fallback exists specifically so
the demo cannot hang, so please don't surface it as an error.

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
  "incomeBand": { "id": 2, "label": "$2,000–3,000 / month" },
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

| Step | Time | Blocking? |
|---|---|---|
| Wallet connect + signature | instant | yes |
| Income lookup (S3) | 1–3s | yes |
| **Browser proof generation** | **5–40s** | **yes** |
| Creditcoin transaction | ~15s | yes |
| Attestcoin verification | ~10 min | **no — background, before the session** |

Only one step needs a designed waiting experience. Everything else can use
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

## 8. Reference

- Product spec: `docs/SPEC.md` · Scope and screens: `docs/MVP.md`
- Chain constraints: `docs/ATTESTCOIN.md`
- Contract specs: `docs/contracts/`
- Deployed addresses: `contracts/deployments/<chainid>.json`
- Commitment encoding (shared with the circuit): `shared/commitment.ts` — **do not
  reimplement this anywhere, import it.** If the frontend and the circuit disagree
  about encoding by one byte, everything compiles and nothing ever verifies.
