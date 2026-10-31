// ---------------------------------------------------------------------------
// HubSpot client for the pricing tool (server-side only)
// ---------------------------------------------------------------------------
// Uses a HubSpot private app token (HUBSPOT_TOKEN). Coaches never see it.
// Only the two pricing pipelines below are searchable or writable from here.
// No custom properties are created: everything written is an existing field.
// ---------------------------------------------------------------------------

const API = process.env.HUBSPOT_API_BASE || 'https://api.hubapi.com';
const PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || '219307';

// ---- Pipelines -------------------------------------------------------------
// `required` = the fields HubSpot asks for before a deal can sit in Qualified.
// HubSpot only enforces these when someone drags a deal in the HubSpot UI, so
// deals the tool creates land in Qualified with them blank, and the coach is
// reminded to finish them. Keep these lists in step with
// HubSpot → Settings → Objects → Deals → Pipelines → (stage) required properties.

const PIPELINES = {
  retainer: {
    id: '912984683',
    label: 'Retainer',
    qualifiedStage: '1386920036',
    productservice: 'Retainer',
    required: [
      ['money_willing', 'Money Willing?'],
      ['time_willing', 'Time Willing'],
      ['change_willing', 'Change Willing?'],
      ['commitment_importance', 'Commitment (Importance)'],
      ['investment', 'Investment'],
      ['quantify_investment', 'Quantify Investment'],
      ['gut_check', 'Gut Check?'],
    ],
  },
  seia: {
    id: '912980339',
    label: 'Assessments/SEIA',
    qualifiedStage: '1386773921',
    productservice: null,
    required: [
      ['pain_what', 'Pain What'],
      ['pain_why', 'Pain Why'],
      ['pain_indicator', 'Pain Indicator'],
      ['pain_context', 'Pain Context'],
      ['pain_in_the_prospects_words', "Pain in the prospect's words"],
      ['impact', 'Impact'],
      ['decision_process', 'Decision Process'],
      ['decision_criteria', 'Decision Criteria'],
      ['commitment_importance', 'Commitment (Importance)'],
      ['clear_next_step', 'Clear next step?'],
      ['anyone_else_for_next_call', 'Anyone else for next call?'],
    ],
  },
};

// Stages that come before Qualified. A deal here is "not yet qualified".
const PRE_QUALIFIED_STAGES = new Set([
  '1386920034', '1386920035', // Retainer: Suspects, Prospects
  '1386773919', '1386773920', // Assessments/SEIA: Suspects, Prospects
]);

function pipelineKeyById(id) {
  return Object.keys(PIPELINES).find(k => PIPELINES[k].id === String(id)) || null;
}

const DEAL_PROPS = ['dealname', 'pipeline', 'dealstage', 'hubspot_owner_id', 'amount', 'hs_is_closed'];
const REQUIRED_PROPS = [...new Set(Object.values(PIPELINES).flatMap(p => p.required.map(r => r[0])))];

// ---- Transport -------------------------------------------------------------

function configured() {
  return !!process.env.HUBSPOT_TOKEN;
}

async function hs(path, { method = 'GET', body, form } = {}) {
  const headers = { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, {
    method,
    headers,
    body: form || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  const data = text ? safeJson(text) : {};
  if (!res.ok) {
    const err = new Error(`HubSpot ${method} ${path.split('?')[0]} → ${res.status}: ${(data && data.message) || text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function safeJson(t) { try { return JSON.parse(t); } catch { return { raw: t }; } }

function dealUrl(id) {
  return `https://app.hubspot.com/contacts/${PORTAL_ID}/record/0-3/${id}`;
}

// ---- Stage labels (fetched once per cold start) ----------------------------

let stageLabels = null;
async function getStageLabels() {
  if (stageLabels) return stageLabels;
  const out = {};
  for (const key of Object.keys(PIPELINES)) {
    try {
      const p = await hs(`/crm/v3/pipelines/deals/${PIPELINES[key].id}`);
      for (const s of p.stages || []) out[s.id] = s.label;
    } catch (e) {
      console.error('[hubspot] stage labels', e.message);
    }
  }
  stageLabels = out;
  return out;
}

// ---- Owners ----------------------------------------------------------------

async function findOwnerIdByEmail(email) {
  if (!email) return null;
  const data = await hs(`/crm/v3/owners/?email=${encodeURIComponent(email)}&limit=1`);
  const o = (data.results || [])[0];
  return o ? String(o.id) : null;
}

// ---- Deals -----------------------------------------------------------------

function openInPricingPipelines() {
  return [
    { propertyName: 'pipeline', operator: 'IN', values: Object.values(PIPELINES).map(p => p.id) },
    { propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' },
  ];
}

// Open deals in the two pricing pipelines. With no query, only the coach's own
// deals; with a query, everyone's matches with the coach's sorted first.
async function searchDeals({ q, ownerId, companyId, limit = 20 }) {
  const filters = openInPricingPipelines();
  if (companyId) filters.push({ propertyName: 'associations.company', operator: 'EQ', value: String(companyId) });
  else if (!q) {
    if (!ownerId) return [];
    filters.push({ propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(ownerId) });
  }
  const data = await hs('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: {
      query: q || undefined,
      filterGroups: [{ filters }],
      properties: DEAL_PROPS,
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      limit,
    },
  });
  const deals = data.results || [];
  const [labels, companies] = await Promise.all([getStageLabels(), companyNamesForDeals(deals.map(d => d.id))]);
  const out = deals.map(d => shapeDeal(d, labels, companies[d.id], ownerId));
  out.sort((a, b) => Number(b.mine) - Number(a.mine));
  return out;
}

function shapeDeal(d, labels, company, ownerId) {
  const p = d.properties || {};
  const key = pipelineKeyById(p.pipeline);
  return {
    id: String(d.id),
    name: p.dealname || '(unnamed deal)',
    company: company || null,
    pipeline: key,
    pipelineLabel: key ? PIPELINES[key].label : '',
    stage: p.dealstage,
    stageLabel: labels[p.dealstage] || '',
    mine: !!ownerId && String(p.hubspot_owner_id) === String(ownerId),
    url: dealUrl(d.id),
  };
}

// deal id → primary company { id, name }
async function companyNamesForDeals(ids) {
  if (!ids.length) return {};
  const assoc = await hs('/crm/v4/associations/deals/companies/batch/read', {
    method: 'POST',
    body: { inputs: ids.map(id => ({ id: String(id) })) },
  });
  const dealToCompany = {};
  for (const r of assoc.results || []) {
    const to = (r.to || [])[0];
    if (to) dealToCompany[r.from.id] = String(to.toObjectId);
  }
  const companyIds = [...new Set(Object.values(dealToCompany))];
  if (!companyIds.length) return {};
  const comps = await hs('/crm/v3/objects/companies/batch/read', {
    method: 'POST',
    body: { inputs: companyIds.map(id => ({ id })), properties: ['name'] },
  });
  const names = {};
  for (const c of comps.results || []) names[c.id] = c.properties.name;
  const out = {};
  for (const [dealId, cid] of Object.entries(dealToCompany)) out[dealId] = { id: cid, name: names[cid] || '' };
  return out;
}

async function getDeal(id) {
  const d = await hs(`/crm/v3/objects/deals/${encodeURIComponent(id)}?properties=${[...DEAL_PROPS, ...REQUIRED_PROPS].join(',')}`);
  const [labels, companies] = await Promise.all([getStageLabels(), companyNamesForDeals([d.id])]);
  return { ...shapeDeal(d, labels, companies[d.id], null), properties: d.properties || {}, closed: d.properties.hs_is_closed === 'true' };
}

async function createDeal({ name, pipelineKey, ownerId, companyId }) {
  const p = PIPELINES[pipelineKey];
  const properties = { dealname: name, pipeline: p.id, dealstage: p.qualifiedStage };
  if (ownerId) properties.hubspot_owner_id = ownerId;
  if (p.productservice) properties.productservice = p.productservice;
  const d = await hs('/crm/v3/objects/deals', {
    method: 'POST',
    body: {
      properties,
      associations: companyId
        ? [{ to: { id: String(companyId) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 }] }]
        : [],
    },
  });
  return String(d.id);
}

async function updateDeal(id, properties) {
  if (!Object.keys(properties).length) return;
  await hs(`/crm/v3/objects/deals/${encodeURIComponent(id)}`, { method: 'PATCH', body: { properties } });
}

// Labels of this pipeline's Qualified fields that are blank on the deal.
function missingQualifiedFields(pipelineKey, properties) {
  const p = PIPELINES[pipelineKey];
  if (!p) return [];
  return p.required
    .filter(([name]) => properties[name] == null || String(properties[name]).trim() === '')
    .map(([, label]) => label);
}

// ---- Companies -------------------------------------------------------------

async function searchCompanies(q) {
  if (!q) return [];
  const data = await hs('/crm/v3/objects/companies/search', {
    method: 'POST',
    body: { query: q, properties: ['name', 'domain'], limit: 10 },
  });
  return (data.results || []).map(c => ({ id: String(c.id), name: c.properties.name || '', domain: c.properties.domain || '' }));
}

async function createCompany(name) {
  const c = await hs('/crm/v3/objects/companies', { method: 'POST', body: { properties: { name } } });
  return String(c.id);
}

// ---- Filing the report -----------------------------------------------------

async function uploadPdf(bytes, filename) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
  form.append('folderPath', '/Pricing Reports');
  form.append('options', JSON.stringify({ access: 'PRIVATE', overwrite: false }));
  const f = await hs('/files/v3/files', { method: 'POST', form });
  return String(f.id);
}

async function createNote({ dealId, companyId, ownerId, html, attachmentId }) {
  const properties = { hs_timestamp: new Date().toISOString(), hs_note_body: html };
  if (ownerId) properties.hubspot_owner_id = ownerId;
  if (attachmentId) properties.hs_attachment_ids = attachmentId;
  const associations = [{ to: { id: String(dealId) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }];
  if (companyId) associations.push({ to: { id: String(companyId) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 190 }] });
  await hs('/crm/v3/objects/notes', { method: 'POST', body: { properties, associations } });
}

module.exports = {
  PIPELINES, PRE_QUALIFIED_STAGES, configured, dealUrl, pipelineKeyById,
  findOwnerIdByEmail, searchDeals, getDeal, createDeal, updateDeal, missingQualifiedFields,
  searchCompanies, createCompany, uploadPdf, createNote,
};
