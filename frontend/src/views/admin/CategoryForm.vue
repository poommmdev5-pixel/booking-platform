<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { categoriesApi } from '../../api/categories';
import ImageManager from '../../components/ImageManager.vue';
import BackButton from '../../components/BackButton.vue';

const { t } = useI18n();

const props = defineProps({ id: { type: String, default: null } });
const router = useRouter();

const LOCALES = ['th', 'en', 'zh'];
const activeLocale = ref('th');
const isEdit = ref(false);
const categoryId = ref(null);

const code = ref('');
const bookingType = ref('stay');
const translations = ref(LOCALES.map((locale) => ({ locale, name: '' })));
const error = ref('');
// A category shows at most one image, but ImageManager expects a list — so this holds
// 0 or 1 items, shaped like a product image (isCover always true since there's only one,
// which also keeps ImageManager from ever showing its "set as cover" button).
const images = ref([]);

function toImageList(image) {
  return image ? [{ id: 'category-image', urlThumbnail: image.urlThumbnail, isCover: true }] : [];
}

onMounted(async () => {
  if (props.id) {
    isEdit.value = true;
    categoryId.value = Number(props.id);
    const c = await categoriesApi.getAdmin(categoryId.value);
    code.value = c.code;
    bookingType.value = c.bookingType;
    images.value = toImageList(c.image);
    for (const locale of LOCALES) {
      const existing = c.translations.find((t) => t.locale === locale);
      const slot = translations.value.find((t) => t.locale === locale);
      if (existing) slot.name = existing.name;
    }
  }
});

async function save() {
  error.value = '';
  if (!code.value.trim()) {
    error.value = t('admin.codeRequired');
    return;
  }
  const payload = {
    code: code.value.trim(),
    bookingType: bookingType.value,
    translations: translations.value.filter((t) => t.name?.trim()),
  };
  try {
    if (isEdit.value) {
      await categoriesApi.update(categoryId.value, payload);
      router.push({ name: 'admin-categories' });
    } else {
      // Stay on this form instead of navigating away, so the image uploader (which needs
      // a category id to exist) can appear immediately after the first save.
      const category = await categoriesApi.create(payload);
      isEdit.value = true;
      categoryId.value = category.id;
      router.replace({ name: 'admin-category-edit', params: { id: category.id } });
    }
  } catch (err) {
    error.value = err.message;
  }
}

async function uploadImage(file) {
  const img = await categoriesApi.uploadImage(categoryId.value, file);
  images.value = toImageList(img);
}

async function removeImage() {
  await categoriesApi.removeImage(categoryId.value);
  images.value = [];
}
</script>

<template>
  <BackButton :to="{ name: 'admin-categories' }" />
  <h1>{{ $t(isEdit ? 'admin.editCategory' : 'admin.addCategory') }}</h1>
  <div class="card form-card">
    <label>{{ $t('admin.code') }}<input v-model="code" required /></label>
    <label>{{ $t('admin.bookingType') }}
      <select v-model="bookingType">
        <option value="stay">{{ $t('admin.bookingTypeStay') }}</option>
        <option value="session">{{ $t('admin.bookingTypeSession') }}</option>
        <option value="stay_session">{{ $t('admin.bookingTypeStaySession') }}</option>
      </select>
    </label>

    <div class="tabs">
      <button v-for="l in LOCALES" :key="l" type="button" :class="{ active: activeLocale === l }" @click="activeLocale = l">
        {{ l.toUpperCase() }}<span v-if="l === 'th'"> *</span>
      </button>
    </div>
    <template v-for="tr in translations" :key="tr.locale">
      <label v-if="tr.locale === activeLocale">{{ $t('admin.name') }}<input v-model="tr.name" /></label>
    </template>

    <label class="image-label">{{ $t('admin.categoryImage') }}</label>
    <ImageManager
      v-if="isEdit && categoryId"
      :images="images"
      :max="1"
      :on-upload="uploadImage"
      :on-set-cover="() => {}"
      :on-remove="removeImage"
    />
    <p v-else class="hint">{{ $t('admin.saveBeforeImage') }}</p>

    <p v-if="error" class="error">{{ error }}</p>
    <div class="save-bar">
      <router-link :to="{ name: 'admin-categories' }" class="btn btn-secondary">{{ $t('common.cancel') }}</router-link>
      <button class="btn" @click="save">{{ $t('admin.save') }}</button>
    </div>
  </div>
</template>

<style scoped>
.form-card { max-width: 420px; }
.form-card input, .form-card select { max-width: none; }
.tabs { display: flex; gap: 0.35rem; margin: 1rem 0 0.25rem; background: #f1f5f9; padding: 0.3rem; border-radius: var(--radius-sm); width: fit-content; }
.tabs button { padding: 0.4rem 0.9rem; border: none; background: transparent; border-radius: 6px; font-weight: 600; font-size: 0.85rem; color: var(--color-text-muted); }
.tabs button.active { background: #fff; color: var(--color-primary); box-shadow: var(--shadow-sm); }
.save-bar { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.25rem; }
.image-label { display: block; font-weight: 600; font-size: 0.9rem; margin: 1.25rem 0 0.5rem; }
.hint { font-size: 0.85rem; color: var(--color-text-muted); }
</style>
