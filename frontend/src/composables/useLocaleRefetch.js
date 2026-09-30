import { watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Every API call already sends the active locale (see api/http.js), so the backend
// returns correctly-translated content on each request — but a page that only fetches
// once in onMounted keeps showing whatever locale was active at that moment. This re-runs
// `fetchFn` whenever the language switcher changes locale, so already-loaded
// database-backed content (product/category/extra names & descriptions) updates in place
// without disturbing any other local state (selections, cart, form inputs, etc.).
export function useLocaleRefetch(fetchFn) {
  const { locale } = useI18n();
  watch(locale, () => {
    fetchFn();
  });
}
