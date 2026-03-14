import { createApiClient } from './client';

const renderingApi = createApiClient('/api/v1/render');

export interface RenderPreviewParams {
  templateId?: string;
  format?: 'png' | 'pdf' | 'svg';
  width?: number;
  height?: number;
  data?: Record<string, unknown>;
}

export interface RenderJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  error?: string;
  createdAt: string;
}

export async function renderPreview(params: RenderPreviewParams): Promise<RenderJob> {
  const response = await renderingApi.post('/preview', params);
  return (response.data.data || response.data) as RenderJob;
}

export async function validateRender(id: string): Promise<{ valid: boolean; errors: string[] }> {
  const response = await renderingApi.get(`/validate/${id}`);
  return (response.data.data || response.data) as { valid: boolean; errors: string[] };
}

export async function getRenderStatus(jobId: string): Promise<RenderJob> {
  const response = await renderingApi.get(`/status/${jobId}`);
  return (response.data.data || response.data) as RenderJob;
}
