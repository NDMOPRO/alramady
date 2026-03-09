import { excelApi } from "./client";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface Workbook {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  sheetCount: number;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  thumbnail?: string;
}

export interface Sheet {
  id: string;
  workbookId: string;
  name: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

export interface Cell {
  row: number;
  col: number;
  value: string | number | boolean | null;
  formula?: string;
  format?: CellFormat;
}

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  textAlign?: "left" | "center" | "right";
  numberFormat?: string;
}

export interface WorkbookDetail extends Workbook {
  sheets: Sheet[];
}

export interface SheetData {
  sheetId: string;
  cells: Cell[];
  rowCount: number;
  columnCount: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface SpreadsheetEnvelope<T> {
  success: boolean;
  data: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SpreadsheetWorkbookSummary {
  id: string;
  name: string;
  sheets: Array<{
    name: string;
    rowCount?: number;
    columnCount?: number;
  }>;
  createdAt: string;
}

export interface SpreadsheetOpenResult {
  id: string;
  name: string;
  sheets: Array<{
    name: string;
    index?: number;
    rowCount: number;
    columnCount: number;
    formulaCount?: number;
  }>;
  totalFormulas?: number;
}

export async function listSpreadsheetWorkbooks(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<{ data: SpreadsheetWorkbookSummary[]; total: number; page: number; limit: number; totalPages: number }> {
  const response = await excelApi.get<SpreadsheetEnvelope<SpreadsheetWorkbookSummary[]>>(
    "/spreadsheet",
    { params }
  );

  return {
    data: response.data.data ?? [],
    total: response.data.pagination?.total ?? 0,
    page: response.data.pagination?.page ?? params?.page ?? 1,
    limit: response.data.pagination?.limit ?? params?.limit ?? 20,
    totalPages: response.data.pagination?.totalPages ?? 1,
  };
}

export async function openSpreadsheetWorkbook(file: File): Promise<SpreadsheetOpenResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await excelApi.post<SpreadsheetEnvelope<SpreadsheetOpenResult>>(
    "/spreadsheet/upload",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    }
  );

  return response.data.data;
}

export async function createSpreadsheetWorkbook(payload: {
  name: string;
  sheets?: Array<{ name: string; data?: unknown[][] }>;
}): Promise<{
  id: string;
  datasetId?: string;
  name: string;
  sheets: Array<{ name: string; rowCount: number; columnCount: number }>;
  sizeBytes: number;
}> {
  const response = await excelApi.post<
    SpreadsheetEnvelope<{
      id: string;
      datasetId?: string;
      name: string;
      sheets: Array<{ name: string; rowCount: number; columnCount: number }>;
      sizeBytes: number;
    }>
  >("/spreadsheet", payload);

  return response.data.data;
}

export async function downloadSpreadsheetWorkbook(id: string): Promise<Blob> {
  const response = await excelApi.get(`/spreadsheet/${id}/export`, {
    responseType: "blob",
    timeout: 120000,
  });
  return response.data;
}

/* ── Workbooks ─────────────────────────────────────────────────────── */

export async function getWorkbooks(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ data: Workbook[]; total: number }> {
  const response = await excelApi.get<{ data: Workbook[]; total: number }>("/workbooks", {
    params,
  });
  return response.data;
}

export async function getWorkbookById(id: string): Promise<WorkbookDetail> {
  const response = await excelApi.get<WorkbookDetail>(`/workbooks/${id}`);
  return response.data;
}

export async function createWorkbook(payload: {
  name: string;
  nameAr: string;
  description: string;
}): Promise<Workbook> {
  const response = await excelApi.post<Workbook>("/workbooks", payload);
  return response.data;
}

export async function deleteWorkbook(id: string): Promise<void> {
  await excelApi.delete(`/workbooks/${id}`);
}

export async function uploadWorkbook(file: File): Promise<Workbook> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await excelApi.post<Workbook>("/workbooks/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

/* ── Sheets / Cells ────────────────────────────────────────────────── */

export async function getSheetData(workbookId: string, sheetId: string): Promise<SheetData> {
  const response = await excelApi.get<SheetData>(
    `/workbooks/${workbookId}/sheets/${sheetId}/cells`
  );
  return response.data;
}

export async function updateCells(
  workbookId: string,
  sheetId: string,
  cells: Cell[]
): Promise<Cell[]> {
  const response = await excelApi.put<Cell[]>(
    `/workbooks/${workbookId}/sheets/${sheetId}/cells`,
    { cells }
  );
  return response.data;
}

export async function formatCells(
  workbookId: string,
  sheetId: string,
  cells: Array<{ row: number; col: number; format: CellFormat }>
): Promise<void> {
  await excelApi.put(`/workbooks/${workbookId}/sheets/${sheetId}/format`, { cells });
}

export async function exportWorkbook(id: string, format: "xlsx" | "csv" | "pdf"): Promise<Blob> {
  const response = await excelApi.get(`/workbooks/${id}/export`, {
    params: { format },
    responseType: "blob",
  });
  return response.data;
}

/* ── Professional Formatting ──────────────────────────────────────── */

export interface FormattingResult {
  id: string;
  workbookId: string;
  status: string;
  appliedRules: string[];
  createdAt: string;
}

export async function getFormattingJobs(): Promise<PaginatedResponse<FormattingResult>> {
  const response = await excelApi.get<PaginatedResponse<FormattingResult>>('/formatting');
  return response.data;
}

export async function applyProfessionalFormatting(
  workbookId: string,
  options?: { rtl?: boolean; style?: string }
): Promise<FormattingResult> {
  const response = await excelApi.post<FormattingResult>('/formatting/professional', {
    workbookId,
    ...options,
  });
  return response.data;
}

/* ── Formulas ─────────────────────────────────────────────────────── */

export interface FormulaInfo {
  id: string;
  workbookId: string;
  cell: string;
  formula: string;
  result: string | number | null;
  status: string;
}

export async function getFormulas(params?: {
  workbookId?: string;
}): Promise<PaginatedResponse<FormulaInfo>> {
  const response = await excelApi.get<PaginatedResponse<FormulaInfo>>('/formulas', { params });
  return response.data;
}

/* ── Matching ─────────────────────────────────────────────────────── */

export interface MatchingJob {
  id: string;
  sourceWorkbookId: string;
  targetWorkbookId: string;
  matchScore: number;
  status: string;
  differences: number;
  createdAt: string;
}

export async function getMatchingJobs(): Promise<PaginatedResponse<MatchingJob>> {
  const response = await excelApi.get<PaginatedResponse<MatchingJob>>('/matching');
  return response.data;
}

/* ── Modes ────────────────────────────────────────────────────────── */

export interface ModeConfig {
  id: string;
  name: string;
  mode: 'easy' | 'advanced';
  config: Record<string, unknown>;
}

export async function getModes(): Promise<PaginatedResponse<ModeConfig>> {
  const response = await excelApi.get<PaginatedResponse<ModeConfig>>('/modes');
  return response.data;
}
