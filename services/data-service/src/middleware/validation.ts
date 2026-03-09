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

export const datasetCreateSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  sourceType: z.string().min(1).max(100),
  sourceConfig: z.record(z.unknown()).optional(),
  fileType: z.string().max(50).optional(),
  filePath: z.string().max(1000).optional(),
  fileSize: z.number().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
  workspaceId: z.string().uuid().optional(),
});

export const datasetUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  sourceConfig: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.string().max(50).optional(),
  isArchived: z.boolean().optional(),
});

export const dataSourceCreateSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  description: z.string().optional(),
  connectionConfig: z.record(z.unknown()).optional(),
  isEnabled: z.boolean().default(true),
  iconUrl: z.string().max(500).optional(),
  supportedFormats: z.array(z.string()).default([]),
  maxFileSize: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const dataSourceUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  description: z.string().optional(),
  connectionConfig: z.record(z.unknown()).optional(),
  isEnabled: z.boolean().optional(),
  iconUrl: z.string().max(500).optional(),
  supportedFormats: z.array(z.string()).optional(),
  maxFileSize: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const capacityCreateSchema = z.object({
  organizationId: z.string().uuid(),
  totalBytes: z.number().positive(),
  maxDatasets: z.number().int().positive(),
  maxRowsPerDataset: z.number().int().positive().optional(),
  tier: z.string().max(50).default('standard'),
  isUnlimited: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const capacityUpdateSchema = z.object({
  totalBytes: z.number().positive().optional(),
  usedBytes: z.number().min(0).optional(),
  maxDatasets: z.number().int().positive().optional(),
  maxRowsPerDataset: z.number().int().positive().optional(),
  tier: z.string().max(50).optional(),
  isUnlimited: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const importCreateSchema = z.object({
  datasetId: z.string().uuid(),
  jobType: z.string().min(1).max(50),
  priority: z.number().int().min(0).max(10).default(0),
  sourceConfig: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const importUpdateSchema = z.object({
  status: z.string().max(50).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  progress: z.number().min(0).max(100).optional(),
  totalRows: z.number().int().optional(),
  processedRows: z.number().int().optional(),
  failedRows: z.number().int().optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const classificationCreateSchema = z.object({
  fileName: z.string().min(1).max(500),
  fileType: z.string().min(1).max(50),
  fileSize: z.number().positive(),
  mimeType: z.string().max(255).optional(),
  classifiedType: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1),
  aiModel: z.string().max(100).optional(),
  suggestedSchema: z.record(z.unknown()).optional(),
  detectedEncoding: z.string().max(50).optional(),
  detectedDelimiter: z.string().max(10).optional(),
  previewData: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const classificationUpdateSchema = z.object({
  classifiedType: z.string().max(100).optional(),
  confidence: z.number().min(0).max(1).optional(),
  aiModel: z.string().max(100).optional(),
  suggestedSchema: z.record(z.unknown()).optional(),
  detectedEncoding: z.string().max(50).optional(),
  detectedDelimiter: z.string().max(10).optional(),
  previewData: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const readingCreateSchema = z.object({
  datasetId: z.string().uuid(),
  sessionType: z.string().min(1).max(50),
  pageSize: z.number().int().min(1).max(1000).default(50),
  filters: z.record(z.unknown()).optional(),
  sortConfig: z.record(z.unknown()).optional(),
  highlightRules: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const readingUpdateSchema = z.object({
  cursorPosition: z.record(z.unknown()).optional(),
  filters: z.record(z.unknown()).optional(),
  sortConfig: z.record(z.unknown()).optional(),
  pageSize: z.number().int().min(1).max(1000).optional(),
  currentPage: z.number().int().positive().optional(),
  highlightRules: z.record(z.unknown()).optional(),
  bookmarks: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const columnCreateSchema = z.object({
  datasetId: z.string().uuid(),
  name: z.string().min(1).max(500),
  originalName: z.string().max(500).optional(),
  dataType: z.string().min(1).max(100),
  inferredType: z.string().max(100).optional(),
  displayOrder: z.number().int().default(0),
  isVisible: z.boolean().default(true),
  isRequired: z.boolean().default(false),
  isPrimaryKey: z.boolean().default(false),
  defaultValue: z.string().max(1000).optional(),
  format: z.string().max(255).optional(),
  minValue: z.string().max(255).optional(),
  maxValue: z.string().max(255).optional(),
  transformations: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const columnUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  dataType: z.string().max(100).optional(),
  inferredType: z.string().max(100).optional(),
  displayOrder: z.number().int().optional(),
  isVisible: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  isPrimaryKey: z.boolean().optional(),
  defaultValue: z.string().max(1000).optional(),
  format: z.string().max(255).optional(),
  minValue: z.string().max(255).optional(),
  maxValue: z.string().max(255).optional(),
  transformations: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const tableViewCreateSchema = z.object({
  datasetId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  viewType: z.string().max(50).default('table'),
  columnConfig: z.record(z.unknown()).optional(),
  filterConfig: z.record(z.unknown()).optional(),
  sortConfig: z.record(z.unknown()).optional(),
  groupConfig: z.record(z.unknown()).optional(),
  aggregateConfig: z.record(z.unknown()).optional(),
  pivotConfig: z.record(z.unknown()).optional(),
  isDefault: z.boolean().default(false),
  isShared: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const tableViewUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  viewType: z.string().max(50).optional(),
  columnConfig: z.record(z.unknown()).optional(),
  filterConfig: z.record(z.unknown()).optional(),
  sortConfig: z.record(z.unknown()).optional(),
  groupConfig: z.record(z.unknown()).optional(),
  aggregateConfig: z.record(z.unknown()).optional(),
  pivotConfig: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  isShared: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const visualProcessingCreateSchema = z.object({
  datasetId: z.string().uuid(),
  processingType: z.string().min(1).max(100),
  inputConfig: z.record(z.unknown()).optional(),
  outputConfig: z.record(z.unknown()).optional(),
  chartType: z.string().max(50).optional(),
  visualConfig: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const visualProcessingUpdateSchema = z.object({
  status: z.string().max(50).optional(),
  inputConfig: z.record(z.unknown()).optional(),
  outputConfig: z.record(z.unknown()).optional(),
  chartType: z.string().max(50).optional(),
  visualConfig: z.record(z.unknown()).optional(),
  resultData: z.record(z.unknown()).optional(),
  thumbnailUrl: z.string().max(500).optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const cleansingRuleCreateSchema = z.object({
  datasetId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  ruleType: z.string().min(1).max(100),
  columnName: z.string().max(500).optional(),
  config: z.record(z.unknown()),
  priority: z.number().int().default(0),
  isEnabled: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const cleansingRuleUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  ruleType: z.string().max(100).optional(),
  columnName: z.string().max(500).optional(),
  config: z.record(z.unknown()).optional(),
  priority: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const mixedFileCreateSchema = z.object({
  datasetId: z.string().uuid(),
  fileName: z.string().min(1).max(500),
  fileType: z.string().min(1).max(50),
  fileSize: z.number().positive(),
  filePath: z.string().min(1).max(1000),
  sheetName: z.string().max(255).optional(),
  sheetIndex: z.number().int().optional(),
  extractedData: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const mixedFileUpdateSchema = z.object({
  fileName: z.string().max(500).optional(),
  fileType: z.string().max(50).optional(),
  filePath: z.string().max(1000).optional(),
  sheetName: z.string().max(255).optional(),
  sheetIndex: z.number().int().optional(),
  extractedData: z.record(z.unknown()).optional(),
  status: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const qualityCheckCreateSchema = z.object({
  datasetId: z.string().uuid(),
  checkType: z.string().min(1).max(100),
  checkName: z.string().min(1).max(255),
  severity: z.enum(['info', 'warning', 'error', 'critical']).default('info'),
  columnName: z.string().max(500).optional(),
  rule: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const qualityCheckUpdateSchema = z.object({
  status: z.string().max(50).optional(),
  severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
  result: z.record(z.unknown()).optional(),
  affectedRows: z.number().int().optional(),
  totalRows: z.number().int().optional(),
  passRate: z.number().min(0).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});
