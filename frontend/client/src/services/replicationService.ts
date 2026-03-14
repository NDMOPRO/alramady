import { apiCall, uploadFile } from './apiClient';
const B = '/api/v1/replication';

export const replicationService = {
  analyzeImage: (file: File) => uploadFile(`${B}/analyze-visual`, file),
  compareImages: (file1: File, file2: File) => {
    const form = new FormData();
    form.append('original', file1);
    form.append('replica', file2);
    return apiCall(`${B}/compare-visual`, { method: 'POST', body: form, isFormData: true });
  },
  reconstructDashboard: (file: File) => uploadFile(`${B}/reconstruct-dashboard`, file),
};
