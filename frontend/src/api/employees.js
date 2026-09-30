import { api } from './http';

export const employeesApi = {
  listAdmin: () => api.get('/employees/admin/all'),
  getAdmin: (id) => api.get(`/employees/admin/${id}`),
  create: (payload) => api.post('/employees', payload),
  update: (id, payload) => api.put(`/employees/${id}`, payload),
  setStatus: (id, status) => api.patch(`/employees/${id}/status`, { status }),
  setCredentials: (id, password) => api.patch(`/employees/${id}/credentials`, { password }),
  revokeCredentials: (id) => api.del(`/employees/${id}/credentials`),
  remove: (id) => api.del(`/employees/${id}`),
  uploadImage: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload(`/employees/${id}/images`, form);
  },
  removeImage: (id, imageId) => api.del(`/employees/${id}/images/${imageId}`),
  setCoverImage: (id, imageId) => api.patch(`/employees/${id}/images/${imageId}/cover`, {}),
};
