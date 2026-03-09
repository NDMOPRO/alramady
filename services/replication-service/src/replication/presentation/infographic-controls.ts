import { logger } from '../../utils/logger.js';

interface LayoutElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: string;
  content?: unknown;
  zIndex?: number;
}

interface WhitespaceAnalysis {
  totalArea: number;
  occupiedArea: number;
  whitespaceArea: number;
  whitespaceRatio: number;
  largestGap: { x: number; y: number; width: number; height: number };
  recommendation: string;
}

interface ColorHarmony {
  inputPalette: string[];
  harmonious: string[];
  scheme: 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'monochromatic';
  contrastScores: { color1: string; color2: string; ratio: number }[];
}

interface FlowNode {
  elementId: string;
  order: number;
  connections: string[];
  weight: number;
}

interface NarrativeFlow {
  nodes: FlowNode[];
  readingOrder: string[];
  flowScore: number;
  issues: string[];
}

interface SnappedPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  snapped: boolean;
  appliedRule: string;
}

const GOLDEN_RATIO = 1.6180339887;

export class InfographicControls {
  calculateDensityHeatmap(elements: LayoutElement[], gridSize: number = 50): number[][] {
    if (!elements || elements.length === 0) return [];

    // Determine bounds
    let maxX = 0;
    let maxY = 0;
    for (const el of elements) {
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }

    const cols = Math.ceil(maxX / gridSize);
    const rows = Math.ceil(maxY / gridSize);
    const heatmap: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

    // For each element, increment density in overlapping grid cells
    for (const el of elements) {
      const startCol = Math.max(0, Math.floor(el.x / gridSize));
      const endCol = Math.min(cols - 1, Math.floor((el.x + el.width) / gridSize));
      const startRow = Math.max(0, Math.floor(el.y / gridSize));
      const endRow = Math.min(rows - 1, Math.floor((el.y + el.height) / gridSize));

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          // Calculate overlap area for accurate density
          const overlapX1 = Math.max(el.x, c * gridSize);
          const overlapX2 = Math.min(el.x + el.width, (c + 1) * gridSize);
          const overlapY1 = Math.max(el.y, r * gridSize);
          const overlapY2 = Math.min(el.y + el.height, (r + 1) * gridSize);
          const overlapArea = Math.max(0, overlapX2 - overlapX1) * Math.max(0, overlapY2 - overlapY1);
          const cellArea = gridSize * gridSize;
          heatmap[r][c] += overlapArea / cellArea;
        }
      }
    }

    logger.debug('InfographicControls density heatmap calculated', { rows, cols, elements: elements.length });
    return heatmap;
  }

  analyzeWhitespace(layout: LayoutElement[], containerWidth: number = 1920, containerHeight: number = 1080): WhitespaceAnalysis {
    const totalArea = containerWidth * containerHeight;

    // Calculate occupied area (handling overlaps via pixel sampling for accuracy)
    const gridRes = 10; // sample every 10px
    const gridCols = Math.ceil(containerWidth / gridRes);
    const gridRows = Math.ceil(containerHeight / gridRes);
    let occupiedCells = 0;

    // Build occupancy grid
    const occupied = new Uint8Array(gridCols * gridRows);
    for (const el of layout) {
      const startC = Math.max(0, Math.floor(el.x / gridRes));
      const endC = Math.min(gridCols - 1, Math.floor((el.x + el.width) / gridRes));
      const startR = Math.max(0, Math.floor(el.y / gridRes));
      const endR = Math.min(gridRows - 1, Math.floor((el.y + el.height) / gridRes));
      for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) {
          if (!occupied[r * gridCols + c]) {
            occupied[r * gridCols + c] = 1;
            occupiedCells++;
          }
        }
      }
    }

    const occupiedArea = occupiedCells * gridRes * gridRes;
    const whitespaceArea = totalArea - occupiedArea;
    const whitespaceRatio = whitespaceArea / totalArea;

    // Find largest contiguous whitespace rectangle (greedy approximation)
    const largestGap = this.findLargestWhitespaceRect(occupied, gridCols, gridRows, gridRes);

    let recommendation: string;
    if (whitespaceRatio < 0.2) {
      recommendation = 'Layout is very dense. Consider removing elements or increasing canvas size.';
    } else if (whitespaceRatio < 0.35) {
      recommendation = 'Good density. Whitespace is slightly below optimal.';
    } else if (whitespaceRatio <= 0.55) {
      recommendation = 'Excellent whitespace balance. Layout feels clean and readable.';
    } else {
      recommendation = 'Abundant whitespace. Consider adding content or reducing canvas size.';
    }

    logger.debug('InfographicControls whitespace analyzed', { whitespaceRatio: whitespaceRatio.toFixed(2), recommendation });
    return { totalArea, occupiedArea, whitespaceArea, whitespaceRatio, largestGap, recommendation };
  }

  suggestColorHarmony(palette: string[]): ColorHarmony {
    if (!palette || palette.length === 0) {
      return { inputPalette: [], harmonious: [], scheme: 'monochromatic', contrastScores: [] };
    }

    // Convert input colors to HSL
    const hslColors = palette.map(c => this.hexToHSL(c));
    const primaryHSL = hslColors[0];

    // Determine best harmony scheme based on the existing palette
    const hueSpread = Math.max(...hslColors.map(h => h.h)) - Math.min(...hslColors.map(h => h.h));

    let scheme: ColorHarmony['scheme'];
    let harmonious: string[];

    if (hueSpread < 30) {
      scheme = 'monochromatic';
      harmonious = [
        this.hslToHex({ h: primaryHSL.h, s: primaryHSL.s, l: Math.max(10, primaryHSL.l - 30) }),
        this.hslToHex({ h: primaryHSL.h, s: primaryHSL.s, l: primaryHSL.l }),
        this.hslToHex({ h: primaryHSL.h, s: Math.max(10, primaryHSL.s - 20), l: Math.min(90, primaryHSL.l + 20) }),
        this.hslToHex({ h: primaryHSL.h, s: Math.max(10, primaryHSL.s - 40), l: Math.min(95, primaryHSL.l + 35) }),
      ];
    } else if (hueSpread < 90) {
      scheme = 'analogous';
      harmonious = [
        this.hslToHex({ h: (primaryHSL.h - 30 + 360) % 360, s: primaryHSL.s, l: primaryHSL.l }),
        this.hslToHex({ h: primaryHSL.h, s: primaryHSL.s, l: primaryHSL.l }),
        this.hslToHex({ h: (primaryHSL.h + 30) % 360, s: primaryHSL.s, l: primaryHSL.l }),
        this.hslToHex({ h: (primaryHSL.h + 60) % 360, s: Math.max(20, primaryHSL.s - 10), l: Math.min(85, primaryHSL.l + 10) }),
      ];
    } else if (hueSpread < 150) {
      scheme = 'split-complementary';
      harmonious = [
        this.hslToHex({ h: primaryHSL.h, s: primaryHSL.s, l: primaryHSL.l }),
        this.hslToHex({ h: (primaryHSL.h + 150) % 360, s: primaryHSL.s, l: primaryHSL.l }),
        this.hslToHex({ h: (primaryHSL.h + 210) % 360, s: primaryHSL.s, l: primaryHSL.l }),
        this.hslToHex({ h: primaryHSL.h, s: Math.max(10, primaryHSL.s - 30), l: Math.min(90, primaryHSL.l + 25) }),
      ];
    } else {
      scheme = 'complementary';
      harmonious = [
        this.hslToHex({ h: primaryHSL.h, s: primaryHSL.s, l: primaryHSL.l }),
        this.hslToHex({ h: (primaryHSL.h + 180) % 360, s: primaryHSL.s, l: primaryHSL.l }),
        this.hslToHex({ h: primaryHSL.h, s: Math.max(10, primaryHSL.s - 20), l: Math.min(90, primaryHSL.l + 15) }),
        this.hslToHex({ h: (primaryHSL.h + 180) % 360, s: Math.max(10, primaryHSL.s - 20), l: Math.min(90, primaryHSL.l + 15) }),
      ];
    }

    // Calculate contrast ratios between pairs
    const contrastScores: { color1: string; color2: string; ratio: number }[] = [];
    for (let i = 0; i < harmonious.length; i++) {
      for (let j = i + 1; j < harmonious.length; j++) {
        const ratio = this.calculateContrastRatio(harmonious[i], harmonious[j]);
        contrastScores.push({ color1: harmonious[i], color2: harmonious[j], ratio });
      }
    }

    logger.debug('InfographicControls color harmony suggested', { scheme, paletteSize: harmonious.length });
    return { inputPalette: palette, harmonious, scheme, contrastScores };
  }

  calculateNarrativeFlow(elements: LayoutElement[]): NarrativeFlow {
    if (!elements || elements.length === 0) {
      return { nodes: [], readingOrder: [], flowScore: 0, issues: [] };
    }

    // Determine reading order (top-to-bottom, left-to-right)
    const sorted = [...elements].sort((a, b) => {
      const rowA = Math.floor(a.y / 100);
      const rowB = Math.floor(b.y / 100);
      if (rowA !== rowB) return rowA - rowB;
      return a.x - b.x;
    });

    const nodes: FlowNode[] = sorted.map((el, i) => ({
      elementId: el.id,
      order: i + 1,
      connections: i < sorted.length - 1 ? [sorted[i + 1].id] : [],
      weight: el.width * el.height,
    }));

    const readingOrder = sorted.map(e => e.id);
    const issues: string[] = [];

    // Check for flow issues
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      // Large backward jump (right to far-left) within same visual row
      if (Math.abs(prev.y - curr.y) < 50 && curr.x < prev.x - 200) {
        issues.push(`Potential reading confusion: "${curr.id}" appears left of "${prev.id}" in the same row`);
      }

      // Very large vertical gap suggesting disconnection
      const gap = curr.y - (prev.y + prev.height);
      if (gap > 200) {
        issues.push(`Large gap (${Math.round(gap)}px) between "${prev.id}" and "${curr.id}" may break narrative flow`);
      }
    }

    // Flow score: 1.0 is perfect top-to-bottom left-to-right flow
    let flowScore = 1.0;
    flowScore -= issues.length * 0.15;
    flowScore = Math.max(0, Math.min(1, flowScore));

    logger.debug('InfographicControls narrative flow calculated', {
      elementCount: elements.length,
      flowScore: flowScore.toFixed(2),
      issues: issues.length,
    });

    return { nodes, readingOrder, flowScore, issues };
  }

  snapToGoldenRatio(element: LayoutElement, container: { width: number; height: number }): SnappedPosition {
    // Golden ratio positions
    const goldenX = container.width / GOLDEN_RATIO;
    const goldenY = container.height / GOLDEN_RATIO;
    const invGoldenX = container.width - goldenX;
    const invGoldenY = container.height - goldenY;

    // Golden ratio dimensions
    const goldenWidth = container.width / GOLDEN_RATIO;
    const goldenHeight = container.height / GOLDEN_RATIO;

    let bestX = element.x;
    let bestY = element.y;
    let bestWidth = element.width;
    let bestHeight = element.height;
    let snapped = false;
    let appliedRule = 'none';

    const snapThreshold = 30;

    // Snap position to golden ratio lines
    const goldenXPositions = [goldenX - element.width / 2, invGoldenX - element.width / 2, 0, container.width - element.width];
    const goldenYPositions = [goldenY - element.height / 2, invGoldenY - element.height / 2, 0, container.height - element.height];

    for (const gx of goldenXPositions) {
      if (Math.abs(element.x - gx) < snapThreshold) {
        bestX = Math.round(gx);
        snapped = true;
        appliedRule = 'golden-ratio-x';
        break;
      }
    }

    for (const gy of goldenYPositions) {
      if (Math.abs(element.y - gy) < snapThreshold) {
        bestY = Math.round(gy);
        snapped = true;
        appliedRule = appliedRule === 'none' ? 'golden-ratio-y' : 'golden-ratio-xy';
        break;
      }
    }

    // Snap dimensions to golden ratio proportions
    if (Math.abs(element.width / element.height - GOLDEN_RATIO) < 0.3) {
      bestWidth = element.width;
      bestHeight = Math.round(element.width / GOLDEN_RATIO);
      snapped = true;
      appliedRule = 'golden-ratio-proportion';
    } else if (Math.abs(element.height / element.width - GOLDEN_RATIO) < 0.3) {
      bestHeight = element.height;
      bestWidth = Math.round(element.height / GOLDEN_RATIO);
      snapped = true;
      appliedRule = 'golden-ratio-proportion-inverse';
    }

    return { x: bestX, y: bestY, width: bestWidth, height: bestHeight, snapped, appliedRule };
  }

  snapToModularGrid(element: LayoutElement, gridSize: number): SnappedPosition {
    const snappedX = Math.round(element.x / gridSize) * gridSize;
    const snappedY = Math.round(element.y / gridSize) * gridSize;
    const snappedWidth = Math.max(gridSize, Math.round(element.width / gridSize) * gridSize);
    const snappedHeight = Math.max(gridSize, Math.round(element.height / gridSize) * gridSize);

    const moved = snappedX !== element.x || snappedY !== element.y || snappedWidth !== element.width || snappedHeight !== element.height;

    return {
      x: snappedX,
      y: snappedY,
      width: snappedWidth,
      height: snappedHeight,
      snapped: moved,
      appliedRule: moved ? `modular-grid-${gridSize}px` : 'none',
    };
  }

  private findLargestWhitespaceRect(occupied: Uint8Array, cols: number, rows: number, gridRes: number): { x: number; y: number; width: number; height: number } {
    // Maximal rectangle in histogram approach
    const heights = new Array(cols).fill(0);
    let maxArea = 0;
    let bestRect = { x: 0, y: 0, width: 0, height: 0 };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        heights[c] = occupied[r * cols + c] ? 0 : heights[c] + 1;
      }

      // Largest rectangle in histogram
      const stack: number[] = [];
      for (let c = 0; c <= cols; c++) {
        const h = c === cols ? 0 : heights[c];
        while (stack.length > 0 && heights[stack[stack.length - 1]] > h) {
          const top = stack.pop()!;
          const width = stack.length === 0 ? c : c - stack[stack.length - 1] - 1;
          const area = heights[top] * width;
          if (area > maxArea) {
            maxArea = area;
            const startC = stack.length === 0 ? 0 : stack[stack.length - 1] + 1;
            bestRect = {
              x: startC * gridRes,
              y: (r - heights[top] + 1) * gridRes,
              width: width * gridRes,
              height: heights[top] * gridRes,
            };
          }
        }
        stack.push(c);
      }
    }

    return bestRect;
  }

  private hexToHSL(hex: string): { h: number; s: number; l: number } {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let s = 0;
    let hue = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: hue = ((b - r) / d + 2) / 6; break;
        case b: hue = ((r - g) / d + 4) / 6; break;
      }
    }

    return { h: Math.round(hue * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  private hslToHex(hsl: { h: number; s: number; l: number }): string {
    const h = hsl.h / 360;
    const s = hsl.s / 100;
    const l = hsl.l / 100;

    const hue2rgb = (p: number, q: number, t: number) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };

    let r: number, g: number, b: number;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    const toHex = (c: number) => {
      const hex = Math.round(c * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private calculateContrastRatio(hex1: string, hex2: string): number {
    const luminance = (hex: string): number => {
      const h = hex.replace('#', '');
      const r = parseInt(h.substring(0, 2), 16) / 255;
      const g = parseInt(h.substring(2, 4), 16) / 255;
      const b = parseInt(h.substring(4, 6), 16) / 255;

      const adjust = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b);
    };

    const l1 = luminance(hex1);
    const l2 = luminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }
}
