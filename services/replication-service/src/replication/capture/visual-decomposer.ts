/**
 * Visual Decomposer
 * Decomposes a visual image into a structured layout description:
 * grid structure, spacing system, baseline typography estimates,
 * element hierarchy, and size ratios.
 */

import sharp from 'sharp';
import { logger } from '../../utils/logger.js';
import { BoundingBox } from '../layers/index.js';
import { extractPixelMatrix } from './pixel-matrix-extractor.js';
import { detectEdges, detectGridLines, detectAlignmentEdges, AlignmentGroup } from './edge-boundary-detector.js';
import { segmentElements, SegmentedElement } from './element-segmenter.js';

/** Grid structure detected from the layout */
export interface GridStructure {
  columns: number;
  rows: number;
  gutters: number[];
  columnWidths: number[];
  rowHeights: number[];
}

/** Spacing system derived from element gaps */
export interface SpacingSystem {
  baseUnit: number;
  spacings: number[];
  horizontalGaps: number[];
  verticalGaps: number[];
}

/** Baseline typography estimate from text element regions */
export interface BaselineTypography {
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  estimatedLineCount: number;
}

/** Size ratios of elements relative to their container */
export interface SizeRatio {
  elementIndex: number;
  bounds: BoundingBox;
  widthRatio: number;
  heightRatio: number;
  areaRatio: number;
}

/** Hierarchical node representing nested elements */
export interface HierarchyNode {
  element: SegmentedElement;
  children: HierarchyNode[];
  depth: number;
}

/** Full decomposed layout result */
export interface DecomposedLayout {
  elements: SegmentedElement[];
  grid: GridStructure;
  spacing: SpacingSystem;
  typography: BaselineTypography;
  hierarchy: HierarchyNode[];
  sizeRatios: SizeRatio[];
  containerWidth: number;
  containerHeight: number;
}

/**
 * Decompose a visual image into a structured layout.
 */
export async function decomposeVisual(imageBuffer: Buffer): Promise<DecomposedLayout> {
  logger.info('Starting visual decomposition');

  const pixelResult = await extractPixelMatrix(imageBuffer);
  const { matrix, width, height } = pixelResult;

  const edges = detectEdges(matrix, width, height);
  const elements = await segmentElements(imageBuffer, edges);

  const grid = detectGrid(elements, width, height);
  const spacing = discoverSpacingSystem(elements);
  const textElements = elements.filter(e => e.type === 'text');
  const typography = determineBaselineTypography(textElements);
  const hierarchy = extractHierarchy(elements);
  const sizeRatios = calculateSizeRatios(elements, { x: 0, y: 0, width, height });

  logger.info('Visual decomposition complete', {
    elementCount: elements.length,
    columns: grid.columns,
    rows: grid.rows,
    baseSpacingUnit: spacing.baseUnit,
  });

  return {
    elements,
    grid,
    spacing,
    typography,
    hierarchy,
    sizeRatios,
    containerWidth: width,
    containerHeight: height,
  };
}

/**
 * Detect grid structure from element positions.
 * Groups element edges into column and row tracks.
 */
export function detectGrid(
  elements: SegmentedElement[],
  containerWidth: number,
  containerHeight: number
): GridStructure {
  if (elements.length === 0) {
    return { columns: 1, rows: 1, gutters: [], columnWidths: [containerWidth], rowHeights: [containerHeight] };
  }

  // Collect unique x-positions (left edges) and y-positions (top edges)
  const leftEdges = elements.map(e => e.bounds.x).sort((a, b) => a - b);
  const topEdges = elements.map(e => e.bounds.y).sort((a, b) => a - b);

  // Cluster positions to find column and row tracks
  const columnPositions = clusterValues(leftEdges, containerWidth * 0.03);
  const rowPositions = clusterValues(topEdges, containerHeight * 0.03);

  // Compute column widths from element right edges
  const rightEdges = elements.map(e => e.bounds.x + e.bounds.width).sort((a, b) => a - b);
  const columnRightPositions = clusterValues(rightEdges, containerWidth * 0.03);

  const columnWidths: number[] = [];
  for (let i = 0; i < columnPositions.length; i++) {
    const right = columnRightPositions[i] ?? containerWidth;
    columnWidths.push(right - columnPositions[i]);
  }

  // Compute row heights from element bottom edges
  const bottomEdges = elements.map(e => e.bounds.y + e.bounds.height).sort((a, b) => a - b);
  const rowBottomPositions = clusterValues(bottomEdges, containerHeight * 0.03);

  const rowHeights: number[] = [];
  for (let i = 0; i < rowPositions.length; i++) {
    const bottom = rowBottomPositions[i] ?? containerHeight;
    rowHeights.push(bottom - rowPositions[i]);
  }

  // Compute gutters (gaps between consecutive columns)
  const gutters: number[] = [];
  for (let i = 1; i < columnPositions.length; i++) {
    const prevRight = columnPositions[i - 1] + (columnWidths[i - 1] ?? 0);
    const gutter = columnPositions[i] - prevRight;
    if (gutter > 0) gutters.push(gutter);
  }

  return {
    columns: columnPositions.length,
    rows: rowPositions.length,
    gutters,
    columnWidths,
    rowHeights,
  };
}

/**
 * Cluster sorted numeric values within a tolerance.
 * Returns the mean of each cluster.
 */
function clusterValues(sorted: number[], tolerance: number): number[] {
  if (sorted.length === 0) return [];

  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const lastCluster = clusters[clusters.length - 1];
    const lastMean = lastCluster.reduce((s, v) => s + v, 0) / lastCluster.length;
    if (Math.abs(sorted[i] - lastMean) <= tolerance) {
      lastCluster.push(sorted[i]);
    } else {
      clusters.push([sorted[i]]);
    }
  }

  return clusters.map(c => c.reduce((s, v) => s + v, 0) / c.length);
}

/**
 * Discover the spacing system by analyzing gaps between elements.
 * Finds the greatest common divisor of frequent gap sizes to determine the base unit.
 */
export function discoverSpacingSystem(elements: SegmentedElement[]): SpacingSystem {
  if (elements.length < 2) {
    return { baseUnit: 8, spacings: [8], horizontalGaps: [], verticalGaps: [] };
  }

  const horizontalGaps: number[] = [];
  const verticalGaps: number[] = [];

  // Sort by position for gap detection
  const byX = [...elements].sort((a, b) => a.bounds.x - b.bounds.x);
  const byY = [...elements].sort((a, b) => a.bounds.y - b.bounds.y);

  // Find horizontal gaps between horizontally adjacent elements
  for (let i = 0; i < byX.length - 1; i++) {
    for (let j = i + 1; j < byX.length; j++) {
      const a = byX[i];
      const b = byX[j];
      // Check vertical overlap
      const overlapY = Math.min(a.bounds.y + a.bounds.height, b.bounds.y + b.bounds.height) -
                        Math.max(a.bounds.y, b.bounds.y);
      if (overlapY > 0) {
        const gap = b.bounds.x - (a.bounds.x + a.bounds.width);
        if (gap > 0 && gap < 200) horizontalGaps.push(Math.round(gap));
      }
    }
  }

  // Find vertical gaps between vertically adjacent elements
  for (let i = 0; i < byY.length - 1; i++) {
    for (let j = i + 1; j < byY.length; j++) {
      const a = byY[i];
      const b = byY[j];
      // Check horizontal overlap
      const overlapX = Math.min(a.bounds.x + a.bounds.width, b.bounds.x + b.bounds.width) -
                        Math.max(a.bounds.x, b.bounds.x);
      if (overlapX > 0) {
        const gap = b.bounds.y - (a.bounds.y + a.bounds.height);
        if (gap > 0 && gap < 200) verticalGaps.push(Math.round(gap));
      }
    }
  }

  const allGaps = [...horizontalGaps, ...verticalGaps].filter(g => g > 0);

  // Find base unit as approximate GCD of common gaps
  const baseUnit = allGaps.length > 0 ? approximateGCD(allGaps) : 8;

  // Derive the spacing scale as unique multiples of the base unit
  const spacingSet = new Set<number>();
  for (const gap of allGaps) {
    const multiple = Math.round(gap / baseUnit) * baseUnit;
    if (multiple > 0) spacingSet.add(multiple);
  }
  const spacings = [...spacingSet].sort((a, b) => a - b);

  return {
    baseUnit: Math.max(baseUnit, 1),
    spacings: spacings.length > 0 ? spacings : [baseUnit],
    horizontalGaps,
    verticalGaps,
  };
}

/**
 * Approximate GCD of an array of numbers using the Euclidean algorithm
 * with rounding tolerance for pixel measurements.
 */
function approximateGCD(values: number[]): number {
  function gcd(a: number, b: number): number {
    a = Math.round(a);
    b = Math.round(b);
    while (b !== 0) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = gcd(result, values[i]);
    if (result <= 1) return 1;
  }
  return Math.max(result, 1);
}

/**
 * Determine baseline typography estimates from text element regions.
 * Uses region height as a proxy for font size, with heuristic adjustments.
 */
export function determineBaselineTypography(
  textElements: SegmentedElement[]
): BaselineTypography {
  if (textElements.length === 0) {
    return { fontSize: 16, lineHeight: 1.5, fontWeight: 400, estimatedLineCount: 0 };
  }

  // Collect text region heights — a rough proxy for line height
  const heights = textElements.map(e => e.bounds.height).sort((a, b) => a - b);

  // Use median height as the most representative text line height
  const medianHeight = heights[Math.floor(heights.length / 2)];

  // Font size is typically ~70% of line height in rendered text
  const fontSize = Math.round(medianHeight * 0.7);

  // Line height ratio: total height / estimated single line
  const lineHeight = medianHeight > 0 ? parseFloat((medianHeight / Math.max(fontSize, 1)).toFixed(2)) : 1.5;

  // Estimate font weight from average confidence (higher contrast = bolder text)
  const avgConfidence = textElements.reduce((s, e) => s + e.confidence, 0) / textElements.length;
  const fontWeight = avgConfidence > 0.8 ? 700 : avgConfidence > 0.6 ? 500 : 400;

  // Estimate total line count across all text blocks
  const estimatedLineCount = textElements.reduce((sum, e) => {
    const lines = Math.max(1, Math.round(e.bounds.height / medianHeight));
    return sum + lines;
  }, 0);

  return { fontSize, lineHeight, fontWeight, estimatedLineCount };
}

/**
 * Extract a hierarchy of elements based on spatial containment.
 * An element A is a child of element B if A's bounds are fully contained within B.
 */
export function extractHierarchy(elements: SegmentedElement[]): HierarchyNode[] {
  // Sort by area descending so larger (potential parents) come first
  const sorted = [...elements].sort(
    (a, b) => (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height)
  );

  const nodes: HierarchyNode[] = sorted.map(e => ({ element: e, children: [], depth: 0 }));
  const assigned = new Set<number>();

  for (let i = 0; i < nodes.length; i++) {
    if (assigned.has(i)) continue;

    for (let j = i + 1; j < nodes.length; j++) {
      if (assigned.has(j)) continue;

      if (isContained(nodes[j].element.bounds, nodes[i].element.bounds)) {
        nodes[j].depth = nodes[i].depth + 1;
        nodes[i].children.push(nodes[j]);
        assigned.add(j);
      }
    }
  }

  // Return only root-level nodes (not assigned as children)
  return nodes.filter((_, i) => !assigned.has(i));
}

/**
 * Check if inner bounding box is fully contained within outer.
 */
function isContained(inner: BoundingBox, outer: BoundingBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Calculate size ratios of each element relative to the container.
 */
export function calculateSizeRatios(
  elements: SegmentedElement[],
  container: BoundingBox
): SizeRatio[] {
  const containerArea = container.width * container.height;

  return elements.map((el, index) => ({
    elementIndex: index,
    bounds: el.bounds,
    widthRatio: container.width > 0 ? el.bounds.width / container.width : 0,
    heightRatio: container.height > 0 ? el.bounds.height / container.height : 0,
    areaRatio: containerArea > 0 ? (el.bounds.width * el.bounds.height) / containerArea : 0,
  }));
}
