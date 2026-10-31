// GET /api/auth/logout — sign the coach out of the pricing tool.
const { clearSessionCookie } = require('../../lib/auth');

module.exports = function handler(req, res) {
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.statusCode = 302;
  res.setHeader('Location', '/');
  res.end();
};
