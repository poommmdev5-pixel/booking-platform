<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { categoriesApi } from '../../api/categories';
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

onMounted(async () => {
  if (props.id) {
    isEdit.value = true;
    categoryId.value = Number(props.id);
    const c = await categoriesApi.getAdmin(categoryId.value);
    code.value = c.code;
    bookingType.value = c.bookingType;
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
    } else {
      await categoriesApi.create(payload);
    }
    router.push({ name: 'admin-categories' });
  } catch (err) {
    error.value = err.message;
  }
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
</style>
