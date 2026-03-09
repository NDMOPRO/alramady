import { dataApi } from "./client";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface Dataset {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  format: string;
  status: string;
  rowCount: number;
  columnCount: number;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
}

export interface DatasetColumn {
  name: string;
  type: string;
  nullable: boolean;
  uniqueCount: number;
  nullCount: number;
  min?: string | number;
  max?: string | number;
  mean?: number;
  sampleValues: (string | number | null)[];
}

export interface DatasetRow {
  [key: string]: string | number | boolean | null;
}

export interface DatasetDetail extends Dataset {
  columns: DatasetColumn[];
}

export interface PaginatedRows {
  data: DatasetRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ImportResult {
  datasetId: string;
  name: string;
  rowCount: number;
  columnCount: number;
  status: string;
  warnings: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DatasetColumnStatistics {
  type: string;
  totalCount: number;
  nonNullCount: number;
  nullCount: number;
  uniqueCount: number;
  min?: string | number;
  max?: string | number;
  mean?: number;
  median?: number;
  stdDev?: number;
}

export interface DatasetStatistics {
  datasetId: string;
  name: string;
  totalRows: number;
  totalColumns: number;
  columns: Record<string, DatasetColumnStatistics>;
}

interface BackendPagination {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

interface BackendDatasetRecord extends Record<string, unknown> {
  columns?: Record<string, unknown>[];
}

interface BackendDatasetStatisticsResponse extends Record<string, unknown> {
  datasetId?: unknown;
  name?: unknown;
  totalRows?: unknown;
  totalColumns?: unknown;
  columns?: Record<string, Record<string, unknown>>;
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeDatasetFormat(value: unknown): string {
  const format = String(value ?? "csv").toLowerCase();
  if (["xlsx", "xls", "xlsm", "xlsb", "excel"].includes(format)) return "excel";
  if (format === "image_ocr") return "image_ocr";
  return format;
}

function normalizeDatasetColumn(column: Record<string, unknown>): DatasetColumn {
  return {
    name: String(column.name ?? ""),
    type: String(column.type ?? column.dataType ?? "string"),
    nullable: Boolean(column.nullable),
    uniqueCount: toNumber(column.uniqueCount),
    nullCount: toNumber(column.nullCount),
    min: column.min as string | number | undefined,
    max: column.max as string | number | undefined,
    mean: typeof column.mean === "number" ? column.mean : undefined,
    sampleValues: Array.isArray(column.sampleValues)
      ? column.sampleValues as (string | number | null)[]
      : [],
  };
}

function mapDataset(record: BackendDatasetRecord): Dataset {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    nameAr: String(record.nameAr ?? record.name ?? ""),
    description: String(record.description ?? ""),
    format: normalizeDatasetFormat(record.format),
    status: String(record.status ?? "active"),
    rowCount: toNumber(record.rowCount ?? record.actualRowCount),
    columnCount: toNumber(record.columnCount),
    fileSize: toNumber(record.sizeBytes ?? record.fileSize),
    createdAt: String(record.createdAt ?? ""),
    updatedAt: String(record.updatedAt ?? ""),
    createdBy: String(record.createdBy ?? ""),
    tags: Array.isArray(record.tags) ? record.tags as string[] : [],
  };
}

function mapDatasetDetail(record: BackendDatasetRecord): DatasetDetail {
  return {
    ...mapDataset(record),
    columns: Array.isArray(record.columns)
      ? record.columns.map(normalizeDatasetColumn)
      : [],
  };
}

function getPaginationMetadata(
  pagination: BackendPagination | undefined,
  fallbackCount: number
): PaginatedResponse<never> {
  return {
    data: [],
    total: pagination?.total ?? fallbackCount,
    page: pagination?.page ?? 1,
    pageSize: pagination?.limit ?? fallbackCount,
    totalPages: pagination?.totalPages ?? 1,
  };
}

/* ── Datasets ──────────────────────────────────────────────────────── */

export async function getDatasets(params?: {
  page?: number;
  pageSize?: number;
  limit?: number;
  search?: string;
  format?: string;
  status?: string;
}): Promise<PaginatedResponse<Dataset>> {
  const response = await dataApi.get<{
    success: boolean;
    data: BackendDatasetRecord[];
    pagination?: BackendPagination;
  }>("/sources", {
    params: {
      page: params?.page,
      limit: params?.limit ?? params?.pageSize,
      search: params?.search,
      format: params?.format,
      status: params?.status,
    },
  });
  const mapped = (response.data.data ?? []).map(mapDataset);
  const pagination = getPaginationMetadata(response.data.pagination, mapped.length);
  return {
    data: mapped,
    total: pagination.total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
  };
}

export async function getDatasetById(id: string): Promise<DatasetDetail> {
  const response = await dataApi.get<{
    success: boolean;
    data: BackendDatasetRecord;
  }>(`/sources/${id}`);
  return mapDatasetDetail(response.data.data ?? {});
}

export async function getDatasetRows(
  id: string,
  params?: { page?: number; pageSize?: number; sort?: string; order?: string }
): Promise<PaginatedRows> {
  const response = await dataApi.get<{
    success: boolean;
    data: DatasetRow[];
    pagination?: BackendPagination;
  }>(`/sources/${id}/rows`, {
    params: {
      page: params?.page,
      limit: params?.pageSize,
      sortBy: params?.sort,
      sortDir: params?.order,
    },
  });
  const pagination = getPaginationMetadata(response.data.pagination, response.data.data?.length ?? 0);
  return {
    data: response.data.data ?? [],
    total: pagination.total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
  };
}

export async function deleteDataset(id: string): Promise<void> {
  await dataApi.delete(`/sources/${id}`);
}

/* ── Import ─────────────────────────────────────────────────────────── */

export async function importDataset(
  _format: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await dataApi.post<{ success: boolean; data: Record<string, unknown> }>("/import/single", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });
  const d = response.data.data ?? response.data;
  return {
    datasetId: String(d.id ?? ""),
    name: String(d.name ?? file.name),
    rowCount: Number(d.rowCount ?? 0),
    columnCount: Number(d.columnCount ?? 0),
    status: String(d.status ?? "active"),
    warnings: [],
  };
}

/* ── Export ──────────────────────────────────────────────────────────── */

export async function exportDataset(id: string, format: string): Promise<Blob> {
  const normalizedFormat = format.toLowerCase() === "xlsx" ? "excel" : format.toLowerCase();
  const response = await dataApi.get(`/sources/${id}/export/${normalizedFormat}`, {
    responseType: "blob",
  });
  return response.data;
}

/* ── Column Stats ───────────────────────────────────────────────────── */

export async function getDatasetStatistics(datasetId: string): Promise<DatasetStatistics> {
  const response = await dataApi.get<{
    success: boolean;
    data: BackendDatasetStatisticsResponse;
  }>(`/sources/${datasetId}/statistics`);
  const payload = response.data.data ?? {};
  const columns = Object.fromEntries(
    Object.entries(payload.columns ?? {}).map(([columnName, stats]) => [
      columnName,
      {
        type: String(stats.type ?? "string"),
        totalCount: toNumber(stats.totalCount),
        nonNullCount: toNumber(stats.nonNullCount),
        nullCount: toNumber(stats.nullCount),
        uniqueCount: toNumber(stats.uniqueCount),
        min: stats.min as string | number | undefined,
        max: stats.max as string | number | undefined,
        mean: typeof stats.mean === "number" ? stats.mean : undefined,
        median: typeof stats.median === "number" ? stats.median : undefined,
        stdDev: typeof stats.stdDev === "number" ? stats.stdDev : undefined,
      } satisfies DatasetColumnStatistics,
    ])
  );

  return {
    datasetId: String(payload.datasetId ?? datasetId),
    name: String(payload.name ?? ""),
    totalRows: toNumber(payload.totalRows),
    totalColumns: toNumber(payload.totalColumns),
    columns,
  };
}

export async function getColumnStats(datasetId: string, columnName: string): Promise<DatasetColumn> {
  const statistics = await getDatasetStatistics(datasetId);
  const stats = statistics.columns[columnName] ?? {
    type: "string",
    totalCount: 0,
    nonNullCount: 0,
    nullCount: 0,
    uniqueCount: 0,
  };
  return {
    name: columnName,
    type: stats.type,
    nullable: stats.nullCount > 0,
    uniqueCount: stats.uniqueCount,
    nullCount: stats.nullCount,
    min: stats.min,
    max: stats.max,
    mean: stats.mean,
    sampleValues: [],
  };
}

/* ── Connectors ─────────────────────────────────────────────────────── */

export interface Connector {
  id: string;
  name: string;
  type: string;
  status: "connected" | "disconnected" | "error";
  lastSync: string | null;
  config: Record<string, unknown>;
}

export interface ConnectorTypeInfo {
  type: string;
  name: string;
  icon: string;
  description: string;
  authType: "oauth2" | "api_key" | "service_account";
  requiredScopes: string[];
}

export interface ConnectorConnection {
  id: string;
  connectorType: string;
  name: string;
  status: string;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export async function getConnectors(): Promise<PaginatedResponse<Connector>> {
  const response = await dataApi.get<PaginatedResponse<Connector>>("/connectors");
  return response.data;
}

export async function getConnectorTypes(): Promise<ConnectorTypeInfo[]> {
  const response = await dataApi.get<{
    success: boolean;
    data: Array<Record<string, unknown>>;
  }>("/connectors/types");
  return Array.isArray(response.data.data)
    ? response.data.data.map((item) => ({
        type: String(item.type ?? ""),
        name: String(item.name ?? item.type ?? ""),
        icon: String(item.icon ?? ""),
        description: String(item.description ?? ""),
        authType: String(item.authType ?? "oauth2") as ConnectorTypeInfo["authType"],
        requiredScopes: Array.isArray(item.requiredScopes) ? item.requiredScopes as string[] : [],
      }))
    : [];
}

export async function getConnectorConnections(): Promise<ConnectorConnection[]> {
  const response = await dataApi.get<{
    success: boolean;
    data: Array<Record<string, unknown>>;
  }>("/connectors/connections");
  return Array.isArray(response.data.data)
    ? response.data.data.map((item) => ({
        id: String(item.id ?? ""),
        connectorType: String(item.connectorType ?? item.type ?? ""),
        name: String(item.name ?? item.displayName ?? item.connectorType ?? ""),
        status: String(item.status ?? "connected"),
        createdAt: item.createdAt ? String(item.createdAt) : null,
        lastUsedAt: item.lastUsedAt ? String(item.lastUsedAt) : null,
      }))
    : [];
}

export async function getConnectorAuthUrl(type: string): Promise<string> {
  const response = await dataApi.get<{
    success: boolean;
    data: { authUrl?: string };
  }>(`/connectors/auth/${type}`);
  return String(response.data.data?.authUrl ?? "");
}

export async function createConnector(payload: {
  name: string;
  type: string;
  config: Record<string, unknown>;
}): Promise<Connector> {
  const response = await dataApi.post<Connector>("/connectors", payload);
  return response.data;
}

/* ── Columns ────────────────────────────────────────────────────────── */

export interface ColumnInfo {
  id: string;
  datasetId: string;
  name: string;
  type: string;
  nullable: boolean;
  uniqueCount: number;
  nullCount: number;
  qualityScore: number;
}

export async function getColumns(params?: {
  datasetId?: string;
}): Promise<PaginatedResponse<ColumnInfo>> {
  const response = await dataApi.get<PaginatedResponse<ColumnInfo>>("/columns", { params });
  return response.data;
}

/* ── Cleaning ───────────────────────────────────────────────────────── */

export interface CleaningTask {
  id: string;
  datasetId: string;
  type: string;
  status: string;
  issuesFound: number;
  issuesFixed: number;
  createdAt: string;
}

export async function getCleaningTasks(): Promise<PaginatedResponse<CleaningTask>> {
  const response = await dataApi.get<PaginatedResponse<CleaningTask>>("/cleansing");
  return response.data;
}

export async function runCleaning(
  datasetId: string,
  options: {
    removeDuplicates?: boolean;
    fillMissing?: boolean;
    detectOutliers?: boolean;
  }
): Promise<CleaningTask> {
  const response = await dataApi.post<CleaningTask>("/cleansing", {
    datasetId,
    ...options,
  });
  return response.data;
}

/* ── Smart Analysis (NL Query) ──────────────────────────────────────── */

export interface SmartAnalysisResult {
  query: string;
  answer: string;
  data: Record<string, unknown>[];
  charts: { type: string; config: Record<string, unknown> }[];
}

export async function runSmartAnalysis(
  query: string,
  datasetId?: string
): Promise<SmartAnalysisResult> {
  const response = await dataApi.post<SmartAnalysisResult>("/nl-query", {
    query,
    datasetId,
  });
  return response.data;
}

/* ── Joins / Relationships ──────────────────────────────────────────── */

export interface JoinConfig {
  id: string;
  name: string;
  leftDatasetId: string;
  rightDatasetId: string;
  joinType: string;
  leftColumn: string;
  rightColumn: string;
  status: string;
  createdAt: string;
}

export async function getJoins(): Promise<PaginatedResponse<JoinConfig>> {
  const response = await dataApi.get<PaginatedResponse<JoinConfig>>("/join-builder");
  return response.data;
}
