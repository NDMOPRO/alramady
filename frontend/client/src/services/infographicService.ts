import { apiCall } from './apiClient';
const B = '/api/v1/infographic';

export const infographicService = {
  listInfographics: (page = 1, limit = 20) => apiCall<{ success: boolean; data: unknown[] }>(`${B}/infographics?page=${page}&limit=${limit}`),
  getInfographic: (id: string) => apiCall(`${B}/infographics/${id}`),
  createInfographic: (data: { name: string; description?: string }) => apiCall(`${B}/infographics`, { method: 'POST', body: data }),
  aiGenerate: (data: { topic: string; style?: string }) => apiCall(`${B}/infographics/ai-generate`, { method: 'POST', body: data }),
  exportInfographic: (id: string, format: 'png' | 'svg' | 'pdf' = 'png') => apiCall<Blob>(`${B}/infographics/${id}/export?format=${format}`),
  deleteInfographic: (id: string) => apiCall(`${B}/infographics/${id}`, { method: 'DELETE' }),
};
