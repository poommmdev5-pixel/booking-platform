const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { badRequest, unauthorized, conflict } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// Nothing else in this app gates how many times a client can try a password, so without
// this a login endpoint can be brute-forced at whatever rate the attacker's connection
// allows. Keyed by IP (relies on app.set('trust proxy', ...) in index.js so this sees the
// real client IP through nginx, not nginx's own container IP for every request).
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, message: 'Too many login attempts. Please try again later.' },
});

const REFRESH_COOKIE = 'refresh_token';
const refreshCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/api/auth',
});

function issueTokens(user) {
  return { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) };
}

router.post(
  '/admin/login',
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw badRequest('email and password are required');

    const [admin] = await query('SELECT * FROM admins WHERE email = ?', [email]);
    if (!admin || !admin.is_active || !(await verifyPassword(password, admin.password_hash))) {
      throw unauthorized('Invalid credentials');
    }
    const { accessToken, refreshToken } = issueTokens({ sub: admin.id, type: 'admin', role: admin.role, email: admin.email });
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.json({ accessToken });
  }),
);

router.post(
  '/employee/login',
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw badRequest('email and password are required');

    const [employee] = await query('SELECT * FROM employees WHERE email = ?', [email]);
    if (
      !employee ||
      employee.status !== 'active' ||
      !employee.password_hash ||
      !(await verifyPassword(password, employee.password_hash))
    ) {
      throw unauthorized('Invalid credentials');
    }
    const { accessToken, refreshToken } = issueTokens({ sub: employee.id, type: 'employee', email: employee.email, name: employee.name });
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.json({ accessToken });
  }),
);

router.post(
  '/customer/register',
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password || password.length < 8) {
      throw badRequest('name, email and a password of at least 8 characters are required');
    }
    const [existing] = await query('SELECT id FROM customers WHERE email = ?', [email]);
    if (existing) throw conflict('Email already registered');

    const passwordHash = await hashPassword(password);
    const result = await query('INSERT INTO customers (name, email, phone, password_hash) VALUES (?, ?, ?, ?)', [
      name,
      email,
      phone || null,
      passwordHash,
    ]);
    const { accessToken, refreshToken } = issueTokens({ sub: result.insertId, type: 'customer', email });
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.json({ accessToken });
  }),
);

router.post(
  '/customer/login',
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw badRequest('email and password are required');

    const [customer] = await query('SELECT * FROM customers WHERE email = ?', [email]);
    if (!customer || !customer.password_hash || !(await verifyPassword(password, customer.password_hash))) {
      throw unauthorized('Invalid credentials');
    }
    const { accessToken, refreshToken } = issueTokens({ sub: customer.id, type: 'customer', email: customer.email });
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.json({ accessToken });
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('No refresh token');

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw unauthorized('Invalid refresh token');
    }

    let user;
    if (payload.type === 'admin') {
      const [admin] = await query('SELECT * FROM admins WHERE id = ?', [payload.sub]);
      if (!admin || !admin.is_active) throw unauthorized('Account disabled');
      user = { sub: admin.id, type: 'admin', role: admin.role, email: admin.email };
    } else if (payload.type === 'employee') {
      const [employee] = await query('SELECT * FROM employees WHERE id = ?', [payload.sub]);
      if (!employee || employee.status !== 'active' || !employee.password_hash) throw unauthorized('Account disabled');
      user = { sub: employee.id, type: 'employee', email: employee.email, name: employee.name };
    } else {
      const [customer] = await query('SELECT * FROM customers WHERE id = ?', [payload.sub]);
      if (!customer) throw unauthorized('Account not found');
      user = { sub: customer.id, type: 'customer', email: customer.email };
    }

    const { accessToken, refreshToken } = issueTokens(user);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.json({ accessToken });
  }),
);

router.post('/logout', (req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({ success: true });
});

module.exports = router;
