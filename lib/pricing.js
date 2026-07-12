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
function clampInt(v, min, max, fallback) {
  let n = Math.round(num(v, fallback));
  if (n < min) n = min;
  if (max != null && n > max) n = max;
  return n;
}
function money(n) {
  if (!n) return '$0';
  return '$' + Math.round(n).toLocaleString('en-US');
}

// ---- Engagement (Calculator tab) ------------------------------------------

function calcEngagement(raw) {
  const learners = clampInt(raw.learners, 1, 200, 10);
  const teamSess = clampInt(raw.teamSessions, 0, 52, 12);
  // AOR-led team sessions can never exceed total team sessions
  const aorTeamSess = clampInt(raw.aorTeamSessions, 0, teamSess, 0);
  const trainerTeamSess = teamSess - aorTeamSess;
  const leaderSess = clampInt(raw.leaderSessions, 0, 52, 12);
  const coachingSess = clampInt(raw.coachingSessions, 0, 52, 0);
  const trainerYr = clampInt(raw.trainerYears, 1, 40, 2);
  const aorYr = clampInt(raw.aorYears, 1, 40, 10);
  const travelHrs = clampInt(raw.travelHours, 0, 500, 0);
  const travelRate = Math.max(0, num(raw.travelRate, 0));

  const aorR = aorRate(aorYr);
  const trainerR = trainerRate(trainerYr);
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
      trainerR, trainerBand: trainerBand(trainerYr),
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
  const overviews = clampInt(raw.overviews, 0, 1000, 0);
  const participants = clampInt(raw.participants, 0, 1000, 0);
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
  calcEngagement, calcGutCheck, calcOMG, computeAll, money,
};
