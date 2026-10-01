<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { productsApi } from '../../api/products';
import { formatCurrency, formatMinutes } from '../../i18n';
import { useLocaleRefetch } from '../../composables/useLocaleRefetch';
import BackButton from '../../components/BackButton.vue';

const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const { t } = useI18n();
const product = ref(null);
const activeImage = ref(null);

const TYPE_LABEL = { stay: 'product.perNight', session: 'product.perSession', stay_session: 'product.perHour' };

const tagList = computed(() =>
  (product.value?.tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean),
);

onMounted(async () => {
  product.value = await productsApi.getPublic(props.id);
  activeImage.value = product.value.coverImage || product.value.images[0] || null;
});

// Re-fetch on language switch to pick up the newly-translated name/description/extras —
// but only refresh the translated text, not the viewer's own picks: re-point activeImage
// at its same id in the fresh payload (images are plain objects, so `===` would otherwise
// break after a refetch).
useLocaleRefetch(async () => {
  if (!product.value) return;
  const activeImageId = activeImage.value?.id;
  product.value = await productsApi.getPublic(props.id);
  activeImage.value = product.value.images.find((img) => img.id === activeImageId) || product.value.coverImage || product.value.images[0] || null;
});

function tierLabel(tier) {
  if (product.value.bookingType === 'stay') return t('product.oneNight');
  if (product.value.bookingType === 'stay_session') return formatMinutes(tier.minutes);
  return tier.label;
}

function book() {
  router.push({ name: 'booking-flow', params: { productId: product.value.id } });
}
</script>

<template>
  <BackButton :to="{ name: 'products' }" />
  <div v-if="product" class="detail">
    <div class="hero">
      <div class="hero-image">
        <img v-if="activeImage" :src="activeImage.urlOriginal || activeImage.urlMedium" :alt="product.name" />
        <div v-else class="hero-image-placeholder"></div>
      </div>
      <div v-if="product.images.length > 1" class="thumbs">
        <button
          v-for="img in product.images"
          :key="img.id"
          type="button"
          class="thumb-btn"
          :class="{ active: img === activeImage }"
          @click="activeImage = img"
        >
          <img :src="img.urlThumbnail" loading="lazy" width="90" height="68" alt="" />
        </button>
      </div>
    </div>

    <div class="title-block">
      <h1 class="page-heading product-title">{{ product.name }}</h1>
      <div class="meta-line">
        <span v-if="product.location" class="meta-item">
          <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/></svg>
          {{ product.location }}
        </span>
        <span v-if="product.maxGuests" class="meta-item">
          <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          {{ $t('product.maxGuests') }} {{ product.maxGuests }}
        </span>
        <span v-if="product.minStayNights" class="meta-item">
          <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
          {{ $t('product.minStay', { n: product.minStayNights }) }}
        </span>
      </div>
    </div>

    <div class="detail-layout">
      <div class="detail-main">
        <section class="content-block">
          <h2 class="block-heading">{{ $t('product.about') }}</h2>
          <p class="description">{{ product.description || '—' }}</p>
          <div v-if="tagList.length > 0" class="tag-row">
            <span v-for="tag in tagList" :key="tag" class="tag-pill">{{ tag }}</span>
          </div>
        </section>

        <div v-if="product.extras.length > 0" class="thai-divider block-divider" aria-hidden="true">
          <span class="divider-line"></span>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 17 12 12 22 7 12Z M12 7.2 14.6 12 12 16.8 9.4 12Z" fill-rule="evenodd"/></svg>
          <span class="divider-line"></span>
        </div>
        <section v-if="product.extras.length > 0" class="content-block">
          <h2 class="block-heading">{{ $t('product.availableExtras') }}</h2>
          <div class="extras-row">
            <div v-for="e in product.extras" :key="e.id" class="extra-teaser">
              <div class="extra-teaser-photo">
                <img v-if="e.coverImage" :src="e.coverImage.urlThumbnail" alt="" />
                <span v-else class="extra-teaser-photo-fallback">{{ e.name.charAt(0) }}</span>
              </div>
              <p class="extra-teaser-name">{{ e.name }}</p>
              <p class="extra-teaser-price">+{{ formatCurrency(e.price) }}</p>
            </div>
          </div>
        </section>
      </div>

      <aside class="booking-card">
        <div class="booking-card-inner surface-panel">
          <p class="starting-label">{{ $t('product.startingFrom') }}</p>
          <p class="starting-price">
            {{ formatCurrency(product.startingPrice) }}
            <span>{{ $t(TYPE_LABEL[product.bookingType]) }}</span>
          </p>

          <div class="card-divider"></div>

          <p class="tier-heading">{{ $t('product.priceList') }}</p>
          <ul class="price-tiers">
            <li v-for="t in product.priceTiers" :key="t.id">
              <span class="tier-label">{{ tierLabel(t) }}</span>
              <strong>{{ formatCurrency(t.price) }}</strong>
            </li>
          </ul>

          <button class="btn btn-accent book-btn" @click="book">{{ $t('product.bookNow') }}</button>
          <p class="reassurance">
            <span><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>{{ $t('home.perkInstant') }}</span>
            <span><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>{{ $t('home.perkFlexible') }}</span>
          </p>
        </div>
      </aside>
    </div>
  </div>
  <div v-else class="detail-loading">
    <div class="skeleton" style="height: 420px; border-radius: var(--radius-lg);"></div>
  </div>
</template>

<style scoped>
.detail { max-width: 1080px; margin: 0 auto; }

/* ---------------- Hero ---------------- */
.hero { margin-bottom: 2.25rem; }
.hero-image {
  position: relative; border-radius: var(--radius-xl); overflow: hidden;
  background: var(--color-cream); aspect-ratio: 16 / 9; box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
}
.hero-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hero-image-placeholder { width: 100%; height: 100%; background: linear-gradient(135deg, var(--color-primary-light), var(--color-cream)); }
/* A quiet fade at the foot of the photo — without it, a bright photo edge meets the dark
   page below it abruptly; this eases the transition the same way the hero gradient does
   on the homepage, just subtler since this image isn't carrying any text of its own. */
.hero-image::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, transparent 72%, rgba(10, 58, 54, 0.4) 100%);
}
@media (max-width: 640px) { .hero-image { aspect-ratio: 4 / 3; border-radius: var(--radius-lg); } }

.thumbs { display: flex; gap: 0.55rem; flex-wrap: wrap; margin-top: 0.85rem; }
.thumb-btn {
  padding: 0; border: none; border-radius: var(--radius-sm); overflow: hidden;
  opacity: 0.55; transition: opacity 0.2s ease, box-shadow 0.2s ease; background: none; cursor: pointer;
}
.thumb-btn img { display: block; width: 76px; height: 56px; object-fit: cover; }
.thumb-btn.active { opacity: 1; box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 3.5px var(--color-primary); }
.thumb-btn:hover { opacity: 1; }

/* ---------------- Title block ---------------- */
.title-block { margin: 0 0 2.75rem; text-align: center; }
.product-title { font-size: clamp(1.9rem, 4vw, 2.75rem); margin: 0 0 0.9rem; }
.meta-line { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.4rem 1.5rem; }
.meta-item { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.88rem; color: var(--color-text-muted); font-weight: 600; }
.meta-item svg { width: 15px; height: 15px; fill: var(--color-accent); flex-shrink: 0; }

/* ---------------- Two-column layout ---------------- */
.detail-layout { display: grid; grid-template-columns: 1.6fr 1fr; gap: 3rem; align-items: start; }
@media (max-width: 860px) { .detail-layout { grid-template-columns: 1fr; gap: 2.25rem; } }

.content-block { margin-bottom: 2.75rem; }
.content-block:last-child { margin-bottom: 0; }
.block-divider { margin: -1rem 0 2rem; }
.block-heading {
  font-family: var(--font-display); font-size: 1.1rem; font-weight: 600; color: var(--color-text);
  margin: 0 0 1.1rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--color-border-soft);
}
.description { color: var(--color-text-muted); line-height: 1.9; white-space: pre-wrap; font-size: 0.96rem; }

.tag-row { display: flex; flex-wrap: wrap; gap: 0.55rem; margin-top: 1.35rem; }
.tag-pill {
  font-size: 0.76rem; font-weight: 600; color: var(--color-primary);
  padding: 0.4rem 0.9rem; border-radius: 999px; background: var(--color-primary-light);
  border: 1px solid var(--color-border);
  letter-spacing: 0.02em;
}

.extras-row { display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 0.4rem; margin: 0 -0.1rem; scrollbar-width: thin; }
.extra-teaser { flex: 0 0 auto; width: 128px; text-align: left; }
.extra-teaser-photo {
  width: 100%; aspect-ratio: 4 / 3; border-radius: var(--radius-md); overflow: hidden;
  background: var(--color-cream); margin-bottom: 0.6rem; box-shadow: var(--shadow-sm);
}
.extra-teaser-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.extra-teaser-photo-fallback {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  color: var(--color-primary); font-weight: 700; font-size: 1.3rem; background: var(--color-primary-light);
}
.extra-teaser-name { margin: 0; font-size: 0.84rem; font-weight: 600; line-height: 1.35; }
.extra-teaser-price { margin: 0.15rem 0 0; font-size: 0.8rem; color: var(--color-accent-hover); font-weight: 700; }

/* ---------------- Booking card ---------------- */
.booking-card { position: sticky; top: 5.5rem; }
.booking-card-inner {
  position: relative; overflow: hidden;
  padding: 2.1rem 1.85rem 1.85rem; border: 1px solid var(--color-border); box-shadow: var(--shadow-md);
}
/* A thin gold cap along the top edge — the one piece of chrome that marks this card as
   "the important one" on the page, without needing a loud background fill to do it. */
.booking-card-inner::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-primary) 50%, transparent);
}
.starting-label { margin: 0; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-text-faint); }
.starting-price { margin: 0.4rem 0 0; font-family: var(--font-display); font-size: 1.9rem; font-weight: 600; color: var(--color-primary); }
.starting-price span { font-family: var(--font-sans); font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); margin-left: 0.3rem; }
.card-divider { height: 1px; background: var(--color-border-soft); margin: 1.4rem 0; }

.tier-heading { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-faint); margin: 0 0 0.75rem; }
.price-tiers { list-style: none; padding: 0; margin: 0 0 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
.price-tiers li {
  display: flex; align-items: center; gap: 0.7rem;
  padding: 0.75rem 0.4rem; border-bottom: 1px solid var(--color-border-soft);
  font-size: 0.92rem;
}
.price-tiers li:last-child { border-bottom: none; }
.tier-label { flex: 1; color: var(--color-text); }
.price-tiers li strong { color: var(--color-primary); font-size: 0.98rem; font-weight: 700; }
.book-btn { width: 100%; justify-content: center; font-size: 1rem; padding: 0.9rem; }
.reassurance {
  display: flex; flex-direction: column; align-items: center; gap: 0.35rem;
  margin: 1.1rem 0 0; text-align: center; font-size: 0.78rem; color: var(--color-text-faint);
}
.reassurance span { display: inline-flex; align-items: center; gap: 0.35rem; }
.reassurance svg { width: 13px; height: 13px; fill: var(--color-success); flex-shrink: 0; }

.detail-loading { padding: 2rem 0; }
</style>
