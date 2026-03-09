/**
 * RASID Platform - Common Shared Types
 *
 * Foundational types used across all 13 microservices.
 */

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginationParams {
  /** Page number, 1-based. Default: 1 */
  page?: number;
  /** Number of items per page. Default: 20, Max: 100 */
  pageSize?: number;
}

export interface SortParams {
  /** Field name to sort by */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  message?: string;
  timestamp: string;
  requestId?: string;
}

// ---------------------------------------------------------------------------
// API Response Envelope
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  messageAr?: string;
  requestId?: string;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  messageAr?: string;
  details?: Record<string, unknown>;
  statusCode: number;
  stack?: string;
}

// ---------------------------------------------------------------------------
// Service Health
// ---------------------------------------------------------------------------

export interface ServiceHealth {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  dependencies: Array<{
    name: string;
    status: 'ok' | 'down';
    responseTimeMs?: number;
    details?: Record<string, unknown>;
  }>;
}

// ---------------------------------------------------------------------------
// File Upload
// ---------------------------------------------------------------------------

export interface FileUpload {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  url: string;
  thumbnailUrl?: string;
  uploadedBy: string;
  uploadedAt: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Date Range
// ---------------------------------------------------------------------------

export interface DateRange {
  startDate: string;
  endDate: string;
  timezone?: string;
}

// ---------------------------------------------------------------------------
// Key-Value
// ---------------------------------------------------------------------------

export interface KeyValue {
  key: string;
  value: string | number | boolean | null;
  label?: string;
  labelAr?: string;
  group?: string;
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// Base entity fields shared by all models
// ---------------------------------------------------------------------------

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// ---------------------------------------------------------------------------
// User context passed through services
// ---------------------------------------------------------------------------

export interface UserContext {
  userId: string;
  email: string;
  roles: string[];
  tenantId?: string;
  locale: 'ar' | 'en';
  permissions?: string[];
}

// ---------------------------------------------------------------------------
// Bulk operation result
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

// ---------------------------------------------------------------------------
// Async job status
// ---------------------------------------------------------------------------

export interface AsyncJobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  estimatedTimeMs?: number;
  resultUrl?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}
