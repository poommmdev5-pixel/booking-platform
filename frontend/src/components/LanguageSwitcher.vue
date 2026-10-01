<script setup>
import { useI18n } from 'vue-i18n';
import { SUPPORTED_LOCALES, setLocale } from '../i18n';

const { locale } = useI18n();
// Flag emoji dropped deliberately: regional-indicator flags render as "tofu" placeholder
// boxes on a lot of Android/webview browsers (inconsistent font support, not an app bug),
// and the resulting glyphs can be wider than the real flag — on pages that position this
// switcher with `right: Npx` and no width cap (the admin/employee login screens), that
// extra width pushed the whole control off the left edge of narrow screens.
const labels = { th: 'ไทย', en: 'English', zh: '中文' };

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
  /* Hard cap so this never grows wide enough to push off-screen the two places that
     position it with `right: Npx` and nothing bounding its left edge (admin/employee login). */
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0.4rem 1.75rem 0.4rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  background-color: var(--color-primary-light, #eef2ff);
  border-color: transparent;
  color: var(--color-primary, #4f46e5);
}
</style>
