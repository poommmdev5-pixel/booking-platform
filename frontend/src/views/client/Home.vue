<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { productsApi } from '../../api/products';
import { categoriesApi } from '../../api/categories';
import { settingsApi } from '../../api/settings';
import { useLocaleRefetch } from '../../composables/useLocaleRefetch';
import ProductCard from '../../components/ProductCard.vue';

const router = useRouter();

const featured = ref([]);
const categories = ref([]);
const businessInfo = ref({ phone: '' });
const loading = ref(true);
const search = ref('');
const activeCategory = ref('');

const CATEGORY_VISUAL = {
  stay: { gradient: 'linear-gradient(135deg, #2563eb, #60a5fa)', icon: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z' },
  session: { gradient: 'linear-gradient(135deg, #0f7a70, #34d399)', icon: 'M20 12l-8 8-8-8 8-8 8 8zm-8-4.5L7.5 12 12 16.5 16.5 12 12 7.5z' },
  stay_session: { gradient: 'linear-gradient(135deg, #d68a3c, #f4c78a)', icon: 'M4 4h6v6H4V4zm0 10h6v6H4v-6zM14 4h6v6h-6V4zm0 10h6v6h-6v-6z' },
};

async function loadLocalizedContent() {
  const [productsRes, categoriesRes] = await Promise.all([
    productsApi.listPublic({ page: 1, pageSize: 6 }),
    categoriesApi.list(),
  ]);
  featured.value = productsRes.items;
  categories.value = categoriesRes;
}
useLocaleRefetch(loadLocalizedContent);

onMounted(async () => {
  await loadLocalizedContent();
  loading.value = false;
  try {
    businessInfo.value = await settingsApi.getPublicBusinessInfo();
  } catch {
    // Non-critical — the assistance banner just omits the phone number.
  }
});

function submitSearch() {
  router.push({ name: 'products', query: { search: search.value || undefined, categoryId: activeCategory.value || undefined } });
}
</script>

<template>
  <section class="hero">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="hero-dots" aria-hidden="true"></div>
    <div class="hero-content">
      <p class="eyebrow hero-eyebrow">Andaman Breeze Resort · Phuket</p>
      <h1 class="page-heading hero-title">{{ $t('home.hero') }}</h1>
      <p class="hero-sub">{{ $t('home.heroSub') }}</p>
      <div class="hero-cta-row">
        <router-link to="/products" class="btn btn-accent">{{ $t('nav.products') }} →</router-link>
        <router-link to="/account/lookup" class="btn hero-ghost-btn">{{ $t('account.lookupShort') }}</router-link>
      </div>
    </div>
  </section>

  <div class="search-float">
    <div class="search-tabs">
      <button type="button" class="search-tab" :class="{ active: !activeCategory }" @click="activeCategory = ''">{{ $t('common.all') }}</button>
      <button
        v-for="c in categories"
        :key="c.id"
        type="button"
        class="search-tab"
        :class="{ active: activeCategory === c.id }"
        @click="activeCategory = c.id"
      >
        {{ c.name }}
      </button>
    </div>
    <form class="search-fields" @submit.prevent="submitSearch">
      <div class="search-field">
        <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z"/></svg>
        <input type="search" v-model="search" :placeholder="$t('home.searchPlaceholder')" />
      </div>
      <button type="submit" class="btn btn-accent search-submit">{{ $t('home.searchAction') }}</button>
    </form>
  </div>

  <section class="perks">
    <div class="perk-card">
      <span class="perk-icon"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>
      <div>
        <h3>{{ $t('home.perkInstant') }}</h3>
        <p>{{ $t('home.perkInstantSub') }}</p>
      </div>
    </div>
    <div class="perk-card">
      <span class="perk-icon"><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></span>
      <div>
        <h3>{{ $t('home.perkStaff') }}</h3>
        <p>{{ $t('home.perkStaffSub') }}</p>
      </div>
    </div>
    <div class="perk-card">
      <span class="perk-icon"><svg viewBox="0 0 24 24"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg></span>
      <div>
        <h3>{{ $t('home.perkFlexible') }}</h3>
        <p>{{ $t('home.perkFlexibleSub') }}</p>
      </div>
    </div>
  </section>

  <section class="category-section">
    <div class="section-head">
      <div>
        <p class="eyebrow">{{ $t('home.categoriesEyebrow') }}</p>
        <h2 class="page-heading">{{ $t('home.categoriesTitle') }}</h2>
      </div>
    </div>
    <div class="category-grid">
      <router-link
        v-for="c in categories"
        :key="c.id"
        :to="{ name: 'products', query: { categoryId: c.id } }"
        class="category-card"
        :style="{ background: (CATEGORY_VISUAL[c.bookingType] || CATEGORY_VISUAL.stay).gradient }"
      >
        <svg class="category-icon" viewBox="0 0 24 24"><path :d="(CATEGORY_VISUAL[c.bookingType] || CATEGORY_VISUAL.stay).icon" /></svg>
        <span class="category-name">{{ c.name }}</span>
        <span class="category-arrow">{{ $t('home.viewAll') }} →</span>
      </router-link>
    </div>
  </section>

  <section class="featured-section">
    <div class="section-head">
      <div>
        <p class="eyebrow">{{ $t('home.featured') }}</p>
        <h2 class="page-heading">{{ $t('home.featuredSub') }}</h2>
      </div>
      <router-link to="/products" class="view-all-link">{{ $t('home.viewAll') }} →</router-link>
    </div>

    <div v-if="loading" class="grid">
      <div v-for="i in 3" :key="i" class="skeleton-card">
        <div class="skeleton thumb"></div>
        <div class="body"><div class="skeleton skeleton-line" style="width: 70%"></div><div class="skeleton skeleton-line" style="width: 40%"></div></div>
      </div>
    </div>
    <div v-else class="grid">
      <ProductCard v-for="p in featured" :key="p.id" :product="p" />
    </div>
  </section>

  <section class="assist-banner">
    <div class="assist-text">
      <p class="eyebrow assist-eyebrow">{{ $t('home.assistEyebrow') }}</p>
      <h2 class="page-heading assist-title">{{ $t('home.assistTitle') }}</h2>
      <p class="assist-sub">{{ $t('home.assistSub') }}</p>
      <div class="assist-actions">
        <router-link to="/account/lookup" class="btn btn-accent">{{ $t('account.lookupShort') }}</router-link>
        <a v-if="businessInfo.phone" :href="`tel:${businessInfo.phone}`" class="assist-phone">
          <svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          {{ businessInfo.phone }}
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  isolation: isolate;
}
.hero-bg {
  position: absolute; inset: 0;
  background:
    linear-gradient(100deg, rgba(6, 30, 27, 0.92) 0%, rgba(8, 40, 36, 0.78) 32%, rgba(10, 60, 55, 0.42) 58%, rgba(10, 74, 69, 0.18) 100%),
    radial-gradient(ellipse 60% 60% at 10% 15%, rgba(214, 138, 60, 0.3), transparent 55%),
    url('/images/hero-beach-day.jpg');
  background-size: cover;
  background-position: center 65%;
}
.hero-dots {
  position: absolute; top: 2.5rem; right: 3rem; width: 130px; height: 130px;
  background-image: radial-gradient(rgba(255, 255, 255, 0.35) 1.5px, transparent 1.5px);
  background-size: 16px 16px;
  opacity: 0.7;
}
@media (max-width: 760px) { .hero-dots { display: none; } }
.hero-content { position: relative; padding: 4.5rem 2.5rem 6.5rem; max-width: 640px; }
.hero-eyebrow {
  color: #ffd9a0; margin: 0 0 0.9rem;
}
.hero-eyebrow::before { background: #ffd9a0; }
/* h1.hero-title (element + class) is needed, not just .hero-title, so this beats
   client-theme.css's generic ".client-shell h1.page-heading" rule on specificity —
   otherwise that rule silently wins and the hero renders at the generic (smaller) scale. */
h1.hero-title { color: #fff; margin: 0 0 0.9rem; font-size: clamp(1.85rem, 4.2vw, 2.9rem); }
.hero-sub { color: rgba(255, 255, 255, 0.82); font-size: 1.02rem; max-width: 34rem; margin: 0 0 2rem; line-height: 1.7; }
.hero-cta-row { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.hero-ghost-btn { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.35); color: #fff; }
@media (max-width: 640px) {
  .hero-content { padding: 2.25rem 1.5rem 2.75rem; }
  .hero-sub { margin-bottom: 1.5rem; }
}
.hero-ghost-btn:hover { background: rgba(255, 255, 255, 0.2); box-shadow: none; }

.search-float {
  position: relative; z-index: 2; margin: -3.5rem auto 3.5rem; padding: 1.1rem 1.25rem 1.25rem;
  max-width: 900px;
  background: rgba(255, 255, 255, 0.38);
  backdrop-filter: blur(22px) saturate(1.3);
  -webkit-backdrop-filter: blur(22px) saturate(1.3);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
}
@media (max-width: 640px) {
  /* The hero's own bottom padding shrank a lot on mobile (see .hero-content above), so
     the same -3.5rem pull-up used on desktop now overlaps the CTA buttons above it —
     a smaller overlap here keeps the "floating card" look with real clearance instead. */
  .search-float { margin-top: -1.25rem; padding: 1rem 1.1rem 1.1rem; }
}
.search-tabs { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.9rem; }
.search-tab {
  padding: 0.4rem 0.9rem; border-radius: 999px; border: none; background: var(--color-bg);
  color: var(--color-text-muted); font-size: 0.82rem; font-weight: 700; transition: background 0.15s ease, color 0.15s ease;
}
.search-tab:hover { color: var(--color-primary); }
.search-tab.active { background: var(--color-primary); color: #fff; }
.search-fields {
  display: flex; gap: 0.6rem;
  background: var(--color-surface); border-radius: var(--radius-lg);
  padding: 0.6rem; box-shadow: var(--shadow-md);
}
.search-field input { border: none; box-shadow: none; }
.search-field input:focus { box-shadow: none; }
.search-field { position: relative; flex: 1; }
.search-field svg { position: absolute; left: 0.9rem; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; fill: var(--color-text-faint); }
.search-field input { padding-left: 2.5rem; margin: 0; width: 100%; }
.search-submit { flex-shrink: 0; }
@media (max-width: 560px) {
  .search-fields { flex-direction: column; }
  .search-submit { justify-content: center; }
}

.perks {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; margin-bottom: 3.5rem;
}
@media (max-width: 760px) { .perks { grid-template-columns: 1fr; } }
.perk-card {
  display: flex; align-items: flex-start; gap: 1rem; padding: 1.35rem 1.5rem;
  background: var(--color-surface); border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.perk-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
.perk-icon {
  width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0;
  background: var(--color-primary-light); color: var(--color-primary);
  display: flex; align-items: center; justify-content: center;
}
.perk-icon svg { width: 22px; height: 22px; fill: currentColor; }
.perk-card h3 { margin: 0 0 0.25rem; font-size: 0.95rem; }
.perk-card p { margin: 0; font-size: 0.83rem; color: var(--color-text-muted); line-height: 1.5; }

.section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-bottom: 1.75rem; }
.section-head .page-heading { margin: 0; }
.view-all-link { font-weight: 700; font-size: 0.88rem; color: var(--color-primary); white-space: nowrap; }
.view-all-link:hover { color: var(--color-primary-hover); }

.category-section { margin-bottom: 3.5rem; }
.category-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
@media (max-width: 760px) { .category-grid { grid-template-columns: 1fr; } }
.category-card {
  position: relative; display: flex; flex-direction: column; justify-content: flex-end;
  min-height: 190px; padding: 1.5rem; border-radius: var(--radius-lg); overflow: hidden;
  color: #fff; box-shadow: var(--shadow-md); transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.category-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
.category-card::before {
  content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 30%, rgba(0, 0, 0, 0.35) 100%);
}
.category-icon { position: absolute; top: 1.25rem; right: 1.25rem; width: 30px; height: 30px; fill: rgba(255, 255, 255, 0.55); }
.category-name { position: relative; font-family: var(--font-display); font-weight: 700; font-size: 1.25rem; margin-bottom: 0.25rem; }
.category-arrow { position: relative; font-size: 0.82rem; font-weight: 700; color: rgba(255, 255, 255, 0.85); }

.featured-section { margin-bottom: 3.5rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.5rem; }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; gap: 0; background: var(--color-surface); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); } }

.skeleton-card {
  pointer-events: none;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--color-border-soft);
  box-shadow: var(--shadow-sm);
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

.assist-banner {
  position: relative; overflow: hidden; border-radius: var(--radius-xl);
  background:
    linear-gradient(100deg, rgba(6, 20, 24, 0.9) 0%, rgba(8, 30, 34, 0.72) 40%, rgba(10, 45, 50, 0.4) 70%, rgba(10, 60, 65, 0.15) 100%),
    url('/images/hero-beach-dusk.jpg');
  background-size: cover;
  background-position: center 40%;
  padding: 3rem 2.75rem;
  box-shadow: var(--shadow-lg);
}
@media (max-width: 640px) { .assist-banner { padding: 2rem 1.5rem; } }
.assist-banner::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 60% 80% at 90% 20%, rgba(214, 138, 60, 0.25), transparent 60%);
}
.assist-text { position: relative; max-width: 34rem; }
.assist-eyebrow { color: #ffd9a0; }
.assist-eyebrow::before { background: #ffd9a0; }
.assist-title { color: #fff; margin: 0 0 0.75rem; font-size: clamp(1.4rem, 2.6vw, 1.9rem); }
.assist-sub { color: rgba(255, 255, 255, 0.82); line-height: 1.7; margin: 0 0 1.75rem; }
.assist-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 1.5rem; }
.assist-phone { display: flex; align-items: center; gap: 0.5rem; color: #fff; font-weight: 700; }
.assist-phone svg { width: 18px; height: 18px; fill: #ffd9a0; }
</style>
