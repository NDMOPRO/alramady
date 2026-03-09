import { api } from '@/lib/api';

// --- Interfaces ---

export interface PresentationSummary {
  id: string;
  title: string;
  slideCount: number;
  status: 'draft' | 'generating' | 'ready' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface Slide {
  id: string;
  order: number;
  layout: string;
  content: Record<string, unknown>;
  notes: string;
  transition: string;
}

export interface Presentation {
  id: string;
  title: string;
  description: string;
  slides: Slide[];
  theme: PresentationTheme;
  status: PresentationSummary['status'];
  createdAt: string;
  updatedAt: string;
}

export interface PresentationTheme {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  direction: 'rtl' | 'ltr';
}

export interface CreatePresentationInput {
  title: string;
  description?: string;
  theme?: Partial<PresentationTheme>;
  dataSourceIds?: string[];
}

export interface UpdatePresentationInput {
  title?: string;
  description?: string;
  theme?: Partial<PresentationTheme>;
}

export interface AddSlideInput {
  layout: string;
  content: Record<string, unknown>;
  notes?: string;
  transition?: string;
  position?: number;
}

export interface UpdateSlideInput {
  layout?: string;
  content?: Record<string, unknown>;
  notes?: string;
  transition?: string;
}

export interface GeneratePresentationInput {
  prompt: string;
  dataSourceIds: string[];
  slideCount?: number;
  language?: 'ar' | 'en';
  style?: 'corporate' | 'creative' | 'minimal';
}

export interface QrShareOptions {
  expiresInHours?: number;
  password?: string;
}

export interface QrShareResult {
  shareUrl: string;
  qrCodeDataUrl: string;
  expiresAt: string;
}

export interface PasswordProtectInput {
  password: string;
}

export interface VideoExportOptions {
  resolution: '720p' | '1080p' | '4k';
  transitionDuration?: number;
  slideDuration?: number;
  narration?: boolean;
}

export interface VideoExportResult {
  jobId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  url?: string;
}

export interface LiveSessionResult {
  sessionId: string;
  presenterUrl: string;
  audienceUrl: string;
}

export interface HtmlExportResult {
  url: string;
  expiresAt: string;
}

export interface ExportResult {
  url: string;
  expiresAt: string;
}

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

interface ApiOk {
  success: boolean;
}

// --- API ---

export const presentationsApi = {
  // Presentation CRUD
  list: () =>
    api.get<ApiSuccess<PresentationSummary[]>>('/api/v1/presentations'),

  get: (id: string) =>
    api.get<ApiSuccess<Presentation>>(`/api/v1/presentations/${id}`),

  create: (input: CreatePresentationInput) =>
    api.post<ApiSuccess<Presentation>>('/api/v1/presentations', input),

  update: (id: string, input: UpdatePresentationInput) =>
    api.patch<ApiSuccess<Presentation>>(`/api/v1/presentations/${id}`, input),

  remove: (id: string) =>
    api.del<ApiOk>(`/api/v1/presentations/${id}`),

  duplicate: (id: string) =>
    api.post<ApiSuccess<Presentation>>(`/api/v1/presentations/${id}/duplicate`, {}),

  // AI Generation
  generate: (input: GeneratePresentationInput) =>
    api.post<ApiSuccess<Presentation>>('/api/v1/presentations/generate', input),

  // Slides
  addSlide: (presentationId: string, input: AddSlideInput) =>
    api.post<ApiSuccess<Slide>>(`/api/v1/presentations/${presentationId}/slides`, input),

  updateSlide: (presentationId: string, slideId: string, input: UpdateSlideInput) =>
    api.patch<ApiSuccess<Slide>>(`/api/v1/presentations/${presentationId}/slides/${slideId}`, input),

  removeSlide: (presentationId: string, slideId: string) =>
    api.del<ApiOk>(`/api/v1/presentations/${presentationId}/slides/${slideId}`),

  reorderSlides: (presentationId: string, slideIds: string[]) =>
    api.put<ApiOk>(`/api/v1/presentations/${presentationId}/slides/reorder`, { slideIds }),

  // QR Sharing
  generateQr: (id: string, options?: QrShareOptions) =>
    api.post<ApiSuccess<QrShareResult>>(`/api/v1/presentations/${id}/qr`, options ?? {}),

  // Password Protection
  setPassword: (id: string, input: PasswordProtectInput) =>
    api.post<ApiOk>(`/api/v1/presentations/${id}/password`, input),

  removePassword: (id: string) =>
    api.del<ApiOk>(`/api/v1/presentations/${id}/password`),

  // Video Export
  exportVideo: (id: string, options: VideoExportOptions) =>
    api.post<ApiSuccess<VideoExportResult>>(`/api/v1/presentations/${id}/export/video`, options),

  getVideoStatus: (id: string, jobId: string) =>
    api.get<ApiSuccess<VideoExportResult>>(`/api/v1/presentations/${id}/export/video/${jobId}`),

  // Live Session
  startLiveSession: (id: string) =>
    api.post<ApiSuccess<LiveSessionResult>>(`/api/v1/presentations/${id}/live`, {}),

  endLiveSession: (id: string, sessionId: string) =>
    api.del<ApiOk>(`/api/v1/presentations/${id}/live/${sessionId}`),

  // HTML Export
  exportHtml: (id: string) =>
    api.post<ApiSuccess<HtmlExportResult>>(`/api/v1/presentations/${id}/export/html`, {}),

  // Standard Export (PDF/PPTX)
  exportFile: (id: string, format: 'pdf' | 'pptx') =>
    api.post<ApiSuccess<ExportResult>>(`/api/v1/presentations/${id}/export/${format}`, {}),
};
