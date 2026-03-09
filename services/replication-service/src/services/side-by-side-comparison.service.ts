import { z } from 'zod';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// ─── Zod Schemas ────────────────────────────────────────────────────

const SideBySideRequestSchema = z.object({
  originalDocumentId: z.string().uuid(),
  replicaDocumentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  originalImageBuffer: z.instanceof(Buffer),
  replicaImageBuffer: z.instanceof(Buffer),
  outputWidth: z.number().min(400).max(4096).default(1920),
  highlightDifferences: z.boolean().default(true),
  diffOverlayOpacity: z.number().min(0).max(1).default(0.4),
  includeAnnotations: z.boolean().default(true),
  includeMetrics: z.boolean().default(true),
});

// ─── Interfaces ─────────────────────────────────────────────────────

interface DiffRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  severity: 'critical' | 'major' | 'minor' | 'cosmetic';
  deviationScore: number;
  description: string;
}

interface SideBySideResult {
  id: string;
  originalDocumentId: string;
  replicaDocumentId: string;
  compositeImageBuffer: Buffer;
  originalAnnotatedBuffer: Buffer;
  replicaAnnotatedBuffer: Buffer;
  diffOverlayBuffer: Buffer;
  diffRegions: DiffRegion[];
  metrics: {
    totalPixels: number;
    matchingPixels: number;
    differingPixels: number;
    matchPercentage: number;
    maxDeviation: number;
    averageDeviation: number;
    criticalRegionCount: number;
    majorRegionCount: number;
    minorRegionCount: number;
  };
  dimensions: {
    originalWidth: number;
    originalHeight: number;
    replicaWidth: number;
    replicaHeight: number;
    compositeWidth: number;
    compositeHeight: number;
  };
  generatedAt: Date;
}

// ─── Side-by-Side Comparison Engine ─────────────────────────────────

export async function generateSideBySideComparison(
  input: z.infer<typeof SideBySideRequestSchema>,
): Promise<SideBySideResult> {
  const validated = SideBySideRequestSchema.parse(input);
  const resultId = crypto.randomUUID();

  // Get metadata for both images
  const [origMeta, repMeta] = await Promise.all([
    sharp(validated.originalImageBuffer).metadata(),
    sharp(validated.replicaImageBuffer).metadata(),
  ]);

  const origWidth = origMeta.width || 800;
  const origHeight = origMeta.height || 600;
  const repWidth = repMeta.width || 800;
  const repHeight = repMeta.height || 600;

  // Normalize both to same dimensions for comparison
  const compareWidth = Math.min(Math.max(origWidth, repWidth), 2048);
  const compareHeight = Math.min(Math.max(origHeight, repHeight), 2048);

  const [origResized, repResized] = await Promise.all([
    sharp(validated.originalImageBuffer)
      .resize(compareWidth, compareHeight, { fit: 'fill' })
      .raw()
      .toBuffer(),
    sharp(validated.replicaImageBuffer)
      .resize(compareWidth, compareHeight, { fit: 'fill' })
      .raw()
      .toBuffer(),
  ]);

  // Pixel-by-pixel comparison
  const channels = 4;
  const totalPixels = compareWidth * compareHeight;
  let matchingPixels = 0;
  let differingPixels = 0;
  let maxDeviation = 0;
  let deviationSum = 0;

  // Build diff overlay (red = different, transparent = matching)
  const diffData = Buffer.alloc(compareWidth * compareHeight * 4);

  // Region-based difference tracking
  const regionSize = 24;
  const regionMap = new Map<string, {
    x: number;
    y: number;
    diffCount: number;
    totalDelta: number;
    maxDelta: number;
  }>();

  for (let y = 0; y < compareHeight; y++) {
    for (let x = 0; x < compareWidth; x++) {
      const idx = (y * compareWidth + x) * channels;

      const oR = origResized[idx];
      const oG = origResized[idx + 1];
      const oB = origResized[idx + 2];
      const rR = repResized[idx];
      const rG = repResized[idx + 1];
      const rB = repResized[idx + 2];

      const delta = Math.sqrt(
        (oR - rR) ** 2 +
        (oG - rG) ** 2 +
        (oB - rB) ** 2,
      );

      deviationSum += delta;
      maxDeviation = Math.max(maxDeviation, delta);

      if (delta <= 5) {
        matchingPixels++;
        // Transparent in diff overlay
        diffData[idx] = 0;
        diffData[idx + 1] = 0;
        diffData[idx + 2] = 0;
        diffData[idx + 3] = 0;
      } else {
        differingPixels++;

        // Color-code by severity
        const severity = delta / 441.67; // max possible delta = sqrt(255^2 * 3)
        diffData[idx] = Math.round(255 * Math.min(1, severity * 2));
        diffData[idx + 1] = Math.round(255 * Math.max(0, 1 - severity * 3));
        diffData[idx + 2] = 0;
        diffData[idx + 3] = Math.round(255 * validated.diffOverlayOpacity);

        const rKey = `${Math.floor(x / regionSize)},${Math.floor(y / regionSize)}`;
        const region = regionMap.get(rKey);
        if (region) {
          region.diffCount++;
          region.totalDelta += delta;
          region.maxDelta = Math.max(region.maxDelta, delta);
        } else {
          regionMap.set(rKey, {
            x: Math.floor(x / regionSize) * regionSize,
            y: Math.floor(y / regionSize) * regionSize,
            diffCount: 1,
            totalDelta: delta,
            maxDelta: delta,
          });
        }
      }
    }
  }

  // Build diff regions
  const diffRegions: DiffRegion[] = Array.from(regionMap.values())
    .filter(r => r.diffCount > regionSize * regionSize * 0.03)
    .sort((a, b) => b.diffCount - a.diffCount)
    .slice(0, 50)
    .map(r => {
      const areaPixels = regionSize * regionSize;
      const diffPercent = (r.diffCount / areaPixels) * 100;
      const avgDelta = r.totalDelta / r.diffCount;

      let severity: DiffRegion['severity'];
      if (diffPercent > 50 || r.maxDelta > 200) severity = 'critical';
      else if (diffPercent > 25 || r.maxDelta > 100) severity = 'major';
      else if (diffPercent > 10 || r.maxDelta > 50) severity = 'minor';
      else severity = 'cosmetic';

      return {
        id: crypto.randomUUID(),
        x: r.x,
        y: r.y,
        width: regionSize,
        height: regionSize,
        severity,
        deviationScore: Math.round(diffPercent * 100) / 100,
        description: `${diffPercent.toFixed(1)}% pixels differ (avg delta: ${avgDelta.toFixed(1)}, max: ${r.maxDelta.toFixed(1)})`,
      };
    });

  // Generate diff overlay as PNG
  const diffOverlayBuffer = await sharp(diffData, {
    raw: { width: compareWidth, height: compareHeight, channels: 4 },
  })
    .png()
    .toBuffer();

  // Generate annotated original (with red boxes around diff regions)
  const origPng = await sharp(validated.originalImageBuffer)
    .resize(compareWidth, compareHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  const repPng = await sharp(validated.replicaImageBuffer)
    .resize(compareWidth, compareHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  // Create annotation SVG overlay for critical/major diff regions
  let annotationSvg = `<svg width="${compareWidth}" height="${compareHeight}" xmlns="http://www.w3.org/2000/svg">`;
  for (const region of diffRegions) {
    const color = region.severity === 'critical' ? '#ff0000'
      : region.severity === 'major' ? '#ff8800'
      : region.severity === 'minor' ? '#ffcc00'
      : '#88ccff';
    const strokeWidth = region.severity === 'critical' ? 3 : 2;
    annotationSvg += `<rect x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${region.severity === 'cosmetic' ? '4,4' : 'none'}" />`;
    if (validated.includeAnnotations && (region.severity === 'critical' || region.severity === 'major')) {
      annotationSvg += `<text x="${region.x + 2}" y="${region.y - 4}" fill="${color}" font-size="10" font-family="monospace">${region.deviationScore.toFixed(0)}%</text>`;
    }
  }
  annotationSvg += '</svg>';
  const annotationBuffer = Buffer.from(annotationSvg);

  // Composite annotations onto both images
  const [originalAnnotatedBuffer, replicaAnnotatedBuffer] = await Promise.all([
    sharp(origPng)
      .composite([{ input: annotationBuffer, top: 0, left: 0 }])
      .png()
      .toBuffer(),
    sharp(repPng)
      .composite([{
        input: annotationBuffer,
        top: 0,
        left: 0,
      }, {
        input: diffOverlayBuffer,
        top: 0,
        left: 0,
        blend: 'over',
      }])
      .png()
      .toBuffer(),
  ]);

  // Build side-by-side composite: [Original | Separator | Replica]
  const separatorWidth = 4;
  const halfWidth = Math.floor(validated.outputWidth / 2) - Math.floor(separatorWidth / 2);
  const compositeHeight = Math.round(halfWidth * (compareHeight / compareWidth));

  // Resize both sides for composite
  const [leftSide, rightSide] = await Promise.all([
    sharp(originalAnnotatedBuffer)
      .resize(halfWidth, compositeHeight, { fit: 'fill' })
      .png()
      .toBuffer(),
    sharp(replicaAnnotatedBuffer)
      .resize(halfWidth, compositeHeight, { fit: 'fill' })
      .png()
      .toBuffer(),
  ]);

  // Create separator bar
  const separatorBuffer = await sharp({
    create: {
      width: separatorWidth,
      height: compositeHeight,
      channels: 4,
      background: { r: 200, g: 200, b: 200, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  // Combine into single composite
  const compositeWidth = halfWidth * 2 + separatorWidth;
  const compositeImageBuffer = await sharp({
    create: {
      width: compositeWidth,
      height: compositeHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      { input: leftSide, top: 0, left: 0 },
      { input: separatorBuffer, top: 0, left: halfWidth },
      { input: rightSide, top: 0, left: halfWidth + separatorWidth },
    ])
    .png()
    .toBuffer();

  // Calculate metrics
  const matchPercentage = totalPixels > 0
    ? Math.round((matchingPixels / totalPixels) * 10000) / 100
    : 100;
  const averageDeviation = totalPixels > 0
    ? Math.round((deviationSum / totalPixels) * 100) / 100
    : 0;

  const result: SideBySideResult = {
    id: resultId,
    originalDocumentId: validated.originalDocumentId,
    replicaDocumentId: validated.replicaDocumentId,
    compositeImageBuffer,
    originalAnnotatedBuffer,
    replicaAnnotatedBuffer,
    diffOverlayBuffer,
    diffRegions,
    metrics: {
      totalPixels,
      matchingPixels,
      differingPixels,
      matchPercentage,
      maxDeviation: Math.round(maxDeviation * 100) / 100,
      averageDeviation,
      criticalRegionCount: diffRegions.filter(r => r.severity === 'critical').length,
      majorRegionCount: diffRegions.filter(r => r.severity === 'major').length,
      minorRegionCount: diffRegions.filter(r => r.severity === 'minor').length,
    },
    dimensions: {
      originalWidth: origWidth,
      originalHeight: origHeight,
      replicaWidth: repWidth,
      replicaHeight: repHeight,
      compositeWidth,
      compositeHeight,
    },
    generatedAt: new Date(),
  };

  // Persist comparison record (without image buffers)
  await prisma.sideBySideComparison.create({
    data: {
      id: result.id,
      originalDocumentId: result.originalDocumentId,
      replicaDocumentId: result.replicaDocumentId,
      tenantId: validated.tenantId,
      userId: validated.userId,
      matchPercentage: result.metrics.matchPercentage,
      totalPixels: result.metrics.totalPixels,
      differingPixels: result.metrics.differingPixels,
      maxDeviation: result.metrics.maxDeviation,
      averageDeviation: result.metrics.averageDeviation,
      criticalRegionCount: result.metrics.criticalRegionCount,
      majorRegionCount: result.metrics.majorRegionCount,
      minorRegionCount: result.metrics.minorRegionCount,
      diffRegions: JSON.parse(JSON.stringify(result.diffRegions)),
      compositeWidth: result.dimensions.compositeWidth,
      compositeHeight: result.dimensions.compositeHeight,
      generatedAt: result.generatedAt,
    },
  });

  logger.info('Generated side-by-side comparison', {
    resultId,
    matchPercentage: result.metrics.matchPercentage,
    diffRegionCount: diffRegions.length,
    criticalCount: result.metrics.criticalRegionCount,
  });

  return result;
}
