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

// MOD-0078: media-library schemas
export const mediaCreateSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  fileName: z.string().min(1).max(500),
  fileType: z.string().min(1).max(100),
  mimeType: z.string().min(1).max(255),
  fileSize: z.number().positive(),
  filePath: z.string().min(1).max(1000),
  thumbnailPath: z.string().max(1000).optional(),
  category: z.enum(['image', 'video', 'audio', 'document', 'icon', 'font', 'animation', 'other']),
  tags: z.array(z.string()).default([]),
  altText: z.string().max(500).optional(),
  dimensions: z.object({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    duration: z.number().positive().optional(),
  }).optional(),
  colorProfile: z.string().max(50).optional(),
  resolution: z.string().max(50).optional(),
  folderId: z.string().uuid().optional(),
  isPublic: z.boolean().default(false),
  license: z.string().max(255).optional(),
  attribution: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const mediaUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  category: z.enum(['image', 'video', 'audio', 'document', 'icon', 'font', 'animation', 'other']).optional(),
  tags: z.array(z.string()).optional(),
  altText: z.string().max(500).optional(),
  folderId: z.string().uuid().optional(),
  isPublic: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  license: z.string().max(255).optional(),
  attribution: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});
