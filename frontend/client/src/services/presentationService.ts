import { apiCall, uploadFile } from './apiClient';
const B = '/api/v1/presentation';

export const presentationService = {
  listPresentations: (page = 1, limit = 20) => apiCall<{ success: boolean; data: unknown[] }>(`${B}/presentations?page=${page}&limit=${limit}`),
  getPresentation: (id: string) => apiCall(`${B}/presentations/${id}`),
  createPresentation: (data: { name: string; style?: string; slideCount?: number }) => apiCall(`${B}/presentations`, { method: 'POST', body: data }),
  generateFromData: (data: { datasetId: string; slideCount?: number; style?: string }) => apiCall(`${B}/presentations/generate/data`, { method: 'POST', body: data }),
  generateFromAi: (data: { text: string; slideCount?: number; language?: string; style?: string }) => apiCall(`${B}/presentations/generate/ai`, { method: 'POST', body: data }),
  generateFromFile: (file: File, options?: Record<string, string>) => uploadFile(`${B}/presentations/generate/file`, file, options),
  exportPresentation: (id: string, format: 'pptx' | 'pdf' = 'pptx') => apiCall<Blob>(`${B}/presentations/${id}/export?format=${format}`),
  deletePresentation: (id: string) => apiCall(`${B}/presentations/${id}`, { method: 'DELETE' }),
};
