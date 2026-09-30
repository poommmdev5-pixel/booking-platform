import { api } from './http';

export const calendarApi = {
  getStayCalendar: (productId, month) => api.get(`/calendar/products/${productId}/stay-calendar`, { month }),
  getStaySessionEmployees: (productId, date, timeStart, timeEnd) =>
    api.get(`/calendar/products/${productId}/stay-session/employees`, { date, timeStart, timeEnd }),
  getStayCalendarAdmin: (productId, month) => api.get(`/calendar/products/${productId}/stay-calendar/admin`, { month }),
  saveStayDay: (productId, dto) => api.post(`/calendar/products/${productId}/stay-calendar/days`, dto),
  clearStayDay: (productId, date) => api.del(`/calendar/products/${productId}/stay-calendar/days/${date}`),
  openStayMonth: (productId, month) => api.post(`/calendar/products/${productId}/stay-calendar/months`, { month }),
  closeStayMonth: (productId, month) => api.del(`/calendar/products/${productId}/stay-calendar/months/${month}`),

  getSessionDates: (productId) => api.get(`/calendar/products/${productId}/session-dates`),
  getAvailableSessions: (productId, date) => api.get(`/calendar/products/${productId}/sessions`, { date }),
  getSessionEmployees: (productId, sessionId) => api.get(`/calendar/products/${productId}/sessions/${sessionId}/employees`),
  listSessionsAdmin: (productId) => api.get(`/calendar/products/${productId}/sessions/admin`),
  createSession: (productId, dto) => api.post(`/calendar/products/${productId}/sessions`, dto),
  removeSession: (productId, sessionId) => api.del(`/calendar/products/${productId}/sessions/${sessionId}`),
};
