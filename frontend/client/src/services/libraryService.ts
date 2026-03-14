import { apiCall, uploadFile } from './apiClient';
const B = '/api/v1/library';

export const libraryService = {
  listAssets: (page = 1, limit = 20, search?: string) => apiCall<{ success: boolean; data: unknown[] }>(`${B}/assets?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  getAsset: (id: string) => apiCall(`${B}/assets/${id}`),
  uploadAsset: (file: File, metadata?: Record<string, string>) => uploadFile(`${B}/assets`, file, metadata),
  deleteAsset: (id: string) => apiCall(`${B}/assets/${id}`, { method: 'DELETE' }),
  createTheme: (data: { name: string; colors?: unknown }) => apiCall(`${B}/themes`, { method: 'POST', body: data }),
  listThemes: () => apiCall(`${B}/themes`),
};
