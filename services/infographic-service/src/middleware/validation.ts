import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from './errorHandler';

// --- Validation middleware ---
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: Record<string, string[]> = {};
        err.errors.forEach((e) => {
          const path = e.path.join('.');
          if (!errors[path]) errors[path] = [];
          errors[path].push(e.message);
        });
        next(new ValidationError('Validation failed', errors));
      } else {
        next(err);
      }
    }
  };
}

// --- Common schemas ---
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const idParamSchema = z.object({ id: z.string().uuid() });

// ==============================
// MOD-0038: Professional Infographic schemas
// ==============================
export const professionalCreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  infographicType: z.enum([
    'statistical', 'informational', 'timeline', 'process', 'geographic',
    'comparison', 'hierarchical', 'list', 'resume', 'anatomical',
    'flowchart', 'survey', 'data_visualization', 'educational', 'marketing',
  ]),
  template: z.string().uuid().optional(),
  dimensions: z.object({
    width: z.number().int().min(100).max(10000).default(1080),
    height: z.number().int().min(100).max(20000).default(1920),
    unit: z.enum(['px', 'mm', 'in']).default('px'),
  }).optional(),
  colorScheme: z.array(z.string()).optional(),
  fontFamily: z.string().optional(),
  dataSource: z.object({
    type: z.enum(['manual', 'csv', 'json', 'api', 'database', 'spreadsheet']),
    config: z.record(z.unknown()).optional(),
  }).optional(),
  sections: z.array(z.object({
    title: z.string().optional(),
    type: z.enum(['header', 'text', 'chart', 'icon_grid', 'timeline', 'stat', 'image', 'divider', 'footer']),
    content: z.record(z.unknown()).optional(),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
    size: z.object({ width: z.number(), height: z.number() }).optional(),
    style: z.record(z.unknown()).optional(),
  })).optional(),
  style: z.object({
    theme: z.enum(['light', 'dark', 'colorful', 'minimal', 'corporate']).default('light'),
    borderRadius: z.number().optional(),
    padding: z.number().optional(),
    background: z.string().optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().default(false),
  language: z.string().default('ar'),
});

export const professionalUpdateSchema = professionalCreateSchema.partial();
