<script setup>
import { useI18n } from 'vue-i18n';
import { SUPPORTED_LOCALES, setLocale } from '../i18n';

const { locale } = useI18n();
const labels = { th: '🇹🇭 ไทย', en: '🇬🇧 English', zh: '🇨🇳 中文' };

function onChange(event) {
  setLocale(event.target.value);
}
</script>

<template>
  <select class="lang-switcher" :value="locale" @change="onChange">
    <option v-for="l in SUPPORTED_LOCALES" :key="l" :value="l">{{ labels[l] }}</option>
  </select>
</template>

<style scoped>
.lang-switcher {
  width: auto;
  max-width: none;
  padding: 0.4rem 1.75rem 0.4rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  background-color: var(--color-primary-light, #eef2ff);
  border-color: transparent;
  color: var(--color-primary, #4f46e5);
}
</style>
