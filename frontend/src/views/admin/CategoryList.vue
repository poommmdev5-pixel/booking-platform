<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { categoriesApi } from '../../api/categories';
import { productsApi } from '../../api/products';
import { usePagination } from '../../composables/usePagination';
import Pagination from '../../components/Pagination.vue';

const { t } = useI18n();
const BOOKING_TYPE_KEY = { stay: 'admin.typeStay', session: 'admin.typeSession', stay_session: 'admin.typeStaySession' };
function bookingTypeLabel(type) {
  return t(BOOKING_TYPE_KEY[type] || type);
}

const categories = ref([]);
const products = ref([]);
const mainTab = ref('overview'); // 'overview' | 'all'
const typeTab = ref('all'); // 'all' | 'stay' | 'session' | 'stay_session'
const typeFilter = ref('all');
const error = ref('');

const productCountByCategory = computed(() => {
  const map = new Map();
  for (const p of products.value) map.set(p.categoryId, (map.get(p.categoryId) || 0) + 1);
  return map;
});

const categoriesWithCounts = computed(() =>
  categories.value.map((c) => ({ ...c, productCount: productCountByCategory.value.get(c.id) || 0 })),
);

const totals = computed(() => ({
  total: categories.value.length,
  stay: categories.value.filter((c) => c.bookingType === 'stay').length,
  session: categories.value.filter((c) => c.bookingType === 'session').length,
  stay_session: categories.value.filter((c) => c.bookingType === 'stay_session').length,
}));

const typeGroups = computed(() => {
  const groups = { stay: [], session: [], stay_session: [] };
  for (const c of categoriesWithCounts.value) {
    if (groups[c.bookingType]) groups[c.bookingType].push(c);
  }
  return groups;
});

const filteredCategories = computed(() =>
  categoriesWithCounts.value.filter((c) => typeFilter.value === 'all' || c.bookingType === typeFilter.value),
);
const { page, totalPages, pageItems: pageCategories } = usePagination(filteredCategories, 5);

async function load() {
  categories.value = await categoriesApi.list();
}

async function loadProducts() {
  products.value = await productsApi.listAdmin();
}

async function remove(category) {
  if (!confirm(t('admin.confirmDeleteCategory', { name: category.name }))) return;
  error.value = '';
  try {
    await categoriesApi.remove(category.id);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(() => {
  load();
  loadProducts();
});
</script>

<template>
  <div class="header">
    <h1>{{ $t('admin.categories') }}</h1>
    <router-link :to="{ name: 'admin-category-new' }" class="btn">+ {{ $t('admin.addCategory') }}</router-link>
  </div>

  <p v-if="error" class="error">{{ error }}</p>

  <div class="cards">
    <div class="stat-card accent-primary">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg></div>
      <div class="stat-body"><h3>{{ $t('admin.totalCategories') }}</h3><p class="big">{{ totals.total }}</p></div>
    </div>
    <div class="stat-card accent-blue">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg></div>
      <div class="stat-body"><h3>{{ $t('admin.typeStay') }}</h3><p class="big">{{ totals.stay }}</p></div>
    </div>
    <div class="stat-card accent-amber">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.5 5H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg></div>
      <div class="stat-body"><h3>{{ $t('admin.typeSession') }}</h3><p class="big">{{ totals.session }}</p></div>
    </div>
    <div class="stat-card accent-rose">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 00-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"/></svg></div>
      <div class="stat-body"><h3>{{ $t('admin.typeStaySession') }}</h3><p class="big">{{ totals.stay_session }}</p></div>
    </div>
  </div>

  <div class="main-tabs">
    <button type="button" :class="{ active: mainTab === 'overview' }" @click="mainTab = 'overview'">{{ $t('admin.overview') }}</button>
    <button type="button" :class="{ active: mainTab === 'all' }" @click="mainTab = 'all'">{{ $t('admin.allItems') }}</button>
  </div>

  <template v-if="mainTab === 'overview'">
    <div class="pill-tabs">
      <button type="button" :class="{ active: typeTab === 'all' }" @click="typeTab = 'all'">{{ $t('common.all') }}</button>
      <button type="button" :class="{ active: typeTab === 'stay' }" @click="typeTab = 'stay'">{{ $t('admin.typeStay') }}</button>
      <button type="button" :class="{ active: typeTab === 'session' }" @click="typeTab = 'session'">{{ $t('admin.typeSession') }}</button>
      <button type="button" :class="{ active: typeTab === 'stay_session' }" @click="typeTab = 'stay_session'">{{ $t('admin.typeStaySession') }}</button>
    </div>

    <div class="category-panel">
      <template v-if="typeTab === 'all'">
        <div v-for="(items, type) in typeGroups" :key="type" class="type-section">
          <div class="type-header">
            <h3>{{ bookingTypeLabel(type) }}</h3>
            <span class="type-meta">{{ items.length }}</span>
          </div>
          <div class="mini-list">
            <div v-for="c in items" :key="c.id" class="mini-row">
              <code class="mini-code">{{ c.code }}</code>
              <span class="mini-name">{{ c.name }}</span>
              <span class="mini-stat">{{ c.productCount }} {{ $t('admin.products') }}</span>
            </div>
            <p v-if="items.length === 0" class="empty-state compact">{{ $t('common.noResults') }}</p>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="mini-list">
          <div v-for="c in typeGroups[typeTab]" :key="c.id" class="mini-row">
            <code class="mini-code">{{ c.code }}</code>
            <span class="mini-name">{{ c.name }}</span>
            <span class="mini-stat">{{ c.productCount }} {{ $t('admin.products') }}</span>
          </div>
          <p v-if="typeGroups[typeTab].length === 0" class="empty-state compact">{{ $t('common.noResults') }}</p>
        </div>
      </template>
    </div>
  </template>

  <template v-else>
    <div class="filters-row">
      <label>{{ $t('admin.filterByType') }}
        <select v-model="typeFilter">
          <option value="all">{{ $t('common.all') }}</option>
          <option value="stay">{{ $t('admin.typeStay') }}</option>
          <option value="session">{{ $t('admin.typeSession') }}</option>
          <option value="stay_session">{{ $t('admin.typeStaySession') }}</option>
        </select>
      </label>
    </div>

    <div v-if="filteredCategories.length === 0" class="empty-state">{{ $t('common.noResults') }}</div>
    <div v-else class="item-cards">
      <div v-for="c in pageCategories" :key="c.id" class="item-card">
        <div class="item-thumb item-thumb-empty">
          <svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>
        </div>
        <div class="item-info">
          <div class="item-info-top">
            <span class="item-name">{{ c.name }}</span>
            <span class="type-tag" :class="`type-${c.bookingType}`">{{ bookingTypeLabel(c.bookingType) }}</span>
          </div>
          <div class="item-info-bottom">
            <code>{{ c.code }}</code>
            <span>· {{ c.productCount }} {{ $t('admin.products') }}</span>
          </div>
        </div>
        <div class="row-actions">
          <router-link class="btn-ghost btn-sm" :to="{ name: 'admin-category-edit', params: { id: c.id } }">{{ $t('admin.editCategory') }}</router-link>
          <button class="btn btn-danger btn-sm" @click="remove(c)">{{ $t('admin.delete') }}</button>
        </div>
      </div>
    </div>
    <Pagination :page="page" :total-pages="totalPages" @update:page="page = $event" />
  </template>
</template>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.header h1 { margin: 0; }
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

.category-panel {
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm); padding: 1rem 1.15rem; margin-bottom: 2rem;
}
.type-section + .type-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--color-border); }
.type-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 0.5rem; }
.type-header h3 { margin: 0; font-size: 0.92rem; font-weight: 700; }
.type-meta { font-size: 0.76rem; color: var(--color-text-muted); font-weight: 600; }
.mini-list { display: flex; flex-direction: column; gap: 0.4rem; }
.mini-row { display: flex; align-items: center; gap: 0.6rem; font-size: 0.82rem; }
.mini-code { font-size: 0.7rem; color: var(--color-text-faint); background: var(--color-bg); padding: 0.1rem 0.4rem; border-radius: 5px; }
.mini-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.mini-stat { color: var(--color-text-muted); font-size: 0.76rem; white-space: nowrap; }
.empty-state.compact { padding: 0.75rem 0; font-size: 0.82rem; }

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
.item-thumb { width: 44px; height: 44px; border-radius: var(--radius-sm); flex-shrink: 0; background: var(--color-primary-light); }
.item-thumb-empty { display: flex; align-items: center; justify-content: center; }
.item-thumb-empty svg { width: 20px; height: 20px; fill: var(--color-primary); }
.item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.item-info-top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; row-gap: 0.15rem; }
.item-name { font-weight: 700; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-info-bottom { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--color-text-muted); }
.item-info-bottom code { font-size: 0.74rem; }
.type-tag { font-size: 0.65rem; font-weight: 700; padding: 0.12rem 0.5rem; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.02em; flex-shrink: 0; }
.type-stay { background: #eff6ff; color: #2563eb; }
.type-session { background: var(--color-primary-light); color: var(--color-primary); }
.type-stay_session { background: var(--color-warning-bg); color: var(--color-warning); }

@media (max-width: 480px) {
  .item-card { flex-wrap: wrap; row-gap: 0.6rem; }
  .row-actions { width: 100%; justify-content: flex-end; flex-wrap: wrap; }
}
</style>
