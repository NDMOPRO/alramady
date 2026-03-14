import { apiCall } from './apiClient';
const B = '/api/v1/render';

export const renderingService = {
  preview: (data: { templateId?: string; format?: string; width?: number; height?: number; data?: unknown }) => apiCall(`${B}/preview`, { method: 'POST', body: data }),
  validate: (id: string) => apiCall(`${B}/validate/${id}`),
  status: (jobId: string) => apiCall(`${B}/status/${jobId}`),
};
