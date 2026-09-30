const { Router } = require('express');
const { query, withTransaction } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { localeFromRequest, pickTranslation } = require('../utils/i18n');
const { badRequest, notFound, conflict } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

function assertHasThai(translations) {
  if (!Array.isArray(translations) || !translations.some((t) => t.locale === 'th' && t.name)) {
    throw badRequest('Thai (th) translation is required');
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const locale = localeFromRequest(req);
    const categories = await query('SELECT * FROM categories ORDER BY id');
    const translations = await query('SELECT * FROM category_translations');
    const byCategory = new Map();
    for (const t of translations) {
      if (!byCategory.has(t.category_id)) byCategory.set(t.category_id, []);
      byCategory.get(t.category_id).push(t);
    }
    res.json(
      categories.map((c) => ({
        id: c.id,
        code: c.code,
        bookingType: c.booking_type,
        name: pickTranslation(byCategory.get(c.id) || [], locale)?.name || c.code,
      })),
    );
  }),
);

router.get(
  '/admin/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [category] = await query('SELECT * FROM categories WHERE id = ?', [id]);
    if (!category) throw notFound('Category not found');
    const translations = await query('SELECT locale, name FROM category_translations WHERE category_id = ?', [id]);
    res.json({ id: category.id, code: category.code, bookingType: category.booking_type, translations });
  }),
);

router.post(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { code, bookingType, translations } = req.body;
    if (!code || !['stay', 'session', 'stay_session'].includes(bookingType)) throw badRequest('code and a valid bookingType are required');
    assertHasThai(translations);

    const category = await withTransaction(async (cx) => {
      const [result] = await cx.query('INSERT INTO categories (code, booking_type) VALUES (?, ?)', [code, bookingType]);
      for (const t of translations) {
        await cx.query('INSERT INTO category_translations (category_id, locale, name) VALUES (?, ?, ?)', [
          result.insertId,
          t.locale,
          t.name,
        ]);
      }
      return { id: result.insertId, code, bookingType, translations };
    });
    res.status(201).json(category);
  }),
);

router.put(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { code, bookingType, translations } = req.body;
    if (!code || !['stay', 'session', 'stay_session'].includes(bookingType)) throw badRequest('code and a valid bookingType are required');
    assertHasThai(translations);

    const [existing] = await query('SELECT id FROM categories WHERE id = ?', [id]);
    if (!existing) throw notFound('Category not found');

    await withTransaction(async (cx) => {
      await cx.query('UPDATE categories SET code = ?, booking_type = ? WHERE id = ?', [code, bookingType, id]);
      for (const t of translations) {
        await cx.query(
          'INSERT INTO category_translations (category_id, locale, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
          [id, t.locale, t.name],
        );
      }
    });
    res.json({ id, code, bookingType, translations });
  }),
);

router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [existing] = await query('SELECT id FROM categories WHERE id = ?', [id]);
    if (!existing) throw notFound('Category not found');

    const [{ count }] = await query('SELECT COUNT(*) AS count FROM products WHERE category_id = ?', [id]);
    if (count > 0) throw conflict('Cannot delete a category that still has products assigned to it');

    await query('DELETE FROM categories WHERE id = ?', [id]);
    res.json({ success: true });
  }),
);

module.exports = router;
