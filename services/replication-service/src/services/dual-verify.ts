import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { z } from 'zod';
import * as crypto from 'crypto';
import sharp from 'sharp';

// ─── Zod Schemas ────────────────────────────────────────────────────

const DualVerifyRequestSchema = z.object({
  originalDocumentId: z.string().uuid(),
  replicaDocumentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  originalImageBuffer: z.instanceof(Buffer),
  replicaImageBuffer: z.instanceof(Buffer),
  matchMode: z.enum(['STRICT', 'PROFESSIONAL', 'HYBRID']).default('STRICT'),
  pixelDeviationThreshold: z.number().min(0).max(1).default(0.001),
  structuralFingerprintThreshold: z.number().min(0).max(1).default(0.999),
});

// ─── Interfaces ─────────────────────────────────────────────────────

interface PixelCheckResult {
  passed: boolean;
  totalPixels: number;
  matchingPixels: number;
  differingPixels: number;
  deviationPercentage: number;
  maxAllowedDeviation: number;
  regionHotspots: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    deviationScore: number;
  }>;
}

interface StructuralCheckResult {
  passed: boolean;
  fingerprintScore: number;
  minRequiredScore: number;
  elementCountMatch: boolean;
  layoutGridMatch: boolean;
  spacingConsistency: number;
  fontConsistency: number;
  colorConsistency: number;
  hierarchyMatch: boolean;
  deviationDetails: Array<{
    category: string;
    original: string;
    replica: string;
    deviation: number;
  }>;
}

interface DualVerifyResult {
  id: string;
  originalDocumentId: string;
  replicaDocumentId: string;
  overallPassed: boolean;
  overallScore: number;
  pixelCheck: PixelCheckResult;
  structuralCheck: StructuralCheckResult;
  bothChecksPassed: boolean;
  verdict: 'ACCEPTED' | 'REJECTED';
  rejectionReasons: string[];
  verifiedAt: Date;
  processingTime: number;
}

interface DeviationAnalysis {
  category: string;
  description: string;
  severity: 'critical' | 'major' | 'minor' | 'cosmetic';
  suggestedFix: string;
  estimatedImpact: number;
}

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  verificationMethod?: string;
  autoResolve?: boolean;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── CRUD Operations ────────────────────────────────────────────────

const MODEL = 'dualVerify';
const CACHE_PREFIX = 'dual-verify';

export async function list(params: ListParams) {
  const { page = 1, limit = 20, search, verificationMethod, sortBy = 'verifiedAt', sortOrder = 'desc' } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {};
  if (search) where.matchMode = { contains: search, mode: 'insensitive' };
  if (verificationMethod) where.matchMode = verificationMethod;

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
  logger.info('Listed dual-verifications', { total, page });
  return result;
}

export async function getById(id: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const record = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).findUnique({ where: { id } });
  if (!record) throw new NotFoundError('DualVerify', id);

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).create({ data });
  await cacheDel(`${CACHE_PREFIX}:list`);
  logger.info('Created dual-verify', { id: record.id });
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const existing = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('DualVerify', id);

  const record = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).update({ where: { id }, data });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Updated dual-verify', { id });
  return record;
}

export async function remove(id: string) {
  const existing = await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('DualVerify', id);

  await (prisma[MODEL as keyof typeof prisma] as Record<string, Function>).delete({ where: { id } });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Deleted dual-verify', { id });
  return { success: true };
}

// ─── Dual Verification Gate ─────────────────────────────────────────

export async function executeDualVerification(
  input: z.infer<typeof DualVerifyRequestSchema>,
): Promise<DualVerifyResult> {
  const validated = DualVerifyRequestSchema.parse(input);
  const startTime = Date.now();
  const verifyId = crypto.randomUUID();

  // Execute both checks in parallel
  const [pixelCheck, structuralCheck] = await Promise.all([
    executePixelDiffCheck(
      validated.originalImageBuffer,
      validated.replicaImageBuffer,
      validated.pixelDeviationThreshold,
    ),
    executeStructuralFingerprintCheck(
      validated.originalImageBuffer,
      validated.replicaImageBuffer,
      validated.structuralFingerprintThreshold,
    ),
  ]);

  // Both checks must pass - one alone is not sufficient
  const bothChecksPassed = pixelCheck.passed && structuralCheck.passed;

  // Calculate combined score
  const overallScore = Math.round(
    ((1 - pixelCheck.deviationPercentage / 100) * 0.5 + structuralCheck.fingerprintScore * 0.5) * 10000,
  ) / 100;

  // Determine verdict
  const verdict: DualVerifyResult['verdict'] = bothChecksPassed ? 'ACCEPTED' : 'REJECTED';

  // Collect rejection reasons
  const rejectionReasons: string[] = [];
  if (!pixelCheck.passed) {
    rejectionReasons.push(
      `Pixel deviation ${pixelCheck.deviationPercentage.toFixed(4)}% exceeds threshold ${(validated.pixelDeviationThreshold * 100).toFixed(4)}%`,
    );
  }
  if (!structuralCheck.passed) {
    rejectionReasons.push(
      `Structural fingerprint ${structuralCheck.fingerprintScore.toFixed(4)} is below threshold ${validated.structuralFingerprintThreshold.toFixed(4)}`,
    );
  }
  if (pixelCheck.passed && !structuralCheck.passed) {
    rejectionReasons.push('Pixel check passed but structural check failed - both must pass');
  }
  if (!pixelCheck.passed && structuralCheck.passed) {
    rejectionReasons.push('Structural check passed but pixel check failed - both must pass');
  }

  const processingTime = Date.now() - startTime;

  const result: DualVerifyResult = {
    id: verifyId,
    originalDocumentId: validated.originalDocumentId,
    replicaDocumentId: validated.replicaDocumentId,
    overallPassed: bothChecksPassed,
    overallScore,
    pixelCheck,
    structuralCheck,
    bothChecksPassed,
    verdict,
    rejectionReasons,
    verifiedAt: new Date(),
    processingTime,
  };

  // Persist verification result
  await (prisma.dualVerify as unknown as { create: (args: Record<string, unknown>) => Promise<unknown> }).create({
    data: {
      id: result.id,
      originalDocumentId: result.originalDocumentId,
      replicaDocumentId: result.replicaDocumentId,
      tenantId: validated.tenantId,
      userId: validated.userId,
      overallPassed: result.overallPassed,
      overallScore: result.overallScore,
      pixelCheckPassed: pixelCheck.passed,
      pixelDeviation: pixelCheck.deviationPercentage,
      structuralCheckPassed: structuralCheck.passed,
      structuralScore: structuralCheck.fingerprintScore,
      bothChecksPassed: result.bothChecksPassed,
      verdict: result.verdict,
      rejectionReasons: result.rejectionReasons,
      matchMode: validated.matchMode,
      processingTime: result.processingTime,
      verifiedAt: result.verifiedAt,
    },
  });

  logger.info('Executed dual verification', {
    verifyId,
    verdict: result.verdict,
    overallScore: result.overallScore,
    pixelPassed: pixelCheck.passed,
    structuralPassed: structuralCheck.passed,
    processingTime,
  });

  return result;
}

// ─── Check 1: Pixel Diff Check ──────────────────────────────────────

async function executePixelDiffCheck(
  originalBuffer: Buffer,
  replicaBuffer: Buffer,
  maxDeviation: number,
): Promise<PixelCheckResult> {
  const originalMeta = await sharp(originalBuffer).metadata();
  const targetWidth = Math.min(originalMeta.width || 1920, 2048);
  const targetHeight = Math.min(originalMeta.height || 1080, 2048);

  // Normalize both images to same dimensions and raw RGBA
  const [origRaw, repRaw] = await Promise.all([
    sharp(originalBuffer)
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .raw()
      .toBuffer(),
    sharp(replicaBuffer)
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .raw()
      .toBuffer(),
  ]);

  const channels = 4;
  const totalPixels = targetWidth * targetHeight;
  let matchingPixels = 0;
  let differingPixels = 0;

  // Region-based hotspot detection
  const regionSize = 32;
  const regionMap = new Map<string, { x: number; y: number; diffCount: number; totalCount: number }>();

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const idx = (y * targetWidth + x) * channels;

      const dR = Math.abs(origRaw[idx] - repRaw[idx]);
      const dG = Math.abs(origRaw[idx + 1] - repRaw[idx + 1]);
      const dB = Math.abs(origRaw[idx + 2] - repRaw[idx + 2]);

      const colorDelta = Math.sqrt(dR * dR + dG * dG + dB * dB);

      // Very strict threshold: any delta > 5 counts as different
      if (colorDelta <= 5) {
        matchingPixels++;
      } else {
        differingPixels++;

        // Track regional hotspots
        const rKey = `${Math.floor(x / regionSize)},${Math.floor(y / regionSize)}`;
        const region = regionMap.get(rKey);
        if (region) {
          region.diffCount++;
          region.totalCount++;
        } else {
          regionMap.set(rKey, {
            x: Math.floor(x / regionSize) * regionSize,
            y: Math.floor(y / regionSize) * regionSize,
            diffCount: 1,
            totalCount: 1,
          });
        }
      }
    }
  }

  const deviationPercentage = (differingPixels / totalPixels) * 100;
  const passed = deviationPercentage <= maxDeviation * 100;

  // Extract significant hotspot regions
  const regionHotspots = Array.from(regionMap.values())
    .filter(r => r.diffCount > regionSize * regionSize * 0.05)
    .sort((a, b) => b.diffCount - a.diffCount)
    .slice(0, 20)
    .map(r => ({
      x: r.x,
      y: r.y,
      width: regionSize,
      height: regionSize,
      deviationScore: Math.round((r.diffCount / (regionSize * regionSize)) * 10000) / 100,
    }));

  return {
    passed,
    totalPixels,
    matchingPixels,
    differingPixels,
    deviationPercentage: Math.round(deviationPercentage * 10000) / 10000,
    maxAllowedDeviation: maxDeviation * 100,
    regionHotspots,
  };
}

// ─── Check 2: Structural Fingerprint Check ──────────────────────────

async function executeStructuralFingerprintCheck(
  originalBuffer: Buffer,
  replicaBuffer: Buffer,
  minScore: number,
): Promise<StructuralCheckResult> {
  const [origAnalysis, repAnalysis] = await Promise.all([
    analyzeStructure(originalBuffer),
    analyzeStructure(replicaBuffer),
  ]);

  // Compare element counts
  const elementCountMatch = origAnalysis.elementCount === repAnalysis.elementCount;

  // Compare layout grid
  const colMatch = origAnalysis.columns === repAnalysis.columns;
  const rowMatch = origAnalysis.rows === repAnalysis.rows;
  const layoutGridMatch = colMatch && rowMatch;

  // Compare spacing consistency
  const origSpacings = origAnalysis.spacings;
  const repSpacings = repAnalysis.spacings;
  let spacingScore = 100;
  const minSpacings = Math.min(origSpacings.length, repSpacings.length);
  for (let i = 0; i < minSpacings; i++) {
    spacingScore -= Math.abs(origSpacings[i] - repSpacings[i]) * 10;
  }
  spacingScore -= Math.abs(origSpacings.length - repSpacings.length) * 5;
  spacingScore = Math.max(0, spacingScore) / 100;

  // Compare font consistency via edge analysis
  const fontConsistency = compareEdgePatterns(origAnalysis.edgeProfile, repAnalysis.edgeProfile);

  // Compare color consistency via histogram
  const colorConsistency = compareHistograms(origAnalysis.colorHistogram, repAnalysis.colorHistogram);

  // Compare hierarchy (heading structure)
  const hierarchyMatch = origAnalysis.hierarchyHash === repAnalysis.hierarchyHash;

  // Calculate combined fingerprint score
  const fingerprintScore = Math.round(
    (
      (elementCountMatch ? 0.15 : 0) +
      (layoutGridMatch ? 0.15 : 0) +
      spacingScore * 0.20 +
      fontConsistency * 0.20 +
      colorConsistency * 0.15 +
      (hierarchyMatch ? 0.15 : 0)
    ) * 10000,
  ) / 10000;

  const passed = fingerprintScore >= minScore;

  // Build deviation details
  const deviationDetails: StructuralCheckResult['deviationDetails'] = [];

  if (!elementCountMatch) {
    deviationDetails.push({
      category: 'element_count',
      original: String(origAnalysis.elementCount),
      replica: String(repAnalysis.elementCount),
      deviation: Math.abs(origAnalysis.elementCount - repAnalysis.elementCount),
    });
  }
  if (!colMatch) {
    deviationDetails.push({
      category: 'column_count',
      original: String(origAnalysis.columns),
      replica: String(repAnalysis.columns),
      deviation: Math.abs(origAnalysis.columns - repAnalysis.columns),
    });
  }
  if (!rowMatch) {
    deviationDetails.push({
      category: 'row_count',
      original: String(origAnalysis.rows),
      replica: String(repAnalysis.rows),
      deviation: Math.abs(origAnalysis.rows - repAnalysis.rows),
    });
  }
  if (spacingScore < 0.95) {
    deviationDetails.push({
      category: 'spacing',
      original: origSpacings.join(','),
      replica: repSpacings.join(','),
      deviation: Math.round((1 - spacingScore) * 10000) / 100,
    });
  }

  return {
    passed,
    fingerprintScore,
    minRequiredScore: minScore,
    elementCountMatch,
    layoutGridMatch,
    spacingConsistency: Math.round(spacingScore * 10000) / 10000,
    fontConsistency: Math.round(fontConsistency * 10000) / 10000,
    colorConsistency: Math.round(colorConsistency * 10000) / 10000,
    hierarchyMatch,
    deviationDetails,
  };
}

// ─── Deviation Analysis ─────────────────────────────────────────────

export async function analyzeDeviations(
  verificationId: string,
): Promise<DeviationAnalysis[]> {
  const verification = await (prisma.dualVerify as unknown as { findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null> }).findUnique({
    where: { id: verificationId },
  });

  if (!verification) {
    throw new Error(`Verification not found: ${verificationId}`);
  }

  const analyses: DeviationAnalysis[] = [];

  if (!verification.pixelCheckPassed) {
    const deviation = verification.pixelDeviation as number;
    analyses.push({
      category: 'pixel_deviation',
      description: `Pixel deviation at ${deviation.toFixed(4)}% exceeds the maximum of 0.1%`,
      severity: deviation > 1 ? 'critical' : deviation > 0.5 ? 'major' : 'minor',
      suggestedFix: 'Increase rendering resolution or review element positioning for sub-pixel alignment',
      estimatedImpact: Math.min(100, deviation * 100),
    });
  }

  if (!verification.structuralCheckPassed) {
    const score = verification.structuralScore as number;
    analyses.push({
      category: 'structural_fingerprint',
      description: `Structural fingerprint ${score.toFixed(4)} is below 0.999 threshold`,
      severity: score < 0.95 ? 'critical' : score < 0.99 ? 'major' : 'minor',
      suggestedFix: 'Review layout grid, element count, and spacing for structural consistency',
      estimatedImpact: Math.round((1 - score) * 10000) / 100,
    });
  }

  const rejectionReasons = (verification.rejectionReasons as string[]) || [];
  for (const reason of rejectionReasons) {
    if (reason.includes('both must pass')) {
      analyses.push({
        category: 'dual_gate',
        description: reason,
        severity: 'critical',
        suggestedFix: 'Both pixel and structural checks must pass simultaneously. Fix the failing check.',
        estimatedImpact: 50,
      });
    }
  }

  return analyses;
}

// ─── Helper Functions ───────────────────────────────────────────────

interface ImageStructureAnalysis {
  elementCount: number;
  columns: number;
  rows: number;
  spacings: number[];
  edgeProfile: number[];
  colorHistogram: number[];
  hierarchyHash: string;
}

async function analyzeStructure(imageBuffer: Buffer): Promise<ImageStructureAnalysis> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = Math.min(metadata.width || 800, 400);
  const height = Math.min(metadata.height || 600, 400);

  const grayData = await sharp(imageBuffer)
    .grayscale()
    .resize(width, height, { fit: 'inside' })
    .raw()
    .toBuffer();

  const actualWidth = Math.min(width, metadata.width || 800);
  const actualHeight = Math.min(height, metadata.height || 600);

  // Horizontal projection for row detection
  const hProjection = new Float64Array(actualHeight);
  for (let y = 0; y < actualHeight; y++) {
    for (let x = 0; x < actualWidth; x++) {
      if (grayData[y * actualWidth + x] < 200) hProjection[y]++;
    }
  }

  // Vertical projection for column detection
  const vProjection = new Float64Array(actualWidth);
  for (let y = 0; y < actualHeight; y++) {
    for (let x = 0; x < actualWidth; x++) {
      if (grayData[y * actualWidth + x] < 200) vProjection[x]++;
    }
  }

  // Detect columns from vertical gaps
  let columns = 1;
  const vThreshold = Math.max(...Array.from(vProjection)) * 0.1;
  let inGap = false;
  for (let x = 0; x < actualWidth; x++) {
    if (vProjection[x] <= vThreshold) {
      if (!inGap) {
        inGap = true;
      }
    } else {
      if (inGap) {
        columns++;
        inGap = false;
      }
    }
  }

  // Detect rows from horizontal gaps
  let rows = 1;
  const hThreshold = Math.max(...Array.from(hProjection)) * 0.1;
  let inHGap = false;
  for (let y = 0; y < actualHeight; y++) {
    if (hProjection[y] <= hThreshold) {
      if (!inHGap) {
        inHGap = true;
      }
    } else {
      if (inHGap) {
        rows++;
        inHGap = false;
      }
    }
  }

  // Spacings between content rows
  const spacings: number[] = [];
  let lastContentY = -1;
  for (let y = 0; y < actualHeight; y++) {
    if (hProjection[y] > hThreshold) {
      if (lastContentY >= 0 && y - lastContentY > 3) {
        spacings.push(y - lastContentY);
      }
      lastContentY = y;
    }
  }

  // Edge profile (summary of edge detection)
  const edgeProfile: number[] = [];
  const profileBuckets = 20;
  const bucketSize = Math.ceil(actualHeight / profileBuckets);
  for (let b = 0; b < profileBuckets; b++) {
    let edgeCount = 0;
    for (let y = b * bucketSize; y < Math.min((b + 1) * bucketSize, actualHeight); y++) {
      for (let x = 1; x < actualWidth - 1; x++) {
        const diff = Math.abs(grayData[y * actualWidth + x] - grayData[y * actualWidth + x + 1]);
        if (diff > 30) edgeCount++;
      }
    }
    edgeProfile.push(Math.round(edgeCount / (bucketSize * actualWidth) * 10000) / 10000);
  }

  // Color histogram (grayscale)
  const colorHistogram = new Array(16).fill(0);
  for (let i = 0; i < grayData.length; i++) {
    const bucket = Math.min(15, Math.floor(grayData[i] / 16));
    colorHistogram[bucket]++;
  }
  const totalPx = grayData.length;
  const normalizedHistogram = colorHistogram.map(
    (c: number) => Math.round((c / totalPx) * 10000) / 10000,
  );

  // Element count approximation
  let elementCount = 0;
  const contentRegions: boolean[] = new Array(actualHeight).fill(false);
  for (let y = 0; y < actualHeight; y++) {
    contentRegions[y] = hProjection[y] > hThreshold;
  }
  let inElement = false;
  for (let y = 0; y < actualHeight; y++) {
    if (contentRegions[y] && !inElement) {
      elementCount++;
      inElement = true;
    } else if (!contentRegions[y]) {
      inElement = false;
    }
  }

  // Hierarchy hash
  const hierarchyHash = crypto.createHash('sha256')
    .update(`${columns}:${rows}:${elementCount}:${spacings.join(',')}`)
    .digest('hex')
    .substring(0, 16);

  return {
    elementCount,
    columns: Math.max(1, columns),
    rows: Math.max(1, rows),
    spacings,
    edgeProfile,
    colorHistogram: normalizedHistogram,
    hierarchyHash,
  };
}

function compareEdgePatterns(profileA: number[], profileB: number[]): number {
  if (profileA.length === 0 || profileB.length === 0) return 0;
  const minLen = Math.min(profileA.length, profileB.length);
  let totalDiff = 0;

  for (let i = 0; i < minLen; i++) {
    totalDiff += Math.abs(profileA[i] - profileB[i]);
  }

  const avgDiff = totalDiff / minLen;
  return Math.max(0, Math.min(1, 1 - avgDiff * 10));
}

function compareHistograms(histA: number[], histB: number[]): number {
  if (histA.length === 0 || histB.length === 0) return 0;
  const minLen = Math.min(histA.length, histB.length);

  // Bhattacharyya coefficient
  let sumProduct = 0;
  for (let i = 0; i < minLen; i++) {
    sumProduct += Math.sqrt(histA[i] * histB[i]);
  }

  return Math.max(0, Math.min(1, sumProduct));
}
