import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DesignElement {
  id: string;
  type: string;
  bbox: { x: number; y: number; width: number; height: number };
  zIndex: number;
  style: Record<string, unknown>;
  content: Record<string, unknown>;
  children: DesignElement[];
}

export interface DesignDocument {
  id: string;
  width: number;
  height: number;
  elements: DesignElement[];
  designTokens: Record<string, unknown>;
}

export interface QualityConfig {
  densityThreshold: number;
  hierarchyEntropyThreshold: number;
  alignmentDeviationThreshold: number;
  contrastRatioThreshold: number;
  maxIterations: number;
  autoCorrect: boolean;
}

export interface QualityScores {
  densityScore: number;
  hierarchyEntropy: number;
  alignmentDeviation: number;
  contrastRatio: number;
}

export interface QualityResult {
  passed: boolean;
  scores: QualityScores;
  iterations: number;
  corrections: CorrectionRecord[];
  finalDesign: DesignDocument;
  improvementHistory: QualityScores[];
  hash: string;
}

export interface CorrectionRecord {
  iteration: number;
  elementId: string;
  property: string;
  oldValue: number;
  newValue: number;
  reason: string;
}

const DEFAULT_CONFIG: QualityConfig = {
  densityThreshold: 0.3,
  hierarchyEntropyThreshold: 0.5,
  alignmentDeviationThreshold: 4.0,
  contrastRatioThreshold: 4.5,
  maxIterations: 5,
  autoCorrect: true,
};

// ─── Engine ──────────────────────────────────────────────────────────────────

export class DesignQualityReinforcementLoop {
  private readonly config: QualityConfig;

  constructor(config?: Partial<QualityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('DesignQualityReinforcementLoop initialized', {
      maxIterations: this.config.maxIterations,
      autoCorrect: this.config.autoCorrect,
    });
  }

  reinforceQuality(design: DesignDocument, config?: Partial<QualityConfig>): QualityResult {
    const mergedConfig = { ...this.config, ...config };
    logger.info('Starting quality reinforcement loop', {
      designId: design.id,
      elementCount: design.elements.length,
      maxIterations: mergedConfig.maxIterations,
    });

    let currentDesign = this.deepCloneDesign(design);
    const corrections: CorrectionRecord[] = [];
    const improvementHistory: QualityScores[] = [];
    let iteration = 0;

    while (iteration < mergedConfig.maxIterations) {
      iteration++;
      const scores = this.computeScores(currentDesign);
      improvementHistory.push({ ...scores });

      logger.debug('Quality scores at iteration', {
        iteration,
        densityScore: scores.densityScore,
        hierarchyEntropy: scores.hierarchyEntropy,
        alignmentDeviation: scores.alignmentDeviation,
        contrastRatio: scores.contrastRatio,
      });

      const allPassed =
        scores.densityScore >= mergedConfig.densityThreshold &&
        scores.hierarchyEntropy >= mergedConfig.hierarchyEntropyThreshold &&
        scores.alignmentDeviation <= mergedConfig.alignmentDeviationThreshold &&
        scores.contrastRatio >= mergedConfig.contrastRatioThreshold;

      if (allPassed) {
        logger.info('All quality thresholds met', { iteration });
        break;
      }

      if (!mergedConfig.autoCorrect) {
        logger.info('Auto-correct disabled, stopping after first evaluation');
        break;
      }

      // Apply corrections
      if (scores.densityScore < mergedConfig.densityThreshold) {
        const densityCorrections = this.correctDensity(currentDesign, mergedConfig.densityThreshold, iteration);
        corrections.push(...densityCorrections);
      }

      if (scores.hierarchyEntropy < mergedConfig.hierarchyEntropyThreshold) {
        const hierarchyCorrections = this.correctHierarchy(currentDesign, iteration);
        corrections.push(...hierarchyCorrections);
      }

      if (scores.alignmentDeviation > mergedConfig.alignmentDeviationThreshold) {
        const alignmentCorrections = this.correctAlignment(currentDesign, mergedConfig.alignmentDeviationThreshold, iteration);
        corrections.push(...alignmentCorrections);
      }

      if (scores.contrastRatio < mergedConfig.contrastRatioThreshold) {
        const contrastCorrections = this.correctContrast(currentDesign, iteration);
        corrections.push(...contrastCorrections);
      }
    }

    const finalScores = this.computeScores(currentDesign);
    improvementHistory.push({ ...finalScores });

    const passed =
      finalScores.densityScore >= mergedConfig.densityThreshold &&
      finalScores.hierarchyEntropy >= mergedConfig.hierarchyEntropyThreshold &&
      finalScores.alignmentDeviation <= mergedConfig.alignmentDeviationThreshold &&
      finalScores.contrastRatio >= mergedConfig.contrastRatioThreshold;

    const resultHash = crypto.createHash('sha256')
      .update(JSON.stringify({ scores: finalScores, iterations: iteration, corrections: corrections.length }))
      .digest('hex');

    const result: QualityResult = {
      passed,
      scores: finalScores,
      iterations: iteration,
      corrections,
      finalDesign: currentDesign,
      improvementHistory,
      hash: resultHash,
    };

    logger.info('Quality reinforcement loop complete', {
      passed,
      iterations: iteration,
      corrections: corrections.length,
      finalDensity: finalScores.densityScore,
      finalEntropy: finalScores.hierarchyEntropy,
      finalAlignment: finalScores.alignmentDeviation,
      finalContrast: finalScores.contrastRatio,
    });

    return result;
  }

  private computeScores(design: DesignDocument): QualityScores {
    return {
      densityScore: this.computeDensityScore(design),
      hierarchyEntropy: this.computeHierarchyEntropy(design),
      alignmentDeviation: this.computeAlignmentDeviation(design),
      contrastRatio: this.computeContrastRatio(design),
    };
  }

  private computeDensityScore(design: DesignDocument): number {
    const containerArea = design.width * design.height;
    if (containerArea === 0) return 0;

    let occupiedArea = 0;
    for (const el of design.elements) {
      occupiedArea += el.bbox.width * el.bbox.height;
    }

    const rawDensity = occupiedArea / containerArea;
    // Optimal density is between 0.4 and 0.7; penalize extremes
    const optimalCenter = 0.55;
    const distance = Math.abs(rawDensity - optimalCenter);
    const score = Math.max(0, 1 - distance * 2);

    return parseFloat(score.toFixed(4));
  }

  private computeHierarchyEntropy(design: DesignDocument): number {
    const depthCounts = new Map<number, number>();
    const flatElements = this.flattenElements(design.elements);

    for (const el of flatElements) {
      const depth = this.computeDepth(el, design.elements);
      depthCounts.set(depth, (depthCounts.get(depth) || 0) + 1);
    }

    const total = flatElements.length;
    if (total <= 1) return 1.0;

    let entropy = 0;
    for (const [, count] of depthCounts) {
      const p = count / total;
      if (p > 0) entropy -= p * Math.log2(p);
    }

    // Normalize by max possible entropy
    const maxEntropy = Math.log2(depthCounts.size || 1);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 1;

    return parseFloat(Math.min(1, normalizedEntropy).toFixed(4));
  }

  private computeAlignmentDeviation(design: DesignDocument): number {
    const elements = design.elements;
    if (elements.length < 2) return 0;

    const gridSize = 4;
    let totalDeviation = 0;
    let deviationCount = 0;

    for (const el of elements) {
      // Check left alignment to grid
      const leftDev = el.bbox.x % gridSize;
      const topDev = el.bbox.y % gridSize;
      totalDeviation += Math.min(leftDev, gridSize - leftDev);
      totalDeviation += Math.min(topDev, gridSize - topDev);
      deviationCount += 2;
    }

    // Check mutual alignment
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i];
        const b = elements[j];

        // Left alignment
        const leftDiff = Math.abs(a.bbox.x - b.bbox.x);
        if (leftDiff > 0 && leftDiff < gridSize * 2) {
          totalDeviation += leftDiff;
          deviationCount++;
        }

        // Top alignment
        const topDiff = Math.abs(a.bbox.y - b.bbox.y);
        if (topDiff > 0 && topDiff < gridSize * 2) {
          totalDeviation += topDiff;
          deviationCount++;
        }
      }
    }

    return deviationCount > 0 ? parseFloat((totalDeviation / deviationCount).toFixed(4)) : 0;
  }

  private computeContrastRatio(design: DesignDocument): number {
    const bgColor = this.parseColor(
      typeof design.designTokens.backgroundColor === 'string'
        ? design.designTokens.backgroundColor
        : '#ffffff'
    );

    let totalContrast = 0;
    let contrastCount = 0;

    for (const el of design.elements) {
      const fgColorStr = typeof el.style.color === 'string' ? el.style.color :
        (typeof el.style.backgroundColor === 'string' ? el.style.backgroundColor : null);

      if (fgColorStr) {
        const fgColor = this.parseColor(fgColorStr);
        const ratio = this.computeLuminanceContrastRatio(bgColor, fgColor);
        totalContrast += ratio;
        contrastCount++;
      }
    }

    return contrastCount > 0 ? parseFloat((totalContrast / contrastCount).toFixed(4)) : 21;
  }

  private correctDensity(design: DesignDocument, threshold: number, iteration: number): CorrectionRecord[] {
    const corrections: CorrectionRecord[] = [];
    const containerArea = design.width * design.height;
    let occupiedArea = 0;
    for (const el of design.elements) {
      occupiedArea += el.bbox.width * el.bbox.height;
    }

    const density = occupiedArea / containerArea;

    if (density > 0.8) {
      // Too dense: shrink largest elements slightly
      const sorted = [...design.elements].sort((a, b) =>
        (b.bbox.width * b.bbox.height) - (a.bbox.width * a.bbox.height)
      );
      for (let i = 0; i < Math.min(3, sorted.length); i++) {
        const el = sorted[i];
        const scaleFactor = 0.95;
        const oldWidth = el.bbox.width;
        el.bbox.width = Math.round(el.bbox.width * scaleFactor);
        el.bbox.height = Math.round(el.bbox.height * scaleFactor);
        corrections.push({
          iteration, elementId: el.id, property: 'width',
          oldValue: oldWidth, newValue: el.bbox.width,
          reason: 'Density too high, scaling down large element',
        });
      }
    } else if (density < 0.3) {
      // Too sparse: expand elements slightly
      for (const el of design.elements) {
        const scaleFactor = 1.05;
        const oldWidth = el.bbox.width;
        el.bbox.width = Math.round(Math.min(el.bbox.width * scaleFactor, design.width - el.bbox.x));
        el.bbox.height = Math.round(Math.min(el.bbox.height * scaleFactor, design.height - el.bbox.y));
        corrections.push({
          iteration, elementId: el.id, property: 'width',
          oldValue: oldWidth, newValue: el.bbox.width,
          reason: 'Density too low, expanding element',
        });
      }
    }

    return corrections;
  }

  private correctHierarchy(design: DesignDocument, iteration: number): CorrectionRecord[] {
    const corrections: CorrectionRecord[] = [];
    // Adjust z-index spread to improve hierarchy differentiation
    const elements = design.elements;
    const zIndices = elements.map((el) => el.zIndex);
    const uniqueZ = new Set(zIndices);

    if (uniqueZ.size < Math.min(3, elements.length)) {
      let newZ = 0;
      const step = 10;
      const sorted = [...elements].sort((a, b) => a.bbox.y - b.bbox.y);
      for (const el of sorted) {
        const oldZ = el.zIndex;
        el.zIndex = newZ;
        newZ += step;
        if (oldZ !== el.zIndex) {
          corrections.push({
            iteration, elementId: el.id, property: 'zIndex',
            oldValue: oldZ, newValue: el.zIndex,
            reason: 'Redistributing z-index for hierarchy differentiation',
          });
        }
      }
    }

    return corrections;
  }

  private correctAlignment(design: DesignDocument, threshold: number, iteration: number): CorrectionRecord[] {
    const corrections: CorrectionRecord[] = [];
    const gridSize = 4;

    for (const el of design.elements) {
      const leftRemainder = el.bbox.x % gridSize;
      if (leftRemainder !== 0) {
        const oldX = el.bbox.x;
        el.bbox.x = leftRemainder < gridSize / 2
          ? el.bbox.x - leftRemainder
          : el.bbox.x + (gridSize - leftRemainder);
        corrections.push({
          iteration, elementId: el.id, property: 'x',
          oldValue: oldX, newValue: el.bbox.x,
          reason: `Snapping x to grid (size=${gridSize})`,
        });
      }

      const topRemainder = el.bbox.y % gridSize;
      if (topRemainder !== 0) {
        const oldY = el.bbox.y;
        el.bbox.y = topRemainder < gridSize / 2
          ? el.bbox.y - topRemainder
          : el.bbox.y + (gridSize - topRemainder);
        corrections.push({
          iteration, elementId: el.id, property: 'y',
          oldValue: oldY, newValue: el.bbox.y,
          reason: `Snapping y to grid (size=${gridSize})`,
        });
      }
    }

    return corrections;
  }

  private correctContrast(design: DesignDocument, iteration: number): CorrectionRecord[] {
    const corrections: CorrectionRecord[] = [];
    const bgColor = this.parseColor(
      typeof design.designTokens.backgroundColor === 'string'
        ? design.designTokens.backgroundColor
        : '#ffffff'
    );

    for (const el of design.elements) {
      if (typeof el.style.color !== 'string') continue;

      const fgColor = this.parseColor(el.style.color);
      const ratio = this.computeLuminanceContrastRatio(bgColor, fgColor);

      if (ratio < 4.5) {
        // Darken or lighten the foreground to meet WCAG AA
        const bgLuminance = this.relativeLuminance(bgColor);
        const oldColorStr = el.style.color as string;

        if (bgLuminance > 0.5) {
          // Light background: darken text
          const darkenedColor = {
            r: Math.max(0, Math.floor(fgColor.r * 0.5)),
            g: Math.max(0, Math.floor(fgColor.g * 0.5)),
            b: Math.max(0, Math.floor(fgColor.b * 0.5)),
          };
          el.style.color = `#${darkenedColor.r.toString(16).padStart(2, '0')}${darkenedColor.g.toString(16).padStart(2, '0')}${darkenedColor.b.toString(16).padStart(2, '0')}`;
        } else {
          // Dark background: lighten text
          const lightenedColor = {
            r: Math.min(255, Math.floor(fgColor.r + (255 - fgColor.r) * 0.5)),
            g: Math.min(255, Math.floor(fgColor.g + (255 - fgColor.g) * 0.5)),
            b: Math.min(255, Math.floor(fgColor.b + (255 - fgColor.b) * 0.5)),
          };
          el.style.color = `#${lightenedColor.r.toString(16).padStart(2, '0')}${lightenedColor.g.toString(16).padStart(2, '0')}${lightenedColor.b.toString(16).padStart(2, '0')}`;
        }

        corrections.push({
          iteration, elementId: el.id, property: 'color',
          oldValue: ratio, newValue: this.computeLuminanceContrastRatio(bgColor, this.parseColor(el.style.color as string)),
          reason: `Contrast ratio ${ratio.toFixed(2)} below minimum 4.5:1`,
        });
      }
    }

    return corrections;
  }

  private parseColor(color: string): { r: number; g: number; b: number } {
    const hex = color.replace('#', '');
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.substring(0, 2), 16) || 0,
        g: parseInt(hex.substring(2, 4), 16) || 0,
        b: parseInt(hex.substring(4, 6), 16) || 0,
      };
    }
    return { r: 0, g: 0, b: 0 };
  }

  private relativeLuminance(color: { r: number; g: number; b: number }): number {
    const sRGB = [color.r / 255, color.g / 255, color.b / 255];
    const linear = sRGB.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  private computeLuminanceContrastRatio(
    c1: { r: number; g: number; b: number },
    c2: { r: number; g: number; b: number },
  ): number {
    const l1 = this.relativeLuminance(c1);
    const l2 = this.relativeLuminance(c2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return parseFloat(((lighter + 0.05) / (darker + 0.05)).toFixed(4));
  }

  private flattenElements(elements: DesignElement[]): DesignElement[] {
    const result: DesignElement[] = [];
    const stack = [...elements];
    while (stack.length > 0) {
      const el = stack.pop()!;
      result.push(el);
      for (const child of el.children) {
        stack.push(child);
      }
    }
    return result;
  }

  private computeDepth(element: DesignElement, allElements: DesignElement[]): number {
    let depth = 0;
    const findParent = (el: DesignElement, elements: DesignElement[], currentDepth: number): number => {
      for (const candidate of elements) {
        if (candidate.children.some((c) => c.id === el.id)) {
          return findParent(candidate, allElements, currentDepth + 1);
        }
      }
      return currentDepth;
    };
    depth = findParent(element, allElements, 0);
    return depth;
  }

  private deepCloneDesign(design: DesignDocument): DesignDocument {
    return JSON.parse(JSON.stringify(design));
  }
}
