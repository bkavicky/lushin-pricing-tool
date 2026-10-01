// ---------------------------------------------------------------------------
// Branded PDF report generator for the Lushin pricing tool. (v2 layout)
// Page 1: executive summary — price, how it was built (floor vs. per-learner
//         comparison with the governing option highlighted), build-up to total.
// Page 2: the coach's inputs as entered, prospect economics, OMG.
// Uses pdf-lib (pure JS, serverless-friendly). Returns a Uint8Array.
// ---------------------------------------------------------------------------

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { money } = require('./pricing');

// Brand palette
const NAVY = rgb(0.1294, 0.1412, 0.3608);   // #21245C
const FRESH = rgb(0, 0.6784, 0.9294);        // #00ADED
const PASSION = rgb(0.8902, 0.2706, 0.3294); // #E34554
const GRAYDK = rgb(0.40, 0.40, 0.40);
const GRAYLN = rgb(0.84, 0.84, 0.87);
const BODY = rgb(0.20, 0.20, 0.20);
const WHITE = rgb(1, 1, 1);
const FILL_SOFT = rgb(0.955, 0.955, 0.965);   // light gray card
const FILL_FRESH = rgb(0.905, 0.965, 0.995);  // light cyan (winner)
const FILL_ROW = rgb(0.965, 0.968, 0.975);    // alternating table row

const PAGE_W = 612;
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

  let page;
  let y;

  // ---------- primitives ----------
  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }
  function ensure(space) {
    if (y - space < MARGIN + 20) newPage();
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
  function textWidth(str, size, useBold) {
    return (useBold ? bold : font).widthOfTextAtSize(String(str), size);
  }
  function wrap(str, x, maxW, opts = {}) {
    const f = opts.bold ? bold : (opts.ital ? ital : font);
    const size = opts.size || 10;
    const lh = opts.lh || size + 4;
    const words = String(str).split(/\s+/);
    let line = '';
    for (const word of words) {
      const t = line ? line + ' ' + word : word;
      if (f.widthOfTextAtSize(t, size) > maxW && line) {
        ensure(lh); text(line, x, opts); y -= lh; line = word;
      } else line = t;
    }
    if (line) { ensure(lh); text(line, x, opts); y -= lh; }
  }
  function sectionTitle(str) {
    ensure(40);
    y -= 10;
    text(str.toUpperCase(), MARGIN, { bold: true, size: 11, color: NAVY });
    y -= 6;
    page.drawRectangle({ x: MARGIN, y, width: 46, height: 2, color: FRESH });
    y -= 16;
  }

  // Zebra table: rows = [[label, value, opts?], ...]
  function table(rows, opts = {}) {
    const rowH = opts.rowH || 19;
    const size = opts.size || 9.5;
    rows.forEach((r, i) => {
      ensure(rowH);
      const [label, value, ro = {}] = r;
      if (i % 2 === 0 && !ro.noZebra) {
        page.drawRectangle({ x: MARGIN, y: y - 5, width: CONTENT_W, height: rowH - 2, color: FILL_ROW });
      }
      text(label, MARGIN + 8, { size, bold: ro.bold, color: ro.bold ? NAVY : GRAYDK });
      if (value != null) textRight(value, PAGE_W - MARGIN - 8, { size, bold: ro.bold, color: ro.color || NAVY });
      y -= rowH;
    });
  }

  // ---------- PAGE 1 ----------
  newPage();

  // Header band
  page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: NAVY });
  text('Engagement Pricing Summary', MARGIN, { y: PAGE_H - 40, bold: true, size: 19, color: WHITE });
  const subMeta = (meta.dealName || 'Untitled deal') + (meta.clientName ? '   ·   ' + meta.clientName : '');
  text(subMeta, MARGIN, { y: PAGE_H - 60, size: 11, color: rgb(0.82, 0.9, 1) });
  text('Prepared by ' + meta.coachName + '  ·  ' + formatDate(meta.submittedAt), MARGIN, { y: PAGE_H - 76, size: 9, color: rgb(0.7, 0.76, 0.92) });
  y = PAGE_H - 92 - 26;

  // Hero price
  text('ANNUAL ENGAGEMENT PRICE', MARGIN, { size: 9, bold: true, color: GRAYDK });
  y -= 30;
  text(dollars(engagement.total), MARGIN, { size: 30, bold: true, color: NAVY });
  // right-aligned effective stats on the same baseline area
  textRight(dollars(engagement.perLearnerYear) + ' / learner / year', PAGE_W - MARGIN, { size: 10, color: GRAYDK, y: y + 14 });
  textRight(dollars(engagement.perLearnerSession) + ' / learner / session', PAGE_W - MARGIN, { size: 10, color: GRAYDK, y: y + 1 });
  y -= 16;

  if (meta.notes) {
    y -= 4;
    wrap('Notes: ' + meta.notes, MARGIN, CONTENT_W, { size: 9, ital: true, color: GRAYDK, lh: 12 });
    y -= 2;
  }

  // ---------- How this price was built ----------
  sectionTitle('How this price was built');
  wrap('The engagement is priced on the greater of two calculations: the hourly floor (time on the engagement) or the per-learner fee (cohort size). The higher one becomes the engagement base.', MARGIN, CONTENT_W, { size: 9, color: GRAYDK, lh: 12 });
  y -= 8;

  const e = engagement, ip = e.inputs, rt = e.rates, ln = e.lines;

  // Build option card contents
  const optA = [];
  if (ip.leaderSess > 0) optA.push(['AOR leader sessions', `${ip.leaderSess} hrs × ${dollars(rt.aorR)}`, dollars(ln.aorLeaderCost)]);
  if (ip.coachingSess > 0) optA.push(['AOR leadership coaching', `${ip.coachingSess} hrs × ${dollars(rt.aorR)}`, dollars(ln.aorCoachingCost)]);
  if (ip.aorTeamSess > 0) optA.push(['AOR-led team sessions', `${ip.aorTeamSess} hrs × ${dollars(rt.aorR)}`, dollars(ln.aorTeamCost)]);
  if (ip.trainerTeamSess > 0) optA.push(['Trainer team sessions', `${ip.trainerTeamSess} hrs × ${dollars(rt.trainerR)}`, dollars(ln.trainerCost)]);
  if (ln.travelCost > 0) optA.push(['Travel', `${ip.travelHrs} hrs × ${dollars(ip.travelRate)}`, dollars(ln.travelCost)]);

  const optB = rt.flatTier
    ? [['Flat annual rate', `${ip.learners} learners × $2,250/yr`, dollars(ln.perLearner)]]
    : [['Per-learner fee', `${ip.learners} learners × ${rt.totalSessions} sessions × ${dollars(rt.tier)}`, dollars(ln.perLearner)]];

  const gap = 14;
  const cardW = (CONTENT_W - gap) / 2;
  const lineH = 22;
  const headH = 40;
  const totalH = 30;
  const cardBodyLines = Math.max(optA.length, 2);
  const cardH = headH + cardBodyLines * lineH + totalH;

  ensure(cardH + 20);
  const cardTop = y;
  const aWins = !rt.perLearnerGoverns;

  function drawCard(x, title, subtitle, rows, total, wins) {
    const top = cardTop;
    page.drawRectangle({
      x, y: top - cardH, width: cardW, height: cardH,
      color: wins ? FILL_FRESH : FILL_SOFT,
      borderColor: wins ? FRESH : GRAYLN,
      borderWidth: wins ? 1.5 : 0.75,
    });
    // header
    text(title.toUpperCase(), x + 12, { y: top - 18, size: 9, bold: true, color: NAVY });
    // badge
    const badge = wins ? 'SELECTED' : 'NOT USED';
    const bSize = 6.5;
    const bw = textWidth(badge, bSize, true) + 12;
    page.drawRectangle({
      x: x + cardW - 12 - bw, y: top - 22, width: bw, height: 13,
      color: wins ? FRESH : GRAYLN,
    });
    text(badge, x + cardW - 12 - bw + 6, { y: top - 18.5, size: bSize, bold: true, color: wins ? WHITE : GRAYDK });
    text(subtitle, x + 12, { y: top - 32, size: 7.5, color: GRAYDK });

    // body rows
    let ry = top - headH - 14;
    rows.forEach(r => {
      text(r[0], x + 12, { y: ry, size: 8.5, color: BODY });
      text(r[1], x + 12, { y: ry - 9, size: 7, color: GRAYDK });
      textRight(r[2], x + cardW - 12, { y: ry, size: 8.5, color: NAVY });
      ry -= lineH;
    });
    // total bar
    page.drawLine({ start: { x: x + 12, y: top - cardH + totalH - 6 }, end: { x: x + cardW - 12, y: top - cardH + totalH - 6 }, thickness: 1, color: wins ? FRESH : GRAYLN });
    text('Total', x + 12, { y: top - cardH + 12, size: 9, bold: true, color: NAVY });
    textRight(total, x + cardW - 12, { y: top - cardH + 12, size: 11, bold: true, color: wins ? NAVY : GRAYDK });
  }

  drawCard(MARGIN, 'Option A — hourly floor', 'Time on the engagement, billed by experience level', optA, dollars(ln.floor), aWins);
  drawCard(MARGIN + cardW + gap, 'Option B — per-learner fee', rt.tierLabel, optB, dollars(ln.perLearner), !aWins);
  y = cardTop - cardH - 18;

  // ---------- From base to total ----------
  sectionTitle('From base to total');
  table([
    [`Engagement base — ${aWins ? 'hourly floor' : 'per-learner fee'} (greater of A and B)`, dollars(ln.base), { bold: true }],
    [`Yoodli & materials (${ip.learners} learners × $500)`, dollars(ln.yoodli)],
    ['Subtotal', dollars(ln.subtotal)],
    ['Sandler online (5% of subtotal)', dollars(ln.sandlerOnline)],
  ]);
  // grand total band
  ensure(30);
  page.drawRectangle({ x: MARGIN, y: y - 8, width: CONTENT_W, height: 26, color: NAVY });
  text('TOTAL ANNUAL PRICE', MARGIN + 10, { y: y + 1, size: 10, bold: true, color: WHITE });
  textRight(dollars(e.total), PAGE_W - MARGIN - 10, { y: y, size: 13, bold: true, color: WHITE });
  y -= 34;

  if (omg.total > 0) {
    text('Plus OMG assessment: ' + dollars(omg.total) + '  (detail on page 2)', MARGIN, { size: 9, ital: true, color: GRAYDK });
    y -= 14;
  }

  // ---------- PAGE 2 ----------
  newPage();

  sectionTitle('What was entered');
  wrap('The inputs exactly as ' + (meta.coachName || 'the coach') + ' submitted them.', MARGIN, CONTENT_W, { size: 9, color: GRAYDK, lh: 12 });
  y -= 4;
  table([
    ['Learners', String(ip.learners)],
    ['Team sessions / year', String(ip.teamSess)],
    ['…of which AOR-led', String(ip.aorTeamSess)],
    ['Trainer-led team sessions (derived)', String(ip.trainerTeamSess)],
    ['Leader sessions / year', String(ip.leaderSess)],
    ['Leadership coaching sessions / year', String(ip.coachingSess)],
    ['Associate of Record experience', ip.aorYr + ' yrs  (' + dollars(rt.aorR) + '/hr · ' + rt.aorBand + ')'],
    ['Trainer experience', ip.trainerYr == null ? 'Not applicable (no trainer-led sessions)' : ip.trainerYr + ' yrs  (' + dollars(rt.trainerR) + '/hr · ' + rt.trainerBand + ')'],
    ['Travel', ip.travelHrs > 0 ? ip.travelHrs + ' hrs @ ' + dollars(ip.travelRate) + '/hr' : 'None'],
  ]);

  // ---------- Prospect economics ----------
  if (gutCheck.hasAny) {
    const g = gutCheck, gi = g.inputs;
    sectionTitle('Prospect economics');

    const entered = [];
    if (gi.revenue) entered.push(['Current annual revenue', dollars(gi.revenue)]);
    if (gi.gpPct) entered.push(['Gross profit margin', gi.gpPct + '%' + (gi.gp ? '  (' + dollars(gi.gp) + ' GP)' : '')]);
    if (gi.impact) entered.push(['Dollarized impact of problems / year', dollars(gi.impact)]);
    if (gi.ltv) entered.push(['Avg client lifetime value', dollars(gi.ltv)]);
    if (gi.cycle) entered.push(['Avg sales cycle', gi.cycle + ' months']);
    table(entered);

    y -= 6;
    text('IN THE PROSPECT’S TERMS', MARGIN, { size: 8.5, bold: true, color: GRAYDK });
    y -= 16;
    const computed = [];
    if (g.pctRevenue != null) computed.push(['Price as % of revenue', g.pctRevenue.toFixed(2) + '%', { bold: true, color: g.pctRevenue >= 1 ? PASSION : NAVY }]);
    if (g.pctGp != null) computed.push(['Price as % of gross profit', g.pctGp.toFixed(2) + '%', { bold: true }]);
    if (g.roi != null) computed.push(['ROI vs. problem impact', g.roi.toFixed(1) + 'x', { bold: true, color: g.roi < 10 ? PASSION : NAVY }]);
    if (g.breakevenClients != null) {
      const be = g.breakevenClients;
      const disp = be < 1 ? '< 1' : (be < 10 ? be.toFixed(1) : Math.ceil(be).toString());
      computed.push(['New clients to break even', disp, { bold: true, color: be > 12 ? PASSION : NAVY }]);
    }
    if (g.paybackMonths != null) {
      const m = g.paybackMonths;
      computed.push(['Payback period', m < 12 ? m.toFixed(1) + ' mo' : (m / 12).toFixed(1) + ' yr', { bold: true }]);
    }
    table(computed);

    // talk track callout
    const tt = buildTalkTrack(e.total, g, meta.clientName);
    if (tt) {
      y -= 8;
      ensure(60);
      const ttTop = y;
      // measure wrapped height first (approx): draw into box
      page.drawRectangle({ x: MARGIN, y: ttTop - 4, width: 3, height: 4, color: FRESH }); // placeholder anchor; real bar drawn after wrap
      text('TALK TRACK', MARGIN + 12, { size: 8.5, bold: true, color: GRAYDK });
      y -= 15;
      const before = y;
      wrap(tt, MARGIN + 12, CONTENT_W - 24, { size: 9.5, color: BODY, lh: 13.5 });
      const after = y;
      page.drawRectangle({ x: MARGIN, y: after + 4, width: 3, height: (before - after) + 24, color: FRESH });
      y -= 6;
    }
  }

  // ---------- OMG ----------
  if (omg.total > 0) {
    sectionTitle('OMG assessment');
    table([
      [`Participants (${omg.inputs.participants} × $550)`, dollars(omg.partCost)],
      [`Overviews (${omg.inputs.overviews} × $3,600)`, dollars(omg.overCost)],
      ['Total OMG price', dollars(omg.total), { bold: true }],
    ]);
  }

  // ---------- footer ----------
  const dateStr = formatDate(meta.submittedAt);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText('Confidential — internal Lushin pricing · ' + (meta.dealName || '') + ' · Generated ' + dateStr, {
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
    bits.push('a payback of ' + (m < 12 ? m.toFixed(1) + ' months' : (m / 12).toFixed(1) + ' years') + ' at one new client per sales cycle');
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
