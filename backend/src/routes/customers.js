const { Router } = require('express');
const { query } = require('../db');
const { authenticate, requireAdmin, requireCustomer } = require('../middleware/auth');
const { notFound } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// A logged-in customer's own profile — lets the booking flow pre-fill name/email/phone
// from the account instead of asking them to retype what they already gave us at
// registration. Mounted before the admin-only gate below since this one is self-service.
router.get(
  '/me',
  authenticate,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const [customer] = await query('SELECT id, name, email, phone FROM customers WHERE id = ?', [req.user.sub]);
    if (!customer) throw notFound('Customer not found');
    res.json(customer);
  }),
);

router.use(authenticate, requireAdmin);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const customers = await query(
      'SELECT id, name, email, phone, preferred_locale AS preferredLocale, created_at AS createdAt FROM customers ORDER BY created_at DESC',
    );
    res.json(customers);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [customer] = await query(
      'SELECT id, name, email, phone, preferred_locale AS preferredLocale, created_at AS createdAt FROM customers WHERE id = ?',
      [id],
    );
    if (!customer) throw notFound('Customer not found');

    const bookings = await query(
      `SELECT b.*, pt.name AS product_name FROM bookings b
       LEFT JOIN product_translations pt ON pt.product_id = b.product_id AND pt.locale = 'th'
       WHERE b.customer_id = ? ORDER BY b.created_at DESC`,
      [id],
    );
    res.json({
      ...customer,
      bookings: bookings.map((b) => ({
        id: b.id,
        reference: b.reference,
        productName: b.product_name,
        dateStart: b.date_start,
        status: b.status,
        totalPrice: Number(b.total_price),
      })),
    });
  }),
);

module.exports = router;
