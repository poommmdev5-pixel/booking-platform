<script setup>
import { computed } from 'vue';
import { formatMonthYear } from '../i18n';

const props = defineProps({
  month: { type: String, required: true }, // 'YYYY-MM'
  disablePastNav: { type: Boolean, default: true },
});
const emit = defineEmits(['update:month']);

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Uses the viewer's local calendar date, not toISOString()'s UTC date — otherwise
// "today"/"the current month" lags a full day behind for the first 7 hours of every
// local day in timezones ahead of UTC (e.g. Thailand, UTC+7), letting a customer pick
// an already-past date as if it were still bookable.
function toLocalISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const monthLabel = computed(() => formatMonthYear(props.month));

const currentMonthStr = computed(() => toLocalISODate(new Date()).slice(0, 7));
const isAtEarliestMonth = computed(() => props.disablePastNav && props.month <= currentMonthStr.value);

const cells = computed(() => {
  const [y, m] = props.month.split('-').map(Number);
  const firstDay = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leadingBlanks = firstDay.getUTCDay();
  const today = toLocalISODate(new Date());

  const list = [];
  for (let i = 0; i < leadingBlanks; i += 1) list.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${props.month}-${String(day).padStart(2, '0')}`;
    list.push({ date, day, isToday: date === today, isPast: date < today });
  }
  return list;
});

function shiftMonth(delta) {
  const [y, m] = props.month.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1 + delta, 1));
  emit('update:month', `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`);
}
</script>

<template>
  <div class="month-calendar">
    <div class="calendar-nav">
      <button type="button" class="nav-btn" :disabled="isAtEarliestMonth" @click="shiftMonth(-1)" :aria-label="$t('common.previousMonth')">‹</button>
      <span class="month-label">{{ monthLabel }}</span>
      <button type="button" class="nav-btn" @click="shiftMonth(1)" :aria-label="$t('common.nextMonth')">›</button>
    </div>
    <div class="calendar-grid">
      <span v-for="wd in WEEKDAYS" :key="wd" class="weekday-label">{{ $t('calendar.weekday.' + wd) }}</span>
      <div v-for="(cell, index) in cells" :key="cell ? cell.date : 'blank-' + index" class="day-slot">
        <slot v-if="cell" name="day" v-bind="cell" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.month-calendar { width: 100%; }
.calendar-nav { display: flex; align-items: center; justify-content: center; gap: 1.25rem; margin-bottom: 1rem; }
.nav-btn {
  width: 34px; height: 34px; border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); font-size: 1.1rem; font-weight: 600; line-height: 1; color: var(--color-text);
  display: flex; align-items: center; justify-content: center; transition: border-color 0.15s ease, background 0.15s ease;
}
.nav-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-light); }
.nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.month-label { font-weight: 700; font-size: 1rem; min-width: 0; text-align: center; }
@media (min-width: 380px) { .month-label { min-width: 10rem; } }
.calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.35rem; }
.weekday-label { text-align: center; font-size: 0.72rem; font-weight: 700; color: var(--color-text-muted); padding-bottom: 0.35rem; text-transform: uppercase; }
/* aspect-ratio alone (no min-height floor) lets cells shrink to fit any viewport without
   forcing horizontal overflow on narrow phones — minmax(0, 1fr) above is the other half
   of that fix, since a plain 1fr track still respects content's intrinsic min-width. */
.day-slot { aspect-ratio: 1; min-height: 0; }
@media (min-width: 420px) { .day-slot { min-height: 40px; } }
</style>
