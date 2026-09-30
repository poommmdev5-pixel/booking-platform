<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { productsApi } from '../../api/products';
import { categoriesApi } from '../../api/categories';
import { usePagination } from '../../composables/usePagination';
import { useLocaleRefetch } from '../../composables/useLocaleRefetch';
import Pagination from '../../components/Pagination.vue';
import ProductCard from '../../components/ProductCard.vue';

const route = useRoute();
const products = ref([]);
const categories = ref([]);
const search = ref(typeof route.query.search === 'string' ? route.query.search : '');
const categoryId = ref(route.query.categoryId ? Number(route.query.categoryId) : '');
const loading = ref(true);
const { page, totalPages, pageItems: pageProducts, reset: resetPage } = usePagination(products, 9);

const TYPE_ICONS = {
  stay: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z',
  session: 'M20 12l-8 8-8-8 8-8 8 8zm-8-4.5L7.5 12 12 16.5 16.5 12 12 7.5z',
  stay_session: 'M4 4h6v6H4V4zm0 10h6v6H4v-6zM14 4h6v6h-6V4zm0 10h6v6h-6v-6z',
};

async function reload() {
  loading.value = true;
  const res = await productsApi.listPublic({ search: search.value || undefined, categoryId: categoryId.value || undefined, page: 1, pageSize: 60 });
  products.value = res.items;
  resetPage();
  loading.value = false;
}

function selectCategory(id) {
  categoryId.value = categoryId.value === id ? '' : id;
  reload();
}

async function loadLocalizedContent() {
  categories.value = await categoriesApi.list();
  await reload();
}
useLocaleRefetch(loadLocalizedContent);

onMounted(loadLocalizedContent);
</script>

<template>
  <header class="page-header">
    <p class="eyebrow">{{ $t('nav.products') }}</p>
    <h1 class="page-heading">{{ $t('home.featuredSub') }}</h1>
  </header>

  <div class="filter-bar surface-panel">
    <div class="search-field">
      <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z"/></svg>
      <input type="search" v-model="search" @input="reload" :placeholder="$t('home.searchPlaceholder')" />
    </div>
    <div class="category-chips">
      <button type="button" class="chip" :class="{ active: !categoryId }" @click="selectCategory('')">{{ $t('common.all') }}</button>
      <button
        v-for="c in categories"
        :key="c.id"
        type="button"
        class="chip"
        :class="{ active: categoryId === c.id }"
        @click="selectCategory(c.id)"
      >
        <svg viewBox="0 0 24 24"><path :d="TYPE_ICONS[c.bookingType] || TYPE_ICONS.stay" /></svg>
        {{ c.name }}
      </button>
    </div>
  </div>

  <div v-if="loading" class="grid">
    <div v-for="i in 6" :key="i" class="skeleton-card">
      <div class="skeleton thumb"></div>
      <div class="body"><div class="skeleton skeleton-line" style="width: 70%"></div><div class="skeleton skeleton-line" style="width: 40%"></div></div>
    </div>
  </div>
  <template v-else>
    <div v-if="products.length === 0" class="empty-state">{{ $t('product.noResults') }}</div>
    <template v-else>
      <p class="results-count">{{ $t('product.resultsFound', { n: products.length }) }}</p>
      <div class="grid">
        <ProductCard v-for="p in pageProducts" :key="p.id" :product="p" />
      </div>
    </template>
  </template>
  <Pagination :page="page" :total-pages="totalPages" @update:page="page = $event" />
</template>

<style scoped>
.page-header { margin-bottom: 1.75rem; }
.page-header .page-heading { margin: 0; }

.filter-bar {
  display: flex; flex-direction: column; gap: 1rem;
  padding: 1.25rem 1.5rem; margin-bottom: 2rem;
}
.search-field { position: relative; }
.search-field svg { position: absolute; left: 0.9rem; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; fill: var(--color-text-faint); }
.search-field input { padding-left: 2.5rem; width: 100%; margin: 0; }

.category-chips { display: flex; flex-wrap: wrap; gap: 0.55rem; }
.chip {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 1rem; border-radius: 999px; border: 1px solid var(--color-border);
  background: var(--color-bg); color: var(--color-text-muted);
  font-size: 0.84rem; font-weight: 600; transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.chip svg { width: 15px; height: 15px; fill: currentColor; }
.chip:hover { border-color: var(--color-primary); color: var(--color-primary); }
.chip.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }

.results-count { margin: 0 0 1rem; font-size: 0.85rem; color: var(--color-text-muted); font-weight: 600; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.5rem; }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; gap: 0; background: var(--color-surface); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); } }
.skeleton-card {
  background: var(--color-surface); border-radius: var(--radius-lg); overflow: hidden;
  border: 1px solid var(--color-border-soft); box-shadow: var(--shadow-sm);
}
.skeleton-card .thumb { aspect-ratio: 4 / 3; }
.skeleton-card .body { padding: 1rem 1.1rem 1.15rem; }
.skeleton-line { height: 12px; margin: 0.3rem 0; border-radius: 6px; }
@media (max-width: 640px) {
  .skeleton-card {
    display: flex; flex-direction: row; align-items: center; gap: 0.85rem;
    padding: 0.65rem; border: none; border-radius: 0; box-shadow: none;
    border-bottom: 1px solid var(--color-border-soft);
  }
  .skeleton-card:last-child { border-bottom: none; }
  .skeleton-card .thumb { width: 88px; height: 88px; aspect-ratio: unset; border-radius: var(--radius-md); flex-shrink: 0; }
  .skeleton-card .body { padding: 0; flex: 1; }
}
</style>
