const { Router } = require('express');
const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../db');
const { authenticate, optionalAuthenticate, requireAdmin, requireCustomer } = require('../middleware/auth');
const { badRequest, notFound, forbidden } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const {
  sendBookingNotifications,
  notifyStatusChanged,
  notifyRescheduled,
  notifyEmployeeReassigned,
  notifyChangeRequestSubmitted,
  notifyChangeRequestResolved,
} = require('../utils/mailer');
const { recordAudit } = require('../utils/audit');
const { todayStr, nowTimeStr } = require('../utils/businessTime');
const { localeFromRequest } = require('../utils/i18n');
const config = require('../config');

// When Stripe is configured, the client shows an online-payment step right after this
// booking is created, so notification emails wait for /payments/confirm to fire them once
// payment actually succeeds — otherwise a customer gets a "confirmed" email before paying.
// With no payment step (Stripe not configured), there's nothing to wait for.
const paymentsConfigured = () => Boolean(config.stripe.secretKey && config.stripe.publishableKey);

const router = Router();
const ACTIVE_STATUSES = ['pending', 'confirmed', 'completed'];

function generateReference() {
  const rand = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `BK-${datePart}-${rand}`;
}

function nightsBetween(startStr, endStr) {
  const start = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

// Returns null instead of rolling over into the next day — a stay_session appointment
// is confined to a single calendar day, so a duration that would cross midnight is
// simply rejected rather than silently splitting across two dates.
function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const BOOKING_POLICY_DEFAULTS = {
  autoConfirm: true,
  cancellationHoursBefore: 24,
  allowSelfCancel: true,
  allowSelfReschedule: true,
  rescheduleHoursBefore: 24,
  requireApprovalForCancel: false,
  requireApprovalForReschedule: false,
};

// A human-readable one-line summary of what a reschedule/cancel request is asking for —
// used only in notification emails (admin review email, customer ack) so nobody has to
// open the admin panel just to see roughly what's being requested.
function formatSlotLabel(dateStart, dateEnd, timeStart) {
  if (!dateStart) return '';
  let label = formatDate(dateStart);
  if (dateEnd) label += ` → ${formatDate(dateEnd)}`;
  if (timeStart) label += ` · ${timeStart}`;
  return label;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Force the Gregorian calendar — plain 'th-TH' renders พ.ศ. (Buddhist era, e.g. 2569),
  // which would read as wrong next to the Gregorian years used everywhere else this
  // string ends up (admin change-request list, notification emails). Mirrors the same
  // fix already applied to the frontend's own formatDate (frontend/src/i18n/index.js).
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

async function getBookingPolicy() {
  const [row] = await query('SELECT value FROM settings WHERE `key` = "booking_policy"');
  return row ? { ...BOOKING_POLICY_DEFAULTS, ...row.value } : BOOKING_POLICY_DEFAULTS;
}

// Validates a requested reschedule (capacity, staff on-duty/overlap, open months/holidays —
// the same rules booking creation enforces for the product's type) and returns the new
// schedule fields WITHOUT writing anything. Used two ways: (1) immediately, when no admin
// approval is required — the caller applies `update` itself right after; (2) once at
// request time (as a dry-run sanity check before queuing a booking_change_requests row)
// and again at approval time (to make sure the slot is STILL free — someone else may have
// taken it in the meantime) when approval is required. All queries run against `cx` inside
// the caller's transaction, `FOR UPDATE`-locking the same rows creation would.
async function computeRescheduleUpdate(cx, row, product, body) {
  const today = todayStr();
  const nowTime = nowTimeStr();

  if (product.booking_type === 'session') {
    if (!body.newSessionId) throw badRequest('newSessionId is required');
    const [[session]] = await cx.query('SELECT * FROM product_sessions WHERE id = ? AND product_id = ? FOR UPDATE', [
      body.newSessionId,
      product.id,
    ]);
    if (!session) throw notFound('Session not found');
    if (session.date < today || (session.date === today && session.start_time < nowTime)) {
      throw badRequest('Cannot reschedule to a session in the past');
    }

    const [staffedEmployees] = await cx.query('SELECT employee_id FROM session_employees WHERE session_id = ?', [session.id]);
    let employeeId = null;
    if (staffedEmployees.length > 0) {
      if (!body.newEmployeeId) throw badRequest('newEmployeeId is required for this session');
      if (!staffedEmployees.some((r) => r.employee_id === Number(body.newEmployeeId))) {
        throw badRequest('Selected employee is not assigned to this session');
      }
      employeeId = Number(body.newEmployeeId);
    }

    const items = await cx.query('SELECT price_tier_id, quantity FROM booking_items WHERE booking_id = ?', [row.id]);
    for (const item of items) {
      const [[tier]] = await cx.query('SELECT unit_limit, label FROM product_price_tiers WHERE id = ?', [item.price_tier_id]);
      if (!tier || tier.unit_limit == null) continue;
      const employeeScopeSql = employeeId != null ? 'b.employee_id = ?' : 'b.employee_id IS NULL';
      const employeeScopeParams = employeeId != null ? [employeeId] : [];
      const [[{ guestSum }]] = await cx.query(
        `SELECT COALESCE(SUM(bi.quantity), 0) AS guestSum FROM booking_items bi
         JOIN bookings b ON b.id = bi.booking_id
         WHERE b.session_id = ? AND ${employeeScopeSql} AND bi.price_tier_id = ? AND b.status IN (?) AND b.id != ?`,
        [session.id, ...employeeScopeParams, item.price_tier_id, ACTIVE_STATUSES, row.id],
      );
      const remaining = tier.unit_limit - guestSum;
      if (item.quantity > remaining) {
        throw badRequest(`Only ${Math.max(remaining, 0)} unit(s) left for "${tier.label}" in the new round`);
      }
    }

    if (employeeId != null) {
      const [[{ count: busyCount }]] = await cx.query(
        `SELECT COUNT(*) AS count FROM bookings
         WHERE employee_id = ? AND status IN (?) AND id != ? AND (session_id IS NULL OR session_id != ?)
           AND date_start <= ? AND COALESCE(date_end, DATE_ADD(date_start, INTERVAL 1 DAY)) > ?
           AND (booking_type = 'stay' OR (time_start < ? AND time_end > ?))`,
        [employeeId, ACTIVE_STATUSES, row.id, session.id, session.date, session.date, session.end_time, session.start_time],
      );
      if (busyCount > 0) throw badRequest('Selected employee is no longer available at this time');
    }

    return { sessionId: session.id, employeeId, dateStart: session.date, dateEnd: null, timeStart: session.start_time, timeEnd: session.end_time };
  }

  if (product.booking_type === 'stay') {
    if (!body.newDateStart) throw badRequest('newDateStart is required');
    if (body.newDateStart < today) throw badRequest('Cannot reschedule to a past date');
    const nights = nightsBetween(row.date_start, row.date_end);
    const newDateEnd = (() => {
      const d = new Date(`${body.newDateStart}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + nights);
      return d.toISOString().slice(0, 10);
    })();

    const capacity = product.capacity || 0;
    const openMonths = new Set();
    for (let d = new Date(`${body.newDateStart}T00:00:00Z`); d < new Date(`${newDateEnd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const dayStr = d.toISOString().slice(0, 10);
      const month = dayStr.slice(0, 7);
      if (!openMonths.has(month)) {
        const [[monthRow]] = await cx.query('SELECT id FROM stay_open_months WHERE product_id = ? AND month = ? FOR UPDATE', [
          product.id,
          month,
        ]);
        if (!monthRow) throw badRequest(`This product is not open for bookings in ${month}`);
        openMonths.add(month);
      }
      const [[day]] = await cx.query('SELECT is_holiday FROM stay_calendar_days WHERE product_id = ? AND date = ? FOR UPDATE', [
        product.id,
        dayStr,
      ]);
      if (day && day.is_holiday) throw badRequest(`This product is closed on ${dayStr}`);
      const [[{ count }]] = await cx.query(
        'SELECT COUNT(*) AS count FROM bookings WHERE product_id = ? AND status IN (?) AND id != ? AND date_start <= ? AND date_end > ?',
        [product.id, ACTIVE_STATUSES, row.id, dayStr, dayStr],
      );
      if (count >= capacity) throw badRequest(`No availability on ${dayStr}`);
    }

    return { sessionId: null, employeeId: null, dateStart: body.newDateStart, dateEnd: newDateEnd, timeStart: null, timeEnd: null };
  }

  // stay_session
  if (!body.newDate) throw badRequest('newDate is required');
  if (!body.newTimeStart) throw badRequest('newTimeStart is required');
  if (!body.newEmployeeId) throw badRequest('newEmployeeId is required');
  if (body.newDate < today || (body.newDate === today && body.newTimeStart < nowTime)) {
    throw badRequest('Cannot reschedule to a time in the past');
  }
  const minutes = (() => {
    if (!row.time_start || !row.time_end) return null;
    const [sh, sm] = row.time_start.split(':').map(Number);
    const [eh, em] = row.time_end.split(':').map(Number);
    return eh * 60 + em - (sh * 60 + sm);
  })();
  if (!minutes) throw badRequest('Could not determine the appointment duration');
  const computedTimeEnd = addMinutesToTime(body.newTimeStart, minutes);
  if (!computedTimeEnd) throw badRequest('This duration does not fit before midnight — pick an earlier start time');

  const [[day]] = await cx.query('SELECT * FROM stay_calendar_days WHERE product_id = ? AND date = ? FOR UPDATE', [product.id, body.newDate]);
  if (!day || day.is_holiday) throw badRequest(`This service is closed on ${body.newDate}`);
  const [staffedToday] = await cx.query('SELECT employee_id FROM stay_day_employees WHERE day_id = ?', [day.id]);
  if (!staffedToday.some((r) => r.employee_id === Number(body.newEmployeeId))) {
    throw badRequest(`Selected employee is not on duty on ${body.newDate}`);
  }

  const [[{ count: busyCount }]] = await cx.query(
    `SELECT COUNT(*) AS count FROM bookings
     WHERE employee_id = ? AND status IN (?) AND id != ?
       AND date_start <= ? AND COALESCE(date_end, DATE_ADD(date_start, INTERVAL 1 DAY)) > ?
       AND (booking_type = 'stay' OR (time_start < ? AND time_end > ?))`,
    [body.newEmployeeId, ACTIVE_STATUSES, row.id, body.newDate, body.newDate, computedTimeEnd, body.newTimeStart],
  );
  if (busyCount > 0) throw badRequest('Selected employee is no longer available at this time');

  return {
    sessionId: null,
    employeeId: Number(body.newEmployeeId),
    dateStart: body.newDate,
    dateEnd: null,
    timeStart: body.newTimeStart,
    timeEnd: computedTimeEnd,
  };
}

async function applyRescheduleUpdate(cx, bookingId, update) {
  await cx.query('UPDATE bookings SET session_id=?, employee_id=?, date_start=?, date_end=?, time_start=?, time_end=? WHERE id=?', [
    update.sessionId,
    update.employeeId,
    update.dateStart,
    update.dateEnd,
    update.timeStart,
    update.timeEnd,
    bookingId,
  ]);
}

// Payment summary per booking — one or more rows (a deposit + a later manually-settled
// balance both count) rolled up into what the UI actually needs: how much has been paid
// and what (if anything) is still owed. Used by both the admin and customer-facing shapes,
// since "how much is left to pay" is useful information on both sides.
async function loadPaymentsByBooking(bookingIds) {
  if (bookingIds.length === 0) return new Map();
  const rows = await query(
    'SELECT booking_id, amount, payment_type, status, paid_at FROM payments WHERE booking_id IN (?) ORDER BY id',
    [bookingIds],
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.booking_id)) map.set(row.booking_id, []);
    map.get(row.booking_id).push(row);
  }
  return map;
}

function paymentSummary(paymentsForBooking, totalPrice) {
  const paid = (paymentsForBooking || []).filter((p) => p.status === 'paid');
  const amountPaid = paid.reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceDue = Math.max(0, Number(totalPrice) - amountPaid);
  const latest = paid[paid.length - 1];
  return {
    amountPaid,
    balanceDue,
    isDeposit: paid.some((p) => p.payment_type === 'deposit') && balanceDue > 0.001,
    paymentType: latest?.payment_type,
    lastPaidAt: latest?.paid_at,
  };
}

async function loadExtrasByBooking(bookingIds) {
  if (bookingIds.length === 0) return new Map();
  const rows = await query('SELECT id, booking_id, extra_id, name, price FROM booking_extras WHERE booking_id IN (?)', [bookingIds]);
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.booking_id)) map.set(row.booking_id, []);
    map.get(row.booking_id).push({ id: row.id, extraId: row.extra_id, name: row.name, price: Number(row.price) });
  }
  return map;
}

// A booking's line items — one per price tier/quantity chosen. A 'stay' or
// 'stay_session' booking always has exactly one; a 'session' booking can have several
// (e.g. "Adult" x2 + "Child" x1) sharing a single reference, round and staff member.
async function loadItemsByBooking(bookingIds) {
  if (bookingIds.length === 0) return new Map();
  const rows = await query(
    'SELECT id, booking_id, price_tier_id, label, price, quantity FROM booking_items WHERE booking_id IN (?) ORDER BY id',
    [bookingIds],
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.booking_id)) map.set(row.booking_id, []);
    map.get(row.booking_id).push({
      id: row.id,
      priceTierId: row.price_tier_id,
      label: row.label,
      price: Number(row.price),
      quantity: row.quantity,
    });
  }
  return map;
}

router.post(
  '/',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.productId || !body.guestName || !body.guestEmail || !body.guestPhone) {
      throw badRequest('productId, guestName, guestEmail and guestPhone are required');
    }
    const customerId = req.user?.type === 'customer' ? req.user.sub : null;
    const policy = await getBookingPolicy();
    // Auto-confirm only skips straight to 'confirmed' when there's no payment step to
    // abandon. With Stripe configured, every booking goes through a mandatory payment
    // step right after this — if the customer never completes it, the booking must not
    // have been sitting there "confirmed" the whole time. It starts 'pending' instead,
    // and /payments/confirm promotes it to 'confirmed' once payment actually succeeds.
    const initialStatus = policy.autoConfirm && !paymentsConfigured() ? 'confirmed' : 'pending';

    const booking = await withTransaction(async (cx) => {
      // Lock the product row for the duration of the transaction so two concurrent
      // booking attempts on the same product can never both pass the availability
      // check below — the second waits for this transaction to commit, then re-reads
      // fresh booking rows and correctly sees the first booking's effect.
      await cx.query('SELECT id FROM products WHERE id = ? FOR UPDATE', [body.productId]);
      const [[product]] = await cx.query('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL', [body.productId]);
      if (!product || product.status !== 'active') throw notFound('Product not available');

      // A booking is a single transaction that can cover several price-tier line items
      // (e.g. "Adult" x2 + "Child" x1 in one order) — 'stay'/'stay_session' only ever
      // send one, 'session' can send several via a cart. Legacy singular
      // priceTierId/guests is still accepted so nothing else has to change at once.
      const rawItems =
        Array.isArray(body.items) && body.items.length > 0
          ? body.items
          : body.priceTierId
            ? [{ priceTierId: body.priceTierId, quantity: body.guests || 1 }]
            : [];
      if (rawItems.length === 0) throw badRequest('At least one price tier item is required');
      if (product.booking_type !== 'session' && rawItems.length > 1) {
        throw badRequest('This product only accepts a single price tier per booking');
      }

      const tierIds = [...new Set(rawItems.map((i) => Number(i.priceTierId)))];
      const [tierRows] = await cx.query('SELECT id, label, minutes, price, unit_limit FROM product_price_tiers WHERE product_id = ? AND id IN (?)', [
        product.id,
        tierIds,
      ]);
      const tierMap = new Map(tierRows.map((t) => [t.id, t]));

      const resolvedItems = rawItems.map((i) => {
        const tier = tierMap.get(Number(i.priceTierId));
        if (!tier) throw badRequest('Selected price tier is not available for this product');
        const quantity = Number(i.quantity || 1);
        if (!Number.isInteger(quantity) || quantity < 1) throw badRequest('quantity must be a positive integer');
        return { tier, quantity };
      });

      const totalGuests = resolvedItems.reduce((sum, i) => sum + i.quantity, 0);
      // A 'session' product's capacity is governed per price tier (unit_limit), checked
      // further down once the round (and staff, if any) is known — max_guests doesn't
      // apply to it.
      if (product.booking_type !== 'session' && product.max_guests && totalGuests > product.max_guests) {
        throw badRequest(`This product allows a maximum of ${product.max_guests} guest(s)`);
      }

      let dateStart = body.dateStart;
      let dateEnd = null;
      let timeStart = null;
      let timeEnd = null;
      let sessionId = null;
      let employeeId = null;
      let totalPrice = 0;
      const today = todayStr();
      const nowTime = nowTimeStr();

      if (product.booking_type === 'session') {
        if (!body.sessionId) throw badRequest('sessionId is required for session bookings');
        // Lock the session row too: two customers racing for the same round
        // must serialize here, same as the product-row lock above does for slot/stay.
        const [[session]] = await cx.query('SELECT * FROM product_sessions WHERE id = ? AND product_id = ? FOR UPDATE', [
          body.sessionId,
          product.id,
        ]);
        if (!session) throw notFound('Session not found');
        if (session.date < today || (session.date === today && session.start_time < nowTime)) {
          throw badRequest('Cannot book a session in the past');
        }

        // Staff assignment, when the round has any, is purely operational (who serves
        // this booking) — but it does scope capacity: each employee's stock per tier is
        // tracked independently of every other employee on the same round.
        const [staffedEmployees] = await cx.query('SELECT employee_id FROM session_employees WHERE session_id = ?', [session.id]);
        if (staffedEmployees.length > 0) {
          if (!body.employeeId) throw badRequest('employeeId is required for this session');
          const isAssigned = staffedEmployees.some((row) => row.employee_id === Number(body.employeeId));
          if (!isAssigned) throw badRequest('Selected employee is not assigned to this session');
          employeeId = Number(body.employeeId);
        }

        // Capacity is set per price tier ("unit"), scoped to the chosen employee when the
        // round has staff, or to the round as a whole when it doesn't — checked against
        // the sum of guests already booked in that same scope.
        for (const { tier, quantity } of resolvedItems) {
          if (tier.unit_limit == null) continue;
          const employeeScopeSql = employeeId != null ? 'b.employee_id = ?' : 'b.employee_id IS NULL';
          const employeeScopeParams = employeeId != null ? [employeeId] : [];
          // Quantities live on booking_items (a multi-tier cart shares one bookings row
          // with a NULL/aggregate guests total), so capacity must sum from there, not
          // from bookings.guests directly.
          const [[{ guestSum }]] = await cx.query(
            `SELECT COALESCE(SUM(bi.quantity), 0) AS guestSum FROM booking_items bi
             JOIN bookings b ON b.id = bi.booking_id
             WHERE b.session_id = ? AND ${employeeScopeSql} AND bi.price_tier_id = ? AND b.status IN (?)`,
            [session.id, ...employeeScopeParams, tier.id, ACTIVE_STATUSES],
          );
          const remaining = tier.unit_limit - guestSum;
          if (quantity > remaining) {
            throw badRequest(
              `Only ${Math.max(remaining, 0)} unit(s) left for "${tier.label}"${employeeId != null ? ' with this staff member' : ''} in this round`,
            );
          }
        }

        if (employeeId != null) {
          // Any OTHER active booking for this employee (stay, a different session, or a
          // stay_session) whose window overlaps this one still blocks — this employee's
          // own other bookings within this same round are fine (capacity is handled by
          // the unit-limit check above, not by exclusivity here).
          const [[{ count: busyCount }]] = await cx.query(
            `SELECT COUNT(*) AS count FROM bookings
             WHERE employee_id = ? AND status IN (?) AND (session_id IS NULL OR session_id != ?)
               AND date_start <= ? AND COALESCE(date_end, DATE_ADD(date_start, INTERVAL 1 DAY)) > ?
               AND (booking_type = 'stay' OR (time_start < ? AND time_end > ?))`,
            [employeeId, ACTIVE_STATUSES, session.id, session.date, session.date, session.end_time, session.start_time],
          );
          if (busyCount > 0) throw badRequest('Selected employee is no longer available at this time');
        }

        sessionId = session.id;
        dateStart = session.date;
        timeStart = session.start_time;
        timeEnd = session.end_time;
        // Session pricing is per unit — each item's tier price times its quantity.
        totalPrice = resolvedItems.reduce((sum, { tier, quantity }) => sum + Number(tier.price) * quantity, 0);
      } else if (product.booking_type === 'stay') {
        const tier = resolvedItems[0].tier;
        if (!body.dateStart) throw badRequest('dateStart is required for stay bookings');
        if (!body.dateEnd) throw badRequest('dateEnd is required for stay bookings');
        if (body.dateStart < today) throw badRequest('Cannot book dates in the past');
        if (body.dateEnd <= body.dateStart) throw badRequest('dateEnd must be after dateStart');
        dateEnd = body.dateEnd;
        const nights = nightsBetween(body.dateStart, dateEnd);
        if (product.min_stay_nights && nights < product.min_stay_nights) {
          throw badRequest(`Minimum stay is ${product.min_stay_nights} night(s)`);
        }

        // A stay night is only bookable once its whole month has been explicitly opened
        // by the admin — within an open month, a night is open by default unless flagged
        // a holiday or already at capacity. No staff involved.
        const capacity = product.capacity || 0;
        const openMonths = new Set();
        for (let d = new Date(`${body.dateStart}T00:00:00Z`); d < new Date(`${dateEnd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
          const dayStr = d.toISOString().slice(0, 10);
          const month = dayStr.slice(0, 7);
          if (!openMonths.has(month)) {
            const [[monthRow]] = await cx.query('SELECT id FROM stay_open_months WHERE product_id = ? AND month = ? FOR UPDATE', [
              product.id,
              month,
            ]);
            if (!monthRow) throw badRequest(`This product is not open for bookings in ${month}`);
            openMonths.add(month);
          }
          const [[day]] = await cx.query('SELECT is_holiday FROM stay_calendar_days WHERE product_id = ? AND date = ? FOR UPDATE', [
            product.id,
            dayStr,
          ]);
          if (day && day.is_holiday) throw badRequest(`This product is closed on ${dayStr}`);
          const [[{ count }]] = await cx.query(
            'SELECT COUNT(*) AS count FROM bookings WHERE product_id = ? AND status IN (?) AND date_start <= ? AND date_end > ?',
            [product.id, ACTIVE_STATUSES, dayStr, dayStr],
          );
          if (count >= capacity) throw badRequest(`No availability on ${dayStr}`);
        }

        // Stay is priced per night: total = nightly rate × nights stayed.
        totalPrice = Number(tier.price) * nights;
      } else {
        const tier = resolvedItems[0].tier;
        // stay_session: a single-day appointment. Duration comes from the chosen price
        // tier's minutes, not from the client, so the charged time window always matches
        // what was actually priced.
        if (!body.date) throw badRequest('date is required for this booking type');
        if (!body.timeStart) throw badRequest('timeStart is required for this booking type');
        if (!body.employeeId) throw badRequest('employeeId is required for this booking type');
        if (body.date < today || (body.date === today && body.timeStart < nowTime)) {
          throw badRequest('Cannot book a time in the past');
        }
        if (!tier.minutes) throw badRequest('Selected price tier has no duration');
        const computedTimeEnd = addMinutesToTime(body.timeStart, tier.minutes);
        if (!computedTimeEnd) throw badRequest('This duration does not fit before midnight — pick an earlier start time');

        const [[day]] = await cx.query('SELECT * FROM stay_calendar_days WHERE product_id = ? AND date = ? FOR UPDATE', [
          product.id,
          body.date,
        ]);
        if (!day || day.is_holiday) throw badRequest(`This service is closed on ${body.date}`);
        const [staffedToday] = await cx.query('SELECT employee_id FROM stay_day_employees WHERE day_id = ?', [day.id]);
        if (!staffedToday.some((row) => row.employee_id === Number(body.employeeId))) {
          throw badRequest(`Selected employee is not on duty on ${body.date}`);
        }

        // Same cross-type overlap rule as a session round: any other active booking for
        // this employee (stay, session, or another stay_session) whose window covers
        // this date, and whose time range overlaps for non-stay bookings, blocks it.
        const [[{ count: busyCount }]] = await cx.query(
          `SELECT COUNT(*) AS count FROM bookings
           WHERE employee_id = ? AND status IN (?)
             AND date_start <= ? AND COALESCE(date_end, DATE_ADD(date_start, INTERVAL 1 DAY)) > ?
             AND (booking_type = 'stay' OR (time_start < ? AND time_end > ?))`,
          [body.employeeId, ACTIVE_STATUSES, body.date, body.date, computedTimeEnd, body.timeStart],
        );
        if (busyCount > 0) throw badRequest('Selected employee is no longer available at this time');

        employeeId = Number(body.employeeId);
        dateStart = body.date;
        dateEnd = null;
        timeStart = body.timeStart;
        timeEnd = computedTimeEnd;
        totalPrice = Number(tier.price);
      }

      // Extras are optional add-ons scoped to this product — only ones actually offered
      // alongside it (product_extras) and still active can be attached. Name/price are
      // captured now so a later edit to the extra never rewrites what was charged.
      let selectedExtras = [];
      const requestedExtraIds = [...new Set((body.extraIds || []).map(Number))];
      if (requestedExtraIds.length > 0) {
        const [rows] = await cx.query(
          `SELECT e.id, e.price, et.name FROM product_extras pe
           JOIN extras e ON e.id = pe.extra_id
           LEFT JOIN extra_translations et ON et.extra_id = e.id AND et.locale = 'th'
           WHERE pe.product_id = ? AND pe.extra_id IN (?) AND e.status = 'active'`,
          [product.id, requestedExtraIds],
        );
        if (rows.length !== requestedExtraIds.length) throw badRequest('One or more selected extras are not available for this product');
        selectedExtras = rows.map((r) => ({ id: r.id, name: r.name || `Extra #${r.id}`, price: Number(r.price) }));
        totalPrice += selectedExtras.reduce((sum, e) => sum + e.price, 0);
      }

      // The top-level price_tier_id/label stay populated for a single-item booking (the
      // common case, and what existing admin views read directly); a multi-item cart's
      // full breakdown lives in booking_items instead, since no single tier applies.
      const primaryTier = resolvedItems.length === 1 ? resolvedItems[0].tier : null;

      const reference = generateReference();
      const [result] = await cx.query(
        `INSERT INTO bookings
          (reference, product_id, customer_id, session_id, employee_id, price_tier_id, price_tier_label, booking_type, date_start, date_end, time_start, time_end, guests, guest_name, guest_email, guest_phone, status, total_price, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reference,
          product.id,
          customerId,
          sessionId,
          employeeId,
          primaryTier ? primaryTier.id : null,
          primaryTier ? primaryTier.label : `${resolvedItems.length} items`,
          product.booking_type,
          dateStart,
          dateEnd,
          timeStart,
          timeEnd,
          totalGuests,
          body.guestName,
          body.guestEmail,
          body.guestPhone,
          initialStatus,
          totalPrice,
          body.note || null,
        ],
      );
      const bookingId = result.insertId;

      for (const { tier, quantity } of resolvedItems) {
        await cx.query('INSERT INTO booking_items (booking_id, price_tier_id, label, price, quantity) VALUES (?, ?, ?, ?, ?)', [
          bookingId,
          tier.id,
          tier.label,
          tier.price,
          quantity,
        ]);
      }

      for (const extra of selectedExtras) {
        await cx.query('INSERT INTO booking_extras (booking_id, extra_id, name, price) VALUES (?, ?, ?, ?)', [
          bookingId,
          extra.id,
          extra.name,
          extra.price,
        ]);
      }

      return {
        id: bookingId,
        reference,
        productId: product.id,
        sessionId,
        employeeId,
        priceTierId: primaryTier ? primaryTier.id : null,
        priceTierLabel: primaryTier ? primaryTier.label : `${resolvedItems.length} items`,
        bookingType: product.booking_type,
        dateStart,
        dateEnd,
        timeStart,
        timeEnd,
        guests: totalGuests,
        guestName: body.guestName,
        guestEmail: body.guestEmail,
        guestPhone: body.guestPhone,
        status: initialStatus,
        totalPrice,
        note: body.note || null,
        items: resolvedItems.map(({ tier, quantity }) => ({ priceTierId: tier.id, label: tier.label, price: Number(tier.price), quantity })),
        extras: selectedExtras.map((e) => ({ extraId: e.id, name: e.name, price: e.price })),
      };
    });

    if (!paymentsConfigured()) sendBookingNotifications(booking.id);

    res.status(201).json(booking);
  }),
);

router.get(
  '/lookup',
  asyncHandler(async (req, res) => {
    const { reference, email } = req.query;
    if (!reference || !email) throw badRequest('reference and email are required');
    const locale = localeFromRequest(req);
    // Every product is guaranteed a Thai translation (see assertHasThai in products.js)
    // but not necessarily one in the requested locale, so fall back to Thai rather than
    // showing a blank name when e.g. the English translation was never filled in.
    const [booking] = await query(
      `SELECT b.*, COALESCE(pt.name, pt_th.name) AS product_name FROM bookings b
       LEFT JOIN product_translations pt ON pt.product_id = b.product_id AND pt.locale = ?
       LEFT JOIN product_translations pt_th ON pt_th.product_id = b.product_id AND pt_th.locale = 'th'
       WHERE b.reference = ?`,
      [locale, reference],
    );
    if (!booking || booking.guest_email.toLowerCase() !== String(email).toLowerCase()) throw notFound('Booking not found');
    const extras = (await loadExtrasByBooking([booking.id])).get(booking.id) || [];
    const items = (await loadItemsByBooking([booking.id])).get(booking.id) || [];
    const payments = (await loadPaymentsByBooking([booking.id])).get(booking.id) || [];
    const [pendingRequest] = await query(
      'SELECT id, type, created_at FROM booking_change_requests WHERE booking_id = ? AND status = "pending"',
      [booking.id],
    );
    res.json({
      ...shapeBooking(booking, extras, items, payments),
      pendingChangeRequest: pendingRequest ? { id: pendingRequest.id, type: pendingRequest.type, createdAt: pendingRequest.created_at } : null,
    });
  }),
);

// Guest self-service cancellation — reference + email is the same lightweight ownership
// check /lookup itself uses, since guest checkout has no auth token to require. Gated by
// the admin-configured allowSelfCancel flag and the same notice window as every other
// cancellation path. When requireApprovalForCancel is on, this only files a request —
// the booking stays exactly as-is until an admin approves or rejects it.
router.post(
  '/lookup/cancel',
  asyncHandler(async (req, res) => {
    const { reference, email, reason } = req.body;
    if (!reference || !email) throw badRequest('reference and email are required');
    if (!reason) throw badRequest('reason is required');
    const policy = await getBookingPolicy();
    if (!policy.allowSelfCancel) throw forbidden('Self-service cancellation is not available.');

    const [booking] = await query('SELECT * FROM bookings WHERE reference = ?', [reference]);
    if (!booking || booking.guest_email.toLowerCase() !== String(email).toLowerCase()) throw notFound('Booking not found');
    if (!['pending', 'confirmed'].includes(booking.status)) throw badRequest('This booking can no longer be cancelled.');

    const hoursUntil = (new Date(`${booking.date_start}T00:00:00Z`) - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < policy.cancellationHoursBefore) {
      throw forbidden(`Cancellation requires at least ${policy.cancellationHoursBefore}h notice`);
    }

    if (policy.requireApprovalForCancel) {
      // One booking, one open request at a time — otherwise a guest could queue up
      // conflicting asks before an admin has looked at either.
      const [existingRequest] = await query('SELECT id FROM booking_change_requests WHERE booking_id = ? AND status = "pending"', [booking.id]);
      if (existingRequest) throw badRequest('This booking already has a pending request awaiting admin review.');
      await query('INSERT INTO booking_change_requests (booking_id, type, payload, reason) VALUES (?, "cancel", ?, ?)', [
        booking.id,
        JSON.stringify({}),
        reason,
      ]);
      await notifyChangeRequestSubmitted(booking.id, 'cancel', {});
      res.json({ success: true, pending: true });
      return;
    }

    await query('UPDATE bookings SET status = "cancelled", cancel_reason = ? WHERE id = ?', [reason, booking.id]);
    notifyStatusChanged(booking.id, 'cancelled');
    res.json({ success: true, pending: false });
  }),
);

// Guest self-service reschedule — same ownership check as above. Re-runs the same
// availability rules booking creation does for the product's type via computeRescheduleUpdate.
// When requireApprovalForReschedule is on, the requested schedule is validated as a
// sanity check but NOT applied — it's queued as a request and re-validated again (in case
// the slot filled up meanwhile) at approval time.
router.post(
  '/lookup/reschedule',
  asyncHandler(async (req, res) => {
    const { reference, email } = req.body;
    if (!reference || !email) throw badRequest('reference and email are required');
    const policy = await getBookingPolicy();
    if (!policy.allowSelfReschedule) throw forbidden('Self-service rescheduling is not available.');

    const outcome = await withTransaction(async (cx) => {
      const [[row]] = await cx.query('SELECT * FROM bookings WHERE reference = ? FOR UPDATE', [reference]);
      if (!row || row.guest_email.toLowerCase() !== String(email).toLowerCase()) throw notFound('Booking not found');
      if (!['pending', 'confirmed'].includes(row.status)) throw badRequest('This booking can no longer be rescheduled.');

      const hoursUntil = (new Date(`${row.date_start}T00:00:00Z`) - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil < policy.rescheduleHoursBefore) {
        throw forbidden(`Rescheduling requires at least ${policy.rescheduleHoursBefore}h notice`);
      }

      const [[product]] = await cx.query('SELECT * FROM products WHERE id = ?', [row.product_id]);
      if (!product || product.status !== 'active') throw badRequest('This product is no longer available.');
      const update = await computeRescheduleUpdate(cx, row, product, req.body);
      const previousSlotLabel = formatSlotLabel(row.date_start, row.date_end, row.time_start);

      if (policy.requireApprovalForReschedule) {
        const [[existingRequest]] = await cx.query('SELECT id FROM booking_change_requests WHERE booking_id = ? AND status = "pending" FOR UPDATE', [row.id]);
        if (existingRequest) throw badRequest('This booking already has a pending request awaiting admin review.');
        // Store the already-computed target slot as a plain summary string alongside the raw
        // body — the body alone doesn't say much at a glance (e.g. a 'session' reschedule is
        // just a sessionId), and re-deriving "what does this request actually ask for" from
        // scratch in the admin list view would mean re-joining product_sessions/etc there too.
        const requestedSummary = formatSlotLabel(update.dateStart, update.dateEnd, update.timeStart);
        await cx.query('INSERT INTO booking_change_requests (booking_id, type, payload) VALUES (?, "reschedule", ?)', [
          row.id,
          JSON.stringify({ body: req.body, requestedSummary }),
        ]);
        return { bookingId: row.id, pending: true, requestedSummary };
      }

      await applyRescheduleUpdate(cx, row.id, update);
      return { bookingId: row.id, pending: false, previousSlotLabel, employeeChanged: update.employeeId !== row.employee_id };
    });

    if (outcome.pending) {
      notifyChangeRequestSubmitted(outcome.bookingId, 'reschedule', { requestedSummary: outcome.requestedSummary });
    } else {
      notifyRescheduled(outcome.bookingId, outcome.previousSlotLabel, outcome.employeeChanged);
    }
    res.json({ success: true, pending: outcome.pending });
  }),
);

// Admin queue for pending self-service requests — see requireApprovalForCancel/Reschedule
// in settings.booking_policy. Defaults to the pending ones (what admin actually needs to
// act on); ?status=all|approved|rejected shows history.
router.get(
  '/change-requests',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const statusFilter = req.query.status || 'pending';
    const locale = localeFromRequest(req);
    const where = statusFilter === 'all' ? '' : 'WHERE cr.status = ?';
    const params = statusFilter === 'all' ? [locale] : [locale, statusFilter];
    const rows = await query(
      `SELECT cr.id, cr.booking_id, cr.type, cr.status, cr.payload, cr.reason, cr.admin_note, cr.created_at, cr.resolved_at,
              b.reference, b.guest_name, b.guest_email, b.status AS booking_status,
              b.date_start, b.date_end, b.time_start, b.booking_type,
              COALESCE(pt.name, pt_th.name) AS product_name
       FROM booking_change_requests cr
       JOIN bookings b ON b.id = cr.booking_id
       LEFT JOIN product_translations pt ON pt.product_id = b.product_id AND pt.locale = ?
       LEFT JOIN product_translations pt_th ON pt_th.product_id = b.product_id AND pt_th.locale = 'th'
       ${where}
       ORDER BY cr.created_at DESC`,
      statusFilter === 'all' ? [locale] : params,
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        bookingId: r.booking_id,
        type: r.type,
        status: r.status,
        reason: r.reason || undefined,
        adminNote: r.admin_note || undefined,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        requestedSlot: r.type === 'reschedule' ? r.payload?.requestedSummary : undefined,
        booking: {
          reference: r.reference,
          guestName: r.guest_name,
          guestEmail: r.guest_email,
          status: r.booking_status,
          dateStart: r.date_start,
          dateEnd: r.date_end,
          timeStart: r.time_start,
          bookingType: r.booking_type,
          productName: r.product_name,
        },
      })),
    );
  }),
);

router.post(
  '/change-requests/:id/approve',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const requestId = Number(req.params.id);
    const result = await withTransaction(async (cx) => {
      const [[cr]] = await cx.query('SELECT * FROM booking_change_requests WHERE id = ? FOR UPDATE', [requestId]);
      if (!cr) throw notFound('Request not found');
      if (cr.status !== 'pending') throw badRequest('This request has already been resolved.');

      const [[row]] = await cx.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [cr.booking_id]);
      if (!row) throw notFound('Booking not found');

      let employeeChanged = false;
      if (cr.type === 'cancel') {
        if (!['pending', 'confirmed'].includes(row.status)) throw badRequest('This booking can no longer be cancelled.');
        await cx.query('UPDATE bookings SET status = "cancelled", cancel_reason = ? WHERE id = ?', [cr.reason, row.id]);
      } else {
        const [[product]] = await cx.query('SELECT * FROM products WHERE id = ?', [row.product_id]);
        if (!product || product.status !== 'active') throw badRequest('This product is no longer available.');
        // Re-validate now, not just at submission time — availability may have changed
        // (another booking, admin closing the day, etc.) in the meantime.
        const update = await computeRescheduleUpdate(cx, row, product, cr.payload.body);
        await applyRescheduleUpdate(cx, row.id, update);
        employeeChanged = update.employeeId !== row.employee_id;
      }

      await cx.query('UPDATE booking_change_requests SET status = "approved", admin_note = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?', [
        req.body.note || null,
        req.user.sub,
        requestId,
      ]);
      return { bookingId: row.id, type: cr.type, employeeChanged };
    });

    await recordAudit(req.user.sub, `approve_${result.type}_request`, 'booking', result.bookingId, req.body.note || null);
    await notifyChangeRequestResolved(result.bookingId, result.type, 'approved', req.body.note);
    if (result.type === 'reschedule' && result.employeeChanged) {
      notifyEmployeeReassigned(result.bookingId).catch(() => {});
    }
    res.json({ success: true });
  }),
);

router.post(
  '/change-requests/:id/reject',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const requestId = Number(req.params.id);
    const cr = await withTransaction(async (cx) => {
      const [[existing]] = await cx.query('SELECT * FROM booking_change_requests WHERE id = ? FOR UPDATE', [requestId]);
      if (!existing) throw notFound('Request not found');
      if (existing.status !== 'pending') throw badRequest('This request has already been resolved.');
      await cx.query('UPDATE booking_change_requests SET status = "rejected", admin_note = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?', [
        req.body.note || null,
        req.user.sub,
        requestId,
      ]);
      return existing;
    });

    await recordAudit(req.user.sub, `reject_${cr.type}_request`, 'booking', cr.booking_id, req.body.note || null);
    await notifyChangeRequestResolved(cr.booking_id, cr.type, 'rejected', req.body.note);
    res.json({ success: true });
  }),
);

router.get(
  '/me',
  authenticate,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const locale = localeFromRequest(req);
    const bookings = await query(
      `SELECT b.*, COALESCE(pt.name, pt_th.name) AS product_name, ps.name AS session_name, emp.name AS employee_name FROM bookings b
       LEFT JOIN product_translations pt ON pt.product_id = b.product_id AND pt.locale = ?
       LEFT JOIN product_translations pt_th ON pt_th.product_id = b.product_id AND pt_th.locale = 'th'
       LEFT JOIN product_sessions ps ON ps.id = b.session_id
       LEFT JOIN employees emp ON emp.id = b.employee_id
       WHERE b.customer_id = ? ORDER BY b.created_at DESC`,
      [locale, req.user.sub],
    );
    const bookingIds = bookings.map((b) => b.id);
    const [extrasMap, itemsMap, paymentsMap, pendingRows] = await Promise.all([
      loadExtrasByBooking(bookingIds),
      loadItemsByBooking(bookingIds),
      loadPaymentsByBooking(bookingIds),
      bookingIds.length > 0
        ? query('SELECT booking_id, id, type, created_at FROM booking_change_requests WHERE booking_id IN (?) AND status = "pending"', [bookingIds])
        : [],
    ]);
    const pendingByBooking = new Map(pendingRows.map((r) => [r.booking_id, { id: r.id, type: r.type, createdAt: r.created_at }]));
    res.json(
      bookings.map((b) => ({
        ...shapeBooking(b, extrasMap.get(b.id) || [], itemsMap.get(b.id) || [], paymentsMap.get(b.id) || []),
        pendingChangeRequest: pendingByBooking.get(b.id) || null,
      })),
    );
  }),
);

// Logged-in customer's own cancel action (MyBookings.vue) — same policy this file's guest
// /lookup/cancel enforces (allowSelfCancel gate, notice window, approval-required branch),
// just identified by session + ownership instead of reference+email.
router.patch(
  '/me/:id/cancel',
  authenticate,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const [booking] = await query('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) throw notFound('Booking not found');
    if (booking.customer_id !== req.user.sub) throw forbidden('Not your booking');
    if (!req.body.reason) throw badRequest('reason is required');

    const policy = await getBookingPolicy();
    if (!policy.allowSelfCancel) throw forbidden('Self-service cancellation is not available.');
    if (!['pending', 'confirmed'].includes(booking.status)) throw badRequest('This booking can no longer be cancelled.');

    const hoursUntil = (new Date(`${booking.date_start}T00:00:00Z`) - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < policy.cancellationHoursBefore) {
      throw forbidden(`Cancellation requires at least ${policy.cancellationHoursBefore}h notice`);
    }

    if (policy.requireApprovalForCancel) {
      const [existingRequest] = await query('SELECT id FROM booking_change_requests WHERE booking_id = ? AND status = "pending"', [booking.id]);
      if (existingRequest) throw badRequest('This booking already has a pending request awaiting admin review.');
      await query('INSERT INTO booking_change_requests (booking_id, type, payload, reason) VALUES (?, "cancel", ?, ?)', [
        booking.id,
        JSON.stringify({}),
        req.body.reason,
      ]);
      await notifyChangeRequestSubmitted(booking.id, 'cancel', {});
      res.json({ success: true, pending: true });
      return;
    }

    await query('UPDATE bookings SET status = "cancelled", cancel_reason = ? WHERE id = ?', [req.body.reason, booking.id]);
    notifyStatusChanged(booking.id, 'cancelled');
    res.json({ success: true, pending: false });
  }),
);

router.get(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const where = [];
    const params = [];
    if (req.query.status) {
      where.push('b.status = ?');
      params.push(req.query.status);
    }
    if (req.query.productId) {
      where.push('b.product_id = ?');
      params.push(Number(req.query.productId));
    }
    if (req.query.from) {
      where.push('b.date_start >= ?');
      params.push(req.query.from);
    }
    if (req.query.to) {
      where.push('b.date_start <= ?');
      params.push(req.query.to);
    }
    if (req.query.search) {
      where.push('(b.guest_name LIKE ? OR b.guest_email LIKE ? OR b.reference LIKE ?)');
      params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM bookings b ${whereSql}`, params);
    const bookings = await query(
      `SELECT b.*, pt.name AS product_name, ps.name AS session_name, emp.name AS employee_name,
              (SELECT ei.url_thumbnail FROM employee_images ei WHERE ei.employee_id = b.employee_id
               ORDER BY ei.is_cover DESC, ei.sort_order ASC LIMIT 1) AS employee_image_url
       FROM bookings b
       LEFT JOIN product_translations pt ON pt.product_id = b.product_id AND pt.locale = 'th'
       LEFT JOIN product_sessions ps ON ps.id = b.session_id
       LEFT JOIN employees emp ON emp.id = b.employee_id
       ${whereSql} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const [extrasMap, itemsMap, paymentsMap] = await Promise.all([
      loadExtrasByBooking(bookings.map((b) => b.id)),
      loadItemsByBooking(bookings.map((b) => b.id)),
      loadPaymentsByBooking(bookings.map((b) => b.id)),
    ]);
    res.json({
      items: bookings.map((b) => shapeBooking(b, extrasMap.get(b.id) || [], itemsMap.get(b.id) || [], paymentsMap.get(b.id) || [])),
      total,
      page,
      pageSize,
    });
  }),
);

router.get(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [booking] = await query(
      `SELECT b.*, pt.name AS product_name, ps.name AS session_name, emp.name AS employee_name,
              (SELECT ei.url_thumbnail FROM employee_images ei WHERE ei.employee_id = b.employee_id
               ORDER BY ei.is_cover DESC, ei.sort_order ASC LIMIT 1) AS employee_image_url
       FROM bookings b
       LEFT JOIN product_translations pt ON pt.product_id = b.product_id AND pt.locale = 'th'
       LEFT JOIN product_sessions ps ON ps.id = b.session_id
       LEFT JOIN employees emp ON emp.id = b.employee_id
       WHERE b.id = ?`,
      [req.params.id],
    );
    if (!booking) throw notFound('Booking not found');
    const extras = (await loadExtrasByBooking([booking.id])).get(booking.id) || [];
    const items = (await loadItemsByBooking([booking.id])).get(booking.id) || [];
    const payments = (await loadPaymentsByBooking([booking.id])).get(booking.id) || [];
    res.json(shapeBooking(booking, extras, items, payments));
  }),
);

// Staff manually record that the remaining balance (after a deposit) was settled some
// other way — cash, bank transfer, in person, etc. Stripe/online payments never call
// this; it exists purely so admin has somewhere to close out the "balance due" the
// booking otherwise keeps showing indefinitely.
router.post(
  '/:id/settle-balance',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [booking] = await query('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!booking) throw notFound('Booking not found');
    const payments = (await loadPaymentsByBooking([id])).get(id) || [];
    const { balanceDue } = paymentSummary(payments, booking.total_price);
    if (balanceDue <= 0) throw badRequest('This booking has no outstanding balance.');

    await query(
      'INSERT INTO payments (booking_id, amount, payment_type, provider, method, status, paid_at) VALUES (?, ?, "balance", "manual", "manual", "paid", NOW())',
      [id, balanceDue],
    );
    await recordAudit(req.user.sub, 'settle_balance', 'booking', id, String(balanceDue));

    const updatedPayments = (await loadPaymentsByBooking([id])).get(id) || [];
    res.json({ success: true, payment: paymentSummary(updatedPayments, booking.total_price) });
  }),
);

router.patch(
  '/:id/status',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
    if (!validStatuses.includes(req.body.status)) throw badRequest('Invalid status');
    const [booking] = await query('SELECT id, status FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) throw notFound('Booking not found');

    await query('UPDATE bookings SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    await recordAudit(req.user.sub, 'status_change', 'booking', Number(req.params.id), req.body.status);
    if (booking.status !== req.body.status) notifyStatusChanged(Number(req.params.id), req.body.status);
    res.json({ success: true });
  }),
);

router.patch(
  '/:id/cancel',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (!req.body.reason) throw badRequest('reason is required');
    const [booking] = await query('SELECT id FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) throw notFound('Booking not found');

    await query('UPDATE bookings SET status = "cancelled", cancel_reason = ? WHERE id = ?', [req.body.reason, req.params.id]);
    await recordAudit(req.user.sub, 'cancel', 'booking', Number(req.params.id), req.body.reason);
    notifyStatusChanged(Number(req.params.id), 'cancelled');
    res.json({ success: true });
  }),
);

function shapeBooking(row, extras = [], items = [], payments = []) {
  return {
    payment: paymentSummary(payments, row.total_price),
    id: row.id,
    reference: row.reference,
    productId: row.product_id,
    sessionId: row.session_id,
    sessionName: row.session_name || undefined,
    employeeId: row.employee_id,
    employeeName: row.employee_name || undefined,
    employeeImageUrl: row.employee_image_url || undefined,
    priceTierId: row.price_tier_id,
    priceTierLabel: row.price_tier_label || undefined,
    bookingType: row.booking_type,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    timeStart: row.time_start,
    timeEnd: row.time_end,
    guests: row.guests,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    status: row.status,
    totalPrice: Number(row.total_price),
    note: row.note,
    createdAt: row.created_at,
    product: row.product_name ? { id: row.product_id, name: row.product_name } : undefined,
    items,
    extras,
  };
}

module.exports = router;
