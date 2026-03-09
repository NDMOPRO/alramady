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

// MOD-0065: permissions-security schemas
export const permissionCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  resource: z.string().min(1).max(255),
  action: z.enum(['create', 'read', 'update', 'delete', 'manage', 'execute', 'export', 'import']),
  scope: z.enum(['global', 'organization', 'team', 'personal']).default('organization'),
  conditions: z.record(z.unknown()).optional(),
  isSystem: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const permissionUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  resource: z.string().max(255).optional(),
  action: z.enum(['create', 'read', 'update', 'delete', 'manage', 'execute', 'export', 'import']).optional(),
  scope: z.enum(['global', 'organization', 'team', 'personal']).optional(),
  conditions: z.record(z.unknown()).optional(),
  isSystem: z.boolean().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0066: teamwork schemas
export const teamCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  leaderId: z.string().uuid().optional(),
  type: z.enum(['project', 'department', 'cross-functional', 'ad-hoc']).default('project'),
  maxMembers: z.number().int().positive().optional(),
  settings: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const teamUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  leaderId: z.string().uuid().optional(),
  type: z.enum(['project', 'department', 'cross-functional', 'ad-hoc']).optional(),
  maxMembers: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0067: engine-integration schemas
export const integrationCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  sourceEngine: z.string().min(1).max(100),
  targetEngine: z.string().min(1).max(100),
  integrationType: z.enum(['sync', 'async', 'event', 'webhook', 'pipeline']),
  config: z.record(z.unknown()),
  schedule: z.string().max(100).optional(),
  isEnabled: z.boolean().default(true),
  retryPolicy: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const integrationUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  sourceEngine: z.string().max(100).optional(),
  targetEngine: z.string().max(100).optional(),
  integrationType: z.enum(['sync', 'async', 'event', 'webhook', 'pipeline']).optional(),
  config: z.record(z.unknown()).optional(),
  schedule: z.string().max(100).optional(),
  isEnabled: z.boolean().optional(),
  retryPolicy: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0068: one-click-ops schemas
export const oneClickOpCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  operationType: z.string().min(1).max(100),
  targetResource: z.string().min(1).max(255),
  steps: z.array(z.record(z.unknown())),
  params: z.record(z.unknown()).optional(),
  requiresConfirmation: z.boolean().default(true),
  rollbackConfig: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const oneClickOpUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  operationType: z.string().max(100).optional(),
  targetResource: z.string().max(255).optional(),
  steps: z.array(z.record(z.unknown())).optional(),
  params: z.record(z.unknown()).optional(),
  requiresConfirmation: z.boolean().optional(),
  rollbackConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0069: audit-replay schemas
export const auditCreateSchema = z.object({
  action: z.string().min(1).max(100),
  resource: z.string().min(1).max(255),
  resourceId: z.string().max(255).optional(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  previousState: z.record(z.unknown()).optional(),
  newState: z.record(z.unknown()).optional(),
  ipAddress: z.string().max(45).optional(),
  userAgent: z.string().max(500).optional(),
  severity: z.enum(['info', 'warning', 'critical']).default('info'),
  metadata: z.record(z.unknown()).optional(),
});

export const auditUpdateSchema = z.object({
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  isReviewed: z.boolean().optional(),
  reviewedBy: z.string().uuid().optional(),
  reviewNotes: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0070: advanced-compare schemas
export const compareCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  sourceType: z.string().min(1).max(100),
  sourceId: z.string().min(1).max(255),
  targetType: z.string().min(1).max(100),
  targetId: z.string().min(1).max(255),
  compareMode: z.enum(['full', 'structural', 'data-only', 'schema-only', 'visual']),
  options: z.record(z.unknown()).optional(),
  filters: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const compareUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.string().max(50).optional(),
  compareMode: z.enum(['full', 'structural', 'data-only', 'schema-only', 'visual']).optional(),
  options: z.record(z.unknown()).optional(),
  filters: z.record(z.unknown()).optional(),
  results: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0071: versions schemas
export const versionCreateSchema = z.object({
  resourceType: z.string().min(1).max(100),
  resourceId: z.string().min(1).max(255),
  versionNumber: z.string().min(1).max(50),
  label: z.string().max(255).optional(),
  description: z.string().optional(),
  snapshot: z.record(z.unknown()),
  changeLog: z.array(z.record(z.unknown())).optional(),
  parentVersionId: z.string().uuid().optional(),
  isMajor: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const versionUpdateSchema = z.object({
  label: z.string().max(255).optional(),
  description: z.string().optional(),
  isMajor: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// MOD-0075: product-levels schemas
export const productLevelCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  tier: z.enum(['free', 'starter', 'professional', 'enterprise', 'custom']),
  displayOrder: z.number().int().default(0),
  features: z.array(z.string()).default([]),
  limits: z.record(z.unknown()).optional(),
  pricing: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const productLevelUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  tier: z.enum(['free', 'starter', 'professional', 'enterprise', 'custom']).optional(),
  displayOrder: z.number().int().optional(),
  features: z.array(z.string()).optional(),
  limits: z.record(z.unknown()).optional(),
  pricing: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});
