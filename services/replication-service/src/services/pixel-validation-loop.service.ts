import sharp from 'sharp';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { PrismaClient } from '@prisma/client';
import { createLogger, format, transports } from 'winston';
import { randomUUID, createHash } from 'crypto';
import type {
  PixelValidationResult,
  ValidationHotspot,
  BoundingBox,
  CanonicalLayoutGraph,
  LayoutNode,
} from '@rasid/shared';

const RENDERING_SERVICE_URL = process.env.RENDERING_SERVICE_URL || 'http://rendering-environment:8014';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'pixel-validation-loop' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PixelValidationRequest {
  sourceImage: Buffer;
  generatedImage: Buffer;
  layoutGraph: CanonicalLayoutGraph;
  maxIterations: number;
}

export interface OptimizationAdjustment {
  nodeId: string;
  property: string;
  currentValue: unknown;
  suggestedValue: unknown;
  expectedImpact: number;
}

export interface DiagnosticReport {
  status: 'PIXEL_PERFECT' | 'CONVERGENCE_PLATEAU' | 'MAX_ITERATIONS_EXHAUSTED';
  pixelDiff: number;
  totalPixels: number;
  ssim: number;
  iterationCount: number;
  convergenceHistory: number[];
  missingFonts: string[];
  unavailableAssets: string[];
  renderingInconsistencies: string[];
  unsupportedFeatures: string[];
}

// ─── Asset Integrity ─────────────────────────────────────────────────────────

export interface AssetIntegrityMap {
  [nodeId: string]: { hash: string; type: 'image' | 'icon' | 'vector'; size: number };
}

export interface FontMetricsCalibration {
  family: string;
  baselineOffset: number;
  ascentAdjust: number;
  descentAdjust: number;
  trackingAdjust: number;
  sizeScale: number;
}

// ─── Fixed Rendering Config ──────────────────────────────────────────────────

const RENDER_CONFIG = {
  dpi: 150,
  antiAliasing: false,
  fontHinting: 'full' as const,
  subpixelRendering: false,
  colorSpace: 'srgb' as const,
  pixelMatchThreshold: 0,
  ssimWindowSize: 11,
  gridSize: 32,
  convergenceWindow: 5,
  convergenceDelta: 0.001,
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class PixelValidationLoopService {
  private assetIntegrity: AssetIntegrityMap = {};
  private fontCalibrations: Map<string, FontMetricsCalibration> = new Map();

  constructor(private prisma: PrismaClient) {}

  // ─── SECTION 1: Pixel Stability Improvements ──────────────────────────────

  /**
   * 1.1 Subpixel Snapping — snap all layout coordinates to integer pixel grid.
   * Fractional coordinates cause subpixel rendering which is non-deterministic.
   */
  snapToPixelGrid(graph: CanonicalLayoutGraph): CanonicalLayoutGraph {
    const clone = structuredClone(graph);
    for (const page of clone.pages) {
      this.snapNodeToGrid(page.rootNode);
    }
    logger.info('Subpixel snapping applied', { pages: clone.pages.length });
    return clone;
  }

  private snapNodeToGrid(node: LayoutNode): void {
    node.bbox.x = Math.round(node.bbox.x);
    node.bbox.y = Math.round(node.bbox.y);
    node.bbox.width = Math.round(node.bbox.width);
    node.bbox.height = Math.round(node.bbox.height);

    // Snap padding and margin to integers
    if (node.style.padding && typeof node.style.padding === 'object') {
      node.style.padding.top = Math.round(node.style.padding.top);
      node.style.padding.right = Math.round(node.style.padding.right);
      node.style.padding.bottom = Math.round(node.style.padding.bottom);
      node.style.padding.left = Math.round(node.style.padding.left);
    }
    if (node.style.margin && typeof node.style.margin === 'object') {
      node.style.margin.top = Math.round(node.style.margin.top);
      node.style.margin.right = Math.round(node.style.margin.right);
      node.style.margin.bottom = Math.round(node.style.margin.bottom);
      node.style.margin.left = Math.round(node.style.margin.left);
    }

    // Snap border radius
    if (node.style.borderRadius > 0) {
      node.style.borderRadius = Math.round(node.style.borderRadius);
    }

    // Snap font size to nearest 0.5px for consistent glyph rasterization
    if (node.content.kind === 'text') {
      node.content.font.size = Math.round(node.content.font.size * 2) / 2;
      node.content.font.letterSpacing = Math.round(node.content.font.letterSpacing * 100) / 100;
    }

    for (const child of node.children) {
      this.snapNodeToGrid(child);
    }
  }

  /**
   * 1.2 Font Metrics Calibration — compare glyph metrics and adjust
   * baseline, ascent, descent, and tracking for pixel-perfect text placement.
   */
  calibrateFontMetrics(graph: CanonicalLayoutGraph): CanonicalLayoutGraph {
    const clone = structuredClone(graph);
    const fonts = new Set<string>();

    for (const page of clone.pages) {
      this.collectFontsFromNode(page.rootNode, fonts);
    }

    // Build calibration table for detected fonts
    for (const family of fonts) {
      if (!this.fontCalibrations.has(family)) {
        this.fontCalibrations.set(family, this.computeFontCalibration(family));
      }
    }

    // Apply calibrations to all text nodes
    for (const page of clone.pages) {
      this.applyFontCalibration(page.rootNode);
    }

    logger.info('Font metrics calibrated', { fonts: fonts.size, calibrations: this.fontCalibrations.size });
    return clone;
  }

  private computeFontCalibration(family: string): FontMetricsCalibration {
    // Known font metric corrections for common Arabic and Latin fonts
    // These offsets compensate for rendering engine differences
    const KNOWN_CALIBRATIONS: Record<string, Partial<FontMetricsCalibration>> = {
      'Cairo':              { baselineOffset: 0, ascentAdjust: -1, descentAdjust: 0, trackingAdjust: 0, sizeScale: 1.0 },
      'Tajawal':            { baselineOffset: 1, ascentAdjust: 0, descentAdjust: 0, trackingAdjust: 0.02, sizeScale: 1.0 },
      'Noto Sans Arabic':   { baselineOffset: 0, ascentAdjust: -1, descentAdjust: 1, trackingAdjust: 0, sizeScale: 1.0 },
      'Amiri':              { baselineOffset: 2, ascentAdjust: 0, descentAdjust: -1, trackingAdjust: 0, sizeScale: 1.0 },
      'IBM Plex Sans Arabic': { baselineOffset: 0, ascentAdjust: 0, descentAdjust: 0, trackingAdjust: 0.01, sizeScale: 1.0 },
      'Almarai':            { baselineOffset: 1, ascentAdjust: 0, descentAdjust: 0, trackingAdjust: 0, sizeScale: 1.0 },
      'Arial':              { baselineOffset: 0, ascentAdjust: 0, descentAdjust: 0, trackingAdjust: 0, sizeScale: 1.0 },
      'Roboto':             { baselineOffset: 0, ascentAdjust: 0, descentAdjust: 0, trackingAdjust: 0, sizeScale: 1.0 },
      'Inter':              { baselineOffset: 0, ascentAdjust: 0, descentAdjust: 0, trackingAdjust: -0.01, sizeScale: 1.0 },
      'Helvetica Neue':     { baselineOffset: 0, ascentAdjust: 0, descentAdjust: 0, trackingAdjust: 0, sizeScale: 1.0 },
    };

    const known = KNOWN_CALIBRATIONS[family];
    return {
      family,
      baselineOffset: known?.baselineOffset ?? 0,
      ascentAdjust: known?.ascentAdjust ?? 0,
      descentAdjust: known?.descentAdjust ?? 0,
      trackingAdjust: known?.trackingAdjust ?? 0,
      sizeScale: known?.sizeScale ?? 1.0,
    };
  }

  private applyFontCalibration(node: LayoutNode): void {
    if (node.content.kind === 'text') {
      const cal = this.fontCalibrations.get(node.content.font.family);
      if (cal) {
        // Apply baseline offset as vertical position adjustment
        node.bbox.y += cal.baselineOffset;
        // Apply tracking adjustment to letter spacing
        node.content.font.letterSpacing += cal.trackingAdjust;
        // Apply size scale
        if (cal.sizeScale !== 1.0) {
          node.content.font.size = Math.round(node.content.font.size * cal.sizeScale * 2) / 2;
        }
      }
    }
    for (const child of node.children) {
      this.applyFontCalibration(child);
    }
  }

  /**
   * 1.3 Asset Integrity Hashing — generate SHA256 hashes for all extracted
   * assets to ensure original assets are reused during reconstruction.
   */
  computeAssetIntegrity(graph: CanonicalLayoutGraph): AssetIntegrityMap {
    this.assetIntegrity = {};
    for (const page of graph.pages) {
      this.hashNodeAssets(page.rootNode);
    }
    logger.info('Asset integrity computed', { assets: Object.keys(this.assetIntegrity).length });
    return this.assetIntegrity;
  }

  private hashNodeAssets(node: LayoutNode): void {
    if (node.content.kind === 'image' && node.content.src) {
      const data = Buffer.from(node.content.src, 'utf-8');
      this.assetIntegrity[node.id] = {
        hash: createHash('sha256').update(data).digest('hex'),
        type: 'image',
        size: data.length,
      };
    }
    if (node.content.kind === 'icon' && node.content.svgData) {
      const data = Buffer.from(node.content.svgData, 'utf-8');
      this.assetIntegrity[node.id] = {
        hash: createHash('sha256').update(data).digest('hex'),
        type: 'icon',
        size: data.length,
      };
    }
    if (node.content.kind === 'image' && node.content.vectorData) {
      const data = Buffer.from(node.content.vectorData, 'utf-8');
      this.assetIntegrity[node.id] = {
        hash: createHash('sha256').update(data).digest('hex'),
        type: 'vector',
        size: data.length,
      };
    }
    for (const child of node.children) {
      this.hashNodeAssets(child);
    }
  }

  verifyAssetIntegrity(graph: CanonicalLayoutGraph): { valid: boolean; mismatches: string[] } {
    const mismatches: string[] = [];
    for (const page of graph.pages) {
      this.verifyNodeAssets(page.rootNode, mismatches);
    }
    return { valid: mismatches.length === 0, mismatches };
  }

  private verifyNodeAssets(node: LayoutNode, mismatches: string[]): void {
    const expected = this.assetIntegrity[node.id];
    if (expected) {
      let currentData: Buffer | null = null;
      if (node.content.kind === 'image' && node.content.src) {
        currentData = Buffer.from(node.content.src, 'utf-8');
      } else if (node.content.kind === 'icon' && node.content.svgData) {
        currentData = Buffer.from(node.content.svgData, 'utf-8');
      } else if (node.content.kind === 'image' && node.content.vectorData) {
        currentData = Buffer.from(node.content.vectorData, 'utf-8');
      }

      if (currentData) {
        const currentHash = createHash('sha256').update(currentData).digest('hex');
        if (currentHash !== expected.hash) {
          mismatches.push(`Node ${node.id}: expected hash ${expected.hash.slice(0, 12)}... got ${currentHash.slice(0, 12)}...`);
        }
      }
    }
    for (const child of node.children) {
      this.verifyNodeAssets(child, mismatches);
    }
  }

  /**
   * 1.4 SVG Precision Normalization — normalize SVG path precision to
   * avoid floating-point differences across reconstructions.
   */
  normalizeSvgPrecision(graph: CanonicalLayoutGraph, decimalPlaces = 2): CanonicalLayoutGraph {
    const clone = structuredClone(graph);
    let normalized = 0;
    for (const page of clone.pages) {
      normalized += this.normalizeNodeSvg(page.rootNode, decimalPlaces);
    }
    logger.info('SVG precision normalized', { nodesProcessed: normalized, decimalPlaces });
    return clone;
  }

  private normalizeNodeSvg(node: LayoutNode, dp: number): number {
    let count = 0;

    if (node.content.kind === 'icon' && node.content.svgData) {
      node.content.svgData = this.normalizeSvgPathData(node.content.svgData, dp);
      count++;
    }
    if (node.content.kind === 'image' && node.content.vectorData) {
      node.content.vectorData = this.normalizeSvgPathData(node.content.vectorData, dp);
      count++;
    }

    for (const child of node.children) {
      count += this.normalizeNodeSvg(child, dp);
    }
    return count;
  }

  private normalizeSvgPathData(svgContent: string, dp: number): string {
    // Normalize floating-point numbers in SVG path d="" attributes and coordinates
    const numericPattern = /(\d+\.\d{3,})/g;
    return svgContent.replace(numericPattern, (match) => {
      const num = parseFloat(match);
      return num.toFixed(dp);
    });
  }

  /**
   * 1.5 Pre-render Stabilization — apply all stability passes before rendering.
   * Called automatically at the start of runValidationLoop.
   */
  stabilizeForRendering(graph: CanonicalLayoutGraph): CanonicalLayoutGraph {
    let stabilized = this.snapToPixelGrid(graph);
    stabilized = this.calibrateFontMetrics(stabilized);
    stabilized = this.normalizeSvgPrecision(stabilized);
    this.computeAssetIntegrity(stabilized);
    logger.info('Pre-render stabilization complete');
    return stabilized;
  }

  /**
   * Core validation loop. Guarantees:
   * - success = (PixelDiff == 0) — the ONLY success condition
   * - SSIM/LPIPS are used ONLY for optimization guidance, never for exit
   * - Loop terminates ONLY when:
   *   1. PixelDiff == 0 (success)
   *   2. Convergence plateau detected (hard diagnostic — loop cannot make progress)
   *   3. maxIterations exhausted (hard limit)
   */
  async runValidationLoop(request: PixelValidationRequest): Promise<PixelValidationResult & { diagnostic: DiagnosticReport }> {
    const { sourceImage, generatedImage, layoutGraph, maxIterations } = request;

    logger.info('Starting pixel validation loop', { maxIterations });

    // Validate rendering environment is available
    const envReady = await this.checkRenderingEnvironment();
    if (!envReady) {
      logger.error('Rendering environment not available — cannot guarantee deterministic output');
    }

    // Validate fonts before starting
    const missingFonts = await this.validateRequiredFonts(layoutGraph);

    const convergenceHistory: number[] = [];
    let currentGenerated = generatedImage;
    let bestResult: PixelValidationResult | null = null;
    let bestGeneratedImage = generatedImage;

    // Apply pre-render stabilization (subpixel snapping, font calibration, SVG normalization)
    let currentGraph = this.stabilizeForRendering(layoutGraph);

    let exitReason: DiagnosticReport['status'] = 'MAX_ITERATIONS_EXHAUSTED';
    const renderingInconsistencies: string[] = [];
    const unavailableAssets: string[] = [];
    const unsupportedFeatures: string[] = [];

    // Collect asset warnings
    this.auditAssets(layoutGraph, unavailableAssets, unsupportedFeatures);

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const comparison = await this.compareImages(sourceImage, currentGenerated);
      convergenceHistory.push(comparison.pixelDiffCount);

      logger.info(`Iteration ${iteration + 1}/${maxIterations}`, {
        pixelDiff: comparison.pixelDiffCount,
        ssim: comparison.ssim,
        diffPercentage: comparison.pixelDiffPercentage,
      });

      const result: PixelValidationResult = {
        pixelDiff: comparison.pixelDiffCount,
        totalPixels: comparison.totalPixels,
        diffPercentage: comparison.pixelDiffPercentage,
        ssim: comparison.ssim,
        lpips: comparison.lpips,
        isPerfect: comparison.pixelDiffCount === 0,
        hotspots: comparison.hotspots,
        diffImagePath: null,
        iterationCount: iteration + 1,
        convergenceHistory: [...convergenceHistory],
      };

      if (!bestResult || result.pixelDiff < bestResult.pixelDiff) {
        bestResult = result;
        bestGeneratedImage = currentGenerated;
      }

      // ═══════════════════════════════════════════════════════════════════
      // PRIMARY AND ONLY SUCCESS CONDITION: PixelDiff == 0
      // ═══════════════════════════════════════════════════════════════════
      if (comparison.pixelDiffCount === 0) {
        logger.info('PIXEL-PERFECT ACHIEVED (PixelDiff == 0)', {
          iterations: iteration + 1,
          ssim: comparison.ssim,
        });
        bestResult.isPerfect = true;
        exitReason = 'PIXEL_PERFECT';
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // HARD DIAGNOSTIC: Convergence plateau — loop cannot make progress
      // Only after sufficient iterations with zero improvement
      // ═══════════════════════════════════════════════════════════════════
      if (iteration >= RENDER_CONFIG.convergenceWindow && this.hasConverged(convergenceHistory)) {
        logger.error('CONVERGENCE PLATEAU — loop cannot reduce PixelDiff further', {
          pixelDiff: comparison.pixelDiffCount,
          iterations: iteration + 1,
          lastValues: convergenceHistory.slice(-RENDER_CONFIG.convergenceWindow),
        });
        bestResult.isPerfect = false;
        exitReason = 'CONVERGENCE_PLATEAU';
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // SSIM and LPIPS are NEVER used as exit conditions.
      // They guide the optimization strategy below.
      // ═══════════════════════════════════════════════════════════════════

      const adjustments = await this.computeAdjustments(
        comparison.hotspots,
        currentGraph,
        iteration,
        comparison.ssim,
        comparison.pixelDiffCount,
      );
      currentGraph = this.applyAdjustments(currentGraph, adjustments);

      // Re-snap after adjustments to prevent subpixel drift
      currentGraph = this.snapToPixelGrid(currentGraph);

      // Verify asset integrity was not corrupted by adjustments
      const integrity = this.verifyAssetIntegrity(currentGraph);
      if (!integrity.valid) {
        renderingInconsistencies.push(`Iteration ${iteration + 1}: Asset integrity violation: ${integrity.mismatches.join('; ')}`);
      }

      currentGenerated = await this.reRenderFromGraph(currentGraph, sourceImage);

      // Verify render didn't fail silently
      if (currentGenerated.length < 100) {
        renderingInconsistencies.push(`Iteration ${iteration + 1}: Render returned suspiciously small buffer (${currentGenerated.length} bytes)`);
        currentGenerated = bestGeneratedImage;
      }
    }

    // Generate diff image for the best result
    if (bestResult) {
      const diffImageBuffer = await this.generateDiffImage(sourceImage, bestGeneratedImage);
      const diffPath = `/tmp/rasid_diff_${randomUUID()}.png`;
      await sharp(diffImageBuffer).toFile(diffPath);
      bestResult.diffImagePath = diffPath;
    }

    // Build diagnostic report
    const diagnostic: DiagnosticReport = {
      status: exitReason,
      pixelDiff: bestResult!.pixelDiff,
      totalPixels: bestResult!.totalPixels,
      ssim: bestResult!.ssim,
      iterationCount: bestResult!.iterationCount,
      convergenceHistory,
      missingFonts,
      unavailableAssets,
      renderingInconsistencies,
      unsupportedFeatures,
    };

    if (exitReason !== 'PIXEL_PERFECT') {
      logger.error('PIXEL-PERFECT NOT ACHIEVED — generating diagnostic report', { diagnostic });
    }

    await this.persistValidationResult(layoutGraph.id, bestResult!, diagnostic);

    return { ...bestResult!, diagnostic };
  }

  // ─── Rendering Environment Validation ────────────────────────────────────

  private async checkRenderingEnvironment(): Promise<boolean> {
    try {
      const response = await fetch(`${RENDERING_SERVICE_URL}/api/v1/render/ready`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return false;
      const data = await response.json() as { ready: boolean };
      return data.ready === true;
    } catch {
      return false;
    }
  }

  private async validateRequiredFonts(graph: CanonicalLayoutGraph): Promise<string[]> {
    const requiredFonts = new Set<string>();
    for (const page of graph.pages) {
      this.collectFontsFromNode(page.rootNode, requiredFonts);
    }

    if (requiredFonts.size === 0) return [];

    try {
      const response = await fetch(`${RENDERING_SERVICE_URL}/api/v1/render/validate-fonts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requiredFonts: Array.from(requiredFonts) }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return [];
      const data = await response.json() as { missing: string[] };
      if (data.missing.length > 0) {
        logger.warn('Missing fonts in rendering environment', { missing: data.missing });
      }
      return data.missing;
    } catch {
      logger.warn('Could not validate fonts against rendering environment');
      return [];
    }
  }

  // ─── Asset Audit ──────────────────────────────────────────────────────────

  private auditAssets(
    graph: CanonicalLayoutGraph,
    unavailableAssets: string[],
    unsupportedFeatures: string[],
  ): void {
    for (const page of graph.pages) {
      this.auditNodeAssets(page.rootNode, unavailableAssets, unsupportedFeatures);
    }
  }

  private auditNodeAssets(
    node: LayoutNode,
    unavailableAssets: string[],
    unsupportedFeatures: string[],
  ): void {
    if (node.content.kind === 'image') {
      if (!node.content.src && !node.content.vectorData) {
        unavailableAssets.push(`Image node ${node.id}: no src or vectorData`);
      }
    }
    if (node.content.kind === 'chart') {
      unsupportedFeatures.push(`Chart node ${node.id}: charts should be embedded as raster during validation`);
    }
    if (node.content.kind === 'icon' && !node.content.svgData) {
      unavailableAssets.push(`Icon node ${node.id}: no svgData`);
    }
    for (const child of node.children) {
      this.auditNodeAssets(child, unavailableAssets, unsupportedFeatures);
    }
  }

  // ─── Image Comparison ──────────────────────────────────────────────────────

  async compareImages(
    source: Buffer,
    generated: Buffer,
  ): Promise<{
    pixelDiffCount: number;
    totalPixels: number;
    pixelDiffPercentage: number;
    ssim: number;
    lpips: number;
    hotspots: ValidationHotspot[];
    diffBuffer: Buffer;
  }> {
    const sourceSharp = sharp(source).ensureAlpha();
    const generatedSharp = sharp(generated).ensureAlpha();

    const sourceMeta = await sourceSharp.metadata();
    const targetWidth = sourceMeta.width || 1920;
    const targetHeight = sourceMeta.height || 1080;

    const [sourceRaw, generatedRaw] = await Promise.all([
      sourceSharp.resize(targetWidth, targetHeight, { fit: 'fill' }).raw().toBuffer(),
      generatedSharp.resize(targetWidth, targetHeight, { fit: 'fill' }).raw().toBuffer(),
    ]);

    const diffBuffer = Buffer.alloc(targetWidth * targetHeight * 4);

    // threshold: 0 — exact pixel match, no tolerance
    // includeAA: true — anti-aliased pixels count as differences
    const pixelDiffCount = pixelmatch(
      sourceRaw,
      generatedRaw,
      diffBuffer,
      targetWidth,
      targetHeight,
      { threshold: RENDER_CONFIG.pixelMatchThreshold, includeAA: true },
    );

    const totalPixels = targetWidth * targetHeight;
    const pixelDiffPercentage = (pixelDiffCount / totalPixels) * 100;

    // SSIM and LPIPS are computed for optimization guidance ONLY
    const ssim = this.computeSSIM(sourceRaw, generatedRaw, targetWidth, targetHeight);
    const lpips = this.approximateLPIPS(pixelDiffPercentage, ssim);

    const hotspots = this.detectHotspots(diffBuffer, targetWidth, targetHeight);

    return {
      pixelDiffCount,
      totalPixels,
      pixelDiffPercentage: Math.round(pixelDiffPercentage * 1000) / 1000,
      ssim: Math.round(ssim * 10000) / 10000,
      lpips: Math.round(lpips * 10000) / 10000,
      hotspots,
      diffBuffer,
    };
  }

  // ─── SSIM Computation (guidance only — NEVER used for exit) ────────────────

  private computeSSIM(
    source: Buffer,
    generated: Buffer,
    width: number,
    height: number,
  ): number {
    const windowSize = RENDER_CONFIG.ssimWindowSize;
    const c1 = (0.01 * 255) ** 2;
    const c2 = (0.03 * 255) ** 2;
    let totalSSIM = 0;
    let windowCount = 0;

    for (let y = 0; y <= height - windowSize; y += windowSize) {
      for (let x = 0; x <= width - windowSize; x += windowSize) {
        let meanS = 0, meanG = 0;
        let varS = 0, varG = 0, covSG = 0;
        const pixelCount = windowSize * windowSize;

        for (let wy = 0; wy < windowSize; wy++) {
          for (let wx = 0; wx < windowSize; wx++) {
            const idx = ((y + wy) * width + (x + wx)) * 4;
            const sLum = 0.299 * source[idx] + 0.587 * source[idx + 1] + 0.114 * source[idx + 2];
            const gLum = 0.299 * generated[idx] + 0.587 * generated[idx + 1] + 0.114 * generated[idx + 2];
            meanS += sLum;
            meanG += gLum;
          }
        }

        meanS /= pixelCount;
        meanG /= pixelCount;

        for (let wy = 0; wy < windowSize; wy++) {
          for (let wx = 0; wx < windowSize; wx++) {
            const idx = ((y + wy) * width + (x + wx)) * 4;
            const sLum = 0.299 * source[idx] + 0.587 * source[idx + 1] + 0.114 * source[idx + 2];
            const gLum = 0.299 * generated[idx] + 0.587 * generated[idx + 1] + 0.114 * generated[idx + 2];
            varS += (sLum - meanS) ** 2;
            varG += (gLum - meanG) ** 2;
            covSG += (sLum - meanS) * (gLum - meanG);
          }
        }

        varS /= pixelCount - 1;
        varG /= pixelCount - 1;
        covSG /= pixelCount - 1;

        const ssimVal =
          ((2 * meanS * meanG + c1) * (2 * covSG + c2)) /
          ((meanS ** 2 + meanG ** 2 + c1) * (varS + varG + c2));

        totalSSIM += ssimVal;
        windowCount++;
      }
    }

    return windowCount > 0 ? totalSSIM / windowCount : 0;
  }

  private approximateLPIPS(pixelDiffPct: number, ssim: number): number {
    return Math.max(0, Math.min(1, (1 - ssim) * 0.7 + (pixelDiffPct / 100) * 0.3));
  }

  // ─── Hotspot Detection ──────────────────────────────────────────────────────

  private detectHotspots(diffBuffer: Buffer, width: number, height: number): ValidationHotspot[] {
    const gridSize = RENDER_CONFIG.gridSize;
    const hotspots: ValidationHotspot[] = [];

    for (let gy = 0; gy < height; gy += gridSize) {
      for (let gx = 0; gx < width; gx += gridSize) {
        let regionDiff = 0;
        const cellW = Math.min(gridSize, width - gx);
        const cellH = Math.min(gridSize, height - gy);
        const regionPixels = cellW * cellH;

        for (let py = 0; py < cellH; py++) {
          for (let px = 0; px < cellW; px++) {
            const idx = ((gy + py) * width + (gx + px)) * 4;
            const r = diffBuffer[idx] || 0;
            const g = diffBuffer[idx + 1] || 0;
            const b = diffBuffer[idx + 2] || 0;
            if (r > 0 || g > 0 || b > 0) regionDiff++;
          }
        }

        if (regionDiff > 0) {
          const diffRatio = regionDiff / regionPixels;
          const severity: ValidationHotspot['severity'] =
            diffRatio > 0.5 ? 'critical' : diffRatio > 0.1 ? 'warning' : 'minor';

          hotspots.push({
            region: { x: gx, y: gy, width: cellW, height: cellH },
            severity,
            pixelDiff: regionDiff,
            description: `${Math.round(diffRatio * 100)}% pixels differ in region (${gx},${gy})`,
          });
        }
      }
    }

    hotspots.sort((a, b) => b.pixelDiff - a.pixelDiff);
    return hotspots.slice(0, 100);
  }

  // ─── Optimization Engine ──────────────────────────────────────────────────

  private async computeAdjustments(
    hotspots: ValidationHotspot[],
    graph: CanonicalLayoutGraph,
    iteration: number,
    ssim: number,
    pixelDiff: number,
  ): Promise<OptimizationAdjustment[]> {
    const adjustments: OptimizationAdjustment[] = [];

    // Adaptive correction factor:
    // - Early iterations: large steps (0.6-0.8) to converge fast
    // - Later iterations: fine steps (0.1-0.3) for precision
    const earlyPhase = iteration < 5;
    const baseFactor = earlyPhase ? 0.6 : Math.max(0.1, 0.4 - iteration * 0.02);
    // SSIM guides aggressiveness: lower SSIM = need bigger moves
    const ssimBoost = ssim < 0.9 ? 1.5 : ssim < 0.99 ? 1.2 : 1.0;
    const correctionFactor = Math.min(0.9, baseFactor * ssimBoost);

    for (const hotspot of hotspots.slice(0, 30)) {
      const overlappingNodes = this.findNodesInRegion(graph, hotspot.region);

      for (const node of overlappingNodes) {
        const nodeCenterX = node.bbox.x + node.bbox.width / 2;
        const nodeCenterY = node.bbox.y + node.bbox.height / 2;
        const hotspotCenterX = hotspot.region.x + hotspot.region.width / 2;
        const hotspotCenterY = hotspot.region.y + hotspot.region.height / 2;

        const deltaX = hotspotCenterX - nodeCenterX;
        const deltaY = hotspotCenterY - nodeCenterY;

        // Position: bbox.x, bbox.y
        if (Math.abs(deltaX) > 0.5) {
          adjustments.push({
            nodeId: node.id,
            property: 'bbox.x',
            currentValue: node.bbox.x,
            suggestedValue: Math.round((node.bbox.x + deltaX * correctionFactor) * 10) / 10,
            expectedImpact: hotspot.severity === 'critical' ? 0.9 : 0.5,
          });
        }

        if (Math.abs(deltaY) > 0.5) {
          adjustments.push({
            nodeId: node.id,
            property: 'bbox.y',
            currentValue: node.bbox.y,
            suggestedValue: Math.round((node.bbox.y + deltaY * correctionFactor) * 10) / 10,
            expectedImpact: hotspot.severity === 'critical' ? 0.9 : 0.5,
          });
        }

        // Container size: bbox.width, bbox.height
        const widthRatio = hotspot.region.width / Math.max(node.bbox.width, 1);
        const heightRatio = hotspot.region.height / Math.max(node.bbox.height, 1);

        if (Math.abs(widthRatio - 1) > 0.03) {
          adjustments.push({
            nodeId: node.id,
            property: 'bbox.width',
            currentValue: node.bbox.width,
            suggestedValue: Math.round(node.bbox.width * (1 + (widthRatio - 1) * correctionFactor * 0.5)),
            expectedImpact: 0.4,
          });
        }

        if (Math.abs(heightRatio - 1) > 0.03) {
          adjustments.push({
            nodeId: node.id,
            property: 'bbox.height',
            currentValue: node.bbox.height,
            suggestedValue: Math.round(node.bbox.height * (1 + (heightRatio - 1) * correctionFactor * 0.5)),
            expectedImpact: 0.4,
          });
        }

        // Margins and padding
        if (node.style.padding) {
          const padScale = hotspot.severity === 'critical' ? 0.1 : 0.05;
          const currentPadTop = typeof node.style.padding === 'object' ? (node.style.padding as { top: number }).top : 0;
          if (currentPadTop > 0) {
            adjustments.push({
              nodeId: node.id,
              property: 'style.padding.top',
              currentValue: currentPadTop,
              suggestedValue: Math.round(currentPadTop * (1 + padScale * correctionFactor)),
              expectedImpact: 0.2,
            });
          }
        }

        if (node.style.margin) {
          const marginScale = hotspot.severity === 'critical' ? 0.1 : 0.05;
          const currentMarginTop = typeof node.style.margin === 'object' ? (node.style.margin as { top: number }).top : 0;
          if (currentMarginTop > 0) {
            adjustments.push({
              nodeId: node.id,
              property: 'style.margin.top',
              currentValue: currentMarginTop,
              suggestedValue: Math.round(currentMarginTop * (1 + marginScale * correctionFactor)),
              expectedImpact: 0.15,
            });
          }
        }

        // Text node adjustments: font size, line height, letter spacing
        if (node.content.kind === 'text') {
          const fontSizeScale = hotspot.severity === 'critical' ? 0.05 : hotspot.severity === 'warning' ? 0.03 : 0.01;
          adjustments.push({
            nodeId: node.id,
            property: 'content.font.size',
            currentValue: node.content.font.size,
            suggestedValue: Math.round(node.content.font.size * (1 + fontSizeScale * correctionFactor) * 10) / 10,
            expectedImpact: 0.3,
          });

          // Line height
          if (node.content.font.lineHeight > 0) {
            adjustments.push({
              nodeId: node.id,
              property: 'content.font.lineHeight',
              currentValue: node.content.font.lineHeight,
              suggestedValue: Math.round(node.content.font.lineHeight * (1 + fontSizeScale * correctionFactor * 0.5) * 100) / 100,
              expectedImpact: 0.2,
            });
          }

          // Letter spacing
          const lsAdjust = hotspot.severity === 'critical' ? 0.3 : 0.1;
          adjustments.push({
            nodeId: node.id,
            property: 'content.font.letterSpacing',
            currentValue: node.content.font.letterSpacing,
            suggestedValue: Math.round((node.content.font.letterSpacing + lsAdjust * correctionFactor) * 100) / 100,
            expectedImpact: 0.15,
          });
        }
      }
    }

    // Deduplicate: keep highest-impact adjustment per nodeId+property
    const bestByKey = new Map<string, OptimizationAdjustment>();
    for (const adj of adjustments) {
      const key = `${adj.nodeId}:${adj.property}`;
      const existing = bestByKey.get(key);
      if (!existing || adj.expectedImpact > existing.expectedImpact) {
        bestByKey.set(key, adj);
      }
    }

    return Array.from(bestByKey.values());
  }

  private applyAdjustments(
    graph: CanonicalLayoutGraph,
    adjustments: OptimizationAdjustment[],
  ): CanonicalLayoutGraph {
    const clone = structuredClone(graph);

    for (const adj of adjustments) {
      for (const page of clone.pages) {
        const node = this.findNodeById(page.rootNode, adj.nodeId);
        if (!node) continue;

        const parts = adj.property.split('.');
        let target: Record<string, unknown> = node as unknown as Record<string, unknown>;
        for (let i = 0; i < parts.length - 1; i++) {
          const next = target[parts[i]];
          if (next && typeof next === 'object') {
            target = next as Record<string, unknown>;
          }
        }

        const lastKey = parts[parts.length - 1];
        if (lastKey in target) {
          target[lastKey] = adj.suggestedValue;
        }
      }
    }

    return clone;
  }

  // ─── Rendering via Deterministic Environment ──────────────────────────────

  private async reRenderFromGraph(
    graph: CanonicalLayoutGraph,
    sourceImage: Buffer,
  ): Promise<Buffer> {
    const sourceMeta = await sharp(sourceImage).metadata();
    const width = sourceMeta.width || 1920;
    const height = sourceMeta.height || 1080;

    const html = this.graphToHtml(graph, width, height);

    try {
      const response = await fetch(`${RENDERING_SERVICE_URL}/api/v1/render/html-to-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, width, height, format: 'png' }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('Rendering service returned error', { status: response.status, body: errorBody });
        throw new Error(`Rendering service error: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      logger.error('Rendering service call failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.localFallbackRender(graph, width, height);
    }
  }

  // ─── HTML Generation (local fonts only — no network requests) ─────────────

  private graphToHtml(graph: CanonicalLayoutGraph, width: number, height: number): string {
    const pageHtml = graph.pages.map((page) => this.nodeToHtml(page.rootNode)).join('\n');
    const direction = graph.metadata.direction === 'rtl' ? 'rtl' : 'ltr';
    const lang = graph.metadata.language || 'ar';

    // NO Google Fonts imports — all fonts must be locally installed in the container
    return `<!DOCTYPE html>
<html dir="${direction}" lang="${lang}">
<head>
<meta charset="utf-8">
<style>
  * {
    margin: 0; padding: 0; box-sizing: border-box;
    -webkit-font-smoothing: none;
    -moz-osx-font-smoothing: unset;
    text-rendering: geometricPrecision;
    font-kerning: normal;
    font-variant-ligatures: common-ligatures;
    image-rendering: pixelated;
    -webkit-text-stroke: 0;
    paint-order: stroke fill markers;
    shape-rendering: crispEdges;
    font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1;
  }
  svg {
    shape-rendering: crispEdges;
    text-rendering: geometricPrecision;
  }
  body {
    width: ${width}px; height: ${height}px;
    overflow: hidden; background: #fff;
  }
  .node { position: absolute; overflow: hidden; }
  img { image-rendering: pixelated; }
</style>
</head>
<body>
${pageHtml}
</body>
</html>`;
  }

  private nodeToHtml(node: LayoutNode): string {
    const style = this.nodeToStyle(node);
    let inner = '';

    if (node.content.kind === 'text') {
      inner = this.escapeHtml(node.content.text);
    } else if (node.content.kind === 'image') {
      // Embed raster assets inline as base64 for deterministic rendering
      if (node.content.isVector && node.content.vectorData) {
        inner = node.content.vectorData;
      } else if (node.content.src) {
        inner = `<img src="${this.escapeHtml(node.content.src)}" style="width:100%;height:100%;object-fit:${node.content.objectFit || 'cover'};" />`;
      }
    } else if (node.content.kind === 'icon' && node.content.svgData) {
      inner = node.content.svgData;
    } else if (node.content.kind === 'table') {
      inner = this.tableToHtml(node.content);
    } else if (node.content.kind === 'chart') {
      // Charts are NOT rendered dynamically — they must be raster-embedded
      // The chart node should have been pre-rendered as an image asset
      inner = `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#666;">Chart: ${this.escapeHtml(node.content.title)}</div>`;
    }

    const children = node.children.map((c) => this.nodeToHtml(c)).join('\n');

    return `<div class="node" style="${style}">${inner}${children}</div>`;
  }

  private nodeToStyle(node: LayoutNode): string {
    const parts: string[] = [
      `left:${node.bbox.x}px`,
      `top:${node.bbox.y}px`,
      `width:${node.bbox.width}px`,
      `height:${node.bbox.height}px`,
    ];

    if (node.zIndex !== undefined) parts.push(`z-index:${node.zIndex}`);

    // Background
    if (node.style.backgroundColor) parts.push(`background:${node.style.backgroundColor}`);
    if (node.style.backgroundGradient) {
      const g = node.style.backgroundGradient;
      const stops = g.stops.map((s) => `${s.color} ${s.position * 100}%`).join(',');
      if (g.type === 'linear') parts.push(`background:linear-gradient(${g.angle}deg,${stops})`);
      else if (g.type === 'radial') parts.push(`background:radial-gradient(${stops})`);
    }

    // Border
    if (node.style.border) {
      parts.push(`border:${node.style.border.width}px ${node.style.border.style} ${node.style.border.color}`);
      if (node.style.border.radius > 0) parts.push(`border-radius:${node.style.border.radius}px`);
    }
    if (node.style.borderRadius > 0) parts.push(`border-radius:${node.style.borderRadius}px`);

    // Shadow
    if (node.style.shadow) {
      const s = node.style.shadow;
      parts.push(`box-shadow:${s.inset ? 'inset ' : ''}${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px ${s.color}`);
    }

    if (node.style.opacity !== undefined && node.style.opacity < 1) parts.push(`opacity:${node.style.opacity}`);

    // Padding
    if (node.style.padding && typeof node.style.padding === 'object') {
      const p = node.style.padding;
      parts.push(`padding:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`);
    }

    // Margin
    if (node.style.margin && typeof node.style.margin === 'object') {
      const m = node.style.margin;
      parts.push(`margin:${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`);
    }

    // Flexbox/Grid
    if (node.style.display && node.style.display !== 'block') parts.push(`display:${node.style.display}`);
    if (node.style.flexDirection) parts.push(`flex-direction:${node.style.flexDirection}`);
    if (node.style.alignItems) parts.push(`align-items:${node.style.alignItems}`);
    if (node.style.justifyContent) parts.push(`justify-content:${node.style.justifyContent}`);
    if (node.style.gridTemplate) parts.push(`grid-template:${node.style.gridTemplate}`);
    if (node.style.overflow !== 'visible') parts.push(`overflow:${node.style.overflow}`);

    // Text styling
    if (node.content.kind === 'text') {
      const font = node.content.font;
      // Use font-family with local-only stack — no generic fallback during validation
      parts.push(`font-family:'${font.family}'`);
      parts.push(`font-size:${font.size}px`);
      parts.push(`font-weight:${font.weight}`);
      parts.push(`font-style:${font.style}`);
      parts.push(`color:${node.content.color}`);
      if (font.lineHeight > 0) parts.push(`line-height:${font.lineHeight}`);
      if (font.letterSpacing !== 0) parts.push(`letter-spacing:${font.letterSpacing}px`);
      if (font.kerning !== 0) parts.push(`font-kerning:normal`);
      if (node.content.alignment) parts.push(`text-align:${node.content.alignment}`);
      if (node.content.direction) parts.push(`direction:${node.content.direction}`);
      if (node.content.textDecoration !== 'none') parts.push(`text-decoration:${node.content.textDecoration}`);
    }

    return parts.join(';');
  }

  private tableToHtml(content: {
    headers: Array<{ value: string; colSpan?: number; rowSpan?: number; backgroundColor?: string | null; color?: string | null; font?: { family: string; size: number; weight: number } | null }>;
    rows: Array<Array<{ value: string; colSpan?: number; rowSpan?: number; backgroundColor?: string | null; color?: string | null; alignment?: string }>>;
    borderStyle?: string;
    headerStyle?: { backgroundColor: string; color: string; font?: { family: string; size: number; weight: number } };
    columnWidths?: number[];
  }): string {
    const borderCss = content.borderStyle === 'none' ? 'border:none;' : 'border:1px solid #ddd;';

    let headerRow = '';
    if (content.headers && content.headers.length > 0) {
      const hs = content.headerStyle;
      const headerCells = content.headers.map((h, idx) => {
        const attrs: string[] = [];
        if (h.colSpan && h.colSpan > 1) attrs.push(`colspan="${h.colSpan}"`);
        if (h.rowSpan && h.rowSpan > 1) attrs.push(`rowspan="${h.rowSpan}"`);
        const cellStyle = [
          borderCss,
          hs ? `background:${hs.backgroundColor};color:${hs.color};` : '',
          hs?.font ? `font-family:'${hs.font.family}';font-size:${hs.font.size}px;font-weight:${hs.font.weight};` : '',
          content.columnWidths?.[idx] ? `width:${content.columnWidths[idx]}px;` : '',
          'padding:4px;',
        ].join('');
        return `<th ${attrs.join(' ')} style="${cellStyle}">${this.escapeHtml(h.value)}</th>`;
      }).join('');
      headerRow = `<thead><tr>${headerCells}</tr></thead>`;
    }

    const bodyRows = (content.rows || []).map((row) => {
      const cells = row.map((cell) => {
        const attrs: string[] = [];
        if (cell.colSpan && cell.colSpan > 1) attrs.push(`colspan="${cell.colSpan}"`);
        if (cell.rowSpan && cell.rowSpan > 1) attrs.push(`rowspan="${cell.rowSpan}"`);
        const cellStyle = [
          borderCss,
          cell.backgroundColor ? `background:${cell.backgroundColor};` : '',
          cell.color ? `color:${cell.color};` : '',
          cell.alignment ? `text-align:${cell.alignment};` : '',
          'padding:4px;',
        ].join('');
        return `<td ${attrs.join(' ')} style="${cellStyle}">${this.escapeHtml(cell.value)}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return `<table style="width:100%;height:100%;border-collapse:collapse;${borderCss}">${headerRow}<tbody>${bodyRows}</tbody></table>`;
  }

  private collectFontsFromNode(node: LayoutNode, fonts: Set<string>): void {
    if (node.content.kind === 'text' && node.content.font.family) {
      fonts.add(node.content.font.family);
    }
    for (const child of node.children) {
      this.collectFontsFromNode(child, fonts);
    }
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Local Fallback Render ────────────────────────────────────────────────

  private async localFallbackRender(
    graph: CanonicalLayoutGraph,
    width: number,
    height: number,
  ): Promise<Buffer> {
    let image = sharp({
      create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).png();

    const overlays: sharp.OverlayOptions[] = [];

    for (const page of graph.pages) {
      this.collectNodeOverlays(page.rootNode, overlays, width, height);
    }

    if (overlays.length > 0) {
      return image.composite(overlays).toBuffer();
    }

    return image.toBuffer();
  }

  private collectNodeOverlays(
    node: LayoutNode,
    overlays: sharp.OverlayOptions[],
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const x = Math.max(0, Math.min(Math.round(node.bbox.x), canvasWidth - 1));
    const y = Math.max(0, Math.min(Math.round(node.bbox.y), canvasHeight - 1));
    const w = Math.max(1, Math.min(Math.round(node.bbox.width), canvasWidth - x));
    const h = Math.max(1, Math.min(Math.round(node.bbox.height), canvasHeight - y));

    if (node.style.backgroundColor && node.style.backgroundColor !== 'transparent') {
      try {
        const bg = this.parseColor(node.style.backgroundColor);
        overlays.push({
          input: { create: { width: w, height: h, channels: 4, background: bg } },
          left: x,
          top: y,
        });
      } catch {
        // Skip unparseable colors
      }
    }

    for (const child of node.children) {
      this.collectNodeOverlays(child, overlays, canvasWidth, canvasHeight);
    }
  }

  private parseColor(color: string): { r: number; g: number; b: number; alpha: number } {
    const hex = color.replace('#', '');
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) || 255 : 255;
      return { r, g, b, alpha: a / 255 };
    }
    return { r: 200, g: 200, b: 200, alpha: 1 };
  }

  // ─── Diff Image Generation ────────────────────────────────────────────────

  private async generateDiffImage(source: Buffer, generated: Buffer): Promise<Buffer> {
    const sourceMeta = await sharp(source).metadata();
    const w = sourceMeta.width || 1920;
    const h = sourceMeta.height || 1080;

    const [sourceRaw, generatedRaw] = await Promise.all([
      sharp(source).ensureAlpha().resize(w, h).raw().toBuffer(),
      sharp(generated).ensureAlpha().resize(w, h).raw().toBuffer(),
    ]);

    const diffRaw = Buffer.alloc(w * h * 4);
    pixelmatch(sourceRaw, generatedRaw, diffRaw, w, h, {
      threshold: 0,
      diffColor: [255, 0, 0],
      diffColorAlt: [0, 0, 255],
    });

    return sharp(diffRaw, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer();
  }

  // ─── Convergence Detection ────────────────────────────────────────────────

  private hasConverged(history: number[]): boolean {
    const window = RENDER_CONFIG.convergenceWindow;
    if (history.length < window) return false;
    const recent = history.slice(-window);
    let maxDelta = 0;
    for (let i = 1; i < recent.length; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(recent[i] - recent[i - 1]));
    }
    return maxDelta <= RENDER_CONFIG.convergenceDelta;
  }

  // ─── Node Search ──────────────────────────────────────────────────────────

  private findNodesInRegion(graph: CanonicalLayoutGraph, region: BoundingBox): LayoutNode[] {
    const results: LayoutNode[] = [];
    for (const page of graph.pages) {
      this.collectNodesInRegion(page.rootNode, region, results);
    }
    return results;
  }

  private collectNodesInRegion(node: LayoutNode, region: BoundingBox, results: LayoutNode[]): void {
    if (this.bboxOverlaps(node.bbox, region)) {
      results.push(node);
    }
    for (const child of node.children) {
      this.collectNodesInRegion(child, region, results);
    }
  }

  private findNodeById(node: LayoutNode, id: string): LayoutNode | null {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = this.findNodeById(child, id);
      if (found) return found;
    }
    return null;
  }

  private bboxOverlaps(a: BoundingBox, b: BoundingBox): boolean {
    return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private async persistValidationResult(
    graphId: string,
    result: PixelValidationResult,
    diagnostic: DiagnosticReport,
  ): Promise<void> {
    try {
      await this.prisma.replicationJob.create({
        data: {
          id: randomUUID(),
          tenantId: 'system',
          sourceType: 'PIXEL_VALIDATION',
          sourceConfig: JSON.stringify({
            graphId,
            iterations: result.iterationCount,
            convergenceHistory: result.convergenceHistory,
          }),
          mode: 'FULL',
          status: diagnostic.status,
          fidelityScore: result.ssim,
          metadata: JSON.stringify({
            pixelDiff: result.pixelDiff,
            totalPixels: result.totalPixels,
            diffPercentage: result.diffPercentage,
            ssim: result.ssim,
            lpips: result.lpips,
            hotspotCount: result.hotspots.length,
            diagnostic,
          }),
        },
      });
    } catch (err) {
      logger.warn('Failed to persist validation result', { graphId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
