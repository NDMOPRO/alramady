/**
 * Rasid Platform - Shared Pagination Types
 *
 * Standardized pagination request/response types used across all services.
 */

// ---------------------------------------------------------------------------
// Pagination request parameters
// ---------------------------------------------------------------------------

/**
 * Query parameters for paginated list endpoints.
 *
 * Example: GET /api/v1/data/datasets?page=2&pageSize=25&sortBy=created_at&sortOrder=desc
 */
export interface PaginationParams {
  /** Page number (1-based). Default: 1 */
  page?: number;
  /** Number of items per page. Default: 20, Max: 100 */
  pageSize?: number;
  /** Field to sort by */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: SortOrder;
}

export type SortOrder = 'asc' | 'desc';

/**
 * Extended pagination with search and filter support.
 */
export interface PaginationWithSearch extends PaginationParams {
  /** Full-text search query */
  search?: string;
  /** Filter by specific fields (JSON-encoded key-value pairs) */
  filters?: Record<string, unknown>;
  /** Locale for localized sorting and search */
  locale?: 'ar' | 'en';
}

// ---------------------------------------------------------------------------
// Pagination metadata (response)
// ---------------------------------------------------------------------------

/**
 * Metadata included in paginated API responses.
 */
export interface PaginationMeta {
  /** Current page number (1-based) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of items across all pages */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether a next page exists */
  hasNextPage: boolean;
  /** Whether a previous page exists */
  hasPreviousPage: boolean;
}

// ---------------------------------------------------------------------------
// Cursor-based pagination (for large datasets / real-time feeds)
// ---------------------------------------------------------------------------

/**
 * Cursor-based pagination request.
 *
 * Example: GET /api/v1/ai/conversations?cursor=abc123&limit=50
 */
export interface CursorPaginationParams {
  /** Opaque cursor string pointing to the current position */
  cursor?: string;
  /** Number of items to return. Default: 20, Max: 100 */
  limit?: number;
  /** Direction of pagination */
  direction?: 'forward' | 'backward';
}

/**
 * Cursor-based pagination metadata (response).
 */
export interface CursorPaginationMeta {
  /** Cursor for the next page (null if no more items) */
  nextCursor: string | null;
  /** Cursor for the previous page (null if at start) */
  previousCursor: string | null;
  /** Whether more items exist in the forward direction */
  hasMore: boolean;
  /** Number of items returned in this response */
  count: number;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Default pagination values */
export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 20,
  maxPageSize: 100,
  sortOrder: 'desc' as SortOrder,
} as const;

/**
 * Normalize raw query parameters into validated PaginationParams.
 */
export function normalizePaginationParams(
  raw: Record<string, string | string[] | undefined>,
): Required<PaginationParams> {
  const page = Math.max(1, parseInt(String(raw.page || ''), 10) || PAGINATION_DEFAULTS.page);
  const rawPageSize = parseInt(String(raw.pageSize || raw.page_size || ''), 10) || PAGINATION_DEFAULTS.pageSize;
  const pageSize = Math.min(Math.max(1, rawPageSize), PAGINATION_DEFAULTS.maxPageSize);
  const sortBy = String(raw.sortBy || raw.sort_by || 'created_at');
  const rawOrder = String(raw.sortOrder || raw.sort_order || PAGINATION_DEFAULTS.sortOrder).toLowerCase();
  const sortOrder: SortOrder = rawOrder === 'asc' ? 'asc' : 'desc';

  return { page, pageSize, sortBy, sortOrder };
}

/**
 * Calculate pagination metadata from total count and current params.
 */
export function buildPaginationMeta(
  totalItems: number,
  params: Required<PaginationParams>,
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(totalItems / params.pageSize));
  return {
    page: params.page,
    pageSize: params.pageSize,
    totalItems,
    totalPages,
    hasNextPage: params.page < totalPages,
    hasPreviousPage: params.page > 1,
  };
}

/**
 * Calculate SQL/Prisma skip & take from pagination params.
 */
export function toSkipTake(params: Required<PaginationParams>): {
  skip: number;
  take: number;
} {
  return {
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize,
  };
}

/**
 * Build an order-by clause compatible with Prisma.
 */
export function toOrderBy(
  params: Required<PaginationParams>,
): Record<string, SortOrder> {
  return { [params.sortBy]: params.sortOrder };
}
