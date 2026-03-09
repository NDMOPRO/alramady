/**
 * Rasid Platform - Shared API Response Types
 *
 * Standardized response envelopes used by all 13 microservices.
 */

// ---------------------------------------------------------------------------
// Base response envelope
// ---------------------------------------------------------------------------

/**
 * Every API response is wrapped in this envelope.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  messageAr?: string;
  requestId?: string;
  timestamp: string;
}

/**
 * Error response envelope.
 */
export interface ApiErrorResponse {
  success: false;
  data: null;
  error: ApiError;
  requestId?: string;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  messageAr?: string;
  details?: Record<string, unknown>;
  validationErrors?: ValidationError[];
  statusCode: number;
}

export interface ValidationError {
  field: string;
  message: string;
  messageAr?: string;
  rule: string;
  value?: unknown;
}

// ---------------------------------------------------------------------------
// Paginated response
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// ---------------------------------------------------------------------------
// List response (non-paginated)
// ---------------------------------------------------------------------------

export interface ListResponse<T> extends ApiResponse<T[]> {
  count: number;
}

// ---------------------------------------------------------------------------
// Single item response
// ---------------------------------------------------------------------------

export type ItemResponse<T> = ApiResponse<T>;

// ---------------------------------------------------------------------------
// Created / Updated / Deleted responses
// ---------------------------------------------------------------------------

export interface CreatedResponse<T> extends ApiResponse<T> {
  /** HTTP 201 */
  success: true;
}

export interface UpdatedResponse<T> extends ApiResponse<T> {
  success: true;
}

export interface DeletedResponse extends ApiResponse<null> {
  success: true;
  /** ID of the deleted resource */
  deletedId: string;
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export interface BulkOperationResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{
    index: number;
    id?: string;
    error: string;
  }>;
}

export type BulkResponse = ApiResponse<BulkOperationResult>;

// ---------------------------------------------------------------------------
// Health check response
// ---------------------------------------------------------------------------

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
  dependencies: HealthDependency[];
}

export interface HealthDependency {
  name: string;
  status: 'ok' | 'down';
  responseTimeMs?: number;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// File upload response
// ---------------------------------------------------------------------------

export interface FileUploadResponse {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  thumbnailUrl?: string;
}

// ---------------------------------------------------------------------------
// Job / async operation response
// ---------------------------------------------------------------------------

export interface AsyncJobResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  estimatedTimeMs?: number;
  resultUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helper type constructors
// ---------------------------------------------------------------------------

/** Wraps a type T in a successful ApiResponse */
export type SuccessResponse<T> = ApiResponse<T> & { success: true };

/** Union of success or error response */
export type ApiResult<T> = SuccessResponse<T> | ApiErrorResponse;

// ---------------------------------------------------------------------------
// Error code constants
// ---------------------------------------------------------------------------

export const ErrorCodes = {
  // General
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',

  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // Data
  DATASOURCE_ERROR: 'DATASOURCE_ERROR',
  PARSING_ERROR: 'PARSING_ERROR',
  PIPELINE_ERROR: 'PIPELINE_ERROR',

  // File
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  UPLOAD_FAILED: 'UPLOAD_FAILED',

  // AI
  AI_QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',
  AI_MODEL_ERROR: 'AI_MODEL_ERROR',

  // Conversion
  CONVERSION_FAILED: 'CONVERSION_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
