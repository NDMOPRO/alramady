import { apiCall } from './apiClient';
const B = '/api/v1/dashboard';

export const dashboardService = {
  listDashboards: (page = 1, limit = 20) => apiCall<{ success: boolean; data: unknown[] }>(`${B}/dashboards?page=${page}&limit=${limit}`),
  getDashboard: (id: string) => apiCall(`${B}/dashboards/${id}`),
  createDashboard: (data: { name: string; datasetId?: string }) => apiCall(`${B}/dashboards`, { method: 'POST', body: data }),
  analyzeDataset: (datasetId: string) => apiCall(`${B}/analyze/${datasetId}`, { method: 'POST' }),
  deleteDashboard: (id: string) => apiCall(`${B}/dashboards/${id}`, { method: 'DELETE' }),
};
