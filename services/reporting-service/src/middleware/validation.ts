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

// ─── MOD-0023: Easy Mode (Reporting) ─────────────────────────────
export const reportEasyModeCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  reportType: z.string().max(50).default('standard'),
  dataSourceId: z.string().uuid().optional(),
  datasetId: z.string().uuid().optional(),
  layoutConfig: z.record(z.unknown()).optional(),
  chartConfig: z.array(z.record(z.unknown())).optional(),
  filterConfig: z.record(z.unknown()).optional(),
  groupByFields: z.array(z.string()).optional(),
  aggregations: z.array(z.record(z.unknown())).optional(),
  colorScheme: z.string().max(50).optional(),
  outputFormat: z.string().max(20).default('pdf'),
  scheduleConfig: z.record(z.unknown()).optional(),
  isPublic: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export const reportEasyModeUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  reportType: z.string().max(50).optional(),
  dataSourceId: z.string().uuid().optional(),
  datasetId: z.string().uuid().optional(),
  layoutConfig: z.record(z.unknown()).optional(),
  chartConfig: z.array(z.record(z.unknown())).optional(),
  filterConfig: z.record(z.unknown()).optional(),
  groupByFields: z.array(z.string()).optional(),
  aggregations: z.array(z.record(z.unknown())).optional(),
  colorScheme: z.string().max(50).optional(),
  outputFormat: z.string().max(20).optional(),
  scheduleConfig: z.record(z.unknown()).optional(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0024: Advanced Mode (Reporting) ─────────────────────────
export const reportAdvancedModeCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  queryConfig: z.record(z.unknown()),
  dataSources: z.array(z.string().uuid()).min(1),
  transformations: z.array(z.record(z.unknown())).optional(),
  customFormulas: z.array(z.record(z.unknown())).optional(),
  crossTabConfig: z.record(z.unknown()).optional(),
  drillDownConfig: z.record(z.unknown()).optional(),
  parameterizedFilters: z.array(z.record(z.unknown())).optional(),
  outputFormats: z.array(z.string()).default(['pdf']),
  cacheStrategy: z.string().max(50).default('standard'),
  metadata: z.record(z.unknown()).optional(),
});

export const reportAdvancedModeUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  queryConfig: z.record(z.unknown()).optional(),
  dataSources: z.array(z.string().uuid()).optional(),
  transformations: z.array(z.record(z.unknown())).optional(),
  customFormulas: z.array(z.record(z.unknown())).optional(),
  crossTabConfig: z.record(z.unknown()).optional(),
  drillDownConfig: z.record(z.unknown()).optional(),
  parameterizedFilters: z.array(z.record(z.unknown())).optional(),
  outputFormats: z.array(z.string()).optional(),
  cacheStrategy: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0025: Post Edit (Reporting) ─────────────────────────────
export const reportPostEditCreateSchema = z.object({
  reportId: z.string().uuid(),
  editType: z.string().min(1).max(100),
  targetSectionId: z.string().uuid().optional(),
  changes: z.record(z.unknown()),
  annotation: z.string().optional(),
  version: z.number().int().default(1),
  formatOverrides: z.record(z.unknown()).optional(),
  headerFooterConfig: z.record(z.unknown()).optional(),
  watermarkConfig: z.record(z.unknown()).optional(),
  isPublished: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const reportPostEditUpdateSchema = z.object({
  editType: z.string().max(100).optional(),
  targetSectionId: z.string().uuid().optional(),
  changes: z.record(z.unknown()).optional(),
  annotation: z.string().optional(),
  version: z.number().int().optional(),
  formatOverrides: z.record(z.unknown()).optional(),
  headerFooterConfig: z.record(z.unknown()).optional(),
  watermarkConfig: z.record(z.unknown()).optional(),
  isPublished: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0026: Template Library (Reporting) ──────────────────────
export const reportTemplateCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().min(1).max(100),
  subcategory: z.string().max(100).optional(),
  thumbnailUrl: z.string().max(500).optional(),
  templateConfig: z.record(z.unknown()),
  layoutData: z.record(z.unknown()).optional(),
  defaultDataBindings: z.record(z.unknown()).optional(),
  supportedOutputFormats: z.array(z.string()).default(['pdf']),
  isPremium: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export const reportTemplateUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  subcategory: z.string().max(100).optional(),
  thumbnailUrl: z.string().max(500).optional(),
  templateConfig: z.record(z.unknown()).optional(),
  layoutData: z.record(z.unknown()).optional(),
  defaultDataBindings: z.record(z.unknown()).optional(),
  supportedOutputFormats: z.array(z.string()).optional(),
  isPremium: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0027: External Simulation (Reporting) ──────────────────
export const reportExternalSimulationCreateSchema = z.object({
  reportId: z.string().uuid(),
  simulationType: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  inputParameters: z.record(z.unknown()),
  externalSourceUrl: z.string().max(1000).optional(),
  scenarioConfig: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const reportExternalSimulationUpdateSchema = z.object({
  simulationType: z.string().max(100).optional(),
  name: z.string().max(255).optional(),
  description: z.string().optional(),
  inputParameters: z.record(z.unknown()).optional(),
  externalSourceUrl: z.string().max(1000).optional(),
  scenarioConfig: z.record(z.unknown()).optional(),
  resultData: z.record(z.unknown()).optional(),
  status: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0028: Compare Schedule (Reporting) ─────────────────────
export const compareScheduleCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  reportIdA: z.string().uuid(),
  reportIdB: z.string().uuid(),
  comparisonType: z.string().min(1).max(100),
  comparisonConfig: z.record(z.unknown()).optional(),
  scheduleConfig: z.record(z.unknown()).optional(),
  notificationConfig: z.record(z.unknown()).optional(),
  thresholds: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const compareScheduleUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  reportIdA: z.string().uuid().optional(),
  reportIdB: z.string().uuid().optional(),
  comparisonType: z.string().max(100).optional(),
  comparisonConfig: z.record(z.unknown()).optional(),
  scheduleConfig: z.record(z.unknown()).optional(),
  notificationConfig: z.record(z.unknown()).optional(),
  thresholds: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  status: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── Distribution Schemas ────────────────────────────────────────

const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.string().min(1).max(100),
});

const accessControlSchema = z.object({
  requirePassword: z.boolean(),
  password: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  maxViews: z.number().int().positive().optional(),
  allowDownload: z.boolean(),
  allowPrint: z.boolean(),
});

export const distributionCreateSchema = z.object({
  reportId: z.string().uuid(),
  name: z.string().min(1).max(255),
  recipients: z.array(recipientSchema).min(1),
  format: z.enum(['pdf', 'xlsx', 'csv', 'html', 'docx']),
  emailSubject: z.string().min(1).max(500),
  emailBody: z.string().min(1),
  trackReadReceipts: z.boolean(),
  includeWatermark: z.boolean(),
  watermarkText: z.string().max(255).optional(),
  accessControl: accessControlSchema,
  enabled: z.boolean(),
});

export const distributionUpdateSchema = z.object({
  reportId: z.string().uuid().optional(),
  name: z.string().min(1).max(255).optional(),
  recipients: z.array(recipientSchema).optional(),
  format: z.enum(['pdf', 'xlsx', 'csv', 'html', 'docx']).optional(),
  emailSubject: z.string().min(1).max(500).optional(),
  emailBody: z.string().min(1).optional(),
  trackReadReceipts: z.boolean().optional(),
  includeWatermark: z.boolean().optional(),
  watermarkText: z.string().max(255).optional(),
  accessControl: accessControlSchema.partial().optional(),
  enabled: z.boolean().optional(),
});

export const distributionSendSchema = z.object({});

export const trackReadReceiptSchema = z.object({
  trackingId: z.string().min(1),
});

export const verifyAccessSchema = z.object({
  password: z.string().optional(),
});

// ─── Interactive Report Schemas ──────────────────────────────────

export const interactiveReportCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  baseReportId: z.string().uuid(),
  elements: z.array(z.record(z.unknown())),
  parameters: z.array(z.record(z.unknown())),
  linkedReports: z.array(z.record(z.unknown())),
  bookmarks: z.array(z.record(z.unknown())),
});

export const executeParamsSchema = z.object({
  params: z.record(z.unknown()),
});

export const drillDownSchema = z.object({
  elementId: z.string().min(1),
  drillValue: z.unknown(),
  currentParams: z.record(z.unknown()).optional(),
});

export const bookmarkCreateSchema = z.object({
  name: z.string().min(1).max(255),
  state: z.record(z.unknown()),
  isDefault: z.boolean().optional(),
});

export const commentCreateSchema = z.object({
  content: z.string().min(1),
  sectionId: z.string().optional(),
  parentCommentId: z.string().uuid().optional(),
});

export const annotationCreateSchema = z.object({
  sectionId: z.string().min(1),
  type: z.enum(['highlight', 'note', 'arrow', 'rectangle', 'callout']),
  position: z.record(z.unknown()),
  content: z.string().optional(),
  color: z.string().optional(),
});

export const reportLinkCreateSchema = z.object({
  targetReportId: z.string().uuid(),
  linkType: z.enum(['drill-through', 'cross-reference', 'subreport', 'related']),
  parameterMapping: z.array(z.record(z.unknown())),
  label: z.string().min(1).max(255),
});

// ─── Additional Schemas ──────────────────────────────────────────

export const autoComposeSchema = z.object({});

export const generateMultiSchema = z.object({
  formats: z.array(z.string().min(1)).min(1),
});

export const sectionEditSchema = z.object({
  changes: z.record(z.unknown()),
  annotation: z.string().optional(),
});

export const reexportSchema = z.object({
  format: z.string().min(1),
});

export const saveAsTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(100),
  subcategory: z.string().max(100).optional(),
});

export const analyzeExternalSchema = z.object({
  sourceUrl: z.string().url(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  simulationType: z.string().min(1).max(100),
  metadata: z.record(z.unknown()).optional(),
});

export const reproduceSchema = z.object({});
