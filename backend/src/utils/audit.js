const { query } = require('../db');

function recordAudit(adminId, action, entity, entityId, detail) {
  return query('INSERT INTO audit_logs (admin_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)', [
    adminId,
    action,
    entity,
    entityId ?? null,
    detail ?? null,
  ]);
}

module.exports = { recordAudit };
