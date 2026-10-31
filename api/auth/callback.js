// GET /api/auth/callback — Microsoft redirects here after sign-in.
const { completeLogin, sessionCookie, clearStateCookie } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  let location = '/';
  const cookies = [clearStateCookie()];
  try {
    const user = await completeLogin(req, req.query || {});
    cookies.push(sessionCookie(user));
  } catch (e) {
    console.error('[auth] sign-in failed', e.message);
    location = '/?signin_error=' + encodeURIComponent(e.message);
  }
  res.setHeader('Set-Cookie', cookies);
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
};
