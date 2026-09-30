<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { extrasApi } from '../../api/extras';
import ImageManager from '../../components/ImageManager.vue';
import BackButton from '../../components/BackButton.vue';

const props = defineProps({ id: { type: String, default: null } });
const router = useRouter();

const LOCALES = ['th', 'en', 'zh'];
const activeLocale = ref('th');
const isEdit = ref(false);
const extraId = ref(null);

const code = ref('');
const price = ref(0);
const translations = ref(LOCALES.map((locale) => ({ locale, name: '', description: '' })));
const images = ref([]);
const error = ref('');

onMounted(async () => {
  if (props.id) {
    isEdit.value = true;
    extraId.value = Number(props.id);
    const e = await extrasApi.getAdmin(extraId.value);
    code.value = e.code;
    price.value = Number(e.price);
    images.value = e.images || [];
    for (const locale of LOCALES) {
      const existing = e.translations.find((t) => t.locale === locale);
      const slot = translations.value.find((t) => t.locale === locale);
      if (existing) {
        slot.name = existing.name;
        slot.description = existing.description || '';
      }
    }
  }
});

async function save() {
  error.value = '';
  const payload = {
    price: price.value,
    translations: translations.value.filter((t) => t.name?.trim()),
  };
  try {
    if (isEdit.value) {
      const extra = await extrasApi.update(extraId.value, payload);
      images.value = extra.images || [];
    } else {
      // Set local state directly instead of relying on the route change to remount this
      // component (admin-extra-new -> admin-extra-edit reuse the same component instance,
      // so onMounted would never re-run and the Images section would stay hidden).
      const extra = await extrasApi.create(payload);
      isEdit.value = true;
      extraId.value = extra.id;
      code.value = extra.code;
      images.value = extra.images || [];
      router.replace({ name: 'admin-extra-edit', params: { id: extra.id } });
    }
  } catch (err) {
    error.value = err.message;
  }
}

async function uploadImage(file) {
  const img = await extrasApi.uploadImage(extraId.value, file);
  images.value.push(img);
}

async function setCover(img) {
  await extrasApi.setCoverImage(extraId.value, img.id);
  images.value = images.value.map((i) => ({ ...i, isCover: i.id === img.id }));
}

async function removeImage(img) {
  await extrasApi.removeImage(extraId.value, img.id);
  images.value = images.value.filter((i) => i.id !== img.id);
}
</script>

<template>
  <BackButton :to="{ name: 'admin-extras' }" />
  <h1>{{ $t(isEdit ? 'admin.editExtra' : 'admin.addExtra') }}</h1>
  <div class="grid">
    <div class="card">
      <label v-if="isEdit">{{ $t('admin.code') }}<input :value="code" disabled /></label>
      <label>{{ $t('admin.priceLabel') }}<input type="number" v-model.number="price" /></label>
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
          <label>{{ $t('admin.description') }}<textarea rows="4" v-model="tr.description"></textarea></label>
        </template>
      </template>
    </div>
  </div>

  <p v-if="error" class="error">{{ error }}</p>
  <div class="save-bar">
    <button class="btn" @click="save">{{ $t('admin.save') }}</button>
  </div>

  <h2>{{ $t('admin.images') }}</h2>
  <div class="card">
    <ImageManager v-if="isEdit && extraId" :images="images" :max="5" :on-upload="uploadImage" :on-set-cover="setCover" :on-remove="removeImage" />
    <p v-else class="save-first-hint">{{ $t('admin.saveFirstForImages') }}</p>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; }
@media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
label input, label select, label textarea { max-width: none; }
label input:disabled { background: #f1f5f9; color: var(--color-text-muted); }
.save-first-hint { font-size: 0.85rem; color: var(--color-text-muted); margin: 0; }
.tabs { display: flex; gap: 0.35rem; margin-bottom: 1rem; background: #f1f5f9; padding: 0.3rem; border-radius: var(--radius-sm); width: fit-content; }
.tabs button { padding: 0.4rem 0.9rem; border: none; background: transparent; border-radius: 6px; font-weight: 600; font-size: 0.85rem; color: var(--color-text-muted); }
.tabs button.active { background: #fff; color: var(--color-primary); box-shadow: var(--shadow-sm); }
.save-bar { display: flex; justify-content: flex-end; margin: 1.5rem 0; }
</style>
