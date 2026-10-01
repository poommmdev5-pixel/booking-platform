import { api } from './http';

export const customersApi = {
  me: () => api.get('/customers/me'),
};
