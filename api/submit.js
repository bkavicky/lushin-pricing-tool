// ---------------------------------------------------------------------------
// POST /api/submit  — Vercel serverless function
// ---------------------------------------------------------------------------
// 1. Requires a signed-in coach (Microsoft 365) — name and email come from there
// 2. Validates the submission, including the HubSpot deal it's for
// 3. Creates the deal in HubSpot first if the coach asked for a new one
// 4. Recomputes ALL pricing server-side (browser never sees the math)
// 5. Generates a branded PDF report
// 6. Files the PDF on the deal as a note and updates the deal's existing fields
// 7. Emails it to the coach, CC'ing leadership (CC enforced here, server-side)
// 8. Logs the submission (console + optional webhook)
// ---------------------------------------------------------------------------

const { Resend } = require('resend');
const { computeAll, validateInputs, money } = require('../lib/pricing');
const { buildPdf } = require('../lib/pdf');
const { getUser } = require('../lib/auth');
const hubspot = require('../lib/hubspot');

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

  if (!apiKey || !fromEmail || leadership.length === 0 || !hubspot.configured()) {
    console.error('[submit] Missing env config', {
      hasKey: !!apiKey, hasFrom: !!fromEmail, leadershipCount: leadership.length, hasHubSpot: hubspot.configured(),
    });
    res.status(500).json({ ok: false, error: 'Server is not fully configured yet. Contact leadership.' });
    return;
  }

  const user = getUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Your sign-in has expired. Sign in again — nothing you entered was lost.' });
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch { res.status(400).json({ ok: false, error: 'Could not read submission.' }); return; }

  const meta = body.meta || {};
  const coachName = user.name;
  const coachEmail = user.email;
  const pick = body.deal || {};
  const create = pick.create || null;

  // ---- validation ----
  if (!pick.id && !create) {
    res.status(400).json({ ok: false, error: 'Choose a HubSpot deal, or create one, before sending.' });
    return;
  }
  if (create) {
    const errs = [];
    if (!hubspot.PIPELINES[create.pipeline]) errs.push('a pipeline');
    if (!String(create.name || '').trim()) errs.push('a deal name');
    if (!create.companyId && !String(create.companyName || '').trim()) errs.push('the prospect / client company');
    if (errs.length) {
      res.status(400).json({ ok: false, error: 'To create the deal, provide ' + errs.join(', ') + '.' });
      return;
    }
  }

  // Numbers are checked here too; nothing is filled in or adjusted.
  const inputErrs = validateInputs(body);
  if (inputErrs.length) {
    res.status(400).json({ ok: false, error: 'Please fix: ' + inputErrs.join('; ') + '.' });
    return;
  }

  // ---- HubSpot deal (must exist before anything is sent) ----
  let ownerId = null;
  let deal;
  let created = false;
  try {
    ownerId = await hubspot.findOwnerIdByEmail(coachEmail);
    if (create) {
      const companyId = create.companyId
        ? String(create.companyId)
        : await hubspot.createCompany(String(create.companyName).trim().slice(0, 200));
      const id = await hubspot.createDeal({
        name: String(create.name).trim().slice(0, 200),
        pipelineKey: create.pipeline,
        ownerId,
        companyId,
      });
      created = true;
      deal = await hubspot.getDeal(id);
    } else {
      deal = await hubspot.getDeal(String(pick.id));
      if (!deal.pipeline || deal.closed) {
        res.status(400).json({ ok: false, error: 'That deal is closed or not in the Retainer or Assessments/SEIA pipeline. Choose another.' });
        return;
      }
    }
  } catch (e) {
    console.error('[submit] HubSpot deal step failed', e.message);
    res.status(502).json({ ok: false, error: 'Could not reach HubSpot, so nothing was sent. Try again in a minute.' });
    return;
  }

  const dealName = deal.name;
  const clientName = (deal.company && deal.company.name) || String((create && create.companyName) || '').trim();
  const pipeline = hubspot.PIPELINES[deal.pipeline];
  const missing = hubspot.missingQualifiedFields(deal.pipeline, deal.properties);
  const preQualified = hubspot.PRE_QUALIFIED_STAGES.has(deal.stage);
  const dealOut = {
    id: deal.id, name: dealName, url: deal.url, created,
    pipelineLabel: pipeline.label, stageLabel: deal.stageLabel,
  };

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
    res.status(500).json({ ok: false, error: 'Could not build the report PDF.', deal: dealOut });
    return;
  }
  const filename = `Lushin-Pricing-${safeName(dealName || clientName)}.pdf`;

  // ---- file on the HubSpot deal (a failure here doesn't stop the email) ----
  const total = money(computed.engagement.total);
  let filed = true;
  try {
    const attachmentId = await hubspot.uploadPdf(pdfBytes, filename);
    await hubspot.createNote({
      dealId: deal.id,
      companyId: deal.company && deal.company.id,
      ownerId,
      attachmentId,
      html: noteHtml({ coachName, total, computed, notes: reportData.meta.notes, missing, preQualified }),
    });
    await hubspot.updateDeal(deal.id, dealFields(deal.pipeline, computed));
  } catch (e) {
    filed = false;
    console.error('[submit] HubSpot filing failed', e.message);
  }

  // ---- email ----
  const subject = `Pricing summary — ${dealName} (${coachName})`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#21245C;font-size:14px;line-height:1.5;">
      ${hubspotBlock({ deal: dealOut, missing, preQualified, filed })}
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
    logSubmission(reportData, computed, data && data.id, { deal: dealOut, filed, missing });

    res.status(200).json({ ok: true, id: data && data.id, deal: dealOut, missing, preQualified, filed });
  } catch (e) {
    console.error('[submit] Email send failed', e);
    // The deal exists now; the page retries against it rather than creating another.
    res.status(502).json({ ok: false, error: 'The report was built but the email failed to send.', deal: dealOut });
  }
};

// Existing HubSpot deal fields the pricing fills in. No custom fields.
// Amount depends on the pipeline: Retainer deals get the engagement price
// (with the Sandler fee, and Yoodli only if the coach included it);
// Assessments/SEIA deals get the OMG/SEIA total, and only when there is one.
function dealFields(pipelineKey, computed) {
  const props = {};
  if (pipelineKey === 'retainer') {
    props.amount = String(Math.round(computed.engagement.total));
    props.retainer_ = String(Math.round(computed.engagement.total / 12));
  } else if (pipelineKey === 'seia' && computed.omg.total > 0) {
    props.amount = String(Math.round(computed.omg.total));
  }
  const g = computed.gutCheck.inputs;
  if (g.revenue > 0) props.company_revenue = String(Math.round(g.revenue));
  if (g.impact > 0) props.pain_quantified = money(g.impact);
  return props;
}

function missingLine(missing) {
  return missing.map(escapeHtml).join(', ');
}

function noteHtml({ coachName, total, computed, notes, missing, preQualified }) {
  return [
    `<p><strong>Pricing summary</strong> run by ${escapeHtml(coachName)} in the Lushin pricing tool.</p>`,
    `<p>Annual engagement price: <strong>${total}</strong>`,
    computed.omg.total > 0 ? ` · OMG: <strong>${money(computed.omg.total)}</strong>` : '',
    ` · Learners: ${computed.engagement.inputs.learners}</p>`,
    notes ? `<p><em>Notes:</em> ${escapeHtml(notes)}</p>` : '',
    preQualified ? '<p><strong>This deal is not yet in Qualified.</strong></p>' : '',
    missing.length ? `<p><strong>Still blank for Qualified:</strong> ${missingLine(missing)}</p>` : '',
    '<p>Full breakdown attached.</p>',
  ].join('');
}

// Top-of-email box: the coach's reminder, which leadership sees too.
function hubspotBlock({ deal, missing, preQualified, filed }) {
  const link = `<a href="${deal.url}" style="color:#0045C2;font-weight:bold;">Open the deal in HubSpot →</a>`;
  const lines = [];
  if (deal.created) {
    lines.push(`<strong>A new deal was created in HubSpot:</strong> ${escapeHtml(deal.name)} — ${escapeHtml(deal.pipelineLabel)} pipeline, ${escapeHtml(deal.stageLabel || 'Qualified')}.`);
  }
  if (preQualified) {
    lines.push(`<strong>This deal is still in ${escapeHtml(deal.stageLabel || 'an early stage')}</strong>, not Qualified.`);
  }
  if (missing.length) {
    lines.push(`<strong>Please finish the qualification details in HubSpot.</strong> Still blank: ${missingLine(missing)}.`);
  }
  if (!filed) {
    lines.push('<strong>The report could not be attached to the HubSpot deal.</strong> Please add the PDF to the deal by hand.');
  }
  if (!lines.length) {
    return `<p style="font-size:13px;color:#666;">Filed on the HubSpot deal <a href="${deal.url}" style="color:#0045C2;">${escapeHtml(deal.name)}</a>.</p>`;
  }
  return `
    <div style="background:#FFF6E5;border-left:4px solid #E34554;padding:12px 16px;margin:0 0 18px;">
      ${lines.map(l => `<p style="margin:0 0 8px;">${l}</p>`).join('')}
      <p style="margin:0;">${link}</p>
    </div>`;
}

function logSubmission(reportData, computed, emailId, hs) {
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
    hubspotDealId: hs.deal.id,
    hubspotDealCreated: hs.deal.created,
    hubspotFiled: hs.filed,
    qualifiedFieldsMissing: hs.missing.length,
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
