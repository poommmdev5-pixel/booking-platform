import { api } from './http';

export const extrasApi = {
  listPublic: () => api.get('/extras'),
  listAdmin: () => api.get('/extras/admin/all'),
  getAdmin: (id) => api.get(`/extras/admin/${id}`),
  create: (payload) => api.post('/extras', payload),
  update: (id, payload) => api.put(`/extras/${id}`, payload),
  setStatus: (id, status) => api.patch(`/extras/${id}/status`, { status }),
  remove: (id) => api.del(`/extras/${id}`),
  uploadImage: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload(`/extras/${id}/images`, form);
  },
  removeImage: (id, imageId) => api.del(`/extras/${id}/images/${imageId}`),
  setCoverImage: (id, imageId) => api.patch(`/extras/${id}/images/${imageId}/cover`, {}),
};
