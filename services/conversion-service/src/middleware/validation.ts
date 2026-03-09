import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { z } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse(req[source]);
      req[source] = data;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: formattedErrors,
        });
        return;
      }

      next(error);
    }
  };
}

// Common validation schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

// Supported formats for conversion
const supportedFormats = [
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt',
  'csv', 'tsv', 'json', 'xml', 'yaml', 'yml',
  'html', 'htm', 'md', 'txt', 'rtf',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'tiff',
  'odt', 'ods', 'odp', 'epub',
] as const;

// MOD-0080: Conversion Engine Core schemas
export const coreCreateSchema = z.object({
  sourceFormat: z.string().min(1).max(50),
  targetFormat: z.string().min(1).max(50),
  sourcePath: z.string().min(1).max(2000),
  outputPath: z.string().max(2000).optional(),
  priority: z.number().int().min(0).max(10).default(5),
  options: z.record(z.unknown()).optional(),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const coreUpdateSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  outputPath: z.string().max(2000).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  options: z.record(z.unknown()).optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0081: Conversion Matrix schemas
export const matrixCreateSchema = z.object({
  sourceFormat: z.string().min(1).max(50),
  targetFormat: z.string().min(1).max(50),
  converterName: z.string().min(1).max(255),
  converterVersion: z.string().max(50).default('1.0.0'),
  qualityScore: z.number().min(0).max(100).default(90),
  isLossless: z.boolean().default(false),
  maxFileSize: z.number().positive().optional(),
  estimatedDuration: z.number().positive().optional(),
  supportedFeatures: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  isEnabled: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const matrixUpdateSchema = z.object({
  converterName: z.string().max(255).optional(),
  converterVersion: z.string().max(50).optional(),
  qualityScore: z.number().min(0).max(100).optional(),
  isLossless: z.boolean().optional(),
  maxFileSize: z.number().positive().optional(),
  estimatedDuration: z.number().positive().optional(),
  supportedFeatures: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
  isEnabled: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0082: Unified Document Representation schemas
export const udrCreateSchema = z.object({
  sourceJobId: z.string().uuid().optional(),
  documentName: z.string().min(1).max(500),
  documentType: z.string().min(1).max(100),
  udrVersion: z.string().max(50).default('1.0.0'),
  structure: z.record(z.unknown()),
  content: z.record(z.unknown()),
  styles: z.record(z.unknown()).optional(),
  assets: z.array(z.record(z.unknown())).optional(),
  pageLayout: z.record(z.unknown()).optional(),
  documentProperties: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const udrUpdateSchema = z.object({
  documentName: z.string().max(500).optional(),
  documentType: z.string().max(100).optional(),
  udrVersion: z.string().max(50).optional(),
  structure: z.record(z.unknown()).optional(),
  content: z.record(z.unknown()).optional(),
  styles: z.record(z.unknown()).optional(),
  assets: z.array(z.record(z.unknown())).optional(),
  pageLayout: z.record(z.unknown()).optional(),
  documentProperties: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0083: Universal Conversion schemas
export const universalCreateSchema = z.object({
  sourcePath: z.string().min(1).max(2000),
  targetFormat: z.string().min(1).max(50),
  outputPath: z.string().max(2000).optional(),
  autoDetectFormat: z.boolean().default(true),
  preserveFormatting: z.boolean().default(true),
  preserveImages: z.boolean().default(true),
  preserveLinks: z.boolean().default(true),
  ocrEnabled: z.boolean().default(false),
  ocrLanguage: z.string().max(10).default('en'),
  quality: z.enum(['draft', 'standard', 'high', 'maximum']).default('standard'),
  batchMode: z.boolean().default(false),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const universalUpdateSchema = z.object({
  targetFormat: z.string().max(50).optional(),
  outputPath: z.string().max(2000).optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  preserveFormatting: z.boolean().optional(),
  preserveImages: z.boolean().optional(),
  preserveLinks: z.boolean().optional(),
  ocrEnabled: z.boolean().optional(),
  quality: z.enum(['draft', 'standard', 'high', 'maximum']).optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
