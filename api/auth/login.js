// GET /api/auth/login — send the coach to Microsoft 365 sign-in.
const { authConfigured, loginRedirect } = require('../../lib/auth');

module.exports = function handler(req, res) {
  if (!authConfigured()) {
    res.status(500).json({ ok: false, error: 'Sign-in is not configured yet. Contact leadership.' });
    return;
  }
  const { url, stateCookie } = loginRedirect(req);
  res.setHeader('Set-Cookie', stateCookie);
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
};
