const { Router } = require('express');
const Stripe = require('stripe');
const { query } = require('../db');
const config = require('../config');
const { badRequest, notFound } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { sendBookingNotifications } = require('../utils/mailer');

const router = Router();

let stripeClient = null;
function getStripe() {
  if (!config.stripe.secretKey) {
    throw badRequest('Payments are not configured yet — STRIPE_SECRET_KEY is missing.');
  }
  if (!stripeClient) stripeClient = Stripe(config.stripe.secretKey);
  return stripeClient;
}

async function getPaymentPolicy() {
  const [row] = await query('SELECT value FROM settings WHERE `key` = "payment_policy"');
  return row ? row.value : { depositEnabled: false, depositPercent: 30 };
}

// Public: lets the client show/hide the payment step and load Stripe.js without needing
// its own env var wiring — the publishable key is safe to expose (that's its purpose).
router.get(
  '/config',
  asyncHandler(async (req, res) => {
    const policy = await getPaymentPolicy();
    res.json({
      publishableKey: config.stripe.publishableKey,
      enabled: Boolean(config.stripe.secretKey && config.stripe.publishableKey),
      depositEnabled: policy.depositEnabled,
      depositPercent: policy.depositPercent,
    });
  }),
);

// reference + email act as the same lightweight ownership check used by /bookings/lookup —
// this is a guest-checkout flow with no auth token to require, so this is what stops a
// stranger from creating a charge against a booking id they merely guessed.
async function loadOwnedBooking(bookingId, reference, email) {
  const [booking] = await query('SELECT * FROM bookings WHERE id = ? AND reference = ?', [bookingId, reference]);
  if (!booking || booking.guest_email.toLowerCase() !== String(email).toLowerCase()) throw notFound('Booking not found');
  return booking;
}

router.post(
  '/create-intent',
  asyncHandler(async (req, res) => {
    const { bookingId, reference, email } = req.body;
    if (!bookingId || !reference || !email) throw badRequest('bookingId, reference and email are required');
    const paymentType = req.body.paymentType === 'deposit' ? 'deposit' : 'full';
    const booking = await loadOwnedBooking(bookingId, reference, email);
    if (booking.status === 'cancelled') throw badRequest('This booking has been cancelled.');

    const policy = await getPaymentPolicy();
    if (paymentType === 'deposit' && !policy.depositEnabled) throw badRequest('Deposit payments are not available for this booking.');

    const totalPrice = Number(booking.total_price);
    // Round to whole satang (the smallest THB unit) before converting, so the displayed
    // baht amount and the amount Stripe actually charges always agree exactly.
    const amount = paymentType === 'deposit' ? Math.round(totalPrice * policy.depositPercent) / 100 : totalPrice;
    const amountSatang = Math.round(amount * 100);

    const stripe = getStripe();

    // Reuse an existing pending intent of the SAME type/amount (e.g. the customer
    // refreshed the payment step) instead of creating a fresh Stripe object on every
    // request — but not across a full/deposit switch, since that changes the amount.
    const [existingPayment] = await query(
      'SELECT * FROM payments WHERE booking_id = ? AND status = "pending" AND payment_type = ? ORDER BY id DESC LIMIT 1',
      [booking.id, paymentType],
    );
    let intent = null;
    if (existingPayment?.provider_reference) {
      const found = await stripe.paymentIntents.retrieve(existingPayment.provider_reference);
      if (found.status !== 'succeeded' && found.status !== 'canceled' && found.amount === amountSatang) intent = found;
    }
    if (!intent) {
      intent = await stripe.paymentIntents.create({
        amount: amountSatang,
        currency: 'thb',
        automatic_payment_methods: { enabled: true },
        metadata: { bookingId: String(booking.id), reference: booking.reference, paymentType },
      });
      if (existingPayment) {
        await query('UPDATE payments SET provider_reference = ?, amount = ? WHERE id = ?', [intent.id, amount, existingPayment.id]);
      } else {
        await query(
          'INSERT INTO payments (booking_id, amount, payment_type, provider, provider_reference, status) VALUES (?, ?, ?, "stripe", ?, "pending")',
          [booking.id, amount, paymentType, intent.id],
        );
      }
    }

    res.json({ clientSecret: intent.client_secret, amount, paymentType, totalPrice });
  }),
);

// The client confirms the PaymentIntent with Stripe.js directly (card details never touch
// our server), then calls this so we independently re-check the result with Stripe's API
// before trusting it — never take payment success as given from the client alone.
router.post(
  '/confirm',
  asyncHandler(async (req, res) => {
    const { paymentIntentId, bookingId, reference, email } = req.body;
    if (!paymentIntentId || !bookingId || !reference || !email) {
      throw badRequest('paymentIntentId, bookingId, reference and email are required');
    }
    const booking = await loadOwnedBooking(bookingId, reference, email);

    const [payment] = await query('SELECT * FROM payments WHERE provider_reference = ? AND booking_id = ?', [paymentIntentId, booking.id]);
    if (!payment) throw notFound('Payment not found');

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status === 'succeeded') {
      const method = intent.payment_method_types?.[0] || null;
      // Only fire the (first) notification once — a customer retrying /confirm after
      // already succeeding (e.g. a duplicate client call) must not re-send emails.
      const alreadyPaid = payment.status === 'paid';
      await query('UPDATE payments SET status = "paid", paid_at = NOW(), method = ? WHERE id = ?', [method, payment.id]);
      if (booking.status !== 'cancelled') {
        await query('UPDATE bookings SET status = "confirmed" WHERE id = ?', [booking.id]);
      }
      if (!alreadyPaid) sendBookingNotifications(booking.id);
      const [{ paidSum }] = await query('SELECT COALESCE(SUM(amount), 0) AS paidSum FROM payments WHERE booking_id = ? AND status = "paid"', [
        booking.id,
      ]);
      const balanceDue = Math.max(0, Number(booking.total_price) - Number(paidSum));
      res.json({ success: true, status: 'paid', paymentType: payment.payment_type, balanceDue });
    } else {
      res.json({ success: false, status: intent.status });
    }
  }),
);

module.exports = router;
