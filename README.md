# orru

Private proof of crypto income — and credit against it.

## Local

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

## Stack

- Next.js App Router
- Tailwind CSS v4
- Waitlist API route
