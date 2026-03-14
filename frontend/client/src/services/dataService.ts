import { apiCall, uploadFile } from './apiClient';
const B = '/api/v1/data';

export const dataService = {
  listDatasets: (page = 1, limit = 20) => apiCall<{ success: boolean; data: unknown[]; pagination?: unknown }>(`${B}/datasets?page=${page}&limit=${limit}`),
  getDataset: (id: string) => apiCall(`${B}/datasets/${id}`),
  getDatasetRows: (id: string, page = 1, limit = 50) => apiCall(`${B}/datasets/${id}/rows?page=${page}&limit=${limit}`),
  getDatasetColumns: (id: string) => apiCall(`${B}/datasets/${id}/columns`),
  importDataset: (file: File) => uploadFile(`${B}/datasets/import`, file),
  deleteDataset: (id: string) => apiCall(`${B}/datasets/${id}`, { method: 'DELETE' }),
  searchDatasets: (query: string) => apiCall(`${B}/datasets/search?q=${encodeURIComponent(query)}`),
};
