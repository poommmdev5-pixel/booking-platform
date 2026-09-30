<script setup>
import { useToast } from '../composables/useToast';

const { toasts, dismissToast } = useToast();

const ICONS = { success: '✓', error: '✕', info: 'ℹ' };
</script>

<template>
  <div class="toast-stack">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast-${t.type}`" @click="dismissToast(t.id)">
        <span class="toast-icon">{{ ICONS[t.type] || ICONS.info }}</span>
        <span class="toast-message">{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed; top: 1rem; right: 1rem; z-index: 9999;
  display: flex; flex-direction: column; gap: 0.5rem;
  width: min(360px, calc(100vw - 2rem));
}
.toast {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.7rem 0.9rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16), 0 1px 3px rgba(0, 0, 0, 0.08);
  font-size: 0.86rem; font-weight: 500; color: #1f2430;
  cursor: pointer;
}
.toast-icon {
  flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.72rem; font-weight: 700; color: #fff;
}
.toast-success .toast-icon { background: #34c759; }
.toast-error .toast-icon { background: #ff3b30; }
.toast-info .toast-icon { background: #4f46e5; }
.toast-message { flex: 1; line-height: 1.35; word-break: break-word; }

.toast-enter-active, .toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from { opacity: 0; transform: translateX(24px); }
.toast-leave-to { opacity: 0; transform: translateX(24px); }
.toast-leave-active { position: absolute; right: 0; }

@media (prefers-color-scheme: dark) {
  .toast {
    background: rgba(38, 38, 40, 0.85); border-color: rgba(255, 255, 255, 0.08); color: #f2f2f2;
  }
}
</style>
