import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { z } from 'zod';
import * as crypto from 'crypto';

// ─── Zod Schemas ────────────────────────────────────────────────────

const MatchModeSchema = z.enum(['STRICT', 'PROFESSIONAL', 'HYBRID']);

const CorePrincipleConfigSchema = z.object({
  matchMode: MatchModeSchema,
  minAcceptableScore: z.number().min(0).max(100).default(99.9),
  disableAutoEnhancement: z.boolean().default(true),
  disableAutoBeautification: z.boolean().default(true),
  disableRedistribution: z.boolean().default(true),
  disableRounding: z.boolean().default(true),
  enforceSequentialPhases: z.boolean().default(true),
  preventPhaseMergeWithoutPass: z.boolean().default(true),
  preventBatchMerge: z.boolean().default(true),
  numericDeviationThreshold: z.number().default(0.000001),
  pixelDeviationThreshold: z.number().default(0.001),
  structuralFingerprintThreshold: z.number().default(0.999),
  maxResourcesPerTenant: z.number().optional(),
  tenantId: z.string().uuid(),
});

const ExecuteMatchSchema = z.object({
  documentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  matchMode: MatchModeSchema,
  sourceImageBuffer: z.instanceof(Buffer).optional(),
});

// ─── Interfaces ─────────────────────────────────────────────────────

interface PrincipleValidationResult {
  valid: boolean;
  overallScore: number;
  pixelDeviation: number;
  structuralFingerprint: number;
  numericDeviation: number;
  violations: PrincipleViolation[];
  enforcedRules: string[];
}

interface PrincipleViolation {
  rule: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  actualValue: number;
  expectedThreshold: number;
}

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  principleType?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── CRUD Operations ────────────────────────────────────────────────

const MODEL = 'corePrinciple';
const CACHE_PREFIX = 'core-principle';

export async function list(params: ListParams) {
  const { page = 1, limit = 20, search, principleType, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {};
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (principleType) where.principleType = principleType;
  if (isActive !== undefined) where.isActive = isActive;

  const [data, total] = await Promise.all([
    (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).count({ where }),
  ]);

  const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  await cacheSet(cacheKey, result, 300);
  logger.info('Listed core-principles', { total, page });
  return result;
}

export async function getById(id: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const record = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).findUnique({ where: { id } });
  if (!record) throw new NotFoundError('CorePrinciple', id);

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).create({ data });
  await cacheDel(`${CACHE_PREFIX}:list`);
  logger.info('Created core-principle', { id: record.id });
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const existing = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('CorePrinciple', id);

  const record = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).update({ where: { id }, data });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Updated core-principle', { id });
  return record;
}

export async function remove(id: string) {
  const existing = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('CorePrinciple', id);

  await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).delete({ where: { id } });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Deleted core-principle', { id });
  return { success: true };
}

// ─── Core Principle Engine ──────────────────────────────────────────

export async function configurePrinciple(input: z.infer<typeof CorePrincipleConfigSchema>) {
  const validated = CorePrincipleConfigSchema.parse(input);

  const config = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).upsert({
    where: {
      tenantId_matchMode: {
        tenantId: validated.tenantId,
        matchMode: validated.matchMode,
      },
    },
    update: {
      minAcceptableScore: validated.minAcceptableScore,
      disableAutoEnhancement: validated.disableAutoEnhancement,
      disableAutoBeautification: validated.disableAutoBeautification,
      disableRedistribution: validated.disableRedistribution,
      disableRounding: validated.disableRounding,
      enforceSequentialPhases: validated.enforceSequentialPhases,
      preventPhaseMergeWithoutPass: validated.preventPhaseMergeWithoutPass,
      preventBatchMerge: validated.preventBatchMerge,
      numericDeviationThreshold: validated.numericDeviationThreshold,
      pixelDeviationThreshold: validated.pixelDeviationThreshold,
      structuralFingerprintThreshold: validated.structuralFingerprintThreshold,
      maxResourcesPerTenant: validated.maxResourcesPerTenant,
      updatedAt: new Date(),
    },
    create: {
      id: crypto.randomUUID(),
      tenantId: validated.tenantId,
      matchMode: validated.matchMode,
      minAcceptableScore: validated.minAcceptableScore,
      disableAutoEnhancement: validated.disableAutoEnhancement,
      disableAutoBeautification: validated.disableAutoBeautification,
      disableRedistribution: validated.disableRedistribution,
      disableRounding: validated.disableRounding,
      enforceSequentialPhases: validated.enforceSequentialPhases,
      preventPhaseMergeWithoutPass: validated.preventPhaseMergeWithoutPass,
      preventBatchMerge: validated.preventBatchMerge,
      numericDeviationThreshold: validated.numericDeviationThreshold,
      pixelDeviationThreshold: validated.pixelDeviationThreshold,
      structuralFingerprintThreshold: validated.structuralFingerprintThreshold,
      maxResourcesPerTenant: validated.maxResourcesPerTenant,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await cacheDel(`${CACHE_PREFIX}:config:${validated.tenantId}`);
  logger.info('Configured core principle', {
    tenantId: validated.tenantId,
    matchMode: validated.matchMode,
  });

  return config;
}

export async function getActivePrincipleConfig(tenantId: string, matchMode: z.infer<typeof MatchModeSchema>) {
  const cacheKey = `${CACHE_PREFIX}:config:${tenantId}:${matchMode}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const config = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).findFirst({
    where: {
      tenantId,
      matchMode,
      isActive: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!config) {
    const defaults = {
      matchMode,
      minAcceptableScore: matchMode === 'STRICT' ? 99.9 : matchMode === 'PROFESSIONAL' ? 95.0 : 90.0,
      disableAutoEnhancement: matchMode === 'STRICT',
      disableAutoBeautification: matchMode === 'STRICT',
      disableRedistribution: matchMode === 'STRICT',
      disableRounding: matchMode === 'STRICT',
      enforceSequentialPhases: true,
      preventPhaseMergeWithoutPass: true,
      preventBatchMerge: matchMode === 'STRICT',
      numericDeviationThreshold: 0.000001,
      pixelDeviationThreshold: matchMode === 'STRICT' ? 0.001 : 0.01,
      structuralFingerprintThreshold: matchMode === 'STRICT' ? 0.999 : 0.99,
    };
    return defaults;
  }

  await cacheSet(cacheKey, config, 600);
  return config;
}

export async function validateAgainstPrinciples(
  tenantId: string,
  matchMode: z.infer<typeof MatchModeSchema>,
  scores: {
    pixelDeviation: number;
    structuralFingerprint: number;
    numericDeviation: number;
    overallScore: number;
    phaseResults?: Array<{ phaseName: string; passed: boolean; score: number }>;
  },
): Promise<PrincipleValidationResult> {
  const config = await getActivePrincipleConfig(tenantId, matchMode);
  const violations: PrincipleViolation[] = [];
  const enforcedRules: string[] = [];

  // Rule 1: Overall score must meet minimum threshold
  if (scores.overallScore < (config.minAcceptableScore ?? 99.9)) {
    violations.push({
      rule: 'MINIMUM_SCORE',
      severity: 'critical',
      description: `Overall score ${scores.overallScore} is below minimum ${config.minAcceptableScore}. No partial acceptance.`,
      actualValue: scores.overallScore,
      expectedThreshold: config.minAcceptableScore ?? 99.9,
    });
  }
  enforcedRules.push('MINIMUM_SCORE_CHECK');

  // Rule 2: Pixel deviation must be within threshold
  if (scores.pixelDeviation > (config.pixelDeviationThreshold ?? 0.001)) {
    violations.push({
      rule: 'PIXEL_DEVIATION',
      severity: 'critical',
      description: `Pixel deviation ${scores.pixelDeviation} exceeds threshold ${config.pixelDeviationThreshold}`,
      actualValue: scores.pixelDeviation,
      expectedThreshold: config.pixelDeviationThreshold ?? 0.001,
    });
  }
  enforcedRules.push('PIXEL_DEVIATION_CHECK');

  // Rule 3: Structural fingerprint must meet threshold
  if (scores.structuralFingerprint < (config.structuralFingerprintThreshold ?? 0.999)) {
    violations.push({
      rule: 'STRUCTURAL_FINGERPRINT',
      severity: 'critical',
      description: `Structural fingerprint ${scores.structuralFingerprint} is below threshold ${config.structuralFingerprintThreshold}`,
      actualValue: scores.structuralFingerprint,
      expectedThreshold: config.structuralFingerprintThreshold ?? 0.999,
    });
  }
  enforcedRules.push('STRUCTURAL_FINGERPRINT_CHECK');

  // Rule 4: Numeric deviation must be within threshold
  if (scores.numericDeviation > (config.numericDeviationThreshold ?? 0.000001)) {
    violations.push({
      rule: 'NUMERIC_DEVIATION',
      severity: 'major',
      description: `Numeric deviation ${scores.numericDeviation} exceeds threshold ${config.numericDeviationThreshold}`,
      actualValue: scores.numericDeviation,
      expectedThreshold: config.numericDeviationThreshold ?? 0.000001,
    });
  }
  enforcedRules.push('NUMERIC_DEVIATION_CHECK');

  // Rule 5: Sequential phase enforcement
  if (config.enforceSequentialPhases && scores.phaseResults) {
    for (let i = 0; i < scores.phaseResults.length; i++) {
      const phase = scores.phaseResults[i];
      if (!phase.passed && config.preventPhaseMergeWithoutPass) {
        violations.push({
          rule: 'SEQUENTIAL_PHASE_PASS',
          severity: 'critical',
          description: `Phase "${phase.phaseName}" did not pass (score: ${phase.score}). Cannot proceed without PASS.`,
          actualValue: phase.score,
          expectedThreshold: config.minAcceptableScore ?? 99.9,
        });
      }
    }
    enforcedRules.push('SEQUENTIAL_PHASE_ENFORCEMENT');
  }

  // Rule 6: Auto-enhancement disabled in STRICT mode
  if (config.disableAutoEnhancement) {
    enforcedRules.push('AUTO_ENHANCEMENT_DISABLED');
  }
  if (config.disableAutoBeautification) {
    enforcedRules.push('AUTO_BEAUTIFICATION_DISABLED');
  }
  if (config.disableRedistribution) {
    enforcedRules.push('REDISTRIBUTION_DISABLED');
  }
  if (config.disableRounding) {
    enforcedRules.push('ROUNDING_DISABLED');
  }

  const valid = violations.filter(v => v.severity === 'critical').length === 0;

  const result: PrincipleValidationResult = {
    valid,
    overallScore: scores.overallScore,
    pixelDeviation: scores.pixelDeviation,
    structuralFingerprint: scores.structuralFingerprint,
    numericDeviation: scores.numericDeviation,
    violations,
    enforcedRules,
  };

  // Persist validation result
  await prisma.principleValidation.create({
    data: {
      id: crypto.randomUUID(),
      tenantId,
      matchMode,
      valid: result.valid,
      overallScore: result.overallScore,
      pixelDeviation: result.pixelDeviation,
      structuralFingerprint: result.structuralFingerprint,
      numericDeviation: result.numericDeviation,
      violations: JSON.parse(JSON.stringify(result.violations)),
      enforcedRules: result.enforcedRules,
      createdAt: new Date(),
    },
  });

  logger.info('Validated against core principles', {
    tenantId,
    matchMode,
    valid: result.valid,
    violationCount: violations.length,
  });

  return result;
}

export async function checkResourceLimits(tenantId: string): Promise<{
  allowed: boolean;
  currentUsage: number;
  maxAllowed: number;
  remainingCapacity: number;
}> {
  const config = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).findFirst({
    where: { tenantId, isActive: true },
    orderBy: { updatedAt: 'desc' },
  });

  const maxAllowed = config?.maxResourcesPerTenant ?? 1000;

  const currentUsage = await prisma.replicationJob.count({
    where: {
      tenantId: tenantId,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
  });

  return {
    allowed: currentUsage < maxAllowed,
    currentUsage,
    maxAllowed,
    remainingCapacity: Math.max(0, maxAllowed - currentUsage),
  };
}
