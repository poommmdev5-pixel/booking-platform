import { api } from './http';

export const bookingsApi = {
  create: (payload) => api.post('/bookings', payload),
  lookup: (reference, email) => api.get('/bookings/lookup', { reference, email }),
  cancelGuest: (payload) => api.post('/bookings/lookup/cancel', payload),
  rescheduleGuest: (payload) => api.post('/bookings/lookup/reschedule', payload),
  myBookings: () => api.get('/bookings/me'),
  // Silenced: the response can mean "cancelled" or "request submitted, pending approval" —
  // two very different outcomes a generic "Saved" toast can't distinguish. The caller shows
  // its own message based on `pending` in the response instead.
  cancelMine: (id, reason) => api.patch(`/bookings/me/${id}/cancel`, { reason }, { silent: true }),
  rescheduleMine: (id, payload) => api.patch(`/bookings/me/${id}/reschedule`, payload, { silent: true }),
  listAdmin: (params) => api.get('/bookings', params),
  getAdmin: (id) => api.get(`/bookings/${id}`),
  setStatus: (id, status) => api.patch(`/bookings/${id}/status`, { status }),
  cancelAdmin: (id, reason) => api.patch(`/bookings/${id}/cancel`, { reason }),
  settleBalance: (id) => api.post(`/bookings/${id}/settle-balance`),
  listChangeRequests: (status) => api.get('/bookings/change-requests', { status }),
  approveChangeRequest: (id, note) => api.post(`/bookings/change-requests/${id}/approve`, { note }),
  rejectChangeRequest: (id, note) => api.post(`/bookings/change-requests/${id}/reject`, { note }),
};
