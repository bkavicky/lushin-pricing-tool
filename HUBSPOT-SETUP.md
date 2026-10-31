# HubSpot + Microsoft Sign-in Setup

The pricing tool now requires coaches to sign in with their Lushin Microsoft
account and to pick (or create) a HubSpot deal before they can price. When
they send, the PDF is filed on the deal as a note and the deal's existing
fields are updated. This guide covers the one-time setup.

Three things to create, then paste into Vercel:

| Vercel setting | Where it comes from |
|---|---|
| `HUBSPOT_TOKEN` | HubSpot private app (Part 1) |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | Microsoft Entra app registration (Part 2) |
| `SESSION_SECRET` | Any long random string (Part 3) |
| `APP_URL` | `https://pricing.lushin.com` (production only) |
| `ALLOWED_EMAIL_DOMAINS` | `lushin.com` (the default; only needed to add another domain) |

---

## Part 1 — HubSpot private app (a HubSpot super admin does this)

1. HubSpot → **Settings** (gear) → **Integrations → Private Apps** (newer
   accounts may label this **Legacy Apps**). Click **Create a private app**.
2. Name it **Lushin Pricing Tool**.
3. On the **Scopes** tab, turn on:
   - `crm.objects.deals.read` and `crm.objects.deals.write`
   - `crm.objects.companies.read` and `crm.objects.companies.write`
   - `crm.objects.owners.read`
   - `crm.objects.contacts.write` (HubSpot uses this for creating notes)
   - `crm.schemas.deals.read` (to read pipeline stage names)
   - `files`
4. **Create app**, then copy the **access token** (starts with `pat-`). That's
   `HUBSPOT_TOKEN`.

Notes and files created by the tool show as coming from the **Lushin Pricing
Tool** app. Each note is owned by the coach who ran the pricing.

## Part 2 — Microsoft sign-in (your Microsoft 365 / Entra admin does this)

1. **entra.microsoft.com → Applications → App registrations → New registration.**
2. Name: **Lushin Pricing Tool**. Supported account types: **Accounts in this
   organizational directory only**.
3. Redirect URI: platform **Web**,
   `https://pricing.lushin.com/api/auth/callback`
4. Register. On the overview page copy:
   - **Directory (tenant) ID** → `MS_TENANT_ID`
   - **Application (client) ID** → `MS_CLIENT_ID`
5. **Certificates & secrets → New client secret**, 24 months. Copy the
   **Value** (not the ID) → `MS_CLIENT_SECRET`. Put a reminder on the calendar
   to renew it before it expires; sign-in stops working the day it does.
6. To test on a Vercel preview first, add a second redirect URI under
   **Authentication** for the preview address, e.g.
   `https://lushin-pricing-tool-git-feature-hubspot-deals-lushin.vercel.app/api/auth/callback`

Only `@lushin.com` addresses in your tenant can sign in.

## Part 3 — Session secret

Any long random string. On a Mac, run `openssl rand -hex 32` in Terminal and
paste the result as `SESSION_SECRET`. Changing it later signs everyone out.

## Part 4 — Add to Vercel and deploy

Vercel → **lushin-pricing-tool → Settings → Environment Variables**. Add the
values above. Set `APP_URL` for **Production** only; leave it out of
**Preview** so previews use their own address.

---

## How it behaves

- **Picking a deal:** coaches search open deals in the **Retainer** and
  **Assessments/SEIA** pipelines. Their own deals show first. The pricing
  form stays locked until a deal is chosen.
- **Creating a deal:** coaches pick or add the company, choose the pipeline,
  and accept or edit the suggested name. If the company already has open
  deals, the tool offers those first. The deal is created **at Qualified**
  when they send, owned by the coach.
- **Qualified fields are left blank on purpose.** HubSpot only enforces
  required stage fields when a deal is moved by hand, so new deals arrive in
  Qualified with them empty. The confirmation screen, the email (which
  leadership is copied on), and the note on the deal all list what's still
  blank.
- **Existing deals keep their stage.** Pricing never moves a deal.
- **Fields written** (existing fields only):

  | Field | Value |
  |---|---|
  | Amount (Retainer) | Annual engagement price incl. the 5% Sandler fee, and Yoodli & materials only if the coach chose it. Overwritten every time. |
  | Amount (Assessments/SEIA) | OMG/SEIA total only. Left alone if the coach entered no OMG/SEIA numbers. |
  | Monthly Retainer Amount | Annual engagement price ÷ 12 (Retainer pipeline only) |
  | Company Revenue | Prospect's annual revenue, if entered |
  | Pain Quantified | Dollarized impact of problems, if entered |
  | Product/Service | "Retainer", on new Retainer deals only |

- **If HubSpot is down** when a coach sends, nothing is sent and they're asked
  to try again. If the deal is fine but attaching the PDF fails, the email
  still goes out and says so.

## Keeping the required-field list current

The tool's list of Qualified fields for each pipeline is in `lib/hubspot.js`
(`PIPELINES`). It was worked out from existing deals, so check it against
HubSpot → **Settings → Objects → Deals → Pipelines** → each pipeline's
**Qualified** stage, and edit the list if you add or remove a required field.
