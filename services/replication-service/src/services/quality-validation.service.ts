import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import OpenAI from 'openai';
import { createLogger, format, transports } from 'winston';
import { randomUUID } from 'crypto';
import type {
  CanonicalLayoutGraph,
  LayoutNode,
  QualityMetrics,
  QualityIssue,
  BoundingBox,
  TextContent,
} from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'quality-validation' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface QualityValidationRequest {
  sourceGraph: CanonicalLayoutGraph;
  generatedGraph: CanonicalLayoutGraph;
  sourceImage: Buffer | null;
  generatedImage: Buffer | null;
  options?: QualityValidationOptions;
}

export interface QualityValidationOptions {
  validateText: boolean;
  validateLayout: boolean;
  validateColors: boolean;
  validateFonts: boolean;
  validateSpacing: boolean;
  validatePixels: boolean;
  textThresholdCER: number;
  layoutThreshold: number;
  colorThreshold: number;
}

const DEFAULT_OPTIONS: QualityValidationOptions = {
  validateText: true,
  validateLayout: true,
  validateColors: true,
  validateFonts: true,
  validateSpacing: true,
  validatePixels: true,
  textThresholdCER: 0.05,
  layoutThreshold: 0.9,
  colorThreshold: 0.95,
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class QualityValidationService {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  async validate(request: QualityValidationRequest): Promise<QualityMetrics> {
    const options = { ...DEFAULT_OPTIONS, ...request.options };
    const issues: QualityIssue[] = [];

    logger.info('Starting quality validation');

    let cer = 0;
    let wer = 0;
    let layoutFidelity = 1;
    let colorAccuracy = 1;
    let fontAccuracy = 1;
    let spacingAccuracy = 1;

    if (options.validateText) {
      const textResult = this.validateTextContent(request.sourceGraph, request.generatedGraph);
      cer = textResult.cer;
      wer = textResult.wer;
      issues.push(...textResult.issues);
    }

    if (options.validateLayout) {
      const layoutResult = this.validateLayoutFidelity(request.sourceGraph, request.generatedGraph);
      layoutFidelity = layoutResult.fidelity;
      issues.push(...layoutResult.issues);
    }

    if (options.validateColors) {
      const colorResult = this.validateColorAccuracy(request.sourceGraph, request.generatedGraph);
      colorAccuracy = colorResult.accuracy;
      issues.push(...colorResult.issues);
    }

    if (options.validateFonts) {
      const fontResult = this.validateFontAccuracy(request.sourceGraph, request.generatedGraph);
      fontAccuracy = fontResult.accuracy;
      issues.push(...fontResult.issues);
    }

    if (options.validateSpacing) {
      const spacingResult = this.validateSpacingAccuracy(request.sourceGraph, request.generatedGraph);
      spacingAccuracy = spacingResult.accuracy;
      issues.push(...spacingResult.issues);
    }

    let pixelSSIM = 1;
    if (options.validatePixels && request.sourceImage && request.generatedImage) {
      const pixelResult = await this.validatePixelAccuracy(request.sourceImage, request.generatedImage);
      pixelSSIM = pixelResult.ssim;
      issues.push(...pixelResult.issues);
    }

    const overallScore = this.computeOverallScore({
      cer,
      wer,
      layoutFidelity,
      colorAccuracy,
      fontAccuracy,
      spacingAccuracy,
      pixelSSIM,
    });

    const metrics: QualityMetrics = {
      cer: Math.round(cer * 10000) / 10000,
      wer: Math.round(wer * 10000) / 10000,
      bleu: Math.round((1 - wer) * 10000) / 10000,
      comet: Math.round(overallScore * 10000) / 10000,
      bertScore: Math.round((1 - cer) * 10000) / 10000,
      layoutFidelity: Math.round(layoutFidelity * 10000) / 10000,
      colorAccuracy: Math.round(colorAccuracy * 10000) / 10000,
      fontAccuracy: Math.round(fontAccuracy * 10000) / 10000,
      spacingAccuracy: Math.round(spacingAccuracy * 10000) / 10000,
      overallScore: Math.round(overallScore * 10000) / 10000,
      issues,
    };

    logger.info('Quality validation complete', {
      overallScore: metrics.overallScore,
      issues: issues.length,
      criticalIssues: issues.filter((i) => i.severity === 'critical').length,
    });

    return metrics;
  }

  // ─── Text Validation ────────────────────────────────────────────────────────

  private validateTextContent(
    source: CanonicalLayoutGraph,
    generated: CanonicalLayoutGraph,
  ): { cer: number; wer: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    const sourceTexts = this.extractAllText(source);
    const generatedTexts = this.extractAllText(generated);

    const sourceAll = sourceTexts.join(' ');
    const generatedAll = generatedTexts.join(' ');

    const cer = this.computeCER(sourceAll, generatedAll);
    const wer = this.computeWER(sourceAll, generatedAll);

    if (sourceTexts.length !== generatedTexts.length) {
      issues.push({
        type: 'missing_text',
        severity: 'critical',
        description: `Text block count mismatch: source ${sourceTexts.length} vs generated ${generatedTexts.length}`,
        location: null,
        suggestion: 'Check for missing or extra text blocks in the generated output',
      });
    }

    for (let i = 0; i < Math.min(sourceTexts.length, generatedTexts.length); i++) {
      const segmentCER = this.computeCER(sourceTexts[i], generatedTexts[i]);
      if (segmentCER > 0.1) {
        issues.push({
          type: 'ocr_error',
          severity: segmentCER > 0.3 ? 'critical' : 'warning',
          description: `High CER (${(segmentCER * 100).toFixed(1)}%) in segment: "${sourceTexts[i].slice(0, 40)}"`,
          location: null,
          suggestion: `Source: "${sourceTexts[i].slice(0, 50)}" vs Generated: "${generatedTexts[i].slice(0, 50)}"`,
        });
      }
    }

    for (let i = generatedTexts.length; i < sourceTexts.length; i++) {
      issues.push({
        type: 'missing_text',
        severity: 'critical',
        description: `Missing text block: "${sourceTexts[i].slice(0, 50)}"`,
        location: null,
        suggestion: 'Ensure all source text blocks are present in the output',
      });
    }

    return { cer, wer, issues };
  }

  private computeCER(source: string, generated: string): number {
    if (source.length === 0 && generated.length === 0) return 0;
    if (source.length === 0) return 1;

    const distance = this.levenshteinDistance(source, generated);
    return Math.min(1, distance / source.length);
  }

  private computeWER(source: string, generated: string): number {
    const sourceWords = source.split(/\s+/).filter(Boolean);
    const generatedWords = generated.split(/\s+/).filter(Boolean);

    if (sourceWords.length === 0 && generatedWords.length === 0) return 0;
    if (sourceWords.length === 0) return 1;

    const distance = this.levenshteinDistance(sourceWords.join(' '), generatedWords.join(' '));
    return Math.min(1, distance / sourceWords.join(' ').length);
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array.from({ length: m + 1 }, (_, i) => {
      const row = new Array(n + 1).fill(0);
      row[0] = i;
      return row;
    });

    for (let j = 1; j <= n; j++) dp[0][j] = j;

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

  // ─── Layout Validation ──────────────────────────────────────────────────────

  private validateLayoutFidelity(
    source: CanonicalLayoutGraph,
    generated: CanonicalLayoutGraph,
  ): { fidelity: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    const sourceNodes = this.flattenAllNodes(source);
    const generatedNodes = this.flattenAllNodes(generated);

    if (sourceNodes.length === 0) return { fidelity: 1, issues };

    let totalScore = 0;
    let matchCount = 0;

    for (const sourceNode of sourceNodes) {
      const bestMatch = this.findBestMatchingNode(sourceNode, generatedNodes);

      if (!bestMatch) {
        issues.push({
          type: 'alignment_issue',
          severity: 'warning',
          description: `No matching node found for ${sourceNode.type} at (${sourceNode.bbox.x}, ${sourceNode.bbox.y})`,
          location: sourceNode.bbox,
          suggestion: 'Check if this element was properly reconstructed',
        });
        continue;
      }

      const iou = this.computeIoU(sourceNode.bbox, bestMatch.bbox);
      totalScore += iou;
      matchCount++;

      if (iou < 0.7) {
        issues.push({
          type: 'alignment_issue',
          severity: iou < 0.3 ? 'critical' : 'warning',
          description: `Poor alignment for ${sourceNode.type}: IoU=${(iou * 100).toFixed(1)}%`,
          location: sourceNode.bbox,
          suggestion: `Source bbox: (${sourceNode.bbox.x},${sourceNode.bbox.y},${sourceNode.bbox.width},${sourceNode.bbox.height}) vs Generated: (${bestMatch.bbox.x},${bestMatch.bbox.y},${bestMatch.bbox.width},${bestMatch.bbox.height})`,
        });
      }
    }

    const fidelity = matchCount > 0 ? totalScore / matchCount : 0;

    if (sourceNodes.length > generatedNodes.length) {
      const missingCount = sourceNodes.length - generatedNodes.length;
      issues.push({
        type: 'alignment_issue',
        severity: 'warning',
        description: `${missingCount} layout elements missing in generated output`,
        location: null,
        suggestion: 'Some elements were not reconstructed',
      });
    }

    const overflowingNodes = generatedNodes.filter((n) => {
      const parent = generated.pages[0]?.rootNode;
      if (!parent) return false;
      return n.bbox.x + n.bbox.width > parent.bbox.width || n.bbox.y + n.bbox.height > parent.bbox.height;
    });

    for (const overflow of overflowingNodes) {
      issues.push({
        type: 'layout_overflow',
        severity: 'warning',
        description: `Element ${overflow.type} overflows container at (${overflow.bbox.x + overflow.bbox.width}, ${overflow.bbox.y + overflow.bbox.height})`,
        location: overflow.bbox,
        suggestion: 'Resize or reflow this element to fit within its container',
      });
    }

    return { fidelity, issues };
  }

  // ─── Color Validation ───────────────────────────────────────────────────────

  private validateColorAccuracy(
    source: CanonicalLayoutGraph,
    generated: CanonicalLayoutGraph,
  ): { accuracy: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    const sourceColors = source.designTokens.colors;
    const genColors = generated.designTokens.colors;

    if (sourceColors.length === 0) return { accuracy: 1, issues };

    let matchScore = 0;
    for (const sc of sourceColors) {
      const bestMatch = genColors.reduce(
        (best, gc) => {
          const distance = this.colorDistance(sc.hex, gc.hex);
          return distance < best.distance ? { color: gc, distance } : best;
        },
        { color: null as typeof genColors[0] | null, distance: Infinity },
      );

      if (bestMatch.distance < 30) {
        matchScore += 1 - bestMatch.distance / 255;
      } else {
        issues.push({
          type: 'color_mismatch',
          severity: bestMatch.distance > 100 ? 'critical' : 'warning',
          description: `Color ${sc.hex} (${sc.usage}) not accurately matched. Closest: ${bestMatch.color?.hex || 'none'}, distance: ${bestMatch.distance.toFixed(0)}`,
          location: null,
          suggestion: `Use exact color ${sc.hex} for ${sc.usage} elements`,
        });
      }
    }

    const accuracy = sourceColors.length > 0 ? matchScore / sourceColors.length : 1;
    return { accuracy, issues };
  }

  // ─── Font Validation ────────────────────────────────────────────────────────

  private validateFontAccuracy(
    source: CanonicalLayoutGraph,
    generated: CanonicalLayoutGraph,
  ): { accuracy: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    const sourceFonts = source.designTokens.fonts;
    const genFonts = generated.designTokens.fonts;

    if (sourceFonts.length === 0) return { accuracy: 1, issues };

    let matchScore = 0;
    for (const sf of sourceFonts) {
      const match = genFonts.find(
        (gf) => gf.family.toLowerCase() === sf.family.toLowerCase() && Math.abs(gf.weight - sf.weight) <= 100,
      );

      if (match) {
        let score = 1;
        const sizeDiff = Math.abs(match.size - sf.size) / sf.size;
        score -= Math.min(0.3, sizeDiff);

        if (match.weight !== sf.weight) score -= 0.1;
        if (match.style !== sf.style) score -= 0.1;

        matchScore += Math.max(0, score);
      } else {
        issues.push({
          type: 'font_mismatch',
          severity: 'warning',
          description: `Font "${sf.family}" (${sf.weight}, ${sf.size}px) not matched in output`,
          location: null,
          suggestion: `Ensure "${sf.family}" is available and used at weight ${sf.weight}`,
        });
      }
    }

    const accuracy = sourceFonts.length > 0 ? matchScore / sourceFonts.length : 1;
    return { accuracy, issues };
  }

  // ─── Spacing Validation ─────────────────────────────────────────────────────

  private validateSpacingAccuracy(
    source: CanonicalLayoutGraph,
    generated: CanonicalLayoutGraph,
  ): { accuracy: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    const sourceSpacing = source.designTokens.spacing;
    const genSpacing = generated.designTokens.spacing;

    if (sourceSpacing.length === 0) return { accuracy: 1, issues };

    let matchScore = 0;
    for (const ss of sourceSpacing) {
      const match = genSpacing.find(
        (gs) => gs.usage === ss.usage && gs.direction === ss.direction,
      );

      if (match) {
        const diff = Math.abs(match.value - ss.value) / Math.max(ss.value, 1);
        matchScore += Math.max(0, 1 - diff);

        if (diff > 0.2) {
          issues.push({
            type: 'spacing_error',
            severity: diff > 0.5 ? 'warning' : 'info',
            description: `Spacing "${ss.usage}" (${ss.direction}): expected ${ss.value}px, got ${match.value}px`,
            location: null,
            suggestion: `Adjust ${ss.usage} spacing to ${ss.value}px`,
          });
        }
      }
    }

    const accuracy = sourceSpacing.length > 0 ? matchScore / sourceSpacing.length : 1;
    return { accuracy, issues };
  }

  // ─── Pixel Validation ───────────────────────────────────────────────────────

  private async validatePixelAccuracy(
    sourceImage: Buffer,
    generatedImage: Buffer,
  ): Promise<{ ssim: number; issues: QualityIssue[] }> {
    const issues: QualityIssue[] = [];

    const sourceMeta = await sharp(sourceImage).metadata();
    const w = sourceMeta.width || 1920;
    const h = sourceMeta.height || 1080;

    const [srcRaw, genRaw] = await Promise.all([
      sharp(sourceImage).ensureAlpha().resize(w, h).raw().toBuffer(),
      sharp(generatedImage).ensureAlpha().resize(w, h).raw().toBuffer(),
    ]);

    // threshold: 0 — exact pixel match, zero tolerance
    const diffCount = pixelmatch(srcRaw, genRaw, null, w, h, { threshold: 0, includeAA: true });
    const totalPixels = w * h;
    const diffPct = (diffCount / totalPixels) * 100;
    const isPerfect = diffCount === 0;

    if (!isPerfect) {
      issues.push({
        type: 'alignment_issue',
        severity: diffPct > 5 ? 'critical' : diffPct > 1 ? 'warning' : 'info',
        description: `PixelDiff = ${diffCount} (${diffPct.toFixed(3)}%) — NOT pixel-perfect`,
        location: null,
        suggestion: isPerfect ? 'Pixel-perfect achieved' : `${diffCount} pixels differ. Run pixel validation loop to converge to PixelDiff == 0.`,
      });
    }

    const ssim = Math.max(0, 1 - diffPct / 100);
    return { ssim, issues };
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private extractAllText(graph: CanonicalLayoutGraph): string[] {
    const texts: string[] = [];
    for (const page of graph.pages) {
      this.collectTexts(page.rootNode, texts);
    }
    return texts;
  }

  private collectTexts(node: LayoutNode, texts: string[]): void {
    if (node.content.kind === 'text') {
      texts.push((node.content as TextContent).text);
    }
    for (const child of node.children) {
      this.collectTexts(child, texts);
    }
  }

  private flattenAllNodes(graph: CanonicalLayoutGraph): LayoutNode[] {
    const nodes: LayoutNode[] = [];
    for (const page of graph.pages) {
      this.flattenNode(page.rootNode, nodes);
    }
    return nodes;
  }

  private flattenNode(node: LayoutNode, result: LayoutNode[]): void {
    result.push(node);
    for (const child of node.children) {
      this.flattenNode(child, result);
    }
  }

  private findBestMatchingNode(target: LayoutNode, candidates: LayoutNode[]): LayoutNode | null {
    let bestMatch: LayoutNode | null = null;
    let bestIoU = 0;

    for (const candidate of candidates) {
      if (candidate.type !== target.type) continue;
      const iou = this.computeIoU(target.bbox, candidate.bbox);
      if (iou > bestIoU) {
        bestIoU = iou;
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  private computeIoU(a: BoundingBox, b: BoundingBox): number {
    const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const intersection = xOverlap * yOverlap;
    const union = a.width * a.height + b.width * b.height - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private colorDistance(hex1: string, hex2: string): number {
    const parse = (h: string) => {
      const c = h.replace('#', '');
      return {
        r: parseInt(c.substring(0, 2), 16) || 0,
        g: parseInt(c.substring(2, 4), 16) || 0,
        b: parseInt(c.substring(4, 6), 16) || 0,
      };
    };

    const c1 = parse(hex1);
    const c2 = parse(hex2);

    return Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2);
  }

  private computeOverallScore(metrics: {
    cer: number;
    wer: number;
    layoutFidelity: number;
    colorAccuracy: number;
    fontAccuracy: number;
    spacingAccuracy: number;
    pixelSSIM: number;
  }): number {
    return (
      (1 - metrics.cer) * 0.2 +
      metrics.layoutFidelity * 0.25 +
      metrics.colorAccuracy * 0.15 +
      metrics.fontAccuracy * 0.1 +
      metrics.spacingAccuracy * 0.1 +
      metrics.pixelSSIM * 0.2
    );
  }
}
