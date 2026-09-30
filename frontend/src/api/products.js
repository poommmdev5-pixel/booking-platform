import { api } from './http';

export const productsApi = {
  listPublic: (params) => api.get('/products', params),
  getPublic: (id) => api.get(`/products/${id}`),
  listAdmin: () => api.get('/products/admin/all'),
  getAdmin: (id) => api.get(`/products/admin/${id}`),
  create: (payload) => api.post('/products', payload),
  update: (id, payload) => api.put(`/products/${id}`, payload),
  setStatus: (id, status) => api.patch(`/products/${id}/status`, { status }),
  remove: (id) => api.del(`/products/${id}`),
  uploadImage: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload(`/products/${id}/images`, form);
  },
  removeImage: (id, imageId) => api.del(`/products/${id}/images/${imageId}`),
  setCoverImage: (id, imageId) => api.patch(`/products/${id}/images/${imageId}/cover`, {}),
};
