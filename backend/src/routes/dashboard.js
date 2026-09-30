const { Router } = require('express');
const { query } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { badRequest } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { todayStr } = require('../utils/businessTime');

const router = Router();
router.use(authenticate, requireAdmin);

function buildFilters(req, extraStatuses, alias) {
  const col = (name) => (alias ? `${alias}.${name}` : name);
  const where = [`${col('date_start')} BETWEEN ? AND ?`];
  const params = [req.query.from, req.query.to];
  if (req.query.productId) {
    where.push(`${col('product_id')} = ?`);
    params.push(Number(req.query.productId));
  }
  if (req.query.bookingType) {
    where.push(`${col('booking_type')} = ?`);
    params.push(req.query.bookingType);
  }
  if (req.query.categoryId) {
    where.push(`${col('product_id')} IN (SELECT id FROM products WHERE category_id = ?)`);
    params.push(Number(req.query.categoryId));
  }
  if (extraStatuses) {
    where.push(`${col('status')} IN (?)`);
    params.push(extraStatuses);
  }
  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

function revenueStatuses(includePending) {
  return includePending === 'true' || includePending === true ? ['pending', 'confirmed', 'completed'] : ['confirmed', 'completed'];
}

function shiftPreviousPeriod(from, to) {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const spanMs = toDate - fromDate;
  const prevTo = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    if (!req.query.from || !req.query.to) throw badRequest('from and to are required');
    const statuses = revenueStatuses(req.query.includePending);

    const { whereSql, params } = buildFilters(req);
    const { whereSql: revenueWhereSql, params: revenueParams } = buildFilters(req, statuses);

    const [{ total: totalBookings }] = await query(`SELECT COUNT(*) AS total FROM bookings ${whereSql}`, params);
    const [{ total: pendingCount }] = await query(`SELECT COUNT(*) AS total FROM bookings ${whereSql} AND status = "pending"`, params);
    const [{ total: cancelledCount }] = await query(`SELECT COUNT(*) AS total FROM bookings ${whereSql} AND status = "cancelled"`, params);
    const [{ revenue: totalRevenue }] = await query(
      `SELECT COALESCE(SUM(total_price), 0) AS revenue FROM bookings ${revenueWhereSql}`,
      revenueParams,
    );
    const statusBreakdown = await query(`SELECT status, COUNT(*) AS count FROM bookings ${whereSql} GROUP BY status`, params);

    const previous = shiftPreviousPeriod(req.query.from, req.query.to);
    const prevQuery = { ...req.query, from: previous.from, to: previous.to };
    const { whereSql: prevWhereSql, params: prevParams } = buildFilters({ query: prevQuery }, statuses);
    const [{ revenue: previousRevenue }] = await query(
      `SELECT COALESCE(SUM(total_price), 0) AS revenue FROM bookings ${prevWhereSql}`,
      prevParams,
    );
    const revenueChangePct = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : null;

    const topProductsRaw = await query(
      `SELECT product_id, COUNT(*) AS bookings, COALESCE(SUM(total_price), 0) AS revenue FROM bookings ${revenueWhereSql}
       GROUP BY product_id ORDER BY bookings DESC LIMIT 5`,
      revenueParams,
    );
    const productIds = topProductsRaw.map((r) => r.product_id);
    const names = productIds.length
      ? await query(
          `SELECT p.id, COALESCE(pt.name, p.code) AS name FROM products p
           LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'th'
           WHERE p.id IN (?)`,
          [productIds],
        )
      : [];
    const nameById = new Map(names.map((n) => [n.id, n.name]));

    res.json({
      totalRevenue: Number(totalRevenue),
      totalBookings,
      pendingCount,
      cancelledCount,
      cancellationRate: totalBookings > 0 ? cancelledCount / totalBookings : 0,
      statusBreakdown: statusBreakdown.map((s) => ({ status: s.status, count: s.count })),
      topProducts: topProductsRaw.map((r) => ({
        productId: r.product_id,
        name: nameById.get(r.product_id) || `#${r.product_id}`,
        bookings: r.bookings,
        revenue: Number(r.revenue),
      })),
      comparison: { previousRevenue: Number(previousRevenue), revenueChangePct },
    });
  }),
);

// A day's full activity list: session/stay_session rounds happening that day (sorted by
// time) plus stay check-ins/check-outs landing on it. Past/live/upcoming is computed
// client-side against the viewer's clock so it keeps updating without a refetch.
router.get(
  '/day-schedule',
  asyncHandler(async (req, res) => {
    const date = req.query.date || todayStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('date (YYYY-MM-DD) is required');

    const rows = await query(
      `SELECT b.*, COALESCE(pt.name, p.code) AS product_name, emp.name AS employee_name
       FROM bookings b
       JOIN products p ON p.id = b.product_id
       LEFT JOIN product_translations pt ON pt.product_id = b.product_id AND pt.locale = 'th'
       LEFT JOIN employees emp ON emp.id = b.employee_id
       WHERE (b.booking_type IN ('session', 'stay_session') AND b.date_start = ?)
          OR (b.booking_type = 'stay' AND (b.date_start = ? OR b.date_end = ?))
       ORDER BY b.time_start IS NULL, b.time_start ASC`,
      [date, date, date],
    );

    const employeeIds = [...new Set(rows.map((r) => r.employee_id).filter(Boolean))];
    const employeeImages = await loadEmployeeCoverImages(employeeIds);

    const entries = rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      productName: r.product_name,
      bookingType: r.booking_type,
      guestName: r.guest_name,
      guestPhone: r.guest_phone,
      employeeId: r.employee_id || undefined,
      employeeName: r.employee_name || undefined,
      employeeImageUrl: r.employee_id ? employeeImages.get(r.employee_id) : undefined,
      timeStart: r.time_start,
      timeEnd: r.time_end,
      status: r.status,
      totalPrice: Number(r.total_price),
      eventType: r.booking_type !== 'stay' ? 'session' : r.date_start === date ? 'check_in' : 'check_out',
    }));

    res.json({ date, entries });
  }),
);

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

// Every employee's historical activity over the selected range, not just a top-N slice —
// meant for open-ended browsing, so it's paginated client-side rather than capped here.
router.get(
  '/employees',
  asyncHandler(async (req, res) => {
    if (!req.query.from || !req.query.to) throw badRequest('from and to are required');
    const statuses = revenueStatuses(req.query.includePending);
    const rows = await query(
      `SELECT emp.id, emp.name, emp.position,
              COUNT(b.id) AS bookings, COALESCE(SUM(b.total_price), 0) AS revenue
       FROM employees emp
       LEFT JOIN bookings b ON b.employee_id = emp.id AND b.status IN (?) AND b.date_start BETWEEN ? AND ?
       GROUP BY emp.id
       ORDER BY bookings DESC, revenue DESC`,
      [statuses, req.query.from, req.query.to],
    );
    const imageByEmployee = await loadEmployeeCoverImages(rows.map((r) => r.id));
    res.json(
      rows.map((r) => ({
        employeeId: r.id,
        name: r.name,
        position: r.position || '',
        bookings: r.bookings,
        revenue: Number(r.revenue),
        imageUrl: imageByEmployee.get(r.id) || null,
      })),
    );
  }),
);

// Every product's historical performance over the selected range (no top-N cap), for the
// same open-ended, paginate-on-the-client browsing as /employees above.
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    if (!req.query.from || !req.query.to) throw badRequest('from and to are required');
    const statuses = revenueStatuses(req.query.includePending);
    const { whereSql, params } = buildFilters(req, statuses);
    const rows = await query(
      `SELECT product_id, COUNT(*) AS bookings, COALESCE(SUM(total_price), 0) AS revenue FROM bookings ${whereSql}
       GROUP BY product_id ORDER BY bookings DESC`,
      params,
    );
    const productIds = rows.map((r) => r.product_id);
    const info = productIds.length
      ? await query(
          `SELECT p.id, COALESCE(pt.name, p.code) AS name, p.booking_type FROM products p
           LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'th'
           WHERE p.id IN (?)`,
          [productIds],
        )
      : [];
    const infoById = new Map(info.map((n) => [n.id, n]));
    res.json(
      rows.map((r) => ({
        productId: r.product_id,
        name: infoById.get(r.product_id)?.name || `#${r.product_id}`,
        bookingType: infoById.get(r.product_id)?.booking_type,
        bookings: r.bookings,
        revenue: Number(r.revenue),
      })),
    );
  }),
);

router.get(
  '/occupancy',
  asyncHandler(async (req, res) => {
    if (!req.query.from || !req.query.to) throw badRequest('from and to are required');
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (req.query.productId) {
      where.push('id = ?');
      params.push(Number(req.query.productId));
    }
    if (req.query.categoryId) {
      where.push('category_id = ?');
      params.push(Number(req.query.categoryId));
    }
    if (req.query.bookingType) {
      where.push('booking_type = ?');
      params.push(req.query.bookingType);
    }
    const products = await query(`SELECT * FROM products WHERE ${where.join(' AND ')}`, params);

    const from = req.query.from;
    const to = req.query.to;
    const rangeDays = Math.max(1, Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1);
    const activeStatuses = ['pending', 'confirmed', 'completed'];

    if (products.length === 0) {
      res.json([]);
      return;
    }
    const productIds = products.map((p) => p.id);
    const stayIds = products.filter((p) => p.booking_type === 'stay').map((p) => p.id);
    const sessionIds = products.filter((p) => p.booking_type !== 'stay').map((p) => p.id);

    // One round-trip per data source instead of per product — was previously up to 3
    // sequential queries PER product (translation + stay-or-session lookups), which scaled
    // linearly with the product count on every dashboard load.
    const [names, stayBookings, sessionCounts, bookedCounts] = await Promise.all([
      query('SELECT product_id, name FROM product_translations WHERE product_id IN (?) AND locale = "th"', [productIds]),
      stayIds.length
        ? query(
            'SELECT product_id, date_start, date_end FROM bookings WHERE product_id IN (?) AND status IN (?) AND date_start <= ? AND date_end >= ?',
            [stayIds, activeStatuses, to, from],
          )
        : [],
      sessionIds.length
        ? query('SELECT product_id, COUNT(*) AS count FROM product_sessions WHERE product_id IN (?) AND date BETWEEN ? AND ? GROUP BY product_id', [
            sessionIds,
            from,
            to,
          ])
        : [],
      sessionIds.length
        ? query(
            'SELECT product_id, COUNT(*) AS count FROM bookings WHERE product_id IN (?) AND status IN (?) AND date_start BETWEEN ? AND ? GROUP BY product_id',
            [sessionIds, activeStatuses, from, to],
          )
        : [],
    ]);

    const nameById = new Map(names.map((n) => [n.product_id, n.name]));
    const stayBookingsByProduct = new Map();
    for (const b of stayBookings) {
      if (!stayBookingsByProduct.has(b.product_id)) stayBookingsByProduct.set(b.product_id, []);
      stayBookingsByProduct.get(b.product_id).push(b);
    }
    const sessionCountByProduct = new Map(sessionCounts.map((r) => [r.product_id, r.count]));
    const bookedCountByProduct = new Map(bookedCounts.map((r) => [r.product_id, r.count]));

    const result = products.map((product) => {
      const name = nameById.get(product.id) || product.code;
      if (product.booking_type === 'stay') {
        const bookings = stayBookingsByProduct.get(product.id) || [];
        let bookedNights = 0;
        for (const b of bookings) {
          const s = b.date_start > from ? b.date_start : from;
          const e = b.date_end < to ? b.date_end : to;
          bookedNights += Math.max(0, Math.round((new Date(`${e}T00:00:00Z`) - new Date(`${s}T00:00:00Z`)) / 86400000));
        }
        const capacity = product.capacity || 1;
        return { productId: product.id, name, bookingType: 'stay', rate: Math.min(1, bookedNights / (capacity * rangeDays)) };
      }
      const totalSessions = sessionCountByProduct.get(product.id) || 0;
      const bookedCount = bookedCountByProduct.get(product.id) || 0;
      return {
        productId: product.id,
        name,
        bookingType: 'session',
        rate: totalSessions > 0 ? Math.min(1, bookedCount / totalSessions) : 0,
      };
    });
    res.json(result);
  }),
);

// All-time performance stats used to power the small "mini dashboard" shown at the top
// of the Products/Employees/Extras management pages — unlike /products, /employees
// above, these need no date range (management pages aren't report-building tools) and
// group results the way each page naturally organizes its items.
const PERFORMANCE_STATUSES = ['confirmed', 'completed'];

router.get(
  '/products-overview',
  asyncHandler(async (req, res) => {
    const categories = await query(
      `SELECT c.id, c.booking_type, COALESCE(ct.name, c.code) AS name FROM categories c
       LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'th'
       ORDER BY c.id`,
    );
    const products = await query(
      `SELECT p.id, p.category_id, p.status, p.booking_type, COALESCE(pt.name, p.code) AS name
       FROM products p
       LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'th'
       WHERE p.deleted_at IS NULL
       ORDER BY p.id`,
    );
    const statsRows = await query(
      `SELECT product_id, COUNT(*) AS bookings, COALESCE(SUM(total_price), 0) AS revenue
       FROM bookings WHERE status IN (?) GROUP BY product_id`,
      [PERFORMANCE_STATUSES],
    );
    const statsByProduct = new Map(statsRows.map((r) => [r.product_id, { bookings: r.bookings, revenue: Number(r.revenue) }]));

    const productsByCategory = new Map();
    for (const p of products) {
      if (!productsByCategory.has(p.category_id)) productsByCategory.set(p.category_id, []);
      productsByCategory.get(p.category_id).push(p);
    }

    const categoryGroups = categories
      .map((c) => {
        const items = (productsByCategory.get(c.id) || []).map((p) => {
          const stats = statsByProduct.get(p.id) || { bookings: 0, revenue: 0 };
          return { id: p.id, name: p.name, status: p.status, bookingType: p.booking_type, ...stats };
        });
        return {
          categoryId: c.id,
          name: c.name,
          bookingType: c.booking_type,
          products: items,
          totalBookings: items.reduce((sum, i) => sum + i.bookings, 0),
          totalRevenue: items.reduce((sum, i) => sum + i.revenue, 0),
        };
      })
      .filter((g) => g.products.length > 0);

    const recentBookings = await query(
      `SELECT b.reference, b.status, b.total_price, b.date_start, b.created_at, b.guest_name,
              COALESCE(pt.name, p.code) AS product_name
       FROM bookings b
       JOIN products p ON p.id = b.product_id
       LEFT JOIN product_translations pt ON pt.product_id = b.product_id AND pt.locale = 'th'
       ORDER BY b.created_at DESC LIMIT 6`,
    );

    res.json({
      totals: {
        productCount: products.length,
        activeCount: products.filter((p) => p.status === 'active').length,
        categoryCount: categories.length,
        totalBookings: statsRows.reduce((sum, r) => sum + r.bookings, 0),
        totalRevenue: statsRows.reduce((sum, r) => sum + Number(r.revenue), 0),
      },
      categories: categoryGroups,
      recentBookings: recentBookings.map((r) => ({
        reference: r.reference,
        productName: r.product_name,
        guestName: r.guest_name,
        status: r.status,
        totalPrice: Number(r.total_price),
        dateStart: r.date_start,
        createdAt: r.created_at,
      })),
    });
  }),
);

router.get(
  '/employees-overview',
  asyncHandler(async (req, res) => {
    const employees = await query('SELECT id, name, position, status FROM employees ORDER BY id');
    const statsRows = await query(
      `SELECT employee_id, COUNT(*) AS bookings, COALESCE(SUM(total_price), 0) AS revenue
       FROM bookings WHERE status IN (?) AND employee_id IS NOT NULL GROUP BY employee_id`,
      [PERFORMANCE_STATUSES],
    );
    const statsByEmployee = new Map(statsRows.map((r) => [r.employee_id, { bookings: r.bookings, revenue: Number(r.revenue) }]));
    const imageByEmployee = await loadEmployeeCoverImages(employees.map((e) => e.id));

    const byPosition = new Map();
    for (const e of employees) {
      const key = e.position || 'Unassigned';
      if (!byPosition.has(key)) byPosition.set(key, []);
      const stats = statsByEmployee.get(e.id) || { bookings: 0, revenue: 0 };
      byPosition.get(key).push({ id: e.id, name: e.name, status: e.status, imageUrl: imageByEmployee.get(e.id) || null, ...stats });
    }
    const positionGroups = [...byPosition.entries()].map(([position, items]) => ({
      position,
      employees: items,
      totalBookings: items.reduce((sum, i) => sum + i.bookings, 0),
      totalRevenue: items.reduce((sum, i) => sum + i.revenue, 0),
    }));

    const recentBookings = await query(
      `SELECT b.reference, b.status, b.total_price, b.date_start, b.created_at, b.guest_name, emp.name AS employee_name
       FROM bookings b
       JOIN employees emp ON emp.id = b.employee_id
       ORDER BY b.created_at DESC LIMIT 6`,
    );

    res.json({
      totals: {
        employeeCount: employees.length,
        activeCount: employees.filter((e) => e.status === 'active').length,
        totalBookings: statsRows.reduce((sum, r) => sum + r.bookings, 0),
        totalRevenue: statsRows.reduce((sum, r) => sum + Number(r.revenue), 0),
      },
      positions: positionGroups,
      recentBookings: recentBookings.map((r) => ({
        reference: r.reference,
        employeeName: r.employee_name,
        guestName: r.guest_name,
        status: r.status,
        totalPrice: Number(r.total_price),
        dateStart: r.date_start,
        createdAt: r.created_at,
      })),
    });
  }),
);

router.get(
  '/extras-overview',
  asyncHandler(async (req, res) => {
    const extras = await query(
      `SELECT e.id, e.price, e.status, COALESCE(et.name, e.code) AS name FROM extras e
       LEFT JOIN extra_translations et ON et.extra_id = e.id AND et.locale = 'th'
       ORDER BY e.id`,
    );
    const statsRows = await query(
      `SELECT be.extra_id, COUNT(*) AS timesUsed, COALESCE(SUM(be.price), 0) AS revenue
       FROM booking_extras be
       JOIN bookings b ON b.id = be.booking_id
       WHERE b.status IN (?)
       GROUP BY be.extra_id`,
      [PERFORMANCE_STATUSES],
    );
    const statsByExtra = new Map(statsRows.map((r) => [r.extra_id, { timesUsed: r.timesUsed, revenue: Number(r.revenue) }]));
    const items = extras
      .map((e) => ({ id: e.id, name: e.name, status: e.status, price: Number(e.price), ...(statsByExtra.get(e.id) || { timesUsed: 0, revenue: 0 }) }))
      .sort((a, b) => b.timesUsed - a.timesUsed);

    const recentBookings = await query(
      `SELECT b.reference, b.status, b.guest_name, b.created_at,
              GROUP_CONCAT(DISTINCT be.name ORDER BY be.name SEPARATOR ', ') AS extra_names,
              COALESCE(SUM(be.price), 0) AS extras_total
       FROM bookings b
       JOIN booking_extras be ON be.booking_id = b.id
       GROUP BY b.id
       ORDER BY b.created_at DESC LIMIT 6`,
    );

    res.json({
      totals: {
        extraCount: extras.length,
        activeCount: extras.filter((e) => e.status === 'active').length,
        totalTimesUsed: statsRows.reduce((sum, r) => sum + r.timesUsed, 0),
        totalRevenue: statsRows.reduce((sum, r) => sum + Number(r.revenue), 0),
      },
      extras: items,
      recentBookings: recentBookings.map((r) => ({
        reference: r.reference,
        guestName: r.guest_name,
        status: r.status,
        extraNames: r.extra_names,
        extrasTotal: Number(r.extras_total),
        createdAt: r.created_at,
      })),
    });
  }),
);

router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    if (!req.query.from || !req.query.to) throw badRequest('from and to are required');
    const { whereSql, params } = buildFilters(req, null, 'b');
    const bookings = await query(
      `SELECT b.*, COALESCE(pt.name, p.code) AS product_name FROM bookings b
       JOIN products p ON p.id = b.product_id
       LEFT JOIN product_translations pt ON pt.product_id = b.product_id AND pt.locale = 'th'
       ${whereSql}
       ORDER BY b.date_start ASC`,
      params,
    );
    const header = 'reference,product,bookingType,dateStart,dateEnd,timeStart,timeEnd,guestName,status,totalPrice\n';
    const rows = bookings.map((b) =>
      [
        b.reference,
        `"${String(b.product_name).replace(/"/g, '""')}"`,
        b.booking_type,
        b.date_start,
        b.date_end || '',
        b.time_start || '',
        b.time_end || '',
        `"${b.guest_name.replace(/"/g, '""')}"`,
        b.status,
        b.total_price,
      ].join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bookings-${req.query.from}-${req.query.to}.csv"`);
    res.send(header + rows.join('\n'));
  }),
);

module.exports = router;
