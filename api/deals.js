// GET /api/deals?q=…  or  ?companyId=…
// Open deals in the Retainer and Assessments/SEIA pipelines. With no query,
// only the signed-in coach's own deals.
const { getUser } = require('../lib/auth');
const hubspot = require('../lib/hubspot');

module.exports = async function handler(req, res) {
  const user = getUser(req);
  if (!user) { res.status(401).json({ ok: false, error: 'Not signed in.' }); return; }
  const q = String((req.query && req.query.q) || '').trim().slice(0, 100);
  const companyId = String((req.query && req.query.companyId) || '').replace(/\D/g, '');
  try {
    const ownerId = await hubspot.findOwnerIdByEmail(user.email);
    const deals = await hubspot.searchDeals({ q, ownerId, companyId: companyId || null });
    res.status(200).json({ ok: true, deals });
  } catch (e) {
    console.error('[deals] search failed', e.message);
    res.status(502).json({ ok: false, error: 'Could not reach HubSpot.' });
  }
};
