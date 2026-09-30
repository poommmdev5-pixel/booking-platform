const { Router } = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { localeFromRequest, pickTranslation } = require('../utils/i18n');
const { processExtraImage } = require('../utils/imageUpload');
const { badRequest, notFound } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../utils/audit');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const MAX_IMAGES_PER_EXTRA = 5;

async function loadImagesByExtra(extraIds) {
  if (extraIds.length === 0) return new Map();
  const images = await query('SELECT * FROM extra_images WHERE extra_id IN (?) ORDER BY sort_order', [extraIds]);
  const map = new Map();
  for (const img of images) {
    if (!map.has(img.extra_id)) map.set(img.extra_id, []);
    map.get(img.extra_id).push({
      id: img.id,
      urlThumbnail: img.url_thumbnail,
      urlMedium: img.url_medium,
      urlOriginal: img.url_original,
      isCover: !!img.is_cover,
      sortOrder: img.sort_order,
    });
  }
  return map;
}

async function loadTranslationsByExtra(extraIds) {
  if (extraIds.length === 0) return new Map();
  const rows = await query('SELECT * FROM extra_translations WHERE extra_id IN (?)', [extraIds]);
  const map = new Map();
  for (const t of rows) {
    if (!map.has(t.extra_id)) map.set(t.extra_id, []);
    map.get(t.extra_id).push(t);
  }
  return map;
}

function toPublicShape(extra, translationsForExtra, imagesForExtra, locale) {
  const translation = pickTranslation(translationsForExtra || [], locale);
  const images = imagesForExtra || [];
  return {
    id: extra.id,
    code: extra.code,
    price: Number(extra.price),
    status: extra.status,
    name: translation?.name || extra.code,
    description: translation?.description || '',
    images,
    coverImage: images.find((i) => i.isCover) || images[0] || null,
  };
}

function assertHasThai(translations) {
  if (!Array.isArray(translations) || !translations.some((t) => t.locale === 'th' && t.name)) {
    throw badRequest('Thai (th) translation is required');
  }
}

// Used by products.js to attach each product's active extras to its public/admin shape.
async function loadExtraSummariesForProducts(productIds, locale) {
  if (productIds.length === 0) return new Map();
  const rows = await query(
    `SELECT pe.product_id, e.* FROM product_extras pe
     JOIN extras e ON e.id = pe.extra_id
     WHERE pe.product_id IN (?) AND e.status = 'active'`,
    [productIds],
  );
  const extraIds = rows.map((r) => r.id);
  const [translationsMap, imagesMap] = await Promise.all([loadTranslationsByExtra(extraIds), loadImagesByExtra(extraIds)]);
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.product_id)) map.set(row.product_id, []);
    map.get(row.product_id).push(toPublicShape(row, translationsMap.get(row.id), imagesMap.get(row.id), locale));
  }
  return map;
}

async function setProductExtras(cx, productId, extraIds) {
  await cx.query('DELETE FROM product_extras WHERE product_id = ?', [productId]);
  if (Array.isArray(extraIds) && extraIds.length > 0) {
    for (const extraId of extraIds) {
      await cx.query('INSERT INTO product_extras (product_id, extra_id) VALUES (?, ?)', [productId, Number(extraId)]);
    }
  }
}

router.get(
  '/admin/all',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const extras = await query('SELECT * FROM extras ORDER BY created_at DESC');
    const ids = extras.map((e) => e.id);
    const [translationsMap, imagesMap] = await Promise.all([loadTranslationsByExtra(ids), loadImagesByExtra(ids)]);
    res.json(extras.map((e) => toPublicShape(e, translationsMap.get(e.id), imagesMap.get(e.id), 'th')));
  }),
);

router.get(
  '/admin/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [extra] = await query('SELECT * FROM extras WHERE id = ?', [id]);
    if (!extra) throw notFound('Extra not found');
    const translations = await query('SELECT * FROM extra_translations WHERE extra_id = ?', [id]);
    const images = (await loadImagesByExtra([id])).get(id) || [];
    res.json({
      ...toPublicShape(extra, translations, images, 'th'),
      translations: translations.map((t) => ({ locale: t.locale, name: t.name, description: t.description })),
    });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const locale = localeFromRequest(req);
    const extras = await query("SELECT * FROM extras WHERE status = 'active' ORDER BY created_at DESC");
    const ids = extras.map((e) => e.id);
    const [translationsMap, imagesMap] = await Promise.all([loadTranslationsByExtra(ids), loadImagesByExtra(ids)]);
    res.json(extras.map((e) => toPublicShape(e, translationsMap.get(e.id), imagesMap.get(e.id), locale)));
  }),
);

router.post(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (body.price === undefined || body.price === null || body.price === '') throw badRequest('price is required');
    assertHasThai(body.translations);
    const code = `EXT-${randomUUID()}`;

    const extraId = await withTransaction(async (cx) => {
      const [result] = await cx.query('INSERT INTO extras (code, price, created_by) VALUES (?, ?, ?)', [
        code,
        body.price,
        req.user.sub,
      ]);
      for (const t of body.translations) {
        await cx.query('INSERT INTO extra_translations (extra_id, locale, name, description) VALUES (?, ?, ?, ?)', [
          result.insertId,
          t.locale,
          t.name,
          t.description || null,
        ]);
      }
      return result.insertId;
    });
    await recordAudit(req.user.sub, 'create', 'extra', extraId);

    const [row] = await query('SELECT * FROM extras WHERE id = ?', [extraId]);
    const translations = await query('SELECT * FROM extra_translations WHERE extra_id = ?', [extraId]);
    res.status(201).json(toPublicShape(row, translations, [], 'th'));
  }),
);

router.put(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body;
    if (body.price === undefined || body.price === null || body.price === '') throw badRequest('price is required');
    assertHasThai(body.translations);

    const [existing] = await query('SELECT id FROM extras WHERE id = ?', [id]);
    if (!existing) throw notFound('Extra not found');

    await withTransaction(async (cx) => {
      // code is server-generated and immutable: never overwritten from the request body.
      await cx.query('UPDATE extras SET price = ? WHERE id = ?', [body.price, id]);
      for (const t of body.translations) {
        await cx.query(
          `INSERT INTO extra_translations (extra_id, locale, name, description) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)`,
          [id, t.locale, t.name, t.description || null],
        );
      }
    });
    await recordAudit(req.user.sub, 'update', 'extra', id);

    const [row] = await query('SELECT * FROM extras WHERE id = ?', [id]);
    const translations = await query('SELECT * FROM extra_translations WHERE extra_id = ?', [id]);
    const images = (await loadImagesByExtra([id])).get(id) || [];
    res.json(toPublicShape(row, translations, images, 'th'));
  }),
);

router.patch(
  '/:id/status',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!['active', 'inactive'].includes(req.body.status)) throw badRequest('Invalid status');
    const [existing] = await query('SELECT id FROM extras WHERE id = ?', [id]);
    if (!existing) throw notFound('Extra not found');

    await query('UPDATE extras SET status = ? WHERE id = ?', [req.body.status, id]);
    await recordAudit(req.user.sub, 'status_change', 'extra', id, req.body.status);
    const [row] = await query('SELECT * FROM extras WHERE id = ?', [id]);
    res.json(toPublicShape(row, [], [], 'th'));
  }),
);

router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [existing] = await query('SELECT id FROM extras WHERE id = ?', [id]);
    if (!existing) throw notFound('Extra not found');
    await query('DELETE FROM extras WHERE id = ?', [id]);
    await recordAudit(req.user.sub, 'delete', 'extra', id);
    res.json({ success: true });
  }),
);

router.post(
  '/:id/images',
  authenticate,
  requireAdmin,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [extra] = await query('SELECT id FROM extras WHERE id = ?', [id]);
    if (!extra) throw notFound('Extra not found');
    if (!req.file) throw badRequest('file is required');

    const [{ count }] = await query('SELECT COUNT(*) AS count FROM extra_images WHERE extra_id = ?', [id]);
    if (count >= MAX_IMAGES_PER_EXTRA) throw badRequest(`Maximum ${MAX_IMAGES_PER_EXTRA} images per extra`);

    const processed = await processExtraImage(id, req.file.buffer);
    const result = await query(
      'INSERT INTO extra_images (extra_id, url_thumbnail, url_medium, url_original, is_cover, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [id, processed.urlThumbnail, processed.urlMedium, processed.urlOriginal, count === 0 ? 1 : 0, count],
    );
    res.status(201).json({
      id: result.insertId,
      ...processed,
      isCover: count === 0,
      sortOrder: count,
    });
  }),
);

router.delete(
  '/:id/images/:imageId',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await query('DELETE FROM extra_images WHERE id = ? AND extra_id = ?', [req.params.imageId, req.params.id]);
    res.json({ success: true });
  }),
);

router.patch(
  '/:id/images/:imageId/cover',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await withTransaction(async (cx) => {
      await cx.query('UPDATE extra_images SET is_cover = 0 WHERE extra_id = ?', [req.params.id]);
      await cx.query('UPDATE extra_images SET is_cover = 1 WHERE id = ? AND extra_id = ?', [req.params.imageId, req.params.id]);
    });
    res.json({ success: true });
  }),
);

module.exports = router;
module.exports.loadExtraSummariesForProducts = loadExtraSummariesForProducts;
module.exports.setProductExtras = setProductExtras;
