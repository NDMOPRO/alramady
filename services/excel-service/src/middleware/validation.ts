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

// MOD-0011: Formula Execution Engine schemas
export const formulaCreateSchema = z.object({
  workbookId: z.string().uuid(),
  sheetName: z.string().min(1).max(255),
  cellRef: z.string().min(1).max(50),
  expression: z.string().min(1).max(10000),
  formulaType: z.string().max(100).default('standard'),
  dependencies: z.array(z.string()).default([]),
  isVolatile: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const formulaUpdateSchema = z.object({
  expression: z.string().min(1).max(10000).optional(),
  formulaType: z.string().max(100).optional(),
  dependencies: z.array(z.string()).optional(),
  isVolatile: z.boolean().optional(),
  cachedResult: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const formulaBatchExecuteSchema = z.object({
  workbookId: z.string().uuid(),
  formulas: z.array(z.object({
    cellRef: z.string().min(1).max(50),
    expression: z.string().min(1).max(10000),
  })).min(1).max(1000),
  recalculate: z.boolean().default(false),
});

// MOD-0012: Professional Formatting schemas
export const formattingCreateSchema = z.object({
  workbookId: z.string().uuid(),
  sheetName: z.string().min(1).max(255),
  range: z.string().min(1).max(100),
  formatType: z.string().min(1).max(100),
  styles: z.record(z.unknown()),
  conditionalRules: z.array(z.record(z.unknown())).optional(),
  numberFormat: z.string().max(100).optional(),
  fontFamily: z.string().max(100).optional(),
  fontSize: z.number().min(1).max(400).optional(),
  fontColor: z.string().max(50).optional(),
  backgroundColor: z.string().max(50).optional(),
  borderStyle: z.record(z.unknown()).optional(),
  alignment: z.record(z.unknown()).optional(),
  protection: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const formattingUpdateSchema = z.object({
  range: z.string().min(1).max(100).optional(),
  formatType: z.string().max(100).optional(),
  styles: z.record(z.unknown()).optional(),
  conditionalRules: z.array(z.record(z.unknown())).optional(),
  numberFormat: z.string().max(100).optional(),
  fontFamily: z.string().max(100).optional(),
  fontSize: z.number().min(1).max(400).optional(),
  fontColor: z.string().max(50).optional(),
  backgroundColor: z.string().max(50).optional(),
  borderStyle: z.record(z.unknown()).optional(),
  alignment: z.record(z.unknown()).optional(),
  protection: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0013: Excel File Matching schemas
export const matchingCreateSchema = z.object({
  workbookId: z.string().uuid(),
  sourceSheetName: z.string().min(1).max(255),
  targetSheetName: z.string().min(1).max(255),
  matchColumns: z.array(z.object({
    sourceColumn: z.string().min(1),
    targetColumn: z.string().min(1),
    matchType: z.enum(['exact', 'fuzzy', 'contains', 'regex']).default('exact'),
    threshold: z.number().min(0).max(1).optional(),
  })).min(1),
  outputConfig: z.record(z.unknown()).optional(),
  matchStrategy: z.enum(['inner', 'left', 'right', 'full', 'cross']).default('inner'),
  deduplication: z.boolean().default(false),
  caseSensitive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const matchingUpdateSchema = z.object({
  matchColumns: z.array(z.object({
    sourceColumn: z.string().min(1),
    targetColumn: z.string().min(1),
    matchType: z.enum(['exact', 'fuzzy', 'contains', 'regex']).default('exact'),
    threshold: z.number().min(0).max(1).optional(),
  })).optional(),
  outputConfig: z.record(z.unknown()).optional(),
  matchStrategy: z.enum(['inner', 'left', 'right', 'full', 'cross']).optional(),
  deduplication: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  status: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0014: Easy/Advanced Mode schemas
export const modeCreateSchema = z.object({
  workbookId: z.string().uuid(),
  modeName: z.enum(['easy', 'advanced']),
  config: z.record(z.unknown()),
  enabledFeatures: z.array(z.string()).default([]),
  toolbarLayout: z.record(z.unknown()).optional(),
  ribbonConfig: z.record(z.unknown()).optional(),
  shortcutsEnabled: z.boolean().default(true),
  autoSave: z.boolean().default(true),
  autoSaveInterval: z.number().int().min(5).max(600).default(30),
  metadata: z.record(z.unknown()).optional(),
});

export const modeUpdateSchema = z.object({
  modeName: z.enum(['easy', 'advanced']).optional(),
  config: z.record(z.unknown()).optional(),
  enabledFeatures: z.array(z.string()).optional(),
  toolbarLayout: z.record(z.unknown()).optional(),
  ribbonConfig: z.record(z.unknown()).optional(),
  shortcutsEnabled: z.boolean().optional(),
  autoSave: z.boolean().optional(),
  autoSaveInterval: z.number().int().min(5).max(600).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Workbook schemas
export const workbookCreateSchema = z.object({
  name: z.string().min(1).max(500),
  datasetId: z.string().uuid().optional(),
  sheetsJson: z.record(z.unknown()).optional(),
  formulasJson: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const workbookUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  sheetsJson: z.record(z.unknown()).optional(),
  formulasJson: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0015: Formula V2 schemas
export const formulaV2CallSchema = z.object({
  args: z.array(z.any()).default([]),
  context: z.record(z.any()).optional(),
});

export const formulaV2BatchSchema = z.object({
  formulas: z.array(z.object({
    id: z.string(),
    expression: z.string().min(1),
    context: z.record(z.any()).optional(),
  })).min(1).max(1000),
});

export const nlToFormulaSchema = z.object({
  text: z.string().min(1).max(2000),
  context: z.object({
    columns: z.array(z.string()).optional(),
    sampleData: z.array(z.any()).optional(),
    sheetName: z.string().optional(),
  }).optional(),
});

export const convertDateSchema = z.object({
  value: z.union([z.string(), z.number()]),
  fromFormat: z.string(),
  toFormat: z.string(),
  calendar: z.enum(['gregorian', 'hijri']).optional(),
});

export const convertCurrencySchema = z.object({
  amount: z.number(),
  from: z.string().length(3),
  to: z.string().length(3),
  rate: z.number().positive().optional(),
});

// MOD-0016: Professional Formatting schemas
export const themeApplySchema = z.object({
  theme: z.enum([
    'corporate-blue', 'modern-green', 'elegant-gray', 'bold-red',
    'ocean-teal', 'sunset-orange', 'midnight-purple', 'nature-earth',
    'minimal-white', 'dark-professional',
  ]),
});

export const brandApplySchema = z.object({
  name: z.string().min(1),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  accentColor: z.string(),
  fontFamily: z.string(),
  headerFontFamily: z.string().optional(),
  logoUrl: z.string().optional(),
});

export const culturalFormatSchema = z.object({
  sheet: z.string().min(1),
  range: z.string().min(1),
  locale: z.string().min(2),
  type: z.enum(['date', 'currency', 'number']).default('date'),
});

export const coverPageSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  date: z.string().optional(),
  organization: z.string().optional(),
  theme: z.string().optional(),
});

export const designConstraintsSchema = z.object({
  maxColors: z.number().int().positive().optional(),
  maxFonts: z.number().int().positive().optional(),
  requiredFontFamily: z.string().optional(),
  requiredColors: z.array(z.string()).optional(),
  maxFontSize: z.number().positive().optional(),
  minFontSize: z.number().positive().optional(),
  requireAlternateRows: z.boolean().optional(),
  requireHeaders: z.boolean().optional(),
});

// MOD-0017: Excel Matching schemas
export const matchCompareSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

export const brandComplianceSchema = z.object({
  workbookId: z.string().uuid(),
  brand: z.object({
    name: z.string(),
    primaryColor: z.string(),
    secondaryColor: z.string(),
    accentColor: z.string(),
    fontFamily: z.string(),
    headerFontFamily: z.string().optional(),
    logo: z.string().optional(),
    watermark: z.string().optional(),
  }),
});

// MOD-0018: Modes V2 schemas
export const detailLevelSchema = z.object({
  level: z.enum(['minimal', 'standard', 'detailed', 'full']),
});

export const dragDropSchema = z.object({
  type: z.enum(['sheet', 'column', 'row']),
  sourceIndex: z.number().int().min(0),
  targetIndex: z.number().int().min(0),
  sheet: z.string().optional(),
});
