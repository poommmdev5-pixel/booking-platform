<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { employeeSelfApi } from '../../api/employeeSelf';
import { formatDate } from '../../i18n';
import StatusBadge from '../../components/StatusBadge.vue';

const { t } = useI18n();

function toLocalISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const selectedDate = ref(toLocalISODate(new Date()));
const items = ref([]);
const loading = ref(true);

const isToday = computed(() => selectedDate.value === toLocalISODate(new Date()));

const dateLabel = computed(() => formatDate(selectedDate.value, 'full'));

async function load() {
  loading.value = true;
  try {
    const res = await employeeSelfApi.getSchedule(selectedDate.value);
    items.value = res.items;
  } finally {
    loading.value = false;
  }
}

function shiftDay(delta) {
  const d = new Date(`${selectedDate.value}T00:00:00`);
  d.setDate(d.getDate() + delta);
  selectedDate.value = toLocalISODate(d);
}

function goToday() {
  selectedDate.value = toLocalISODate(new Date());
}

function timeLabel(item) {
  if (item.allDay) return t('employee.allDay');
  return `${item.timeStart}${item.timeEnd ? ' - ' + item.timeEnd : ''}`;
}

watch(selectedDate, load);
onMounted(load);
</script>

<template>
  <div class="schedule-page">
    <div class="page-head">
      <h1>{{ $t('employee.scheduleTitle') }}</h1>
      <p class="page-sub">{{ $t('employee.scheduleSub') }}</p>
    </div>

    <div class="date-nav card">
      <button type="button" class="date-arrow" @click="shiftDay(-1)" :aria-label="$t('employee.prevDay')">
        <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <div class="date-center">
        <p class="date-label">{{ dateLabel }}</p>
        <button v-if="!isToday" type="button" class="today-btn" @click="goToday">{{ $t('employee.jumpToday') }}</button>
      </div>
      <button type="button" class="date-arrow" @click="shiftDay(1)" :aria-label="$t('employee.nextDay')">
        <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
      </button>
    </div>

    <div v-if="loading" class="empty-state">{{ $t('common.loading') }}</div>
    <div v-else-if="items.length === 0" class="empty-state">{{ $t('employee.noBookings') }}</div>
    <ol v-else class="stepper">
      <li v-for="item in items" :key="item.id" class="step">
        <div class="step-marker">
          <span class="step-dot" :class="`dot-${item.status}`"></span>
          <span class="step-line"></span>
        </div>
        <div class="step-body card">
          <div class="step-top">
            <span class="step-time">{{ timeLabel(item) }}</span>
            <StatusBadge :status="item.status" />
          </div>
          <p class="step-product">{{ item.productName }}</p>
          <p class="step-guest">{{ item.guestName }} · {{ $t('employee.guestsCount', { count: item.guests }) }}</p>
          <p class="step-ref">#{{ item.reference }}</p>
          <p v-if="item.note" class="step-note">{{ item.note }}</p>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.page-head { margin-bottom: 1.25rem; }
.page-head h1 { margin: 0 0 0.25rem; }
.page-sub { margin: 0; font-size: 0.86rem; color: var(--color-text-muted); }

.date-nav { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.9rem 1rem; margin-bottom: 1.5rem; }
.date-arrow {
  flex-shrink: 0; width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--color-border);
  background: var(--color-surface); display: flex; align-items: center; justify-content: center; transition: background 0.12s ease;
}
.date-arrow:hover { background: var(--color-primary-light); }
.date-arrow svg { width: 18px; height: 18px; fill: var(--color-text-muted); }
.date-center { text-align: center; min-width: 0; }
.date-label { margin: 0; font-weight: 700; font-size: 0.95rem; }
.today-btn { margin-top: 0.2rem; background: none; border: none; color: var(--color-primary); font-weight: 600; font-size: 0.78rem; padding: 0; }

.stepper { list-style: none; margin: 0; padding: 0; }
.step { display: flex; gap: 0.9rem; }
.step-marker { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: 14px; }
.step-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--color-primary); flex-shrink: 0; margin-top: 1.1rem; }
.dot-pending { background: var(--color-warning); }
.dot-confirmed { background: var(--color-primary); }
.dot-completed { background: var(--color-success); }
.step-line { flex: 1; width: 2px; background: var(--color-border); margin-top: 4px; }
.step:last-child .step-line { display: none; }
.step-body { flex: 1; min-width: 0; margin-bottom: 1rem; }
.step-top { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; margin-bottom: 0.5rem; }
.step-time { font-weight: 700; font-size: 0.88rem; color: var(--color-text); }
.step-product { margin: 0 0 0.2rem; font-weight: 700; font-size: 1rem; }
.step-guest { margin: 0 0 0.2rem; font-size: 0.86rem; color: var(--color-text-muted); }
.step-ref { margin: 0; font-size: 0.76rem; color: var(--color-text-faint); }
.step-note { margin: 0.5rem 0 0; font-size: 0.83rem; color: var(--color-text-muted); background: var(--color-bg); border-radius: var(--radius-sm); padding: 0.55rem 0.7rem; }
</style>
