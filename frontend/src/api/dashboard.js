import { api } from './http';

export const dashboardApi = {
  getSummary: (params) => api.get('/dashboard/summary', params),
  getOccupancy: (params) => api.get('/dashboard/occupancy', params),
  exportCsv: (params) => api.get('/dashboard/export.csv', params),
  getDaySchedule: (date) => api.get('/dashboard/day-schedule', { date }),
  getEmployeeStats: (params) => api.get('/dashboard/employees', params),
  getProductStats: (params) => api.get('/dashboard/products', params),
  getProductsOverview: () => api.get('/dashboard/products-overview'),
  getEmployeesOverview: () => api.get('/dashboard/employees-overview'),
  getExtrasOverview: () => api.get('/dashboard/extras-overview'),
};
