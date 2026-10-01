import { api } from './http';

export const categoriesApi = {
  list: () => api.get('/categories'),
  getAdmin: (id) => api.get(`/categories/admin/${id}`),
  create: (payload) => api.post('/categories', payload),
  update: (id, payload) => api.put(`/categories/${id}`, payload),
  remove: (id) => api.del(`/categories/${id}`),
  uploadImage: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload(`/categories/${id}/image`, form);
  },
  removeImage: (id) => api.del(`/categories/${id}/image`),
};
