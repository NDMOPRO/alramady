/**
 * RASID Platform - Zod Validation Schemas
 *
 * Reusable Zod schemas for common validation patterns used across all services.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

/**
 * Validates an email address with reasonable strictness.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'Email must be at least 5 characters')
  .max(255, 'Email must not exceed 255 characters')
  .email('Invalid email address format')
  .refine(
    (email) => {
      const parts = email.split('@');
      if (parts.length !== 2) return false;
      const domain = parts[1];
      return domain.includes('.') && domain.length >= 3 && !domain.startsWith('.') && !domain.endsWith('.');
    },
    { message: 'Email domain must be valid' }
  );

/**
 * Validates a UUID v4 string.
 */
export const uuidSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'Must be a valid UUID v4'
  );

/**
 * Validates a RASID feature ID (F-XXXXXX format).
 */
export const featureIdSchema = z
  .string()
  .trim()
  .regex(/^F-\d{6}$/, 'Must be a valid feature ID in F-XXXXXX format')
  .refine(
    (id) => {
      const num = parseInt(id.replace('F-', ''), 10);
      return num >= 1 && num <= 5412;
    },
    { message: 'Feature ID must be between F-000001 and F-005412' }
  );

/**
 * Validates a non-empty string with configurable length bounds.
 */
export function stringSchema(minLen = 1, maxLen = 500): z.ZodString {
  return z
    .string()
    .trim()
    .min(minLen, `Must be at least ${minLen} characters`)
    .max(maxLen, `Must not exceed ${maxLen} characters`);
}

/**
 * Validates a password meeting RASID security requirements.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// ---------------------------------------------------------------------------
// Pagination schema
// ---------------------------------------------------------------------------

/**
 * Validates and normalizes pagination query parameters.
 * Coerces string values from query strings to numbers automatically.
 */
export const paginationSchema = z.object({
  page: z
    .union([z.string(), z.number()])
    .transform((val) => {
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      return isNaN(num) || num < 1 ? 1 : Math.floor(num);
    })
    .default(1),
  pageSize: z
    .union([z.string(), z.number()])
    .transform((val) => {
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      if (isNaN(num) || num < 1) return 20;
      return Math.min(Math.floor(num), 100);
    })
    .default(20),
  sortBy: z.string().trim().max(100).default('createdAt'),
  sortOrder: z
    .enum(['asc', 'desc'])
    .default('desc'),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// ---------------------------------------------------------------------------
// Date range schema
// ---------------------------------------------------------------------------

/**
 * Validates a date range ensuring startDate <= endDate.
 */
export const dateRangeSchema = z
  .object({
    startDate: z
      .string()
      .refine(
        (val) => !isNaN(Date.parse(val)),
        { message: 'startDate must be a valid ISO 8601 date string' }
      ),
    endDate: z
      .string()
      .refine(
        (val) => !isNaN(Date.parse(val)),
        { message: 'endDate must be a valid ISO 8601 date string' }
      ),
    timezone: z.string().optional().default('UTC'),
  })
  .refine(
    (data) => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      return start <= end;
    },
    { message: 'startDate must be on or before endDate', path: ['startDate'] }
  )
  .refine(
    (data) => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      const maxRangeMs = 365 * 24 * 60 * 60 * 1000; // 1 year
      return end.getTime() - start.getTime() <= maxRangeMs;
    },
    { message: 'Date range must not exceed 1 year', path: ['endDate'] }
  );

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

// ---------------------------------------------------------------------------
// File upload schema
// ---------------------------------------------------------------------------

/**
 * Common MIME types allowed across RASID services.
 */
export const ALLOWED_MIME_TYPES = [
  'text/csv',
  'text/plain',
  'application/json',
  'application/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
  'image/gif',
] as const;

/**
 * Maximum file size: 100 MB by default.
 */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * Validates a file upload metadata object.
 */
export const fileUploadSchema = z.object({
  originalName: z
    .string()
    .trim()
    .min(1, 'File name is required')
    .max(255, 'File name must not exceed 255 characters')
    .refine(
      (name) => {
        const dangerousPatterns = [/\.\./, /[<>:"|?*\x00-\x1f]/];
        return !dangerousPatterns.some((pattern) => pattern.test(name));
      },
      { message: 'File name contains invalid characters' }
    ),
  mimeType: z
    .string()
    .trim()
    .refine(
      (mime) => (ALLOWED_MIME_TYPES as readonly string[]).includes(mime),
      { message: `Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` }
    ),
  sizeBytes: z
    .number()
    .int()
    .positive('File size must be positive')
    .max(MAX_FILE_SIZE_BYTES, `File size must not exceed ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`),
});

export type FileUploadInput = z.infer<typeof fileUploadSchema>;

// ---------------------------------------------------------------------------
// Search / filter schema
// ---------------------------------------------------------------------------

export const searchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, 'Search query must not be empty')
    .max(500, 'Search query must not exceed 500 characters'),
  fields: z.array(z.string()).optional(),
  locale: z.enum(['ar', 'en']).optional().default('en'),
  fuzzy: z.boolean().optional().default(false),
});

export type SearchInput = z.infer<typeof searchSchema>;

// ---------------------------------------------------------------------------
// ID params schema (common route param validation)
// ---------------------------------------------------------------------------

export const idParamSchema = z.object({
  id: uuidSchema,
});

export type IdParamInput = z.infer<typeof idParamSchema>;

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/**
 * Validate data against a Zod schema. Returns parsed data or throws ValidationError-compatible info.
 * This is a convenience wrapper that formats Zod errors into RASID ValidationIssue shape.
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const issues = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    rule: issue.code,
    value: undefined as unknown,
  }));
  const fieldList = issues.map((i) => i.field).join(', ');
  const error = new Error(`Validation failed: ${fieldList}`) as Error & {
    statusCode: number;
    code: string;
    validationErrors: typeof issues;
  };
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  error.validationErrors = issues;
  throw error;
}

/**
 * Safe parse wrapper that returns a discriminated union instead of throwing.
 */
export function validateSafe<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Array<{ field: string; message: string; rule: string }> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    rule: issue.code,
  }));
  return { success: false, errors };
}
