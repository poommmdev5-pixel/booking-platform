<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { loadStripe } from '@stripe/stripe-js';
import { productsApi } from '../../api/products';
import { calendarApi } from '../../api/calendar';
import { bookingsApi } from '../../api/bookings';
import { paymentsApi } from '../../api/payments';
import { customersApi } from '../../api/customers';
import { useAuth } from '../../composables/useAuth';
import { formatCurrency, formatMinutes, formatDate } from '../../i18n';
import { usePagination } from '../../composables/usePagination';
import { useLocaleRefetch } from '../../composables/useLocaleRefetch';
import Pagination from '../../components/Pagination.vue';
import MonthCalendar from '../../components/MonthCalendar.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import BackButton from '../../components/BackButton.vue';

// Stripe's own theming API (separate from the page's CSS) — 'night' is its built-in dark
// base, tuned here to the client theme's charcoal/gold/ivory palette so the embedded card
// form doesn't render as a plain white box in the middle of a dark page.
const STRIPE_APPEARANCE = {
  theme: 'night',
  variables: {
    colorPrimary: '#c7a04a',
    colorBackground: '#41331f',
    colorText: '#f1e9d8',
    colorTextSecondary: '#b3a788',
    colorDanger: '#d99a8a',
    fontFamily: 'Inter, "Noto Sans Thai", sans-serif',
    borderRadius: '8px',
  },
  rules: {
    '.Input': { border: '1px solid rgba(241, 233, 216, 0.08)' },
    '.Input:focus': { border: '1px solid #c7a04a', boxShadow: '0 0 0 3px rgba(199, 160, 74, 0.14)' },
  },
};

const { t: translate, locale } = useI18n();
const { isCustomer } = useAuth();

const props = defineProps({ productId: { type: String, required: true } });

const product = ref(null);
const step = ref(1);

// Party size for stay / stay_session (a single appointment/room, one quantity). Session
// type doesn't use this — it has its own per-tier quantities in the cart below.
const guests = ref(1);

const sessionDates = ref([]);
const sessionDatesLoaded = ref(false);
const selectedSessionDate = ref(null);
const sessions = ref([]);
const sessionsLoaded = ref(false);
const selectedSessionId = ref(null);

const sessionEmployees = ref([]);
const sessionEmployeesLoaded = ref(false);
const selectedEmployeeId = ref(null);

// Session-type cart: a round can sell more than one kind of unit (e.g. adult/child), each
// with its own price and remaining stock, so the customer builds an order of one or more
// tier+quantity lines instead of picking a single tier up front.
const cartFocusTierId = ref(null);
const cartQuantityDraft = ref(1);
const cartLines = ref([]); // [{ priceTierId, label, price, quantity }]

// Local calendar date, not toISOString()'s UTC date (see MonthCalendar.vue) — otherwise
// the initial month shown can be a day off during the first hours of the local day.
function toLocalISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const staySelectedMonth = ref(toLocalISODate(new Date()).slice(0, 7));
const stayDayStatus = ref(new Map());
const stayMonthsFetched = ref(new Set());
const stayCheckIn = ref(null);
const stayCheckOut = ref(null);
const stayRangeError = ref('');

const staySessionDate = ref(null);
const staySessionTimeStart = ref('10:00');
const staySessionEmployees = ref([]);
const staySessionEmployeesLoaded = ref(false);
const selectedStaySessionEmployeeId = ref(null);

const productExtras = computed(() => product.value?.extras || []);
const hasExtras = computed(() => productExtras.value.length > 0);
const selectedExtraIds = ref([]);

const productPriceTiers = computed(() => product.value?.priceTiers || []);
const selectedPriceTierId = ref(null);

const { page: datesPage, totalPages: datesTotalPages, pageItems: pageSessionDates, reset: resetDatesPage } = usePagination(sessionDates, 5);
const { page: sessionsPage, totalPages: sessionsTotalPages, pageItems: pageSessions, reset: resetSessionsPage } = usePagination(sessions, 5);
const {
  page: employeesPage,
  totalPages: employeesTotalPages,
  pageItems: pageSessionEmployees,
  reset: resetEmployeesPage,
} = usePagination(sessionEmployees, 5);
const { page: extrasPage, totalPages: extrasTotalPages, pageItems: pageExtras, reset: resetExtrasPage } = usePagination(productExtras, 5);
const {
  page: staySessionEmployeesPage,
  totalPages: staySessionEmployeesTotalPages,
  pageItems: pageStaySessionEmployees,
  reset: resetStaySessionEmployeesPage,
} = usePagination(staySessionEmployees, 5);

const guestName = ref('');
const guestEmail = ref('');
const guestPhone = ref('');
const note = ref('');
const acceptedTerms = ref(false);
const submitting = ref(false);
const error = ref('');
const result = ref(null);

// 'skip' means payments aren't configured (no Stripe keys yet) — the flow degrades
// gracefully to the old instant-success behavior rather than dead-ending.
const paymentsEnabled = ref(false);
const depositEnabled = ref(false);
const depositPercent = ref(30);
const paymentType = ref('full'); // 'full' | 'deposit' — which one the customer picked (or the only option, when deposits are off)
const stripePromise = ref(null);
const stripeInstance = ref(null);
const stripeElements = ref(null);
// idle | choose (pick full/deposit) | loading | ready | processing | paid | error | skip
const paymentStatus = ref('idle');
const paymentError = ref('');
const paidAmount = ref(0);
const balanceDue = ref(0);

function depositAmount() {
  return Math.round(Number(result.value?.totalPrice || 0) * depositPercent.value) / 100;
}

onMounted(async () => {
  product.value = await productsApi.getPublic(props.productId);
  guests.value = 1;
  selectedPriceTierId.value = product.value.priceTiers[0]?.id || null;
  resetExtrasPage();
  if (product.value.bookingType === 'session') await loadSessionDates();
  else if (product.value.bookingType === 'stay' || product.value.bookingType === 'stay_session') {
    await loadStayMonth(staySelectedMonth.value);
  }
  // Pre-fill from the account for a logged-in customer so they're not asked to retype
  // what they already gave us at registration — still just a starting value, editable
  // like any other field, never locked.
  if (isCustomer.value) {
    try {
      const me = await customersApi.me();
      guestName.value = me.name || '';
      guestEmail.value = me.email || '';
      guestPhone.value = me.phone || '';
    } catch {
      // Non-critical convenience — fall back to the normal blank guest form.
    }
  }
  try {
    const cfg = await paymentsApi.getConfig();
    paymentsEnabled.value = cfg.enabled;
    depositEnabled.value = !!cfg.depositEnabled;
    depositPercent.value = cfg.depositPercent || 30;
    if (cfg.enabled) stripePromise.value = loadStripe(cfg.publishableKey);
  } catch {
    paymentsEnabled.value = false;
  }
});

// Re-fetch on language switch for the translated name/location/extras text — every other
// ref here (selected dates, cart, guest form, step) is independent local state untouched
// by this, and price tier ids stay stable across locales so selectedPriceTierId is safe.
useLocaleRefetch(async () => {
  if (!product.value) return;
  product.value = await productsApi.getPublic(props.productId);
});

async function initPayment() {
  if (!paymentsEnabled.value) {
    paymentStatus.value = 'skip';
    return;
  }
  // Let the customer choose full vs. deposit before creating the Stripe PaymentIntent —
  // selectPaymentType() picks up from here once they've decided (or immediately, when
  // deposits aren't offered, since there's nothing to choose).
  if (depositEnabled.value) {
    paymentStatus.value = 'choose';
    return;
  }
  await createPaymentIntent('full');
}

async function selectPaymentType(type) {
  paymentType.value = type;
  await createPaymentIntent(type);
}

// Lets the customer change their mind between full/deposit right up until they actually
// pay — unmounts the currently-mounted Payment Element first (mounting a fresh one from a
// new PaymentIntent into the same container without unmounting first can leave the old
// iframe behind), then drops back to the same choice screen initPayment() shows up front.
function switchPaymentType() {
  stripeElements.value?.getElement('payment')?.unmount();
  stripeElements.value = null;
  paymentError.value = '';
  paymentStatus.value = 'choose';
}

async function createPaymentIntent(type) {
  paymentStatus.value = 'loading';
  paymentError.value = '';
  await nextTick();
  try {
    const res = await paymentsApi.createIntent({
      bookingId: result.value.id,
      reference: result.value.reference,
      email: guestEmail.value,
      paymentType: type,
    });
    stripeInstance.value = await stripePromise.value;
    if (!stripeInstance.value) throw new Error('Stripe.js failed to load');
    // Match Stripe's own UI chrome (tab labels, field hints, error copy) to whichever
    // language is currently active — otherwise Stripe falls back to browser-detected
    // locale, which can mismatch the rest of the page (e.g. English UI, Thai Stripe tabs).
    stripeElements.value = stripeInstance.value.elements({
      clientSecret: res.clientSecret,
      appearance: STRIPE_APPEARANCE,
      locale: locale.value,
    });
    // Pre-fill from the guest details already collected a step earlier (e.g. PromptPay's own
    // email field) so the customer isn't asked to retype what they already gave us.
    stripeElements.value
      .create('payment', {
        defaultValues: {
          billingDetails: { name: guestName.value, email: guestEmail.value, phone: guestPhone.value },
        },
      })
      .mount('#payment-element');
    paymentStatus.value = 'ready';
  } catch (err) {
    paymentStatus.value = 'error';
    paymentError.value = err.message;
  }
}

async function payNow() {
  if (!stripeInstance.value || !stripeElements.value) return;
  paymentStatus.value = 'processing';
  paymentError.value = '';
  const { error: stripeError, paymentIntent } = await stripeInstance.value.confirmPayment({
    elements: stripeElements.value,
    redirect: 'if_required',
  });
  if (stripeError) {
    paymentStatus.value = 'ready';
    paymentError.value = stripeError.message;
    return;
  }
  // The customer can dismiss a redirect-style method (e.g. closing the PromptPay QR
  // without scanning) without Stripe.js returning an error — confirmPayment then resolves
  // with a paymentIntent that never reached 'succeeded'. Treat anything else as incomplete
  // rather than assuming success just because the call didn't throw.
  if (paymentIntent?.status !== 'succeeded') {
    paymentStatus.value = 'ready';
    paymentError.value = translate('booking.paymentIncomplete');
    return;
  }
  try {
    const res = await paymentsApi.confirm({
      paymentIntentId: paymentIntent.id,
      bookingId: result.value.id,
      reference: result.value.reference,
      email: guestEmail.value,
    });
    if (res.success) {
      paidAmount.value = paymentType.value === 'deposit' ? depositAmount() : result.value.totalPrice;
      balanceDue.value = res.balanceDue ?? 0;
      paymentStatus.value = 'paid';
    } else {
      paymentStatus.value = 'ready';
      paymentError.value = translate('booking.paymentIncomplete');
    }
  } catch (err) {
    paymentStatus.value = 'ready';
    paymentError.value = err.message;
  }
}

async function loadStayMonth(month) {
  if (stayMonthsFetched.value.has(month)) return;
  const { days } = await calendarApi.getStayCalendar(product.value.id, month);
  for (const d of days) stayDayStatus.value.set(d.date, d);
  stayMonthsFetched.value.add(month);
}

// Guests here only governs stay / stay_session party size — session capacity is handled
// entirely by the cart's per-tier quantities.
watch(guests, (v) => {
  if (!product.value || product.value.bookingType === 'session') return;
  const max = product.value.maxGuests || 1;
  if (!v || v < 1) guests.value = 1;
  else if (v > max) guests.value = max;
});

watch(staySelectedMonth, (month) => {
  if (product.value?.bookingType === 'stay' || product.value?.bookingType === 'stay_session') loadStayMonth(month);
});

function tierLabel(tier) {
  if (!tier) return '';
  if (product.value.bookingType === 'stay') return translate('product.oneNight');
  if (product.value.bookingType === 'stay_session') return formatMinutes(tier.minutes);
  return tier.label;
}

function selectPriceTier(id) {
  selectedPriceTierId.value = id;
  if (product.value.bookingType === 'stay_session') refreshStaySessionEmployees();
}

function computedStaySessionTimeEnd() {
  const minutes = selectedPriceTier()?.minutes;
  if (!staySessionTimeStart.value || !minutes) return null;
  const [h, m] = staySessionTimeStart.value.split(':').map(Number);
  const total = h * 60 + m + Number(minutes);
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Day-level past dates are already excluded server-side (stay calendar's isOpen checks
// date >= today), but that leaves today's own clock-time unchecked client-side — pick
// 09:00 at 2pm today and the only feedback used to be a rejection at final submit. Check
// immediately so the customer finds out before going any further, not after.
const staySessionPastTimeError = ref('');
function checkStaySessionPastTime() {
  staySessionPastTimeError.value = '';
  if (!staySessionDate.value || !staySessionTimeStart.value) return;
  const now = new Date();
  const todayStr = toLocalISODate(now);
  if (staySessionDate.value !== todayStr) return;
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (staySessionTimeStart.value <= nowTime) staySessionPastTimeError.value = translate('booking.timeInPast');
}

async function refreshStaySessionEmployees() {
  selectedStaySessionEmployeeId.value = null;
  staySessionEmployees.value = [];
  staySessionEmployeesLoaded.value = false;
  checkStaySessionPastTime();
  const timeEnd = computedStaySessionTimeEnd();
  if (!staySessionDate.value || !staySessionTimeStart.value || !timeEnd || staySessionPastTimeError.value) return;
  staySessionEmployees.value = await calendarApi.getStaySessionEmployees(
    product.value.id,
    staySessionDate.value,
    staySessionTimeStart.value,
    timeEnd,
  );
  staySessionEmployeesLoaded.value = true;
  resetStaySessionEmployeesPage();
}

async function onStaySessionDayClick(date) {
  const info = stayDayInfo(date);
  if (!info || !info.isOpen) return;
  staySessionDate.value = date;
  await refreshStaySessionEmployees();
}

function selectedStaySessionEmployee() {
  return staySessionEmployees.value.find((e) => e.id === selectedStaySessionEmployeeId.value) || null;
}

function stayDayInfo(date) {
  return stayDayStatus.value.get(date) || null;
}

function resetStaySelection() {
  stayCheckIn.value = null;
  stayCheckOut.value = null;
  stayRangeError.value = '';
}

function onStayDayClick(date) {
  stayRangeError.value = '';
  const info = stayDayInfo(date);
  if (!info || !info.isOpen) return;
  if (!stayCheckIn.value || stayCheckOut.value) {
    stayCheckIn.value = date;
    stayCheckOut.value = null;
    return;
  }
  if (date <= stayCheckIn.value) {
    stayCheckIn.value = date;
    return;
  }
  // Every night in [checkin, date) must be open — a holiday or closed day anywhere
  // inside the stay isn't allowed, so validate the whole span before accepting it.
  for (let d = new Date(`${stayCheckIn.value}T00:00:00Z`); d < new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const dayStr = d.toISOString().slice(0, 10);
    const dayInfo = stayDayInfo(dayStr);
    if (!dayInfo || !dayInfo.isOpen) {
      // Restart the selection at the clicked day instead of leaving the old check-in
      // stuck — the user can just try a new range rather than having to notice they
      // need to click an earlier day first.
      stayRangeError.value = translate('booking.rangeHasClosedDay');
      stayCheckIn.value = date;
      stayCheckOut.value = null;
      return;
    }
  }
  stayCheckOut.value = date;
}

function stayNights() {
  if (!stayCheckIn.value || !stayCheckOut.value) return 0;
  const start = new Date(`${stayCheckIn.value}T00:00:00Z`);
  const end = new Date(`${stayCheckOut.value}T00:00:00Z`);
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

async function loadSessionDates() {
  sessionDatesLoaded.value = false;
  sessionDates.value = await calendarApi.getSessionDates(product.value.id);
  sessionDatesLoaded.value = true;
  resetDatesPage();
}

async function selectSessionDate(date) {
  selectedSessionDate.value = date;
  selectedSessionId.value = null;
  sessionEmployees.value = [];
  selectedEmployeeId.value = null;
  sessionsLoaded.value = false;
  sessions.value = await calendarApi.getAvailableSessions(product.value.id, date);
  sessionsLoaded.value = true;
  resetSessionsPage();
}

function backToSessionDates() {
  selectedSessionDate.value = null;
  selectedSessionId.value = null;
  sessions.value = [];
  sessionEmployees.value = [];
  selectedEmployeeId.value = null;
}

function resetCart() {
  cartLines.value = [];
  cartFocusTierId.value = null;
  cartQuantityDraft.value = 1;
}

async function selectSession(sessionId) {
  selectedSessionId.value = sessionId;
  selectedEmployeeId.value = null;
  resetCart();
  sessionEmployeesLoaded.value = false;
  sessionEmployees.value = await calendarApi.getSessionEmployees(product.value.id, sessionId);
  sessionEmployeesLoaded.value = true;
  resetEmployeesPage();
}

function selectEmployee(id) {
  selectedEmployeeId.value = id;
  // Each employee's remaining stock per tier is independent, so switching who's picked
  // invalidates whatever was already in the cart.
  resetCart();
}

function selectedSession() {
  return sessions.value.find((s) => s.id === selectedSessionId.value) || null;
}

// Remaining is tracked per employee when the round has staff (picking a different
// employee changes what's left), or at the round level when it doesn't.
function activeTierStock() {
  if (sessionEmployees.value.length > 0) return selectedEmployee()?.tiers || [];
  return selectedSession()?.tiers || [];
}

// Merges the live remaining count with the product's own tier label/price so each cart
// row has everything it needs to render and price itself.
function selectedSessionTiers() {
  return activeTierStock().map((t) => {
    const info = productPriceTiers.value.find((p) => p.id === t.id) || {};
    return { id: t.id, label: info.label, price: Number(info.price || 0), remaining: t.remaining };
  });
}

function cartLineFor(tierId) {
  return cartLines.value.find((l) => l.priceTierId === tierId) || null;
}

function focusCartTier(tier) {
  if (tier.remaining === 0) return;
  cartFocusTierId.value = tier.id;
  const existing = cartLineFor(tier.id);
  cartQuantityDraft.value = existing ? existing.quantity : 1;
}

function stepCartDraft(delta) {
  const tier = selectedSessionTiers().find((t) => t.id === cartFocusTierId.value);
  const max = tier?.remaining ?? 999;
  cartQuantityDraft.value = Math.max(1, Math.min(max, (Number(cartQuantityDraft.value) || 1) + delta));
}

function addFocusedToCart() {
  const tier = selectedSessionTiers().find((t) => t.id === cartFocusTierId.value);
  if (!tier) return;
  let qty = Number(cartQuantityDraft.value) || 1;
  if (typeof tier.remaining === 'number') qty = Math.min(qty, tier.remaining);
  if (qty < 1) return;
  const existing = cartLineFor(tier.id);
  if (existing) existing.quantity = qty;
  else cartLines.value.push({ priceTierId: tier.id, label: tier.label, price: tier.price, quantity: qty });
  cartFocusTierId.value = null;
}

function removeCartLine(tierId) {
  const idx = cartLines.value.findIndex((l) => l.priceTierId === tierId);
  if (idx !== -1) cartLines.value.splice(idx, 1);
}

function cartTotal() {
  return cartLines.value.reduce((sum, l) => sum + l.price * l.quantity, 0);
}

function cartGuestsTotal() {
  return cartLines.value.reduce((sum, l) => sum + l.quantity, 0);
}

function canProceedStep1() {
  if (!product.value) return false;
  if (product.value.bookingType === 'session') {
    if (!selectedSessionId.value) return false;
    if (cartLines.value.length === 0) return false;
    if (sessionEmployees.value.length > 0 && !selectedEmployeeId.value) return false;
    return true;
  }
  if (!selectedPriceTierId.value) return false;
  if (!guests.value || guests.value < 1 || guests.value > (product.value.maxGuests || 1)) return false;
  if (product.value.bookingType === 'stay') {
    return !!stayCheckIn.value && !!stayCheckOut.value;
  }
  if (product.value.bookingType === 'stay_session') {
    return (
      !!staySessionDate.value &&
      !!staySessionTimeStart.value &&
      !!computedStaySessionTimeEnd() &&
      !!selectedStaySessionEmployeeId.value &&
      !staySessionPastTimeError.value
    );
  }
  return false;
}

function canProceedStep2() {
  return !!guestName.value && !!guestEmail.value && !!guestPhone.value;
}

function goToExtrasOrDetails() {
  step.value = hasExtras.value ? 2 : 3;
}

function backFromDetails() {
  step.value = hasExtras.value ? 2 : 1;
}

function toggleExtra(id) {
  const idx = selectedExtraIds.value.indexOf(id);
  if (idx === -1) selectedExtraIds.value.push(id);
  else selectedExtraIds.value.splice(idx, 1);
}

function selectedPriceTier() {
  return productPriceTiers.value.find((t) => t.id === selectedPriceTierId.value) || null;
}

function selectedEmployee() {
  return sessionEmployees.value.find((e) => e.id === selectedEmployeeId.value) || null;
}

function selectedExtras() {
  return productExtras.value.filter((e) => selectedExtraIds.value.includes(e.id));
}

// Whether the customer has made a real choice yet — the price-tier ref defaults to the
// product's first tier on load, so checking grandTotal() alone would show a total from
// the very first render for stay/stay_session products, before anything's actually picked.
function hasAnySelection() {
  if (!product.value) return false;
  if (product.value.bookingType === 'session') return cartLines.value.length > 0;
  if (product.value.bookingType === 'stay') return !!stayCheckIn.value;
  if (product.value.bookingType === 'stay_session') return !!staySessionDate.value;
  return false;
}

function extrasTotal() {
  return selectedExtras().reduce((sum, e) => sum + Number(e.price), 0);
}

function grandTotal() {
  if (product.value?.bookingType === 'session') return cartTotal() + extrasTotal();
  const rate = Number(selectedPriceTier()?.price || 0);
  const base = product.value?.bookingType === 'stay' ? rate * stayNights() : rate;
  return base + extrasTotal();
}

async function submit() {
  submitting.value = true;
  error.value = '';
  try {
    if (product.value.bookingType === 'session') {
      // Every cart line goes into one order — a single booking row with one reference,
      // covering all the tiers/quantities chosen for this round and staff member.
      result.value = await bookingsApi.create({
        productId: product.value.id,
        sessionId: selectedSessionId.value,
        employeeId: selectedEmployeeId.value || undefined,
        items: cartLines.value.map((l) => ({ priceTierId: l.priceTierId, quantity: l.quantity })),
        guestName: guestName.value,
        guestEmail: guestEmail.value,
        guestPhone: guestPhone.value,
        note: note.value || undefined,
        extraIds: selectedExtraIds.value.length > 0 ? selectedExtraIds.value : undefined,
      });
    } else {
      const isStay = product.value.bookingType === 'stay';
      const isStaySession = product.value.bookingType === 'stay_session';
      result.value = await bookingsApi.create({
        productId: product.value.id,
        priceTierId: selectedPriceTierId.value,
        dateStart: isStay ? stayCheckIn.value : undefined,
        dateEnd: isStay ? stayCheckOut.value : undefined,
        date: isStaySession ? staySessionDate.value : undefined,
        timeStart: isStaySession ? staySessionTimeStart.value : undefined,
        employeeId: isStaySession ? selectedStaySessionEmployeeId.value : undefined,
        guests: guests.value,
        guestName: guestName.value,
        guestEmail: guestEmail.value,
        guestPhone: guestPhone.value,
        note: note.value || undefined,
        extraIds: selectedExtraIds.value.length > 0 ? selectedExtraIds.value : undefined,
      });
    }
    await initPayment();
  } catch (err) {
    error.value = err.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <BackButton :to="{ name: 'product-detail', params: { id: props.productId } }" />
  <div v-if="product" class="booking-flow">
    <header class="booking-header">
      <p class="eyebrow">{{ $t('booking.step1') }}</p>
      <h1 class="page-heading">{{ product.name }}</h1>
      <p v-if="product.location" class="booking-location">
        <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/></svg>
        {{ product.location }}
      </p>
    </header>

    <div class="stepper" role="list">
      <div class="step" :class="{ active: step === 1, done: step > 1 }" role="listitem">
        <span class="dot">
          <svg v-if="step > 1" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          <svg v-else viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
        </span>
        <span class="step-label">{{ $t('booking.step1') }}</span>
      </div>
      <div class="step-connector" :class="{ done: step > 1 }"><span></span></div>

      <div v-if="hasExtras" class="step" :class="{ active: step === 2, done: step > 2 }" role="listitem">
        <span class="dot">
          <svg v-if="step > 2" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          <svg v-else viewBox="0 0 24 24"><path d="M20 12l-8 8-8-8 8-8 8 8zm-8-4.5L7.5 12 12 16.5 16.5 12 12 7.5z"/></svg>
        </span>
        <span class="step-label">{{ $t('booking.stepExtras') }}</span>
      </div>
      <div v-if="hasExtras" class="step-connector" :class="{ done: step > 2 }"><span></span></div>

      <div class="step" :class="{ active: step === 3, done: step > 3 }" role="listitem">
        <span class="dot">
          <svg v-if="step > 3" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          <svg v-else viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        </span>
        <span class="step-label">{{ $t('booking.step2') }}</span>
      </div>
      <div class="step-connector" :class="{ done: step > (hasExtras ? 3 : 2) }"><span></span></div>

      <div class="step" :class="{ active: step === 4 || result, done: !!result }" role="listitem">
        <span class="dot">
          <svg v-if="result" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          <svg v-else viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
        </span>
        <span class="step-label">{{ $t('booking.step3') }}</span>
      </div>
    </div>

    <div class="booking-layout" :class="{ 'single-col': step >= 4 || result }">
      <div class="booking-main">
        <section v-if="step === 1" class="section-card">
          <h2 class="section-title">
            <span class="section-title-icon"><svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg></span>
            {{ $t('booking.step1') }}
          </h2>

          <template v-if="product.bookingType !== 'session'">
            <p class="picker-label">{{ $t('product.selectPrice') }}</p>
            <div class="tier-grid">
              <button
                v-for="t in productPriceTiers"
                :key="t.id"
                type="button"
                class="tier-card"
                :class="{ selected: selectedPriceTierId === t.id }"
                @click="selectPriceTier(t.id)"
              >
                <span class="tier-card-check"></span>
                <span class="tier-card-label">{{ tierLabel(t) }}</span>
                <span class="tier-card-price">{{ formatCurrency(t.price) }}</span>
              </button>
            </div>
          </template>

          <template v-if="product.bookingType === 'session'">
            <template v-if="!selectedSessionDate">
              <p class="picker-label">{{ $t('booking.selectDate') }}</p>
              <p v-if="sessionDates.length === 0 && sessionDatesLoaded" class="empty-state">{{ $t('booking.noSlotsAvailable') }}</p>
              <div class="date-grid">
                <button v-for="d in pageSessionDates" :key="d.date" type="button" class="date-card" @click="selectSessionDate(d.date)">
                  <span class="date-card-day">{{ formatDate(d.date) }}</span>
                  <span class="date-card-count">{{ d.count }} {{ $t('admin.sessions') }}</span>
                </button>
              </div>
              <Pagination :page="datesPage" :total-pages="datesTotalPages" @update:page="datesPage = $event" />
            </template>
            <template v-else>
              <button type="button" class="crumb-back" @click="backToSessionDates">
                <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z"/></svg>
                {{ formatDate(selectedSessionDate) }}
              </button>
              <p v-if="sessions.length === 0 && sessionsLoaded" class="empty-state">{{ $t('booking.noSlotsAvailable') }}</p>
              <div class="round-grid">
                <button
                  v-for="s in pageSessions"
                  :key="s.id"
                  type="button"
                  class="round-card"
                  :class="{ selected: selectedSessionId === s.id }"
                  @click="selectSession(s.id)"
                >
                  <span class="round-card-check"></span>
                  <span class="round-card-name">{{ s.name }}</span>
                  <span class="round-card-time">
                    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                    {{ s.timeStart }} – {{ s.timeEnd }}
                  </span>
                </button>
              </div>
              <Pagination :page="sessionsPage" :total-pages="sessionsTotalPages" @update:page="sessionsPage = $event" />

              <template v-if="selectedSessionId && sessionEmployeesLoaded && sessionEmployees.length > 0">
                <p class="picker-label employee-picker-label">{{ $t('booking.selectEmployee') }}</p>
                <div class="employee-grid">
                  <button
                    v-for="e in pageSessionEmployees"
                    :key="e.id"
                    type="button"
                    class="employee-card"
                    :class="{ selected: selectedEmployeeId === e.id }"
                    :disabled="!e.available"
                    @click="selectEmployee(e.id)"
                  >
                    <span class="employee-card-check"></span>
                    <span class="employee-photo">
                      <img v-if="e.imageUrl" :src="e.imageUrl" alt="" />
                      <span v-else class="employee-photo-fallback">{{ e.name.charAt(0) }}</span>
                    </span>
                    <span class="employee-card-name">{{ e.name }}</span>
                    <small v-if="e.position" class="employee-card-position">{{ e.position }}</small>
                    <span v-if="!e.available" class="unavailable-badge">{{ $t('booking.employeeUnavailable') }}</span>
                  </button>
                </div>
                <Pagination :page="employeesPage" :total-pages="employeesTotalPages" @update:page="employeesPage = $event" />
              </template>

              <template v-if="selectedSessionId && (sessionEmployees.length === 0 || selectedEmployeeId)">
                <p class="picker-label cart-picker-label">{{ $t('product.selectPrice') }}</p>
                <div class="tier-cart">
                  <div
                    v-for="t in selectedSessionTiers()"
                    :key="t.id"
                    class="tier-cart-row"
                    :class="{ focused: cartFocusTierId === t.id, 'sold-out': t.remaining === 0, 'in-cart': !!cartLineFor(t.id) }"
                    @click="focusCartTier(t)"
                  >
                    <div class="tier-cart-main">
                      <span class="tier-cart-label">{{ t.label }}</span>
                      <span class="tier-cart-price">{{ formatCurrency(t.price) }}</span>
                      <span v-if="t.remaining === 0" class="tier-cart-tag sold-out-tag">{{ $t('booking.employeeUnavailable') }}</span>
                      <span v-else-if="cartLineFor(t.id)" class="tier-cart-tag in-cart-tag">× {{ cartLineFor(t.id).quantity }}</span>
                    </div>
                    <p v-if="cartFocusTierId !== t.id && t.remaining !== 0" class="tier-cart-remaining">
                      {{ $t('booking.seatsLeft', { n: t.remaining }) }}
                    </p>
                    <div v-if="cartFocusTierId === t.id" class="tier-cart-controls" @click.stop>
                      <span class="tier-cart-remaining">{{ $t('booking.seatsLeft', { n: t.remaining }) }}</span>
                      <div class="qty-stepper">
                        <button type="button" @click="stepCartDraft(-1)">−</button>
                        <input type="number" min="1" :max="t.remaining" v-model.number="cartQuantityDraft" />
                        <button type="button" @click="stepCartDraft(1)">+</button>
                      </div>
                      <button type="button" class="btn btn-sm add-to-cart-btn" @click="addFocusedToCart">
                        {{ $t('booking.addToCart') }}
                      </button>
                    </div>
                  </div>
                </div>

                <div v-if="cartLines.length > 0" class="cart-summary">
                  <div v-for="l in cartLines" :key="l.priceTierId" class="cart-summary-line">
                    <span class="cart-summary-label">{{ l.label }} × {{ l.quantity }}</span>
                    <span class="cart-summary-amount">{{ formatCurrency(l.price * l.quantity) }}</span>
                    <button type="button" class="cart-line-remove" @click="removeCartLine(l.priceTierId)" aria-label="Remove">✕</button>
                  </div>
                  <div class="cart-summary-total">
                    <span>{{ $t('booking.cartTotal') }} ({{ cartGuestsTotal() }})</span>
                    <span>{{ formatCurrency(cartTotal()) }}</span>
                  </div>
                </div>
              </template>
            </template>
          </template>
          <template v-else-if="product.bookingType === 'stay'">
            <div class="picker-header stay-picker-header">
              <p class="picker-label stay-hint">
                {{ !stayCheckIn ? $t('booking.selectCheckIn') : !stayCheckOut ? $t('booking.selectCheckOut') : $t('booking.checkIn') }}
              </p>
              <button v-if="stayCheckIn" type="button" class="crumb-back crumb-back-inline" @click="resetStaySelection">
                {{ $t('booking.changeDates') }}
              </button>
            </div>
            <div v-if="stayCheckIn" class="stay-range-pill">
              <span>{{ formatDate(stayCheckIn) }}</span>
              <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
              <span v-if="stayCheckOut">{{ formatDate(stayCheckOut) }}</span>
              <span v-else class="stay-range-pending">{{ $t('booking.selectCheckOut') }}</span>
            </div>
            <div class="calendar-frame">
              <MonthCalendar v-model:month="staySelectedMonth">
                <template #day="{ date, day, isPast }">
                  <button
                    type="button"
                    class="stay-cal-day"
                    :class="{
                      past: isPast,
                      closed: stayDayInfo(date) && !stayDayInfo(date).isOpen,
                      unknown: !stayDayInfo(date),
                      'range-start': date === stayCheckIn,
                      'range-end': date === stayCheckOut,
                      'in-range': stayCheckIn && stayCheckOut && date > stayCheckIn && date < stayCheckOut,
                    }"
                    :disabled="!stayDayInfo(date) || !stayDayInfo(date).isOpen"
                    @click="onStayDayClick(date)"
                  >
                    {{ day }}
                  </button>
                </template>
              </MonthCalendar>
            </div>
            <p v-if="stayRangeError" class="error">{{ stayRangeError }}</p>
          </template>
          <template v-else-if="product.bookingType === 'stay_session'">
            <p class="picker-label">{{ $t('booking.selectDate') }}</p>
            <div class="calendar-frame">
              <MonthCalendar v-model:month="staySelectedMonth">
                <template #day="{ date, day, isPast }">
                  <button
                    type="button"
                    class="stay-cal-day"
                    :class="{
                      past: isPast,
                      closed: stayDayInfo(date) && !stayDayInfo(date).isOpen,
                      unknown: !stayDayInfo(date),
                      'range-start': date === staySessionDate,
                    }"
                    :disabled="!stayDayInfo(date) || !stayDayInfo(date).isOpen"
                    @click="onStaySessionDayClick(date)"
                  >
                    {{ day }}
                  </button>
                </template>
              </MonthCalendar>
            </div>

            <template v-if="staySessionDate">
              <label class="time-field">
                {{ $t('booking.selectTime') }}
                <input type="time" v-model="staySessionTimeStart" @change="refreshStaySessionEmployees" />
              </label>
              <p v-if="staySessionPastTimeError" class="error">{{ staySessionPastTimeError }}</p>
              <div v-else-if="computedStaySessionTimeEnd()" class="stay-range-pill">
                <span>{{ formatDate(staySessionDate) }}</span>
                <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
                <span>{{ staySessionTimeStart }} – {{ computedStaySessionTimeEnd() }}</span>
              </div>
              <p v-else class="error">{{ $t('booking.durationTooLate') }}</p>

              <template v-if="computedStaySessionTimeEnd() && !staySessionPastTimeError">
                <p v-if="staySessionEmployeesLoaded && staySessionEmployees.length === 0" class="empty-state">{{ $t('booking.noStaffForDates') }}</p>
                <template v-else-if="staySessionEmployeesLoaded">
                  <p class="picker-label employee-picker-label">{{ $t('booking.selectEmployee') }}</p>
                  <div class="employee-grid">
                    <button
                      v-for="e in pageStaySessionEmployees"
                      :key="e.id"
                      type="button"
                      class="employee-card"
                      :class="{ selected: selectedStaySessionEmployeeId === e.id }"
                      :disabled="!e.available"
                      @click="selectedStaySessionEmployeeId = e.id"
                    >
                      <span class="employee-card-check"></span>
                      <span class="employee-photo">
                        <img v-if="e.imageUrl" :src="e.imageUrl" alt="" />
                        <span v-else class="employee-photo-fallback">{{ e.name.charAt(0) }}</span>
                      </span>
                      <span class="employee-card-name">{{ e.name }}</span>
                      <small v-if="e.position" class="employee-card-position">{{ e.position }}</small>
                      <span v-if="!e.available" class="unavailable-badge">{{ $t('booking.employeeUnavailable') }}</span>
                    </button>
                  </div>
                  <Pagination
                    :page="staySessionEmployeesPage"
                    :total-pages="staySessionEmployeesTotalPages"
                    @update:page="staySessionEmployeesPage = $event"
                  />
                </template>
              </template>
            </template>
          </template>

          <label v-if="product.bookingType !== 'session'" class="guests-field">
            {{ $t('booking.guests') }}
            <div class="guests-stepper">
              <button type="button" :disabled="guests <= 1" @click="guests = Math.max(1, guests - 1)">−</button>
              <input type="number" min="1" :max="product.maxGuests || 1" v-model.number="guests" />
              <button type="button" :disabled="guests >= (product.maxGuests || 1)" @click="guests = Math.min(product.maxGuests || 1, guests + 1)">+</button>
            </div>
          </label>

          <div class="actions">
            <button class="btn" :disabled="!canProceedStep1()" @click="goToExtrasOrDetails">{{ $t('common.next') }}</button>
          </div>
        </section>

        <section v-if="step === 2 && hasExtras" class="section-card">
          <h2 class="section-title">
            <span class="section-title-icon"><svg viewBox="0 0 24 24"><path d="M20 12l-8 8-8-8 8-8 8 8zm-8-4.5L7.5 12 12 16.5 16.5 12 12 7.5z"/></svg></span>
            {{ $t('booking.stepExtras') }}
          </h2>
          <p class="picker-label">{{ $t('booking.extrasHint') }}</p>
          <div class="extras-grid">
            <button
              v-for="e in pageExtras"
              :key="e.id"
              type="button"
              class="extra-card"
              :class="{ selected: selectedExtraIds.includes(e.id) }"
              @click="toggleExtra(e.id)"
            >
              <span class="extra-card-check" aria-hidden="true"></span>
              <span class="extra-photo">
                <img v-if="e.coverImage" :src="e.coverImage.urlThumbnail" alt="" />
                <span v-else class="extra-photo-fallback">{{ e.name.charAt(0) }}</span>
              </span>
              <span class="extra-card-info">
                <span class="extra-card-name">{{ e.name }}</span>
                <span class="extra-card-price">+{{ formatCurrency(e.price) }}</span>
              </span>
            </button>
          </div>
          <Pagination :page="extrasPage" :total-pages="extrasTotalPages" @update:page="extrasPage = $event" />
          <div class="actions">
            <button class="btn btn-secondary" @click="step = 1">{{ $t('common.back') }}</button>
            <button class="btn" @click="step = 3">{{ $t('common.next') }}</button>
          </div>
        </section>

        <section v-if="step === 3" class="section-card">
          <h2 class="section-title">
            <span class="section-title-icon"><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></span>
            {{ $t('booking.step2') }}
          </h2>
          <div class="guest-form-grid">
            <label class="field-full">
              {{ $t('booking.name') }}
              <div class="input-icon-wrap">
                <svg class="field-icon" viewBox="0 0 24 24"><path d="M12 12c2.7 0 8 1.34 8 4v2H4v-2c0-2.66 5.3-4 8-4zm0-2a4 4 0 110-8 4 4 0 010 8z"/></svg>
                <input v-model="guestName" required />
              </div>
            </label>
            <label>
              {{ $t('booking.email') }}
              <div class="input-icon-wrap">
                <svg class="field-icon" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                <input type="email" v-model="guestEmail" required />
              </div>
            </label>
            <label>
              {{ $t('booking.phone') }}
              <div class="input-icon-wrap">
                <svg class="field-icon" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                <input v-model="guestPhone" required />
              </div>
            </label>
            <label class="field-full">{{ $t('booking.note') }}<textarea v-model="note"></textarea></label>
          </div>
          <div class="actions">
            <button class="btn btn-secondary" @click="backFromDetails">{{ $t('common.back') }}</button>
            <button class="btn" :disabled="!canProceedStep2()" @click="step = 4">{{ $t('common.next') }}</button>
          </div>
        </section>

        <section v-if="step === 4 && !result" class="section-card">
          <h2 class="section-title">
            <span class="section-title-icon"><svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg></span>
            {{ $t('booking.step3') }}
          </h2>
          <div class="receipt">
            <div class="receipt-row receipt-heading"><span>{{ product.name }}</span></div>

            <template v-if="product.bookingType === 'session'">
              <div class="receipt-row" v-if="selectedSession()">
                <span>{{ selectedSession().name }}</span>
                <span>{{ formatDate(selectedSession().date) }} · {{ selectedSession().timeStart }}-{{ selectedSession().timeEnd }}</span>
              </div>
              <div class="receipt-row" v-if="selectedEmployee()">
                <span>{{ $t('booking.selectEmployee') }}</span>
                <span>{{ selectedEmployee().name }}</span>
              </div>
              <div class="receipt-divider"></div>
              <div class="receipt-row" v-for="l in cartLines" :key="l.priceTierId">
                <span>{{ l.label }} × {{ l.quantity }}</span>
                <em>{{ formatCurrency(l.price * l.quantity) }}</em>
              </div>
            </template>
            <template v-else-if="product.bookingType === 'stay'">
              <div class="receipt-row"><span>{{ $t('booking.checkIn') }} → {{ $t('booking.checkOut') }}</span><span>{{ formatDate(stayCheckIn) }} → {{ formatDate(stayCheckOut) }}</span></div>
              <div class="receipt-divider"></div>
              <div class="receipt-row" v-if="selectedPriceTier()">
                <span>{{ stayNights() }} × {{ formatCurrency(selectedPriceTier().price) }}</span>
                <em>{{ formatCurrency(selectedPriceTier().price * stayNights()) }}</em>
              </div>
            </template>
            <template v-else-if="product.bookingType === 'stay_session'">
              <div class="receipt-row"><span>{{ $t('booking.date') }}</span><span>{{ formatDate(staySessionDate) }}</span></div>
              <div class="receipt-row"><span>{{ $t('booking.selectTime') }}</span><span>{{ staySessionTimeStart }} - {{ computedStaySessionTimeEnd() }}</span></div>
              <div class="receipt-row" v-if="selectedStaySessionEmployee()">
                <span>{{ $t('booking.selectEmployee') }}</span><span>{{ selectedStaySessionEmployee().name }}</span>
              </div>
              <div class="receipt-divider"></div>
              <div class="receipt-row" v-if="selectedPriceTier()">
                <span>{{ tierLabel(selectedPriceTier()) }}</span>
                <em>{{ formatCurrency(selectedPriceTier().price) }}</em>
              </div>
            </template>

            <template v-if="selectedExtras().length > 0">
              <div class="receipt-divider"></div>
              <div class="receipt-row" v-for="e in selectedExtras()" :key="e.id"><span>{{ e.name }}</span><em>+{{ formatCurrency(e.price) }}</em></div>
            </template>

            <div class="receipt-divider"></div>
            <div class="receipt-row"><span>{{ guestName }}</span><span>{{ guestEmail }} · {{ guestPhone }}</span></div>
            <div class="receipt-row receipt-total"><span>{{ $t('booking.total') }}</span><span>{{ formatCurrency(grandTotal()) }}</span></div>
          </div>
          <label class="checkbox-label"><input type="checkbox" v-model="acceptedTerms" /> {{ $t('booking.acceptTerms') }}</label>
          <p v-if="error" class="error">{{ error }}</p>
          <div class="actions">
            <button class="btn btn-secondary" @click="step = 3">{{ $t('common.back') }}</button>
            <button class="btn" :disabled="!acceptedTerms || submitting" @click="submit">
              <span v-if="submitting" class="btn-inline-spinner"></span>{{ $t('booking.confirm') }}
            </button>
          </div>
        </section>

        <section v-if="result && paymentStatus !== 'paid' && paymentStatus !== 'skip'" class="section-card payment-card">
          <div class="payment-head">
            <span class="payment-head-icon">
              <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
            </span>
            <div>
              <h2 class="section-title">{{ $t('booking.paymentTitle') }}</h2>
              <p class="payment-ref">{{ $t('booking.reference') }}: <strong>{{ result.reference }}</strong></p>
            </div>
          </div>

          <!-- Full vs. deposit choice — only shown when the business has deposits enabled. -->
          <div v-if="paymentStatus === 'choose'" class="pay-type-picker">
            <button type="button" class="pay-type-card" @click="selectPaymentType('full')">
              <span class="pay-type-radio"></span>
              <span class="pay-type-body">
                <span class="pay-type-title">{{ $t('booking.payInFull') }}</span>
                <span class="pay-type-desc">{{ $t('booking.payInFullDesc') }}</span>
              </span>
              <span class="pay-type-amount">{{ formatCurrency(result.totalPrice) }}</span>
            </button>
            <button type="button" class="pay-type-card" @click="selectPaymentType('deposit')">
              <span class="pay-type-radio"></span>
              <span class="pay-type-body">
                <span class="pay-type-title">{{ $t('booking.payDeposit', { percent: depositPercent }) }}</span>
                <span class="pay-type-desc">{{ $t('booking.payDepositDesc', { amount: formatCurrency(result.totalPrice - depositAmount()) }) }}</span>
              </span>
              <span class="pay-type-amount">{{ formatCurrency(depositAmount()) }}</span>
            </button>
          </div>

          <template v-else>
            <div class="payment-summary">
              <span class="payment-summary-label">
                {{ paymentType === 'deposit' ? $t('booking.depositAmountLabel') : $t('booking.totalAmountLabel') }}
              </span>
              <span class="payment-amount">{{ formatCurrency(paymentType === 'deposit' ? depositAmount() : result.totalPrice) }}</span>
            </div>
            <button
              v-if="depositEnabled && paymentStatus === 'ready'"
              type="button"
              class="switch-payment-type-btn"
              @click="switchPaymentType"
            >
              <svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 16.03 20 14.57 20 13c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 8.74C4.46 9.97 4 11.43 4 13c0 4.42 3.58 8 8 8v4l5-5-5-5v4z"/></svg>
              {{ $t(paymentType === 'deposit' ? 'booking.switchToFull' : 'booking.switchToDeposit') }}
            </button>
            <p v-if="paymentType === 'deposit'" class="payment-balance-note">
              {{ $t('booking.balanceLaterNote', { amount: formatCurrency(result.totalPrice - depositAmount()) }) }}
            </p>

            <div v-if="paymentStatus === 'loading'" class="payment-skeleton">
              <div class="skeleton" style="height: 48px; border-radius: var(--radius-sm); margin-bottom: 0.6rem;"></div>
              <div class="skeleton" style="height: 48px; border-radius: var(--radius-sm); margin-bottom: 0.6rem;"></div>
              <div class="skeleton" style="height: 90px; border-radius: var(--radius-sm);"></div>
            </div>

            <p v-if="paymentStatus === 'ready' || paymentStatus === 'processing'" class="payment-method-label">{{ $t('booking.selectMethod') }}</p>
            <div id="payment-element" v-show="paymentStatus === 'ready' || paymentStatus === 'processing'"></div>

            <p v-if="paymentError" class="error">{{ paymentError }}</p>
            <p v-if="paymentStatus === 'error' && !paymentError" class="error">{{ $t('booking.paymentSetupError') }}</p>

            <div v-if="paymentStatus === 'ready' || paymentStatus === 'processing'" class="actions payment-actions">
              <button class="btn btn-accent pay-btn" :disabled="paymentStatus === 'processing'" @click="payNow">
                <span v-if="paymentStatus === 'processing'" class="pay-btn-spinner"></span>
                {{ paymentStatus === 'processing' ? $t('booking.processing') : `${$t('booking.payNow')} · ${formatCurrency(paymentType === 'deposit' ? depositAmount() : result.totalPrice)}` }}
              </button>
            </div>
          </template>

          <p class="payment-secure-note">
            <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
            {{ $t('booking.securePayment') }}
          </p>
        </section>

        <section v-if="result && (paymentStatus === 'paid' || paymentStatus === 'skip')" class="section-card result">
          <div class="result-glow" aria-hidden="true"></div>
          <div class="result-icon">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </div>
          <h2>{{ $t('booking.success') }}</h2>
          <div class="result-line">
            <span class="result-ref">{{ $t('booking.reference') }}: <strong>{{ result.reference }}</strong></span>
            <StatusBadge :status="paymentStatus === 'paid' ? 'confirmed' : result.status" />
          </div>
          <p v-if="paymentStatus === 'paid'" class="payment-paid-note">✓ {{ $t('booking.paymentSuccess') }}</p>
          <div v-if="result.items && result.items.length > 0" class="receipt result-items">
            <div class="receipt-row" v-for="it in result.items" :key="it.priceTierId"><span>{{ it.label }} × {{ it.quantity }}</span><em>{{ formatCurrency(it.price * it.quantity) }}</em></div>
            <div class="receipt-row" v-for="e in result.extras" :key="'ex' + e.extraId"><span>{{ e.name }}</span><em>+{{ formatCurrency(e.price) }}</em></div>
          </div>

          <div v-if="paymentStatus === 'paid' && balanceDue > 0.001" class="result-balance-card">
            <div class="result-balance-row"><span>{{ $t('booking.depositAmountLabel') }}</span><strong>{{ formatCurrency(paidAmount) }}</strong></div>
            <div class="result-balance-row due"><span>{{ $t('booking.balanceDueLabel') }}</span><strong>{{ formatCurrency(balanceDue) }}</strong></div>
            <p class="result-balance-hint">{{ $t('booking.balanceDueHint') }}</p>
          </div>
          <p v-else class="result-total">{{ formatCurrency(result.totalPrice) }}</p>

          <div class="result-actions">
            <router-link :to="{ name: 'my-bookings' }" class="btn">{{ $t('nav.myBookings') }}</router-link>
            <router-link :to="{ name: 'products' }" class="btn btn-secondary">{{ $t('nav.products') }}</router-link>
          </div>
        </section>
      </div>

      <aside v-if="!result && step < 4" class="booking-summary">
        <div class="summary-card surface-panel">
          <div class="summary-product">
            <div class="summary-thumb">
              <img v-if="product.coverImage" :src="product.coverImage.urlThumbnail" alt="" />
              <div v-else class="summary-thumb-placeholder"></div>
            </div>
            <div>
              <p class="summary-product-name">{{ product.name }}</p>
              <p v-if="product.location" class="summary-product-location">{{ product.location }}</p>
            </div>
          </div>

          <div class="summary-divider"></div>

          <div class="summary-body">
            <template v-if="product.bookingType === 'session'">
              <div v-if="selectedSessionDate" class="summary-row"><span>{{ $t('booking.selectDate') }}</span><strong>{{ formatDate(selectedSessionDate) }}</strong></div>
              <div v-if="selectedSession()" class="summary-row"><span>{{ selectedSession().name }}</span><strong>{{ selectedSession().timeStart }}–{{ selectedSession().timeEnd }}</strong></div>
              <div v-if="selectedEmployee()" class="summary-row"><span>{{ $t('booking.selectEmployee') }}</span><strong>{{ selectedEmployee().name }}</strong></div>
              <template v-if="cartLines.length > 0">
                <div class="summary-divider thin"></div>
                <div v-for="l in cartLines" :key="l.priceTierId" class="summary-row"><span>{{ l.label }} × {{ l.quantity }}</span><strong>{{ formatCurrency(l.price * l.quantity) }}</strong></div>
              </template>
            </template>
            <template v-else-if="product.bookingType === 'stay'">
              <div v-if="stayCheckIn" class="summary-row"><span>{{ $t('booking.checkIn') }}</span><strong>{{ formatDate(stayCheckIn) }}</strong></div>
              <div v-if="stayCheckOut" class="summary-row"><span>{{ $t('booking.checkOut') }}</span><strong>{{ formatDate(stayCheckOut) }}</strong></div>
              <div v-if="stayCheckIn && stayCheckOut && selectedPriceTier()" class="summary-row"><span>{{ stayNights() }} × {{ formatCurrency(selectedPriceTier().price) }}</span><strong>{{ formatCurrency(selectedPriceTier().price * stayNights()) }}</strong></div>
            </template>
            <template v-else-if="product.bookingType === 'stay_session'">
              <div v-if="staySessionDate" class="summary-row"><span>{{ $t('booking.date') }}</span><strong>{{ formatDate(staySessionDate) }}</strong></div>
              <div v-if="staySessionDate && computedStaySessionTimeEnd()" class="summary-row"><span>{{ $t('booking.selectTime') }}</span><strong>{{ staySessionTimeStart }}–{{ computedStaySessionTimeEnd() }}</strong></div>
              <div v-if="selectedStaySessionEmployee()" class="summary-row"><span>{{ $t('booking.selectEmployee') }}</span><strong>{{ selectedStaySessionEmployee().name }}</strong></div>
              <div v-if="selectedPriceTier()" class="summary-row"><span>{{ tierLabel(selectedPriceTier()) }}</span><strong>{{ formatCurrency(selectedPriceTier().price) }}</strong></div>
            </template>

            <template v-if="selectedExtras().length > 0">
              <div class="summary-divider thin"></div>
              <div v-for="e in selectedExtras()" :key="e.id" class="summary-row"><span>{{ e.name }}</span><strong>+{{ formatCurrency(e.price) }}</strong></div>
            </template>

            <p v-if="!hasAnySelection()" class="summary-hint">{{ $t('booking.summaryHint') }}</p>
          </div>

          <template v-if="hasAnySelection()">
            <div class="summary-divider"></div>
            <div class="summary-total"><span>{{ $t('booking.total') }}</span><span>{{ formatCurrency(grandTotal()) }}</span></div>
          </template>
        </div>
      </aside>
    </div>

    <!-- Mobile-only sticky action bar — keeps the running total and the primary CTA for
         the current step reachable without scrolling to the bottom of a long step, a
         pattern the desktop two-column layout already gets for free via the sticky
         sidebar. Every button here calls the exact same handler as its in-flow
         counterpart in `.actions` above; this is a second entry point to the same
         logic, not new behavior. -->
    <div v-if="!result && step <= 4" class="mobile-cta-bar">
      <div class="mobile-cta-inner">
        <div v-if="hasAnySelection()" class="mobile-cta-total">
          <span class="mobile-price-label">{{ $t('booking.total') }}</span>
          <span class="mobile-price-amount">{{ formatCurrency(grandTotal()) }}</span>
        </div>
        <button
          v-if="step === 1"
          type="button"
          class="btn mobile-cta-btn"
          :class="{ 'full-width': !hasAnySelection() }"
          :disabled="!canProceedStep1()"
          @click="goToExtrasOrDetails"
        >
          {{ $t('common.next') }}
        </button>
        <button
          v-else-if="step === 2 && hasExtras"
          type="button"
          class="btn mobile-cta-btn"
          :class="{ 'full-width': !hasAnySelection() }"
          @click="step = 3"
        >
          {{ $t('common.next') }}
        </button>
        <button
          v-else-if="step === 3"
          type="button"
          class="btn mobile-cta-btn"
          :class="{ 'full-width': !hasAnySelection() }"
          :disabled="!canProceedStep2()"
          @click="step = 4"
        >
          {{ $t('common.next') }}
        </button>
        <button
          v-else-if="step === 4"
          type="button"
          class="btn mobile-cta-btn"
          :disabled="!acceptedTerms || submitting"
          @click="submit"
        >
          <span v-if="submitting" class="btn-inline-spinner"></span>{{ $t('booking.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.booking-flow { max-width: 1180px; margin: 0 auto; }

.booking-header { margin: 0 0 1.75rem; }
.booking-header h1 { margin: 0 0 0.5rem; font-size: clamp(1.5rem, 2.6vw, 1.9rem); }
.booking-location { display: flex; align-items: center; gap: 0.35rem; margin: 0; color: var(--color-text-muted); font-size: 0.88rem; }
.booking-location svg { width: 15px; height: 15px; fill: var(--color-accent); flex-shrink: 0; }

/* ---------------- Stepper ---------------- */
.stepper {
  display: flex; align-items: center; padding: 0.35rem; margin: 0 auto 2.25rem; max-width: 680px;
  background: var(--color-surface); border: 1px solid var(--color-border-soft); border-radius: 999px;
  box-shadow: var(--shadow-sm);
}
.step {
  flex: 0 0 auto; display: flex; align-items: center; gap: 0.55rem;
  font-size: 0.8rem; font-weight: 700; color: var(--color-text-faint); white-space: nowrap;
  padding: 0.3rem 0.5rem 0.3rem 0.3rem; border-radius: 999px; transition: color 0.15s ease;
}
.step-connector { flex: 1 1 auto; min-width: 10px; padding: 0 0.35rem; }
.step-connector span { display: block; height: 3px; border-radius: 999px; background: var(--color-border); transition: background 0.25s ease; }
.step-connector.done span { background: linear-gradient(90deg, var(--color-primary), var(--color-accent)); }
.dot {
  width: 34px; height: 34px; border-radius: 999px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-bg); border: 2px solid var(--color-border); color: var(--color-text-faint);
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.dot svg { width: 16px; height: 16px; fill: currentColor; }
.step.active { color: var(--color-primary); }
.step.active .dot { background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); border-color: var(--color-primary); color: #171208; box-shadow: 0 0 0 5px var(--color-primary-light); }
.step.done .dot { background: var(--color-success); border-color: var(--color-success); color: #fff; }
.step-label { display: none; }
@media (min-width: 620px) { .step-label { display: inline; } }
@media (max-width: 619px) { .stepper { justify-content: center; gap: 0; padding: 0.4rem; } .step-connector { flex: 0 0 22px; } }

/* ---------------- Layout ---------------- */
.booking-layout { display: grid; grid-template-columns: minmax(300px, 360px) minmax(520px, 1fr); gap: 2.25rem; align-items: start; }
.booking-layout.single-col { grid-template-columns: 1fr; max-width: 640px; margin: 0 auto; }
.booking-main { order: 2; min-width: 0; }
.booking-summary { order: 1; position: sticky; top: 5.5rem; }
@media (max-width: 1020px) {
  .booking-layout { grid-template-columns: 1fr; }
  .booking-summary { display: none; }
}

.summary-card { padding: 1.6rem; position: relative; overflow: hidden; }
.summary-card::before {
  content: ''; position: absolute; inset: 0 0 auto 0; height: 5px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
}
.summary-product { display: flex; align-items: center; gap: 0.85rem; }
.summary-thumb { width: 58px; height: 58px; border-radius: var(--radius-md); overflow: hidden; flex-shrink: 0; background: var(--color-cream); box-shadow: var(--shadow-sm); }
.summary-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.summary-thumb-placeholder { width: 100%; height: 100%; background: linear-gradient(135deg, var(--color-primary-light), var(--color-cream)); }
.summary-product-name { margin: 0; font-weight: 700; font-size: 0.95rem; line-height: 1.3; font-family: var(--font-display); }
.summary-product-location { margin: 0.2rem 0 0; font-size: 0.78rem; color: var(--color-text-muted); }
.summary-divider { height: 1px; background: var(--color-border-soft); margin: 1.15rem 0; }
.summary-divider.thin { margin: 0.65rem 0; }
.summary-body { display: flex; flex-direction: column; gap: 0.6rem; }
.summary-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; font-size: 0.84rem; color: var(--color-text-muted); }
.summary-row strong { color: var(--color-text); font-weight: 700; text-align: right; }
.summary-hint { margin: 0; font-size: 0.82rem; color: var(--color-text-faint); line-height: 1.65; }
.summary-total { display: flex; justify-content: space-between; align-items: center; font-size: 1.15rem; font-weight: 800; color: var(--color-primary); font-family: var(--font-display); }

/* Mobile sticky action bar — total + the current step's primary CTA. Desktop instead
   gets the sticky sidebar summary and in-flow `.actions` buttons, so this (and the
   in-flow primary button it replaces) stay hidden above the breakpoint. */
.mobile-cta-bar { display: none; }
@media (max-width: 1020px) {
  .mobile-cta-bar {
    display: block; position: sticky; bottom: 0; z-index: 8; margin: 1.5rem -1.25rem 0;
    background: var(--color-surface); border-top: 1px solid var(--color-border-soft);
    box-shadow: 0 -10px 28px rgba(0, 0, 0, 0.35); padding: 0.85rem 1.25rem calc(0.85rem + env(safe-area-inset-bottom));
  }
  .mobile-cta-inner { display: flex; align-items: center; justify-content: space-between; gap: 1rem; max-width: 640px; margin: 0 auto; }
  .mobile-cta-total { display: flex; flex-direction: column; min-width: 0; }
  .mobile-price-label { font-size: 0.74rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .mobile-price-amount { font-size: 1.15rem; font-weight: 800; color: var(--color-primary); font-family: var(--font-display); white-space: nowrap; }
  .mobile-cta-btn { flex-shrink: 0; min-width: 140px; justify-content: center; }
  .mobile-cta-btn.full-width { flex: 1; min-width: 0; }

  /* The sticky bar above takes over as the primary CTA on mobile — hide its in-flow
     twin so the same action isn't offered twice. The secondary "back" button (and the
     Stripe pay button, which has its own always-visible full-width treatment) stay put. */
  .actions:not(.payment-actions) .btn:not(.btn-secondary) { display: none; }
  .actions:not(.payment-actions) { justify-content: flex-start; }
}

/* ---------------- Section cards ---------------- */
.section-card {
  background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-md);
  padding: 1.85rem 1.85rem 1.6rem; margin-bottom: 1.25rem; border: 1px solid var(--color-border-soft);
}
@media (max-width: 420px) { .section-card { padding: 1.25rem 1.1rem 1.15rem; border-radius: var(--radius-md); } }
.section-title {
  display: flex; align-items: center; gap: 0.7rem;
  margin: 0 0 1.35rem; font-size: 1.18rem; font-weight: 600; color: var(--color-text);
  font-family: var(--font-display); padding-bottom: 0.9rem; border-bottom: 1px solid var(--color-border-soft);
}
.section-title-icon {
  flex-shrink: 0; width: 36px; height: 36px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  background: var(--color-primary-light); color: var(--color-primary);
}
.section-title-icon svg { width: 18px; height: 18px; fill: currentColor; }

.picker-label { font-size: 0.85rem; font-weight: 700; color: var(--color-text-muted); margin: 0 0 0.65rem; }
.cart-picker-label { margin-top: 1.4rem; }
.employee-picker-label { margin-top: 1.4rem; }

/* ---------------- Crumb-style back link (inside a step) ---------------- */
.crumb-back {
  display: inline-flex; align-items: center; gap: 0.4rem; margin-bottom: 0.9rem;
  background: var(--color-primary-light); border: none; color: var(--color-primary);
  font-weight: 700; font-size: 0.83rem; padding: 0.45rem 0.9rem 0.45rem 0.6rem; border-radius: 999px;
  transition: background 0.15s ease;
}
.crumb-back:hover { background: var(--color-primary); color: #171208; }
.crumb-back svg { width: 15px; height: 15px; fill: currentColor; flex-shrink: 0; }
.crumb-back-inline { margin-bottom: 0; background: transparent; color: var(--color-primary); padding: 0.3rem 0.5rem; }
.crumb-back-inline:hover { background: var(--color-primary-light); color: var(--color-primary-hover); }

/* ---------------- Price tier cards ---------------- */
.tier-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.75rem; margin: 0 0 1.35rem; }
.tier-card {
  position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 0.3rem;
  padding: 1rem 1.15rem; border: 1.5px solid var(--color-border); background: var(--color-surface); border-radius: var(--radius-md);
  text-align: left; transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}
.tier-card:hover { border-color: var(--color-primary); transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.tier-card.selected { background: var(--color-primary-light); border-color: var(--color-primary); box-shadow: var(--shadow-sm); }
.tier-card-check {
  position: absolute; top: 0.85rem; right: 0.85rem; width: 18px; height: 18px; border-radius: 50%;
  border: 1.5px solid var(--color-border); background: var(--color-surface-2); transition: border-color 0.15s ease, background 0.15s ease;
}
.tier-card.selected .tier-card-check {
  border-color: var(--color-primary); background: var(--color-primary)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.2'%3E%3Cpath d='M3 8l3.5 3.5L13 5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    center/11px no-repeat;
}
.tier-card-label { font-weight: 700; font-size: 0.9rem; padding-right: 1.4rem; }
.tier-card-price { font-size: 0.88rem; color: var(--color-primary); font-weight: 800; }

/* ---------------- Session date cards ---------------- */
.date-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.7rem; margin: 0.25rem 0 0.5rem; }
.date-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 0.3rem;
  padding: 0.95rem 1.1rem; border: 1.5px solid var(--color-border); background: var(--color-surface); border-radius: var(--radius-md);
  text-align: left; transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}
.date-card:hover { border-color: var(--color-primary); background: var(--color-primary-light); transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.date-card-day { font-weight: 700; font-size: 0.88rem; }
.date-card-count { font-size: 0.78rem; color: var(--color-primary); font-weight: 700; }

/* ---------------- Session round cards ---------------- */
.round-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.7rem; margin: 0 0 0.5rem; }
.round-card {
  position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 0.35rem;
  padding: 0.95rem 1.1rem; border: 1.5px solid var(--color-border); background: var(--color-surface); border-radius: var(--radius-md);
  text-align: left; transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}
.round-card:hover { border-color: var(--color-primary); transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.round-card.selected { background: var(--color-primary-light); border-color: var(--color-primary); }
.round-card-check {
  position: absolute; top: 0.85rem; right: 0.85rem; width: 18px; height: 18px; border-radius: 50%;
  border: 1.5px solid var(--color-border); background: var(--color-surface-2);
}
.round-card.selected .round-card-check {
  border-color: var(--color-primary); background: var(--color-primary)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.2'%3E%3Cpath d='M3 8l3.5 3.5L13 5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    center/11px no-repeat;
}
.round-card-name { font-weight: 700; font-size: 0.9rem; padding-right: 1.4rem; }
.round-card-time { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; }
.round-card-time svg { width: 13px; height: 13px; fill: var(--color-accent); flex-shrink: 0; }

/* ---------------- Stay calendar ---------------- */
.stay-picker-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; }
.stay-hint { margin: 0; }
.stay-range-pill {
  display: inline-flex; align-items: center; gap: 0.5rem; margin: 0 0 1.1rem; padding: 0.5rem 1rem;
  background: var(--color-primary-light); color: var(--color-primary); border-radius: 999px;
  font-size: 0.86rem; font-weight: 700;
}
.stay-range-pill svg { width: 14px; height: 14px; fill: var(--color-primary); flex-shrink: 0; }
.stay-range-pending { color: var(--color-text-faint); font-weight: 600; }
.calendar-frame { background: var(--color-bg); border-radius: var(--radius-md); padding: 1.1rem 0.9rem; margin-bottom: 0.5rem; }

.stay-cal-day {
  width: 100%; height: 100%; border: 1.5px solid transparent; border-radius: var(--radius-sm); background: var(--color-surface);
  display: flex; align-items: center; justify-content: center; font-size: 0.84rem; font-weight: 700; color: var(--color-text);
  transition: border-color 0.15s ease, background 0.15s ease, opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}
.stay-cal-day:not(:disabled):hover { border-color: var(--color-primary); transform: scale(1.08); box-shadow: var(--shadow-sm); }
.stay-cal-day.past { opacity: 0.3; }
.stay-cal-day.closed, .stay-cal-day.unknown { color: var(--color-text-faint); background: transparent; cursor: not-allowed; font-weight: 500; }
.stay-cal-day:disabled { cursor: not-allowed; }
.stay-cal-day.range-start, .stay-cal-day.range-end {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); color: #171208; border-color: var(--color-primary);
  box-shadow: var(--shadow-glow);
}
.stay-cal-day.in-range { background: var(--color-primary-light); color: var(--color-primary); border-radius: 6px; }

.time-field { display: block; max-width: 200px; margin: 0 0 0.5rem; font-weight: 700; }

/* ---------------- Employee gallery ---------------- */
.employee-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 0.75rem; margin-bottom: 0.5rem; }
.employee-card {
  position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.4rem;
  padding: 1.1rem 0.85rem 0.9rem; border: 1.5px solid var(--color-border); background: var(--color-surface); border-radius: var(--radius-md);
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}
.employee-card:not(:disabled):hover { border-color: var(--color-primary); transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.employee-card.selected { background: var(--color-primary-light); border-color: var(--color-primary); box-shadow: var(--shadow-sm); }
.employee-card:disabled { opacity: 0.5; cursor: not-allowed; }
.employee-card-check {
  position: absolute; top: 0.6rem; right: 0.6rem; width: 18px; height: 18px; border-radius: 50%;
  border: 1.5px solid var(--color-border); background: var(--color-surface-2); z-index: 1;
}
.employee-card.selected .employee-card-check {
  border-color: var(--color-primary); background: var(--color-primary)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.2'%3E%3Cpath d='M3 8l3.5 3.5L13 5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    center/11px no-repeat;
}
.employee-photo {
  width: 64px; height: 64px; border-radius: 999px; overflow: hidden; flex-shrink: 0;
  box-shadow: var(--shadow-sm); border: 2px solid var(--color-surface); outline: 1px solid var(--color-border-soft);
}
.employee-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.employee-photo-fallback {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  background: var(--color-primary-light); color: var(--color-primary); font-weight: 700; font-size: 1.3rem;
}
.employee-card-name { font-weight: 700; font-size: 0.86rem; line-height: 1.25; }
.employee-card-position { color: var(--color-text-muted); font-size: 0.74rem; }
.unavailable-badge {
  font-size: 0.66rem; font-weight: 700; color: var(--color-danger);
  background: var(--color-danger-bg); padding: 0.2rem 0.55rem; border-radius: 999px;
}

.guests-field { display: block; margin-top: 0.75rem; max-width: 200px; }
.guests-stepper { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.4rem; }
.guests-stepper button {
  width: 36px; height: 36px; flex-shrink: 0; border-radius: var(--radius-sm); border: 1.5px solid var(--color-border);
  background: var(--color-surface-2); color: var(--color-text); font-weight: 700; font-size: 1.1rem; line-height: 1; cursor: pointer; transition: border-color 0.15s ease, color 0.15s ease;
}
.guests-stepper button:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.guests-stepper button:disabled { opacity: 0.4; cursor: not-allowed; }
.guests-stepper input { flex: 1; text-align: center; margin: 0; }

/* ---------------- Session cart ---------------- */
.tier-cart { display: flex; flex-direction: column; gap: 0.55rem; margin-bottom: 0.85rem; }
.tier-cart-row {
  border: 1.5px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface);
  padding: 0.85rem 1.05rem; cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease;
}
.tier-cart-row:hover { border-color: var(--color-primary); }
.tier-cart-row.focused { border-color: var(--color-primary); background: var(--color-primary-light); }
.tier-cart-row.in-cart { border-color: var(--color-success); }
.tier-cart-row.sold-out { opacity: 0.5; cursor: not-allowed; }
.tier-cart-main { display: flex; align-items: center; gap: 0.6rem; }
.tier-cart-label { font-weight: 700; font-size: 0.9rem; flex: 1; }
.tier-cart-price { font-weight: 800; color: var(--color-primary); font-size: 0.88rem; }
.tier-cart-tag { font-size: 0.68rem; font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 999px; }
.sold-out-tag { background: var(--color-danger-bg); color: var(--color-danger); }
.in-cart-tag { background: var(--color-success-bg); color: var(--color-success); }
.tier-cart-remaining { margin: 0.35rem 0 0; font-size: 0.76rem; color: var(--color-warning); font-weight: 700; }
.tier-cart-controls {
  display: flex; align-items: center; gap: 0.6rem; margin-top: 0.7rem; padding-top: 0.7rem;
  border-top: 1px dashed var(--color-border); flex-wrap: wrap;
}
.qty-stepper { display: flex; align-items: center; gap: 0.3rem; }
.qty-stepper button {
  width: 30px; height: 30px; border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface-2); color: var(--color-text); font-weight: 700; font-size: 1rem; line-height: 1; cursor: pointer;
}
.qty-stepper button:hover { border-color: var(--color-primary); color: var(--color-primary); }
.qty-stepper input { width: 46px; text-align: center; margin: 0; padding: 0.3rem; }
.add-to-cart-btn { padding: 0.4rem 1rem; font-size: 0.82rem; }

.cart-summary {
  margin-top: 0.5rem; padding: 0.9rem 1.05rem; background: var(--color-bg); border-radius: var(--radius-md);
  display: flex; flex-direction: column; gap: 0.45rem; border: 1px dashed var(--color-border);
}
.cart-summary-line { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
.cart-summary-label { flex: 1; }
.cart-summary-amount { font-weight: 700; color: var(--color-primary); }
.cart-line-remove {
  width: 22px; height: 22px; border-radius: 999px; border: none; background: transparent;
  color: var(--color-text-faint); cursor: pointer; font-size: 0.75rem; flex-shrink: 0;
}
.cart-line-remove:hover { background: var(--color-danger-bg); color: var(--color-danger); }
.cart-summary-total {
  display: flex; justify-content: space-between; font-weight: 800; color: var(--color-text);
  padding-top: 0.5rem; border-top: 1px solid var(--color-border); font-size: 0.92rem;
}

/* ---------------- Extras ---------------- */
.extras-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; margin: 0.4rem 0 0.5rem; }
.extra-card {
  position: relative; display: flex; align-items: center; gap: 0.8rem;
  padding: 0.8rem 1rem; border: 1.5px solid var(--color-border); background: var(--color-surface); border-radius: var(--radius-md);
  text-align: left; transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}
.extra-card:hover { border-color: var(--color-primary); transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.extra-card.selected { background: var(--color-primary-light); border-color: var(--color-primary); }
.extra-photo { width: 42px; height: 42px; border-radius: var(--radius-sm); flex-shrink: 0; overflow: hidden; box-shadow: var(--shadow-sm); }
.extra-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.extra-photo-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--color-primary-light); color: var(--color-primary); font-weight: 700; }
.extra-card-info { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 0.1rem; }
.extra-card-name { font-weight: 700; font-size: 0.89rem; }
.extra-card-price { font-size: 0.78rem; color: var(--color-primary); font-weight: 700; }
.extra-card-check {
  flex-shrink: 0; width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid var(--color-border);
  background: var(--color-surface-2); transition: border-color 0.15s ease, background 0.15s ease;
}
.extra-card.selected .extra-card-check {
  border-color: var(--color-primary); background: var(--color-primary)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M3 8l3.5 3.5L13 5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    center/12px no-repeat;
}

/* ---------------- Guest form ---------------- */
.guest-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.25rem; }
.guest-form-grid label { margin: 0 0 1.15rem; }
.guest-form-grid .field-full { grid-column: 1 / -1; }
@media (max-width: 520px) { .guest-form-grid { grid-template-columns: 1fr; } }
.input-icon-wrap { position: relative; margin-top: 0.35rem; }
.input-icon-wrap input { margin-top: 0; padding-left: 2.6rem; }
.field-icon {
  position: absolute; left: 0.9rem; top: 50%; transform: translateY(-50%);
  width: 17px; height: 17px; fill: var(--color-text-faint); pointer-events: none; transition: fill 0.15s ease;
}
.input-icon-wrap:focus-within .field-icon { fill: var(--color-primary); }

.actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.35rem; }
.btn-inline-spinner {
  width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff; display: inline-block; margin-right: 0.4rem; animation: pay-spin 0.7s linear infinite; vertical-align: -2px;
}
@media (max-width: 480px) { .actions { flex-wrap: wrap-reverse; } .actions .btn { flex: 1; justify-content: center; } }

/* ---------------- Review receipt ---------------- */
.receipt {
  display: flex; flex-direction: column; gap: 0.6rem; background: var(--color-bg); border-radius: var(--radius-md);
  padding: 1.1rem 1.25rem; border: 1px dashed var(--color-border);
}
.receipt-row { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; font-size: 0.88rem; }
.receipt-row em { font-style: normal; color: var(--color-primary); font-weight: 800; }
.receipt-heading { font-size: 1.02rem; font-weight: 600; font-family: var(--font-display); color: var(--color-text); }
.receipt-divider { height: 1px; background: var(--color-border); margin: 0.15rem 0; }
.receipt-total { font-size: 1.15rem; font-weight: 800; color: var(--color-primary); }

.checkbox-label { display: flex; align-items: center; gap: 0.55rem; font-weight: 600; margin-top: 1.35rem; }

/* ---------------- Payment ---------------- */
.payment-card { position: relative; overflow: hidden; }
.payment-head { display: flex; align-items: center; gap: 0.85rem; margin-bottom: 1.5rem; }
.payment-head-icon {
  flex-shrink: 0; width: 46px; height: 46px; border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-glow);
}
.payment-head-icon svg { width: 22px; height: 22px; fill: #fff; }
.payment-head .section-title { margin: 0; padding: 0; border: none; }
.payment-ref { margin: 0.15rem 0 0; font-size: 0.84rem; color: var(--color-text-muted); }
.payment-ref strong { color: var(--color-text); font-weight: 700; }

.pay-type-picker { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 0.5rem; }
.pay-type-card {
  display: flex; align-items: center; gap: 0.85rem; width: 100%; text-align: left;
  padding: 1.05rem 1.15rem; border: 1.5px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-surface); cursor: pointer; transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
}
.pay-type-card:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); transform: translateY(-1px); }
.pay-type-radio {
  flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--color-border);
  transition: border-color 0.15s ease;
}
.pay-type-card:hover .pay-type-radio { border-color: var(--color-primary); }
.pay-type-body { flex: 1; min-width: 0; }
.pay-type-title { display: block; font-weight: 700; font-size: 0.94rem; color: var(--color-text); }
.pay-type-desc { display: block; margin-top: 0.2rem; font-size: 0.78rem; color: var(--color-text-muted); line-height: 1.4; }
.pay-type-amount { flex-shrink: 0; font-weight: 800; font-size: 1.05rem; color: var(--color-primary); white-space: nowrap; }

.payment-summary {
  display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;
  padding: 1.05rem 1.15rem; background: var(--color-primary-light); border-radius: var(--radius-md);
  font-size: 0.88rem; margin-bottom: 0.6rem;
}
.payment-summary-label { font-weight: 700; color: var(--color-text); }
.payment-amount { font-size: 1.35rem; font-weight: 800; color: var(--color-primary); font-family: var(--font-display); }
.switch-payment-type-btn {
  display: inline-flex; align-items: center; gap: 0.35rem; margin: 0.6rem 0 1rem; padding: 0;
  background: none; border: none; color: var(--color-primary); font-weight: 700; font-size: 0.8rem; cursor: pointer;
}
.switch-payment-type-btn svg { width: 14px; height: 14px; fill: currentColor; }
.switch-payment-type-btn:hover { color: var(--color-primary-hover); text-decoration: underline; }
.payment-balance-note {
  margin: 0 0 1.25rem; font-size: 0.8rem; color: var(--color-accent-hover);
  background: var(--color-accent-light); padding: 0.65rem 0.9rem; border-radius: var(--radius-sm);
}
.payment-method-label { margin: 0 0 0.6rem; font-size: 0.82rem; font-weight: 700; color: var(--color-text-muted); }
.payment-skeleton { display: flex; flex-direction: column; }
#payment-element { margin-bottom: 1.25rem; }
.payment-actions { margin-top: 0; }
.pay-btn { width: 100%; justify-content: center; font-size: 1rem; padding: 0.95rem; gap: 0.55rem; }
.pay-btn-spinner {
  width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff; animation: pay-spin 0.7s linear infinite; flex-shrink: 0;
}
@keyframes pay-spin { to { transform: rotate(360deg); } }
.payment-secure-note {
  display: flex; align-items: center; justify-content: center; gap: 0.4rem;
  margin: 1.1rem 0 0; font-size: 0.76rem; color: var(--color-text-faint);
}
.payment-secure-note svg { width: 14px; height: 14px; fill: var(--color-text-faint); flex-shrink: 0; }
.payment-paid-note {
  display: inline-flex; align-items: center; gap: 0.4rem; margin: 0.75rem 0 0;
  color: var(--color-success); font-weight: 700; font-size: 0.86rem;
  background: var(--color-success-bg); padding: 0.4rem 0.9rem; border-radius: 999px;
}

.result-balance-card {
  margin-top: 1rem; text-align: left; padding: 1.05rem 1.15rem; border-radius: var(--radius-md);
  background: var(--color-warning-bg); border: 1px solid var(--color-border);
}
.result-balance-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.86rem; color: var(--color-text-muted); padding: 0.15rem 0; }
.result-balance-row strong { color: var(--color-text); font-weight: 700; }
.result-balance-row.due { margin-top: 0.3rem; padding-top: 0.5rem; border-top: 1px dashed var(--color-border); }
.result-balance-row.due strong { color: var(--color-warning); font-size: 1.15rem; }
.result-balance-hint { margin: 0.7rem 0 0; font-size: 0.78rem; color: var(--color-warning); line-height: 1.5; }

/* ---------------- Success screen ---------------- */
.result { position: relative; text-align: center; padding: 3.25rem 2rem 2.5rem; overflow: hidden; }
.result-glow {
  position: absolute; top: -120px; left: 50%; transform: translateX(-50%); width: 420px; height: 420px;
  background: radial-gradient(circle, rgba(21, 128, 61, 0.16), transparent 70%); pointer-events: none;
}
.result-icon {
  position: relative; width: 78px; height: 78px; border-radius: 999px; margin: 0 auto 1.35rem;
  background: linear-gradient(135deg, var(--color-success), #4f6b45); color: #fff;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 14px 32px rgba(21, 128, 61, 0.3);
  animation: result-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.result-icon svg { width: 38px; height: 38px; fill: #fff; }
@keyframes result-pop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.result h2 { position: relative; font-family: var(--font-display); font-weight: 600; font-size: 1.6rem; color: var(--color-text); }
.result-line {
  position: relative; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin: 1.35rem auto;
  padding: 0.8rem 1.15rem; background: var(--color-bg); border-radius: var(--radius-md); font-size: 0.88rem; max-width: 420px;
}
.result-items { text-align: left; margin: 1.1rem auto; padding: 1.05rem 1.2rem; max-width: 420px; }
.result-total { font-size: 1.4rem; font-weight: 800; color: var(--color-primary); margin-top: 0.5rem; font-family: var(--font-display); }
.result-actions { position: relative; display: flex; justify-content: center; gap: 0.65rem; margin-top: 1.75rem; flex-wrap: wrap; }

@media (prefers-reduced-motion: reduce) {
  .result-icon { animation: none; }
}
</style>
