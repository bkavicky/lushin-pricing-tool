// ---------------------------------------------------------------------------
// POST /api/submit  — Vercel serverless function
// ---------------------------------------------------------------------------
// 1. Validates the coach's submission
// 2. Recomputes ALL pricing server-side (browser never sees the math)
// 3. Generates a branded PDF report
// 4. Emails it to the coach, CC'ing leadership (CC enforced here, server-side)
// 5. Logs the submission (console + optional webhook)
// ---------------------------------------------------------------------------

const { Resend } = require('resend');
const { computeAll, validateInputs, money } = require('../lib/pricing');
const { buildPdf } = require('../lib/pdf');

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function safeName(s) {
  return String(s || 'engagement').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'engagement';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  // ---- config ----
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL;                  // e.g. "Lushin Pricing <pricing@lushin.com>"
  const leadership = (process.env.LEADERSHIP_EMAILS || '')   // comma-separated, set in Vercel
    .split(',').map(s => s.trim()).filter(Boolean);

  if (!apiKey || !fromEmail || leadership.length === 0) {
    console.error('[submit] Missing env config', {
      hasKey: !!apiKey, hasFrom: !!fromEmail, leadershipCount: leadership.length,
    });
    res.status(500).json({ ok: false, error: 'Server is not fully configured yet. Contact leadership.' });
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch { res.status(400).json({ ok: false, error: 'Could not read submission.' }); return; }

  const meta = body.meta || {};
  const dealName = String(meta.dealName || '').trim();
  const coachName = String(meta.coachName || '').trim();
  const coachEmail = String(meta.coachEmail || '').trim();
  const clientName = String(meta.clientName || '').trim();

  // ---- validation ----
  const errs = [];
  if (!dealName) errs.push('a deal name');
  if (!coachName) errs.push('your name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coachEmail)) errs.push('a valid email');
  if (!clientName) errs.push('the prospect / client name');
  if (errs.length) {
    res.status(400).json({ ok: false, error: 'Please provide ' + errs.join(', ') + '.' });
    return;
  }

  // Numbers are checked here too; nothing is filled in or adjusted.
  const inputErrs = validateInputs(body);
  if (inputErrs.length) {
    res.status(400).json({ ok: false, error: 'Please fix: ' + inputErrs.join('; ') + '.' });
    return;
  }

  // ---- compute (authoritative) ----
  const computed = computeAll(body);
  const reportData = {
    meta: {
      dealName, coachName, coachEmail, clientName,
      contactName: String(meta.contactName || '').trim(),
      notes: String(meta.notes || '').trim(),
      submittedAt: meta.submittedAt || new Date().toISOString(),
    },
    engagement: computed.engagement,
    gutCheck: computed.gutCheck,
    omg: computed.omg,
  };

  // ---- PDF ----
  let pdfBytes;
  try {
    pdfBytes = await buildPdf(reportData);
  } catch (e) {
    console.error('[submit] PDF generation failed', e);
    res.status(500).json({ ok: false, error: 'Could not build the report PDF.' });
    return;
  }
  const filename = `Lushin-Pricing-${safeName(dealName || clientName)}.pdf`;

  // ---- email ----
  const total = money(computed.engagement.total);
  const subject = `Pricing summary — ${dealName} (${coachName})`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#21245C;font-size:14px;line-height:1.5;">
      <p><strong>${escapeHtml(coachName)}</strong> just ran pricing for <strong>${escapeHtml(dealName)}</strong>${clientName ? ` (${escapeHtml(clientName)})` : ''}.</p>
      <p style="font-size:15px;">Annual engagement price: <strong>${total}</strong>
         ${computed.omg.total > 0 ? ` &nbsp;·&nbsp; OMG: <strong>${money(computed.omg.total)}</strong>` : ''}</p>
      <p>The full breakdown is attached as a PDF — use it to review with ${escapeHtml(coachName.split(' ')[0] || 'the coach')}
         or drop into a proposal.</p>
      ${reportData.meta.notes ? `<p style="color:#666;"><em>Notes:</em> ${escapeHtml(reportData.meta.notes)}</p>` : ''}
      <hr style="border:none;border-top:1px solid #EDEDED;margin:18px 0;">
      <p style="font-size:12px;color:#666;">Prepared by ${escapeHtml(coachName)} (${escapeHtml(coachEmail)}).
         This message was sent automatically by the Lushin Engagement Pricing tool.</p>
    </div>`;

  const resend = new Resend(apiKey);
  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [coachEmail],
      cc: leadership,                 // leadership always copied — enforced here
      subject,
      html,
      attachments: [{ filename, content: Buffer.from(pdfBytes) }],
    });
    if (error) throw new Error(error.message || 'Email provider error');

    // ---- log ----
    logSubmission(reportData, computed, data && data.id);

    res.status(200).json({ ok: true, id: data && data.id });
  } catch (e) {
    console.error('[submit] Email send failed', e);
    res.status(502).json({ ok: false, error: 'The report was built but the email failed to send.' });
  }
};

function logSubmission(reportData, computed, emailId) {
  const record = {
    at: reportData.meta.submittedAt,
    deal: reportData.meta.dealName,
    coach: reportData.meta.coachName,
    coachEmail: reportData.meta.coachEmail,
    client: reportData.meta.clientName,
    annualTotal: computed.engagement.total,
    omgTotal: computed.omg.total,
    learners: computed.engagement.inputs.learners,
    emailId: emailId || null,
  };
  // Always land in Vercel logs:
  console.log('[submit] SENT', JSON.stringify(record));

  // Optional: also POST to a logging endpoint (e.g. a Zapier/Make hook that
  // appends to a Google Sheet or Airtable) if LOG_WEBHOOK_URL is configured.
  const hook = process.env.LOG_WEBHOOK_URL;
  if (hook) {
    fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    }).catch(err => console.error('[submit] log webhook failed', err));
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
