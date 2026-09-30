const { Router } = require('express');
const { query, withTransaction } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { badRequest, notFound, conflict } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { todayStr } = require('../utils/businessTime');

const router = Router();
const ACTIVE_STATUSES = ['pending', 'confirmed', 'completed'];

async function loadPriceTiers(productId) {
  return query('SELECT id, label, price, unit_limit FROM product_price_tiers WHERE product_id = ? ORDER BY sort_order', [productId]);
}

async function getProduct(id) {
  const [product] = await query('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!product) throw notFound('Product not found');
  return product;
}

async function loadEmployeesBySession(sessionIds) {
  if (sessionIds.length === 0) return new Map();
  const rows = await query(
    `SELECT se.session_id, e.id, e.name FROM session_employees se
     JOIN employees e ON e.id = se.employee_id
     WHERE se.session_id IN (?) ORDER BY e.name`,
    [sessionIds],
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.session_id)) map.set(row.session_id, []);
    map.get(row.session_id).push({ id: row.id, name: row.name });
  }
  return map;
}

async function loadEmployeeCoverImages(employeeIds) {
  if (employeeIds.length === 0) return new Map();
  const rows = await query(
    'SELECT employee_id, url_thumbnail, is_cover FROM employee_images WHERE employee_id IN (?) ORDER BY sort_order',
    [employeeIds],
  );
  const map = new Map();
  for (const row of rows) {
    const existing = map.get(row.employee_id);
    if (!existing || row.is_cover) map.set(row.employee_id, row.url_thumbnail);
  }
  return map;
}

async function setSessionEmployees(cx, sessionId, employeeIds) {
  await cx.query('DELETE FROM session_employees WHERE session_id = ?', [sessionId]);
  if (Array.isArray(employeeIds) && employeeIds.length > 0) {
    for (const employeeId of employeeIds) {
      await cx.query('INSERT INTO session_employees (session_id, employee_id) VALUES (?, ?)', [sessionId, Number(employeeId)]);
    }
  }
}

// A session round's capacity is set per price tier ("unit"), scoped to the employee that
// took the booking when the round has staff — each employee's stock per tier is
// independent of every other employee's — or to the round as a whole (employee_id IS
// NULL) when it doesn't. Keyed session -> employeeId ("null" for unstaffed) -> tierId.
async function loadGuestSumsBySessionEmployeeTier(sessionIds) {
  if (sessionIds.length === 0) return new Map();
  // Quantities live on booking_items (a multi-tier cart shares one bookings row with a
  // NULL/aggregate guests total), so this sums from there rather than bookings.guests.
  const rows = await query(
    `SELECT b.session_id, b.employee_id, bi.price_tier_id, COALESCE(SUM(bi.quantity), 0) AS guestSum
     FROM booking_items bi
     JOIN bookings b ON b.id = bi.booking_id
     WHERE b.session_id IN (?) AND b.status IN (?)
     GROUP BY b.session_id, b.employee_id, bi.price_tier_id`,
    [sessionIds, ACTIVE_STATUSES],
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.session_id)) map.set(row.session_id, new Map());
    const empKey = row.employee_id == null ? 'none' : row.employee_id;
    const bySession = map.get(row.session_id);
    if (!bySession.has(empKey)) bySession.set(empKey, new Map());
    bySession.get(empKey).set(row.price_tier_id, Number(row.guestSum));
  }
  return map;
}

function tierRemaining(tier, guestSum) {
  return tier.unit_limit == null ? null : Math.max(tier.unit_limit - guestSum, 0);
}

// A round is full once, for every one of its staffed employees (or the round itself when
// unstaffed), every price tier has reached its own unit_limit — a tier with no limit
// (null) can never be exhausted, so it keeps that employee's (or the round's) row open.
function isSessionFull(sessionId, tiers, employees, guestSumsBySession) {
  if (tiers.length === 0) return false;
  const bySession = guestSumsBySession.get(sessionId) || new Map();
  const scopes = employees.length > 0 ? employees.map((e) => e.id) : ['none'];
  return scopes.every((empKey) => {
    const guestSums = bySession.get(empKey) || new Map();
    return tiers.every((t) => t.unit_limit != null && (guestSums.get(t.id) || 0) >= t.unit_limit);
  });
}

async function loadBookingsBySession(sessionIds) {
  if (sessionIds.length === 0) return new Map();
  const rows = await query(
    `SELECT b.session_id, b.reference, b.employee_id, emp.name AS employee_name FROM bookings b
     LEFT JOIN employees emp ON emp.id = b.employee_id
     WHERE b.session_id IN (?) AND b.status IN (?)`,
    [sessionIds, ACTIVE_STATUSES],
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.session_id)) map.set(row.session_id, []);
    map.get(row.session_id).push({ reference: row.reference, employeeId: row.employee_id, employeeName: row.employee_name || undefined });
  }
  return map;
}

// An employee is busy for [timeStart, timeEnd) on `date` if they're already attached
// (via bookings.employee_id) to another active booking that covers this date — a stay
// booking has no time range and occupies the employee for the whole day, so it always
// conflicts; a session booking on the same date only conflicts if its time overlaps.
// `excludeSessionId`, when given, ignores that session's own bookings for this employee
// (used by the session employee-picker below — a round's own occupants shouldn't mark
// its assigned staff "busy"; whether they still have room is a separate guest-count check).
async function loadEmployeeAvailability(employeeIds, date, timeStart, timeEnd, excludeSessionId = null) {
  const map = new Map(employeeIds.map((id) => [id, true]));
  if (employeeIds.length === 0) return map;
  const rows = await query(
    `SELECT DISTINCT employee_id FROM bookings
     WHERE employee_id IN (?) AND status IN (?)
       AND date_start <= ? AND COALESCE(date_end, DATE_ADD(date_start, INTERVAL 1 DAY)) > ?
       AND (booking_type = 'stay' OR (time_start < ? AND time_end > ?))
       AND (? IS NULL OR session_id IS NULL OR session_id != ?)`,
    [employeeIds, ACTIVE_STATUSES, date, date, timeEnd, timeStart, excludeSessionId, excludeSessionId],
  );
  for (const row of rows) map.set(row.employee_id, false);
  return map;
}

// An employee qualifies for a stay booking covering [dateStart, dateEnd) only if they're
// on duty (and not marked holiday) every night of it — checked by intersecting each
// night's on-duty set — and not already committed to any other active booking (stay or
// session) that overlaps any of those nights, since a day-level assignment isn't sliced
// by time the way a session round is.
function datesInRange(dateStart, dateEndExclusive) {
  const dates = [];
  for (let d = new Date(`${dateStart}T00:00:00Z`); d < new Date(`${dateEndExclusive}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function loadStayDaysByDate(productId, dates) {
  if (dates.length === 0) return new Map();
  const days = await query('SELECT * FROM stay_calendar_days WHERE product_id = ? AND date IN (?)', [productId, dates]);
  const dayIds = days.map((d) => d.id);
  const empRows = dayIds.length > 0 ? await query('SELECT day_id, employee_id FROM stay_day_employees WHERE day_id IN (?)', [dayIds]) : [];
  const empMap = new Map();
  for (const row of empRows) {
    if (!empMap.has(row.day_id)) empMap.set(row.day_id, []);
    empMap.get(row.day_id).push(row.employee_id);
  }
  const map = new Map();
  for (const day of days) {
    map.set(day.date, { id: day.id, isHoliday: !!day.is_holiday, employeeIds: empMap.get(day.id) || [] });
  }
  return map;
}

function parseMonth(monthStr) {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) throw badRequest('month (YYYY-MM) query param is required');
  const [y, m] = monthStr.split('-').map(Number);
  const monthStart = `${monthStr}-01`;
  const nextMonthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { monthStart, nextMonthStart };
}

async function isMonthOpen(productId, month) {
  const [row] = await query('SELECT id FROM stay_open_months WHERE product_id = ? AND month = ?', [productId, month]);
  return !!row;
}

async function loadStayBookedCount(productId, date) {
  const [{ count }] = await query(
    'SELECT COUNT(*) AS count FROM bookings WHERE product_id = ? AND status IN (?) AND date_start <= ? AND date_end > ?',
    [productId, ACTIVE_STATUSES, date, date],
  );
  return count;
}

// Same booked-count-per-day as loadStayBookedCount, but for a whole batch of dates in one
// query instead of one round-trip per date — used by the month calendar views, which were
// previously calling loadStayBookedCount in a per-date loop (up to 31 sequential queries
// for a single month view).
async function loadStayBookedCountsByDateRange(productId, dates) {
  const counts = new Map(dates.map((d) => [d, 0]));
  if (dates.length === 0) return counts;
  const from = dates[0];
  const to = dates[dates.length - 1];
  const bookings = await query(
    'SELECT date_start, date_end FROM bookings WHERE product_id = ? AND status IN (?) AND date_start <= ? AND date_end > ?',
    [productId, ACTIVE_STATUSES, to, from],
  );
  for (const b of bookings) {
    for (const d of dates) {
      if (b.date_start <= d && b.date_end > d) counts.set(d, counts.get(d) + 1);
    }
  }
  return counts;
}

// Stay Booking (bookingType 'stay'): plain nightly rooms. Admin only ever blocks out
// holidays — an unconfigured day is OPEN by default (capacity-gated), the opposite of
// stay_session below, since a room needs no staff to exist.
//
// Stay+Session hybrid (bookingType 'stay_session', e.g. a walk-in massage service):
// same month-by-month calendar, but admin also assigns on-duty staff per day, and an
// unconfigured (or unstaffed) day is CLOSED by default — nothing here auto-opens a day
// just because it's in the future.
function isStayLikeType(bookingType) {
  return bookingType === 'stay' || bookingType === 'stay_session';
}

router.get(
  '/products/:productId/stay-calendar',
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    const product = await getProduct(productId);
    if (!isStayLikeType(product.booking_type)) throw badRequest('Product does not use the stay calendar');
    const month = req.query.month;
    const { monthStart, nextMonthStart } = parseMonth(month);
    const dates = datesInRange(monthStart, nextMonthStart);

    // A plain 'stay' month must be explicitly opened by the admin before any of its
    // days can be booked; stay_session has no such gate (each day opts in via staffing).
    const monthOpen = product.booking_type === 'stay' ? await isMonthOpen(productId, month) : true;

    const dayMap = await loadStayDaysByDate(productId, dates);
    const capacity = product.capacity || 0;
    const today = todayStr();
    const bookedCounts = product.booking_type === 'stay' ? await loadStayBookedCountsByDateRange(productId, dates) : new Map();

    const days = [];
    for (const date of dates) {
      const cfg = dayMap.get(date);
      const isHoliday = cfg ? cfg.isHoliday : false;
      let isOpen;
      if (product.booking_type === 'stay') {
        const bookedCount = monthOpen && !isHoliday ? bookedCounts.get(date) : 0;
        isOpen = monthOpen && !isHoliday && date >= today && bookedCount < capacity;
      } else {
        const hasStaff = !!cfg && !cfg.isHoliday && cfg.employeeIds.length > 0;
        isOpen = hasStaff && date >= today;
      }
      days.push({ date, isPast: date < today, isOpen });
    }
    res.json({ monthOpen, days });
  }),
);

// For a single stay_session day + a candidate [timeStart, timeEnd) window (computed by
// the caller from a chosen duration tier), which on-duty staff are actually free —
// reuses the same time-overlap check as a plain session round.
router.get(
  '/products/:productId/stay-session/employees',
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    const product = await getProduct(productId);
    if (product.booking_type !== 'stay_session') throw badRequest('Product is not a stay+session product');
    const { date, timeStart, timeEnd } = req.query;
    if (!date || !timeStart || !timeEnd) throw badRequest('date, timeStart and timeEnd query params are required');

    const dayMap = await loadStayDaysByDate(productId, [date]);
    const cfg = dayMap.get(date);
    const candidateIds = cfg && !cfg.isHoliday ? cfg.employeeIds : [];
    if (candidateIds.length === 0) return res.json([]);

    const employees = await query(`SELECT id, name, position FROM employees WHERE id IN (?) AND status = 'active' ORDER BY name`, [
      candidateIds,
    ]);
    const employeeIds = employees.map((e) => e.id);
    const [availability, coverImages] = await Promise.all([
      loadEmployeeAvailability(employeeIds, date, timeStart, timeEnd),
      loadEmployeeCoverImages(employeeIds),
    ]);
    res.json(
      employees.map((e) => ({
        id: e.id,
        name: e.name,
        position: e.position || '',
        available: availability.get(e.id) !== false,
        imageUrl: coverImages.get(e.id) || null,
      })),
    );
  }),
);

router.get(
  '/products/:productId/stay-calendar/admin',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    const product = await getProduct(productId);
    if (!isStayLikeType(product.booking_type)) throw badRequest('Product does not use the stay calendar');
    const month = req.query.month;
    const { monthStart, nextMonthStart } = parseMonth(month);
    const dates = datesInRange(monthStart, nextMonthStart);
    const monthOpen = product.booking_type === 'stay' ? await isMonthOpen(productId, month) : true;

    const dayMap = await loadStayDaysByDate(productId, dates);
    const allEmployeeIds = [...new Set([...dayMap.values()].flatMap((d) => d.employeeIds))];
    const employees = allEmployeeIds.length > 0 ? await query('SELECT id, name FROM employees WHERE id IN (?)', [allEmployeeIds]) : [];
    const nameById = new Map(employees.map((e) => [e.id, e.name]));
    const capacity = product.capacity || 0;
    const bookedCounts = await loadStayBookedCountsByDateRange(productId, dates);

    const days = [];
    for (const date of dates) {
      const cfg = dayMap.get(date);
      const bookedCount = bookedCounts.get(date);
      days.push({
        date,
        isConfigured: !!cfg,
        isHoliday: cfg ? cfg.isHoliday : false,
        employees: cfg ? cfg.employeeIds.map((id) => ({ id, name: nameById.get(id) || `#${id}` })) : [],
        capacity,
        bookedCount,
      });
    }
    res.json({ monthOpen, days });
  }),
);

router.post(
  '/products/:productId/stay-calendar/months',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    const product = await getProduct(productId);
    if (product.booking_type !== 'stay') throw badRequest('Only plain stay products use month-level opening');
    const { month } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw badRequest('month (YYYY-MM) is required');

    await query('INSERT IGNORE INTO stay_open_months (product_id, month) VALUES (?, ?)', [productId, month]);
    res.status(201).json({ month, monthOpen: true });
  }),
);

router.delete(
  '/products/:productId/stay-calendar/months/:month',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { productId, month } = req.params;
    if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('month (YYYY-MM) is required');
    const { monthStart, nextMonthStart } = parseMonth(month);
    const [{ count }] = await query(
      'SELECT COUNT(*) AS count FROM bookings WHERE product_id = ? AND status IN (?) AND date_start < ? AND date_end > ?',
      [productId, ACTIVE_STATUSES, nextMonthStart, monthStart],
    );
    if (count > 0) throw conflict('Cannot close a month that has an active booking');

    await query('DELETE FROM stay_open_months WHERE product_id = ? AND month = ?', [productId, month]);
    res.json({ success: true });
  }),
);

router.post(
  '/products/:productId/stay-calendar/days',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    const product = await getProduct(productId);
    if (!isStayLikeType(product.booking_type)) throw badRequest('Product does not use the stay calendar');
    const { date, isHoliday, employeeIds } = req.body;
    if (!date) throw badRequest('date is required');
    const usesStaff = product.booking_type === 'stay_session';

    if (product.booking_type === 'stay' && !(await isMonthOpen(productId, date.slice(0, 7)))) {
      throw badRequest('Open this month for booking before configuring individual days');
    }

    const dayId = await withTransaction(async (cx) => {
      const [existing] = await cx.query('SELECT id FROM stay_calendar_days WHERE product_id = ? AND date = ? FOR UPDATE', [
        productId,
        date,
      ]);
      let id;
      if (existing.length > 0) {
        id = existing[0].id;
        await cx.query('UPDATE stay_calendar_days SET is_holiday = ? WHERE id = ?', [isHoliday ? 1 : 0, id]);
      } else {
        const [result] = await cx.query('INSERT INTO stay_calendar_days (product_id, date, is_holiday) VALUES (?, ?, ?)', [
          productId,
          date,
          isHoliday ? 1 : 0,
        ]);
        id = result.insertId;
      }
      await cx.query('DELETE FROM stay_day_employees WHERE day_id = ?', [id]);
      if (usesStaff && !isHoliday && Array.isArray(employeeIds)) {
        for (const empId of employeeIds) {
          await cx.query('INSERT INTO stay_day_employees (day_id, employee_id) VALUES (?, ?)', [id, Number(empId)]);
        }
      }
      return id;
    });

    const finalEmployeeIds = usesStaff && !isHoliday ? (employeeIds || []).map(Number) : [];
    const employees =
      finalEmployeeIds.length > 0 ? await query('SELECT id, name FROM employees WHERE id IN (?)', [finalEmployeeIds]) : [];
    const bookedCount = await loadStayBookedCount(productId, date);
    res.status(201).json({
      date,
      isConfigured: true,
      isHoliday: !!isHoliday,
      employees,
      capacity: product.capacity || 0,
      bookedCount,
      dayId,
    });
  }),
);

router.delete(
  '/products/:productId/stay-calendar/days/:date',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { productId, date } = req.params;
    const bookedCount = await loadStayBookedCount(Number(productId), date);
    if (bookedCount > 0) throw conflict('Cannot clear a day that has an active booking');

    await query('DELETE FROM stay_calendar_days WHERE product_id = ? AND date = ?', [productId, date]);
    res.json({ success: true });
  }),
);

// Session Booking (bookingType 'session'): admin-defined, individually named slots.
// Capacity is set per price tier (unit_limit) — a round stays open until every one of
// its tiers is exhausted, computed live against bookings.session_id/price_tier_id so it
// can never drift out of sync with the actual booking rows.
router.get(
  '/products/:productId/session-dates',
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    const product = await getProduct(productId);
    if (product.booking_type !== 'session') throw badRequest('Product is not session-based');

    const today = todayStr();
    const sessions = await query('SELECT s.id, s.date FROM product_sessions s WHERE s.product_id = ? AND s.date >= ?', [
      productId,
      today,
    ]);
    const [tiers, employeesMap, guestSumsBySession] = await Promise.all([
      loadPriceTiers(productId),
      loadEmployeesBySession(sessions.map((s) => s.id)),
      loadGuestSumsBySessionEmployeeTier(sessions.map((s) => s.id)),
    ]);
    const openSessions = sessions.filter((s) => !isSessionFull(s.id, tiers, employeesMap.get(s.id) || [], guestSumsBySession));
    const counts = new Map();
    for (const s of openSessions) counts.set(s.date, (counts.get(s.date) || 0) + 1);
    const dates = [...counts.keys()].sort();
    res.json(dates.map((date) => ({ date, count: counts.get(date) })));
  }),
);

router.get(
  '/products/:productId/sessions',
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    const product = await getProduct(productId);
    if (product.booking_type !== 'session') throw badRequest('Product is not session-based');

    const today = todayStr();
    const where = ['s.product_id = ?', 's.date >= ?'];
    const params = [productId, today];
    if (req.query.date) {
      where.push('s.date = ?');
      params.push(req.query.date);
    }

    const rows = await query(
      `SELECT s.* FROM product_sessions s WHERE ${where.join(' AND ')} ORDER BY s.date, s.start_time`,
      params,
    );
    const [tiers, employeesMap, guestSumsBySession] = await Promise.all([
      loadPriceTiers(productId),
      loadEmployeesBySession(rows.map((r) => r.id)),
      loadGuestSumsBySessionEmployeeTier(rows.map((r) => r.id)),
    ]);
    const open = rows.filter((r) => !isSessionFull(r.id, tiers, employeesMap.get(r.id) || [], guestSumsBySession));
    res.json(
      open.map((r) => {
        const hasStaff = (employeesMap.get(r.id) || []).length > 0;
        // With staff, remaining is per employee (fetched once one is picked, via the
        // employees endpoint below) — this round-level figure only applies unstaffed.
        const noneScope = (guestSumsBySession.get(r.id) || new Map()).get('none') || new Map();
        return {
          id: r.id,
          name: r.name,
          date: r.date,
          timeStart: r.start_time,
          timeEnd: r.end_time,
          tiers: hasStaff ? null : tiers.map((t) => ({ id: t.id, remaining: tierRemaining(t, noneScope.get(t.id) || 0) })),
        };
      }),
    );
  }),
);

router.get(
  '/products/:productId/sessions/:sessionId/employees',
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    const sessionId = Number(req.params.sessionId);
    const product = await getProduct(productId);
    if (product.booking_type !== 'session') throw badRequest('Product is not session-based');

    const [session] = await query('SELECT * FROM product_sessions WHERE id = ? AND product_id = ?', [sessionId, productId]);
    if (!session) throw notFound('Session not found');

    const rows = await query(
      `SELECT e.id, e.name, e.position FROM session_employees se
       JOIN employees e ON e.id = se.employee_id
       WHERE se.session_id = ? AND e.status = 'active' ORDER BY e.name`,
      [sessionId],
    );
    const employeeIds = rows.map((r) => r.id);
    // Each employee's stock per price tier is independent of every other employee on
    // this same round — picking a different employee changes what's still available.
    const [availability, coverImages, tiers, guestSumsBySession] = await Promise.all([
      loadEmployeeAvailability(employeeIds, session.date, session.start_time, session.end_time, sessionId),
      loadEmployeeCoverImages(employeeIds),
      loadPriceTiers(productId),
      loadGuestSumsBySessionEmployeeTier([sessionId]),
    ]);
    const bySession = guestSumsBySession.get(sessionId) || new Map();
    res.json(
      rows.map((r) => {
        const empScope = bySession.get(r.id) || new Map();
        const tiersForEmployee = tiers.map((t) => ({ id: t.id, remaining: tierRemaining(t, empScope.get(t.id) || 0) }));
        const soldOut = tiersForEmployee.every((t) => t.remaining === 0);
        return {
          id: r.id,
          name: r.name,
          position: r.position || '',
          available: availability.get(r.id) !== false && !soldOut,
          tiers: tiersForEmployee,
          imageUrl: coverImages.get(r.id) || null,
        };
      }),
    );
  }),
);

router.get(
  '/products/:productId/sessions/admin',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    await getProduct(productId);
    const rows = await query('SELECT s.* FROM product_sessions s WHERE s.product_id = ? ORDER BY s.date, s.start_time', [productId]);
    const sessionIds = rows.map((r) => r.id);
    const [employeesMap, bookingsMap, tiers, guestSumsBySession] = await Promise.all([
      loadEmployeesBySession(sessionIds),
      loadBookingsBySession(sessionIds),
      loadPriceTiers(productId),
      loadGuestSumsBySessionEmployeeTier(sessionIds),
    ]);
    res.json(
      rows.map((r) => {
        const employees = employeesMap.get(r.id) || [];
        const bookings = bookingsMap.get(r.id) || [];
        const bySession = guestSumsBySession.get(r.id) || new Map();
        const hasStaff = employees.length > 0;

        // Each staffed employee's stock per tier is independent, so the round's total
        // capacity/bookedCount sums every employee's own scope (unstaffed rounds have
        // just the one "none" scope).
        const scopeKeys = hasStaff ? employees.map((e) => e.id) : ['none'];
        let capacity = 0;
        let bookedCount = 0;
        let hasUnlimitedTier = false;
        for (const key of scopeKeys) {
          const scope = bySession.get(key) || new Map();
          for (const t of tiers) {
            bookedCount += scope.get(t.id) || 0;
            if (t.unit_limit == null) hasUnlimitedTier = true;
            else capacity += t.unit_limit;
          }
        }

        const employeesWithTiers = employees.map((e) => {
          const scope = bySession.get(e.id) || new Map();
          const tierBreakdown = tiers.map((t) => {
            const booked = scope.get(t.id) || 0;
            return { id: t.id, label: t.label, unitLimit: t.unit_limit, booked, remaining: tierRemaining(t, booked) };
          });
          return { ...e, tiers: tierBreakdown, isBooked: tierBreakdown.some((t) => t.booked > 0) };
        });

        const isFull = isSessionFull(r.id, tiers, employees, guestSumsBySession);
        return {
          id: r.id,
          name: r.name,
          date: r.date,
          timeStart: r.start_time,
          timeEnd: r.end_time,
          capacity: hasUnlimitedTier ? null : capacity,
          bookedCount,
          isFull,
          // Round-level breakdown only applies when unstaffed — a staffed round shows
          // per-employee breakdowns instead, in `employees[].tiers`.
          tiers: hasStaff
            ? null
            : tiers.map((t) => {
                const booked = (bySession.get('none') || new Map()).get(t.id) || 0;
                return { id: t.id, label: t.label, unitLimit: t.unit_limit, booked, remaining: tierRemaining(t, booked) };
              }),
          hasBooking: bookings.length > 0,
          bookingReferences: bookings.map((b) => b.reference),
          employees: employeesWithTiers,
        };
      }),
    );
  }),
);

router.post(
  '/products/:productId/sessions',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    await getProduct(productId);
    const { name, date, timeStart, timeEnd, employeeIds } = req.body;
    if (!name || !name.trim() || !date || !timeStart || !timeEnd) {
      throw badRequest('name, date, timeStart and timeEnd are required');
    }
    if (timeEnd <= timeStart) throw badRequest('End time must be after start time');

    const sessionId = await withTransaction(async (cx) => {
      // A product's rounds must never overlap in time on the same day, regardless of
      // which staff are assigned — two overlapping rounds on one product/service would
      // let a customer end up double-booked into the same time slot.
      const [overlapping] = await cx.query(
        `SELECT id FROM product_sessions
         WHERE product_id = ? AND date = ? AND start_time < ? AND end_time > ?
         FOR UPDATE`,
        [productId, date, timeEnd, timeStart],
      );
      if (overlapping.length > 0) {
        throw conflict('This time overlaps with an existing round for this product/service');
      }

      const [result] = await cx.query(
        'INSERT INTO product_sessions (product_id, name, date, start_time, end_time) VALUES (?, ?, ?, ?, ?)',
        [productId, name.trim(), date, timeStart, timeEnd],
      );
      await setSessionEmployees(cx, result.insertId, employeeIds);
      return result.insertId;
    });

    const [employeesMap, tiers] = await Promise.all([loadEmployeesBySession([sessionId]), loadPriceTiers(productId)]);
    const employees = employeesMap.get(sessionId) || [];
    const hasStaff = employees.length > 0;
    const hasUnlimitedTier = tiers.some((t) => t.unit_limit == null);
    const tierTotal = tiers.reduce((sum, t) => sum + (t.unit_limit || 0), 0);
    const emptyTiers = tiers.map((t) => ({ id: t.id, label: t.label, unitLimit: t.unit_limit, booked: 0, remaining: t.unit_limit }));
    res.status(201).json({
      id: sessionId,
      name: name.trim(),
      date,
      timeStart,
      timeEnd,
      capacity: hasUnlimitedTier ? null : tierTotal * Math.max(employees.length, 1),
      bookedCount: 0,
      isFull: false,
      tiers: hasStaff ? null : emptyTiers,
      hasBooking: false,
      bookingReferences: [],
      employees: employees.map((e) => ({ ...e, tiers: emptyTiers, isBooked: false })),
    });
  }),
);

router.delete(
  '/products/:productId/sessions/:sessionId',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { productId, sessionId } = req.params;
    const [{ count }] = await query('SELECT COUNT(*) AS count FROM bookings WHERE session_id = ? AND status IN (?)', [
      sessionId,
      ACTIVE_STATUSES,
    ]);
    if (count > 0) throw conflict('Cannot delete a session that already has a booking');

    await query('DELETE FROM product_sessions WHERE id = ? AND product_id = ?', [sessionId, productId]);
    res.json({ success: true });
  }),
);

module.exports = router;
