import { computed, ref, watch } from 'vue';

// Client-side pagination over an already-fetched list. Resets to page 1 whenever the
// source list is replaced with a different length (new filter/search results) so a
// filtered-down list never leaves the view stuck on a page that no longer exists.
export function usePagination(itemsRef, pageSize = 5) {
  const page = ref(1);

  const totalPages = computed(() => Math.max(1, Math.ceil((itemsRef.value?.length || 0) / pageSize)));

  const pageItems = computed(() => {
    const start = (page.value - 1) * pageSize;
    return (itemsRef.value || []).slice(start, start + pageSize);
  });

  watch(
    () => itemsRef.value?.length,
    () => {
      if (page.value > totalPages.value) page.value = totalPages.value;
    },
  );

  function reset() {
    page.value = 1;
  }

  return { page, totalPages, pageItems, reset };
}
