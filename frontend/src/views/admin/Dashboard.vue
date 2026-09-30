<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { dashboardApi } from '../../api/dashboard';
import { settingsApi } from '../../api/settings';
import { formatCurrency } from '../../i18n';
import { usePagination } from '../../composables/usePagination';
import Pagination from '../../components/Pagination.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import BookingDetailModal from '../../components/BookingDetailModal.vue';

// Uses the viewer's local calendar date, not toISOString()'s UTC date — for a Thai (UTC+7)
// browser, toISOString() still reports "yesterday" for the first 7 hours after local
// midnight, which silently excluded same-day activity from every default/preset range.
function toLocalISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoLocalISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalISODate(d);
}

const todayLocalISO = () => toLocalISODate(new Date());

const mainTab = ref('schedule'); // 'schedule' | 'overview'

const from = ref(daysAgoLocalISO(29));
const to = ref(todayLocalISO());
const includePending = ref(false);
const summary = ref(null);
const occupancy = ref([]);
const employeeStats = ref([]);
const productStats = ref([]);
const { page: employeeStatsPage, totalPages: employeeStatsTotalPages, pageItems: pageEmployeeStats } = usePagination(employeeStats, 5);
const { page: productStatsPage, totalPages: productStatsTotalPages, pageItems: pageProductStats } = usePagination(productStats, 5);
const { page: occupancyPage, totalPages: occupancyTotalPages, pageItems: pageOccupancy } = usePagination(occupancy, 5);

async function reload() {
  const params = { from: from.value, to: to.value, includePending: includePending.value };
  const [summaryRes, occupancyRes, employeeRes, productRes] = await Promise.all([
    dashboardApi.getSummary(params),
    dashboardApi.getOccupancy(params),
    dashboardApi.getEmployeeStats(params),
    dashboardApi.getProductStats(params),
  ]);
  summary.value = summaryRes;
  occupancy.value = occupancyRes;
  employeeStats.value = employeeRes;
  productStats.value = productRes;
}

function preset(days) {
  from.value = daysAgoLocalISO(days - 1);
  to.value = todayLocalISO();
  reload();
}

function presetAllTime() {
  from.value = '2000-01-01';
  to.value = todayLocalISO();
  reload();
}

async function exportCsv() {
  const blob = await dashboardApi.exportCsv({ from: from.value, to: to.value });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookings-${from.value}-${to.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------- Day schedule: a simulated time-grid (hour rows + positioned event
// blocks), not just a flat list — closer to a real day planner while still carrying the
// live "now" line and past/live/upcoming coloring from the plain timeline it replaces.
const scheduleView = ref('timeline'); // 'timeline' | 'table'
const selectedBookingId = ref(null);

function openDetail(id) {
  selectedBookingId.value = id;
}
function closeDetail() {
  selectedBookingId.value = null;
}
function onBookingUpdated() {
  loadSchedule();
}

const scheduleDate = ref(todayLocalISO());
const scheduleEntries = ref([]);
const scheduleLoaded = ref(false);
const nowTick = ref(Date.now());
const businessHours = ref({ defaultOpenTime: '09:00', defaultCloseTime: '18:00' });
let tickTimer = null;

const timedEntries = computed(() => scheduleEntries.value.filter((e) => e.timeStart));
const allDayEntries = computed(() => scheduleEntries.value.filter((e) => !e.timeStart));
// Table sub-view: every entry for the day in one flat, sortable list — timed entries
// first (by time), all-day check-ins/check-outs after, as a plain-data fallback next to
// the visual timeline.
const tableEntries = computed(() =>
  [...timedEntries.value].sort((a, b) => a.timeStart.localeCompare(b.timeStart)).concat(allDayEntries.value),
);

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const HOUR_HEIGHT = 68;

// The grid always spans at least the business's default open/close hours, and widens to
// fit any entry that falls outside them (e.g. an evening massage after closing time) so
// nothing is ever clipped off the top or bottom.
const gridRange = computed(() => {
  let startMin = toMinutes(businessHours.value.defaultOpenTime || '09:00');
  let endMin = toMinutes(businessHours.value.defaultCloseTime || '18:00');
  for (const e of timedEntries.value) {
    startMin = Math.min(startMin, toMinutes(e.timeStart));
    endMin = Math.max(endMin, toMinutes(e.timeEnd));
  }
  startMin = Math.max(0, Math.floor(startMin / 60) * 60 - 60);
  endMin = Math.min(24 * 60, Math.ceil(endMin / 60) * 60 + 60);
  return { startMin, endMin };
});

const gridHeight = computed(() => ((gridRange.value.endMin - gridRange.value.startMin) / 60) * HOUR_HEIGHT);

const hourMarks = computed(() => {
  const { startMin, endMin } = gridRange.value;
  const marks = [];
  for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60) marks.push(m);
  return marks;
});

function minutesToTop(min) {
  return ((min - gridRange.value.startMin) / 60) * HOUR_HEIGHT;
}

// Side-by-side column layout for entries that overlap in time (e.g. two staff each
// running their own round at 10:00), classic calendar-style greedy column packing so
// concurrent bookings stay readable instead of stacking on top of each other.
const laidOutEntries = computed(() => {
  const items = timedEntries.value
    .map((entry) => ({ entry, startMin: toMinutes(entry.timeStart), endMin: toMinutes(entry.timeEnd) }))
    .sort((a, b) => a.startMin - b.startMin);
  const columnEnds = [];
  for (const item of items) {
    let col = columnEnds.findIndex((endMin) => endMin <= item.startMin);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(item.endMin);
    } else {
      columnEnds[col] = item.endMin;
    }
    item.col = col;
  }
  for (const item of items) {
    const overlapping = items.filter((o) => o.startMin < item.endMin && o.endMin > item.startMin);
    item.totalCols = Math.max(...overlapping.map((o) => o.col)) + 1;
  }
  return items;
});

const nowMinutes = computed(() => {
  void nowTick.value;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
});
const isViewingToday = computed(() => scheduleDate.value === todayLocalISO());
const showNowLine = computed(
  () => isViewingToday.value && nowMinutes.value >= gridRange.value.startMin && nowMinutes.value <= gridRange.value.endMin,
);

async function loadSchedule() {
  scheduleLoaded.value = false;
  const res = await dashboardApi.getDaySchedule(scheduleDate.value);
  scheduleEntries.value = res.entries;
  scheduleLoaded.value = true;
}

function goToToday() {
  scheduleDate.value = todayLocalISO();
  loadSchedule();
}

function timeStatusOf(entry) {
  void nowTick.value;
  if (!isViewingToday.value) return scheduleDate.value < todayLocalISO() ? 'past' : 'upcoming';
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = entry.timeStart.split(':').map(Number);
  const [eh, em] = entry.timeEnd.split(':').map(Number);
  if (mins < sh * 60 + sm) return 'upcoming';
  if (mins >= eh * 60 + em) return 'past';
  return 'live';
}

const liveClockLabel = computed(() => {
  void nowTick.value;
  return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
});

onMounted(async () => {
  reload();
  loadSchedule();
  businessHours.value = await settingsApi.getBusinessInfo();
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
    if (scheduleDate.value === todayLocalISO()) loadSchedule();
  }, 60000);
});

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<template>
  <h1 class="page-title">{{ $t('admin.dashboard') }}</h1>

  <div class="main-tabs">
    <button type="button" :class="{ active: mainTab === 'schedule' }" @click="mainTab = 'schedule'">{{ $t('admin.daySchedule') }}</button>
    <button type="button" :class="{ active: mainTab === 'overview' }" @click="mainTab = 'overview'">{{ $t('admin.overview') }}</button>
  </div>

  <template v-if="mainTab === 'schedule'">
    <div class="card day-schedule-card compact-card">
      <div class="day-schedule-header">
        <input type="date" v-model="scheduleDate" @change="loadSchedule" />
        <button class="btn-ghost btn-sm" @click="goToToday">{{ $t('admin.today') }}</button>
        <div class="spacer"></div>
        <span class="live-clock"><span class="live-dot"></span>{{ liveClockLabel }}</span>
      </div>

      <div class="sub-tabs">
        <button type="button" :class="{ active: scheduleView === 'timeline' }" @click="scheduleView = 'timeline'">{{ $t('admin.timelineView') }}</button>
        <button type="button" :class="{ active: scheduleView === 'table' }" @click="scheduleView = 'table'">{{ $t('admin.tableView') }}</button>
      </div>

      <template v-if="scheduleLoaded">
        <div v-if="allDayEntries.length > 0" class="all-day-chips">
          <span v-for="e in allDayEntries" :key="e.id" class="all-day-chip" :class="e.eventType" role="button" @click="openDetail(e.id)">
            <span class="event-icon">{{ e.eventType === 'check_in' ? '↳' : '↰' }}</span>
            <span class="chip-icon"><svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 8 1.34 8 4v2H4v-2c0-2.66 5.3-4 8-4zm0-2a4 4 0 110-8 4 4 0 010 8z"/></svg></span>
            <strong>{{ e.guestName }}</strong>
            <span class="chip-sep">·</span>
            <span class="chip-muted">{{ e.productName }}</span>
            <StatusBadge :status="e.status" />
          </span>
        </div>

        <div v-if="timedEntries.length === 0 && allDayEntries.length === 0" class="empty-state compact">{{ $t('admin.noActivity') }}</div>

        <div v-else-if="scheduleView === 'timeline' && timedEntries.length > 0" class="schedule-grid-wrap">
          <div class="schedule-grid" :style="{ height: gridHeight + 'px' }">
            <div v-for="m in hourMarks" :key="m" class="hour-row" :style="{ top: minutesToTop(m) + 'px' }">
              <span class="hour-label">{{ String(Math.floor(m / 60)).padStart(2, '0') }}:00</span>
              <span class="hour-line"></span>
            </div>

            <div v-if="showNowLine" class="now-line" :style="{ top: minutesToTop(nowMinutes) + 'px' }">
              <span class="now-time">{{ liveClockLabel }}</span>
              <span class="now-dash"></span>
            </div>

            <div
              v-for="item in laidOutEntries"
              :key="item.entry.id"
              class="grid-event"
              :class="timeStatusOf(item.entry)"
              role="button"
              :style="{
                top: minutesToTop(item.startMin) + 'px',
                height: Math.max(minutesToTop(item.endMin) - minutesToTop(item.startMin) - 3, 28) + 'px',
                left: `calc(${(item.col / item.totalCols) * 100}% + 2px)`,
                width: `calc(${100 / item.totalCols}% - 6px)`,
              }"
              @click="openDetail(item.entry.id)"
            >
              <div class="grid-event-head">
                <span class="grid-event-time">{{ item.entry.timeStart }}–{{ item.entry.timeEnd }}</span>
                <span v-if="timeStatusOf(item.entry) === 'live'" class="live-badge">{{ $t('admin.happeningNow') }}</span>
              </div>
              <div class="grid-event-title">{{ item.entry.productName }}</div>
              <div class="grid-event-sub">
                <span class="row-icon guest"><svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 8 1.34 8 4v2H4v-2c0-2.66 5.3-4 8-4zm0-2a4 4 0 110-8 4 4 0 010 8z"/></svg></span>{{ item.entry.guestName }}
              </div>
              <div v-if="item.entry.employeeName" class="grid-event-sub">
                <span class="row-icon employee">
                  <img v-if="item.entry.employeeImageUrl" :src="item.entry.employeeImageUrl" alt="" />
                  <svg v-else viewBox="0 0 24 24"><path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 00-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"/></svg>
                </span>{{ item.entry.employeeName }}
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="scheduleView === 'table' && tableEntries.length > 0" class="schedule-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ $t('booking.selectTime') }}</th>
                <th>{{ $t('admin.products') }}</th>
                <th>{{ $t('booking.name') }}</th>
                <th>{{ $t('admin.employees') }}</th>
                <th>{{ $t('admin.colStatus') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in tableEntries" :key="e.id" class="clickable-row" @click="openDetail(e.id)">
                <td class="tabular">{{ e.timeStart ? `${e.timeStart}–${e.timeEnd}` : $t('admin.checkInOut') }}</td>
                <td><span class="cell-truncate" :title="e.productName">{{ e.productName }}</span></td>
                <td>
                  <span class="row-icon guest"><svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 8 1.34 8 4v2H4v-2c0-2.66 5.3-4 8-4zm0-2a4 4 0 110-8 4 4 0 010 8z"/></svg></span>
                  <span class="cell-truncate" :title="e.guestName">{{ e.guestName }}</span>
                </td>
                <td>
                  <template v-if="e.employeeName">
                    <span class="row-icon employee">
                      <img v-if="e.employeeImageUrl" :src="e.employeeImageUrl" alt="" />
                      <svg v-else viewBox="0 0 24 24"><path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 00-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"/></svg>
                    </span>
                    <span class="cell-truncate" :title="e.employeeName">{{ e.employeeName }}</span>
                  </template>
                  <span v-else>—</span>
                </td>
                <td><StatusBadge :status="e.status" /></td>
                <td class="tabular">{{ formatCurrency(e.totalPrice) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </template>

  <template v-else>
    <div class="toolbar card compact-card">
      <label>{{ $t('admin.dateFrom') }} <input type="date" v-model="from" @change="reload" /></label>
      <label>{{ $t('admin.dateTo') }} <input type="date" v-model="to" @change="reload" /></label>
      <label class="checkbox-label"><input type="checkbox" v-model="includePending" @change="reload" /> {{ $t('status.pending') }}</label>
      <div class="spacer"></div>
      <div class="preset-group">
        <button class="btn btn-secondary btn-sm" @click="preset(7)">7d</button>
        <button class="btn btn-secondary btn-sm" @click="preset(30)">30d</button>
        <button class="btn btn-secondary btn-sm" @click="preset(365)">1y</button>
        <button class="btn btn-secondary btn-sm" @click="presetAllTime">{{ $t('admin.allTime') }}</button>
      </div>
      <button class="btn btn-sm" @click="exportCsv">{{ $t('admin.exportCsv') }}</button>
    </div>

    <template v-if="summary">
      <div class="cards">
        <div class="stat-card accent-primary">
          <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg></div>
          <div class="stat-body">
            <h3>{{ $t('admin.revenue') }}</h3>
            <p class="big">{{ formatCurrency(summary.totalRevenue) }}</p>
            <small v-if="summary.comparison.revenueChangePct !== null" :class="summary.comparison.revenueChangePct >= 0 ? 'up' : 'down'">
              {{ summary.comparison.revenueChangePct >= 0 ? '▲' : '▼' }} {{ Math.abs(summary.comparison.revenueChangePct).toFixed(1) }}%
            </small>
          </div>
        </div>
        <div class="stat-card accent-blue">
          <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg></div>
          <div class="stat-body"><h3>{{ $t('admin.totalBookings') }}</h3><p class="big">{{ summary.totalBookings }}</p></div>
        </div>
        <div class="stat-card accent-amber">
          <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.5 5H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg></div>
          <div class="stat-body"><h3>{{ $t('status.pending') }}</h3><p class="big">{{ summary.pendingCount }}</p></div>
        </div>
        <div class="stat-card accent-rose">
          <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></div>
          <div class="stat-body"><h3>{{ $t('admin.cancellationRate') }}</h3><p class="big">{{ (summary.cancellationRate * 100).toFixed(1) }}%</p></div>
        </div>
      </div>
    </template>

    <div class="two-col">
      <div>
        <h2 class="section-title">{{ $t('admin.productPerformance') }}</h2>
        <div v-if="productStats.length === 0" class="empty-state compact">{{ $t('common.noResults') }}</div>
        <template v-else>
          <div class="table-scroll">
            <table>
              <thead><tr><th>{{ $t('admin.products') }}</th><th>{{ $t('admin.filterByType') }}</th><th>{{ $t('admin.colBookings') }}</th><th>{{ $t('admin.revenue') }}</th></tr></thead>
              <tbody>
                <tr v-for="p in pageProductStats" :key="p.productId">
                  <td><span class="cell-truncate" :title="p.name">{{ p.name }}</span></td>
                  <td>{{ p.bookingType }}</td>
                  <td>{{ p.bookings }}</td>
                  <td>{{ formatCurrency(p.revenue) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Pagination :page="productStatsPage" :total-pages="productStatsTotalPages" @update:page="productStatsPage = $event" />
        </template>
      </div>

      <div>
        <h2 class="section-title">{{ $t('admin.employeePerformance') }}</h2>
        <div v-if="employeeStats.length === 0" class="empty-state compact">{{ $t('common.noResults') }}</div>
        <template v-else>
          <div class="table-scroll">
            <table>
              <thead><tr><th></th><th>{{ $t('admin.employees') }}</th><th>{{ $t('admin.colBookings') }}</th><th>{{ $t('admin.revenue') }}</th></tr></thead>
              <tbody>
                <tr v-for="e in pageEmployeeStats" :key="e.employeeId">
                  <td>
                    <img v-if="e.imageUrl" class="employee-avatar" :src="e.imageUrl" alt="" />
                    <span v-else class="employee-avatar employee-avatar-empty">{{ e.name.charAt(0) }}</span>
                  </td>
                  <td><span class="cell-truncate" :title="e.name">{{ e.name }}</span><small class="row-sub" v-if="e.position">{{ e.position }}</small></td>
                  <td>{{ e.bookings }}</td>
                  <td>{{ formatCurrency(e.revenue) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Pagination :page="employeeStatsPage" :total-pages="employeeStatsTotalPages" @update:page="employeeStatsPage = $event" />
        </template>
      </div>
    </div>

    <template v-if="occupancy.length > 0">
      <h2 class="section-title">{{ $t('admin.occupancyTitle') }}</h2>
      <div class="table-scroll">
        <table>
          <thead><tr><th>{{ $t('admin.products') }}</th><th>{{ $t('admin.filterByType') }}</th><th>{{ $t('admin.colRate') }}</th></tr></thead>
          <tbody>
            <tr v-for="o in pageOccupancy" :key="o.productId">
              <td><span class="cell-truncate" :title="o.name">{{ o.name }}</span></td>
              <td>{{ o.bookingType }}</td>
              <td>{{ (o.rate * 100).toFixed(0) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination :page="occupancyPage" :total-pages="occupancyTotalPages" @update:page="occupancyPage = $event" />
    </template>
  </template>

  <BookingDetailModal v-if="selectedBookingId" :booking-id="selectedBookingId" @close="closeDetail" @updated="onBookingUpdated" />
</template>

<style scoped>
.page-title { margin-bottom: 1rem; }
.compact-card { padding: 0.9rem 1.1rem; }
.section-title { font-size: 0.95rem; margin: 1.5rem 0 0.6rem; font-weight: 700; }
.spacer { flex: 1; }

/* Top-level tabs */
.main-tabs { display: flex; gap: 0.4rem; border-bottom: 1px solid var(--color-border); margin-bottom: 1.1rem; }
.main-tabs button {
  padding: 0.55rem 0.2rem; margin-right: 1.25rem; background: none; border: none; border-bottom: 2px solid transparent;
  font-size: 0.92rem; font-weight: 700; color: var(--color-text-muted); cursor: pointer; transition: color 0.15s ease, border-color 0.15s ease;
}
.main-tabs button.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }

/* Toolbar */
.toolbar { display: flex; gap: 0.9rem; align-items: center; flex-wrap: wrap; margin-bottom: 1.25rem; }
.toolbar label { display: flex; flex-direction: row; align-items: center; gap: 0.4rem; font-size: 0.78rem; margin: 0; white-space: nowrap; }
.toolbar input[type='date'] { margin: 0; width: auto; padding: 0.4rem 0.6rem; font-size: 0.82rem; }
.checkbox-label { gap: 0.35rem !important; }
.preset-group { display: flex; gap: 0.35rem; }

/* Stat cards */
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
.stat-card {
  display: flex; align-items: center; gap: 0.75rem; background: var(--color-surface);
  padding: 0.85rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm); border-left: 3px solid var(--stat-accent, var(--color-primary));
}
.stat-icon {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; background: var(--stat-accent-bg, var(--color-primary-light));
}
.stat-icon svg { width: 19px; height: 19px; fill: var(--stat-accent, var(--color-primary)); }
.stat-card.accent-primary { --stat-accent: var(--color-primary); --stat-accent-bg: var(--color-primary-light); }
.stat-card.accent-blue { --stat-accent: #2563eb; --stat-accent-bg: #eff6ff; }
.stat-card.accent-amber { --stat-accent: var(--color-warning); --stat-accent-bg: var(--color-warning-bg); }
.stat-card.accent-rose { --stat-accent: var(--color-danger); --stat-accent-bg: var(--color-danger-bg); }
.stat-body { min-width: 0; }
.stat-card h3 { color: var(--color-text-muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 700; margin: 0; }
.stat-card .big { font-size: 1.35rem; font-weight: 800; margin: 0.1rem 0 0; color: var(--color-text); line-height: 1.2; }
.stat-card small { font-size: 0.72rem; }
.up { color: var(--color-success); font-weight: 700; } .down { color: var(--color-danger); font-weight: 700; }

/* Tables */
table { margin-bottom: 1.25rem; }
thead th { padding: 0.55rem 0.85rem; font-size: 0.66rem; }
tbody td { padding: 0.55rem 0.85rem; font-size: 0.84rem; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.5rem; align-items: start; }
.two-col > div { min-width: 0; }
@media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }
.row-sub { display: block; color: var(--color-text-muted); font-weight: 400; font-size: 0.7rem; }
.employee-avatar {
  width: 26px; height: 26px; border-radius: 999px; object-fit: cover; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.employee-avatar-empty { background: var(--color-primary-light); color: var(--color-primary); font-size: 0.7rem; font-weight: 700; }
.empty-state.compact { padding: 1.1rem 1rem; font-size: 0.85rem; }

/* Day schedule header */
.day-schedule-card { margin-bottom: 1.25rem; }
.day-schedule-header { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.85rem; }
.day-schedule-header input[type='date'] { margin: 0; width: auto; padding: 0.35rem 0.55rem; font-size: 0.82rem; }
.live-clock {
  display: inline-flex; align-items: center; gap: 0.4rem; font-variant-numeric: tabular-nums;
  font-weight: 700; font-size: 0.82rem; color: var(--color-text); background: var(--color-bg);
  padding: 0.3rem 0.65rem; border-radius: 999px; border: 1px solid var(--color-border);
}
.live-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--color-success); animation: pulse 1.6s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

.sub-tabs { display: flex; gap: 0.4rem; margin-bottom: 0.9rem; }
.sub-tabs button {
  padding: 0.32rem 0.85rem; border-radius: 999px; border: 1px solid var(--color-border); background: var(--color-surface);
  font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); cursor: pointer; transition: all 0.15s ease;
}
.sub-tabs button.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.sub-tabs button:not(.active):hover { border-color: var(--color-primary); color: var(--color-primary); }

.all-day-chips { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 0.85rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--color-border); }
.all-day-chip {
  display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.65rem 0.3rem 0.4rem;
  background: var(--color-bg); border-radius: 999px; font-size: 0.78rem; cursor: pointer; transition: background 0.15s ease;
}
.all-day-chip:hover { background: var(--color-primary-light); }
.all-day-chip .event-icon {
  width: 18px; height: 18px; border-radius: 999px; font-size: 0.7rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-primary-light); color: var(--color-primary);
}
.all-day-chip.check_out .event-icon { background: var(--color-danger-bg); color: var(--color-danger); }
.chip-icon { width: 14px; height: 14px; flex-shrink: 0; display: flex; }
.chip-icon svg { fill: var(--color-text-faint); }
.chip-sep { color: var(--color-text-faint); }
.chip-muted { color: var(--color-text-muted); }

/* Guest/employee icons — reused in the grid blocks and the table view so it's always
   visually obvious which name is the customer and which is staff. */
.row-icon { display: inline-flex; width: 12px; height: 12px; margin-right: 0.3rem; vertical-align: -1px; flex-shrink: 0; }
.row-icon svg { width: 100%; height: 100%; }
.row-icon img { width: 100%; height: 100%; border-radius: 999px; object-fit: cover; display: block; }
.row-icon.guest svg { fill: var(--color-primary); }
.row-icon.employee svg { fill: var(--color-warning); }

/* Time-grid schedule */
.schedule-grid-wrap { max-height: 620px; overflow-y: auto; }
.schedule-grid {
  position: relative; margin-left: 60px; border-left: 1px solid var(--color-border);
  background-image: repeating-linear-gradient(to bottom, var(--color-bg) 0, var(--color-bg) 68px, transparent 68px, transparent 136px);
}
.hour-row { position: absolute; left: -60px; right: 0; height: 0; }
.hour-label {
  position: absolute; left: 0; top: -0.55rem; width: 50px; text-align: right; padding-right: 0.6rem;
  font-size: 0.7rem; font-weight: 700; color: var(--color-text-faint); font-variant-numeric: tabular-nums;
}
.hour-line { position: absolute; left: 60px; right: 0; top: 0; height: 1px; background: var(--color-border); }

.now-line { position: absolute; left: 0; right: 0; z-index: 3; display: flex; align-items: center; }
.now-time {
  position: absolute; left: -60px; width: 50px; text-align: right; padding-right: 0.6rem; transform: translateY(-50%);
  font-size: 0.7rem; font-weight: 800; color: var(--color-danger); font-variant-numeric: tabular-nums;
}
.now-dash { position: absolute; left: 0; right: 0; height: 2px; background: var(--color-danger); transform: translateY(-1px); }
.now-dash::before { content: ''; position: absolute; left: -3px; top: -3px; width: 8px; height: 8px; border-radius: 999px; background: var(--color-danger); }

.grid-event {
  position: absolute; z-index: 2; overflow: hidden; border-radius: 8px; padding: 0.3rem 0.55rem;
  background: var(--color-primary-light); border-left: 3px solid var(--color-primary); cursor: pointer;
  box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 0.05rem; transition: box-shadow 0.15s ease, z-index 0s;
}
.grid-event:hover { box-shadow: var(--shadow-md); z-index: 4; }
.grid-event.live { background: #ecfdf5; border-left-color: var(--color-success); }
.grid-event.past { background: var(--color-bg); border-left-color: var(--color-text-faint); opacity: 0.6; }
.grid-event-head { display: flex; align-items: center; gap: 0.35rem; }
.grid-event-time { font-size: 0.68rem; font-weight: 800; color: var(--color-text); font-variant-numeric: tabular-nums; }
/* Plain wrapping + a height-clipped parent instead of text-overflow:ellipsis — Chromium's
   ellipsis truncation can split a Thai vowel/tone mark from its base consonant mid-shape,
   leaving orphaned combining marks; normal line-wrapping doesn't hit that path. */
.grid-event-title { font-size: 0.78rem; font-weight: 700; color: var(--color-text); line-height: 1.25; }
.grid-event-sub { font-size: 0.7rem; color: var(--color-text-muted); line-height: 1.25; display: flex; align-items: center; }
.live-badge {
  font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
  color: var(--color-success); background: #d1fae5; padding: 0.08rem 0.4rem; border-radius: 999px; flex-shrink: 0;
}

/* Table sub-view */
.schedule-table-wrap { max-height: 620px; overflow-y: auto; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: var(--radius-md); }
.table-scroll table { min-width: 480px; }
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: var(--color-primary-light); }
.tabular { font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
