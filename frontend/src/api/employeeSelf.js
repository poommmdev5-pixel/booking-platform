import { api } from './http';

export const employeeSelfApi = {
  getMe: () => api.get('/employee/me'),
  updateMe: (payload) => api.patch('/employee/me', payload),
  getSchedule: (date) => api.get('/employee/me/schedule', { date }),
  uploadImage: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload('/employee/me/images', form);
  },
  removeImage: (imageId) => api.del(`/employee/me/images/${imageId}`),
  setCoverImage: (imageId) => api.patch(`/employee/me/images/${imageId}/cover`, {}),
};
