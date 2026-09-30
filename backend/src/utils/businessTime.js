// "Today"/"now" for booking-gating must reflect the business's own timezone (Thailand,
// UTC+7), never the server host's — the backend container runs as UTC, so plain
// `new Date().toISOString()` lags a full calendar day behind the real Thailand date for
// the first 7 hours of every local day, letting customers see/book already-past slots.
const BUSINESS_TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

function nowInBusinessTz() {
  return new Date(Date.now() + BUSINESS_TZ_OFFSET_MS);
}

function todayStr() {
  return nowInBusinessTz().toISOString().slice(0, 10);
}

function nowTimeStr() {
  return nowInBusinessTz().toISOString().slice(11, 16);
}

module.exports = { nowInBusinessTz, todayStr, nowTimeStr };
