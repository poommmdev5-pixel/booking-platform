const { Router } = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { hashPassword } = require('../utils/password');
const { processEmployeeImage } = require('../utils/imageUpload');
const { badRequest, notFound } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../utils/audit');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const MAX_IMAGES_PER_EMPLOYEE = 5;

router.use(authenticate, requireAdmin);

async function loadImagesByEmployee(employeeIds) {
  if (employeeIds.length === 0) return new Map();
  const images = await query('SELECT * FROM employee_images WHERE employee_id IN (?) ORDER BY sort_order', [employeeIds]);
  const map = new Map();
  for (const img of images) {
    if (!map.has(img.employee_id)) map.set(img.employee_id, []);
    map.get(img.employee_id).push({
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

function toPublicShape(employee, imagesForEmployee) {
  const images = imagesForEmployee || [];
  return {
    id: employee.id,
    code: employee.code,
    name: employee.name,
    position: employee.position || '',
    phone: employee.phone || '',
    email: employee.email || '',
    status: employee.status,
    hasLogin: !!employee.password_hash,
    images,
    coverImage: images.find((i) => i.isCover) || images[0] || null,
  };
}

router.get(
  '/admin/all',
  asyncHandler(async (req, res) => {
    const employees = await query('SELECT * FROM employees ORDER BY created_at DESC');
    const ids = employees.map((e) => e.id);
    const imagesMap = await loadImagesByEmployee(ids);
    res.json(employees.map((e) => toPublicShape(e, imagesMap.get(e.id))));
  }),
);

router.get(
  '/admin/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [employee] = await query('SELECT * FROM employees WHERE id = ?', [id]);
    if (!employee) throw notFound('Employee not found');
    const images = (await loadImagesByEmployee([id])).get(id) || [];
    res.json(toPublicShape(employee, images));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.name) throw badRequest('name is required');
    const code = `EMP-${randomUUID()}`;

    const result = await query('INSERT INTO employees (code, name, position, phone, email, created_by) VALUES (?, ?, ?, ?, ?, ?)', [
      code,
      body.name,
      body.position || null,
      body.phone || null,
      body.email || null,
      req.user.sub,
    ]);
    const employeeId = result.insertId;
    await recordAudit(req.user.sub, 'create', 'employee', employeeId);

    const [row] = await query('SELECT * FROM employees WHERE id = ?', [employeeId]);
    res.status(201).json(toPublicShape(row, []));
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body;
    if (!body.name) throw badRequest('name is required');

    const [existing] = await query('SELECT id FROM employees WHERE id = ?', [id]);
    if (!existing) throw notFound('Employee not found');

    // code is server-generated and immutable: never overwritten from the request body.
    await query('UPDATE employees SET name = ?, position = ?, phone = ?, email = ? WHERE id = ?', [
      body.name,
      body.position || null,
      body.phone || null,
      body.email || null,
      id,
    ]);
    await recordAudit(req.user.sub, 'update', 'employee', id);

    const [row] = await query('SELECT * FROM employees WHERE id = ?', [id]);
    const images = (await loadImagesByEmployee([id])).get(id) || [];
    res.json(toPublicShape(row, images));
  }),
);

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!['active', 'inactive'].includes(req.body.status)) throw badRequest('Invalid status');
    const [existing] = await query('SELECT id FROM employees WHERE id = ?', [id]);
    if (!existing) throw notFound('Employee not found');

    await query('UPDATE employees SET status = ? WHERE id = ?', [req.body.status, id]);
    await recordAudit(req.user.sub, 'status_change', 'employee', id, req.body.status);
    const [row] = await query('SELECT * FROM employees WHERE id = ?', [id]);
    res.json(toPublicShape(row, []));
  }),
);

router.patch(
  '/:id/credentials',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [employee] = await query('SELECT id, email FROM employees WHERE id = ?', [id]);
    if (!employee) throw notFound('Employee not found');
    if (!employee.email) throw badRequest('Employee must have an email before creating a login');
    const { password } = req.body;
    if (!password || password.length < 8) throw badRequest('password must be at least 8 characters');

    const passwordHash = await hashPassword(password);
    await query('UPDATE employees SET password_hash = ? WHERE id = ?', [passwordHash, id]);
    await recordAudit(req.user.sub, 'update', 'employee', id, 'set_login');
    res.json({ success: true, hasLogin: true });
  }),
);

router.delete(
  '/:id/credentials',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [existing] = await query('SELECT id FROM employees WHERE id = ?', [id]);
    if (!existing) throw notFound('Employee not found');

    await query('UPDATE employees SET password_hash = NULL WHERE id = ?', [id]);
    await recordAudit(req.user.sub, 'update', 'employee', id, 'revoke_login');
    res.json({ success: true, hasLogin: false });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [existing] = await query('SELECT id FROM employees WHERE id = ?', [id]);
    if (!existing) throw notFound('Employee not found');
    await query('DELETE FROM employees WHERE id = ?', [id]);
    await recordAudit(req.user.sub, 'delete', 'employee', id);
    res.json({ success: true });
  }),
);

router.post(
  '/:id/images',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [employee] = await query('SELECT id FROM employees WHERE id = ?', [id]);
    if (!employee) throw notFound('Employee not found');
    if (!req.file) throw badRequest('file is required');

    const [{ count }] = await query('SELECT COUNT(*) AS count FROM employee_images WHERE employee_id = ?', [id]);
    if (count >= MAX_IMAGES_PER_EMPLOYEE) throw badRequest(`Maximum ${MAX_IMAGES_PER_EMPLOYEE} images per employee`);

    const processed = await processEmployeeImage(id, req.file.buffer);
    const result = await query(
      'INSERT INTO employee_images (employee_id, url_thumbnail, url_medium, url_original, is_cover, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
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
  asyncHandler(async (req, res) => {
    await query('DELETE FROM employee_images WHERE id = ? AND employee_id = ?', [req.params.imageId, req.params.id]);
    res.json({ success: true });
  }),
);

router.patch(
  '/:id/images/:imageId/cover',
  asyncHandler(async (req, res) => {
    await withTransaction(async (cx) => {
      await cx.query('UPDATE employee_images SET is_cover = 0 WHERE employee_id = ?', [req.params.id]);
      await cx.query('UPDATE employee_images SET is_cover = 1 WHERE id = ? AND employee_id = ?', [req.params.imageId, req.params.id]);
    });
    res.json({ success: true });
  }),
);

module.exports = router;
