<script setup>
import { useRouter } from 'vue-router';

const props = defineProps({ to: { type: [Object, String], required: true }, label: { type: String, default: '' } });
const router = useRouter();

function go() {
  router.push(props.to);
}
</script>

<template>
  <button type="button" class="back-btn" @click="go">
    <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z" /></svg>
    <span>{{ label || $t('common.back') }}</span>
  </button>
</template>

<style scoped>
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 0.84rem;
  font-family: inherit;
  padding: 0.45rem 0.9rem 0.45rem 0.7rem;
  border-radius: 999px;
  cursor: pointer;
  margin-bottom: 1rem;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}
.back-btn svg { width: 16px; height: 16px; fill: currentColor; flex-shrink: 0; }
.back-btn:hover { background: var(--color-primary-light); color: var(--color-primary); border-color: var(--color-primary-light); }
.back-btn:active { transform: scale(0.96); }
</style>
