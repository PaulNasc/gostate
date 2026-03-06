import axios from 'axios';

const api = axios.create({ baseURL: '' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),
};

export const agentsApi = {
  list: () => api.get('/api/agents'),
  create: (name: string) => api.post('/api/agents', { name }),
  getToken: (id: string) => api.get(`/api/agents/${id}/token`),
  remove: (id: string) => api.delete(`/api/agents/${id}`),
  checkStatus: (id: string) => api.post(`/api/agents/${id}/check-status`),
  saveDeployConfig: (id: string, config: Record<string, string>) => api.put(`/api/agents/${id}/deploy-config`, config),
  getInstallCommand: (id: string) => api.get(`/api/agents/${id}/install-command`),
  updateCapabilities: (id: string, capabilities: Record<string, unknown>) => api.put(`/api/agents/${id}`, { capabilities }),
};

export const usersApi = {
  list: () => api.get('/api/users'),
  create: (data: { name: string; email: string; password: string; role: string }) =>
    api.post('/api/users', data),
  update: (id: string, data: Partial<{ name: string; email: string; password: string; role: string; active: boolean }>) =>
    api.put(`/api/users/${id}`, data),
  remove: (id: string) => api.delete(`/api/users/${id}`),
};

export const healthApi = {
  get: () => api.get('/api/health'),
};

export default api;
