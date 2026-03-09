import { api } from '@/lib/api';

// --- Interfaces ---

export interface ReportSummary {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'generating' | 'ready' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface ReportSection {
  id: string;
  type: 'text' | 'chart' | 'table' | 'image' | 'page-break';
  title: string;
  content: Record<string, unknown>;
  order: number;
}

export interface Report {
  id: string;
  title: string;
  description: string;
  status: ReportSummary['status'];
  sections: ReportSection[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportInput {
  title: string;
  description?: string;
  templateId?: string;
  dataSourceIds?: string[];
}

export interface UpdateReportInput {
  title?: string;
  description?: string;
  sections?: Omit<ReportSection, 'id'>[];
}

export interface GenerateReportInput {
  prompt: string;
  dataSourceIds: string[];
  language?: 'ar' | 'en';
  format?: 'detailed' | 'summary' | 'executive';
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  category: string;
}

export interface ReportExportOptions {
  format: 'pdf' | 'docx' | 'html' | 'pptx';
  includeCharts?: boolean;
  watermark?: string;
}

export interface ExportResult {
  url: string;
  expiresAt: string;
}

export interface ScheduleInput {
  reportId: string;
  cron: string;
  recipients: string[];
  format: ReportExportOptions['format'];
}

export interface Schedule {
  id: string;
  reportId: string;
  cron: string;
  recipients: string[];
  format: string;
  nextRunAt: string;
  active: boolean;
}

export interface SmsDeliveryInput {
  phoneNumbers: string[];
  message?: string;
  includeLink?: boolean;
  format?: ReportExportOptions['format'];
}

export interface SmsDeliveryResult {
  deliveredCount: number;
  failedCount: number;
  failures?: { phone: string; reason: string }[];
}

export interface VisualRegressionInput {
  baselineReportId?: string;
  sections?: string[];
  threshold?: number;
}

export interface VisualRegressionResult {
  jobId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  diffs?: {
    sectionId: string;
    diffPercentage: number;
    diffImageUrl: string;
    passed: boolean;
  }[];
}

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

interface ApiOk {
  success: boolean;
}

// --- API ---

export const reportsApi = {
  // Report CRUD
  list: () =>
    api.get<ApiSuccess<ReportSummary[]>>('/api/v1/reports'),

  get: (id: string) =>
    api.get<ApiSuccess<Report>>(`/api/v1/reports/${id}`),

  create: (input: CreateReportInput) =>
    api.post<ApiSuccess<Report>>('/api/v1/reports', input),

  update: (id: string, input: UpdateReportInput) =>
    api.patch<ApiSuccess<Report>>(`/api/v1/reports/${id}`, input),

  remove: (id: string) =>
    api.del<ApiOk>(`/api/v1/reports/${id}`),

  duplicate: (id: string) =>
    api.post<ApiSuccess<Report>>(`/api/v1/reports/${id}/duplicate`, {}),

  // AI Generation
  generate: (input: GenerateReportInput) =>
    api.post<ApiSuccess<Report>>('/api/v1/reports/generate', input),

  // Templates
  listTemplates: () =>
    api.get<ApiSuccess<ReportTemplate[]>>('/api/v1/reports/templates'),

  // Export
  exportReport: (id: string, options: ReportExportOptions) =>
    api.post<ApiSuccess<ExportResult>>(`/api/v1/reports/${id}/export`, options),

  // Scheduling
  listSchedules: (reportId: string) =>
    api.get<ApiSuccess<Schedule[]>>(`/api/v1/reports/${reportId}/schedules`),

  createSchedule: (input: ScheduleInput) =>
    api.post<ApiSuccess<Schedule>>(`/api/v1/reports/${input.reportId}/schedules`, input),

  updateSchedule: (reportId: string, scheduleId: string, input: Partial<ScheduleInput>) =>
    api.patch<ApiSuccess<Schedule>>(`/api/v1/reports/${reportId}/schedules/${scheduleId}`, input),

  removeSchedule: (reportId: string, scheduleId: string) =>
    api.del<ApiOk>(`/api/v1/reports/${reportId}/schedules/${scheduleId}`),

  // Lock
  lock: (id: string) =>
    api.post<ApiOk>(`/api/v1/reports/${id}/lock`, {}),

  unlock: (id: string) =>
    api.del<ApiOk>(`/api/v1/reports/${id}/lock`),

  // SMS Delivery
  sendSms: (id: string, input: SmsDeliveryInput) =>
    api.post<ApiSuccess<SmsDeliveryResult>>(`/api/v1/reports/${id}/sms`, input),

  // Visual Regression
  runVisualRegression: (id: string, input: VisualRegressionInput) =>
    api.post<ApiSuccess<VisualRegressionResult>>(`/api/v1/reports/${id}/visual-regression`, input),

  getVisualRegressionStatus: (id: string, jobId: string) =>
    api.get<ApiSuccess<VisualRegressionResult>>(`/api/v1/reports/${id}/visual-regression/${jobId}`),
};
