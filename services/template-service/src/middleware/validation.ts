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

// MOD-0079: templates-themes schemas
export const templateCreateSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  category: z.enum(['presentation', 'infographic', 'report', 'dashboard', 'chart', 'social-media', 'print', 'email', 'custom']),
  subcategory: z.string().max(100).optional(),
  type: z.enum(['system', 'community', 'custom', 'premium']).default('custom'),
  thumbnailUrl: z.string().max(1000).optional(),
  previewUrl: z.string().max(1000).optional(),
  templateData: z.record(z.unknown()),
  layout: z.record(z.unknown()).optional(),
  styles: z.record(z.unknown()).optional(),
  colorScheme: z.object({
    primary: z.string().max(20).optional(),
    secondary: z.string().max(20).optional(),
    accent: z.string().max(20).optional(),
    background: z.string().max(20).optional(),
    text: z.string().max(20).optional(),
    palette: z.array(z.string()).optional(),
  }).optional(),
  typography: z.object({
    headingFont: z.string().max(100).optional(),
    bodyFont: z.string().max(100).optional(),
    fontSize: z.number().optional(),
    lineHeight: z.number().optional(),
  }).optional(),
  dimensions: z.object({
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    unit: z.enum(['px', 'in', 'cm', 'mm']).optional(),
    orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  }).optional(),
  tags: z.array(z.string()).default([]),
  industry: z.string().max(100).optional(),
  locale: z.string().max(10).default('en'),
  isRtl: z.boolean().default(false),
  isPremium: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  version: z.string().max(50).default('1.0.0'),
  metadata: z.record(z.unknown()).optional(),
});

export const templateUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  category: z.enum(['presentation', 'infographic', 'report', 'dashboard', 'chart', 'social-media', 'print', 'email', 'custom']).optional(),
  subcategory: z.string().max(100).optional(),
  type: z.enum(['system', 'community', 'custom', 'premium']).optional(),
  thumbnailUrl: z.string().max(1000).optional(),
  previewUrl: z.string().max(1000).optional(),
  templateData: z.record(z.unknown()).optional(),
  layout: z.record(z.unknown()).optional(),
  styles: z.record(z.unknown()).optional(),
  colorScheme: z.object({
    primary: z.string().max(20).optional(),
    secondary: z.string().max(20).optional(),
    accent: z.string().max(20).optional(),
    background: z.string().max(20).optional(),
    text: z.string().max(20).optional(),
    palette: z.array(z.string()).optional(),
  }).optional(),
  typography: z.object({
    headingFont: z.string().max(100).optional(),
    bodyFont: z.string().max(100).optional(),
    fontSize: z.number().optional(),
    lineHeight: z.number().optional(),
  }).optional(),
  dimensions: z.object({
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    unit: z.enum(['px', 'in', 'cm', 'mm']).optional(),
    orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  industry: z.string().max(100).optional(),
  locale: z.string().max(10).optional(),
  isRtl: z.boolean().optional(),
  isPremium: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  version: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});
