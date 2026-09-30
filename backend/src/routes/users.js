const { Router } = require('express');
const { query } = require('../db');
const { hashPassword } = require('../utils/password');
const { authenticate, requireAdmin, requireRole } = require('../middleware/auth');
const { badRequest, notFound } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../utils/audit');

const router = Router();

// Only Super Admin manages other admin accounts — there is no public admin registration endpoint.
router.use(authenticate, requireAdmin, requireRole('SUPER_ADMIN'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const admins = await query('SELECT id, name, email, role, is_active AS isActive, created_at AS createdAt FROM admins ORDER BY created_at DESC');
    res.json(admins);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || password.length < 8 || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw badRequest('name, email, password (min 8 chars) and a valid role are required');
    }
    const passwordHash = await hashPassword(password);
    const result = await query('INSERT INTO admins (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
      name,
      email,
      passwordHash,
      role,
    ]);
    await recordAudit(req.user.sub, 'create', 'admin', result.insertId);
    res.status(201).json({ id: result.insertId, name, email, role, isActive: true });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [admin] = await query('SELECT id FROM admins WHERE id = ?', [id]);
    if (!admin) throw notFound('Admin not found');

    const fields = [];
    const values = [];
    if (req.body.name !== undefined) {
      fields.push('name = ?');
      values.push(req.body.name);
    }
    if (req.body.role !== undefined) {
      fields.push('role = ?');
      values.push(req.body.role);
    }
    if (req.body.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(req.body.isActive ? 1 : 0);
    }
    if (fields.length > 0) {
      values.push(id);
      await query(`UPDATE admins SET ${fields.join(', ')} WHERE id = ?`, values);
    }
    await recordAudit(req.user.sub, 'update', 'admin', id);

    const [updated] = await query(
      'SELECT id, name, email, role, is_active AS isActive FROM admins WHERE id = ?',
      [id],
    );
    res.json(updated);
  }),
);

module.exports = router;
