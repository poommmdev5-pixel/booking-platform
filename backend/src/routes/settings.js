const { Router } = require('express');
const { query } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { badRequest } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

const BOOKING_POLICY_DEFAULTS = {
  autoConfirm: true,
  cancellationHoursBefore: 24,
  allowSelfCancel: true,
  allowSelfReschedule: true,
  rescheduleHoursBefore: 24,
  requireApprovalForCancel: false,
  requireApprovalForReschedule: false,
};

// One toggle per notification "event" — see backend/src/utils/mailer.js for where each
// is actually checked before sending. customerStatusChange is itself keyed by status,
// since which transitions are worth emailing about is exactly the kind of thing an admin
// wants separate control over (e.g. "no_show" might not be worth notifying the guest).
const NOTIFICATION_POLICY_DEFAULTS = {
  customerStatusChange: { confirmed: true, completed: true, cancelled: true, no_show: true },
  employeeAssigned: true,
  adminNewBooking: true,
  adminRescheduleRequest: true,
  adminCancelRequest: true,
};

async function getSetting(key, fallback) {
  const [row] = await query('SELECT value FROM settings WHERE `key` = ?', [key]);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  return query('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [
    key,
    JSON.stringify(value),
  ]);
}

// Public: just the safe-to-display subset (name/address/phone), for the client site's
// header/footer branding — no auth, since unauthenticated visitors need it too.
router.get(
  '/business-info/public',
  asyncHandler(async (req, res) => {
    const info = await getSetting('business_info', { name: '', address: '', phone: '' });
    res.json({ name: info.name || '', address: info.address || '', phone: info.phone || '' });
  }),
);

// Public: only the fields the "manage my booking" page needs to decide whether to show
// reschedule/cancel actions and what notice window to enforce — never the full admin
// policy object (e.g. autoConfirm isn't anyone else's business).
router.get(
  '/booking-policy/public',
  asyncHandler(async (req, res) => {
    const policy = await getSetting('booking_policy', BOOKING_POLICY_DEFAULTS);
    res.json({
      allowSelfCancel: policy.allowSelfCancel ?? BOOKING_POLICY_DEFAULTS.allowSelfCancel,
      allowSelfReschedule: policy.allowSelfReschedule ?? BOOKING_POLICY_DEFAULTS.allowSelfReschedule,
      cancellationHoursBefore: policy.cancellationHoursBefore ?? BOOKING_POLICY_DEFAULTS.cancellationHoursBefore,
      rescheduleHoursBefore: policy.rescheduleHoursBefore ?? BOOKING_POLICY_DEFAULTS.rescheduleHoursBefore,
      requireApprovalForCancel: policy.requireApprovalForCancel ?? BOOKING_POLICY_DEFAULTS.requireApprovalForCancel,
      requireApprovalForReschedule: policy.requireApprovalForReschedule ?? BOOKING_POLICY_DEFAULTS.requireApprovalForReschedule,
    });
  }),
);

router.use(authenticate, requireAdmin);

router.get(
  '/booking-policy',
  asyncHandler(async (req, res) => {
    // Merge with defaults rather than returning the stored row as-is — an older saved
    // row (from before self-service reschedule/cancel existed) won't have these keys,
    // and returning them as undefined would make the admin UI show toggles as off for
    // a policy that's actually on (see bookings.js's getBookingPolicy(), same fix).
    const stored = await getSetting('booking_policy', BOOKING_POLICY_DEFAULTS);
    res.json({ ...BOOKING_POLICY_DEFAULTS, ...stored });
  }),
);

router.put(
  '/booking-policy',
  asyncHandler(async (req, res) => {
    const rescheduleHoursBefore = Number(req.body.rescheduleHoursBefore);
    const cancellationHoursBefore = Number(req.body.cancellationHoursBefore);
    if (!Number.isFinite(rescheduleHoursBefore) || rescheduleHoursBefore < 0) throw badRequest('rescheduleHoursBefore must be 0 or greater');
    if (!Number.isFinite(cancellationHoursBefore) || cancellationHoursBefore < 0) throw badRequest('cancellationHoursBefore must be 0 or greater');
    const value = {
      autoConfirm: !!req.body.autoConfirm,
      cancellationHoursBefore,
      allowSelfCancel: !!req.body.allowSelfCancel,
      allowSelfReschedule: !!req.body.allowSelfReschedule,
      rescheduleHoursBefore,
      requireApprovalForCancel: !!req.body.requireApprovalForCancel,
      requireApprovalForReschedule: !!req.body.requireApprovalForReschedule,
    };
    await setSetting('booking_policy', value);
    res.json(value);
  }),
);

router.get(
  '/notification-policy',
  asyncHandler(async (req, res) => {
    const stored = await getSetting('notification_policy', NOTIFICATION_POLICY_DEFAULTS);
    res.json({
      ...NOTIFICATION_POLICY_DEFAULTS,
      ...stored,
      customerStatusChange: { ...NOTIFICATION_POLICY_DEFAULTS.customerStatusChange, ...stored.customerStatusChange },
    });
  }),
);

router.put(
  '/notification-policy',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const value = {
      customerStatusChange: {
        confirmed: !!body.customerStatusChange?.confirmed,
        completed: !!body.customerStatusChange?.completed,
        cancelled: !!body.customerStatusChange?.cancelled,
        no_show: !!body.customerStatusChange?.no_show,
      },
      employeeAssigned: !!body.employeeAssigned,
      adminNewBooking: !!body.adminNewBooking,
      adminRescheduleRequest: !!body.adminRescheduleRequest,
      adminCancelRequest: !!body.adminCancelRequest,
    };
    await setSetting('notification_policy', value);
    res.json(value);
  }),
);

router.get(
  '/payment-policy',
  asyncHandler(async (req, res) => {
    res.json(await getSetting('payment_policy', { depositEnabled: false, depositPercent: 30 }));
  }),
);

router.put(
  '/payment-policy',
  asyncHandler(async (req, res) => {
    const depositPercent = Number(req.body.depositPercent);
    if (req.body.depositEnabled && (!Number.isFinite(depositPercent) || depositPercent < 1 || depositPercent > 99)) {
      throw badRequest('depositPercent must be between 1 and 99');
    }
    const value = { depositEnabled: !!req.body.depositEnabled, depositPercent: depositPercent || 30 };
    await setSetting('payment_policy', value);
    res.json(value);
  }),
);

router.get(
  '/business-info',
  asyncHandler(async (req, res) => {
    res.json(
      await getSetting('business_info', { name: '', address: '', phone: '', defaultOpenTime: '09:00', defaultCloseTime: '18:00' }),
    );
  }),
);

router.put(
  '/business-info',
  asyncHandler(async (req, res) => {
    await setSetting('business_info', req.body);
    res.json(req.body);
  }),
);

module.exports = router;
