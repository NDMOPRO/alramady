import { apiCall } from './apiClient';
const B = '/api/v1/template';

export const templateService = {
  listTemplates: (type?: string) => apiCall<{ success: boolean; data: unknown[] }>(`${B}/templates${type ? `?type=${type}` : ''}`),
  getTemplate: (id: string) => apiCall(`${B}/templates/${id}`),
  createTemplate: (data: { name: string; type: string; content: unknown }) => apiCall(`${B}/templates`, { method: 'POST', body: data }),
  applyTemplate: (templateId: string, data: unknown) => apiCall(`${B}/templates/${templateId}/apply`, { method: 'POST', body: data }),
  deleteTemplate: (id: string) => apiCall(`${B}/templates/${id}`, { method: 'DELETE' }),
};
