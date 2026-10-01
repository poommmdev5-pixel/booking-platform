<script setup>
import { formatCurrency } from '../i18n';

defineProps({ product: { type: Object, required: true } });

const TYPE_ICON = {
  stay: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z',
  session: 'M20 12l-8 8-8-8 8-8 8 8zm-8-4.5L7.5 12 12 16.5 16.5 12 12 7.5z',
  stay_session: 'M4 4h6v6H4V4zm0 10h6v6H4v-6zM14 4h6v6h-6V4zm0 10h6v6h-6v-6z',
};
</script>

<template>
  <router-link class="product-card" :to="{ name: 'product-detail', params: { id: product.id } }">
    <div class="thumb">
      <img v-if="product.coverImage" :src="product.coverImage.urlMedium" :alt="product.name" loading="lazy" width="300" height="200" />
      <div v-else class="thumb-placeholder"></div>
      <span class="thumb-tag">{{ $t('product.startingFrom') }} {{ formatCurrency(product.startingPrice) }}</span>
      <span v-if="TYPE_ICON[product.bookingType]" class="thumb-type-badge">
        <svg viewBox="0 0 24 24"><path :d="TYPE_ICON[product.bookingType]" /></svg>
      </span>
    </div>
    <div class="body">
      <h3>{{ product.name }}</h3>
      <p v-if="product.location" class="location">
        <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/></svg>
        <span>{{ product.location }}</span>
      </p>
      <div class="meta-row">
        <span v-if="product.maxGuests" class="meta-chip">
          <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          {{ product.maxGuests }}
        </span>
        <span class="price-pill">
          <small>{{ $t('product.startingFrom') }}</small>
          {{ formatCurrency(product.startingPrice) }}
        </span>
      </div>
    </div>
    <svg class="row-chevron" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
  </router-link>
</template>

<style scoped>
.product-card {
  display: block;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  color: inherit;
  border: 1px solid var(--color-border-soft);
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.15s ease;
}
.product-card:hover { transform: translateY(-5px); box-shadow: var(--shadow-md); }
.thumb { position: relative; background: var(--color-cream); aspect-ratio: 4 / 3; overflow: hidden; flex-shrink: 0; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s ease; }
.product-card:hover .thumb img { transform: scale(1.06); }
.thumb-placeholder { width: 100%; height: 100%; background: linear-gradient(135deg, var(--color-primary-light), var(--color-cream)); }
.thumb-tag {
  position: absolute; left: 0.7rem; bottom: 0.7rem; background: rgba(10, 58, 54, 0.82); color: #fff;
  border: 1px solid var(--color-border); font-size: 0.72rem; font-weight: 700; padding: 0.35rem 0.7rem; border-radius: 999px; backdrop-filter: blur(4px);
}
.thumb-type-badge { display: none; }
.body { padding: 1rem 1.1rem 1.15rem; }
.body h3 { margin: 0 0 0.4rem; font-size: 0.98rem; font-weight: 700; }
.location { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: 0.8rem; color: var(--color-text-muted); }
.location svg { width: 14px; height: 14px; fill: var(--color-accent); flex-shrink: 0; }
.meta-row { display: none; }
.price-pill { display: none; }
.row-chevron { display: none; }

/* Native-app-style list row on small screens — a compact horizontal thumbnail + text
   row (like a travel app's list view) reads better on mobile than a tall stacked card,
   since it lets several results show at once without much scrolling. Desktop/tablet keep
   the stacked card above this breakpoint. */
@media (max-width: 640px) {
  .product-card {
    display: flex; flex-direction: row; align-items: center; gap: 0.9rem;
    padding: 0.75rem 0.5rem; border: none; border-radius: 0; box-shadow: none;
    border-bottom: 1px solid var(--color-border-soft);
  }
  .product-card:last-child { border-bottom: none; }
  .product-card:hover { transform: none; box-shadow: none; }
  .product-card:hover .thumb img { transform: none; }
  .product-card:active { background: var(--color-bg); }

  .thumb {
    width: 96px; height: 96px; aspect-ratio: unset; border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm); border: 1px solid var(--color-border-soft);
  }
  .thumb-tag { display: none; }
  .thumb-type-badge {
    display: flex; align-items: center; justify-content: center; position: absolute;
    right: 0.4rem; bottom: 0.4rem; width: 22px; height: 22px; border-radius: 999px;
    background: var(--color-primary); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }
  .thumb-type-badge svg { width: 12px; height: 12px; fill: #fff; }

  .body { padding: 0; flex: 1; min-width: 0; align-self: stretch; display: flex; flex-direction: column; justify-content: center; gap: 0.3rem; }
  .body h3 {
    margin: 0; font-size: 0.94rem; font-weight: 700; line-height: 1.3;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .location { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .location span { overflow: hidden; text-overflow: ellipsis; }

  .meta-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.15rem; }
  .meta-chip {
    display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.7rem; font-weight: 600;
    color: var(--color-text-faint); white-space: nowrap;
  }
  .meta-chip svg { width: 12px; height: 12px; fill: var(--color-text-faint); flex-shrink: 0; }
  .price-pill {
    display: inline-flex; align-items: baseline; gap: 0.25rem; flex-shrink: 0; margin-left: auto;
    background: var(--color-primary-light); color: var(--color-primary); font-weight: 800; font-size: 0.82rem;
    padding: 0.2rem 0.55rem; border-radius: 999px; white-space: nowrap;
  }
  .price-pill small { font-weight: 600; color: var(--color-primary); opacity: 0.75; font-size: 0.62rem; }

  .row-chevron { display: block; width: 18px; height: 18px; fill: var(--color-text-faint); flex-shrink: 0; }
}
</style>
