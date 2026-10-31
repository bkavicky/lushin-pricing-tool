# Lushin Engagement Pricing Tool

A hosted web app that lets a coach enter engagement details and **emails a
branded PDF pricing summary to the coach and the leadership team**. Coaches
sign in with Microsoft 365 and must pick or create a HubSpot deal first; the
PDF is filed on that deal. See **HUBSPOT-SETUP.md**. No pricing
is shown on screen — the coach fills in the inputs, hits **Send**, and sees only
a "Check your email" confirmation. Every submission notifies leadership so you
know when a coach is pricing something and can have the conversation.

## How it works

1. Coach opens the app, fills in the form (your details, engagement, optional
   prospect economics, optional OMG), and submits.
2. The browser sends only the **raw inputs** to the backend. It never sees the
   rate tables, the math, or the leadership email list.
3. The backend (`/api/submit`) recomputes everything, builds a PDF, and emails
   it via Resend — **to the coach, with leadership CC'd**. The CC list lives
   server-side, so coaches can't see or remove it.
4. Each submission is logged (Vercel logs, plus an optional webhook to a sheet).

## Project layout

```
public/index.html      Coach-facing intake (rebuilt from the Claude Design export; no math shown)
public/assets/         Bundled Poppins fonts + Lushin logo used by the page
api/submit.js          Serverless endpoint: sign-in → deal → compute → PDF → file in HubSpot → email → log
api/auth/*.js          Microsoft 365 sign-in (login, callback, logout)
api/me.js, deals.js, companies.js   Signed-in coach, HubSpot deal and company search
lib/hubspot.js         HubSpot client; pipelines and Qualified required fields
lib/auth.js            Sign-in flow and signed session cookie
lib/pricing.js         Authoritative pricing engine (rates, tiers, greater-of base)
lib/pdf.js             Branded PDF report generator
.env.example           The environment variables you must set
vercel.json            Vercel config
```

Pricing logic (in `lib/pricing.js`): the engagement base is the **greater of**
the hourly floor or the per-learner fee (not summed); per-learner tiers are
$184 / $120 / $98 / $88 / $80 by cohort size, with a flat $2,250/learner/year at
100+ learners; then optional Yoodli/materials at $500/learner (the coach
chooses) and a 5% Sandler online
add-on.

## What you need to provide

Set these as **Environment Variables** in Vercel (Project → Settings →
Environment Variables). See `.env.example`.

| Variable | What it is |
|---|---|
| `RESEND_API_KEY` | API key from [resend.com](https://resend.com) → API Keys |
| `FROM_EMAIL` | Sending address, e.g. `Lushin Pricing <pricing@lushin.com>`. The domain must be verified in Resend. |
| `LEADERSHIP_EMAILS` | The four leaders, comma-separated. CC'd on every submission. |
| `LOG_WEBHOOK_URL` | *(optional)* A webhook (e.g. Zapier/Make → Google Sheet) to log each submission. Leave blank to skip. |
| `HUBSPOT_TOKEN` | HubSpot private app token. See HUBSPOT-SETUP.md. |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | Microsoft Entra app registration for sign-in. See HUBSPOT-SETUP.md. |
| `SESSION_SECRET` | Long random string that signs the login cookie. |
| `APP_URL` | *(production)* `https://pricing.lushin.com` |
| `ALLOWED_EMAIL_DOMAINS` | *(optional)* Defaults to `lushin.com`. |

**Still needed from you:** the four leadership email addresses, the sending
address (and which domain to verify in Resend), and who owns the Vercel +
Resend accounts.

## Deploy (one-time, ~20 min)

1. **Resend:** create an account, add and verify your sending domain
   (`lushin.com`), and create an API key.
2. **Vercel:** create an account and a new project. Push this folder to a Git
   repo (GitHub/GitLab) and import it, or run `vercel` from the Vercel CLI.
3. Add the environment variables above in Vercel.
4. Deploy. Vercel runs `npm install` automatically (`pdf-lib`, `resend`).
5. Visit the deployment URL — the form is served from `/`, the API from
   `/api/submit`. Optionally point a custom domain (e.g. `pricing.lushin.com`).

### Local testing

```
npm install
npm i -g vercel
cp .env.example .env.local   # fill in real values
vercel dev                   # serves the form + API locally
```

## Notes & options

- **Pricing logic** is in `lib/pricing.js`. If a rate, tier, or the 5% Sandler
  online fee changes, edit it there — coaches automatically get the new numbers
  with no redeploy of the form.
- **Logging:** submissions print to Vercel logs as `[submit] SENT {...}`. For a
  running record leadership can browse, set `LOG_WEBHOOK_URL` to a Zapier/Make
  hook that appends to a Google Sheet or Airtable.
- **Fonts:** the PDF uses Helvetica (built in). If you want Poppins to match the
  brand exactly, we can embed the Poppins .ttf — a small follow-up.
- **All-Microsoft alternative:** if IT later prefers no third party, the same
  engine and PDF can be wired to Azure Functions + Microsoft Graph (send via
  Outlook). The pricing/PDF code wouldn't change — only the email + hosting.

A sample of the emailed PDF is included as `sample-report.pdf`.
