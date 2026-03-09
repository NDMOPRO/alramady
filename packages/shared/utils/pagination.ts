/**
 * RASID Platform - Pagination Utilities
 *
 * Helper functions for building Prisma-compatible pagination queries
 * and assembling paginated API responses.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortOrder = 'asc' | 'desc';

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: SortOrder;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  success: boolean;
  data: T[];
  pagination: PaginationMeta;
  timestamp: string;
}

export interface PrismaQueryArgs {
  skip: number;
  take: number;
  orderBy: Record<string, SortOrder>;
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 20,
  maxPageSize: 100,
  sortBy: 'createdAt',
  sortOrder: 'desc' as SortOrder,
} as const;

// ---------------------------------------------------------------------------
// buildPaginationQuery
// ---------------------------------------------------------------------------

/**
 * Build a Prisma-compatible query object from raw pagination parameters.
 *
 * Handles:
 *  - Page/pageSize normalization (clamping, defaults)
 *  - skip/take calculation
 *  - orderBy construction from sortBy + sortOrder
 *  - Nested field sorting (e.g., "user.name" becomes { user: { name: 'asc' } })
 *
 * @param rawParams - Partial pagination params (typically from query string)
 * @returns Object with { skip, take, orderBy } ready for Prisma, plus normalized params.
 */
export function buildPaginationQuery(rawParams: Partial<PaginationParams> & Record<string, unknown> = {}): {
  prismaArgs: PrismaQueryArgs;
  params: PaginationParams;
} {
  // Normalize page number
  const rawPage = typeof rawParams.page === 'string' ? parseInt(rawParams.page, 10) : rawParams.page;
  const page = Math.max(1, Math.floor(rawPage || PAGINATION_DEFAULTS.page));

  // Normalize page size with upper bound
  const rawPageSize = typeof rawParams.pageSize === 'string' ? parseInt(rawParams.pageSize, 10) : rawParams.pageSize;
  const parsedPageSize = rawPageSize || PAGINATION_DEFAULTS.pageSize;
  const pageSize = Math.min(
    Math.max(1, Math.floor(parsedPageSize)),
    PAGINATION_DEFAULTS.maxPageSize
  );

  // Normalize sort field (prevent SQL injection by allowing only alphanumeric, dots, underscores)
  const rawSortBy = (rawParams.sortBy as string) || PAGINATION_DEFAULTS.sortBy;
  const sortBy = /^[a-zA-Z0-9_.]+$/.test(rawSortBy) ? rawSortBy : PAGINATION_DEFAULTS.sortBy;

  // Normalize sort order
  const rawSortOrder = ((rawParams.sortOrder as string) || '').toLowerCase();
  const sortOrder: SortOrder = rawSortOrder === 'asc' ? 'asc' : 'desc';

  // Calculate skip and take
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  // Build orderBy - support nested fields like "user.name"
  let orderBy: Record<string, unknown> = {};
  const sortParts = sortBy.split('.');
  if (sortParts.length === 1) {
    orderBy = { [sortBy]: sortOrder };
  } else {
    // Build nested object: "user.name" => { user: { name: 'desc' } }
    let current: Record<string, unknown> = {};
    const root = current;
    for (let i = 0; i < sortParts.length - 1; i++) {
      const nested: Record<string, unknown> = {};
      current[sortParts[i]] = nested;
      current = nested;
    }
    current[sortParts[sortParts.length - 1]] = sortOrder;
    orderBy = root;
  }

  const params: PaginationParams = { page, pageSize, sortBy, sortOrder };
  const prismaArgs: PrismaQueryArgs = { skip, take, orderBy: orderBy as Record<string, SortOrder> };

  return { prismaArgs, params };
}

// ---------------------------------------------------------------------------
// buildPaginatedResponse
// ---------------------------------------------------------------------------

/**
 * Assemble a fully structured paginated response from data + total count.
 *
 * @param data       - The array of items for the current page
 * @param totalItems - Total count of items across all pages (from Prisma count query)
 * @param params     - The normalized pagination params used for the query
 * @returns A PaginatedResult with data, pagination metadata, and timestamp
 */
export function buildPaginatedResponse<T>(
  data: T[],
  totalItems: number,
  params: PaginationParams
): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(totalItems / params.pageSize));
  const clampedPage = Math.min(params.page, totalPages);
  const hasNextPage = clampedPage < totalPages;
  const hasPreviousPage = clampedPage > 1;

  const pagination: PaginationMeta = {
    page: clampedPage,
    pageSize: params.pageSize,
    totalItems,
    totalPages,
    hasNextPage,
    hasPreviousPage,
  };

  return {
    success: true,
    data,
    pagination,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Cursor-based pagination helpers
// ---------------------------------------------------------------------------

export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
  direction: 'forward' | 'backward';
}

export interface CursorPaginatedResult<T> {
  success: boolean;
  data: T[];
  cursor: {
    next: string | null;
    previous: string | null;
    hasMore: boolean;
    count: number;
  };
  timestamp: string;
}

/**
 * Build a Prisma-compatible cursor-based pagination query.
 * Fetches limit+1 items to determine if there are more results.
 */
export function buildCursorQuery(rawParams: Partial<CursorPaginationParams> = {}): {
  prismaArgs: { cursor?: { id: string }; take: number; skip: number };
  params: CursorPaginationParams;
} {
  const rawLimit = typeof rawParams.limit === 'string' ? parseInt(rawParams.limit as string, 10) : rawParams.limit;
  const limit = Math.min(Math.max(1, rawLimit || 20), 100);
  const direction = rawParams.direction || 'forward';
  const cursor = rawParams.cursor || undefined;

  const take = direction === 'forward' ? limit + 1 : -(limit + 1);

  const prismaArgs: { cursor?: { id: string }; take: number; skip: number } = {
    take,
    skip: cursor ? 1 : 0,
  };

  if (cursor) {
    prismaArgs.cursor = { id: cursor };
  }

  return {
    prismaArgs,
    params: { cursor, limit, direction },
  };
}

/**
 * Build a cursor-based paginated response from fetched data.
 * Assumes data was fetched with limit+1 to detect hasMore.
 */
export function buildCursorResponse<T extends { id: string }>(
  data: T[],
  params: CursorPaginationParams
): CursorPaginatedResult<T> {
  const hasMore = data.length > params.limit;
  const items = hasMore ? data.slice(0, params.limit) : data;

  const firstItem = items.length > 0 ? items[0] : null;
  const lastItem = items.length > 0 ? items[items.length - 1] : null;

  const nextCursor = hasMore && lastItem ? lastItem.id : null;
  const previousCursor = params.cursor && firstItem ? firstItem.id : null;

  return {
    success: true,
    data: items,
    cursor: {
      next: nextCursor,
      previous: previousCursor,
      hasMore,
      count: items.length,
    },
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Utility: normalize raw query params from Express req.query
// ---------------------------------------------------------------------------

/**
 * Extract and normalize pagination params from an Express-style query object.
 * Safely handles string values from query strings.
 */
export function extractPaginationFromQuery(
  query: Record<string, string | string[] | undefined>
): Partial<PaginationParams> {
  const page = query.page ? parseInt(String(query.page), 10) : undefined;
  const pageSize = query.pageSize || query.page_size;
  const parsedPageSize = pageSize ? parseInt(String(pageSize), 10) : undefined;
  const sortBy = query.sortBy || query.sort_by;
  const sortOrder = query.sortOrder || query.sort_order;

  return {
    page: page && !isNaN(page) ? page : undefined,
    pageSize: parsedPageSize && !isNaN(parsedPageSize) ? parsedPageSize : undefined,
    sortBy: sortBy ? String(sortBy) : undefined,
    sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined,
  };
}
