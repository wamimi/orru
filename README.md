# orru

Private proof of crypto income — and credit against it.

## What this is

Orru turns stablecoin payments into a verifiable income credential. A worker
proves they were paid inside an income band across three consecutive pay
cycles — without revealing any amount — and a lender can check that claim with
no account, no cooperation from us, and no reason to trust us.

> Etherscan finds it. Attestcoin proves it. Creditcoin never takes anyone's word.

The proof is generated in the user's own browser, verified on-chain by
Creditcoin's native query verifier, and the resulting credential is public.

## How this makes money

Three lines, none of which charge the person checking a credential.

**1. Payer integration — the business.** A payroll platform or payout rail adds
one line to its flow to anchor a commitment per payment. Its workers can then
prove income anywhere. This is the paid relationship and the one that scales:
the payer gains a retention feature, and every worker they pay becomes a user.
Semuni in the demo is exactly this — it pays off-chain and anchors only a hash.

**2. Underwriting.** "How much can this person safely borrow?" Subscription or
per-decision, sold to lenders who want a limit rather than a fact.

**3. Embedded credit.** Get-paid-early inside someone else's app. Origination
fees.

**Reading a credential stays free and permissionless, permanently.** That is not
a missing paywall — it is what makes a credential worth issuing. A verification a
lender can perform without asking us is a stronger product than one they need a
key for, and it is the whole reason the credential lives on Creditcoin rather
than in our database. We charge the side that gains distribution, never the side
that would otherwise have to trust us.

**We are not the balance sheet.** The demo credit pool is simulated capital.
Real liquidity comes from the payer's own float, a depositor pool, or a licensed
credit partner.

Full detail in `docs/SPEC.md` §11.

## Local

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Production `/` is the waitlist. The in-progress site is at `/preview`, and the consumer flow starts at `/connect`.

## Structure

```text
src/
├── app/
│   ├── page.tsx         live waitlist (kept as /)
│   ├── (marketing)/preview   in-progress public site
│   └── (app)/           connect → review → profile → credential → share
├── components/
│   ├── WaitlistForm.tsx
│   ├── app/             consumer flow screens
│   ├── brand/           mark, wordmark, lockup
│   ├── layout/          nav, footer
│   └── ui/              design system primitives
└── lib/                 shared config + mock integration seams
public/brand/            exported logo assets
```

## Waitlist delivery

Signups hit `POST /api/waitlist`. Configure one of these in Vercel → Settings → Environment Variables:

1. `WAITLIST_WEBHOOK_URL` — POST JSON `{ email, source, product, joinedAt }` to Make / n8n / Zapier / Slack
2. `WAITLIST_NOTIFY_EMAIL` — email each signup via FormSubmit (confirm the first email FormSubmit sends you)
3. `RESEND_API_KEY` + `WAITLIST_NOTIFY_EMAIL` (+ optional `WAITLIST_FROM_EMAIL`)

If none are set, signups still succeed and are printed in Vercel function logs.

## Deploy to Vercel

```bash
npx vercel
```

Production:

```bash
npx vercel --prod
```

Or import the GitHub repo at [vercel.com/new](https://vercel.com/new).

## Custom domain

1. Vercel project → **Settings → Domains**
2. Add your domain (e.g. `orru.app` and `www.orru.app`)
3. At your registrar, add the DNS records Vercel shows (usually `A` / `CNAME`)
4. Wait for SSL to provision — usually a few minutes

## Copy

```bash
npm run check-copy
```

## Stack

- Next.js App Router
- Tailwind CSS v4
- Phosphor Icons
- Waitlist API route
