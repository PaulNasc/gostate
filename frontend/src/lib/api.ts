import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gostate:token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('gostate:token');
      localStorage.removeItem('gostate:user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) => api.post('/api/auth/login', { email, password }),
  me: () => api.get('/api/auth/me'),
};

export const usersApi = {
  list: () => api.get('/api/users'),
  create: (data: any) => api.post('/api/users', data),
  update: (id: string, data: any) => api.put(`/api/users/${id}`, data),
  remove: (id: string) => api.delete(`/api/users/${id}`),
};

export const projectsApi = {
  list: () => api.get('/api/projects'),
  create: (data: any) => api.post('/api/projects', data),
  get: (id: string) => api.get(`/api/projects/${id}`),
  update: (id: string, data: any) => api.put(`/api/projects/${id}`, data),
  remove: (id: string) => api.delete(`/api/projects/${id}`),
};

export const suitesApi = {
  list: (projectId: string) => api.get(`/api/projects/${projectId}/suites`),
  create: (projectId: string, data: any) => api.post(`/api/projects/${projectId}/suites`, data),
  update: (projectId: string, suiteId: string, data: any) => api.put(`/api/projects/${projectId}/suites/${suiteId}`, data),
  remove: (projectId: string, suiteId: string) => api.delete(`/api/projects/${projectId}/suites/${suiteId}`),
};

export const testcasesApi = {
  list: (suiteId: string) => api.get(`/api/suites/${suiteId}/testcases`),
  create: (suiteId: string, data: any) => api.post(`/api/suites/${suiteId}/testcases`, data),
  get: (suiteId: string, tcId: string) => api.get(`/api/suites/${suiteId}/testcases/${tcId}`),
  update: (suiteId: string, tcId: string, data: any) => api.put(`/api/suites/${suiteId}/testcases/${tcId}`, data),
  remove: (suiteId: string, tcId: string) => api.delete(`/api/suites/${suiteId}/testcases/${tcId}`),
  versions: (suiteId: string, tcId: string) => api.get(`/api/suites/${suiteId}/testcases/${tcId}/versions`),
};

export const scriptsApi = {
  list: (projectId?: string) => api.get('/api/scripts', { params: projectId ? { project_id: projectId } : {} }),
  create: (data: any) => api.post('/api/scripts', data),
  get: (id: string) => api.get(`/api/scripts/${id}`),
  update: (id: string, data: any) => api.put(`/api/scripts/${id}`, data),
  remove: (id: string) => api.delete(`/api/scripts/${id}`),
};

export const agentsApi = {
  list: () => api.get('/api/agents'),
  create: (data: any) => api.post('/api/agents', data),
  get: (id: string) => api.get(`/api/agents/${id}`),
  getToken: (id: string) => api.get(`/api/agents/${id}/token`),
  update: (id: string, data: any) => api.put(`/api/agents/${id}`, data),
  remove: (id: string) => api.delete(`/api/agents/${id}`),
  checkStatus: (id: string) => api.post(`/api/agents/${id}/check-status`),
};

export const executionsApi = {
  list: (params?: any) => api.get('/api/executions', { params }),
  create: (data: any) => api.post('/api/executions', data),
  get: (id: string) => api.get(`/api/executions/${id}`),
  getLogs: (id: string) => api.get(`/api/executions/${id}/logs`),
  cancel: (id: string) => api.post(`/api/executions/${id}/cancel`),
};

export const statsApi = {
  get: () => api.get('/api/stats'),
};

export const schedulesApi = {
  list: () => api.get('/api/schedules'),
  create: (data: any) => api.post('/api/schedules', data),
  update: (id: string, data: any) => api.patch(`/api/schedules/${id}`, data),
  remove: (id: string) => api.delete(`/api/schedules/${id}`),
};

export const integrationsApi = {
  list: () => api.get('/api/integrations'),
  create: (data: any) => api.post('/api/integrations', data),
  update: (id: string, data: any) => api.patch(`/api/integrations/${id}`, data),
  remove: (id: string) => api.delete(`/api/integrations/${id}`),
  test: (id: string) => api.post(`/api/integrations/${id}/test`),
};

export const testPlansApi = {
  list: (projectId: string) => api.get('/api/test-plans', { params: { project_id: projectId } }),
  get: (id: string) => api.get(`/api/test-plans/${id}`),
  create: (data: any) => api.post('/api/test-plans', data),
  update: (id: string, data: any) => api.put(`/api/test-plans/${id}`, data),
  remove: (id: string) => api.delete(`/api/test-plans/${id}`),
  run: (id: string, data?: any) => api.post(`/api/test-plans/${id}/runs`, data || {}),
  retry: (id: string, data?: any) => api.post(`/api/test-plans/${id}/runs/retry`, data || {}),
  latestRun: (id: string) => api.get(`/api/test-plans/${id}/runs/latest`),
};
