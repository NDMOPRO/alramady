/**
 * Visual Layout Fingerprint Engine
 * Generates deterministic fingerprints from decomposed layouts,
 * producing a VisualFingerprint that encodes spatial relationships,
 * typography ratios, and layout graph hashes. Supports fingerprint
 * comparison for similarity scoring.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { BoundingBox } from '../layers/index.js';
import { SegmentedElement } from '../capture/element-segmenter.js';
import {
  DecomposedLayout,
  GridStructure,
  SpacingSystem,
  BaselineTypography,
  SizeRatio,
} from '../capture/visual-decomposer.js';

/** Complete visual fingerprint of a layout */
export interface VisualFingerprint {
  /** SHA-256 hash of serialized element positions and sizes */
  layoutGraphHash: string;
  /** 2D matrix of element-to-element distance ratios */
  spatialConstraintMatrix: number[][];
  /** Font size / weight / spacing ratios normalized to container */
  typographyRatioMatrix: TypographyRatioEntry[];
  /** Grid structure fingerprint */
  gridSignature: string;
  /** Spacing system fingerprint */
  spacingSignature: string;
  /** Combined fingerprint hash */
  combinedHash: string;
  /** Timestamp of fingerprint generation */
  timestamp: number;
}

/** A single entry in the typography ratio matrix */
export interface TypographyRatioEntry {
  /** Ratio of font size to container height */
  fontSizeRatio: number;
  /** Ratio of line height to font size */
  lineHeightRatio: number;
  /** Normalized font weight (0–1 scale, where 400=0.44, 700=0.78, 900=1.0) */
  normalizedWeight: number;
  /** Ratio of text block width to container width */
  blockWidthRatio: number;
  /** Ratio of text block height to container height */
  blockHeightRatio: number;
}

/** Result of comparing two fingerprints */
export interface FingerprintComparison {
  /** Overall similarity score 0–1 */
  overall: number;
  /** Spatial constraint matrix similarity 0–1 */
  spatialSimilarity: number;
  /** Typography similarity 0–1 */
  typographySimilarity: number;
  /** Grid structure similarity 0–1 */
  gridSimilarity: number;
  /** Whether layout graph hashes match exactly */
  exactLayoutMatch: boolean;
}

/**
 * Generate a visual fingerprint from a decomposed layout.
 */
export function generateFingerprint(
  layout: DecomposedLayout
): VisualFingerprint {
  const { elements, grid, spacing, typography, sizeRatios, containerWidth, containerHeight } = layout;

  logger.info('Generating visual layout fingerprint', {
    elementCount: elements.length,
    containerWidth,
    containerHeight,
  });

  const layoutGraphHash = computeLayoutGraphHash(elements, containerWidth, containerHeight);
  const spatialConstraintMatrix = computeSpatialConstraintMatrix(elements, containerWidth, containerHeight);
  const typographyRatioMatrix = computeTypographyRatioMatrix(
    elements, typography, containerWidth, containerHeight
  );
  const gridSignature = computeGridSignature(grid);
  const spacingSignature = computeSpacingSignature(spacing);

  // Combined hash of all fingerprint components
  const combinedHash = computeCombinedHash(
    layoutGraphHash, spatialConstraintMatrix, typographyRatioMatrix, gridSignature, spacingSignature
  );

  logger.info('Visual fingerprint generated', { combinedHash: combinedHash.slice(0, 16) });

  return {
    layoutGraphHash,
    spatialConstraintMatrix,
    typographyRatioMatrix,
    gridSignature,
    spacingSignature,
    combinedHash,
    timestamp: Date.now(),
  };
}

/**
 * Compute SHA-256 hash of serialized element positions and sizes,
 * normalized to container dimensions for scale independence.
 */
function computeLayoutGraphHash(
  elements: SegmentedElement[],
  containerWidth: number,
  containerHeight: number
): string {
  const hash = crypto.createHash('sha256');

  // Sort elements deterministically by position then size
  const sorted = [...elements].sort((a, b) => {
    const ay = a.bounds.y / containerHeight;
    const by = b.bounds.y / containerHeight;
    if (Math.abs(ay - by) > 0.01) return ay - by;
    const ax = a.bounds.x / containerWidth;
    const bx = b.bounds.x / containerWidth;
    if (Math.abs(ax - bx) > 0.01) return ax - bx;
    return (a.bounds.width * a.bounds.height) - (b.bounds.width * b.bounds.height);
  });

  for (const el of sorted) {
    // Normalize positions to 0–1 range and quantize to 4 decimal places
    const nx = (el.bounds.x / containerWidth).toFixed(4);
    const ny = (el.bounds.y / containerHeight).toFixed(4);
    const nw = (el.bounds.width / containerWidth).toFixed(4);
    const nh = (el.bounds.height / containerHeight).toFixed(4);
    hash.update(`${el.type}:${nx},${ny},${nw},${nh};`);
  }

  return hash.digest('hex');
}

/**
 * Compute a 2D matrix of normalized element-to-element distance ratios.
 * matrix[i][j] = distance(center_i, center_j) / max_diagonal
 */
function computeSpatialConstraintMatrix(
  elements: SegmentedElement[],
  containerWidth: number,
  containerHeight: number
): number[][] {
  const n = elements.length;
  const maxDiag = Math.sqrt(containerWidth * containerWidth + containerHeight * containerHeight);
  if (n === 0 || maxDiag === 0) return [];

  // Compute centers
  const centers = elements.map(e => ({
    cx: e.bounds.x + e.bounds.width / 2,
    cy: e.bounds.y + e.bounds.height / 2,
  }));

  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = centers[j].cx - centers[i].cx;
      const dy = centers[j].cy - centers[i].cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxDiag;
      const quantized = parseFloat(dist.toFixed(6));
      matrix[i][j] = quantized;
      matrix[j][i] = quantized;
    }
  }

  return matrix;
}

/**
 * Compute typography ratio entries for text elements.
 */
function computeTypographyRatioMatrix(
  elements: SegmentedElement[],
  typography: BaselineTypography,
  containerWidth: number,
  containerHeight: number
): TypographyRatioEntry[] {
  const textElements = elements.filter(e => e.type === 'text');

  return textElements.map(el => {
    const fontSizeRatio = containerHeight > 0
      ? typography.fontSize / containerHeight
      : 0;

    const lineHeightRatio = typography.fontSize > 0
      ? typography.lineHeight
      : 1.5;

    // Normalize weight to 0–1 (100–900 → 0.11–1.0)
    const normalizedWeight = typography.fontWeight / 900;

    const blockWidthRatio = containerWidth > 0
      ? el.bounds.width / containerWidth
      : 0;

    const blockHeightRatio = containerHeight > 0
      ? el.bounds.height / containerHeight
      : 0;

    return {
      fontSizeRatio: parseFloat(fontSizeRatio.toFixed(6)),
      lineHeightRatio: parseFloat(lineHeightRatio.toFixed(4)),
      normalizedWeight: parseFloat(normalizedWeight.toFixed(4)),
      blockWidthRatio: parseFloat(blockWidthRatio.toFixed(6)),
      blockHeightRatio: parseFloat(blockHeightRatio.toFixed(6)),
    };
  });
}

/**
 * Create a deterministic signature string for the grid structure.
 */
function computeGridSignature(grid: GridStructure): string {
  const hash = crypto.createHash('sha256');
  hash.update(`cols:${grid.columns};rows:${grid.rows};`);
  hash.update(`gutters:${grid.gutters.map(g => g.toFixed(1)).join(',')};`);
  hash.update(`colW:${grid.columnWidths.map(w => w.toFixed(1)).join(',')};`);
  hash.update(`rowH:${grid.rowHeights.map(h => h.toFixed(1)).join(',')};`);
  return hash.digest('hex');
}

/**
 * Create a deterministic signature string for the spacing system.
 */
function computeSpacingSignature(spacing: SpacingSystem): string {
  const hash = crypto.createHash('sha256');
  hash.update(`base:${spacing.baseUnit};`);
  hash.update(`scale:${spacing.spacings.join(',')};`);
  return hash.digest('hex');
}

/**
 * Compute a combined hash of all fingerprint components.
 */
function computeCombinedHash(
  layoutGraphHash: string,
  spatialMatrix: number[][],
  typographyMatrix: TypographyRatioEntry[],
  gridSignature: string,
  spacingSignature: string
): string {
  const hash = crypto.createHash('sha256');
  hash.update(layoutGraphHash);
  hash.update(gridSignature);
  hash.update(spacingSignature);

  // Serialize spatial matrix
  for (const row of spatialMatrix) {
    hash.update(row.map(v => v.toFixed(6)).join(','));
  }

  // Serialize typography matrix
  for (const entry of typographyMatrix) {
    hash.update(
      `${entry.fontSizeRatio},${entry.lineHeightRatio},${entry.normalizedWeight},` +
      `${entry.blockWidthRatio},${entry.blockHeightRatio}`
    );
  }

  return hash.digest('hex');
}

/**
 * Compare two visual fingerprints and produce a similarity score.
 */
export function compareFingerprints(
  a: VisualFingerprint,
  b: VisualFingerprint
): FingerprintComparison {
  logger.info('Comparing visual fingerprints');

  const exactLayoutMatch = a.layoutGraphHash === b.layoutGraphHash;
  const spatialSimilarity = compareSpatialMatrices(a.spatialConstraintMatrix, b.spatialConstraintMatrix);
  const typographySimilarity = compareTypographyMatrices(a.typographyRatioMatrix, b.typographyRatioMatrix);
  const gridSimilarity = a.gridSignature === b.gridSignature ? 1.0 : computeGridSimilarity(a, b);

  // Weighted overall score
  const overall = (
    (exactLayoutMatch ? 0.3 : 0) +
    spatialSimilarity * 0.35 +
    typographySimilarity * 0.2 +
    gridSimilarity * 0.15
  );

  logger.info('Fingerprint comparison complete', {
    overall: overall.toFixed(4),
    exactLayoutMatch,
  });

  return {
    overall: parseFloat(overall.toFixed(6)),
    spatialSimilarity: parseFloat(spatialSimilarity.toFixed(6)),
    typographySimilarity: parseFloat(typographySimilarity.toFixed(6)),
    gridSimilarity: parseFloat(gridSimilarity.toFixed(6)),
    exactLayoutMatch,
  };
}

/**
 * Compare two spatial constraint matrices using Frobenius norm of differences.
 * Returns similarity 0–1.
 */
function compareSpatialMatrices(a: number[][], b: number[][]): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  // Use the smaller matrix size for comparison
  const n = Math.min(a.length, b.length);
  let sumSqDiff = 0;
  let count = 0;

  for (let i = 0; i < n; i++) {
    const rowA = a[i];
    const rowB = b[i];
    const m = Math.min(rowA.length, rowB.length);
    for (let j = 0; j < m; j++) {
      const diff = rowA[j] - rowB[j];
      sumSqDiff += diff * diff;
      count++;
    }
  }

  if (count === 0) return 1.0;

  // RMS difference, converted to similarity
  const rmsDiff = Math.sqrt(sumSqDiff / count);
  // Max possible distance ratio is ~1.414 (diagonal), so normalize
  const similarity = Math.max(0, 1 - rmsDiff / 1.414);
  return similarity;
}

/**
 * Compare two typography ratio matrices.
 */
function compareTypographyMatrices(
  a: TypographyRatioEntry[],
  b: TypographyRatioEntry[]
): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const n = Math.min(a.length, b.length);
  let totalSimilarity = 0;

  for (let i = 0; i < n; i++) {
    const ea = a[i];
    const eb = b[i];

    const fontDiff = Math.abs(ea.fontSizeRatio - eb.fontSizeRatio);
    const lhDiff = Math.abs(ea.lineHeightRatio - eb.lineHeightRatio);
    const wDiff = Math.abs(ea.normalizedWeight - eb.normalizedWeight);
    const bwDiff = Math.abs(ea.blockWidthRatio - eb.blockWidthRatio);
    const bhDiff = Math.abs(ea.blockHeightRatio - eb.blockHeightRatio);

    // Weighted distance
    const distance = fontDiff * 0.3 + lhDiff * 0.15 + wDiff * 0.15 + bwDiff * 0.2 + bhDiff * 0.2;
    totalSimilarity += Math.max(0, 1 - distance);
  }

  // Penalize for different number of text elements
  const sizePenalty = 1 - Math.abs(a.length - b.length) / Math.max(a.length, b.length);

  return (totalSimilarity / n) * sizePenalty;
}

/**
 * Compute approximate grid similarity when signatures don't match exactly.
 */
function computeGridSimilarity(a: VisualFingerprint, b: VisualFingerprint): number {
  // If grid signatures are identical, return 1 (handled by caller)
  // Otherwise, compare spatial matrix density as a rough proxy
  const sizeA = a.spatialConstraintMatrix.length;
  const sizeB = b.spatialConstraintMatrix.length;

  if (sizeA === 0 && sizeB === 0) return 1.0;
  if (sizeA === 0 || sizeB === 0) return 0.0;

  // Penalize based on element count difference
  const countSimilarity = Math.min(sizeA, sizeB) / Math.max(sizeA, sizeB);

  // Compare overall density of spatial matrices
  const densityA = matrixMean(a.spatialConstraintMatrix);
  const densityB = matrixMean(b.spatialConstraintMatrix);
  const densitySimilarity = 1 - Math.abs(densityA - densityB);

  return countSimilarity * 0.5 + densitySimilarity * 0.5;
}

/**
 * Compute the mean of all values in a 2D matrix.
 */
function matrixMean(matrix: number[][]): number {
  let sum = 0;
  let count = 0;
  for (const row of matrix) {
    for (const val of row) {
      sum += val;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}
