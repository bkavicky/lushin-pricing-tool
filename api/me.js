// GET /api/me — who is signed in, and their HubSpot owner record.
const { getUser } = require('../lib/auth');
const hubspot = require('../lib/hubspot');

module.exports = async function handler(req, res) {
  const user = getUser(req);
  if (!user) { res.status(401).json({ ok: false, error: 'Not signed in.' }); return; }
  let ownerId = null;
  try { ownerId = await hubspot.findOwnerIdByEmail(user.email); }
  catch (e) { console.error('[me] owner lookup failed', e.message); }
  res.status(200).json({ ok: true, user, inHubSpot: !!ownerId });
};
