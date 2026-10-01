// ---------------------------------------------------------------------------
// Lushin Engagement Pricing — authoritative engine (server-side only)
// ---------------------------------------------------------------------------
// This module is the single source of truth for all pricing math and rate
// tables. It runs ONLY on the backend so coaches never see the rates, the
// tiers, or the leadership CC list. The browser collects inputs and nothing
// else. Numbers are recomputed here from the raw inputs on every submission.
// ---------------------------------------------------------------------------

// ---- Rate tables ----------------------------------------------------------

function trainerRate(y) {
  if (y <= 2) return 500;
  if (y <= 5) return 1000;
  return 1500;
}
function trainerBand(y) {
  if (y <= 2) return 'Years 1–2';
  if (y <= 5) return 'Years 3–5';
  return 'Years 6+';
}
function aorRate(y) {
  if (y <= 2) return 500;
  if (y <= 5) return 1000;
  if (y <= 8) return 2000;
  if (y <= 9) return 2500;
  return 3000;
}
function aorBand(y) {
  if (y <= 2) return 'Years 1–2';
  if (y <= 5) return 'Years 3–5';
  if (y <= 8) return 'Years 6–8';
  if (y <= 9) return 'Year 9';
  return 'Year 10+';
}
const FLAT_PER_LEARNER_YEAR = 2250; // 100+ learners: flat annual per-learner fee
function tierRate(n) {
  if (n <= 9) return 184;
  if (n <= 15) return 120;
  if (n <= 20) return 98;
  if (n <= 24) return 88;
  return 80; // 25–99
}
function tierLabel(n) {
  if (n <= 9) return '1–9 learners · $184/learner/session';
  if (n <= 15) return '10–15 learners · $120/learner/session';
  if (n <= 20) return '16–20 learners · $98/learner/session';
  if (n <= 24) return '21–24 learners · $88/learner/session';
  if (n <= 99) return '25–99 learners · $80/learner/session';
  return '100+ learners · $2,250/learner/year flat';
}

// ---- Helpers ---------------------------------------------------------------

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function blank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}
function money(n) {
  if (!n) return '$0';
  return '$' + Math.round(n).toLocaleString('en-US');
}

// ---- Input validation (authoritative) --------------------------------------
// Nothing is ever filled in or adjusted for the coach. A required field must be
// typed in (0 is an answer); anything out of range or fractional is rejected,
// not rounded or clamped. Mirrors the rules in index.html.

const FIELDS = {
  engagement: [
    { key: 'learners',         label: 'Learners',                            min: 1, max: 200, int: true, need: () => true },
    { key: 'teamSessions',     label: 'Team sessions / year',                min: 0, max: 48,  int: true, need: () => true },
    { key: 'leaderSessions',   label: 'Leader sessions / year',              min: 0, max: 24,  int: true, need: () => true },
    { key: 'aorTeamSessions',  label: '…of which AOR-led',                   min: 0, max: 48,  int: true, need: () => true },
    { key: 'coachingSessions', label: 'Leadership coaching sessions / year', min: 0, max: 24,  int: true, need: () => true },
    { key: 'travelHours',      label: 'Travel hours / year',                 min: 0, max: 80,  int: true, need: () => true },
    { key: 'travelRate',       label: 'Travel rate',                         min: 0, max: null, int: true, need: e => num(e.travelHours) > 0 },
    { key: 'aorYears',         label: 'Associate of Record experience',      min: 1, max: 20,  int: true, need: () => true },
    { key: 'trainerYears',     label: 'Trainer experience',                  min: 1, max: 20,  int: true, need: e => num(e.teamSessions) - num(e.aorTeamSessions) > 0 },
  ],
  prospect: [
    { key: 'revenue',          label: 'Annual revenue',                      min: 0, max: null },
    { key: 'gpMarginPct',      label: 'Gross profit margin %',               min: 0, max: 100 },
    { key: 'problemImpact',    label: 'Dollarized impact of problems',       min: 0, max: null },
    { key: 'clientLtv',        label: 'Avg client lifetime value',           min: 0, max: null },
    { key: 'salesCycleMonths', label: 'Avg sales cycle',                     min: 0, max: null },
  ],
  omg: [
    { key: 'overviews',        label: 'Number of overviews',                 min: 0, max: null, int: true },
    { key: 'participants',     label: 'Number of participants',              min: 0, max: null, int: true },
  ],
};

// Returns an array of problems (empty = valid).
function validateInputs(payload) {
  const errs = [];
  for (const group of Object.keys(FIELDS)) {
    const vals = (payload && payload[group]) || {};
    for (const f of FIELDS[group]) {
      const v = vals[f.key];
      if (blank(v)) {
        if (f.need && f.need(vals)) errs.push(`${f.label} is required`);
        continue;
      }
      const n = Number(v);
      if (!Number.isFinite(n)) { errs.push(`${f.label} must be a number`); continue; }
      if (f.int && !Number.isInteger(n)) { errs.push(`${f.label} must be a whole number`); continue; }
      if (n < f.min || (f.max != null && n > f.max)) {
        errs.push(f.max != null ? `${f.label} must be between ${f.min} and ${f.max}` : `${f.label} can't be below ${f.min}`);
      }
    }
  }
  const e = (payload && payload.engagement) || {};
  if (!blank(e.aorTeamSessions) && !blank(e.teamSessions) && Number(e.aorTeamSessions) > Number(e.teamSessions)) {
    errs.push('…of which AOR-led can\'t exceed team sessions');
  }
  return errs;
}

// ---- Engagement (Calculator tab) ------------------------------------------
// Expects inputs that already passed validateInputs(). No defaults, no clamping.

function calcEngagement(raw) {
  const learners = num(raw.learners);
  const teamSess = num(raw.teamSessions);
  const aorTeamSess = num(raw.aorTeamSessions);
  const trainerTeamSess = teamSess - aorTeamSess;
  const leaderSess = num(raw.leaderSessions);
  const coachingSess = num(raw.coachingSessions);
  const aorYr = num(raw.aorYears);
  // Trainer experience only matters when there are trainer-led sessions.
  const trainerYr = blank(raw.trainerYears) ? null : num(raw.trainerYears);
  const travelHrs = num(raw.travelHours);
  const travelRate = travelHrs > 0 ? num(raw.travelRate) : 0;

  const aorR = aorRate(aorYr);
  const trainerR = trainerYr == null ? 0 : trainerRate(trainerYr);
  const tier = tierRate(learners);
  const totalSessions = teamSess + leaderSess;

  const travelCost = travelHrs * travelRate;
  const aorLeaderCost = aorR * leaderSess;
  const aorCoachingCost = aorR * coachingSess;
  const aorTeamCost = aorR * aorTeamSess;
  const trainerCost = trainerR * trainerTeamSess;
  const floor = aorLeaderCost + aorCoachingCost + aorTeamCost + trainerCost + travelCost;

  // Per-learner fee: flat annual rate at 100+, else per-session tier.
  const flatTier = learners > 99;
  const perLearner = flatTier
    ? learners * FLAT_PER_LEARNER_YEAR
    : learners * totalSessions * tier;

  // Engagement base is the GREATER OF the hourly floor or the per-learner fee
  // (not the two summed).
  const base = Math.max(floor, perLearner);
  const perLearnerGoverns = perLearner > floor;

  const yoodli = learners * 500;
  const subtotal = base + yoodli;
  const sandlerOnline = subtotal * 0.05;
  const total = subtotal + sandlerOnline;

  const perLearnerYear = learners > 0 ? total / learners : 0;
  const perLearnerSession =
    learners > 0 && totalSessions > 0 ? total / (learners * totalSessions) : 0;

  return {
    inputs: {
      learners, teamSess, aorTeamSess, trainerTeamSess, leaderSess,
      coachingSess, trainerYr, aorYr, travelHrs, travelRate,
    },
    rates: {
      aorR, aorBand: aorBand(aorYr),
      trainerR, trainerBand: trainerYr == null ? null : trainerBand(trainerYr),
      tier, tierLabel: tierLabel(learners),
      totalSessions, flatTier, perLearnerGoverns,
    },
    lines: {
      aorLeaderCost, aorCoachingCost, aorTeamCost, trainerCost, travelCost,
      floor, perLearner, base, yoodli, subtotal, sandlerOnline,
    },
    total,
    perLearnerYear,
    perLearnerSession,
  };
}

// ---- Pricing Gut Check (prospect economics) -------------------------------

function calcGutCheck(total, raw) {
  const revenue = Math.max(0, num(raw.revenue, 0));
  const gpPct = Math.max(0, num(raw.gpMarginPct, 0));
  const gp = revenue > 0 && gpPct > 0 ? revenue * (gpPct / 100) : 0;
  const impact = Math.max(0, num(raw.problemImpact, 0));
  const ltv = Math.max(0, num(raw.clientLtv, 0));
  const cycle = Math.max(0, num(raw.salesCycleMonths, 0));

  const gpPerClient = ltv > 0 && gpPct > 0 ? ltv * (gpPct / 100) : 0;

  const out = {
    inputs: { revenue, gpPct, gp, impact, ltv, cycle },
    hasAny: !!(revenue || gp || impact || ltv),
    pctRevenue: revenue > 0 ? (total / revenue) * 100 : null,
    pctGp: gp > 0 ? (total / gp) * 100 : null,
    roi: impact > 0 ? impact / total : null,
    gpPerClient: gpPerClient || null,
    breakevenClients: gpPerClient > 0 ? total / gpPerClient : null,
    paybackMonths: gpPerClient > 0 && cycle > 0 ? (total / gpPerClient) * cycle : null,
  };
  return out;
}

// ---- OMG -------------------------------------------------------------------

function calcOMG(raw) {
  const overviews = num(raw.overviews);
  const participants = num(raw.participants);
  const partCost = participants * 550;
  const overCost = overviews * 3600;
  return {
    inputs: { overviews, participants },
    partCost,
    overCost,
    total: partCost + overCost,
  };
}

// ---- Top-level ------------------------------------------------------------

function computeAll(payload) {
  const engagement = calcEngagement(payload.engagement || {});
  const gutCheck = calcGutCheck(engagement.total, payload.prospect || {});
  const omg = calcOMG(payload.omg || {});
  return { engagement, gutCheck, omg };
}

module.exports = {
  trainerRate, trainerBand, aorRate, aorBand, tierRate, tierLabel,
  calcEngagement, calcGutCheck, calcOMG, computeAll, validateInputs, money,
};
