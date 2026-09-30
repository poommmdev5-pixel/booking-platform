<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatDate } from '../../i18n';
import { calendarApi } from '../../api/calendar';
import { productsApi } from '../../api/products';
import { employeesApi } from '../../api/employees';
import { usePagination } from '../../composables/usePagination';
import Pagination from '../../components/Pagination.vue';
import MonthCalendar from '../../components/MonthCalendar.vue';
import BackButton from '../../components/BackButton.vue';

const props = defineProps({ id: { type: String, required: true } });
const productId = Number(props.id);
const { t } = useI18n();

const bookingType = ref(null);
const employees = ref([]);
// Local calendar date, not toISOString()'s UTC date (see MonthCalendar.vue) — otherwise
// the initial month shown can be a day off during the first hours of the local day.
function toLocalISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const currentMonth = ref(toLocalISODate(new Date()).slice(0, 7));

// ---------------- Session type: unchanged business logic, calendar-grid shell ----------------
const sessions = ref([]);
const selectedDate = ref(null);
const newRound = ref({ name: '', timeStart: '10:00', timeEnd: '11:00', employeeIds: [] });
const sessionError = ref('');

const dateGroups = computed(() => {
  const map = new Map();
  for (const s of sessions.value) {
    if (!map.has(s.date)) map.set(s.date, []);
    map.get(s.date).push(s);
  }
  return [...map.entries()].map(([date, rounds]) => ({ date, rounds, bookedCount: rounds.filter((r) => r.isFull).length }));
});

function dateGroupFor(date) {
  return dateGroups.value.find((g) => g.date === date) || null;
}

const roundsForSelectedDate = computed(() => sessions.value.filter((s) => s.date === selectedDate.value));
const allEmployeesSelected = computed(() => employees.value.length > 0 && newRound.value.employeeIds.length === employees.value.length);
const { page: roundsPage, totalPages: roundsTotalPages, pageItems: pageRounds } = usePagination(roundsForSelectedDate, 5);

async function loadSessions() {
  sessions.value = await calendarApi.listSessionsAdmin(productId);
}

function selectDate(date) {
  sessionError.value = '';
  selectedDate.value = date;
  roundsPage.value = 1;
}

function toggleAllEmployees() {
  newRound.value.employeeIds = allEmployeesSelected.value ? [] : employees.value.map((e) => e.id);
}

async function addRound() {
  sessionError.value = '';
  if (!selectedDate.value) return;
  if (!newRound.value.name || !newRound.value.name.trim()) {
    sessionError.value = t('admin.roundNameRequired');
    return;
  }
  if (newRound.value.timeEnd <= newRound.value.timeStart) {
    sessionError.value = t('admin.endTimeAfterStart');
    return;
  }
  try {
    await calendarApi.createSession(productId, { ...newRound.value, date: selectedDate.value });
    newRound.value = { name: '', timeStart: '10:00', timeEnd: '11:00', employeeIds: [] };
    await loadSessions();
  } catch (err) {
    sessionError.value = err.message;
  }
}

async function removeSession(session) {
  sessionError.value = '';
  try {
    await calendarApi.removeSession(productId, session.id);
    await loadSessions();
  } catch (err) {
    sessionError.value = err.message;
  }
}

// ---------------- Stay type: new month calendar + per-day holiday/staff editor ----------------
const stayDays = ref([]);
const stayMonthOpen = ref(true);
const monthActionError = ref('');
const monthActionBusy = ref(false);
const selectedStayDate = ref(null);
const dayEditor = ref({ isHoliday: false, employeeIds: [] });
const stayError = ref('');
const staySaving = ref(false);

function stayDayFor(date) {
  return stayDays.value.find((d) => d.date === date) || null;
}

async function loadStayMonth() {
  const res = await calendarApi.getStayCalendarAdmin(productId, currentMonth.value);
  stayDays.value = res.days;
  stayMonthOpen.value = res.monthOpen;
}

async function openCurrentMonth() {
  monthActionError.value = '';
  monthActionBusy.value = true;
  try {
    await calendarApi.openStayMonth(productId, currentMonth.value);
    await loadStayMonth();
  } catch (err) {
    monthActionError.value = err.message;
  } finally {
    monthActionBusy.value = false;
  }
}

async function closeCurrentMonth() {
  monthActionError.value = '';
  monthActionBusy.value = true;
  try {
    await calendarApi.closeStayMonth(productId, currentMonth.value);
    selectedStayDate.value = null;
    await loadStayMonth();
  } catch (err) {
    monthActionError.value = err.message;
  } finally {
    monthActionBusy.value = false;
  }
}

const allDayEmployeesSelected = computed(
  () => employees.value.length > 0 && dayEditor.value.employeeIds.length === employees.value.length,
);

function toggleAllDayEmployees() {
  dayEditor.value.employeeIds = allDayEmployeesSelected.value ? [] : employees.value.map((e) => e.id);
}

function selectStayDate(date) {
  if (bookingType.value === 'stay' && !stayMonthOpen.value) return;
  stayError.value = '';
  selectedStayDate.value = date;
  const cfg = stayDayFor(date);
  dayEditor.value = { isHoliday: cfg?.isHoliday || false, employeeIds: (cfg?.employees || []).map((e) => e.id) };
}

async function saveStayDay() {
  stayError.value = '';
  staySaving.value = true;
  try {
    await calendarApi.saveStayDay(productId, {
      date: selectedStayDate.value,
      isHoliday: dayEditor.value.isHoliday,
      employeeIds: dayEditor.value.employeeIds,
    });
    await loadStayMonth();
  } catch (err) {
    stayError.value = err.message;
  } finally {
    staySaving.value = false;
  }
}

async function clearStayDay() {
  stayError.value = '';
  try {
    await calendarApi.clearStayDay(productId, selectedStayDate.value);
    dayEditor.value = { isHoliday: false, employeeIds: [] };
    await loadStayMonth();
  } catch (err) {
    stayError.value = err.message;
  }
}

watch(currentMonth, () => {
  if (bookingType.value === 'stay' || bookingType.value === 'stay_session') loadStayMonth();
});

onMounted(async () => {
  const product = await productsApi.getAdmin(productId);
  bookingType.value = product.bookingType;

  const allEmployees = await employeesApi.listAdmin();
  employees.value = allEmployees.filter((e) => e.status === 'active');

  if (bookingType.value === 'session') await loadSessions();
  else if (bookingType.value === 'stay' || bookingType.value === 'stay_session') await loadStayMonth();
});
</script>

<template>
  <BackButton :to="{ name: 'admin-products' }" />
  <h1>{{ $t('admin.calendar') }}</h1>

  <template v-if="bookingType === 'session'">
    <div class="cal-manager">
      <div class="cal-panel card">
        <MonthCalendar v-model:month="currentMonth" :disable-past-nav="false">
          <template #day="{ date, day, isPast, isToday }">
            <button
              type="button"
              class="cal-day"
              :class="{ selected: date === selectedDate, past: isPast, today: isToday, 'has-rounds': dateGroupFor(date) }"
              @click="selectDate(date)"
            >
              <span class="cal-day-num">{{ day }}</span>
              <span v-if="dateGroupFor(date)" class="cal-day-badge">{{ dateGroupFor(date).rounds.length }}</span>
            </button>
          </template>
        </MonthCalendar>
      </div>

      <div class="editor-panel card">
        <template v-if="selectedDate">
          <h2>{{ formatDate(selectedDate) }}</h2>
          <div class="add-round-form">
            <div class="add-round-fields">
              <label>{{ $t('admin.sessionName') }}<input v-model="newRound.name" required :placeholder="$t('admin.sessionName')" /></label>
              <label>{{ $t('admin.timeStart') }}<input type="time" v-model="newRound.timeStart" /></label>
              <label>{{ $t('admin.timeEnd') }}<input type="time" v-model="newRound.timeEnd" /></label>
            </div>

            <div class="employees-field">
              <div class="employees-header">
                <label class="field-label">{{ $t('admin.assignEmployees') }}</label>
                <label class="select-all-label">
                  <input type="checkbox" :checked="allEmployeesSelected" @change="toggleAllEmployees" />
                  {{ $t('admin.selectAll') }}
                </label>
              </div>
              <div v-if="employees.length === 0" class="employees-empty">{{ $t('admin.noEmployeesYet') }}</div>
              <div v-else class="employees-list">
                <label v-for="e in employees" :key="e.id" class="employee-checkbox">
                  <input type="checkbox" :value="e.id" v-model="newRound.employeeIds" />
                  <img v-if="e.coverImage" class="employee-avatar" :src="e.coverImage.urlThumbnail" alt="" />
                  <span v-else class="employee-avatar employee-avatar-empty">{{ e.name.charAt(0) }}</span>
                  <span class="employee-name">{{ e.name }}<small v-if="e.position"> · {{ e.position }}</small></span>
                </label>
              </div>
            </div>

            <button class="btn btn-sm add-round-btn" @click="addRound">{{ $t('admin.addSession') }}</button>
          </div>
          <p v-if="sessionError" class="error">{{ sessionError }}</p>

          <div v-if="roundsForSelectedDate.length === 0" class="empty-state">{{ $t('common.noResults') }}</div>
          <template v-else>
            <table>
              <thead><tr><th>{{ $t('admin.sessionName') }}</th><th>{{ $t('admin.timeStart') }}</th><th>{{ $t('admin.assignEmployees') }}</th><th>{{ $t('admin.colStatus') }}</th><th></th></tr></thead>
              <tbody>
                <tr v-for="s in pageRounds" :key="s.id">
                  <td><span class="cell-truncate" :title="s.name">{{ s.name }}</span></td>
                  <td>{{ s.timeStart }} - {{ s.timeEnd }}</td>
                  <td>
                    <span v-if="!s.employees || s.employees.length === 0" class="no-employees">—</span>
                    <span v-else class="employee-chips">
                      <span v-for="e in s.employees" :key="e.id" class="employee-chip" :class="{ booked: e.isBooked }">{{ e.name }}</span>
                    </span>
                  </td>
                  <td>
                    <span class="status-badge" :class="s.isFull ? 'status-completed' : 'status-confirmed'">
                      {{ s.isFull ? $t('admin.sessionBooked') : $t('admin.sessionAvailable') }}
                    </span>
                    <span v-if="s.tiers && s.tiers.length" class="tier-breakdown">
                      <span v-for="t in s.tiers" :key="t.id" class="capacity-count">{{ t.label }} {{ t.booked }}/{{ t.unitLimit ?? '∞' }}</span>
                    </span>
                    <div v-else-if="s.employees && s.employees.length" class="tier-breakdown-by-employee">
                      <div v-for="e in s.employees" :key="e.id" class="tier-breakdown-employee-row">
                        <span class="tier-breakdown-employee-name">{{ e.name }}</span>
                        <span v-for="t in e.tiers" :key="t.id" class="capacity-count">{{ t.label }} {{ t.booked }}/{{ t.unitLimit ?? '∞' }}</span>
                      </div>
                    </div>
                    <code v-if="s.bookingReferences && s.bookingReferences.length" class="ref">{{ s.bookingReferences.join(', ') }}</code>
                  </td>
                  <td><button class="btn btn-danger btn-sm" :disabled="s.hasBooking" @click="removeSession(s)">{{ $t('admin.delete') }}</button></td>
                </tr>
              </tbody>
            </table>
            <Pagination :page="roundsPage" :total-pages="roundsTotalPages" @update:page="roundsPage = $event" />
          </template>
        </template>
        <p v-else class="empty-state">{{ $t('admin.selectDateFirst') }}</p>
      </div>
    </div>
  </template>

  <template v-else-if="bookingType === 'stay' || bookingType === 'stay_session'">
    <div class="cal-manager">
      <div class="cal-panel card">
        <div v-if="bookingType === 'stay'" class="month-toggle">
          <template v-if="!stayMonthOpen">
            <p class="month-toggle-hint">{{ $t('admin.monthClosedHint') }}</p>
            <button class="btn btn-sm" :disabled="monthActionBusy" @click="openCurrentMonth">{{ $t('admin.openMonth') }}</button>
          </template>
          <template v-else>
            <p class="month-toggle-hint open">{{ $t('admin.monthOpenHint') }}</p>
            <button class="btn btn-secondary btn-sm" :disabled="monthActionBusy" @click="closeCurrentMonth">{{ $t('admin.closeMonth') }}</button>
          </template>
          <p v-if="monthActionError" class="error">{{ monthActionError }}</p>
        </div>
        <MonthCalendar v-model:month="currentMonth">
          <template #day="{ date, day, isPast, isToday }">
            <button
              type="button"
              class="cal-day"
              :class="{
                selected: date === selectedStayDate,
                past: isPast,
                today: isToday,
                holiday: stayDayFor(date)?.isHoliday,
                staffed:
                  bookingType === 'stay'
                    ? stayMonthOpen && !stayDayFor(date)?.isHoliday
                    : stayDayFor(date) && !stayDayFor(date).isHoliday && stayDayFor(date).employees.length > 0,
              }"
              :disabled="bookingType === 'stay' && !stayMonthOpen"
              @click="selectStayDate(date)"
            >
              <span class="cal-day-num">{{ day }}</span>
              <span v-if="stayDayFor(date)?.isHoliday" class="cal-day-dot holiday-dot"></span>
              <span v-else-if="bookingType === 'stay_session' && stayDayFor(date) && stayDayFor(date).employees.length > 0" class="cal-day-badge">
                {{ stayDayFor(date).bookedCount }}/{{ stayDayFor(date).employees.length }}
              </span>
              <span v-else-if="bookingType === 'stay' && stayMonthOpen && stayDayFor(date)" class="cal-day-badge">
                {{ stayDayFor(date).bookedCount }}/{{ stayDayFor(date).capacity }}
              </span>
            </button>
          </template>
        </MonthCalendar>
        <ul class="legend">
          <li><span class="legend-dot staffed"></span>{{ $t('admin.dayOpen') }}</li>
          <li><span class="legend-dot holiday"></span>{{ $t('admin.markHoliday') }}</li>
          <li v-if="bookingType === 'stay_session'"><span class="legend-dot unconfigured"></span>{{ $t('admin.notConfigured') }}</li>
        </ul>
      </div>

      <div class="editor-panel card">
        <template v-if="selectedStayDate">
          <h2>{{ formatDate(selectedStayDate) }}</h2>
          <p v-if="bookingType === 'stay' && stayDayFor(selectedStayDate)" class="day-meta">
            {{ $t('admin.roomsBooked') }}: {{ stayDayFor(selectedStayDate).bookedCount }} / {{ stayDayFor(selectedStayDate).capacity }}
          </p>
          <p v-else-if="bookingType === 'stay_session' && stayDayFor(selectedStayDate)" class="day-meta">
            {{ $t('admin.roomsBooked') }}: {{ stayDayFor(selectedStayDate).bookedCount }} / {{ stayDayFor(selectedStayDate).employees.length }}
          </p>

          <label class="checkbox-label holiday-toggle">
            <input type="checkbox" v-model="dayEditor.isHoliday" />
            {{ $t('admin.markHoliday') }}
          </label>

          <div v-if="bookingType === 'stay_session' && !dayEditor.isHoliday" class="employees-field">
            <div class="employees-header">
              <label class="field-label">{{ $t('admin.staffOnDuty') }}</label>
              <label class="select-all-label">
                <input type="checkbox" :checked="allDayEmployeesSelected" @change="toggleAllDayEmployees" />
                {{ $t('admin.selectAll') }}
              </label>
            </div>
            <div v-if="employees.length === 0" class="employees-empty">{{ $t('admin.noEmployeesYet') }}</div>
            <div v-else class="employees-list">
              <label v-for="e in employees" :key="e.id" class="employee-checkbox">
                <input type="checkbox" :value="e.id" v-model="dayEditor.employeeIds" />
                <img v-if="e.coverImage" class="employee-avatar" :src="e.coverImage.urlThumbnail" alt="" />
                <span v-else class="employee-avatar employee-avatar-empty">{{ e.name.charAt(0) }}</span>
                <span class="employee-name">{{ e.name }}<small v-if="e.position"> · {{ e.position }}</small></span>
              </label>
            </div>
          </div>

          <p v-if="stayError" class="error">{{ stayError }}</p>
          <div class="actions">
            <button class="btn btn-sm" :disabled="staySaving" @click="saveStayDay">{{ $t('admin.saveDay') }}</button>
            <button v-if="stayDayFor(selectedStayDate)" class="btn btn-secondary btn-sm" @click="clearStayDay">
              {{ $t('admin.clearDay') }}
            </button>
          </div>
        </template>
        <p v-else class="empty-state">{{ $t('admin.selectDayToEdit') }}</p>
      </div>
    </div>
  </template>

  <p v-else-if="bookingType" class="empty-state">{{ $t('admin.noCalendarForType') }}</p>
</template>

<style scoped>
table { margin: 0.75rem 0 1.5rem; }
input[type='checkbox'] { margin: 0; }
.ref { margin-left: 0.5rem; font-size: 0.75rem; color: var(--color-text-muted); }

.cal-manager { display: grid; grid-template-columns: 380px 1fr; gap: 1.5rem; align-items: start; }
@media (max-width: 940px) { .cal-manager { grid-template-columns: 1fr; } }
.editor-panel h2 { margin-top: 0; }

.cal-day {
  width: 100%; height: 100%; border: 1px solid transparent; border-radius: var(--radius-sm); background: var(--color-bg);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.15rem;
  cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease;
}
.cal-day:hover { border-color: var(--color-primary); }
.cal-day:disabled { cursor: not-allowed; }
.cal-day.past { opacity: 0.45; }
.month-toggle { margin-bottom: 1rem; padding: 0.75rem 0.9rem; border-radius: var(--radius-sm); background: var(--color-bg); border: 1px solid var(--color-border); }
.month-toggle-hint { font-size: 0.82rem; color: var(--color-text-muted); margin: 0 0 0.6rem; }
.month-toggle-hint.open { color: var(--color-success); font-weight: 600; }
.cal-day.today .cal-day-num { color: var(--color-primary); text-decoration: underline; }
.cal-day.selected { border-color: var(--color-primary); background: var(--color-primary-light); }
.cal-day.has-rounds { background: var(--color-primary-light); }
.cal-day.staffed { background: #ecfdf5; }
.cal-day.holiday { background: var(--color-danger-bg); }
.cal-day-num { font-size: 0.82rem; font-weight: 600; }
.cal-day-badge { font-size: 0.62rem; font-weight: 700; color: var(--color-primary); }
.cal-day-dot { width: 6px; height: 6px; border-radius: 999px; }
.cal-day-dot.holiday-dot { background: var(--color-danger); }

.legend { list-style: none; display: flex; flex-wrap: wrap; gap: 0.9rem; padding: 0; margin: 1rem 0 0; font-size: 0.75rem; color: var(--color-text-muted); }
.legend li { display: flex; align-items: center; gap: 0.35rem; }
.legend-dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.legend-dot.staffed { background: #ecfdf5; border: 1.5px solid #10b981; }
.legend-dot.holiday { background: var(--color-danger-bg); border: 1.5px solid var(--color-danger); }
.legend-dot.unconfigured { background: var(--color-bg); border: 1.5px solid var(--color-border); }

.day-meta { font-size: 0.85rem; color: var(--color-text-muted); margin: 0 0 1rem; }
.holiday-toggle { margin-bottom: 1rem; font-weight: 600; }
.actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.25rem; }

.add-round-form { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.25rem; }
.add-round-fields { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.add-round-fields label { flex: 1; min-width: 140px; margin: 0; font-size: 0.78rem; }
.add-round-fields input { margin-top: 0.3rem; max-width: none; }

.employees-field { margin-top: 1rem; }
.employees-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
.field-label { font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); }
.select-all-label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 500; color: var(--color-text); margin: 0; }
.employees-empty { font-size: 0.85rem; color: var(--color-text-muted); }
.employees-list {
  display: flex; flex-direction: column; gap: 0.25rem; max-height: 220px; overflow-y: auto;
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0.4rem;
}
.employee-checkbox {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.5rem; border-radius: 7px;
  font-weight: 500; color: var(--color-text); margin: 0; cursor: pointer; transition: background 0.12s ease;
}
.employee-checkbox:hover { background: var(--color-bg); }
.employee-checkbox input { margin: 0; }
.employee-avatar {
  width: 24px; height: 24px; border-radius: 999px; object-fit: cover; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.employee-avatar-empty { background: var(--color-primary-light); color: var(--color-primary); font-size: 0.7rem; font-weight: 700; }
.employee-name { font-size: 0.85rem; }
.employee-name small { color: var(--color-text-muted); font-weight: 400; }
.add-round-btn { margin-top: 1rem; }

.employee-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.employee-chip {
  display: inline-flex; padding: 0.15rem 0.55rem; border-radius: 999px; background: var(--color-primary-light);
  color: var(--color-primary); font-size: 0.72rem; font-weight: 600; white-space: nowrap;
}
.employee-chip.booked { background: var(--color-danger-bg); color: var(--color-danger); }
.no-employees { color: var(--color-text-faint); }
.capacity-count { margin-left: 0.4rem; font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; }
.tier-breakdown { display: inline-flex; flex-wrap: wrap; gap: 0.2rem; }
.tier-breakdown-by-employee { display: flex; flex-direction: column; gap: 0.15rem; margin-top: 0.25rem; }
.tier-breakdown-employee-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; font-size: 0.75rem; }
.tier-breakdown-employee-name { font-weight: 600; color: var(--color-text-muted); }
</style>
