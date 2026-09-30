import { ref } from 'vue';

const toasts = ref([]);
let nextId = 1;

// macOS-style notification: caller picks the type, the toast auto-dismisses on its own.
function showToast(message, type = 'info', duration = 4000) {
  const id = nextId++;
  toasts.value.push({ id, message, type });
  setTimeout(() => dismissToast(id), duration);
  return id;
}

function dismissToast(id) {
  const idx = toasts.value.findIndex((t) => t.id === id);
  if (idx !== -1) toasts.value.splice(idx, 1);
}

export function useToast() {
  return { toasts, showToast, dismissToast };
}
