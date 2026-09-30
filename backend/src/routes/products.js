const { Router } = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { localeFromRequest, pickTranslation } = require('../utils/i18n');
const { processProductImage } = require('../utils/imageUpload');
const { badRequest, notFound } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../utils/audit');
const { loadExtraSummariesForProducts, setProductExtras } = require('./extras');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const MAX_IMAGES_PER_PRODUCT = 5;

async function loadImagesByProduct(productIds) {
  if (productIds.length === 0) return new Map();
  const images = await query(
    `SELECT * FROM product_images WHERE product_id IN (?) ORDER BY sort_order`,
    [productIds],
  );
  const map = new Map();
  for (const img of images) {
    if (!map.has(img.product_id)) map.set(img.product_id, []);
    map.get(img.product_id).push({
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

async function loadTranslationsByProduct(productIds) {
  if (productIds.length === 0) return new Map();
  const rows = await query('SELECT * FROM product_translations WHERE product_id IN (?)', [productIds]);
  const map = new Map();
  for (const t of rows) {
    if (!map.has(t.product_id)) map.set(t.product_id, []);
    map.get(t.product_id).push(t);
  }
  return map;
}

async function loadPriceTiersByProduct(productIds) {
  if (productIds.length === 0) return new Map();
  const rows = await query('SELECT * FROM product_price_tiers WHERE product_id IN (?) ORDER BY sort_order', [productIds]);
  const map = new Map();
  for (const t of rows) {
    if (!map.has(t.product_id)) map.set(t.product_id, []);
    map.get(t.product_id).push({ id: t.id, label: t.label, minutes: t.minutes, price: Number(t.price), unitLimit: t.unit_limit });
  }
  return map;
}

// Label meaning depends on bookingType (see product_price_tiers comment in the schema):
// 'stay' always stores a fixed placeholder (the client always shows a translated "1
// night" string instead); 'stay_session' stores a plain fallback derived from minutes
// (the client formats `minutes` into the viewer's locale instead); 'session' keeps the
// admin's own free-text label untouched.
async function setPriceTiers(cx, productId, tiers, bookingType) {
  await cx.query('DELETE FROM product_price_tiers WHERE product_id = ?', [productId]);
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    const minutes = bookingType === 'stay_session' ? Number(tier.minutes) : null;
    const label = bookingType === 'stay' ? '1 night' : bookingType === 'stay_session' ? `${minutes} min` : tier.label.trim();
    const unitLimit = bookingType === 'session' ? Number(tier.unitLimit) : null;
    await cx.query('INSERT INTO product_price_tiers (product_id, label, minutes, price, unit_limit, sort_order) VALUES (?, ?, ?, ?, ?, ?)', [
      productId,
      label,
      minutes,
      tier.price,
      unitLimit,
      index,
    ]);
  }
}

function toPublicShape(product, translationsForProduct, imagesForProduct, locale, extrasForProduct, priceTiersForProduct) {
  const translation = pickTranslation(translationsForProduct || [], locale);
  const images = imagesForProduct || [];
  const priceTiers = priceTiersForProduct || [];
  return {
    id: product.id,
    code: product.code,
    categoryId: product.category_id,
    bookingType: product.booking_type,
    priceTiers,
    startingPrice: priceTiers.length > 0 ? Math.min(...priceTiers.map((t) => t.price)) : null,
    capacity: product.capacity,
    minStayNights: product.min_stay_nights,
    maxGuests: product.max_guests,
    location: product.location,
    status: product.status,
    name: translation?.name || product.code,
    description: translation?.description || '',
    tags: translation?.tags || '',
    images,
    coverImage: images.find((i) => i.isCover) || images[0] || null,
    extras: extrasForProduct || [],
  };
}

const MAX_GUESTS_LIMIT = 8;

function validateByBookingType(body) {
  if (body.bookingType === 'stay' && !body.capacity) {
    throw badRequest('capacity is required for stay-type products');
  }
}

function assertHasThai(translations) {
  if (!Array.isArray(translations) || !translations.some((t) => t.locale === 'th' && t.name)) {
    throw badRequest('Thai (th) translation is required');
  }
}

// 'stay' is always priced as a single flat nightly rate (no admin-facing label — the
// client always shows a fixed, locale-translated "1 night"); 'session' keeps free-text
// labels; 'stay_session' is priced per a duration in minutes instead of a label, which
// the client formats into an appropriate time unit (e.g. 90 -> "1h 30m").
function assertValidPriceTiers(priceTiers, bookingType) {
  if (!Array.isArray(priceTiers) || priceTiers.length === 0) {
    throw badRequest('At least one price tier is required');
  }
  if (bookingType === 'stay' && priceTiers.length > 1) {
    throw badRequest('Stay-type products can only have a single nightly price');
  }
  for (const tier of priceTiers) {
    if (tier.price === undefined || tier.price === null || Number(tier.price) <= 0) {
      throw badRequest('Each price tier needs a price greater than 0');
    }
    if (bookingType === 'stay_session') {
      if (!Number.isInteger(Number(tier.minutes)) || Number(tier.minutes) <= 0) {
        throw badRequest('Each price tier needs a duration in minutes greater than 0');
      }
    } else if (bookingType === 'session') {
      if (!tier.label || !tier.label.trim()) throw badRequest('Each price tier needs a label');
      if (!Number.isInteger(Number(tier.unitLimit)) || Number(tier.unitLimit) <= 0) {
        throw badRequest('Each price tier needs a unit limit greater than 0');
      }
    }
  }
}

function assertValidMaxGuests(maxGuests) {
  if (maxGuests !== undefined && maxGuests !== null && Number(maxGuests) > MAX_GUESTS_LIMIT) {
    throw badRequest(`maxGuests cannot exceed ${MAX_GUESTS_LIMIT}`);
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const locale = localeFromRequest(req);
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const where = ['status = "active"', 'deleted_at IS NULL'];
    const params = [];
    if (req.query.categoryId) {
      where.push('category_id = ?');
      params.push(Number(req.query.categoryId));
    }
    if (req.query.bookingType) {
      where.push('booking_type = ?');
      params.push(req.query.bookingType);
    }
    if (req.query.search) {
      where.push(
        'id IN (SELECT product_id FROM product_translations WHERE name LIKE ?)',
      );
      params.push(`%${req.query.search}%`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM products ${whereSql}`, params);
    const products = await query(
      `SELECT * FROM products ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const ids = products.map((p) => p.id);
    const [translationsMap, imagesMap, extrasMap, priceTiersMap] = await Promise.all([
      loadTranslationsByProduct(ids),
      loadImagesByProduct(ids),
      loadExtraSummariesForProducts(ids, locale),
      loadPriceTiersByProduct(ids),
    ]);

    res.json({
      items: products.map((p) =>
        toPublicShape(p, translationsMap.get(p.id), imagesMap.get(p.id), locale, extrasMap.get(p.id), priceTiersMap.get(p.id)),
      ),
      total,
      page,
      pageSize,
    });
  }),
);

router.get(
  '/admin/all',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const products = await query('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY created_at DESC');
    const ids = products.map((p) => p.id);
    const [translationsMap, imagesMap, priceTiersMap] = await Promise.all([
      loadTranslationsByProduct(ids),
      loadImagesByProduct(ids),
      loadPriceTiersByProduct(ids),
    ]);
    res.json(
      products.map((p) => toPublicShape(p, translationsMap.get(p.id), imagesMap.get(p.id), 'th', null, priceTiersMap.get(p.id))),
    );
  }),
);

router.get(
  '/admin/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [product] = await query('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!product) throw notFound('Product not found');
    const translations = await query('SELECT * FROM product_translations WHERE product_id = ?', [id]);
    const images = (await loadImagesByProduct([id])).get(id) || [];
    const extras = (await loadExtraSummariesForProducts([id], 'th')).get(id) || [];
    const priceTiers = (await loadPriceTiersByProduct([id])).get(id) || [];
    res.json({
      ...toPublicShape(product, translations, images, 'th', extras, priceTiers),
      translations: translations.map((t) => ({ locale: t.locale, name: t.name, description: t.description, tags: t.tags })),
    });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const locale = localeFromRequest(req);
    const [product] = await query('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL AND status = "active"', [id]);
    if (!product) throw notFound('Product not found');
    const translations = await query('SELECT * FROM product_translations WHERE product_id = ?', [id]);
    const images = (await loadImagesByProduct([id])).get(id) || [];
    const extras = (await loadExtraSummariesForProducts([id], locale)).get(id) || [];
    const priceTiers = (await loadPriceTiersByProduct([id])).get(id) || [];
    res.json(toPublicShape(product, translations, images, locale, extras, priceTiers));
  }),
);

router.post(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.categoryId || !['stay', 'session', 'stay_session'].includes(body.bookingType)) {
      throw badRequest('categoryId and a valid bookingType are required');
    }
    validateByBookingType(body);
    assertHasThai(body.translations);
    assertValidPriceTiers(body.priceTiers, body.bookingType);
    assertValidMaxGuests(body.maxGuests);
    const code = `PRD-${randomUUID()}`;

    const product = await withTransaction(async (cx) => {
      const [result] = await cx.query(
        `INSERT INTO products
          (category_id, code, booking_type, capacity, min_stay_nights, max_guests, location, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          body.categoryId,
          code,
          body.bookingType,
          body.capacity || null,
          body.minStayNights || null,
          body.maxGuests || 1,
          body.location || null,
          req.user.sub,
        ],
      );
      for (const t of body.translations) {
        await cx.query('INSERT INTO product_translations (product_id, locale, name, description, tags) VALUES (?, ?, ?, ?, ?)', [
          result.insertId,
          t.locale,
          t.name,
          t.description || null,
          t.tags || null,
        ]);
      }
      await setProductExtras(cx, result.insertId, body.extraIds);
      await setPriceTiers(cx, result.insertId, body.priceTiers, body.bookingType);
      return result.insertId;
    });
    await recordAudit(req.user.sub, 'create', 'product', product);

    const [row] = await query('SELECT * FROM products WHERE id = ?', [product]);
    const translations = await query('SELECT * FROM product_translations WHERE product_id = ?', [product]);
    const extras = (await loadExtraSummariesForProducts([product], 'th')).get(product) || [];
    const priceTiers = (await loadPriceTiersByProduct([product])).get(product) || [];
    res.status(201).json(toPublicShape(row, translations, [], 'th', extras, priceTiers));
  }),
);

router.put(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body;
    if (!body.categoryId || !['stay', 'session', 'stay_session'].includes(body.bookingType)) {
      throw badRequest('categoryId and a valid bookingType are required');
    }
    validateByBookingType(body);
    assertHasThai(body.translations);
    assertValidPriceTiers(body.priceTiers, body.bookingType);
    assertValidMaxGuests(body.maxGuests);

    const [existing] = await query('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw notFound('Product not found');

    await withTransaction(async (cx) => {
      // code is server-generated and immutable: never overwritten from the request body.
      await cx.query(
        `UPDATE products SET category_id=?, booking_type=?,
          capacity=?, min_stay_nights=?, max_guests=?, location=? WHERE id=?`,
        [
          body.categoryId,
          body.bookingType,
          body.capacity || null,
          body.minStayNights || null,
          body.maxGuests || 1,
          body.location || null,
          id,
        ],
      );
      for (const t of body.translations) {
        await cx.query(
          `INSERT INTO product_translations (product_id, locale, name, description, tags) VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), tags = VALUES(tags)`,
          [id, t.locale, t.name, t.description || null, t.tags || null],
        );
      }
      await setProductExtras(cx, id, body.extraIds);
      await setPriceTiers(cx, id, body.priceTiers, body.bookingType);
    });
    await recordAudit(req.user.sub, 'update', 'product', id);

    const [row] = await query('SELECT * FROM products WHERE id = ?', [id]);
    const translations = await query('SELECT * FROM product_translations WHERE product_id = ?', [id]);
    const images = (await loadImagesByProduct([id])).get(id) || [];
    const extras = (await loadExtraSummariesForProducts([id], 'th')).get(id) || [];
    const priceTiers = (await loadPriceTiersByProduct([id])).get(id) || [];
    res.json(toPublicShape(row, translations, images, 'th', extras, priceTiers));
  }),
);

router.patch(
  '/:id/status',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!['active', 'inactive'].includes(req.body.status)) throw badRequest('Invalid status');
    const [existing] = await query('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw notFound('Product not found');

    await query('UPDATE products SET status = ? WHERE id = ?', [req.body.status, id]);
    await recordAudit(req.user.sub, 'status_change', 'product', id, req.body.status);
    const [row] = await query('SELECT * FROM products WHERE id = ?', [id]);
    res.json(toPublicShape(row, [], [], 'th'));
  }),
);

router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [existing] = await query('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw notFound('Product not found');
    await query('UPDATE products SET deleted_at = NOW(), status = "inactive" WHERE id = ?', [id]);
    await recordAudit(req.user.sub, 'delete', 'product', id);
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
    const [product] = await query('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!product) throw notFound('Product not found');
    if (!req.file) throw badRequest('file is required');

    const [{ count }] = await query('SELECT COUNT(*) AS count FROM product_images WHERE product_id = ?', [id]);
    if (count >= MAX_IMAGES_PER_PRODUCT) throw badRequest(`Maximum ${MAX_IMAGES_PER_PRODUCT} images per product`);

    const processed = await processProductImage(id, req.file.buffer);
    const result = await query(
      'INSERT INTO product_images (product_id, url_thumbnail, url_medium, url_original, is_cover, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
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
    await query('DELETE FROM product_images WHERE id = ? AND product_id = ?', [req.params.imageId, req.params.id]);
    res.json({ success: true });
  }),
);

router.patch(
  '/:id/images/:imageId/cover',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await withTransaction(async (cx) => {
      await cx.query('UPDATE product_images SET is_cover = 0 WHERE product_id = ?', [req.params.id]);
      await cx.query('UPDATE product_images SET is_cover = 1 WHERE id = ? AND product_id = ?', [req.params.imageId, req.params.id]);
    });
    res.json({ success: true });
  }),
);

module.exports = router;
