<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { employeesApi } from '../../api/employees';
import { dashboardApi } from '../../api/dashboard';
import { formatCurrency, formatDate } from '../../i18n';
import { usePagination } from '../../composables/usePagination';
import Pagination from '../../components/Pagination.vue';
import StatusBadge from '../../components/StatusBadge.vue';

const { t } = useI18n();

const employees = ref([]);
const overview = ref(null);
const mainTab = ref('overview'); // 'overview' | 'all'
const positionTab = ref('all'); // 'all' or a position name
const statusFilter = ref('all');
const positionFilter = ref('all');

const positions = computed(() => [...new Set(employees.value.map((e) => e.position || 'Unassigned'))]);
const filteredEmployees = computed(() =>
  employees.value.filter(
    (e) =>
      (statusFilter.value === 'all' || e.status === statusFilter.value) &&
      (positionFilter.value === 'all' || (e.position || 'Unassigned') === positionFilter.value),
  ),
);
const { page, totalPages, pageItems: pageEmployees } = usePagination(filteredEmployees, 5);

const activePosition = computed(() => overview.value?.positions.find((p) => p.position === positionTab.value) || null);

async function load() {
  employees.value = await employeesApi.listAdmin();
}

async function loadOverview() {
  overview.value = await dashboardApi.getEmployeesOverview();
}

async function toggleStatus(e) {
  await employeesApi.setStatus(e.id, e.status === 'active' ? 'inactive' : 'active');
  await load();
  await loadOverview();
}

async function remove(e) {
  if (!confirm(t('admin.confirmDeleteEmployee', { name: e.name }))) return;
  await employeesApi.remove(e.id);
  await load();
  await loadOverview();
}

onMounted(() => {
  load();
  loadOverview();
});
</script>

<template>
  <div class="header">
    <h1>{{ $t('admin.employees') }}</h1>
    <router-link :to="{ name: 'admin-employee-new' }" class="btn">+ {{ $t('admin.addEmployee') }}</router-link>
  </div>

  <template v-if="overview">
    <div class="cards">
      <div class="stat-card accent-primary">
        <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div>
        <div class="stat-body"><h3>{{ $t('admin.employees') }}</h3><p class="big">{{ overview.totals.employeeCount }}</p></div>
      </div>
      <div class="stat-card accent-blue">
        <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>
        <div class="stat-body"><h3>{{ $t('admin.activeCount') }}</h3><p class="big">{{ overview.totals.activeCount }}</p></div>
      </div>
      <div class="stat-card accent-amber">
        <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg></div>
        <div class="stat-body"><h3>{{ $t('admin.totalBookings') }}</h3><p class="big">{{ overview.totals.totalBookings }}</p></div>
      </div>
      <div class="stat-card accent-rose">
        <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg></div>
        <div class="stat-body"><h3>{{ $t('admin.revenue') }}</h3><p class="big">{{ formatCurrency(overview.totals.totalRevenue) }}</p></div>
      </div>
    </div>

    <div class="main-tabs">
      <button type="button" :class="{ active: mainTab === 'overview' }" @click="mainTab = 'overview'">{{ $t('admin.overview') }}</button>
      <button type="button" :class="{ active: mainTab === 'all' }" @click="mainTab = 'all'">{{ $t('admin.allItems') }}</button>
    </div>

    <template v-if="mainTab === 'overview'">
      <div class="pill-tabs">
        <button type="button" :class="{ active: positionTab === 'all' }" @click="positionTab = 'all'">{{ $t('common.all') }}</button>
        <button
          v-for="grp in overview.positions"
          :key="grp.position"
          type="button"
          :class="{ active: positionTab === grp.position }"
          @click="positionTab = grp.position"
        >
          {{ grp.position === 'Unassigned' ? $t('admin.unassignedPosition') : grp.position }}
        </button>
      </div>

      <div class="two-col">
        <div class="category-panel">
          <template v-if="positionTab === 'all'">
            <div v-for="grp in overview.positions" :key="grp.position" class="category-section">
              <div class="category-header">
                <h3>{{ grp.position === 'Unassigned' ? $t('admin.unassignedPosition') : grp.position }}</h3>
                <span class="category-meta">{{ grp.employees.length }} · {{ formatCurrency(grp.totalRevenue) }}</span>
              </div>
              <div class="mini-product-list">
                <div v-for="e in grp.employees" :key="e.id" class="mini-product-row">
                  <img v-if="e.imageUrl" class="mini-avatar" :src="e.imageUrl" alt="" />
                  <span v-else class="mini-avatar mini-avatar-empty">{{ e.name.charAt(0) }}</span>
                  <span class="mini-product-dot" :class="{ inactive: e.status !== 'active' }"></span>
                  <span class="mini-product-name">{{ e.name }}</span>
                  <span class="mini-product-stat">{{ e.bookings }} {{ $t('admin.totalBookings') }}</span>
                  <span class="mini-product-revenue">{{ formatCurrency(e.revenue) }}</span>
                </div>
              </div>
            </div>
          </template>
          <template v-else-if="activePosition">
            <div class="category-section no-border">
              <div class="category-header">
                <h3>{{ activePosition.position === 'Unassigned' ? $t('admin.unassignedPosition') : activePosition.position }}</h3>
                <span class="category-meta">{{ activePosition.employees.length }} · {{ formatCurrency(activePosition.totalRevenue) }}</span>
              </div>
              <div class="mini-product-list">
                <div v-for="e in activePosition.employees" :key="e.id" class="mini-product-row">
                  <img v-if="e.imageUrl" class="mini-avatar" :src="e.imageUrl" alt="" />
                  <span v-else class="mini-avatar mini-avatar-empty">{{ e.name.charAt(0) }}</span>
                  <span class="mini-product-dot" :class="{ inactive: e.status !== 'active' }"></span>
                  <span class="mini-product-name">{{ e.name }}</span>
                  <span class="mini-product-stat">{{ e.bookings }} {{ $t('admin.totalBookings') }}</span>
                  <span class="mini-product-revenue">{{ formatCurrency(e.revenue) }}</span>
                </div>
              </div>
            </div>
          </template>
          <p v-if="overview.positions.length === 0" class="empty-state">{{ $t('admin.noEmployeesYet') }}</p>
        </div>

        <div class="activity-panel">
          <h3 class="panel-title">{{ $t('admin.recentActivity') }}</h3>
          <p v-if="overview.recentBookings.length === 0" class="empty-state">{{ $t('admin.noRecentActivity') }}</p>
          <div v-else class="activity-list">
            <div v-for="b in overview.recentBookings" :key="b.reference" class="activity-row">
              <div class="activity-main">
                <span class="activity-product">{{ b.employeeName }}</span>
                <span class="activity-guest">{{ b.guestName }} · {{ formatDate(b.dateStart) }}</span>
              </div>
              <div class="activity-end">
                <StatusBadge :status="b.status" />
                <span class="activity-price">{{ formatCurrency(b.totalPrice) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="filters-row">
        <label>{{ $t('admin.filterByPosition') }}
          <select v-model="positionFilter">
            <option value="all">{{ $t('common.all') }}</option>
            <option v-for="p in positions" :key="p" :value="p">{{ p === 'Unassigned' ? $t('admin.unassignedPosition') : p }}</option>
          </select>
        </label>
        <label>{{ $t('admin.filterByStatus') }}
          <select v-model="statusFilter">
            <option value="all">{{ $t('common.all') }}</option>
            <option value="active">{{ $t('admin.active') }}</option>
            <option value="inactive">{{ $t('admin.inactive') }}</option>
          </select>
        </label>
      </div>

      <div v-if="filteredEmployees.length === 0" class="empty-state">{{ $t('common.noResults') }}</div>
      <div v-else class="item-cards">
        <div v-for="e in pageEmployees" :key="e.id" class="item-card">
          <img v-if="e.coverImage" class="item-thumb round" :src="e.coverImage.urlThumbnail" alt="" />
          <div v-else class="item-thumb item-thumb-empty round">
            <svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 8 1.34 8 4v2H4v-2c0-2.66 5.3-4 8-4zm0-2a4 4 0 110-8 4 4 0 010 8z"/></svg>
          </div>
          <div class="item-info">
            <div class="item-info-top">
              <span class="item-name">{{ e.name }}</span>
              <span v-if="e.position" class="type-tag type-session">{{ e.position }}</span>
            </div>
            <div class="item-info-bottom">
              <span>{{ e.phone || '—' }}</span>
            </div>
          </div>
          <span class="status-badge" :class="e.status === 'active' ? 'status-completed' : 'status-no_show'" role="button" @click="toggleStatus(e)">
            {{ $t(e.status === 'active' ? 'admin.active' : 'admin.inactive') }}
          </span>
          <div class="row-actions">
            <router-link class="btn-ghost btn-sm" :to="{ name: 'admin-employee-edit', params: { id: e.id } }">{{ $t('admin.editEmployee') }}</router-link>
            <button class="btn btn-danger btn-sm" @click="remove(e)">{{ $t('admin.delete') }}</button>
          </div>
        </div>
      </div>
      <Pagination :page="page" :total-pages="totalPages" @update:page="page = $event" />
    </template>
  </template>
</template>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.header h1 { margin: 0; }
.status-badge { cursor: pointer; }
.row-actions { display: flex; align-items: center; gap: 0.3rem; white-space: nowrap; }
.row-actions .btn-ghost { display: inline-flex; padding: 0.35rem 0.6rem; font-size: 0.8rem; font-weight: 600; border-radius: 7px; }
.row-actions .btn-ghost:hover { background: var(--color-primary-light); }

/* Stat cards */
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem; }
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

/* Tabs */
.main-tabs { display: flex; gap: 0.4rem; border-bottom: 1px solid var(--color-border); margin-bottom: 1rem; }
.main-tabs button {
  padding: 0.55rem 0.2rem; margin-right: 1.25rem; background: none; border: none; border-bottom: 2px solid transparent;
  font-size: 0.88rem; font-weight: 700; color: var(--color-text-muted); cursor: pointer; transition: color 0.15s ease, border-color 0.15s ease;
}
.main-tabs button.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
.pill-tabs { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 1rem; }
.pill-tabs button {
  padding: 0.35rem 0.9rem; border-radius: 999px; border: 1px solid var(--color-border); background: var(--color-surface);
  font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); cursor: pointer; transition: all 0.15s ease;
}
.pill-tabs button.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.pill-tabs button:not(.active):hover { border-color: var(--color-primary); color: var(--color-primary); }

.two-col { display: grid; grid-template-columns: 1.3fr 1fr; gap: 1rem; margin-bottom: 2rem; align-items: start; }
@media (max-width: 860px) { .two-col { grid-template-columns: 1fr; } }

.category-panel, .activity-panel {
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm); padding: 1rem 1.15rem;
}
.category-section + .category-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--color-border); }
.category-section.no-border { margin-top: 0; padding-top: 0; border-top: none; }
.category-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 0.5rem; }
.category-header h3 { margin: 0; font-size: 0.92rem; font-weight: 700; }
.category-meta { font-size: 0.76rem; color: var(--color-text-muted); font-weight: 600; }
.mini-product-list { display: flex; flex-direction: column; gap: 0.4rem; }
.mini-product-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; }
.mini-avatar { width: 20px; height: 20px; border-radius: 999px; object-fit: cover; flex-shrink: 0; }
.mini-avatar-empty {
  display: flex; align-items: center; justify-content: center; background: var(--color-primary-light);
  color: var(--color-primary); font-weight: 700; font-size: 0.65rem;
}
.mini-product-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--color-success); flex-shrink: 0; }
.mini-product-dot.inactive { background: var(--color-text-faint); }
.mini-product-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-product-stat { color: var(--color-text-muted); font-size: 0.76rem; white-space: nowrap; }
.mini-product-revenue { font-weight: 700; color: var(--color-primary); white-space: nowrap; min-width: 70px; text-align: right; }

.panel-title { margin: 0 0 0.75rem; font-size: 0.92rem; font-weight: 700; }
.activity-list { display: flex; flex-direction: column; gap: 0.55rem; }
.activity-row {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: 0.55rem 0.7rem; background: var(--color-bg); border-radius: var(--radius-sm);
}
.activity-main { min-width: 0; display: flex; flex-direction: column; }
.activity-product { font-weight: 600; font-size: 0.82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.activity-guest { font-size: 0.72rem; color: var(--color-text-muted); }
.activity-end { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; flex-shrink: 0; }
.activity-price { font-size: 0.76rem; font-weight: 700; color: var(--color-primary); }

/* Filters + item cards (All Items tab) */
.filters-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.filters-row label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); }
.filters-row select { margin: 0; padding: 0.4rem 0.6rem; font-size: 0.84rem; }

.item-cards { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1rem; }
.item-card {
  display: flex; align-items: center; gap: 0.85rem; background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: 0.65rem 0.9rem; box-shadow: var(--shadow-sm); transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.item-card:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); }
.item-thumb { width: 52px; height: 52px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; background: #f1f5f9; }
.item-thumb.round { border-radius: 999px; }
.item-thumb-empty { display: flex; align-items: center; justify-content: center; }
.item-thumb-empty svg { width: 22px; height: 22px; fill: var(--color-text-faint); }
.item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.item-info-top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; row-gap: 0.15rem; }
.item-name { font-weight: 700; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-info-bottom { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--color-text-muted); }
.type-tag { font-size: 0.65rem; font-weight: 700; padding: 0.12rem 0.5rem; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.02em; flex-shrink: 0; }
.type-session { background: var(--color-primary-light); color: var(--color-primary); }

@media (max-width: 480px) {
  .item-card { flex-wrap: wrap; row-gap: 0.6rem; }
  .row-actions { width: 100%; justify-content: flex-end; flex-wrap: wrap; }
}
</style>
