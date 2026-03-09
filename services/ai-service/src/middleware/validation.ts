import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// Generic validation middleware
// ---------------------------------------------------------------------------
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: err.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(err);
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query validation failed',
            details: err.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(err);
    }
  };
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export { paginationSchema };

// ---------------------------------------------------------------------------
// MOD-0054: file-understanding
// ---------------------------------------------------------------------------
export const fileUnderstandingCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  fileType: z.string().min(1),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional().default(true),
});

export const fileUnderstandingUpdateSchema = fileUnderstandingCreateSchema.partial();

export const fileUnderstandingAnalyzeSchema = z.object({
  fileUrl: z.string().url(),
  fileType: z.string().min(1),
  options: z.object({
    extractText: z.boolean().optional().default(true),
    extractTables: z.boolean().optional().default(false),
    extractImages: z.boolean().optional().default(false),
    language: z.string().optional().default('auto'),
  }).optional(),
});

export const fileUnderstandingExtractSchema = z.object({
  fileUrl: z.string().url(),
  extractionType: z.enum(['text', 'tables', 'metadata', 'entities', 'summary']),
  options: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// MOD-0055: free-query
// ---------------------------------------------------------------------------
export const freeQueryCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  defaultModel: z.string().optional().default('gpt-4'),
  systemPrompt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional().default(true),
});

export const freeQueryUpdateSchema = freeQueryCreateSchema.partial();

export const freeQueryAskSchema = z.object({
  question: z.string().min(1).max(10000),
  context: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().int().min(1).max(16000).optional().default(4096),
});

export const freeQueryConversationSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(10000),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional().default(0.7),
});

// ---------------------------------------------------------------------------
// MOD-0056: analysis-levels
// ---------------------------------------------------------------------------
export const analysisLevelsCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  level: z.number().int().min(1).max(10),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional().default(true),
});

export const analysisLevelsUpdateSchema = analysisLevelsCreateSchema.partial();

export const analysisLevelsRunSchema = z.object({
  levelId: z.string().uuid(),
  dataSource: z.string().min(1),
  parameters: z.record(z.unknown()).optional(),
  async: z.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// MOD-0057: ai-roles
// ---------------------------------------------------------------------------
export const aiRolesCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  systemPrompt: z.string().min(1),
  capabilities: z.array(z.string()).optional().default([]),
  model: z.string().optional().default('gpt-4'),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional().default(true),
});

export const aiRolesUpdateSchema = aiRolesCreateSchema.partial();

export const aiRolesAssignSchema = z.object({
  roleId: z.string().uuid(),
  targetId: z.string().uuid(),
  targetType: z.enum(['user', 'team', 'project', 'workspace']),
  permissions: z.array(z.string()).optional(),
});

export const aiRolesExecuteSchema = z.object({
  roleId: z.string().uuid(),
  task: z.string().min(1).max(10000),
  context: z.record(z.unknown()).optional(),
  parameters: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// MOD-0058: kpi-advanced
// ---------------------------------------------------------------------------
export const kpiAdvancedCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  formula: z.string().min(1),
  unit: z.string().optional(),
  category: z.string().optional(),
  thresholds: z.object({
    low: z.number().optional(),
    medium: z.number().optional(),
    high: z.number().optional(),
    critical: z.number().optional(),
  }).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional().default(true),
});

export const kpiAdvancedUpdateSchema = kpiAdvancedCreateSchema.partial();

export const kpiAdvancedCalculateSchema = z.object({
  kpiIds: z.array(z.string().uuid()).min(1),
  dataSource: z.string().min(1),
  dateRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  groupBy: z.string().optional(),
  filters: z.record(z.unknown()).optional(),
});

export const kpiAdvancedBenchmarkSchema = z.object({
  kpiIds: z.array(z.string().uuid()).min(1),
  benchmarkType: z.enum(['industry', 'historical', 'target', 'peer']),
  parameters: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// MOD-0059: ai-editing
// ---------------------------------------------------------------------------
export const aiEditingCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  editType: z.enum(['grammar', 'style', 'tone', 'summarize', 'expand', 'translate', 'custom']),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional().default(true),
});

export const aiEditingUpdateSchema = aiEditingCreateSchema.partial();

export const aiEditingSuggestSchema = z.object({
  content: z.string().min(1).max(50000),
  editType: z.enum(['grammar', 'style', 'tone', 'summarize', 'expand', 'translate', 'custom']),
  instructions: z.string().optional(),
  language: z.string().optional().default('auto'),
});

export const aiEditingApplySchema = z.object({
  content: z.string().min(1).max(50000),
  edits: z.array(z.object({
    offset: z.number().int().min(0),
    length: z.number().int().min(0),
    replacement: z.string(),
    type: z.string(),
  })),
});

export const aiEditingAutoFixSchema = z.object({
  content: z.string().min(1).max(50000),
  fixTypes: z.array(z.enum(['grammar', 'spelling', 'punctuation', 'formatting'])).optional(),
  language: z.string().optional().default('auto'),
});
