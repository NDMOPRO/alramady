import { reportingApi } from "./client";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface Report {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  templateId: string;
  templateName: string;
  status: "draft" | "generating" | "ready" | "scheduled" | "error";
  lastGenerated: string | null;
  scheduleEnabled: boolean;
  scheduleCron: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ReportSection {
  id: string;
  title: string;
  titleAr: string;
  type: "text" | "table" | "chart" | "image" | "header";
  content: string;
  order: number;
}

export interface ReportOutput {
  id: string;
  reportId: string;
  format: "pdf" | "docx" | "html" | "xlsx";
  url: string;
  fileSize: number;
  generatedAt: string;
}

export interface ReportDetail extends Report {
  sections: ReportSection[];
  outputs: ReportOutput[];
  schedules?: Array<{
    id: string;
    cronExpression: string;
    recipients: string[];
    format: string;
    status: string;
    nextRunAt: string | null;
    lastRunAt: string | null;
  }>;
}

export interface CreateReportPayload {
  name: string;
  templateId?: string | null;
  dataSources: Array<{ datasetId: string; query?: Record<string, unknown> }>;
  tenantId?: string;
}

export interface SchedulePayload {
  cronExpression?: string;
  recipients?: string[];
  format?: "pdf" | "docx" | "html";
  enabled?: boolean;
  cron?: string;
  formats?: string[];
}

export interface AddReportSectionPayload {
  type: "text" | "chart" | "table" | "image" | "pagebreak";
  content: Record<string, unknown>;
  position: number;
}

export interface ReportBuildResult {
  buildId: string;
  reportId: string;
  status: string;
  duration: number;
  sectionCount: number;
  dataSourceCount: number;
  renderedSections: Array<Record<string, unknown>>;
  createdAt: string;
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

// Easy Mode
export interface EasyModeReport {
  id: string;
  name: string;
  description: string | null;
  mode: 'EASY';
  status: string;
  reportType: string;
  outputFormat: string;
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEasyModePayload {
  name: string;
  description?: string;
  reportType?: string;
  dataSourceId?: string;
  datasetId?: string;
  layoutConfig?: Record<string, any>;
  chartConfig?: Record<string, any>;
  filterConfig?: Record<string, any>;
  groupByFields?: string[];
  aggregations?: Record<string, any>;
  colorScheme?: string;
  outputFormat?: string;
  tags?: string[];
}

// Advanced Mode
export interface AdvancedModeReport {
  id: string;
  name: string;
  description: string | null;
  mode: 'ADVANCED';
  status: string;
  config: Record<string, any>;
  dataSources: any[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdvancedModePayload {
  name: string;
  description?: string;
  queryConfig: Record<string, any>;
  dataSources: Array<{ datasetId: string; alias?: string }>;
  transformations?: any[];
  customFormulas?: any[];
  crossTabConfig?: Record<string, any>;
  drillDownConfig?: Record<string, any>;
  parameterizedFilters?: any[];
  outputFormats?: string[];
  cacheStrategy?: string;
}

// Post-Edit
export interface PostEdit {
  id: string;
  reportId: string;
  editType: string;
  sectionId: string | null;
  editData: Record<string, any>;
  previousData: Record<string, any> | null;
  version: number;
  createdAt: string;
}

// Template Library
export interface ReportTemplateItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isPublic: boolean;
  tags: string[];
  previewHtml: string | null;
  createdAt: string;
}

// External Simulation
export interface ExternalSimulation {
  id: string;
  name: string;
  sourceType: string;
  status: string;
  analysisResult: Record<string, any> | null;
  createdAt: string;
}

// Compare Schedule
export interface CompareSchedule {
  id: string;
  name: string;
  reportIdA: string;
  reportIdB: string;
  comparisonType: string;
  status: string;
  isActive: boolean;
  resultData: Record<string, any> | null;
  lastExecutedAt: string | null;
}

// Distribution
export interface DistributionConfig {
  id: string;
  reportId: string;
  name: string;
  recipientType: string;
  recipients: any[];
  schedule: Record<string, any> | null;
  status: string;
  createdAt: string;
}

// Interactive
export interface InteractiveReport {
  id: string;
  name: string;
  reportId: string;
  interactiveElements: Record<string, any>;
  parameters: Record<string, any>;
  status: string;
  createdAt: string;
}

// Report Type
export interface ReportType {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  description: string;
  defaultSections: string[];
  recommendedCharts: string[];
}

interface BackendReportRecord extends Record<string, unknown> {
  sections?: ReportSection[];
  outputs?: ReportOutput[];
  schedules?: Array<Record<string, unknown>>;
}

function normalizeReportStatus(value: unknown): Report["status"] {
  const normalized = String(value ?? "draft").toLowerCase();
  if (["building", "processing", "generating"].includes(normalized)) return "generating";
  if (["built", "completed", "ready"].includes(normalized)) return "ready";
  if (["scheduled", "active"].includes(normalized)) return "scheduled";
  if (["error", "failed"].includes(normalized)) return "error";
  return "draft";
}

function mapReport(record: BackendReportRecord): Report {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    nameAr: String(record.nameAr ?? record.name ?? ""),
    description: String(record.description ?? ""),
    templateId: String(record.templateId ?? ""),
    templateName: String(record.templateName ?? "بدون قالب"),
    status: normalizeReportStatus(record.status),
    lastGenerated: record.lastGenerated ? String(record.lastGenerated) : null,
    scheduleEnabled: Boolean(record.scheduleEnabled),
    scheduleCron: record.scheduleCron ? String(record.scheduleCron) : null,
    createdAt: String(record.createdAt ?? ""),
    updatedAt: String(record.updatedAt ?? ""),
    createdBy: String(record.createdBy ?? ""),
  };
}

function mapReportOutput(record: Record<string, unknown>): ReportOutput {
  const format = String(record.format ?? "html").toLowerCase();
  const normalizedFormat = format === "word" ? "docx" : format === "excel" ? "xlsx" : format;
  return {
    id: String(record.id ?? ""),
    reportId: String(record.reportId ?? ""),
    format: normalizedFormat as ReportOutput["format"],
    url: String(record.url ?? ""),
    fileSize: Number(record.fileSize ?? 0),
    generatedAt: String(record.generatedAt ?? record.createdAt ?? ""),
  };
}

/* ── Reports ───────────────────────────────────────────────────────── */

export async function getReports(params?: {
  page?: number;
  pageSize?: number;
  limit?: number;
  search?: string;
  status?: string;
}): Promise<{ data: Report[]; total: number }> {
  const response = await reportingApi.get<{
    success: boolean;
    data: BackendReportRecord[];
    pagination?: { total?: number };
  }>("/reports", {
    params: {
      page: params?.page,
      limit: params?.limit ?? params?.pageSize,
      search: params?.search,
      status: params?.status,
    },
  });
  const items = Array.isArray(response.data.data)
    ? response.data.data.map(mapReport)
    : [];
  const total = response.data.pagination?.total ?? items.length;
  return { data: items, total };
}

export async function getReportById(id: string): Promise<ReportDetail> {
  const response = await reportingApi.get<{
    success: boolean;
    data: BackendReportRecord;
  }>(`/reports/${id}`);
  const payload = response.data.data ?? {};
  return {
    ...mapReport(payload),
    sections: Array.isArray(payload.sections) ? payload.sections : [],
    outputs: Array.isArray(payload.outputs) ? ((payload.outputs as unknown as Array<Record<string, unknown>>).map(mapReportOutput)) : [],
    schedules: Array.isArray(payload.schedules)
      ? payload.schedules.map((schedule) => ({
          id: String(schedule.id ?? ""),
          cronExpression: String(schedule.cronExpression ?? ""),
          recipients: Array.isArray(schedule.recipients) ? schedule.recipients as string[] : [],
          format: String(schedule.format ?? ""),
          status: String(schedule.status ?? ""),
          nextRunAt: schedule.nextRunAt ? String(schedule.nextRunAt) : null,
          lastRunAt: schedule.lastRunAt ? String(schedule.lastRunAt) : null,
        }))
      : [],
  };
}

export async function createReport(payload: CreateReportPayload): Promise<Report> {
  const response = await reportingApi.post<{ success: boolean; data: BackendReportRecord }>("/reports", payload);
  return mapReport(response.data.data ?? {});
}

export async function updateReport(id: string, payload: Partial<CreateReportPayload>): Promise<Report> {
  const response = await reportingApi.put<Report>(`/reports/${id}`, payload);
  return response.data;
}

export async function deleteReport(id: string): Promise<void> {
  await reportingApi.delete(`/reports/${id}`);
}

export async function addReportSection(
  id: string,
  payload: AddReportSectionPayload
): Promise<{ sectionId: string; reportId: string }> {
  const response = await reportingApi.post<{ success: boolean; data: { sectionId: string; reportId: string } }>(
    `/reports/${id}/sections`,
    payload
  );
  return response.data.data;
}

export async function buildReport(id: string): Promise<ReportBuildResult> {
  const response = await reportingApi.post<{ success: boolean; data: ReportBuildResult }>(`/reports/${id}/build`);
  return response.data.data;
}

export async function generateReport(id: string, format: string): Promise<ReportOutput> {
  const normalizedFormat = (format === "word" ? "docx" : format === "excel" ? "xlsx" : format) as ReportOutput["format"];
  await buildReport(id);
  const blob = await exportReport(id, normalizedFormat);
  return {
    id: `${id}-${normalizedFormat}-${Date.now()}`,
    reportId: id,
    format: normalizedFormat,
    url: "",
    fileSize: blob.size,
    generatedAt: new Date().toISOString(),
  };
}

export async function exportReport(id: string, format: ReportOutput["format"]): Promise<Blob> {
  const routeFormat = format === "docx" ? "word" : format === "xlsx" ? "excel" : format;
  const response = await reportingApi.get(`/reports/${id}/export/${routeFormat}`, {
    responseType: "blob",
  });
  return response.data;
}

export async function downloadReportOutput(reportId: string, outputId: string): Promise<Blob> {
  const detail = await getReportById(reportId);
  const output = detail.outputs.find((item) => item.id === outputId);
  if (!output) {
    throw new Error("Report output not found");
  }
  return exportReport(reportId, output.format);
}

export async function setReportSchedule(id: string, payload: SchedulePayload): Promise<{
  id: string;
  reportId: string;
  cronExpression: string;
  recipients: string[];
  format: string;
  status: string;
  nextRunAt: string | null;
  createdAt: string;
}> {
  const normalizedCron = payload.cronExpression ?? payload.cron ?? "";
  const normalizedFormat = (payload.format ?? payload.formats?.[0] ?? "pdf") as "pdf" | "docx" | "html";
  const normalizedRecipients = payload.recipients && payload.recipients.length > 0
    ? payload.recipients
    : ["ops@example.com"];
  const response = await reportingApi.post<{ success: boolean; data: Record<string, unknown> }>(
    `/reports/${id}/schedule`,
    {
      cronExpression: normalizedCron,
      recipients: normalizedRecipients,
      format: normalizedFormat,
    }
  );
  const schedule = response.data.data ?? {};
  return {
    id: String(schedule.id ?? ""),
    reportId: String(schedule.reportId ?? id),
    cronExpression: String(schedule.cronExpression ?? normalizedCron),
    recipients: Array.isArray(schedule.recipients) ? schedule.recipients as string[] : normalizedRecipients,
    format: String(schedule.format ?? normalizedFormat),
    status: String(schedule.status ?? ""),
    nextRunAt: schedule.nextRunAt ? String(schedule.nextRunAt) : null,
    createdAt: String(schedule.createdAt ?? ""),
  };
}

export async function getReportTemplates(): Promise<Array<{ id: string; name: string; nameAr: string }>> {
  const response = await reportingApi.get<{ success: boolean; data: Array<Record<string, unknown>> }>("/templates");
  return Array.isArray(response.data.data)
    ? response.data.data.map((template) => ({
        id: String(template.id ?? ""),
        name: String(template.name ?? ""),
        nameAr: String(template.nameAr ?? template.name ?? ""),
      }))
    : [];
}

/* ── Easy Mode ─────────────────────────────────────────────────────── */

export async function getEasyModeReports(
  params?: ListParams & { reportType?: string; outputFormat?: string }
): Promise<PaginatedResponse<EasyModeReport>> {
  const response = await reportingApi.get<PaginatedResponse<EasyModeReport>>("/easy-mode", {
    params,
  });
  return response.data;
}

export async function getEasyModeReport(id: string): Promise<EasyModeReport> {
  const response = await reportingApi.get<EasyModeReport>(`/easy-mode/${id}`);
  return response.data;
}

export async function createEasyModeReport(payload: CreateEasyModePayload): Promise<EasyModeReport> {
  const response = await reportingApi.post<EasyModeReport>("/easy-mode", payload);
  return response.data;
}

export async function updateEasyModeReport(
  id: string,
  payload: Partial<CreateEasyModePayload>
): Promise<EasyModeReport> {
  const response = await reportingApi.put<EasyModeReport>(`/easy-mode/${id}`, payload);
  return response.data;
}

export async function deleteEasyModeReport(id: string): Promise<void> {
  await reportingApi.delete(`/easy-mode/${id}`);
}

export async function generateEasyModeReport(
  id: string,
  format?: string
): Promise<{ reportId: string; format: string; status: string }> {
  const response = await reportingApi.post<{ reportId: string; format: string; status: string }>(
    `/easy-mode/${id}/generate`,
    { format }
  );
  return response.data;
}

export async function duplicateEasyModeReport(id: string): Promise<EasyModeReport> {
  const response = await reportingApi.post<EasyModeReport>(`/easy-mode/${id}/duplicate`);
  return response.data;
}

export async function previewEasyModeReport(
  id: string
): Promise<{ reportId: string; preview: boolean; sections: any[] }> {
  const response = await reportingApi.get<{ reportId: string; preview: boolean; sections: any[] }>(
    `/easy-mode/${id}/preview`
  );
  return response.data;
}

export async function autoComposeEasyModeReport(
  id: string
): Promise<{ reportId: string; status: string; format: string }> {
  const response = await reportingApi.post<{ reportId: string; status: string; format: string }>(
    `/easy-mode/${id}/auto-compose`
  );
  return response.data;
}

export async function scheduleEasyModeReport(id: string, config: any): Promise<EasyModeReport> {
  const response = await reportingApi.post<EasyModeReport>(`/easy-mode/${id}/schedule`, config);
  return response.data;
}

export async function getReportTypes(): Promise<ReportType[]> {
  const response = await reportingApi.get<ReportType[]>("/easy-mode/report-types");
  return response.data;
}

/* ── Advanced Mode ─────────────────────────────────────────────────── */

export async function getAdvancedModeReports(
  params?: ListParams
): Promise<PaginatedResponse<AdvancedModeReport>> {
  const response = await reportingApi.get<PaginatedResponse<AdvancedModeReport>>("/advanced-mode", {
    params,
  });
  return response.data;
}

export async function getAdvancedModeReport(id: string): Promise<AdvancedModeReport> {
  const response = await reportingApi.get<AdvancedModeReport>(`/advanced-mode/${id}`);
  return response.data;
}

export async function createAdvancedModeReport(
  payload: CreateAdvancedModePayload
): Promise<AdvancedModeReport> {
  const response = await reportingApi.post<AdvancedModeReport>("/advanced-mode", payload);
  return response.data;
}

export async function updateAdvancedModeReport(
  id: string,
  payload: Partial<CreateAdvancedModePayload>
): Promise<AdvancedModeReport> {
  const response = await reportingApi.put<AdvancedModeReport>(`/advanced-mode/${id}`, payload);
  return response.data;
}

export async function deleteAdvancedModeReport(id: string): Promise<void> {
  await reportingApi.delete(`/advanced-mode/${id}`);
}

export async function executeAdvancedQuery(
  id: string,
  queryParams: any
): Promise<{ reportId: string; data: Record<string, any[]> }> {
  const response = await reportingApi.post<{ reportId: string; data: Record<string, any[]> }>(
    `/advanced-mode/${id}/execute`,
    queryParams
  );
  return response.data;
}

export async function generateAdvancedReport(
  id: string,
  formats?: string[]
): Promise<{ reportId: string; formats: any[]; status: string }> {
  const response = await reportingApi.post<{ reportId: string; formats: any[]; status: string }>(
    `/advanced-mode/${id}/generate`,
    { formats }
  );
  return response.data;
}

/* ── Post-Edit ─────────────────────────────────────────────────────── */

export async function getPostEdits(params?: ListParams): Promise<PaginatedResponse<PostEdit>> {
  const response = await reportingApi.get<PaginatedResponse<PostEdit>>("/post-edit", {
    params,
  });
  return response.data;
}

export async function getPostEdit(id: string): Promise<PostEdit> {
  const response = await reportingApi.get<PostEdit>(`/post-edit/${id}`);
  return response.data;
}

export async function createPostEdit(payload: {
  reportId: string;
  editType: string;
  sectionId?: string;
  editData: any;
}): Promise<PostEdit> {
  const response = await reportingApi.post<PostEdit>("/post-edit", payload);
  return response.data;
}

export async function updatePostEdit(id: string, payload: any): Promise<PostEdit> {
  const response = await reportingApi.put<PostEdit>(`/post-edit/${id}`, payload);
  return response.data;
}

export async function deletePostEdit(id: string): Promise<void> {
  await reportingApi.delete(`/post-edit/${id}`);
}

export async function applySectionEdit(
  id: string,
  sectionId: string,
  editData: any
): Promise<PostEdit> {
  const response = await reportingApi.post<PostEdit>(
    `/post-edit/${id}/sections/${sectionId}`,
    editData
  );
  return response.data;
}

export async function getPostEditVersions(id: string): Promise<PostEdit[]> {
  const response = await reportingApi.get<PostEdit[]>(`/post-edit/${id}/versions`);
  return response.data;
}

export async function reexportPostEdit(
  id: string,
  format?: string
): Promise<{ reportId: string; format: string; status: string }> {
  const response = await reportingApi.post<{ reportId: string; format: string; status: string }>(
    `/post-edit/${id}/reexport`,
    { format }
  );
  return response.data;
}

/* ── Template Library ──────────────────────────────────────────────── */

export async function getTemplates(
  params?: ListParams & { category?: string }
): Promise<PaginatedResponse<ReportTemplateItem>> {
  const response = await reportingApi.get<PaginatedResponse<ReportTemplateItem>>(
    "/template-library",
    { params }
  );
  return response.data;
}

export async function getTemplate(id: string): Promise<ReportTemplateItem> {
  const response = await reportingApi.get<ReportTemplateItem>(`/template-library/${id}`);
  return response.data;
}

export async function createTemplate(payload: any): Promise<ReportTemplateItem> {
  const response = await reportingApi.post<ReportTemplateItem>("/template-library", payload);
  return response.data;
}

export async function updateTemplate(id: string, payload: any): Promise<ReportTemplateItem> {
  const response = await reportingApi.put<ReportTemplateItem>(`/template-library/${id}`, payload);
  return response.data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await reportingApi.delete(`/template-library/${id}`);
}

export async function saveReportAsTemplate(
  id: string,
  data: { name: string; category?: string }
): Promise<ReportTemplateItem> {
  const response = await reportingApi.post<ReportTemplateItem>(
    `/template-library/${id}/save-as-template`,
    data
  );
  return response.data;
}

export async function getTemplatePreview(id: string): Promise<{ html: string }> {
  const response = await reportingApi.get<{ html: string }>(`/template-library/${id}/preview`);
  return response.data;
}

/* ── External Simulation ───────────────────────────────────────────── */

export async function getExternalSimulations(
  params?: ListParams
): Promise<PaginatedResponse<ExternalSimulation>> {
  const response = await reportingApi.get<PaginatedResponse<ExternalSimulation>>(
    "/external-simulation",
    { params }
  );
  return response.data;
}

export async function getExternalSimulation(id: string): Promise<ExternalSimulation> {
  const response = await reportingApi.get<ExternalSimulation>(`/external-simulation/${id}`);
  return response.data;
}

export async function createExternalSimulation(payload: any): Promise<ExternalSimulation> {
  const response = await reportingApi.post<ExternalSimulation>("/external-simulation", payload);
  return response.data;
}

export async function updateExternalSimulation(
  id: string,
  payload: any
): Promise<ExternalSimulation> {
  const response = await reportingApi.put<ExternalSimulation>(
    `/external-simulation/${id}`,
    payload
  );
  return response.data;
}

export async function deleteExternalSimulation(id: string): Promise<void> {
  await reportingApi.delete(`/external-simulation/${id}`);
}

export async function analyzeExternalReport(data: {
  name: string;
  sourceType: string;
  fileUrl?: string;
  rawContent?: string;
}): Promise<ExternalSimulation> {
  const response = await reportingApi.post<ExternalSimulation>(
    "/external-simulation/analyze",
    data
  );
  return response.data;
}

export async function reproduceExternalReport(
  id: string,
  options?: any
): Promise<{ reportId: string; status: string }> {
  const response = await reportingApi.post<{ reportId: string; status: string }>(
    `/external-simulation/${id}/reproduce`,
    options
  );
  return response.data;
}

/* ── Compare Schedule ──────────────────────────────────────────────── */

export async function getCompareSchedules(
  params?: ListParams
): Promise<PaginatedResponse<CompareSchedule>> {
  const response = await reportingApi.get<PaginatedResponse<CompareSchedule>>(
    "/compare-schedule",
    { params }
  );
  return response.data;
}

export async function getCompareSchedule(id: string): Promise<CompareSchedule> {
  const response = await reportingApi.get<CompareSchedule>(`/compare-schedule/${id}`);
  return response.data;
}

export async function createCompareSchedule(payload: any): Promise<CompareSchedule> {
  const response = await reportingApi.post<CompareSchedule>("/compare-schedule", payload);
  return response.data;
}

export async function updateCompareSchedule(id: string, payload: any): Promise<CompareSchedule> {
  const response = await reportingApi.put<CompareSchedule>(`/compare-schedule/${id}`, payload);
  return response.data;
}

export async function deleteCompareSchedule(id: string): Promise<void> {
  await reportingApi.delete(`/compare-schedule/${id}`);
}

export async function executeCompareSchedule(id: string): Promise<CompareSchedule> {
  const response = await reportingApi.post<CompareSchedule>(`/compare-schedule/${id}/execute`);
  return response.data;
}

export async function getCompareResults(
  id: string
): Promise<{ id: string; resultData: any; status: string }> {
  const response = await reportingApi.get<{ id: string; resultData: any; status: string }>(
    `/compare-schedule/${id}/results`
  );
  return response.data;
}

export async function activateCompareSchedule(id: string): Promise<CompareSchedule> {
  const response = await reportingApi.post<CompareSchedule>(`/compare-schedule/${id}/activate`);
  return response.data;
}

export async function deactivateCompareSchedule(id: string): Promise<CompareSchedule> {
  const response = await reportingApi.post<CompareSchedule>(`/compare-schedule/${id}/deactivate`);
  return response.data;
}

/* ── Distribution ──────────────────────────────────────────────────── */

export async function getDistributions(
  params?: ListParams
): Promise<PaginatedResponse<DistributionConfig>> {
  const response = await reportingApi.get<PaginatedResponse<DistributionConfig>>("/distribution", {
    params,
  });
  return response.data;
}

export async function getDistribution(id: string): Promise<DistributionConfig> {
  const response = await reportingApi.get<DistributionConfig>(`/distribution/${id}`);
  return response.data;
}

export async function createDistribution(payload: any): Promise<DistributionConfig> {
  const response = await reportingApi.post<DistributionConfig>("/distribution", payload);
  return response.data;
}

export async function updateDistribution(id: string, payload: any): Promise<DistributionConfig> {
  const response = await reportingApi.put<DistributionConfig>(`/distribution/${id}`, payload);
  return response.data;
}

export async function deleteDistribution(id: string): Promise<void> {
  await reportingApi.delete(`/distribution/${id}`);
}

export async function sendDistribution(id: string): Promise<{ status: string }> {
  const response = await reportingApi.post<{ status: string }>(`/distribution/${id}/send`);
  return response.data;
}

export async function getDistributionHistory(id: string): Promise<any[]> {
  const response = await reportingApi.get<any[]>(`/distribution/${id}/history`);
  return response.data;
}

export async function getDistributionAnalytics(id: string): Promise<any> {
  const response = await reportingApi.get<any>(`/distribution/${id}/analytics`);
  return response.data;
}

/* ── Interactive ───────────────────────────────────────────────────── */

export async function getInteractiveReports(
  params?: ListParams
): Promise<PaginatedResponse<InteractiveReport>> {
  const response = await reportingApi.get<PaginatedResponse<InteractiveReport>>("/interactive", {
    params,
  });
  return response.data;
}

export async function getInteractiveReport(id: string): Promise<InteractiveReport> {
  const response = await reportingApi.get<InteractiveReport>(`/interactive/${id}`);
  return response.data;
}

export async function createInteractiveReport(payload: any): Promise<InteractiveReport> {
  const response = await reportingApi.post<InteractiveReport>("/interactive", payload);
  return response.data;
}

export async function updateInteractiveReport(
  id: string,
  payload: any
): Promise<InteractiveReport> {
  const response = await reportingApi.put<InteractiveReport>(`/interactive/${id}`, payload);
  return response.data;
}

export async function deleteInteractiveReport(id: string): Promise<void> {
  await reportingApi.delete(`/interactive/${id}`);
}

export async function executeInteractiveParams(id: string, params: any): Promise<any> {
  const response = await reportingApi.post<any>(`/interactive/${id}/execute`, params);
  return response.data;
}

export async function drillDownInteractive(id: string, drillConfig: any): Promise<any> {
  const response = await reportingApi.post<any>(`/interactive/${id}/drill-down`, drillConfig);
  return response.data;
}

export async function getInteractiveBookmarks(id: string): Promise<any[]> {
  const response = await reportingApi.get<any[]>(`/interactive/${id}/bookmarks`);
  return response.data;
}

export async function createInteractiveBookmark(id: string, bookmark: any): Promise<any> {
  const response = await reportingApi.post<any>(`/interactive/${id}/bookmarks`, bookmark);
  return response.data;
}

export async function getInteractiveComments(id: string): Promise<any[]> {
  const response = await reportingApi.get<any[]>(`/interactive/${id}/comments`);
  return response.data;
}

export async function createInteractiveComment(
  id: string,
  comment: { content: string }
): Promise<any> {
  const response = await reportingApi.post<any>(`/interactive/${id}/comments`, comment);
  return response.data;
}
