import { api } from './http';

export const paymentsApi = {
  getConfig: () => api.get('/payments/config'),
  // Silenced: these fire on every deposit/full switch and on payment confirmation, both of
  // which already have their own dedicated in-flow UI (the payment element, the "✓ paid"
  // result card) — a generic "Saved" toast on top is redundant at best, and outright
  // misleading during a switch, since nothing was actually saved yet.
  createIntent: (payload) => api.post('/payments/create-intent', payload, undefined, { silent: true }),
  confirm: (payload) => api.post('/payments/confirm', payload, undefined, { silent: true }),
};
