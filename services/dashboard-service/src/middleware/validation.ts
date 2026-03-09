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

// ─── MOD-0015: Easy Mode ─────────────────────────────────────────
export const easyModeCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  dashboardType: z.string().max(50).default('standard'),
  dataSourceId: z.string().uuid().optional(),
  layoutConfig: z.record(z.unknown()).optional(),
  widgetConfig: z.array(z.record(z.unknown())).optional(),
  colorScheme: z.string().max(50).optional(),
  autoRefresh: z.boolean().default(false),
  refreshInterval: z.number().int().min(5).max(3600).optional(),
  isPublic: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export const easyModeUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  dashboardType: z.string().max(50).optional(),
  dataSourceId: z.string().uuid().optional(),
  layoutConfig: z.record(z.unknown()).optional(),
  widgetConfig: z.array(z.record(z.unknown())).optional(),
  colorScheme: z.string().max(50).optional(),
  autoRefresh: z.boolean().optional(),
  refreshInterval: z.number().int().min(5).max(3600).optional(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0016: Advanced Mode ─────────────────────────────────────
export const advancedModeCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  queryConfig: z.record(z.unknown()),
  dataSources: z.array(z.string().uuid()).min(1),
  transformations: z.array(z.record(z.unknown())).optional(),
  customScripts: z.array(z.string()).optional(),
  cacheStrategy: z.string().max(50).default('standard'),
  alertRules: z.array(z.record(z.unknown())).optional(),
  drillDownConfig: z.record(z.unknown()).optional(),
  interactiveFilters: z.array(z.record(z.unknown())).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const advancedModeUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  queryConfig: z.record(z.unknown()).optional(),
  dataSources: z.array(z.string().uuid()).optional(),
  transformations: z.array(z.record(z.unknown())).optional(),
  customScripts: z.array(z.string()).optional(),
  cacheStrategy: z.string().max(50).optional(),
  alertRules: z.array(z.record(z.unknown())).optional(),
  drillDownConfig: z.record(z.unknown()).optional(),
  interactiveFilters: z.array(z.record(z.unknown())).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0017: Drag Elements ─────────────────────────────────────
export const dragElementsCreateSchema = z.object({
  dashboardId: z.string().uuid(),
  elementType: z.string().min(1).max(100),
  label: z.string().min(1).max(255),
  positionX: z.number().int().min(0),
  positionY: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  zIndex: z.number().int().default(0),
  config: z.record(z.unknown()).optional(),
  styleOverrides: z.record(z.unknown()).optional(),
  dataBinding: z.record(z.unknown()).optional(),
  isLocked: z.boolean().default(false),
  isVisible: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const dragElementsUpdateSchema = z.object({
  elementType: z.string().max(100).optional(),
  label: z.string().max(255).optional(),
  positionX: z.number().int().min(0).optional(),
  positionY: z.number().int().min(0).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  zIndex: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
  styleOverrides: z.record(z.unknown()).optional(),
  dataBinding: z.record(z.unknown()).optional(),
  isLocked: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0018: Full Editor ───────────────────────────────────────
export const fullEditorCreateSchema = z.object({
  dashboardId: z.string().uuid(),
  editorMode: z.string().max(50).default('visual'),
  canvasConfig: z.record(z.unknown()).optional(),
  layers: z.array(z.record(z.unknown())).optional(),
  gridConfig: z.record(z.unknown()).optional(),
  snapToGrid: z.boolean().default(true),
  undoHistory: z.array(z.record(z.unknown())).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const fullEditorUpdateSchema = z.object({
  editorMode: z.string().max(50).optional(),
  canvasConfig: z.record(z.unknown()).optional(),
  layers: z.array(z.record(z.unknown())).optional(),
  gridConfig: z.record(z.unknown()).optional(),
  snapToGrid: z.boolean().optional(),
  undoHistory: z.array(z.record(z.unknown())).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0019: Post Edit ─────────────────────────────────────────
export const postEditCreateSchema = z.object({
  dashboardId: z.string().uuid(),
  editType: z.string().min(1).max(100),
  targetElementId: z.string().uuid().optional(),
  changes: z.record(z.unknown()),
  annotation: z.string().optional(),
  version: z.number().int().default(1),
  isPublished: z.boolean().default(false),
  publishConfig: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const postEditUpdateSchema = z.object({
  editType: z.string().max(100).optional(),
  targetElementId: z.string().uuid().optional(),
  changes: z.record(z.unknown()).optional(),
  annotation: z.string().optional(),
  version: z.number().int().optional(),
  isPublished: z.boolean().optional(),
  publishConfig: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0020: Template Library ──────────────────────────────────
export const templateLibraryCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().min(1).max(100),
  subcategory: z.string().max(100).optional(),
  thumbnailUrl: z.string().max(500).optional(),
  previewUrl: z.string().max(500).optional(),
  templateConfig: z.record(z.unknown()),
  layoutData: z.record(z.unknown()).optional(),
  defaultDataBindings: z.record(z.unknown()).optional(),
  requiredDataSources: z.array(z.string()).default([]),
  supportedChartTypes: z.array(z.string()).default([]),
  isPremium: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export const templateLibraryUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  subcategory: z.string().max(100).optional(),
  thumbnailUrl: z.string().max(500).optional(),
  previewUrl: z.string().max(500).optional(),
  templateConfig: z.record(z.unknown()).optional(),
  layoutData: z.record(z.unknown()).optional(),
  defaultDataBindings: z.record(z.unknown()).optional(),
  requiredDataSources: z.array(z.string()).optional(),
  supportedChartTypes: z.array(z.string()).optional(),
  isPremium: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0021: External Simulation ───────────────────────────────
export const externalSimulationCreateSchema = z.object({
  dashboardId: z.string().uuid(),
  simulationType: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  inputParameters: z.record(z.unknown()),
  externalSourceUrl: z.string().max(1000).optional(),
  externalSourceType: z.string().max(100).optional(),
  scenarioConfig: z.record(z.unknown()).optional(),
  scheduleConfig: z.record(z.unknown()).optional(),
  notificationConfig: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const externalSimulationUpdateSchema = z.object({
  simulationType: z.string().max(100).optional(),
  name: z.string().max(255).optional(),
  description: z.string().optional(),
  inputParameters: z.record(z.unknown()).optional(),
  externalSourceUrl: z.string().max(1000).optional(),
  externalSourceType: z.string().max(100).optional(),
  scenarioConfig: z.record(z.unknown()).optional(),
  scheduleConfig: z.record(z.unknown()).optional(),
  resultData: z.record(z.unknown()).optional(),
  status: z.string().max(50).optional(),
  notificationConfig: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── MOD-0022: Performance ───────────────────────────────────────
export const performanceCreateSchema = z.object({
  dashboardId: z.string().uuid(),
  metricType: z.string().min(1).max(100),
  metricName: z.string().min(1).max(255),
  targetValue: z.number().optional(),
  thresholds: z.record(z.unknown()).optional(),
  aggregationMethod: z.string().max(50).default('average'),
  timeRange: z.string().max(50).default('24h'),
  alertConfig: z.record(z.unknown()).optional(),
  optimizationSuggestions: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const performanceUpdateSchema = z.object({
  metricType: z.string().max(100).optional(),
  metricName: z.string().max(255).optional(),
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
  thresholds: z.record(z.unknown()).optional(),
  aggregationMethod: z.string().max(50).optional(),
  timeRange: z.string().max(50).optional(),
  alertConfig: z.record(z.unknown()).optional(),
  optimizationSuggestions: z.array(z.string()).optional(),
  status: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});
