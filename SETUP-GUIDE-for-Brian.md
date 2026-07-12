# Deploy Guide — Lushin Pricing Tool

Your Vercel and Resend accounts are live, so this is the home stretch. Three
parts, in order: finish Resend → put the code on GitHub → deploy on Vercel.
The three settings you'll paste in:

| Setting | Value |
|---|---|
| `RESEND_API_KEY` | the `re_...` key from Resend (Part 1) |
| `FROM_EMAIL` | `Lushin Pricing <pricing@lushin.com>` |
| `LEADERSHIP_EMAILS` | `Rob@lushin.com,Aaron@lushin.com,Brian@lushin.com,Emily@lushin.com` |

---

## Part 1 — Finish Resend (verify domain + get key)

1. In Resend, go to **Domains**. If **lushin.com** isn't listed, click
   **Add Domain**, enter `lushin.com`.
2. Resend shows a list of **DNS records**. These must be added to lushin.com's
   DNS. Copy/screenshot that page and send it to whoever manages your company
   email/domain (your IT/Microsoft 365 admin), asking them to add the records.
   - Bundle in one extra record while you're at it (for Part 3's custom address):
     a **CNAME** for `pricing.lushin.com` pointing to `cname.vercel-dns.com`.
3. Wait for the domain to show **Verified** in Resend.
4. Go to **API Keys → Create API Key**, name it "Pricing tool," and copy the
   key (starts with `re_`). Save it somewhere safe — you only see it once.

## Part 2 — Put the code on GitHub

1. Unzip **lushin-pricing-tool-deploy.zip** on your computer.
2. Go to **github.com → +' → New repository**. Name it `lushin-pricing-tool`,
   set **Private**, click **Create repository**.
3. Click the link **"uploading an existing file."**
4. Open the unzipped `lushin-pricing-tool` folder, select **everything inside**
   it, and drag it into the GitHub upload box. (The zip is already clean — no
   `node_modules` to worry about.)
5. Click **Commit changes**.

## Part 3 — Deploy on Vercel

1. In Vercel, click **Add New… → Project**.
2. Find **lushin-pricing-tool** and click **Import**.
3. Leave the build settings as-is (no framework, nothing to change).
4. Open **Environment Variables** and add the three from the table above (Name
   on the left, Value on the right).
5. Click **Deploy** and wait a minute or two.
6. Vercel gives you a URL like `lushin-pricing-tool.vercel.app`. Open it.

## Part 4 — Test + custom address

- **Test:** open your Vercel URL, fill in a fake deal, and submit. Within a
  minute you and the other three leaders should each get the PDF. Check spam if
  it's not there.
- **Custom address (optional):** in Vercel → project → **Settings → Domains**,
  add `pricing.lushin.com`. If IT added the CNAME in Part 1, it goes live in a
  few minutes and coaches use `pricing.lushin.com` instead of the vercel.app URL.

## Making changes later

Edit files → re-upload to GitHub → Vercel redeploys automatically within a
minute. Settings (the three values above) can be changed anytime in Vercel →
Settings → Environment Variables, no re-upload needed.

## If you get stuck

The two common snags are the **DNS records in Part 1** (hand to IT) and the
**upload in Part 2**. Send me a screenshot of where you're stuck and I'll tell
you the next click.
