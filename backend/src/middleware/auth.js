const { verifyAccessToken } = require('../utils/jwt');
const { unauthorized, forbidden } = require('../utils/httpError');

function extractToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' ? token : null;
}

function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) return next(unauthorized('Missing token'));
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}

// Populates req.user when a valid token is present, but never blocks the request —
// used on endpoints usable by both guests and logged-in customers (e.g. create booking).
function optionalAuthenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = verifyAccessToken(token);
  } catch {
    req.user = null;
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.type !== 'admin') return next(forbidden('Admin access required'));
  next();
}

function requireCustomer(req, res, next) {
  if (req.user?.type !== 'customer') return next(forbidden('Customer access required'));
  next();
}

function requireEmployee(req, res, next) {
  if (req.user?.type !== 'employee') return next(forbidden('Employee access required'));
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return next(forbidden('Insufficient role'));
    next();
  };
}

module.exports = { authenticate, optionalAuthenticate, requireAdmin, requireCustomer, requireEmployee, requireRole };
