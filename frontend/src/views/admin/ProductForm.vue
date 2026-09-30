<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { productsApi } from '../../api/products';
import { categoriesApi } from '../../api/categories';
import { extrasApi } from '../../api/extras';
import { formatCurrency, formatMinutes } from '../../i18n';
import ImageManager from '../../components/ImageManager.vue';
import BackButton from '../../components/BackButton.vue';

const props = defineProps({ id: { type: String, default: null } });
const router = useRouter();
const { t } = useI18n();

const LOCALES = ['th', 'en', 'zh'];
const activeLocale = ref('th');
const categories = ref([]);
const extras = ref([]);
const selectedExtraIds = ref([]);
const isEdit = ref(false);
const productId = ref(null);

const MAX_GUESTS_LIMIT = 8;

const code = ref('');
const categoryId = ref('');
const bookingType = ref('session');
const priceTiers = ref([{ label: '', minutes: 30, price: 0 }]);
const capacity = ref(1);
const minStayNights = ref(null);
const maxGuests = ref(1);
const location = ref('');
const translations = ref(LOCALES.map((locale) => ({ locale, name: '', description: '', tags: '' })));
const images = ref([]);
const error = ref('');

onMounted(async () => {
  const [allCategories, allExtras] = await Promise.all([categoriesApi.list(), extrasApi.listAdmin()]);
  categories.value = allCategories;
  extras.value = allExtras.filter((e) => e.status === 'active');
  if (!props.id && categories.value.length > 0) {
    categoryId.value = categories.value[0].id;
  }
  if (props.id) {
    isEdit.value = true;
    productId.value = Number(props.id);
    const p = await productsApi.getAdmin(productId.value);
    code.value = p.code;
    categoryId.value = p.categoryId;
    bookingType.value = p.bookingType;
    priceTiers.value =
      p.priceTiers && p.priceTiers.length > 0
        ? p.priceTiers.map((t) => ({ label: t.label, minutes: t.minutes, price: t.price, unitLimit: t.unitLimit }))
        : [{ label: '', minutes: 30, price: 0, unitLimit: 10 }];
    capacity.value = p.capacity || 1;
    minStayNights.value = p.minStayNights || null;
    maxGuests.value = p.maxGuests;
    location.value = p.location || '';
    images.value = p.images || [];
    selectedExtraIds.value = (p.extras || []).map((e) => e.id);
    for (const locale of LOCALES) {
      const existing = p.translations.find((t) => t.locale === locale);
      const slot = translations.value.find((t) => t.locale === locale);
      if (existing) {
        slot.name = existing.name;
        slot.description = existing.description || '';
        slot.tags = existing.tags || '';
      }
    }
  }
});

function onBookingTypeChange() {
  if (bookingType.value === 'stay') {
    priceTiers.value = [{ label: '', minutes: null, price: priceTiers.value[0]?.price || 0 }];
  } else if (bookingType.value === 'stay_session') {
    priceTiers.value = priceTiers.value.map((t) => ({ label: '', minutes: t.minutes || 30, price: t.price }));
  } else {
    priceTiers.value = priceTiers.value.map((t) => ({ label: t.label || '', minutes: null, price: t.price, unitLimit: t.unitLimit || 10 }));
  }
}

function addPriceTier() {
  priceTiers.value.push(bookingType.value === 'session' ? { label: '', price: 0, unitLimit: 10 } : { label: '', minutes: 30, price: 0 });
}

function removePriceTier(index) {
  priceTiers.value.splice(index, 1);
}

async function save() {
  error.value = '';
  if (!categoryId.value) {
    error.value = t('admin.categoryRequired');
    return;
  }
  let validPriceTiers;
  if (bookingType.value === 'stay') {
    validPriceTiers = Number(priceTiers.value[0]?.price) > 0 ? [{ label: '1 night', price: Number(priceTiers.value[0].price) }] : [];
  } else if (bookingType.value === 'stay_session') {
    validPriceTiers = priceTiers.value
      .filter((t) => Number(t.minutes) > 0 && Number(t.price) > 0)
      .map((t) => ({ minutes: Number(t.minutes), price: Number(t.price) }));
  } else {
    validPriceTiers = priceTiers.value
      .filter((t) => t.label?.trim() && Number(t.price) > 0 && Number(t.unitLimit) > 0)
      .map((t) => ({ label: t.label.trim(), price: Number(t.price), unitLimit: Number(t.unitLimit) }));
  }
  if (validPriceTiers.length === 0) {
    error.value = bookingType.value === 'session' ? t('admin.priceTierRequiredSession') : t('admin.priceTierRequired');
    return;
  }
  if (bookingType.value !== 'session' && maxGuests.value > MAX_GUESTS_LIMIT) {
    error.value = t('admin.maxGuestsExceeded', { max: MAX_GUESTS_LIMIT });
    return;
  }
  const payload = {
    categoryId: categoryId.value,
    bookingType: bookingType.value,
    priceTiers: validPriceTiers,
    capacity: bookingType.value === 'stay' ? capacity.value : undefined,
    minStayNights: bookingType.value === 'stay' ? minStayNights.value : undefined,
    maxGuests: bookingType.value === 'session' ? 1 : maxGuests.value,
    location: location.value || undefined,
    translations: translations.value.filter((t) => t.name?.trim()),
    extraIds: selectedExtraIds.value,
  };
  try {
    if (isEdit.value) {
      const product = await productsApi.update(productId.value, payload);
      images.value = product.images || [];
    } else {
      // Set local state directly instead of relying on the route change to remount this
      // component (admin-product-new -> admin-product-edit reuse the same component
      // instance, so onMounted would never re-run and the Images section would stay hidden).
      const product = await productsApi.create(payload);
      isEdit.value = true;
      productId.value = product.id;
      code.value = product.code;
      images.value = product.images || [];
      router.replace({ name: 'admin-product-edit', params: { id: product.id } });
    }
  } catch (err) {
    error.value = err.message;
  }
}

async function uploadImage(file) {
  const img = await productsApi.uploadImage(productId.value, file);
  images.value.push(img);
}

async function setCover(img) {
  await productsApi.setCoverImage(productId.value, img.id);
  images.value = images.value.map((i) => ({ ...i, isCover: i.id === img.id }));
}

async function removeImage(img) {
  await productsApi.removeImage(productId.value, img.id);
  images.value = images.value.filter((i) => i.id !== img.id);
}
</script>

<template>
  <BackButton :to="{ name: 'admin-products' }" />
  <h1>{{ $t(isEdit ? 'admin.editProduct' : 'admin.addProduct') }}</h1>
  <div class="grid">
    <div class="card">
      <label v-if="isEdit">{{ $t('admin.code') }}<input :value="code" disabled /></label>
      <label>{{ $t('admin.category') }}
        <select v-model="categoryId">
          <option value="" disabled>{{ categories.length === 0 ? $t('admin.noCategoriesYet') : '-- ' + $t('admin.categories') + ' --' }}</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
      <label>{{ $t('admin.bookingType') }}
        <select v-model="bookingType" @change="onBookingTypeChange">
          <option value="stay">{{ $t('admin.bookingTypeStay') }}</option>
          <option value="session">{{ $t('admin.bookingTypeSession') }}</option>
          <option value="stay_session">{{ $t('admin.bookingTypeStaySession') }}</option>
        </select>
      </label>
      <template v-if="bookingType === 'stay'">
        <label>{{ $t('admin.capacityLabel') }}<input type="number" v-model.number="capacity" /></label>
        <label>{{ $t('admin.minStayNights') }}<input type="number" v-model.number="minStayNights" /></label>
      </template>
      <p v-else-if="bookingType === 'session'" class="session-hint">{{ $t('admin.sessionBookingHint') }}</p>
      <p v-else class="session-hint">{{ $t('admin.stayCalendarHint') }}</p>
      <label v-if="bookingType !== 'session'">{{ $t('admin.maxGuestsLabel', { max: MAX_GUESTS_LIMIT }) }}<input type="number" min="1" :max="MAX_GUESTS_LIMIT" v-model.number="maxGuests" /></label>
      <label>{{ $t('admin.location') }}<input v-model="location" /></label>
    </div>

    <div class="card">
      <div class="tabs">
        <button v-for="l in LOCALES" :key="l" type="button" :class="{ active: activeLocale === l }" @click="activeLocale = l">
          {{ l.toUpperCase() }}<span v-if="l === 'th'"> *</span>
        </button>
      </div>
      <template v-for="tr in translations" :key="tr.locale">
        <template v-if="tr.locale === activeLocale">
          <label>{{ $t('admin.name') }}<input v-model="tr.name" /></label>
          <label>{{ $t('admin.description') }}<textarea rows="5" v-model="tr.description"></textarea></label>
          <label>{{ $t('admin.tagsLabel') }}<input v-model="tr.tags" /></label>
        </template>
      </template>
    </div>
  </div>

  <h2>{{ $t('admin.pricing') }}</h2>
  <div class="card">
    <template v-if="bookingType === 'stay'">
      <p class="price-tiers-hint">{{ $t('admin.stayPricingHint') }}</p>
      <div class="price-tier-row">
        <input type="number" min="0" v-model.number="priceTiers[0].price" :placeholder="$t('admin.pricePerNight')" class="price-tier-price" />
        <span class="price-tier-fixed-label">{{ $t('product.oneNight') }}</span>
      </div>
    </template>
    <template v-else-if="bookingType === 'stay_session'">
      <p class="price-tiers-hint">{{ $t('admin.staySessionPricingHint') }}</p>
      <div class="price-tiers-list">
        <div v-for="(tier, index) in priceTiers" :key="index" class="price-tier-row">
          <input type="number" min="1" v-model.number="tier.minutes" :placeholder="$t('admin.minutesPlaceholder')" class="price-tier-minutes" />
          <span class="price-tier-preview">{{ formatMinutes(tier.minutes) }}</span>
          <input type="number" min="0" v-model.number="tier.price" :placeholder="$t('admin.pricePlaceholder')" class="price-tier-price" />
          <button type="button" class="btn-ghost btn-sm price-tier-remove" :disabled="priceTiers.length === 1" @click="removePriceTier(index)" :aria-label="$t('admin.removeLabel')">✕</button>
        </div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm add-tier-btn" @click="addPriceTier">+ {{ $t('admin.addDuration') }}</button>
    </template>
    <template v-else>
      <p class="price-tiers-hint">{{ $t('admin.sessionPriceTiersHint') }}</p>
      <div class="price-tiers-list">
        <div v-for="(tier, index) in priceTiers" :key="index" class="price-tier-row">
          <input v-model="tier.label" placeholder="ผู้ใหญ่ | Adult | 成人" class="price-tier-label" />
          <input type="number" min="0" v-model.number="tier.price" :placeholder="$t('admin.pricePerUnitPlaceholder')" class="price-tier-price" />
          <input type="number" min="1" v-model.number="tier.unitLimit" :placeholder="$t('admin.limitPlaceholder')" class="price-tier-limit" />
          <button type="button" class="btn-ghost btn-sm price-tier-remove" :disabled="priceTiers.length === 1" @click="removePriceTier(index)" :aria-label="$t('admin.removeLabel')">✕</button>
        </div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm add-tier-btn" @click="addPriceTier">+ {{ $t('admin.addPriceTier') }}</button>
    </template>
  </div>

  <h2>{{ $t('admin.extras') }}</h2>
  <div class="card">
    <div v-if="extras.length === 0" class="extras-empty">{{ $t('common.noResults') }}</div>
    <div v-else class="extras-grid">
      <label v-for="e in extras" :key="e.id" class="extra-card" :class="{ selected: selectedExtraIds.includes(e.id) }">
        <input type="checkbox" :value="e.id" v-model="selectedExtraIds" />
        <img v-if="e.coverImage" class="extra-thumb" :src="e.coverImage.urlThumbnail" alt="" />
        <span v-else class="extra-thumb extra-thumb-empty">{{ e.name.charAt(0) }}</span>
        <span class="extra-info">
          <span class="extra-name">{{ e.name }}</span>
          <span class="extra-price">{{ formatCurrency(e.price) }}</span>
        </span>
        <span class="extra-check" aria-hidden="true"></span>
      </label>
    </div>
  </div>

  <p v-if="error" class="error">{{ error }}</p>
  <div class="save-bar">
    <button class="btn" @click="save">{{ $t('admin.save') }}</button>
  </div>

  <h2>{{ $t('admin.images') }}</h2>
  <div class="card">
    <ImageManager v-if="isEdit && productId" :images="images" :max="5" :on-upload="uploadImage" :on-set-cover="setCover" :on-remove="removeImage" />
    <p v-else class="save-first-hint">{{ $t('admin.saveFirstForImages') }}</p>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; }
@media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
label input, label select, label textarea { max-width: none; }
label input:disabled { background: #f1f5f9; color: var(--color-text-muted); }
.extras-empty { font-size: 0.85rem; color: var(--color-text-muted); }
.price-tiers-hint { font-size: 0.82rem; color: var(--color-text-muted); margin: 0 0 0.85rem; }
.price-tiers-list { display: flex; flex-direction: column; gap: 0.5rem; }
.price-tier-row { display: flex; align-items: center; gap: 0.5rem; }
.price-tier-label { flex: 2; margin: 0; max-width: none; }
.price-tier-price { flex: 1; margin: 0; max-width: none; }
.price-tier-minutes { flex: 1; margin: 0; max-width: none; }
.price-tier-limit { flex: 1; margin: 0; max-width: none; }
.price-tier-preview { flex-shrink: 0; font-size: 0.8rem; font-weight: 600; color: var(--color-primary); min-width: 90px; }
.price-tier-fixed-label {
  flex-shrink: 0; font-size: 0.82rem; font-weight: 600; color: var(--color-text-muted);
  background: var(--color-bg); padding: 0.5rem 0.85rem; border-radius: var(--radius-sm);
}
.price-tier-remove {
  flex-shrink: 0; width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); color: var(--color-danger); font-weight: 700;
}
.price-tier-remove:disabled { opacity: 0.35; cursor: not-allowed; }
.add-tier-btn { margin-top: 0.85rem; }
.save-first-hint { font-size: 0.85rem; color: var(--color-text-muted); margin: 0; }
.session-hint { font-size: 0.85rem; color: var(--color-text-muted); background: var(--color-primary-light); padding: 0.6rem 0.75rem; border-radius: var(--radius-sm); }

.extras-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
.extra-card {
  position: relative; display: flex; align-items: center; gap: 0.7rem; margin: 0;
  padding: 0.65rem 0.85rem; border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-surface); cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.extra-card:hover { border-color: var(--color-primary); }
.extra-card.selected { border-color: var(--color-primary); background: var(--color-primary-light); box-shadow: var(--shadow-sm); }
.extra-card input[type='checkbox'] { position: absolute; opacity: 0; pointer-events: none; }
.extra-thumb {
  width: 44px; height: 44px; border-radius: var(--radius-sm); flex-shrink: 0; object-fit: cover;
  display: flex; align-items: center; justify-content: center;
}
.extra-thumb-empty { background: var(--color-primary-light); color: var(--color-primary); font-weight: 700; font-size: 1rem; }
.extra-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.extra-name { font-weight: 600; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.extra-price { font-size: 0.78rem; color: var(--color-text-muted); font-weight: 500; }
.extra-check {
  width: 18px; height: 18px; border-radius: 5px; flex-shrink: 0; border: 1.5px solid var(--color-border);
  background: #fff; transition: border-color 0.15s ease, background 0.15s ease;
}
.extra-card.selected .extra-check {
  border-color: var(--color-primary); background: var(--color-primary)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M3 8l3.5 3.5L13 5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    center/12px no-repeat;
}
.tabs { display: flex; gap: 0.35rem; margin-bottom: 1rem; background: #f1f5f9; padding: 0.3rem; border-radius: var(--radius-sm); width: fit-content; }
.tabs button { padding: 0.4rem 0.9rem; border: none; background: transparent; border-radius: 6px; font-weight: 600; font-size: 0.85rem; color: var(--color-text-muted); }
.tabs button.active { background: #fff; color: var(--color-primary); box-shadow: var(--shadow-sm); }
.save-bar { display: flex; justify-content: flex-end; margin: 1.5rem 0; }

@media (max-width: 480px) {
  .price-tier-row { flex-wrap: wrap; row-gap: 0.4rem; }
  .price-tier-label { flex-basis: 100%; }
  .price-tier-price, .price-tier-minutes, .price-tier-limit { flex: 1 1 0; min-width: 0; }
  .extras-grid { grid-template-columns: 1fr; }
}
</style>
