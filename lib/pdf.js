// ---------------------------------------------------------------------------
// Branded PDF report generator for the Lushin pricing tool.
// Uses pdf-lib (pure JS, serverless-friendly). Returns a Uint8Array.
// ---------------------------------------------------------------------------

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { money } = require('./pricing');

// Brand palette
const NAVY = rgb(0.1294, 0.1412, 0.3608);   // #21245C stable
const FRESH = rgb(0, 0.6784, 0.9294);        // #00ADED fresh
const PASSION = rgb(0.8902, 0.2706, 0.3294); // #E34554 passionate
const LIMIT = rgb(0.9804, 0.6902, 0.2510);   // #FAB040 limitless
const GRAYDK = rgb(0.40, 0.40, 0.40);
const GRAYLN = rgb(0.86, 0.86, 0.88);
const BODY = rgb(0.20, 0.20, 0.20);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 612;   // US Letter
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;

function dollars(n) { return money(n); }

async function buildPdf(data) {
  const { meta, engagement, gutCheck, omg } = data;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  // -- helpers ----------------------------------------------------------------
  function ensure(space) {
    if (y - space < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }
  function text(str, x, opts = {}) {
    const f = opts.bold ? bold : (opts.ital ? ital : font);
    page.drawText(String(str), {
      x, y: opts.y != null ? opts.y : y,
      size: opts.size || 10, font: f, color: opts.color || BODY,
    });
  }
  function textRight(str, xRight, opts = {}) {
    const f = opts.bold ? bold : font;
    const size = opts.size || 10;
    const w = f.widthOfTextAtSize(String(str), size);
    text(str, xRight - w, opts);
  }
  function wrap(str, x, maxW, opts = {}) {
    const f = opts.bold ? bold : (opts.ital ? ital : font);
    const size = opts.size || 10;
    const lh = opts.lh || size + 4;
    const words = String(str).split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (f.widthOfTextAtSize(test, size) > maxW && line) {
        ensure(lh); text(line, x, opts); y -= lh; line = word;
      } else line = test;
    }
    if (line) { ensure(lh); text(line, x, opts); y -= lh; }
  }
  function sectionTitle(str) {
    ensure(34);
    y -= 18;
    text(str.toUpperCase(), MARGIN, { bold: true, size: 11, color: NAVY });
    y -= 6;
    page.drawRectangle({ x: MARGIN, y, width: 46, height: 2, color: FRESH });
    y -= 14;
  }
  function row(label, amount, opts = {}) {
    ensure(opts.h || 18);
    const size = opts.size || 10;
    text(label, MARGIN + (opts.indent || 0), { size, bold: opts.bold, color: opts.color || (opts.bold ? NAVY : GRAYDK) });
    if (amount != null) textRight(amount, PAGE_W - MARGIN, { size, bold: opts.bold, color: opts.color || NAVY });
    y -= (opts.h || 18);
    if (opts.rule) {
      page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: opts.ruleThick || 0.5, color: opts.ruleColor || GRAYLN });
    }
  }

  // -- header band ------------------------------------------------------------
  page.drawRectangle({ x: 0, y: PAGE_H - 86, width: PAGE_W, height: 86, color: NAVY });
  text('Engagement Pricing Summary', MARGIN, { y: PAGE_H - 44, bold: true, size: 20, color: WHITE });
  text('Lushin · Internal pricing review', MARGIN, { y: PAGE_H - 64, size: 10, color: rgb(0.8, 0.85, 0.95) });
  y = PAGE_H - 86 - 24;

  // -- meta -------------------------------------------------------------------
  const dateStr = formatDate(meta.submittedAt);
  function metaLine(lbl, val) {
    ensure(16);
    text(lbl, MARGIN, { size: 9, bold: true, color: GRAYDK });
    text(val || '—', MARGIN + 120, { size: 10, color: NAVY });
    y -= 16;
  }
  if (meta.dealName) metaLine('Deal', meta.dealName);
  metaLine('Prospect / client', meta.clientName);
  if (meta.contactName) metaLine('Prospect contact', meta.contactName);
  metaLine('Prepared by', meta.coachName + '  ·  ' + meta.coachEmail);
  metaLine('Date', dateStr);
  if (meta.notes) {
    y -= 4;
    text('Notes', MARGIN, { size: 9, bold: true, color: GRAYDK }); y -= 14;
    wrap(meta.notes, MARGIN, CONTENT_W, { size: 10, color: BODY, lh: 14 });
  }

  // -- ENGAGEMENT -------------------------------------------------------------
  const e = engagement;
  sectionTitle('Engagement pricing');

  // hero amount
  ensure(72);
  text('Annual engagement price', MARGIN, { size: 9, bold: true, color: GRAYDK }); y -= 26;
  text(dollars(e.total), MARGIN, { size: 26, bold: true, color: NAVY }); y -= 18;
  text(dollars(e.perLearnerYear) + ' per learner / year   ·   ' + dollars(e.perLearnerSession) + ' per learner / session',
    MARGIN, { size: 9, color: GRAYDK }); y -= 22;

  const ip = e.inputs, rt = e.rates, ln = e.lines;
  row(`AOR — leader sessions (${ip.aorYr} yrs @ ${dollars(rt.aorR)}/hr × ${ip.leaderSess} hrs)`, dollars(ln.aorLeaderCost), { rule: true });
  if (ln.aorCoachingCost > 0)
    row(`AOR — leadership coaching (${ip.aorYr} yrs @ ${dollars(rt.aorR)}/hr × ${ip.coachingSess} hrs)`, dollars(ln.aorCoachingCost), { rule: true });
  if (ln.aorTeamCost > 0)
    row(`AOR — team sessions led (${ip.aorYr} yrs @ ${dollars(rt.aorR)}/hr × ${ip.aorTeamSess} hrs)`, dollars(ln.aorTeamCost), { rule: true });
  if (ln.trainerCost > 0)
    row(`Trainer — team sessions (${ip.trainerYr} yrs @ ${dollars(rt.trainerR)}/hr × ${ip.trainerTeamSess} hrs)`, dollars(ln.trainerCost), { rule: true });
  if (ln.travelCost > 0)
    row(`Travel (${ip.travelHrs} hrs @ ${dollars(ip.travelRate)}/hr)`, dollars(ln.travelCost), { rule: true });
  row('Hourly floor', dollars(ln.floor), { rule: true });
  row(
    rt.flatTier
      ? `Per-learner fee (${ip.learners} × $2,250/yr flat)`
      : `Per-learner fee (${ip.learners} × ${rt.totalSessions} sess × ${dollars(rt.tier)})`,
    dollars(ln.perLearner), { rule: true });
  row(
    rt.perLearnerGoverns
      ? 'Engagement base — per-learner fee governs (greater of the two)'
      : 'Engagement base — hourly floor governs (greater of the two)',
    dollars(ln.base), { bold: true, rule: true, ruleColor: GRAYLN });
  row(`Yoodli & materials (${ip.learners} × $500)`, dollars(ln.yoodli), { rule: true });
  row('Sandler online (5%)', dollars(ln.sandlerOnline), { rule: true });
  // total with thick top rule
  ensure(26);
  page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: PAGE_W - MARGIN, y: y + 8 }, thickness: 1.5, color: NAVY });
  row('Total annual price', dollars(e.total), { bold: true, size: 13, h: 22 });
  y -= 4;
  // tier badge line
  text('Pricing tier:  ' + rt.tierLabel, MARGIN, { size: 9, ital: true, color: GRAYDK }); y -= 6;

  // -- GUT CHECK --------------------------------------------------------------
  if (gutCheck.hasAny) {
    const g = gutCheck;
    sectionTitle('Investment in the prospect’s terms');

    const gi = g.inputs;
    if (gi.revenue) row('Current annual revenue', dollars(gi.revenue), { rule: true });
    if (gi.gpPct) row(`Gross profit margin`, gi.gpPct + '%', { rule: true });
    if (gi.gp) row('Gross profit (derived)', dollars(gi.gp), { rule: true });
    if (gi.impact) row('Dollarized impact of problems / yr', dollars(gi.impact), { rule: true });
    if (gi.ltv) row('Avg client lifetime value', dollars(gi.ltv), { rule: true });
    if (gi.cycle) row('Avg sales cycle', gi.cycle + ' months', { rule: true });

    y -= 6;
    if (g.pctRevenue != null) row('Price as % of revenue', g.pctRevenue.toFixed(2) + '%', { bold: true, rule: true, color: g.pctRevenue >= 1 ? PASSION : NAVY });
    if (g.pctGp != null) row('Price as % of gross profit', g.pctGp.toFixed(2) + '%', { bold: true, rule: true });
    if (g.roi != null) row('ROI vs. problem impact', g.roi.toFixed(1) + 'x', { bold: true, rule: true, color: g.roi < 10 ? PASSION : NAVY });
    if (g.breakevenClients != null) {
      const be = g.breakevenClients;
      const disp = be < 1 ? '< 1' : (be < 10 ? be.toFixed(1) : Math.ceil(be).toString());
      row('New clients to break even', disp, { bold: true, rule: true, color: be > 12 ? PASSION : NAVY });
    }
    if (g.paybackMonths != null) {
      const m = g.paybackMonths;
      const disp = m < 12 ? m.toFixed(1) + ' mo' : (m / 12).toFixed(1) + ' yr';
      row('Payback period', disp, { bold: true, rule: true });
    }

    // talk track
    y -= 8;
    text('Talk track', MARGIN, { size: 9, bold: true, color: GRAYDK }); y -= 14;
    wrap(buildTalkTrack(e.total, g, meta.clientName), MARGIN, CONTENT_W, { size: 10, color: BODY, lh: 14 });
  }

  // -- OMG --------------------------------------------------------------------
  if (omg.total > 0) {
    sectionTitle('OMG assessment');
    row(`Participants (${omg.inputs.participants} × $550)`, dollars(omg.partCost), { rule: true });
    row(`Overviews (${omg.inputs.overviews} × $3,600)`, dollars(omg.overCost), { rule: true });
    ensure(24);
    page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: PAGE_W - MARGIN, y: y + 8 }, thickness: 1.5, color: NAVY });
    row('Total OMG price', dollars(omg.total), { bold: true, size: 12, h: 20 });
  }

  // -- footer on every page ---------------------------------------------------
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText('Confidential — internal Lushin pricing. Generated ' + dateStr + '.', {
      x: MARGIN, y: 28, size: 7.5, font, color: GRAYDK,
    });
    p.drawText(`${i + 1} / ${pages.length}`, { x: PAGE_W - MARGIN - 24, y: 28, size: 7.5, font, color: GRAYDK });
  });

  return doc.save();
}

function buildTalkTrack(total, g, clientName) {
  const who = clientName || 'the prospect';
  const bits = [];
  if (g.pctRevenue != null) bits.push(g.pctRevenue.toFixed(2) + '% of their top-line revenue');
  if (g.pctGp != null) bits.push(g.pctGp.toFixed(2) + '% of their annual gross profit');
  if (g.roi != null) bits.push('a ' + g.roi.toFixed(1) + ':1 return against the ' + money(g.inputs.impact) + ' impact of the problems being solved');
  if (g.gpPerClient) {
    const be = g.breakevenClients;
    const beDisp = be < 1 ? 'less than one' : (be < 2 ? 'just one' : be.toFixed(1));
    bits.push('covered by the gross profit from ' + beDisp + ' additional ' + money(g.inputs.ltv) + '-LTV client' + (be >= 2 ? 's' : ''));
  }
  if (g.paybackMonths != null) {
    const m = g.paybackMonths;
    const pb = m < 12 ? m.toFixed(1) + ' months' : (m / 12).toFixed(1) + ' years';
    bits.push('a payback of ' + pb + ' at one new client per sales cycle');
  }
  if (!bits.length) return '';
  let s = 'At ' + money(total) + '/year, the investment for ' + who + ' is ';
  if (bits.length === 1) s += bits[0] + '.';
  else s += bits.slice(0, -1).join('; ') + '; and ' + bits[bits.length - 1] + '.';
  return s;
}

function formatDate(iso) {
  let d;
  try { d = iso ? new Date(iso) : new Date(); } catch { d = new Date(); }
  if (isNaN(d.getTime())) d = new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

module.exports = { buildPdf };
