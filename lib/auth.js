// ---------------------------------------------------------------------------
// Microsoft 365 sign-in (server-side only)
// ---------------------------------------------------------------------------
// OpenID Connect authorization-code flow against the Lushin Entra tenant.
// The id_token comes straight from Microsoft's token endpoint over TLS in
// exchange for our client secret, so its claims are trusted without a separate
// signature check. The signed-in coach is kept in an HMAC-signed cookie.
//
// Env: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, SESSION_SECRET,
//      ALLOWED_EMAIL_DOMAINS (default lushin.com), APP_URL (optional).
// ---------------------------------------------------------------------------

const crypto = require('crypto');

const SESSION_COOKIE = 'lp_session';
const STATE_COOKIE = 'lp_oauth';
const SESSION_DAYS = 7;

function authConfigured() {
  return !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.SESSION_SECRET);
}

function allowedDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS || 'lushin.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}`;
}

function redirectUri(req) {
  return `${appUrl(req)}/api/auth/callback`;
}

// ---- Signed cookies --------------------------------------------------------

function b64url(buf) { return Buffer.from(buf).toString('base64url'); }

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || !process.env.SESSION_SECRET) return null;
  const [body, mac] = String(token).split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

// ---- Session ---------------------------------------------------------------

// Returns { email, name } for the signed-in coach, or null.
function getUser(req) {
  const s = verify(parseCookies(req)[SESSION_COOKIE]);
  return s && s.email ? { email: s.email, name: s.name || s.email } : null;
}

function sessionCookie(user) {
  return cookie(SESSION_COOKIE, sign({ ...user, exp: Date.now() + SESSION_DAYS * 864e5 }), SESSION_DAYS * 86400);
}

function clearSessionCookie() {
  return cookie(SESSION_COOKIE, '', 0);
}

// ---- OIDC flow -------------------------------------------------------------

function loginRedirect(req) {
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  const url = new URL(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', process.env.MS_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri(req));
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  return { url: url.toString(), stateCookie: cookie(STATE_COOKIE, sign({ state, nonce, exp: Date.now() + 10 * 6e4 }), 600) };
}

// Exchanges the code and returns { email, name }. Throws with a coach-safe message.
async function completeLogin(req, query) {
  const saved = verify(parseCookies(req)[STATE_COOKIE]);
  if (!saved || !query.state || saved.state !== query.state) throw new Error('Your sign-in expired. Please try again.');
  if (query.error) throw new Error(query.error_description || 'Microsoft sign-in was cancelled.');

  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: String(query.code || ''),
      redirect_uri: redirectUri(req),
      scope: 'openid profile email',
    }),
  });
  const tokens = await res.json().catch(() => ({}));
  if (!res.ok || !tokens.id_token) {
    console.error('[auth] token exchange failed', res.status, tokens.error, tokens.error_description);
    throw new Error('Microsoft sign-in failed. Please try again.');
  }
  const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8'));
  if (claims.nonce !== saved.nonce) throw new Error('Your sign-in expired. Please try again.');
  if (claims.tid && claims.tid !== process.env.MS_TENANT_ID) throw new Error('Sign in with your Lushin Microsoft account.');

  const email = String(claims.email || claims.preferred_username || '').toLowerCase();
  const domain = email.split('@')[1];
  if (!email || !allowedDomains().includes(domain)) throw new Error('Sign in with your Lushin Microsoft account.');
  return { email, name: claims.name || email };
}

module.exports = {
  authConfigured, getUser, sessionCookie, clearSessionCookie, loginRedirect, completeLogin,
  clearStateCookie: () => cookie(STATE_COOKIE, '', 0),
};
