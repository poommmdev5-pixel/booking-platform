<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { bookingsApi } from '../../api/bookings';
import { calendarApi } from '../../api/calendar';
import { settingsApi } from '../../api/settings';
import { formatCurrency, formatDate } from '../../i18n';
import StatusBadge from '../../components/StatusBadge.vue';
import MonthCalendar from '../../components/MonthCalendar.vue';
import { useLocaleRefetch } from '../../composables/useLocaleRefetch';

const { t } = useI18n();

const reference = ref('');
const email = ref('');
const booking = ref(null);
const notFound = ref(false);
const submitting = ref(false);

const policy = ref({
  allowSelfCancel: true,
  allowSelfReschedule: true,
  cancellationHoursBefore: 24,
  rescheduleHoursBefore: 24,
  requireApprovalForCancel: false,
  requireApprovalForReschedule: false,
});
settingsApi
  .getBookingPolicyPublic()
  .then((p) => (policy.value = p))
  .catch(() => {});

async function submit() {
  notFound.value = false;
  booking.value = null;
  submitting.value = true;
  try {
    booking.value = await bookingsApi.lookup(reference.value, email.value);
  } catch {
    notFound.value = true;
  } finally {
    submitting.value = false;
  }
}

// If a result is already shown, refresh it on language switch too — no-op otherwise,
// since there's nothing to look up yet.
useLocaleRefetch(async () => {
  if (booking.value) await submit();
});

function resetSearch() {
  booking.value = null;
  notFound.value = false;
  reference.value = '';
  email.value = '';
}

// ---- Self-service eligibility: mirrors the same notice-window rule the backend
// enforces, so the UI doesn't offer an action the server will just reject — but the
// backend re-checks everything independently regardless (never trust the client alone
// for something that changes real capacity). ----
function hoursUntil(dateStr) {
  if (!dateStr) return Infinity;
  return (new Date(`${dateStr}T00:00:00Z`) - Date.now()) / (1000 * 60 * 60);
}
const isActiveBooking = computed(() => booking.value && ['pending', 'confirmed'].includes(booking.value.status));
const hasPendingRequest = computed(() => !!booking.value?.pendingChangeRequest);
const cancelHoursShort = computed(() => isActiveBooking.value && hoursUntil(booking.value.dateStart) < policy.value.cancellationHoursBefore);
const rescheduleHoursShort = computed(() => isActiveBooking.value && hoursUntil(booking.value.dateStart) < policy.value.rescheduleHoursBefore);
// A pending request already covers whichever change was asked for — hide both actions
// rather than let the guest queue up a second, possibly-conflicting request on top.
const showCancelAction = computed(() => isActiveBooking.value && policy.value.allowSelfCancel && !hasPendingRequest.value);
const showRescheduleAction = computed(() => isActiveBooking.value && policy.value.allowSelfReschedule && !hasPendingRequest.value);

// ---- Cancel modal ----
const cancelModalOpen = ref(false);
const cancelReason = ref('');
const cancelling = ref(false);
const cancelError = ref('');
const actionSuccess = ref('');

function openCancelModal() {
  cancelReason.value = '';
  cancelError.value = '';
  cancelModalOpen.value = true;
}

async function confirmCancel() {
  if (!cancelReason.value.trim()) return;
  cancelling.value = true;
  cancelError.value = '';
  try {
    const res = await bookingsApi.cancelGuest({ reference: booking.value.reference, email: booking.value.guestEmail, reason: cancelReason.value.trim() });
    cancelModalOpen.value = false;
    actionSuccess.value = res.pending ? t('booking.cancelRequestSubmitted') : t('booking.cancelSuccessMsg');
    await submit();
  } catch (err) {
    cancelError.value = err.message;
  } finally {
    cancelling.value = false;
  }
}

// ---- Reschedule modal ----
const rescheduleModalOpen = ref(false);
const rescheduleError = ref('');
const rescheduling = ref(false);

// Local ISO date (not toISOString()'s UTC date) — see MonthCalendar.vue for why this
// matters in the first few hours of the local day.
function toLocalISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 'session' type
const sessionDates = ref([]);
const selectedNewSessionDate = ref(null);
const newSessions = ref([]);
const selectedNewSessionId = ref(null);
const newSessionEmployees = ref([]);
const selectedNewEmployeeId = ref(null);

// 'stay' / 'stay_session' type
const rescheduleMonth = ref(toLocalISODate(new Date()).slice(0, 7));
const stayDayStatus = ref(new Map());
const stayMonthsFetched = ref(new Set());
const selectedNewDate = ref(null);
const rangeError = ref('');
// stay_session only
const newTimeStart = ref('10:00');
const newStaySessionEmployees = ref([]);
const selectedNewStaySessionEmployeeId = ref(null);

function stayNightsOriginal() {
  if (!booking.value.dateStart || !booking.value.dateEnd) return 1;
  const start = new Date(`${booking.value.dateStart}T00:00:00Z`);
  const end = new Date(`${booking.value.dateEnd}T00:00:00Z`);
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

function staySessionMinutesOriginal() {
  if (!booking.value.timeStart || !booking.value.timeEnd) return null;
  const [sh, sm] = booking.value.timeStart.split(':').map(Number);
  const [eh, em] = booking.value.timeEnd.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function computedNewStaySessionTimeEnd() {
  const minutes = staySessionMinutesOriginal();
  if (!newTimeStart.value || !minutes) return null;
  return addMinutesToTime(newTimeStart.value, minutes);
}

async function loadRescheduleMonth(month) {
  if (stayMonthsFetched.value.has(month)) return;
  const { days } = await calendarApi.getStayCalendar(booking.value.productId, month);
  for (const d of days) stayDayStatus.value.set(d.date, d);
  stayMonthsFetched.value.add(month);
}

function stayDayInfo(date) {
  return stayDayStatus.value.get(date) || null;
}

async function openRescheduleModal() {
  rescheduleError.value = '';
  selectedNewSessionDate.value = null;
  newSessions.value = [];
  selectedNewSessionId.value = null;
  newSessionEmployees.value = [];
  selectedNewEmployeeId.value = null;
  selectedNewDate.value = null;
  rangeError.value = '';
  newTimeStart.value = booking.value.timeStart || '10:00';
  newStaySessionEmployees.value = [];
  selectedNewStaySessionEmployeeId.value = null;
  stayDayStatus.value = new Map();
  stayMonthsFetched.value = new Set();
  rescheduleMonth.value = toLocalISODate(new Date()).slice(0, 7);

  rescheduleModalOpen.value = true;

  if (booking.value.bookingType === 'session') {
    sessionDates.value = await calendarApi.getSessionDates(booking.value.productId);
  } else {
    await loadRescheduleMonth(rescheduleMonth.value);
  }
}

async function onRescheduleMonthChange(month) {
  rescheduleMonth.value = month;
  await loadRescheduleMonth(month);
}

async function selectNewSessionDate(date) {
  selectedNewSessionDate.value = date;
  selectedNewSessionId.value = null;
  newSessionEmployees.value = [];
  selectedNewEmployeeId.value = null;
  newSessions.value = await calendarApi.getAvailableSessions(booking.value.productId, date);
}

async function selectNewSession(sessionId) {
  selectedNewSessionId.value = sessionId;
  selectedNewEmployeeId.value = null;
  newSessionEmployees.value = await calendarApi.getSessionEmployees(booking.value.productId, sessionId);
}

function onStayDayClick(date) {
  rangeError.value = '';
  const info = stayDayInfo(date);
  if (!info || !info.isOpen) return;
  // A fixed number of nights (same as the original stay) must ALL be open starting here —
  // this mirrors the server's own range check so a customer isn't told "success" only to
  // have the backend reject an in-between closed day.
  const nights = stayNightsOriginal();
  let d = new Date(`${date}T00:00:00Z`);
  for (let i = 0; i < nights; i++) {
    const dayStr = d.toISOString().slice(0, 10);
    const dayInfo = stayDayInfo(dayStr);
    if (!dayInfo || !dayInfo.isOpen) {
      rangeError.value = t('booking.rangeHasClosedDay');
      selectedNewDate.value = null;
      return;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  selectedNewDate.value = date;
}

async function onStaySessionDayClick(date) {
  rangeError.value = '';
  const info = stayDayInfo(date);
  if (!info || !info.isOpen) return;
  selectedNewDate.value = date;
  await refreshNewStaySessionEmployees();
}

async function refreshNewStaySessionEmployees() {
  selectedNewStaySessionEmployeeId.value = null;
  newStaySessionEmployees.value = [];
  const timeEnd = computedNewStaySessionTimeEnd();
  if (!selectedNewDate.value || !newTimeStart.value || !timeEnd) return;
  newStaySessionEmployees.value = await calendarApi.getStaySessionEmployees(booking.value.productId, selectedNewDate.value, newTimeStart.value, timeEnd);
}

function newStayCheckOut() {
  if (!selectedNewDate.value) return null;
  const d = new Date(`${selectedNewDate.value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + stayNightsOriginal());
  return d.toISOString().slice(0, 10);
}

const canConfirmReschedule = computed(() => {
  if (!booking.value) return false;
  if (booking.value.bookingType === 'session') return !!selectedNewSessionId.value && (newSessionEmployees.value.length === 0 || !!selectedNewEmployeeId.value);
  if (booking.value.bookingType === 'stay') return !!selectedNewDate.value;
  if (booking.value.bookingType === 'stay_session') return !!selectedNewDate.value && !!newTimeStart.value && !!computedNewStaySessionTimeEnd() && !!selectedNewStaySessionEmployeeId.value;
  return false;
});

async function confirmReschedule() {
  rescheduling.value = true;
  rescheduleError.value = '';
  try {
    const payload = { reference: booking.value.reference, email: booking.value.guestEmail };
    if (booking.value.bookingType === 'session') {
      payload.newSessionId = selectedNewSessionId.value;
      if (selectedNewEmployeeId.value) payload.newEmployeeId = selectedNewEmployeeId.value;
    } else if (booking.value.bookingType === 'stay') {
      payload.newDateStart = selectedNewDate.value;
    } else {
      payload.newDate = selectedNewDate.value;
      payload.newTimeStart = newTimeStart.value;
      payload.newEmployeeId = selectedNewStaySessionEmployeeId.value;
    }
    const res = await bookingsApi.rescheduleGuest(payload);
    rescheduleModalOpen.value = false;
    actionSuccess.value = res.pending ? t('booking.rescheduleRequestSubmitted') : t('booking.rescheduleSuccess');
    await submit();
  } catch (err) {
    rescheduleError.value = err.message;
  } finally {
    rescheduling.value = false;
  }
}
</script>

<template>
  <div class="lookup-page">
    <div class="lookup-card surface-panel">
      <p class="eyebrow">Andaman Breeze Resort</p>
      <h1 class="page-heading">{{ $t('account.lookupTitle') }}</h1>
      <p class="lookup-sub">{{ $t('account.lookupSub') }}</p>

      <form v-if="!booking" @submit.prevent="submit">
        <label>{{ $t('booking.reference') }}<input v-model="reference" required placeholder="BK-XXXXXX-XXXXXX" /></label>
        <label>{{ $t('booking.email') }}<input type="email" v-model="email" required /></label>
        <button class="btn btn-accent" type="submit" :disabled="submitting">{{ $t('account.lookupShort') }}</button>
      </form>
      <p v-if="notFound" class="error">{{ $t('account.lookupNotFound') }}</p>

      <Transition name="fade-msg">
        <p v-if="actionSuccess" class="action-success">✓ {{ actionSuccess }}</p>
      </Transition>

      <div v-if="booking" class="result">
        <div class="result-head">
          <div>
            <p class="result-label">{{ $t('booking.reference') }}</p>
            <p class="result-ref">{{ booking.reference }}</p>
          </div>
          <StatusBadge :status="booking.status" />
        </div>
        <div class="result-row">
          <span>{{ $t('booking.date') }}</span>
          <strong>{{ formatDate(booking.dateStart) }} <template v-if="booking.dateEnd">→ {{ formatDate(booking.dateEnd) }}</template><template v-if="booking.timeStart">· {{ booking.timeStart }}</template></strong>
        </div>
        <div v-if="booking.product" class="result-row"><span>{{ $t('nav.products') }}</span><strong>{{ booking.product.name }}</strong></div>
        <div class="result-row result-total"><span>{{ $t('booking.total') }}</span><strong>{{ formatCurrency(booking.totalPrice) }}</strong></div>

        <div v-if="booking.payment.amountPaid > 0" class="payment-mini">
          <div class="payment-mini-row"><span>{{ $t('admin.amountPaidLabel') }}</span><strong class="paid">{{ formatCurrency(booking.payment.amountPaid) }}</strong></div>
          <div v-if="booking.payment.balanceDue > 0" class="payment-mini-row due"><span>{{ $t('admin.balanceDueLabel') }}</span><strong>{{ formatCurrency(booking.payment.balanceDue) }}</strong></div>
        </div>

        <div v-if="hasPendingRequest" class="pending-request-banner">
          <span class="pending-icon">⏳</span>
          <span>{{ $t(booking.pendingChangeRequest.type === 'cancel' ? 'booking.pendingCancelBanner' : 'booking.pendingRescheduleBanner') }}</span>
        </div>

        <div v-if="showCancelAction || showRescheduleAction" class="self-service-actions">
          <div v-if="showRescheduleAction" class="action-row">
            <button class="btn btn-secondary btn-sm" :disabled="rescheduleHoursShort" @click="openRescheduleModal">{{ $t('booking.rescheduleAction') }}</button>
            <p v-if="rescheduleHoursShort" class="action-hint">{{ $t('booking.noticeTooLate', { hours: policy.rescheduleHoursBefore }) }}</p>
          </div>
          <div v-if="showCancelAction" class="action-row">
            <button class="btn btn-ghost btn-sm danger-ghost" :disabled="cancelHoursShort" @click="openCancelModal">{{ $t('booking.cancel') }}</button>
            <p v-if="cancelHoursShort" class="action-hint">{{ $t('booking.noticeTooLate', { hours: policy.cancellationHoursBefore }) }}</p>
          </div>
        </div>

        <button type="button" class="reset-search-btn" @click="resetSearch">{{ $t('booking.lookupAnother') }}</button>
      </div>
    </div>

    <!-- Cancel modal -->
    <div v-if="cancelModalOpen" class="modal-backdrop" @click.self="cancelModalOpen = false">
      <div class="modal-card">
        <h2>{{ $t('booking.cancelModalTitle') }}</h2>
        <p class="modal-hint">{{ $t('booking.cancelModalHint') }}</p>
        <textarea v-model="cancelReason" rows="3" :placeholder="$t('booking.cancelReasonPlaceholder')"></textarea>
        <p v-if="cancelError" class="error">{{ cancelError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="cancelModalOpen = false">{{ $t('booking.keepBooking') }}</button>
          <button class="btn btn-danger" :disabled="!cancelReason.trim() || cancelling" @click="confirmCancel">
            {{ cancelling ? $t('admin.savingEllipsis') : $t('booking.cancelModalTitle') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reschedule modal -->
    <div v-if="rescheduleModalOpen" class="modal-backdrop" @click.self="rescheduleModalOpen = false">
      <div class="modal-card reschedule-card">
        <h2>{{ $t('booking.rescheduleModalTitle') }}</h2>
        <div class="current-schedule">
          <span class="current-schedule-label">{{ $t('booking.currentSchedule') }}</span>
          <strong>{{ formatDate(booking.dateStart) }}<template v-if="booking.dateEnd"> → {{ formatDate(booking.dateEnd) }}</template><template v-if="booking.timeStart"> · {{ booking.timeStart }}</template></strong>
        </div>

        <p class="pick-new-label">{{ $t('booking.pickNewSchedule') }}</p>

        <!-- session type -->
        <template v-if="booking.bookingType === 'session'">
          <template v-if="!selectedNewSessionDate">
            <div class="date-picker-list">
              <button v-for="d in sessionDates" :key="d.date" type="button" class="date-pick-btn" @click="selectNewSessionDate(d.date)">
                <span class="session-name">{{ formatDate(d.date) }}</span>
                <span class="session-time">{{ d.count }} {{ $t('admin.sessions') }}</span>
              </button>
              <p v-if="sessionDates.length === 0" class="empty-state">{{ $t('booking.noSlotsAvailable') }}</p>
            </div>
          </template>
          <template v-else>
            <button type="button" class="btn-ghost btn-sm back-btn" @click="selectedNewSessionDate = null">← {{ formatDate(selectedNewSessionDate) }}</button>
            <div class="sessions-list">
              <button
                v-for="s in newSessions"
                :key="s.id"
                type="button"
                class="session-btn"
                :class="{ selected: selectedNewSessionId === s.id }"
                @click="selectNewSession(s.id)"
              >
                <span class="session-name">{{ s.name }}</span>
                <span class="session-time">{{ s.timeStart }} - {{ s.timeEnd }}</span>
              </button>
            </div>
            <template v-if="selectedNewSessionId && newSessionEmployees.length > 0">
              <p class="picker-label">{{ $t('booking.selectEmployee') }}</p>
              <div class="employee-picker-list">
                <button
                  v-for="e in newSessionEmployees"
                  :key="e.id"
                  type="button"
                  class="employee-pick-btn"
                  :class="{ selected: selectedNewEmployeeId === e.id }"
                  :disabled="!e.available"
                  @click="selectedNewEmployeeId = e.id"
                >
                  <span class="employee-name">{{ e.name }}</span>
                  <span v-if="!e.available" class="unavailable-badge">{{ $t('booking.employeeUnavailable') }}</span>
                </button>
              </div>
            </template>
          </template>
        </template>

        <!-- stay type -->
        <template v-else-if="booking.bookingType === 'stay'">
          <MonthCalendar v-model:month="rescheduleMonth" @update:month="onRescheduleMonthChange">
            <template #day="{ date, day, isPast }">
              <button
                type="button"
                class="stay-cal-day"
                :class="{
                  past: isPast,
                  closed: stayDayInfo(date) && !stayDayInfo(date).isOpen,
                  unknown: !stayDayInfo(date),
                  'range-start': date === selectedNewDate,
                }"
                :disabled="!stayDayInfo(date) || !stayDayInfo(date).isOpen"
                @click="onStayDayClick(date)"
              >
                {{ day }}
              </button>
            </template>
          </MonthCalendar>
          <p v-if="rangeError" class="error">{{ rangeError }}</p>
          <p v-if="selectedNewDate" class="new-range-label">{{ formatDate(selectedNewDate) }} → {{ formatDate(newStayCheckOut()) }}</p>
        </template>

        <!-- stay_session type -->
        <template v-else-if="booking.bookingType === 'stay_session'">
          <MonthCalendar v-model:month="rescheduleMonth" @update:month="onRescheduleMonthChange">
            <template #day="{ date, day, isPast }">
              <button
                type="button"
                class="stay-cal-day"
                :class="{
                  past: isPast,
                  closed: stayDayInfo(date) && !stayDayInfo(date).isOpen,
                  unknown: !stayDayInfo(date),
                  'range-start': date === selectedNewDate,
                }"
                :disabled="!stayDayInfo(date) || !stayDayInfo(date).isOpen"
                @click="onStaySessionDayClick(date)"
              >
                {{ day }}
              </button>
            </template>
          </MonthCalendar>
          <template v-if="selectedNewDate">
            <label class="time-field">{{ $t('booking.selectTime') }}<input type="time" v-model="newTimeStart" @change="refreshNewStaySessionEmployees" /></label>
            <p v-if="computedNewStaySessionTimeEnd()" class="new-range-label">{{ formatDate(selectedNewDate) }} · {{ newTimeStart }} - {{ computedNewStaySessionTimeEnd() }}</p>
            <p v-else class="empty-state">{{ $t('booking.durationTooLate') }}</p>
            <template v-if="computedNewStaySessionTimeEnd()">
              <p v-if="newStaySessionEmployees.length === 0" class="empty-state">{{ $t('booking.noStaffForDates') }}</p>
              <template v-else>
                <p class="picker-label">{{ $t('booking.selectEmployee') }}</p>
                <div class="employee-picker-list">
                  <button
                    v-for="e in newStaySessionEmployees"
                    :key="e.id"
                    type="button"
                    class="employee-pick-btn"
                    :class="{ selected: selectedNewStaySessionEmployeeId === e.id }"
                    :disabled="!e.available"
                    @click="selectedNewStaySessionEmployeeId = e.id"
                  >
                    <span class="employee-name">{{ e.name }}</span>
                    <span v-if="!e.available" class="unavailable-badge">{{ $t('booking.employeeUnavailable') }}</span>
                  </button>
                </div>
              </template>
            </template>
          </template>
        </template>

        <p v-if="rescheduleError" class="error">{{ rescheduleError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="rescheduleModalOpen = false">{{ $t('common.cancel') }}</button>
          <button class="btn" :disabled="!canConfirmReschedule || rescheduling" @click="confirmReschedule">
            {{ rescheduling ? $t('admin.savingEllipsis') : $t('booking.confirmReschedule') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lookup-page { max-width: 460px; margin: 2rem auto; }
.lookup-card { padding: 2.25rem; }
.lookup-card .page-heading { margin: 0 0 0.5rem; }
.lookup-sub { color: var(--color-text-muted); font-size: 0.88rem; margin: 0 0 1.5rem; line-height: 1.6; }
.lookup-card input { max-width: none; }
.lookup-card .btn { width: 100%; margin-top: 0.5rem; justify-content: center; }

.action-success {
  margin: 1rem 0 0; padding: 0.6rem 0.9rem; border-radius: var(--radius-sm);
  background: var(--color-success-bg); color: var(--color-success); font-weight: 700; font-size: 0.86rem;
}
.fade-msg-enter-active, .fade-msg-leave-active { transition: opacity 0.2s ease; }
.fade-msg-enter-from, .fade-msg-leave-to { opacity: 0; }

.result { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border-soft); display: flex; flex-direction: column; gap: 0.7rem; }
.result-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.4rem; }
.result-label { margin: 0; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-faint); }
.result-ref { margin: 0.15rem 0 0; font-weight: 800; font-size: 1.05rem; color: var(--color-primary-dark); }
.result-row { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; font-size: 0.88rem; color: var(--color-text-muted); }
.result-row strong { color: var(--color-text); font-weight: 700; }
.result-total { padding-top: 0.6rem; border-top: 1px dashed var(--color-border); font-size: 0.95rem; }
.result-total strong { color: var(--color-primary); font-size: 1.05rem; }

.payment-mini { background: var(--color-bg); border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; display: flex; flex-direction: column; gap: 0.3rem; }
.payment-mini-row { display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--color-text-muted); }
.payment-mini-row strong { color: var(--color-text); font-weight: 700; }
.payment-mini-row strong.paid { color: var(--color-success); }
.payment-mini-row.due strong { color: var(--color-warning); }

.pending-request-banner {
  display: flex; align-items: flex-start; gap: 0.55rem; padding: 0.7rem 0.9rem;
  border-radius: var(--radius-sm); background: var(--color-warning-bg); color: #92400e;
  font-size: 0.82rem; font-weight: 600; line-height: 1.5;
}
.pending-icon { flex-shrink: 0; }

.self-service-actions { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 0.4rem; padding-top: 1rem; border-top: 1px solid var(--color-border-soft); }
.action-row .btn { width: 100%; margin: 0; justify-content: center; }
.action-row .btn:disabled { opacity: 0.45; }
.danger-ghost { color: var(--color-danger); }
.danger-ghost:hover { background: var(--color-danger-bg); }
.action-hint { margin: 0.35rem 0 0; font-size: 0.74rem; color: var(--color-text-faint); text-align: center; }
.reset-search-btn {
  margin-top: 0.6rem; background: none; border: none; color: var(--color-text-muted); font-size: 0.8rem;
  font-weight: 600; text-decoration: underline; cursor: pointer; align-self: center;
}

/* Modals */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.25rem; overflow-y: auto;
}
.modal-card {
  width: 100%; max-width: 420px; max-height: 88vh; overflow-y: auto;
  background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 1.75rem;
}
.modal-card h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
.modal-hint { margin: 0 0 0.85rem; font-size: 0.85rem; color: var(--color-text-muted); }
.modal-card textarea { width: 100%; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.25rem; }

.reschedule-card { max-width: 460px; }
.current-schedule {
  display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;
  background: var(--color-bg); border-radius: var(--radius-sm); padding: 0.6rem 0.85rem; margin-bottom: 1.1rem; font-size: 0.85rem;
}
.current-schedule-label { color: var(--color-text-muted); font-weight: 600; }
.pick-new-label { margin: 0 0 0.65rem; font-weight: 700; font-size: 0.88rem; }
.new-range-label { margin: 0.6rem 0 0; font-weight: 700; color: var(--color-primary); font-size: 0.9rem; }
.picker-label { margin: 1rem 0 0.5rem; font-weight: 600; font-size: 0.82rem; color: var(--color-text-muted); }
.time-field { display: block; margin: 0.85rem 0 0; font-weight: 600; font-size: 0.85rem; }
.time-field input { margin-top: 0.35rem; max-width: 160px; }

.date-picker-list, .sessions-list, .employee-picker-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 260px; overflow-y: auto; }
.date-pick-btn, .session-btn, .employee-pick-btn {
  display: flex; align-items: center; justify-content: space-between; gap: 0.6rem;
  padding: 0.65rem 0.85rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  background: #fff; cursor: pointer; text-align: left; transition: border-color 0.15s ease, background 0.15s ease;
}
.date-pick-btn:hover, .session-btn:hover, .employee-pick-btn:not(:disabled):hover { border-color: var(--color-primary); }
.session-btn.selected, .employee-pick-btn.selected { border-color: var(--color-primary); background: var(--color-primary-light); }
.employee-pick-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.session-name { font-weight: 700; font-size: 0.88rem; }
.session-time { font-size: 0.78rem; color: var(--color-text-muted); }
.employee-name { font-weight: 600; font-size: 0.88rem; }
.unavailable-badge { font-size: 0.7rem; color: var(--color-danger); font-weight: 700; }
.back-btn { margin-bottom: 0.75rem; }

.stay-cal-day {
  width: 100%; height: 100%; border: 1px solid transparent; border-radius: var(--radius-sm); background: var(--color-bg);
  display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.85rem; font-weight: 600;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.stay-cal-day:hover:not(:disabled) { border-color: var(--color-primary); }
.stay-cal-day.past { opacity: 0.4; }
.stay-cal-day.closed { opacity: 0.35; text-decoration: line-through; }
.stay-cal-day.unknown { opacity: 0.5; }
.stay-cal-day.range-start { border-color: var(--color-primary); background: var(--color-primary-light); color: var(--color-primary-dark); }
.stay-cal-day:disabled { cursor: not-allowed; }

.empty-state { padding: 0.75rem; text-align: center; font-size: 0.85rem; color: var(--color-text-muted); }
</style>
