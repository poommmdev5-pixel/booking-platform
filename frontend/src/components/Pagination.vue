<script setup>
defineProps({ page: { type: Number, required: true }, totalPages: { type: Number, required: true } });
const emit = defineEmits(['update:page']);
</script>

<template>
  <div v-if="totalPages > 1" class="pagination">
    <button type="button" class="page-btn" :disabled="page <= 1" @click="emit('update:page', page - 1)" :aria-label="$t('common.previousPage')">‹</button>
    <span class="page-info">{{ page }} / {{ totalPages }}</span>
    <button type="button" class="page-btn" :disabled="page >= totalPages" @click="emit('update:page', page + 1)" :aria-label="$t('common.nextPage')">›</button>
  </div>
</template>

<style scoped>
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.25rem;
}
.page-btn {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1;
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}
.page-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-light); }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-size: 0.85rem; font-weight: 600; color: var(--color-text-muted); min-width: 3.5rem; text-align: center; }
</style>
