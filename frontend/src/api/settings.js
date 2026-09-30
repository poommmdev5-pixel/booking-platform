import { api } from './http';

export const settingsApi = {
  getBookingPolicy: () => api.get('/settings/booking-policy'),
  setBookingPolicy: (payload) => api.put('/settings/booking-policy', payload),
  getBookingPolicyPublic: () => api.get('/settings/booking-policy/public'),
  getBusinessInfo: () => api.get('/settings/business-info'),
  setBusinessInfo: (payload) => api.put('/settings/business-info', payload),
  getPublicBusinessInfo: () => api.get('/settings/business-info/public'),
  getPaymentPolicy: () => api.get('/settings/payment-policy'),
  setPaymentPolicy: (payload) => api.put('/settings/payment-policy', payload),
  getNotificationPolicy: () => api.get('/settings/notification-policy'),
  setNotificationPolicy: (payload) => api.put('/settings/notification-policy', payload),
};
