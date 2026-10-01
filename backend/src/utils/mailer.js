const nodemailer = require('nodemailer');
const config = require('../config');
const { query } = require('../db');

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
});

// ---- HTML templating ----
// Each recipient type (customer / employee / admin) gets its own accent color and a
// labeled badge at the top of the email — the three go to very different people, sent
// from the same system, so at-a-glance recipient identity matters more than a single
// unified brand color would.
const AUDIENCES = {
  customer: { label: 'ส่งถึงลูกค้า', primary: '#0f7a70', primaryDark: '#0b5f58', light: '#e2f4f1', icon: '🌴' },
  employee: { label: 'ส่งถึงพนักงาน', primary: '#b45309', primaryDark: '#92400e', light: '#fdf1d9', icon: '🧑‍💼' },
  admin: { label: 'ส่งถึงผู้ดูแลระบบ', primary: '#4338ca', primaryDark: '#3730a3', light: '#e0e7ff', icon: '🛠️' },
};

const COLORS = {
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  bg: '#f1f5f9',
};

const STATUS_LABELS_TH = {
  pending: 'รอดำเนินการ',
  confirmed: 'ยืนยันแล้ว',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิกแล้ว',
  no_show: 'ไม่มาตามนัด',
};

const STATUS_STYLES = {
  pending: { bg: '#fef3c7', fg: '#92400e' },
  confirmed: { bg: '#dcfce7', fg: '#166534' },
  completed: { bg: '#dcfce7', fg: '#166534' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b' },
  no_show: { bg: '#fee2e2', fg: '#991b1b' },
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function formatMoney(amount) {
  return `฿${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  // Force the Gregorian calendar — plain 'th-TH' renders พ.ศ. (Buddhist era), which
  // would read as wrong next to the Gregorian years used everywhere else (admin panel,
  // the client site). Mirrors the same fix already applied in bookings.js/i18n/index.js.
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('th-TH-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function statusBadge(status) {
  const s = STATUS_STYLES[status] || { bg: '#e2e8f0', fg: '#334155' };
  const label = STATUS_LABELS_TH[status] || status;
  return `<span style="display:inline-block;padding:5px 14px;border-radius:999px;background:${s.bg};color:${s.fg};font-size:12px;font-weight:700;">${escapeHtml(label)}</span>`;
}

// A simple two-column "label: value" table used for the details block in every template.
function detailRows(rows) {
  return rows
    .filter((r) => r.value)
    .map(
      (r) => `
        <tr>
          <td style="padding:8px 0;font-size:13px;color:${COLORS.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(r.label)}</td>
          <td style="padding:8px 0 8px 16px;font-size:14px;color:${COLORS.text};font-weight:600;text-align:right;">${escapeHtml(r.value)}</td>
        </tr>`,
    )
    .join('');
}

function itemsBlock(items, extras, accent) {
  const itemRows = (items || [])
    .map(
      (it) => `
        <tr>
          <td style="padding:7px 0;font-size:14px;color:${COLORS.text};">${escapeHtml(it.label)} × ${it.quantity}</td>
          <td style="padding:7px 0;text-align:right;font-size:14px;font-weight:700;color:${accent};">${formatMoney(it.price * it.quantity)}</td>
        </tr>`,
    )
    .join('');
  const extraRows = (extras || [])
    .map(
      (e) => `
        <tr>
          <td style="padding:7px 0;font-size:14px;color:${COLORS.text};">${escapeHtml(e.name)}</td>
          <td style="padding:7px 0;text-align:right;font-size:14px;font-weight:700;color:${accent};">+${formatMoney(e.price)}</td>
        </tr>`,
    )
    .join('');
  if (!itemRows && !extraRows) return '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-top:1px dashed ${COLORS.border};padding-top:8px;">
      ${itemRows}${extraRows}
    </table>`;
}

// Plain total when the booking is fully settled; when a deposit leaves a balance due,
// break it into three rows instead so nobody has to do the subtraction themselves.
function totalRow(total, accent, amountPaid, balanceDue) {
  if (!balanceDue || balanceDue <= 0.001) {
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-top:2px solid ${COLORS.text};padding-top:12px;">
        <tr>
          <td style="font-size:15px;font-weight:800;color:${COLORS.text};">ยอดรวมทั้งหมด</td>
          <td style="text-align:right;font-size:20px;font-weight:800;color:${accent};">${formatMoney(total)}</td>
        </tr>
      </table>`;
  }
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-top:2px solid ${COLORS.text};padding-top:12px;">
      <tr><td style="padding:3px 0;font-size:13px;color:${COLORS.muted};">ยอดรวมทั้งหมด</td><td style="padding:3px 0;text-align:right;font-size:13px;color:${COLORS.muted};">${formatMoney(total)}</td></tr>
      <tr><td style="padding:3px 0;font-size:13px;color:${COLORS.muted};">ชำระมัดจำแล้ว</td><td style="padding:3px 0;text-align:right;font-size:13px;color:#166534;">${formatMoney(amountPaid)}</td></tr>
      <tr><td style="padding:6px 0 0;font-size:15px;font-weight:800;color:${COLORS.text};">ยอดคงเหลือที่ต้องชำระ</td><td style="padding:6px 0 0;text-align:right;font-size:20px;font-weight:800;color:#b45309;">${formatMoney(balanceDue)}</td></tr>
    </table>`;
}

function referenceCard({ reference, status, theme }) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${theme.light};border-radius:14px;margin-bottom:22px;">
      <tr>
        <td style="padding:20px 22px;">
          <p style="margin:0 0 5px;font-size:11px;font-weight:700;color:${theme.primaryDark};text-transform:uppercase;letter-spacing:0.06em;">เลขที่การจอง</p>
          <p style="margin:0 0 12px;font-size:24px;font-weight:800;color:${COLORS.text};letter-spacing:0.01em;">${escapeHtml(reference)}</p>
          ${statusBadge(status)}
        </td>
      </tr>
    </table>`;
}

// The header band, recipient badge and footer are the same shape every time; only the
// accent color + label text change per audience, so the recipient is unmistakable even
// skimming an inbox with all three types mixed together.
function layout({ audience, brandName, preheader, heading, intro, bodyHtml }) {
  const theme = AUDIENCES[audience];
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(brandName)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans Thai','Noto Sans',Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:36px 16px;background:${COLORS.bg};">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">
        <tr>
          <td align="center" style="padding-bottom:12px;">
            <span style="display:inline-block;padding:6px 16px;border-radius:999px;background:${theme.primaryDark};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.02em;">
              ${theme.icon}&nbsp;&nbsp;${escapeHtml(theme.label)}
            </span>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.1);border:1px solid ${COLORS.border};">
        <tr>
          <td style="background:linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark} 100%);padding:26px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="width:38px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:10px;">
                  <tr><td align="center" style="color:#ffffff;font-size:17px;font-weight:800;">${escapeHtml((brandName || 'B').charAt(0))}</td></tr>
                </table>
              </td>
              <td style="color:#ffffff;font-size:16px;font-weight:700;padding-left:11px;">${escapeHtml(brandName)}</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:34px 32px;">
            <h1 style="margin:0 0 10px;font-size:21px;color:${COLORS.text};line-height:1.35;">${escapeHtml(heading)}</h1>
            ${intro ? `<p style="margin:0 0 22px;font-size:14px;color:${COLORS.muted};line-height:1.65;">${escapeHtml(intro)}</p>` : ''}
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:${COLORS.bg};border-top:1px solid ${COLORS.border};">
            <p style="margin:0;font-size:11.5px;color:#94a3b8;line-height:1.6;">อีเมลนี้ส่งโดยอัตโนมัติจากระบบของ ${escapeHtml(brandName)} กรุณาอย่าตอบกลับอีเมลฉบับนี้</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

async function loadProductName(productId) {
  const [row] = await query(
    `SELECT COALESCE(pt.name, p.code) AS name FROM products p
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'th'
     WHERE p.id = ?`,
    [productId],
  );
  return row?.name || null;
}

async function loadBrandName() {
  const [row] = await query('SELECT value FROM settings WHERE `key` = "business_info"');
  return row?.value?.name || 'Booking Platform';
}

const NOTIFICATION_POLICY_DEFAULTS = {
  customerStatusChange: { confirmed: true, completed: true, cancelled: true, no_show: true },
  employeeAssigned: true,
  adminNewBooking: true,
  adminRescheduleRequest: true,
  adminCancelRequest: true,
};

async function loadNotificationPolicy() {
  const [row] = await query('SELECT value FROM settings WHERE `key` = "notification_policy"');
  const stored = row?.value || {};
  return {
    ...NOTIFICATION_POLICY_DEFAULTS,
    ...stored,
    customerStatusChange: { ...NOTIFICATION_POLICY_DEFAULTS.customerStatusChange, ...stored.customerStatusChange },
  };
}

async function sendMail(bookingId, to, subject, { text, html }) {
  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, text, html });
    await query('INSERT INTO notifications_log (booking_id, channel, recipient, status, detail) VALUES (?, "email", ?, "sent", ?)', [
      bookingId,
      to,
      subject,
    ]);
  } catch (err) {
    console.error(`Failed to send email for booking ${bookingId} to ${to}`, err);
    await query('INSERT INTO notifications_log (booking_id, channel, recipient, status, detail) VALUES (?, "email", ?, "failed", ?)', [
      bookingId,
      to,
      err.message,
    ]);
  }
}

// Loads everything a notification needs straight from the booking id, so callers never
// have to hand-assemble a booking-shaped object (a mismatch there previously meant this
// could only safely be called right after INSERT, from inside the create-booking route).
async function loadBookingForNotification(bookingId) {
  const [booking] = await query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return null;
  const [items, extras, [{ paidSum }]] = await Promise.all([
    query('SELECT price_tier_id AS priceTierId, label, price, quantity FROM booking_items WHERE booking_id = ?', [bookingId]),
    query('SELECT extra_id AS extraId, name, price FROM booking_extras WHERE booking_id = ?', [bookingId]),
    query('SELECT COALESCE(SUM(amount), 0) AS paidSum FROM payments WHERE booking_id = ? AND status = "paid"', [bookingId]),
  ]);
  const amountPaid = Number(paidSum);
  const balanceDue = Math.max(0, Number(booking.total_price) - amountPaid);
  return {
    id: booking.id,
    reference: booking.reference,
    productId: booking.product_id,
    employeeId: booking.employee_id,
    dateStart: booking.date_start,
    timeStart: booking.time_start,
    guests: booking.guests,
    amountPaid,
    balanceDue,
    guestName: booking.guest_name,
    guestEmail: booking.guest_email,
    guestPhone: booking.guest_phone,
    status: booking.status,
    cancelReason: booking.cancel_reason,
    totalPrice: Number(booking.total_price),
    items: items.map((it) => ({ ...it, price: Number(it.price), quantity: Number(it.quantity) })),
    extras: extras.map((e) => ({ ...e, price: Number(e.price) })),
  };
}

// Notifies everyone with a stake in a booking, each with their own themed email, skipping
// anyone who doesn't have one on file: the guest (always required), the assigned employee
// (only if their profile has an email set), and every active admin account. Called once the
// booking is in its final state for this moment — right after creation when no online
// payment is involved, or after Stripe confirms payment when it is (see routes/bookings.js
// and routes/payments.js for where each path calls this).
async function sendBookingNotifications(bookingId) {
  const booking = await loadBookingForNotification(bookingId);
  if (!booking) return;

  const [brandName, productName, notificationPolicy] = await Promise.all([
    loadBrandName(),
    loadProductName(booking.productId),
    loadNotificationPolicy(),
  ]);
  const when = booking.dateStart ? `${formatDateLabel(booking.dateStart)}${booking.timeStart ? ` · ${booking.timeStart} น.` : ''}` : '';
  const tasks = [];

  // ---- Customer ----
  const customerTheme = AUDIENCES.customer;
  const customerBody = `
    ${referenceCard({ reference: booking.reference, status: booking.status, theme: customerTheme })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRows([
        { label: 'บริการ', value: productName },
        { label: 'วันที่', value: when },
        { label: 'จำนวนผู้เข้าพัก/ผู้ร่วมกิจกรรม', value: booking.guests ? String(booking.guests) : '' },
      ])}
    </table>
    ${itemsBlock(booking.items, booking.extras, customerTheme.primaryDark)}
    ${totalRow(booking.totalPrice, customerTheme.primaryDark, booking.amountPaid, booking.balanceDue)}`;
  tasks.push(
    sendMail(booking.id, booking.guestEmail, `การจอง ${booking.reference} — ${brandName}`, {
      text: `เลขที่การจองของคุณคือ ${booking.reference} สถานะ: ${STATUS_LABELS_TH[booking.status] || booking.status}`,
      html: layout({
        audience: 'customer',
        brandName,
        preheader: `การจอง ${booking.reference} ของคุณ${booking.status === 'confirmed' ? 'ได้รับการยืนยันแล้ว' : 'ถูกบันทึกแล้ว'}`,
        heading: booking.status === 'confirmed' ? 'การจองของคุณได้รับการยืนยันแล้ว 🎉' : 'เราได้รับการจองของคุณแล้ว',
        intro: `สวัสดีคุณ${booking.guestName} ขอบคุณที่ใช้บริการกับเรา นี่คือรายละเอียดการจองของคุณ`,
        bodyHtml: customerBody,
      }),
    }),
  );

  // ---- Assigned employee ----
  if (booking.employeeId && notificationPolicy.employeeAssigned) {
    tasks.push(sendEmployeeAssignedEmail({ booking, brandName, productName, when, reassigned: false }));
  }

  // ---- Admins ----
  if (notificationPolicy.adminNewBooking) {
    const admins = await query('SELECT email FROM admins WHERE is_active = 1');
    if (admins.length > 0) {
      const adminTheme = AUDIENCES.admin;
      const adminBody = `
        ${referenceCard({ reference: booking.reference, status: booking.status, theme: adminTheme })}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailRows([
            { label: 'บริการ', value: productName },
            { label: 'วันที่', value: when },
            { label: 'ลูกค้า', value: booking.guestName },
            { label: 'อีเมล', value: booking.guestEmail },
            { label: 'เบอร์โทร', value: booking.guestPhone },
          ])}
        </table>
        ${itemsBlock(booking.items, booking.extras, adminTheme.primaryDark)}
        ${totalRow(booking.totalPrice, adminTheme.primaryDark, booking.amountPaid, booking.balanceDue)}`;
      const adminHtml = layout({
        audience: 'admin',
        brandName,
        preheader: `มีการจองใหม่ ${booking.reference} จาก ${booking.guestName}`,
        heading: 'มีการจองใหม่เข้ามา',
        intro: '',
        bodyHtml: adminBody,
      });
      const adminText =
        `การจองใหม่ ${booking.reference} จาก ${booking.guestName} (${booking.guestEmail}, ${booking.guestPhone}).` +
        `${when ? ` วันที่: ${when}.` : ''} ยอดรวม: ${formatMoney(booking.totalPrice)} สถานะ: ${STATUS_LABELS_TH[booking.status] || booking.status}`;
      for (const admin of admins) {
        tasks.push(sendMail(booking.id, admin.email, `มีการจองใหม่: ${booking.reference} — ${brandName}`, { text: adminText, html: adminHtml }));
      }
    }
  }

  await Promise.all(tasks);
}

// Shared by both the initial booking-created flow above and a reschedule that changes
// who's assigned (see notifyRescheduled) — same "you have a new job" shape either way,
// just a different intro line so a reassignment doesn't read like a brand-new booking.
async function sendEmployeeAssignedEmail({ booking, brandName, productName, when, reassigned }) {
  const [employee] = await query('SELECT email FROM employees WHERE id = ?', [booking.employeeId]);
  if (!employee?.email) return;
  const theme = AUDIENCES.employee;
  const body = `
    ${referenceCard({ reference: booking.reference, status: booking.status, theme })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRows([
        { label: 'บริการ', value: productName },
        { label: 'วันที่', value: when },
        { label: 'ลูกค้า', value: booking.guestName },
        { label: 'เบอร์โทร', value: booking.guestPhone },
      ])}
    </table>`;
  const heading = reassigned ? 'คุณได้รับมอบหมายงานนี้ (เปลี่ยนแปลงกำหนดการ)' : 'คุณได้รับมอบหมายงานใหม่';
  const intro = reassigned
    ? 'กำหนดการของงานนี้มีการเปลี่ยนแปลง และคุณคือผู้ดูแลตามกำหนดการใหม่ นี่คือรายละเอียดล่าสุด'
    : 'มีการจองใหม่ที่มอบหมายให้คุณดูแล นี่คือรายละเอียด';
  return sendMail(booking.id, employee.email, `${reassigned ? 'งานที่ได้รับมอบหมาย (อัปเดต)' : 'งานใหม่ที่ได้รับมอบหมาย'}: ${booking.reference} — ${brandName}`, {
    text: `คุณได้รับมอบหมายให้ดูแลการจอง ${booking.reference} ของ ${booking.guestName}${when ? ` วันที่ ${when}` : ''} สถานะ: ${STATUS_LABELS_TH[booking.status] || booking.status}`,
    html: layout({ audience: 'employee', brandName, preheader: `คุณมีงาน: ${booking.reference}`, heading, intro, bodyHtml: body }),
  });
}

const STATUS_CHANGE_COPY_TH = {
  confirmed: { heading: 'การจองของคุณได้รับการยืนยันแล้ว 🎉', intro: 'ขอบคุณที่รอนะคะ/ครับ การจองของคุณได้รับการยืนยันเรียบร้อยแล้ว' },
  completed: { heading: 'การจองของคุณเสร็จสมบูรณ์แล้ว ✅', intro: 'ขอบคุณที่ใช้บริการกับเรา หวังว่าคุณจะประทับใจ' },
  cancelled: { heading: 'การจองของคุณถูกยกเลิกแล้ว', intro: 'นี่คือรายละเอียดการจองที่ถูกยกเลิก' },
  no_show: { heading: 'บันทึกว่าคุณไม่ได้มาตามนัด', intro: 'ระบบได้บันทึกว่าไม่มีการเข้าใช้บริการตามวันเวลาที่จองไว้' },
  pending: { heading: 'สถานะการจองของคุณถูกเปลี่ยนกลับเป็นรอดำเนินการ', intro: 'ทีมงานจะตรวจสอบและยืนยันการจองของคุณอีกครั้งเร็ว ๆ นี้' },
};

// Fired whenever a booking's status actually transitions post-creation — admin manually
// changing it, admin cancelling it, or a guest's own instant self-cancel (the approval-
// gated path uses notifyChangeRequestResolved instead, since the status doesn't change
// until an admin signs off). Deliberately NOT reused for the initial creation email
// (sendBookingNotifications) — that one has its own pending/confirmed-at-creation wording.
async function notifyStatusChanged(bookingId, newStatus) {
  const notificationPolicy = await loadNotificationPolicy();
  if (!notificationPolicy.customerStatusChange[newStatus]) return;
  const booking = await loadBookingForNotification(bookingId);
  if (!booking) return;
  const [brandName, productName] = await Promise.all([loadBrandName(), loadProductName(booking.productId)]);
  const when = booking.dateStart ? `${formatDateLabel(booking.dateStart)}${booking.timeStart ? ` · ${booking.timeStart} น.` : ''}` : '';
  const copy = STATUS_CHANGE_COPY_TH[newStatus] || { heading: 'สถานะการจองของคุณมีการเปลี่ยนแปลง', intro: '' };
  const theme = AUDIENCES.customer;
  const body = `
    ${referenceCard({ reference: booking.reference, status: newStatus, theme })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRows([
        { label: 'บริการ', value: productName },
        { label: 'วันที่', value: when },
        ...(newStatus === 'cancelled' && booking.cancelReason ? [{ label: 'เหตุผล', value: booking.cancelReason }] : []),
      ])}
    </table>
    ${itemsBlock(booking.items, booking.extras, theme.primaryDark)}
    ${totalRow(booking.totalPrice, theme.primaryDark, booking.amountPaid, booking.balanceDue)}`;
  await sendMail(booking.id, booking.guestEmail, `${copy.heading} — ${booking.reference}`, {
    text: `การจอง ${booking.reference} ของคุณเปลี่ยนสถานะเป็น: ${STATUS_LABELS_TH[newStatus] || newStatus}`,
    html: layout({ audience: 'customer', brandName, preheader: `การจอง ${booking.reference}: ${STATUS_LABELS_TH[newStatus] || newStatus}`, heading: copy.heading, intro: copy.intro, bodyHtml: body }),
  });
}

// Fired when a reschedule actually takes effect via the INSTANT self-service path (no
// admin approval required). Not used for the approval-gated path — there,
// notifyChangeRequestResolved already tells the customer their request was approved, so
// this function's own customer email would just be a confusing duplicate; that path calls
// notifyEmployeeReassigned directly instead, to still cover the employee side.
// previousSlotLabel is a plain string (already formatted by the caller) so this function
// doesn't need to know which booking type's date/time shape produced it.
async function notifyRescheduled(bookingId, previousSlotLabel, employeeChanged) {
  const booking = await loadBookingForNotification(bookingId);
  if (!booking) return;
  const [brandName, productName] = await Promise.all([loadBrandName(), loadProductName(booking.productId)]);
  const when = booking.dateStart ? `${formatDateLabel(booking.dateStart)}${booking.timeStart ? ` · ${booking.timeStart} น.` : ''}` : '';
  const theme = AUDIENCES.customer;
  const body = `
    ${referenceCard({ reference: booking.reference, status: booking.status, theme })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRows([
        { label: 'กำหนดการเดิม', value: previousSlotLabel },
        { label: 'กำหนดการใหม่', value: when },
        { label: 'บริการ', value: productName },
      ])}
    </table>`;
  const tasks = [
    sendMail(booking.id, booking.guestEmail, `เลื่อนนัดสำเร็จ: ${booking.reference} — ${brandName}`, {
      text: `การจอง ${booking.reference} ถูกเลื่อนจาก ${previousSlotLabel} เป็น ${when}`,
      html: layout({
        audience: 'customer',
        brandName,
        preheader: `การจอง ${booking.reference} ถูกเลื่อนนัดแล้ว`,
        heading: 'การจองของคุณถูกเลื่อนนัดเรียบร้อยแล้ว 🗓️',
        intro: 'นี่คือกำหนดการใหม่ของคุณ',
        bodyHtml: body,
      }),
    }),
  ];
  if (employeeChanged) tasks.push(notifyEmployeeReassigned(bookingId, { booking, brandName, productName, when }));
  await Promise.all(tasks);
}

// The employee-facing half of a reschedule that changed who's assigned — split out from
// notifyRescheduled so the approval-gated path (where the customer's "approved" email
// already comes from notifyChangeRequestResolved) can still cover the employee without
// also re-sending a redundant customer email.
async function notifyEmployeeReassigned(bookingId, preloaded) {
  const notificationPolicy = await loadNotificationPolicy();
  if (!notificationPolicy.employeeAssigned) return;
  const booking = preloaded?.booking || (await loadBookingForNotification(bookingId));
  if (!booking || !booking.employeeId) return;
  const [brandName, productName] = preloaded
    ? [preloaded.brandName, preloaded.productName]
    : await Promise.all([loadBrandName(), loadProductName(booking.productId)]);
  const when = preloaded?.when ?? (booking.dateStart ? `${formatDateLabel(booking.dateStart)}${booking.timeStart ? ` · ${booking.timeStart} น.` : ''}` : '');
  await sendEmployeeAssignedEmail({ booking, brandName, productName, when, reassigned: true });
}

const CHANGE_REQUEST_TYPE_TH = { cancel: 'ยกเลิก', reschedule: 'เลื่อนนัด' };

// Sent the moment a guest submits a self-service cancel/reschedule request under the
// "requires admin approval" policy — an ack to the guest (so they know it wasn't just
// swallowed) and, if the corresponding admin toggle is on, a heads-up to every active
// admin with the detail needed to act on it from /admin/booking-requests.
async function notifyChangeRequestSubmitted(bookingId, type, { requestedSummary } = {}) {
  const booking = await loadBookingForNotification(bookingId);
  if (!booking) return;
  const [brandName, productName, notificationPolicy] = await Promise.all([loadBrandName(), loadProductName(booking.productId), loadNotificationPolicy()]);
  const typeLabel = CHANGE_REQUEST_TYPE_TH[type];
  const tasks = [];

  const customerTheme = AUDIENCES.customer;
  const customerBody = `
    ${referenceCard({ reference: booking.reference, status: booking.status, theme: customerTheme })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRows([
        { label: 'บริการ', value: productName },
        { label: 'ประเภทคำขอ', value: typeLabel },
        ...(requestedSummary ? [{ label: 'รายละเอียดที่ขอ', value: requestedSummary }] : []),
      ])}
    </table>`;
  tasks.push(
    sendMail(booking.id, booking.guestEmail, `รับคำขอ${typeLabel}แล้ว รอการอนุมัติ: ${booking.reference} — ${brandName}`, {
      text: `เราได้รับคำขอ${typeLabel}การจอง ${booking.reference} ของคุณแล้ว และกำลังรอการตรวจสอบจากแอดมิน`,
      html: layout({
        audience: 'customer',
        brandName,
        preheader: `คำขอ${typeLabel}ของคุณกำลังรอการอนุมัติ`,
        heading: `รับคำขอ${typeLabel}แล้ว — รอการอนุมัติ ⏳`,
        intro: `เราได้รับคำขอของคุณแล้ว ทีมงานจะตรวจสอบและแจ้งผลกลับไปทางอีเมลนี้เร็ว ๆ นี้`,
        bodyHtml: customerBody,
      }),
    }),
  );

  const adminToggle = type === 'cancel' ? notificationPolicy.adminCancelRequest : notificationPolicy.adminRescheduleRequest;
  if (adminToggle) {
    const admins = await query('SELECT email FROM admins WHERE is_active = 1');
    if (admins.length > 0) {
      const adminTheme = AUDIENCES.admin;
      const adminBody = `
        ${referenceCard({ reference: booking.reference, status: booking.status, theme: adminTheme })}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailRows([
            { label: 'บริการ', value: productName },
            { label: 'ลูกค้า', value: booking.guestName },
            { label: 'ประเภทคำขอ', value: typeLabel },
            ...(requestedSummary ? [{ label: 'รายละเอียดที่ขอ', value: requestedSummary }] : []),
          ])}
        </table>
        <p style="margin:18px 0 0;font-size:13px;color:${COLORS.muted};">กรุณาตรวจสอบและอนุมัติ/ปฏิเสธคำขอนี้ที่หน้า "คำขอเปลี่ยนแปลงการจอง" ในระบบแอดมิน</p>`;
      const adminHtml = layout({
        audience: 'admin',
        brandName,
        preheader: `มีคำขอ${typeLabel}ใหม่ที่ต้องอนุมัติ: ${booking.reference}`,
        heading: `มีคำขอ${typeLabel}ใหม่ — ต้องอนุมัติ`,
        intro: '',
        bodyHtml: adminBody,
      });
      const adminText = `คำขอ${typeLabel}ใหม่สำหรับการจอง ${booking.reference} จาก ${booking.guestName} — กรุณาตรวจสอบในระบบแอดมิน`;
      for (const admin of admins) {
        tasks.push(sendMail(booking.id, admin.email, `มีคำขอ${typeLabel}ใหม่: ${booking.reference} — ${brandName}`, { text: adminText, html: adminHtml }));
      }
    }
  }

  await Promise.all(tasks);
}

// Sent once an admin has decided a pending change request — approved or rejected. Applies
// either way: when approved, the booking has already been updated (or cancelled) by the
// caller before this fires, so `booking.status`/schedule in the email is the new reality.
async function notifyChangeRequestResolved(bookingId, type, outcome, adminNote) {
  const booking = await loadBookingForNotification(bookingId);
  if (!booking) return;
  const [brandName, productName] = await Promise.all([loadBrandName(), loadProductName(booking.productId)]);
  const when = booking.dateStart ? `${formatDateLabel(booking.dateStart)}${booking.timeStart ? ` · ${booking.timeStart} น.` : ''}` : '';
  const typeLabel = CHANGE_REQUEST_TYPE_TH[type];
  const approved = outcome === 'approved';
  const theme = AUDIENCES.customer;
  const body = `
    ${referenceCard({ reference: booking.reference, status: booking.status, theme })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRows([
        { label: 'บริการ', value: productName },
        { label: 'กำหนดการปัจจุบัน', value: when },
        ...(adminNote ? [{ label: 'หมายเหตุจากแอดมิน', value: adminNote }] : []),
      ])}
    </table>`;
  const heading = approved ? `คำขอ${typeLabel}ของคุณได้รับการอนุมัติแล้ว ✅` : `คำขอ${typeLabel}ของคุณไม่ได้รับการอนุมัติ`;
  const intro = approved ? 'แอดมินได้อนุมัติคำขอของคุณเรียบร้อยแล้ว นี่คือรายละเอียดล่าสุด' : 'ขออภัยในความไม่สะดวก การจองของคุณยังคงเป็นไปตามเดิม';
  await sendMail(booking.id, booking.guestEmail, `${heading} — ${booking.reference}`, {
    text: `คำขอ${typeLabel}สำหรับการจอง ${booking.reference} ของคุณ${approved ? 'ได้รับการอนุมัติแล้ว' : 'ไม่ได้รับการอนุมัติ'}`,
    html: layout({ audience: 'customer', brandName, preheader: heading, heading, intro, bodyHtml: body }),
  });
}

module.exports = {
  sendBookingNotifications,
  notifyStatusChanged,
  notifyRescheduled,
  notifyEmployeeReassigned,
  notifyChangeRequestSubmitted,
  notifyChangeRequestResolved,
};
