import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { z } from 'zod';
import * as crypto from 'crypto';
import sharp from 'sharp';

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<unknown[]>;
  count(args: Record<string, unknown>): Promise<number>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

// ─── Zod Schemas ────────────────────────────────────────────────────

const PhaseExecutionInputSchema = z.object({
  documentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  imageBuffer: z.instanceof(Buffer),
  matchMode: z.enum(['STRICT', 'PROFESSIONAL', 'HYBRID']).default('STRICT'),
  dpi: z.number().min(72).max(1200).default(150),
});

// ─── Interfaces ─────────────────────────────────────────────────────

interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'text' | 'image' | 'icon' | 'table' | 'chart' | 'shape' | 'unknown';
}

interface ElementDescriptor {
  id: string;
  type: PixelRegion['type'];
  absoluteX: number;
  absoluteY: number;
  width: number;
  height: number;
  layer: number;
  rotation: number;
  opacity: number;
  borderWidth: number;
  borderRadius: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  lineHeight: number;
  letterSpacing: number;
  fontWeight: number;
  fontSizeRatio: number;
  content?: string;
  style?: Record<string, unknown>;
}

interface SpatialConstraintMatrix {
  constraints: Array<{
    elementA: string;
    elementB: string;
    horizontalDistance: number;
    verticalDistance: number;
    relativePosition: 'above' | 'below' | 'left' | 'right' | 'overlapping';
    sizeRatio: number;
  }>;
  hash: string;
}

interface LayoutFingerprint {
  columnRatios: number[];
  relativeDistances: number[];
  whitespaceRatio: number;
  contrastDistribution: number[];
  fontWeightDistribution: number[];
  elementAlignments: Array<{ elementId: string; alignment: string; relativeX: number; relativeY: number }>;
  equationsHash: string;
}

interface PhaseResult {
  phaseName: string;
  phaseNumber: number;
  passed: boolean;
  score: number;
  data: Record<string, unknown>;
  duration: number;
  timestamp: Date;
}

interface StructuralAnalysisResult {
  id: string;
  documentId: string;
  phases: PhaseResult[];
  overallPassed: boolean;
  overallScore: number;
  pixelMap: {
    width: number;
    height: number;
    regionCount: number;
  };
  elements: ElementDescriptor[];
  constraintMatrix: SpatialConstraintMatrix;
  layoutFingerprint: LayoutFingerprint;
  totalDuration: number;
  analyzedAt: Date;
}

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  phaseType?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── CRUD Operations ────────────────────────────────────────────────

const MODEL = 'matchPhases';
const CACHE_PREFIX = 'match-phases';

export async function list(params: ListParams) {
  const { page = 1, limit = 20, search, phaseType, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {};
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (phaseType) where.phaseType = phaseType;
  if (isActive !== undefined) where.isActive = isActive;

  const [data, total] = await Promise.all([
    (prisma[MODEL] as unknown as PrismaDelegate).findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    (prisma[MODEL] as unknown as PrismaDelegate).count({ where }),
  ]);

  const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  await cacheSet(cacheKey, result, 300);
  logger.info('Listed match-phases', { total, page });
  return result;
}

export async function getById(id: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const record = await (prisma[MODEL] as unknown as PrismaDelegate).findUnique({ where: { id } });
  if (!record) throw new NotFoundError('MatchPhases', id);

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await (prisma[MODEL] as unknown as PrismaDelegate).create({ data });
  await cacheDel(`${CACHE_PREFIX}:list`);
  logger.info('Created match-phase', { id: record.id });
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const existing = await (prisma[MODEL] as unknown as PrismaDelegate).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('MatchPhases', id);

  const record = await (prisma[MODEL] as unknown as PrismaDelegate).update({ where: { id }, data });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Updated match-phase', { id });
  return record;
}

export async function remove(id: string) {
  const existing = await (prisma[MODEL] as unknown as PrismaDelegate).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('MatchPhases', id);

  await (prisma[MODEL] as unknown as PrismaDelegate).delete({ where: { id } });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Deleted match-phase', { id });
  return { success: true };
}

// ─── Phase 1: Visual Capture (الالتقاط البصري) ─────────────────────

export async function executePhase1VisualCapture(
  imageBuffer: Buffer,
  dpi: number,
): Promise<PhaseResult> {
  const startTime = Date.now();

  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 800;
  const height = metadata.height || 600;

  // Extract raw pixel data at single-pixel precision
  const { data: rawData, info } = await sharp(imageBuffer)
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Generate pixel fingerprint using hash of raw buffer
  const hashBuffer = crypto.createHash('sha256').update(rawData).digest();
  const pixelFingerprint = hashBuffer.toString('hex');

  // Detect boundaries and regions via edge detection (Sobel operator)
  const grayData = await sharp(imageBuffer)
    .grayscale()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer();

  const regions: PixelRegion[] = [];
  const edgeMap = new Uint8Array(width * height);
  const edgeThreshold = 30;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx =
        -grayData[idx - width - 1] + grayData[idx - width + 1] -
        2 * grayData[idx - 1] + 2 * grayData[idx + 1] -
        grayData[idx + width - 1] + grayData[idx + width + 1];
      const gy =
        -grayData[idx - width - 1] - 2 * grayData[idx - width] - grayData[idx - width + 1] +
        grayData[idx + width - 1] + 2 * grayData[idx + width] + grayData[idx + width + 1];
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edgeMap[idx] = magnitude > edgeThreshold ? 255 : 0;
    }
  }

  // Connected component analysis to detect regions
  const visited = new Uint8Array(width * height);
  const regionSize = 16;

  for (let blockY = 0; blockY < height; blockY += regionSize) {
    for (let blockX = 0; blockX < width; blockX += regionSize) {
      let edgeCount = 0;
      let contentPixels = 0;
      const blockW = Math.min(regionSize, width - blockX);
      const blockH = Math.min(regionSize, height - blockY);

      for (let dy = 0; dy < blockH; dy++) {
        for (let dx = 0; dx < blockW; dx++) {
          const idx = (blockY + dy) * width + (blockX + dx);
          if (edgeMap[idx] > 0) edgeCount++;
          if (grayData[idx] < 200) contentPixels++;
        }
      }

      const blockArea = blockW * blockH;
      if (contentPixels > blockArea * 0.1) {
        const edgeRatio = edgeCount / blockArea;
        let regionType: PixelRegion['type'] = 'unknown';

        if (edgeRatio > 0.3) regionType = 'image';
        else if (edgeRatio > 0.15) regionType = 'chart';
        else if (edgeRatio > 0.08) regionType = 'table';
        else if (contentPixels > blockArea * 0.3) regionType = 'text';
        else regionType = 'shape';

        regions.push({
          x: blockX,
          y: blockY,
          width: blockW,
          height: blockH,
          type: regionType,
        });
      }
    }
  }

  // Merge adjacent regions of the same type
  const mergedRegions = mergeAdjacentRegions(regions, regionSize);

  // Detect grid lines via horizontal and vertical projection
  const horizontalProjection = new Float64Array(height);
  const verticalProjection = new Float64Array(width);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (edgeMap[y * width + x] > 0) {
        horizontalProjection[y]++;
        verticalProjection[x]++;
      }
    }
  }

  const gridLines: Array<{ position: number; orientation: 'horizontal' | 'vertical'; strength: number }> = [];
  const gridThreshold = Math.max(width, height) * 0.3;

  for (let y = 0; y < height; y++) {
    if (horizontalProjection[y] > gridThreshold) {
      gridLines.push({ position: y, orientation: 'horizontal', strength: horizontalProjection[y] / width });
    }
  }
  for (let x = 0; x < width; x++) {
    if (verticalProjection[x] > gridThreshold) {
      gridLines.push({ position: x, orientation: 'vertical', strength: verticalProjection[x] / height });
    }
  }

  const duration = Date.now() - startTime;
  const score = mergedRegions.length > 0 ? 100 : 50;

  return {
    phaseName: 'Visual Capture',
    phaseNumber: 1,
    passed: score >= 50,
    score,
    data: {
      pixelFingerprint,
      width,
      height,
      dpi,
      regionCount: mergedRegions.length,
      regions: mergedRegions,
      gridLines,
      edgePixelCount: edgeMap.filter(v => v > 0).length,
    },
    duration,
    timestamp: new Date(),
  };
}

// ─── Phase 2: Structural Reconstruction (إعادة البناء الهيكلي) ─────

export async function executePhase2StructuralReconstruction(
  imageBuffer: Buffer,
  regions: PixelRegion[],
): Promise<PhaseResult> {
  const startTime = Date.now();

  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width || 800;
  const imgHeight = metadata.height || 600;

  const elements: ElementDescriptor[] = [];

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    const elementId = crypto.randomUUID();

    // Calculate relative metrics
    const fontSizeRatio = region.height / imgHeight;
    const widthRatio = region.width / imgWidth;

    // Estimate padding and margins based on neighboring regions
    const neighbors = regions.filter((r, idx) => {
      if (idx === i) return false;
      const distX = Math.abs((r.x + r.width / 2) - (region.x + region.width / 2));
      const distY = Math.abs((r.y + r.height / 2) - (region.y + region.height / 2));
      return distX < imgWidth * 0.2 && distY < imgHeight * 0.2;
    });

    let estimatedPadding = 4;
    let estimatedMargin = 8;
    if (neighbors.length > 0) {
      const minGap = neighbors.reduce((min, n) => {
        const gapX = Math.max(0, Math.abs(n.x - (region.x + region.width)), Math.abs(region.x - (n.x + n.width)));
        const gapY = Math.max(0, Math.abs(n.y - (region.y + region.height)), Math.abs(region.y - (n.y + n.height)));
        return Math.min(min, gapX, gapY);
      }, Infinity);
      estimatedMargin = Math.max(2, Math.round(minGap / 2));
      estimatedPadding = Math.max(2, Math.round(minGap / 4));
    }

    elements.push({
      id: elementId,
      type: region.type,
      absoluteX: region.x,
      absoluteY: region.y,
      width: region.width,
      height: region.height,
      layer: i,
      rotation: 0,
      opacity: 1.0,
      borderWidth: 0,
      borderRadius: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
      paddingTop: estimatedPadding,
      paddingRight: estimatedPadding,
      paddingBottom: estimatedPadding,
      paddingLeft: estimatedPadding,
      marginTop: estimatedMargin,
      marginRight: estimatedMargin,
      marginBottom: estimatedMargin,
      marginLeft: estimatedMargin,
      lineHeight: region.type === 'text' ? Math.round(region.height * 1.4) : 0,
      letterSpacing: 0,
      fontWeight: region.type === 'text' ? 400 : 0,
      fontSizeRatio: Math.round(fontSizeRatio * 10000) / 10000,
    });
  }

  // Build spatial constraint matrix
  const constraints: SpatialConstraintMatrix['constraints'] = [];

  for (let a = 0; a < elements.length; a++) {
    for (let b = a + 1; b < elements.length; b++) {
      const elA = elements[a];
      const elB = elements[b];

      const centerAX = elA.absoluteX + elA.width / 2;
      const centerAY = elA.absoluteY + elA.height / 2;
      const centerBX = elB.absoluteX + elB.width / 2;
      const centerBY = elB.absoluteY + elB.height / 2;

      const hDist = centerBX - centerAX;
      const vDist = centerBY - centerAY;

      let relativePosition: 'above' | 'below' | 'left' | 'right' | 'overlapping';
      const overlapX = !(elA.absoluteX + elA.width < elB.absoluteX || elB.absoluteX + elB.width < elA.absoluteX);
      const overlapY = !(elA.absoluteY + elA.height < elB.absoluteY || elB.absoluteY + elB.height < elA.absoluteY);

      if (overlapX && overlapY) relativePosition = 'overlapping';
      else if (Math.abs(vDist) > Math.abs(hDist)) relativePosition = vDist > 0 ? 'below' : 'above';
      else relativePosition = hDist > 0 ? 'right' : 'left';

      const areaA = elA.width * elA.height;
      const areaB = elB.width * elB.height;
      const sizeRatio = areaB > 0 ? Math.round((areaA / areaB) * 10000) / 10000 : 0;

      constraints.push({
        elementA: elA.id,
        elementB: elB.id,
        horizontalDistance: Math.round(hDist * 100) / 100,
        verticalDistance: Math.round(vDist * 100) / 100,
        relativePosition,
        sizeRatio,
      });
    }
  }

  const constraintHash = crypto.createHash('sha256')
    .update(JSON.stringify(constraints))
    .digest('hex');

  const constraintMatrix: SpatialConstraintMatrix = {
    constraints,
    hash: constraintHash,
  };

  const duration = Date.now() - startTime;
  const score = elements.length > 0 ? 100 : 50;

  return {
    phaseName: 'Structural Reconstruction',
    phaseNumber: 2,
    passed: score >= 50,
    score,
    data: {
      elementCount: elements.length,
      elements,
      constraintMatrix,
      constraintCount: constraints.length,
    },
    duration,
    timestamp: new Date(),
  };
}

// ─── Phase 3: Mathematical Layout Fingerprint (البصمة التخطيطية) ───

export async function executePhase3LayoutFingerprint(
  imageBuffer: Buffer,
  elements: ElementDescriptor[],
): Promise<PhaseResult> {
  const startTime = Date.now();

  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width || 800;
  const imgHeight = metadata.height || 600;

  // Calculate column ratios
  const xPositions = elements.map(e => e.absoluteX).sort((a, b) => a - b);
  const columnBoundaries: number[] = [];
  for (let i = 1; i < xPositions.length; i++) {
    if (xPositions[i] - xPositions[i - 1] > imgWidth * 0.1) {
      columnBoundaries.push(xPositions[i]);
    }
  }
  const columnRatios = columnBoundaries.map(b => Math.round((b / imgWidth) * 10000) / 10000);

  // Calculate relative distances between consecutive elements
  const sortedByY = [...elements].sort((a, b) => a.absoluteY - b.absoluteY);
  const relativeDistances: number[] = [];
  for (let i = 1; i < sortedByY.length; i++) {
    const dist = (sortedByY[i].absoluteY - sortedByY[i - 1].absoluteY) / imgHeight;
    relativeDistances.push(Math.round(dist * 10000) / 10000);
  }

  // Calculate whitespace ratio
  const totalElementArea = elements.reduce((sum, e) => sum + e.width * e.height, 0);
  const totalArea = imgWidth * imgHeight;
  const whitespaceRatio = Math.round(((totalArea - totalElementArea) / totalArea) * 10000) / 10000;

  // Calculate contrast distribution from raw image
  const grayData = await sharp(imageBuffer)
    .grayscale()
    .resize(Math.min(imgWidth, 200), Math.min(imgHeight, 200), { fit: 'inside' })
    .raw()
    .toBuffer();

  const histogram = new Float64Array(10);
  for (let i = 0; i < grayData.length; i++) {
    const bucket = Math.min(9, Math.floor(grayData[i] / 25.6));
    histogram[bucket]++;
  }
  const totalPixels = grayData.length;
  const contrastDistribution = Array.from(histogram).map(
    count => Math.round((count / totalPixels) * 10000) / 10000,
  );

  // Font weight distribution
  const fontWeights = elements.filter(e => e.fontWeight > 0).map(e => e.fontWeight);
  const fontWeightBuckets = new Map<number, number>();
  for (const w of fontWeights) {
    fontWeightBuckets.set(w, (fontWeightBuckets.get(w) || 0) + 1);
  }
  const fontWeightDistribution = Array.from(fontWeightBuckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([weight, count]) => Math.round((count / Math.max(1, fontWeights.length)) * 10000) / 10000);

  // Element alignments relative to page
  const elementAlignments = elements.map(e => {
    const relX = Math.round((e.absoluteX / imgWidth) * 10000) / 10000;
    const relY = Math.round((e.absoluteY / imgHeight) * 10000) / 10000;
    let alignment = 'left';
    if (relX > 0.4 && relX < 0.6) alignment = 'center';
    else if (relX > 0.6) alignment = 'right';
    return { elementId: e.id, alignment, relativeX: relX, relativeY: relY };
  });

  // Compute fingerprint hash (mathematical equations representation)
  const fingerprintData = {
    columnRatios,
    relativeDistances,
    whitespaceRatio,
    contrastDistribution,
    fontWeightDistribution,
    alignmentSummary: elementAlignments.map(a => `${a.alignment}:${a.relativeX}:${a.relativeY}`),
  };
  const equationsHash = crypto.createHash('sha256')
    .update(JSON.stringify(fingerprintData))
    .digest('hex');

  const layoutFingerprint: LayoutFingerprint = {
    columnRatios,
    relativeDistances,
    whitespaceRatio,
    contrastDistribution,
    fontWeightDistribution,
    elementAlignments,
    equationsHash,
  };

  const duration = Date.now() - startTime;

  return {
    phaseName: 'Mathematical Layout Fingerprint',
    phaseNumber: 3,
    passed: true,
    score: 100,
    data: {
      layoutFingerprint,
      columnCount: columnBoundaries.length + 1,
      whitespaceRatio,
      equationsHash,
    },
    duration,
    timestamp: new Date(),
  };
}

// ─── Phase 4: Comparison and Verification (المقارنة والتحقق) ───────

export async function executePhase4ComparisonVerification(
  originalFingerprint: LayoutFingerprint,
  replicaFingerprint: LayoutFingerprint,
): Promise<PhaseResult> {
  const startTime = Date.now();

  // Compare column ratios
  let columnScore = 100;
  if (originalFingerprint.columnRatios.length !== replicaFingerprint.columnRatios.length) {
    columnScore = 0;
  } else {
    for (let i = 0; i < originalFingerprint.columnRatios.length; i++) {
      const diff = Math.abs(originalFingerprint.columnRatios[i] - replicaFingerprint.columnRatios[i]);
      columnScore -= diff * 1000; // Each 0.1% deviation costs 1 point
    }
    columnScore = Math.max(0, columnScore);
  }

  // Compare whitespace ratio
  const whitespaceDiff = Math.abs(originalFingerprint.whitespaceRatio - replicaFingerprint.whitespaceRatio);
  const whitespaceScore = Math.max(0, 100 - whitespaceDiff * 500);

  // Compare contrast distribution
  let contrastScore = 100;
  const minLen = Math.min(
    originalFingerprint.contrastDistribution.length,
    replicaFingerprint.contrastDistribution.length,
  );
  for (let i = 0; i < minLen; i++) {
    const diff = Math.abs(
      originalFingerprint.contrastDistribution[i] - replicaFingerprint.contrastDistribution[i],
    );
    contrastScore -= diff * 200;
  }
  contrastScore = Math.max(0, contrastScore);

  // Compare element alignment patterns
  let alignmentScore = 100;
  const origAlignments = originalFingerprint.elementAlignments;
  const repAlignments = replicaFingerprint.elementAlignments;
  const maxAlignments = Math.max(origAlignments.length, repAlignments.length);
  const minAlignments = Math.min(origAlignments.length, repAlignments.length);

  if (maxAlignments > 0) {
    const countPenalty = ((maxAlignments - minAlignments) / maxAlignments) * 30;
    alignmentScore -= countPenalty;

    for (let i = 0; i < minAlignments; i++) {
      const xDiff = Math.abs(origAlignments[i].relativeX - repAlignments[i].relativeX);
      const yDiff = Math.abs(origAlignments[i].relativeY - repAlignments[i].relativeY);
      alignmentScore -= (xDiff + yDiff) * 100 / minAlignments;
    }
    alignmentScore = Math.max(0, alignmentScore);
  }

  // Compare equations hash for exact structural match
  const exactMatch = originalFingerprint.equationsHash === replicaFingerprint.equationsHash;

  // Weighted overall score
  const overallScore = Math.round(
    (columnScore * 0.25 + whitespaceScore * 0.20 + contrastScore * 0.25 + alignmentScore * 0.30) * 100,
  ) / 100;

  const structuralFingerprint = overallScore / 100;
  const passed = structuralFingerprint >= 0.999 || exactMatch;

  const duration = Date.now() - startTime;

  return {
    phaseName: 'Comparison and Verification',
    phaseNumber: 4,
    passed,
    score: overallScore,
    data: {
      columnScore: Math.round(columnScore * 100) / 100,
      whitespaceScore: Math.round(whitespaceScore * 100) / 100,
      contrastScore: Math.round(contrastScore * 100) / 100,
      alignmentScore: Math.round(alignmentScore * 100) / 100,
      exactMatch,
      structuralFingerprint: Math.round(structuralFingerprint * 10000) / 10000,
    },
    duration,
    timestamp: new Date(),
  };
}

// ─── Full Pipeline Execution ────────────────────────────────────────

export async function executeFullPipeline(
  input: z.infer<typeof PhaseExecutionInputSchema>,
): Promise<StructuralAnalysisResult> {
  const validated = PhaseExecutionInputSchema.parse(input);
  const phases: PhaseResult[] = [];
  const totalStart = Date.now();

  // Phase 1: Visual Capture
  const phase1 = await executePhase1VisualCapture(validated.imageBuffer, validated.dpi);
  phases.push(phase1);

  if (!phase1.passed) {
    logger.warn('Phase 1 failed, aborting pipeline', { documentId: validated.documentId });
    return buildResult(validated.documentId, phases, [], { constraints: [], hash: '' }, emptyFingerprint(), totalStart);
  }

  // Phase 2: Structural Reconstruction
  const regions = phase1.data.regions as PixelRegion[];
  const phase2 = await executePhase2StructuralReconstruction(validated.imageBuffer, regions);
  phases.push(phase2);

  if (!phase2.passed) {
    logger.warn('Phase 2 failed, aborting pipeline', { documentId: validated.documentId });
    return buildResult(validated.documentId, phases, [], { constraints: [], hash: '' }, emptyFingerprint(), totalStart);
  }

  // Phase 3: Layout Fingerprint
  const elements = phase2.data.elements as ElementDescriptor[];
  const phase3 = await executePhase3LayoutFingerprint(validated.imageBuffer, elements);
  phases.push(phase3);

  const constraintMatrix = phase2.data.constraintMatrix as SpatialConstraintMatrix;
  const layoutFingerprint = phase3.data.layoutFingerprint as LayoutFingerprint;

  const result = buildResult(
    validated.documentId,
    phases,
    elements,
    constraintMatrix,
    layoutFingerprint,
    totalStart,
  );

  // Persist the analysis result
  await prisma.structuralAnalysis.create({
    data: {
      id: result.id,
      documentId: result.documentId,
      tenantId: validated.tenantId,
      phases: JSON.parse(JSON.stringify(result.phases)),
      overallPassed: result.overallPassed,
      overallScore: result.overallScore,
      elementCount: elements.length,
      constraintHash: constraintMatrix.hash,
      fingerprintHash: layoutFingerprint.equationsHash,
      totalDuration: result.totalDuration,
      analyzedAt: result.analyzedAt,
    },
  });

  logger.info('Completed full match-phase pipeline', {
    documentId: validated.documentId,
    overallPassed: result.overallPassed,
    overallScore: result.overallScore,
    phaseCount: phases.length,
    totalDuration: result.totalDuration,
  });

  return result;
}

// ─── Helper Functions ───────────────────────────────────────────────

function mergeAdjacentRegions(regions: PixelRegion[], blockSize: number): PixelRegion[] {
  if (regions.length === 0) return [];

  const merged: PixelRegion[] = [];
  const used = new Set<number>();

  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;

    let current = { ...regions[i] };
    used.add(i);

    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < regions.length; j++) {
        if (used.has(j)) continue;
        if (regions[j].type !== current.type) continue;

        const adjacent =
          Math.abs(regions[j].x - (current.x + current.width)) <= blockSize ||
          Math.abs((regions[j].x + regions[j].width) - current.x) <= blockSize ||
          Math.abs(regions[j].y - (current.y + current.height)) <= blockSize ||
          Math.abs((regions[j].y + regions[j].height) - current.y) <= blockSize;

        const overlapsX = regions[j].x < current.x + current.width + blockSize &&
          regions[j].x + regions[j].width > current.x - blockSize;
        const overlapsY = regions[j].y < current.y + current.height + blockSize &&
          regions[j].y + regions[j].height > current.y - blockSize;

        if (adjacent && overlapsX && overlapsY) {
          const newX = Math.min(current.x, regions[j].x);
          const newY = Math.min(current.y, regions[j].y);
          const newRight = Math.max(current.x + current.width, regions[j].x + regions[j].width);
          const newBottom = Math.max(current.y + current.height, regions[j].y + regions[j].height);
          current = {
            x: newX,
            y: newY,
            width: newRight - newX,
            height: newBottom - newY,
            type: current.type,
          };
          used.add(j);
          changed = true;
        }
      }
    }

    merged.push(current);
  }

  return merged;
}

function emptyFingerprint(): LayoutFingerprint {
  return {
    columnRatios: [],
    relativeDistances: [],
    whitespaceRatio: 1,
    contrastDistribution: [],
    fontWeightDistribution: [],
    elementAlignments: [],
    equationsHash: '',
  };
}

function buildResult(
  documentId: string,
  phases: PhaseResult[],
  elements: ElementDescriptor[],
  constraintMatrix: SpatialConstraintMatrix,
  layoutFingerprint: LayoutFingerprint,
  totalStart: number,
): StructuralAnalysisResult {
  const overallPassed = phases.every(p => p.passed);
  const overallScore = phases.length > 0
    ? Math.round((phases.reduce((sum, p) => sum + p.score, 0) / phases.length) * 100) / 100
    : 0;

  const metadata = phases[0]?.data || {};

  return {
    id: crypto.randomUUID(),
    documentId,
    phases,
    overallPassed,
    overallScore,
    pixelMap: {
      width: (metadata.width as number) || 0,
      height: (metadata.height as number) || 0,
      regionCount: (metadata.regionCount as number) || 0,
    },
    elements,
    constraintMatrix,
    layoutFingerprint,
    totalDuration: Date.now() - totalStart,
    analyzedAt: new Date(),
  };
}
