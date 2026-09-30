const { Router } = require('express');
const multer = require('multer');
const { query, withTransaction } = require('../db');
const { authenticate, requireEmployee } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../utils/password');
const { processEmployeeImage } = require('../utils/imageUpload');
const { localeFromRequest, pickTranslation } = require('../utils/i18n');
const { todayStr } = require('../utils/businessTime');
const { badRequest, unauthorized, notFound } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const MAX_IMAGES_PER_EMPLOYEE = 5;
const ACTIVE_STATUSES = ['pending', 'confirmed', 'completed'];

router.use(authenticate, requireEmployee);

async function loadOwnImages(employeeId) {
  const images = await query('SELECT * FROM employee_images WHERE employee_id = ? ORDER BY sort_order', [employeeId]);
  return images.map((img) => ({
    id: img.id,
    urlThumbnail: img.url_thumbnail,
    urlMedium: img.url_medium,
    urlOriginal: img.url_original,
    isCover: !!img.is_cover,
    sortOrder: img.sort_order,
  }));
}

function toProfileShape(employee, images) {
  return {
    id: employee.id,
    code: employee.code,
    name: employee.name,
    position: employee.position || '',
    phone: employee.phone || '',
    email: employee.email || '',
    images: images || [],
    coverImage: (images || []).find((i) => i.isCover) || (images || [])[0] || null,
  };
}

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const [employee] = await query('SELECT * FROM employees WHERE id = ?', [req.user.sub]);
    if (!employee) throw notFound('Employee not found');
    const images = await loadOwnImages(req.user.sub);
    res.json(toProfileShape(employee, images));
  }),
);

router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const [employee] = await query('SELECT * FROM employees WHERE id = ?', [req.user.sub]);
    if (!employee) throw notFound('Employee not found');

    const { name, phone, email, currentPassword, newPassword } = req.body;
    if (name !== undefined && !name.trim()) throw badRequest('name is required');

    if (newPassword !== undefined) {
      if (!currentPassword || !(await verifyPassword(currentPassword, employee.password_hash))) {
        throw unauthorized('Current password is incorrect');
      }
      if (newPassword.length < 8) throw badRequest('newPassword must be at least 8 characters');
    }

    const fields = [];
    const values = [];
    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name.trim());
    }
    if (phone !== undefined) {
      fields.push('phone = ?');
      values.push(phone || null);
    }
    if (email !== undefined) {
      if (!email.trim()) throw badRequest('email is required');
      fields.push('email = ?');
      values.push(email.trim());
    }
    if (newPassword !== undefined) {
      fields.push('password_hash = ?');
      values.push(await hashPassword(newPassword));
    }
    if (fields.length > 0) {
      values.push(req.user.sub);
      await query(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const [updated] = await query('SELECT * FROM employees WHERE id = ?', [req.user.sub]);
    const images = await loadOwnImages(req.user.sub);
    res.json(toProfileShape(updated, images));
  }),
);

router.post(
  '/me/images',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('file is required');

    const [{ count }] = await query('SELECT COUNT(*) AS count FROM employee_images WHERE employee_id = ?', [req.user.sub]);
    if (count >= MAX_IMAGES_PER_EMPLOYEE) throw badRequest(`Maximum ${MAX_IMAGES_PER_EMPLOYEE} images per employee`);

    const processed = await processEmployeeImage(req.user.sub, req.file.buffer);
    const result = await query(
      'INSERT INTO employee_images (employee_id, url_thumbnail, url_medium, url_original, is_cover, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.sub, processed.urlThumbnail, processed.urlMedium, processed.urlOriginal, count === 0 ? 1 : 0, count],
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
  '/me/images/:imageId',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM employee_images WHERE id = ? AND employee_id = ?', [req.params.imageId, req.user.sub]);
    res.json({ success: true });
  }),
);

router.patch(
  '/me/images/:imageId/cover',
  asyncHandler(async (req, res) => {
    await withTransaction(async (cx) => {
      await cx.query('UPDATE employee_images SET is_cover = 0 WHERE employee_id = ?', [req.user.sub]);
      await cx.query('UPDATE employee_images SET is_cover = 1 WHERE id = ? AND employee_id = ?', [req.params.imageId, req.user.sub]);
    });
    res.json({ success: true });
  }),
);

router.get(
  '/me/schedule',
  asyncHandler(async (req, res) => {
    const date = req.query.date || todayStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('date (YYYY-MM-DD) is invalid');
    const locale = localeFromRequest(req);

    const rows = await query(
      `SELECT b.id, b.reference, b.booking_type, b.date_start, b.date_end, b.time_start, b.time_end,
              b.guest_name, b.guests, b.status, b.note, b.product_id
       FROM bookings b
       WHERE b.employee_id = ? AND b.status IN (?)
         AND b.date_start <= ? AND COALESCE(b.date_end, DATE_ADD(b.date_start, INTERVAL 1 DAY)) > ?
       ORDER BY (b.time_start IS NULL) DESC, b.time_start ASC`,
      [req.user.sub, ACTIVE_STATUSES, date, date],
    );

    const productIds = [...new Set(rows.map((r) => r.product_id))];
    const translations = productIds.length > 0
      ? await query('SELECT product_id, locale, name FROM product_translations WHERE product_id IN (?)', [productIds])
      : [];
    const translationsByProduct = new Map();
    for (const t of translations) {
      if (!translationsByProduct.has(t.product_id)) translationsByProduct.set(t.product_id, []);
      translationsByProduct.get(t.product_id).push(t);
    }

    res.json({
      date,
      items: rows.map((r) => {
        const productName = pickTranslation(translationsByProduct.get(r.product_id) || [], locale)?.name || '';
        return {
          id: r.id,
          reference: r.reference,
          bookingType: r.booking_type,
          productName,
          timeStart: r.time_start,
          timeEnd: r.time_end,
          allDay: !r.time_start,
          guestName: r.guest_name,
          guests: r.guests,
          status: r.status,
          note: r.note || '',
        };
      }),
    });
  }),
);

module.exports = router;
