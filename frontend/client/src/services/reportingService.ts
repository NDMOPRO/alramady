import { apiCall } from './apiClient';
const B = '/api/v1/reporting';

export const reportingService = {
  listReports: (page = 1, limit = 20) => apiCall<{ success: boolean; data: unknown[] }>(`${B}/reports?page=${page}&limit=${limit}`),
  getReport: (id: string) => apiCall(`${B}/reports/${id}`),
  createReport: (data: { name: string; dataSources?: Array<{ datasetId: string }> }) => apiCall(`${B}/reports`, { method: 'POST', body: data }),
  addSection: (reportId: string, section: { type: string; position: number; content: unknown }) => apiCall(`${B}/reports/${reportId}/sections`, { method: 'POST', body: section }),
  buildReport: (reportId: string) => apiCall(`${B}/reports/${reportId}/build`, { method: 'POST' }),
  exportReport: (reportId: string, format: 'pdf' | 'docx' | 'html' = 'pdf') => apiCall<Blob>(`${B}/reports/${reportId}/export?format=${format}`),
  deleteReport: (id: string) => apiCall(`${B}/reports/${id}`, { method: 'DELETE' }),
  getTemplates: () => apiCall(`${B}/templates`),
};
