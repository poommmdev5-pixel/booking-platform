const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Runs `fn(connection)` inside a transaction, committing on success and rolling back
// on any thrown error. `connection.query` on this dedicated connection participates
// in the transaction, unlike the shared pool's `query()` above.
async function withTransaction(fn) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Same as withTransaction, but automatically retries on an InnoDB deadlock
// (ER_LOCK_DEADLOCK). Deadlocks aren't necessarily a bug on their own — MySQL expects
// applications to retry a transaction it chose to roll back to break a lock cycle — but
// they only make sense to retry for transactions whose FOR UPDATE scans can take gap
// locks on rows that don't exist yet (e.g. an overlap check before an INSERT), since
// those are the ones where two concurrent, non-conflicting writes can still deadlock
// each other. Plain row-locking transactions (e.g. booking creation's `SELECT ... FOR
// UPDATE` on an existing product row) don't have this failure mode and don't need it.
async function withTransactionRetry(fn, maxRetries = 8) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await withTransaction(fn);
    } catch (err) {
      if (err.code !== 'ER_LOCK_DEADLOCK' || attempt >= maxRetries) throw err;
      // A short, randomized pause before retrying — immediately retrying with no delay
      // tends to just re-collide with whichever other transaction it deadlocked against,
      // especially under many simultaneous requests hitting the same rows.
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 80));
    }
  }
}

module.exports = { pool, query, withTransaction, withTransactionRetry };
