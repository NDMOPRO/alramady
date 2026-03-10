import { PrismaClient, Prisma } from '@prisma/client';
import sharp from 'sharp';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface ComparisonRequest {
  id: string;
  originalDocumentId: string;
  replicaDocumentId: string;
  comparisonType: 'visual' | 'structural' | 'content' | 'full';
  options: ComparisonOptions;
}

interface ComparisonOptions {
  pixelTolerance: number;
  colorThreshold: number;
  structureWeight: number;
  contentWeight: number;
  visualWeight: number;
  ignoreRegions?: IgnoreRegion[];
  dpi: number;
  includeOverlay: boolean;
  antiAliasing: boolean;
}

interface IgnoreRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
}

interface ComparisonResult {
  id: string;
  requestId: string;
  overallScore: number;
  visualScore: number;
  structuralScore: number;
  contentScore: number;
  status: 'pass' | 'fail' | 'warning';
  differences: DifferenceDetail[];
  statistics: ComparisonStatistics;
  overlayImage?: Buffer;
  createdAt: Date;
}

interface DifferenceDetail {
  id: string;
  type: 'pixel' | 'layout' | 'text' | 'color' | 'missing_element' | 'extra_element' | 'size' | 'font';
  severity: 'critical' | 'major' | 'minor' | 'cosmetic';
  location: { x: number; y: number; width: number; height: number; page?: number };
  description: string;
  originalValue?: string;
  replicaValue?: string;
  score: number;
}

interface ComparisonStatistics {
  totalPixels: number;
  matchingPixels: number;
  differingPixels: number;
  matchPercentage: number;
  totalElements: number;
  matchingElements: number;
  missingElements: number;
  extraElements: number;
  averageColorDelta: number;
  maxColorDelta: number;
  processingTime: number;
}

interface PageImage {
  pageNumber: number;
  width: number;
  height: number;
  buffer: Buffer;
  elements: PageElement[];
}

interface PageElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'table' | 'chart';
  bounds: { x: number; y: number; width: number; height: number };
  content?: string;
  style?: Record<string, unknown>;
  children?: PageElement[];
}

interface FidelityReport {
  id: string;
  comparisonId: string;
  overallFidelity: number;
  categories: FidelityCategory[];
  recommendations: string[];
  generatedAt: Date;
}

interface FidelityCategory {
  name: string;
  score: number;
  weight: number;
  issues: string[];
}

// ─── Service ─────────────────────────────────────────────────────────
export default class ComparisonEngineService {
  private prisma: PrismaClient;
  private comparisonCache: Map<string, ComparisonResult> = new Map();
  private readonly DEFAULT_OPTIONS: ComparisonOptions = {
    pixelTolerance: 5,
    colorThreshold: 10,
    structureWeight: 0.3,
    contentWeight: 0.3,
    visualWeight: 0.4,
    dpi: 150,
    includeOverlay: true,
    antiAliasing: true,
  };

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async compareDocuments(request: ComparisonRequest): Promise<ComparisonResult> {
    const startTime = Date.now();
    const options = { ...this.DEFAULT_OPTIONS, ...request.options };

    const [originalPages, replicaPages] = await Promise.all([
      this.renderDocumentPages(request.originalDocumentId, options.dpi),
      this.renderDocumentPages(request.replicaDocumentId, options.dpi),
    ]);

    const differences: DifferenceDetail[] = [];
    let totalMatchingPixels = 0;
    let totalDifferingPixels = 0;
    let totalPixels = 0;
    let colorDeltaSum = 0;
    let maxColorDelta = 0;
    let pixelCompareCount = 0;

    const pageCount = Math.max(originalPages.length, replicaPages.length);
    const overlayBuffers: Buffer[] = [];

    for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
      const origPage = originalPages[pageIdx];
      const repPage = replicaPages[pageIdx];

      if (!origPage && repPage) {
        differences.push({
          id: crypto.randomUUID(),
          type: 'missing_element',
          severity: 'critical',
          location: { x: 0, y: 0, width: repPage.width, height: repPage.height, page: pageIdx + 1 },
          description: `Extra page ${pageIdx + 1} found in replica`,
          score: 0,
        });
        continue;
      }

      if (origPage && !repPage) {
        differences.push({
          id: crypto.randomUUID(),
          type: 'missing_element',
          severity: 'critical',
          location: { x: 0, y: 0, width: origPage.width, height: origPage.height, page: pageIdx + 1 },
          description: `Page ${pageIdx + 1} missing from replica`,
          score: 0,
        });
        continue;
      }

      if (!origPage || !repPage) continue;

      if (request.comparisonType === 'visual' || request.comparisonType === 'full') {
        const pixelResult = await this.comparePixels(
          origPage.buffer,
          repPage.buffer,
          origPage.width,
          origPage.height,
          options,
          pageIdx + 1,
        );

        totalMatchingPixels += pixelResult.matchingPixels;
        totalDifferingPixels += pixelResult.differingPixels;
        totalPixels += pixelResult.totalPixels;
        colorDeltaSum += pixelResult.colorDeltaSum;
        maxColorDelta = Math.max(maxColorDelta, pixelResult.maxColorDelta);
        pixelCompareCount += pixelResult.comparedPixels;
        differences.push(...pixelResult.differences);

        if (options.includeOverlay && pixelResult.overlayBuffer) {
          overlayBuffers.push(pixelResult.overlayBuffer);
        }
      }

      if (request.comparisonType === 'structural' || request.comparisonType === 'full') {
        const structDiffs = this.compareStructure(
          origPage.elements,
          repPage.elements,
          pageIdx + 1,
        );
        differences.push(...structDiffs);
      }

      if (request.comparisonType === 'content' || request.comparisonType === 'full') {
        const contentDiffs = this.compareContent(
          origPage.elements,
          repPage.elements,
          pageIdx + 1,
        );
        differences.push(...contentDiffs);
      }
    }

    const visualScore = totalPixels > 0
      ? (totalMatchingPixels / totalPixels) * 100
      : 100;

    const structuralDiffs = differences.filter(d =>
      ['missing_element', 'extra_element', 'layout', 'size'].includes(d.type),
    );
    const structuralScore = this.computeStructuralScore(structuralDiffs, originalPages);

    const contentDiffs = differences.filter(d =>
      ['text', 'font', 'color'].includes(d.type),
    );
    const contentScore = this.computeContentScore(contentDiffs, originalPages);

    const overallScore = Math.round(
      (visualScore * options.visualWeight +
        structuralScore * options.structureWeight +
        contentScore * options.contentWeight) * 100,
    ) / 100;

    const averageColorDelta = pixelCompareCount > 0 ? colorDeltaSum / pixelCompareCount : 0;

    const status: ComparisonResult['status'] =
      overallScore >= 95 ? 'pass' :
        overallScore >= 80 ? 'warning' :
          'fail';

    let overlayImage: Buffer | undefined;
    if (overlayBuffers.length > 0) {
      overlayImage = await this.combineOverlayImages(overlayBuffers);
    }

    const result: ComparisonResult = {
      id: crypto.randomUUID(),
      requestId: request.id,
      overallScore,
      visualScore: Math.round(visualScore * 100) / 100,
      structuralScore: Math.round(structuralScore * 100) / 100,
      contentScore: Math.round(contentScore * 100) / 100,
      status,
      differences,
      statistics: {
        totalPixels,
        matchingPixels: totalMatchingPixels,
        differingPixels: totalDifferingPixels,
        matchPercentage: totalPixels > 0 ? Math.round((totalMatchingPixels / totalPixels) * 10000) / 100 : 100,
        totalElements: originalPages.reduce((sum, p) => sum + p.elements.length, 0),
        matchingElements: 0,
        missingElements: structuralDiffs.filter(d => d.type === 'missing_element').length,
        extraElements: structuralDiffs.filter(d => d.type === 'extra_element').length,
        averageColorDelta: Math.round(averageColorDelta * 100) / 100,
        maxColorDelta: Math.round(maxColorDelta * 100) / 100,
        processingTime: Date.now() - startTime,
      },
      overlayImage,
      createdAt: new Date(),
    };

    await this.prisma.comparisonResult.create({
      data: {
        id: result.id,
        requestId: result.requestId,
        overallScore: result.overallScore,
        visualScore: result.visualScore,
        structuralScore: result.structuralScore,
        contentScore: result.contentScore,
        status: result.status,
        differences: result.differences as unknown as Prisma.InputJsonValue,
        statistics: result.statistics as unknown as Prisma.InputJsonValue,
        createdAt: result.createdAt,
      },
    });

    this.comparisonCache.set(result.id, result);
    return result;
  }

  private async renderDocumentPages(
    documentId: string,
    dpi: number,
  ): Promise<PageImage[]> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { pages: { orderBy: { pageNumber: 'asc' } } },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const pages: PageImage[] = [];

    for (const page of document.pages) {
      const width = Math.round(((page.width as number) || 595) * dpi / 72);
      const height = Math.round(((page.height as number) || 842) * dpi / 72);

      const pageElements: PageElement[] = (((page as Record<string, unknown>).elements as Array<Record<string, any>>) || []).map(el => ({
        id: el.id || crypto.randomUUID(),
        type: el.type || 'text',
        bounds: el.bounds || { x: 0, y: 0, width: 100, height: 20 },
        content: el.content,
        style: el.style,
        children: el.children || [],
      })) as PageElement[];

      let imageBuffer: Buffer;
      if (page.imageData) {
        imageBuffer = Buffer.isBuffer(page.imageData)
          ? page.imageData
          : Buffer.from(page.imageData as string, 'base64');

        imageBuffer = await sharp(imageBuffer)
          .resize(width, height, { fit: 'fill' })
          .raw()
          .toBuffer();
      } else {
        imageBuffer = Buffer.alloc(width * height * 4, 255);
      }

      pages.push({
        pageNumber: page.pageNumber,
        width,
        height,
        buffer: imageBuffer,
        elements: pageElements,
      });
    }

    return pages;
  }

  private async comparePixels(
    originalBuffer: Buffer,
    replicaBuffer: Buffer,
    width: number,
    height: number,
    options: ComparisonOptions,
    pageNumber: number,
  ): Promise<{
    matchingPixels: number;
    differingPixels: number;
    totalPixels: number;
    colorDeltaSum: number;
    maxColorDelta: number;
    comparedPixels: number;
    differences: DifferenceDetail[];
    overlayBuffer?: Buffer;
  }> {
    const totalPixels = width * height;
    let matchingPixels = 0;
    let differingPixels = 0;
    let colorDeltaSum = 0;
    let maxColorDelta = 0;
    let comparedPixels = 0;
    const differences: DifferenceDetail[] = [];

    const origRaw = await sharp(originalBuffer, { raw: { width, height, channels: 4 } })
      .raw()
      .toBuffer();
    const repRaw = await sharp(replicaBuffer, { raw: { width, height, channels: 4 } })
      .raw()
      .toBuffer();

    const overlayData = Buffer.alloc(width * height * 4);
    const diffRegions: Map<string, { x: number; y: number; w: number; h: number; count: number }> = new Map();
    const regionSize = 32;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        if (this.isInIgnoredRegion(x, y, options.ignoreRegions)) {
          overlayData[idx] = origRaw[idx];
          overlayData[idx + 1] = origRaw[idx + 1];
          overlayData[idx + 2] = origRaw[idx + 2];
          overlayData[idx + 3] = 128;
          continue;
        }

        const oR = origRaw[idx];
        const oG = origRaw[idx + 1];
        const oB = origRaw[idx + 2];
        const rR = repRaw[idx];
        const rG = repRaw[idx + 1];
        const rB = repRaw[idx + 2];

        const delta = Math.sqrt(
          (oR - rR) ** 2 +
          (oG - rG) ** 2 +
          (oB - rB) ** 2,
        );

        comparedPixels++;
        colorDeltaSum += delta;
        maxColorDelta = Math.max(maxColorDelta, delta);

        if (delta <= options.colorThreshold) {
          matchingPixels++;
          overlayData[idx] = oR;
          overlayData[idx + 1] = oG;
          overlayData[idx + 2] = oB;
          overlayData[idx + 3] = 255;
        } else {
          differingPixels++;
          const severity = delta > 100 ? 1.0 : delta / 100;
          overlayData[idx] = Math.round(255 * severity);
          overlayData[idx + 1] = 0;
          overlayData[idx + 2] = Math.round(255 * (1 - severity));
          overlayData[idx + 3] = 200;

          const regionKey = `${Math.floor(x / regionSize)},${Math.floor(y / regionSize)}`;
          const region = diffRegions.get(regionKey);
          if (region) {
            region.count++;
          } else {
            diffRegions.set(regionKey, {
              x: Math.floor(x / regionSize) * regionSize,
              y: Math.floor(y / regionSize) * regionSize,
              w: regionSize,
              h: regionSize,
              count: 1,
            });
          }
        }
      }
    }

    const significantRegions = Array.from(diffRegions.values())
      .filter(r => r.count > regionSize * regionSize * 0.1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    for (const region of significantRegions) {
      const regionPixels = region.w * region.h;
      const diffPercent = (region.count / regionPixels) * 100;
      const severity: DifferenceDetail['severity'] =
        diffPercent > 50 ? 'critical' :
          diffPercent > 25 ? 'major' :
            diffPercent > 10 ? 'minor' : 'cosmetic';

      differences.push({
        id: crypto.randomUUID(),
        type: 'pixel',
        severity,
        location: { x: region.x, y: region.y, width: region.w, height: region.h, page: pageNumber },
        description: `${diffPercent.toFixed(1)}% pixel difference in region (${region.x}, ${region.y})`,
        score: 100 - diffPercent,
      });
    }

    const overlayBuffer = options.includeOverlay
      ? await sharp(overlayData, { raw: { width, height, channels: 4 } })
          .png()
          .toBuffer()
      : undefined;

    return {
      matchingPixels,
      differingPixels,
      totalPixels,
      colorDeltaSum,
      maxColorDelta,
      comparedPixels,
      differences,
      overlayBuffer,
    };
  }

  private isInIgnoredRegion(x: number, y: number, regions?: IgnoreRegion[]): boolean {
    if (!regions || regions.length === 0) return false;
    for (const region of regions) {
      if (x >= region.x && x <= region.x + region.width &&
          y >= region.y && y <= region.y + region.height) {
        return true;
      }
    }
    return false;
  }

  private compareStructure(
    originalElements: PageElement[],
    replicaElements: PageElement[],
    pageNumber: number,
  ): DifferenceDetail[] {
    const differences: DifferenceDetail[] = [];

    for (const origEl of originalElements) {
      const match = this.findBestMatch(origEl, replicaElements);

      if (!match) {
        differences.push({
          id: crypto.randomUUID(),
          type: 'missing_element',
          severity: 'major',
          location: { ...origEl.bounds, page: pageNumber },
          description: `${origEl.type} element missing from replica`,
          originalValue: origEl.content?.substring(0, 100),
          score: 0,
        });
        continue;
      }

      const positionDelta = Math.sqrt(
        (origEl.bounds.x - match.bounds.x) ** 2 +
        (origEl.bounds.y - match.bounds.y) ** 2,
      );

      if (positionDelta > 10) {
        differences.push({
          id: crypto.randomUUID(),
          type: 'layout',
          severity: positionDelta > 50 ? 'major' : 'minor',
          location: { ...origEl.bounds, page: pageNumber },
          description: `Element position shifted by ${positionDelta.toFixed(1)}px`,
          originalValue: `(${origEl.bounds.x}, ${origEl.bounds.y})`,
          replicaValue: `(${match.bounds.x}, ${match.bounds.y})`,
          score: Math.max(0, 100 - positionDelta),
        });
      }

      const widthDiff = Math.abs(origEl.bounds.width - match.bounds.width);
      const heightDiff = Math.abs(origEl.bounds.height - match.bounds.height);
      if (widthDiff > 5 || heightDiff > 5) {
        differences.push({
          id: crypto.randomUUID(),
          type: 'size',
          severity: (widthDiff > 20 || heightDiff > 20) ? 'major' : 'minor',
          location: { ...origEl.bounds, page: pageNumber },
          description: `Element size differs: width ${widthDiff.toFixed(1)}px, height ${heightDiff.toFixed(1)}px`,
          originalValue: `${origEl.bounds.width}x${origEl.bounds.height}`,
          replicaValue: `${match.bounds.width}x${match.bounds.height}`,
          score: Math.max(0, 100 - (widthDiff + heightDiff)),
        });
      }
    }

    for (const repEl of replicaElements) {
      const match = this.findBestMatch(repEl, originalElements);
      if (!match) {
        differences.push({
          id: crypto.randomUUID(),
          type: 'extra_element',
          severity: 'minor',
          location: { ...repEl.bounds, page: pageNumber },
          description: `Extra ${repEl.type} element in replica`,
          replicaValue: repEl.content?.substring(0, 100),
          score: 0,
        });
      }
    }

    return differences;
  }

  private findBestMatch(target: PageElement, candidates: PageElement[]): PageElement | null {
    let bestMatch: PageElement | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      if (candidate.type !== target.type) continue;

      let score = 0;
      const positionDist = Math.sqrt(
        (target.bounds.x - candidate.bounds.x) ** 2 +
        (target.bounds.y - candidate.bounds.y) ** 2,
      );
      score += Math.max(0, 100 - positionDist) * 0.3;

      const sizeDiff = Math.abs(target.bounds.width - candidate.bounds.width) +
                        Math.abs(target.bounds.height - candidate.bounds.height);
      score += Math.max(0, 100 - sizeDiff) * 0.3;

      if (target.content && candidate.content) {
        const contentSimilarity = this.computeStringSimilarity(target.content, candidate.content);
        score += contentSimilarity * 0.4;
      } else if (!target.content && !candidate.content) {
        score += 40;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    return bestScore > 30 ? bestMatch : null;
  }

  private compareContent(
    originalElements: PageElement[],
    replicaElements: PageElement[],
    pageNumber: number,
  ): DifferenceDetail[] {
    const differences: DifferenceDetail[] = [];

    const origTexts = originalElements.filter(e => e.type === 'text' && e.content);
    const repTexts = replicaElements.filter(e => e.type === 'text' && e.content);

    for (const origText of origTexts) {
      const match = this.findBestMatch(origText, repTexts);
      if (!match || !match.content || !origText.content) continue;

      if (origText.content !== match.content) {
        const similarity = this.computeStringSimilarity(origText.content, match.content);
        const severity: DifferenceDetail['severity'] =
          similarity < 50 ? 'critical' :
            similarity < 80 ? 'major' :
              similarity < 95 ? 'minor' : 'cosmetic';

        differences.push({
          id: crypto.randomUUID(),
          type: 'text',
          severity,
          location: { ...origText.bounds, page: pageNumber },
          description: `Text content differs (${similarity.toFixed(1)}% similar)`,
          originalValue: origText.content.substring(0, 200),
          replicaValue: match.content.substring(0, 200),
          score: similarity,
        });
      }

      if (origText.style && match.style) {
        if (origText.style.fontFamily !== match.style.fontFamily) {
          differences.push({
            id: crypto.randomUUID(),
            type: 'font',
            severity: 'minor',
            location: { ...origText.bounds, page: pageNumber },
            description: 'Font family differs',
            originalValue: String(origText.style.fontFamily || ''),
            replicaValue: String(match.style.fontFamily || ''),
            score: 50,
          });
        }

        if (origText.style.color !== match.style.color) {
          differences.push({
            id: crypto.randomUUID(),
            type: 'color',
            severity: 'cosmetic',
            location: { ...origText.bounds, page: pageNumber },
            description: 'Text color differs',
            originalValue: String(origText.style.color || ''),
            replicaValue: String(match.style.color || ''),
            score: 70,
          });
        }
      }
    }

    return differences;
  }

  private computeStringSimilarity(a: string, b: string): number {
    if (a === b) return 100;
    if (a.length === 0 || b.length === 0) return 0;

    const maxLen = Math.max(a.length, b.length);
    const distance = this.levenshteinDistance(a, b);
    return ((maxLen - distance) / maxLen) * 100;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = [];

    for (let i = 0; i <= m; i++) {
      dp[i] = [i];
    }
    for (let j = 0; j <= n; j++) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }

    return dp[m][n];
  }

  private computeStructuralScore(
    differences: DifferenceDetail[],
    pages: PageImage[],
  ): number {
    if (differences.length === 0) return 100;

    let totalPenalty = 0;
    for (const diff of differences) {
      switch (diff.severity) {
        case 'critical': totalPenalty += 20; break;
        case 'major': totalPenalty += 10; break;
        case 'minor': totalPenalty += 3; break;
        case 'cosmetic': totalPenalty += 1; break;
      }
    }

    const totalElements = pages.reduce((sum, p) => sum + Math.max(1, p.elements.length), 0);
    const normalizedPenalty = (totalPenalty / totalElements) * 10;
    return Math.max(0, Math.round((100 - normalizedPenalty) * 100) / 100);
  }

  private computeContentScore(
    differences: DifferenceDetail[],
    pages: PageImage[],
  ): number {
    if (differences.length === 0) return 100;

    const avgScore = differences.reduce((sum, d) => sum + d.score, 0) / differences.length;
    return Math.round(avgScore * 100) / 100;
  }

  private async combineOverlayImages(buffers: Buffer[]): Promise<Buffer> {
    if (buffers.length === 1) return buffers[0];

    const metadata = await sharp(buffers[0]).metadata();
    const width = metadata.width || 800;
    const totalHeight = buffers.length * (metadata.height || 600);

    const compositeOps: sharp.OverlayOptions[] = [];
    let yOffset = 0;

    for (const buffer of buffers) {
      const meta = await sharp(buffer).metadata();
      compositeOps.push({ input: buffer, top: yOffset, left: 0 });
      yOffset += meta.height || 600;
    }

    return sharp({
      create: {
        width,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite(compositeOps)
      .png()
      .toBuffer();
  }

  async generateFidelityReport(comparisonId: string): Promise<FidelityReport> {
    const comparison = this.comparisonCache.get(comparisonId)
      || await this.getComparisonResult(comparisonId);

    const categories: FidelityCategory[] = [
      {
        name: 'Visual Fidelity',
        score: comparison.visualScore,
        weight: 0.4,
        issues: comparison.differences
          .filter(d => d.type === 'pixel')
          .slice(0, 10)
          .map(d => d.description),
      },
      {
        name: 'Structural Fidelity',
        score: comparison.structuralScore,
        weight: 0.3,
        issues: comparison.differences
          .filter(d => ['layout', 'size', 'missing_element', 'extra_element'].includes(d.type))
          .slice(0, 10)
          .map(d => d.description),
      },
      {
        name: 'Content Fidelity',
        score: comparison.contentScore,
        weight: 0.3,
        issues: comparison.differences
          .filter(d => ['text', 'font', 'color'].includes(d.type))
          .slice(0, 10)
          .map(d => d.description),
      },
    ];

    const recommendations: string[] = [];
    if (comparison.visualScore < 90) {
      recommendations.push('Increase rendering resolution for better visual accuracy');
    }
    if (comparison.structuralScore < 85) {
      recommendations.push('Review element positioning and sizing to improve structural match');
    }
    if (comparison.contentScore < 95) {
      recommendations.push('Verify text content and formatting matches the original');
    }
    if (comparison.statistics.missingElements > 0) {
      recommendations.push(`${comparison.statistics.missingElements} elements are missing - ensure all content is replicated`);
    }
    if (comparison.statistics.extraElements > 0) {
      recommendations.push(`${comparison.statistics.extraElements} extra elements found - remove unneeded additions`);
    }

    const report: FidelityReport = {
      id: crypto.randomUUID(),
      comparisonId,
      overallFidelity: comparison.overallScore,
      categories,
      recommendations,
      generatedAt: new Date(),
    };

    await this.prisma.fidelityReport.create({
      data: {
        id: report.id,
        comparisonId: report.comparisonId,
        overallFidelity: report.overallFidelity,
        categories: report.categories as unknown as Prisma.InputJsonValue,
        recommendations: report.recommendations,
        generatedAt: report.generatedAt,
      },
    });

    return report;
  }

  private async getComparisonResult(comparisonId: string): Promise<ComparisonResult> {
    const record = await this.prisma.comparisonResult.findUnique({
      where: { id: comparisonId },
    });

    if (!record) {
      throw new Error(`Comparison not found: ${comparisonId}`);
    }

    return {
      id: record.id,
      requestId: record.requestId ?? '',
      overallScore: record.overallScore ?? 0,
      visualScore: record.visualScore ?? 0,
      structuralScore: record.structuralScore ?? 0,
      contentScore: record.contentScore ?? 0,
      status: (record.status ?? 'fail') as ComparisonResult['status'],
      differences: record.differences as unknown as DifferenceDetail[],
      statistics: record.statistics as unknown as ComparisonStatistics,
      createdAt: record.createdAt,
    };
  }
}
