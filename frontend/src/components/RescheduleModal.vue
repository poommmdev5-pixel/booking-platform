<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { calendarApi } from '../api/calendar';
import { formatDate } from '../i18n';
import MonthCalendar from './MonthCalendar.vue';

// Shared by the guest lookup flow (Lookup.vue) and the logged-in "My Bookings" flow
// (MyBookings.vue) — the slot-picking UI is identical either way, only how the final
// request is submitted differs (reference+email vs. session + ownership), so that part
// is left to the caller via the `submit` prop instead of baked in here.
const props = defineProps({
  booking: { type: Object, required: true },
  submit: { type: Function, required: true }, // async (payload) => { pending }
});
const emit = defineEmits(['close', 'success']);

const { t } = useI18n();

function toLocalISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const rescheduleError = ref('');
const rescheduling = ref(false);

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
const newTimeStart = ref(props.booking.timeStart || '10:00');
const newStaySessionEmployees = ref([]);
const selectedNewStaySessionEmployeeId = ref(null);
// Immediate feedback when the picked time is in the past for a same-day reschedule —
// mirrors the equivalent check added to BookingFlow.vue for new bookings.
const pastTimeError = ref('');

function stayNightsOriginal() {
  if (!props.booking.dateStart || !props.booking.dateEnd) return 1;
  const start = new Date(`${props.booking.dateStart}T00:00:00Z`);
  const end = new Date(`${props.booking.dateEnd}T00:00:00Z`);
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

function staySessionMinutesOriginal() {
  if (!props.booking.timeStart || !props.booking.timeEnd) return null;
  const [sh, sm] = props.booking.timeStart.split(':').map(Number);
  const [eh, em] = props.booking.timeEnd.split(':').map(Number);
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

function checkPastTime() {
  pastTimeError.value = '';
  if (!selectedNewDate.value || !newTimeStart.value) return;
  const todayStr = toLocalISODate(new Date());
  if (selectedNewDate.value !== todayStr) return;
  const nowStr = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  if (newTimeStart.value <= nowStr) pastTimeError.value = t('booking.timeInPast');
}

async function loadRescheduleMonth(month) {
  if (stayMonthsFetched.value.has(month)) return;
  const { days } = await calendarApi.getStayCalendar(props.booking.productId, month);
  for (const d of days) stayDayStatus.value.set(d.date, d);
  stayMonthsFetched.value.add(month);
}

function stayDayInfo(date) {
  return stayDayStatus.value.get(date) || null;
}

async function init() {
  if (props.booking.bookingType === 'session') {
    sessionDates.value = await calendarApi.getSessionDates(props.booking.productId);
  } else {
    await loadRescheduleMonth(rescheduleMonth.value);
  }
}
init();

async function onRescheduleMonthChange(month) {
  rescheduleMonth.value = month;
  await loadRescheduleMonth(month);
}

async function selectNewSessionDate(date) {
  selectedNewSessionDate.value = date;
  selectedNewSessionId.value = null;
  newSessionEmployees.value = [];
  selectedNewEmployeeId.value = null;
  newSessions.value = await calendarApi.getAvailableSessions(props.booking.productId, date);
}

async function selectNewSession(sessionId) {
  selectedNewSessionId.value = sessionId;
  selectedNewEmployeeId.value = null;
  newSessionEmployees.value = await calendarApi.getSessionEmployees(props.booking.productId, sessionId);
}

function onStayDayClick(date) {
  rangeError.value = '';
  const info = stayDayInfo(date);
  if (!info || !info.isOpen) return;
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
  checkPastTime();
  await refreshNewStaySessionEmployees();
}

async function refreshNewStaySessionEmployees() {
  selectedNewStaySessionEmployeeId.value = null;
  newStaySessionEmployees.value = [];
  checkPastTime();
  const timeEnd = computedNewStaySessionTimeEnd();
  if (!selectedNewDate.value || !newTimeStart.value || !timeEnd || pastTimeError.value) return;
  newStaySessionEmployees.value = await calendarApi.getStaySessionEmployees(props.booking.productId, selectedNewDate.value, newTimeStart.value, timeEnd);
}

function newStayCheckOut() {
  if (!selectedNewDate.value) return null;
  const d = new Date(`${selectedNewDate.value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + stayNightsOriginal());
  return d.toISOString().slice(0, 10);
}

const canConfirmReschedule = computed(() => {
  if (props.booking.bookingType === 'session') return !!selectedNewSessionId.value && (newSessionEmployees.value.length === 0 || !!selectedNewEmployeeId.value);
  if (props.booking.bookingType === 'stay') return !!selectedNewDate.value;
  if (props.booking.bookingType === 'stay_session') {
    return !!selectedNewDate.value && !!newTimeStart.value && !!computedNewStaySessionTimeEnd() && !!selectedNewStaySessionEmployeeId.value && !pastTimeError.value;
  }
  return false;
});

async function confirmReschedule() {
  rescheduling.value = true;
  rescheduleError.value = '';
  try {
    const payload = {};
    if (props.booking.bookingType === 'session') {
      payload.newSessionId = selectedNewSessionId.value;
      if (selectedNewEmployeeId.value) payload.newEmployeeId = selectedNewEmployeeId.value;
    } else if (props.booking.bookingType === 'stay') {
      payload.newDateStart = selectedNewDate.value;
    } else {
      payload.newDate = selectedNewDate.value;
      payload.newTimeStart = newTimeStart.value;
      payload.newEmployeeId = selectedNewStaySessionEmployeeId.value;
    }
    const res = await props.submit(payload);
    emit('success', res);
  } catch (err) {
    rescheduleError.value = err.message;
  } finally {
    rescheduling.value = false;
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
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
          <p v-if="pastTimeError" class="error">{{ pastTimeError }}</p>
          <p v-else-if="computedNewStaySessionTimeEnd()" class="new-range-label">{{ formatDate(selectedNewDate) }} · {{ newTimeStart }} - {{ computedNewStaySessionTimeEnd() }}</p>
          <p v-else class="error">{{ $t('booking.durationTooLate') }}</p>
          <template v-if="computedNewStaySessionTimeEnd() && !pastTimeError">
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
        <button class="btn btn-secondary" @click="emit('close')">{{ $t('common.cancel') }}</button>
        <button class="btn" :disabled="!canConfirmReschedule || rescheduling" @click="confirmReschedule">
          {{ rescheduling ? $t('admin.savingEllipsis') : $t('booking.confirmReschedule') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(28, 20, 12, 0.6); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.25rem; overflow-y: auto;
}
.modal-card {
  width: 100%; max-width: 420px; max-height: 88vh; overflow-y: auto;
  background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 1.75rem;
}
.modal-card h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
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
.error { color: var(--color-danger); font-size: 0.82rem; margin: 0.5rem 0 0; }
</style>
