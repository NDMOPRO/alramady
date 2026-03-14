import { apiCall, uploadFile } from './apiClient';
const B = '/api/v1/conversion';

export const conversionService = {
  convertFile: (file: File, targetFormat: string) => uploadFile<Blob>(`${B}/convert?target=${targetFormat}`, file),
  csvToExcel: (file: File) => uploadFile<Blob>(`${B}/csv-to-excel`, file),
  excelToCsv: (file: File) => uploadFile<Blob>(`${B}/excel-to-csv`, file),
  excelToPdf: (file: File) => uploadFile<Blob>(`${B}/excel-to-pdf`, file),
  pdfToWord: (file: File) => uploadFile<Blob>(`${B}/pdf-to-word`, file),
  wordToPdf: (file: File) => uploadFile<Blob>(`${B}/word-to-pdf`, file),
  markdownToHtml: (text: string) => apiCall(`${B}/markdown-to-html`, { method: 'POST', body: { text } }),
};
