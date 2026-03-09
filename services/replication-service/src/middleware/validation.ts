import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { AppError } from './errorHandler';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
        next(new AppError(`Validation failed: ${messages}`, 422));
      } else {
        next(error);
      }
    }
  };
}

/* ─── Core-Principle (MOD-0041) ─── */
export const corePrincipleCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  principleType: z.string().min(1),
  rules: z.record(z.unknown()).optional(),
  priority: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});
export const corePrincipleUpdateSchema = corePrincipleCreateSchema.partial();

/* ─── Match-Scope (MOD-0042) ─── */
export const matchScopeCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  scopeType: z.string().min(1),
  boundaries: z.record(z.unknown()).optional(),
  inclusionRules: z.array(z.string()).default([]),
  exclusionRules: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});
export const matchScopeUpdateSchema = matchScopeCreateSchema.partial();

/* ─── Match-Phases (MOD-0043) ─── */
export const matchPhasesCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  phaseOrder: z.number().int().min(0),
  phaseType: z.string().min(1),
  config: z.record(z.unknown()).optional(),
  thresholds: z.record(z.number()).optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});
export const matchPhasesUpdateSchema = matchPhasesCreateSchema.partial();

/* ─── Image-Matching (MOD-0044) ─── */
export const imageMatchingCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  algorithm: z.string().min(1),
  similarityThreshold: z.number().min(0).max(1).default(0.85),
  preprocessingSteps: z.array(z.string()).default([]),
  supportedFormats: z.array(z.string()).default(['png', 'jpg', 'tiff', 'pdf']),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});
export const imageMatchingUpdateSchema = imageMatchingCreateSchema.partial();

/* ─── Print-Lock (MOD-0045) ─── */
export const printLockCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  lockType: z.string().min(1),
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  lockConfig: z.record(z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});
export const printLockUpdateSchema = printLockCreateSchema.partial();

/* ─── Dual-Verify (MOD-0046) ─── */
export const dualVerifyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  verificationMethod: z.string().min(1),
  primaryCheck: z.record(z.unknown()),
  secondaryCheck: z.record(z.unknown()),
  toleranceLevel: z.number().min(0).max(1).default(0.95),
  autoResolve: z.boolean().default(false),
  escalationRules: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});
export const dualVerifyUpdateSchema = dualVerifyCreateSchema.partial();
