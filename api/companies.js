// GET /api/companies?q=… — HubSpot companies, for creating a new deal.
const { getUser } = require('../lib/auth');
const hubspot = require('../lib/hubspot');

module.exports = async function handler(req, res) {
  const user = getUser(req);
  if (!user) { res.status(401).json({ ok: false, error: 'Not signed in.' }); return; }
  const q = String((req.query && req.query.q) || '').trim().slice(0, 100);
  try {
    res.status(200).json({ ok: true, companies: await hubspot.searchCompanies(q) });
  } catch (e) {
    console.error('[companies] search failed', e.message);
    res.status(502).json({ ok: false, error: 'Could not reach HubSpot.' });
  }
};
