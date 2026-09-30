const { query } = require('./db');
const { hashPassword } = require('./utils/password');
const config = require('./config');

// Idempotent: safe to run on every backend startup.
async function ensureSeedData() {
  const { name, email, password } = config.seedSuperAdmin;
  const existing = await query('SELECT id FROM admins WHERE email = ?', [email]);
  if (existing.length === 0) {
    const passwordHash = await hashPassword(password);
    await query('INSERT INTO admins (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)', [
      name,
      email,
      passwordHash,
      'SUPER_ADMIN',
    ]);
    console.log(`Seeded Super Admin: ${email}`);
  }

  await query(
    'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE `key` = `key`',
    [
      'business_info',
      JSON.stringify({ name: 'My Business', address: '', phone: '', defaultOpenTime: '09:00', defaultCloseTime: '18:00' }),
    ],
  );
  await query(
    'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE `key` = `key`',
    ['booking_policy', JSON.stringify({ autoConfirm: true, cancellationHoursBefore: 24 })],
  );
}

module.exports = { ensureSeedData };
