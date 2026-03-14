import { apiCall, uploadFile } from './apiClient';
const B = '/api/v1/excel';

export const excelService = {
  listWorkbooks: (page = 1, limit = 20) => apiCall<{ success: boolean; data: unknown[] }>(`${B}/workbooks?page=${page}&limit=${limit}`),
  getWorkbook: (id: string) => apiCall(`${B}/workbooks/${id}`),
  getSheetData: (workbookId: string, sheetIndex = 0) => apiCall(`${B}/workbooks/${workbookId}/sheets/${sheetIndex}`),
  uploadWorkbook: (file: File) => uploadFile(`${B}/workbooks/import`, file),
  updateCells: (workbookId: string, cells: Array<{ row: number; col: number; value: string }>) => apiCall(`${B}/workbooks/${workbookId}/cells`, { method: 'PATCH', body: { cells } }),
  exportWorkbook: (id: string, format: 'xlsx' | 'csv' = 'xlsx') => apiCall<Blob>(`${B}/workbooks/${id}/export?format=${format}`),
};
