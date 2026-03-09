/**
 * RTL Score Validator
 * Validates that an RTL transformation maintains visual fidelity
 * by scoring hierarchy balance, density, and visual tension.
 */

import { logger } from '../../utils/logger.js';

/** Element position for validation */
export interface PositionedElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  depth: number;
  children: string[];
}

/** RTL transformation score */
export interface RTLScore {
  hierarchyBalance: number;
  densityScore: number;
  visualTension: number;
  passed: boolean;
  recommendations: AdjustmentRecommendation[];
}

/** Recommendation for fixing a failing score */
export interface AdjustmentRecommendation {
  metric: 'hierarchyBalance' | 'densityScore' | 'visualTension';
  currentValue: number;
  targetValue: number;
  suggestion: string;
  affectedElements: string[];
}

const PASS_THRESHOLD = 0.9;

/**
 * Computes hierarchy balance by comparing the weighted center of mass
 * at each depth level between original and transformed layouts.
 */
function computeHierarchyBalance(
  original: PositionedElement[],
  transformed: PositionedElement[]
): { score: number; affectedElements: string[] } {
  if (original.length === 0 || transformed.length === 0) {
    return { score: 1.0, affectedElements: [] };
  }

  const depthGroups = new Map<number, { orig: PositionedElement[]; trans: PositionedElement[] }>();

  for (const el of original) {
    const group = depthGroups.get(el.depth) ?? { orig: [], trans: [] };
    group.orig.push(el);
    depthGroups.set(el.depth, group);
  }

  for (const el of transformed) {
    const group = depthGroups.get(el.depth) ?? { orig: [], trans: [] };
    group.trans.push(el);
    depthGroups.set(el.depth, group);
  }

  let totalScore = 0;
  let groupCount = 0;
  const affected: string[] = [];

  for (const [depth, group] of depthGroups) {
    if (group.orig.length === 0 || group.trans.length === 0) continue;

    const origCenterX = group.orig.reduce((s, e) => s + e.x + e.width / 2, 0) / group.orig.length;
    const transCenterX = group.trans.reduce((s, e) => s + e.x + e.width / 2, 0) / group.trans.length;

    const origTotalWidth = Math.max(...group.orig.map(e => e.x + e.width)) - Math.min(...group.orig.map(e => e.x));
    const transTotalWidth = Math.max(...group.trans.map(e => e.x + e.width)) - Math.min(...group.trans.map(e => e.x));

    const maxWidth = Math.max(origTotalWidth, transTotalWidth, 1);
    const widthRatio = Math.min(origTotalWidth, transTotalWidth) / maxWidth;

    const origSpread = group.orig.length > 1
      ? Math.sqrt(group.orig.reduce((s, e) => s + Math.pow(e.x + e.width / 2 - origCenterX, 2), 0) / group.orig.length)
      : 0;
    const transSpread = group.trans.length > 1
      ? Math.sqrt(group.trans.reduce((s, e) => s + Math.pow(e.x + e.width / 2 - transCenterX, 2), 0) / group.trans.length)
      : 0;

    const maxSpread = Math.max(origSpread, transSpread, 1);
    const spreadRatio = 1 - Math.abs(origSpread - transSpread) / maxSpread;

    const groupScore = (widthRatio + spreadRatio) / 2;
    totalScore += groupScore;
    groupCount++;

    if (groupScore < PASS_THRESHOLD) {
      affected.push(...group.trans.map(e => e.id));
    }
  }

  const finalScore = groupCount > 0 ? totalScore / groupCount : 1.0;
  return { score: Math.min(finalScore, 1.0), affectedElements: affected };
}

/**
 * Computes density score by comparing occupied area ratios in spatial quadrants.
 */
function computeDensityScore(
  original: PositionedElement[],
  transformed: PositionedElement[]
): { score: number; affectedElements: string[] } {
  if (original.length === 0 || transformed.length === 0) {
    return { score: 1.0, affectedElements: [] };
  }

  const origBounds = getBounds(original);
  const transBounds = getBounds(transformed);

  const quadrantScores: number[] = [];
  const affected: string[] = [];

  for (let qy = 0; qy < 2; qy++) {
    for (let qx = 0; qx < 2; qx++) {
      const origQuadArea = quadrantOccupancy(original, origBounds, qx, qy);
      const transQuadArea = quadrantOccupancy(transformed, transBounds, qx, qy);

      const maxArea = Math.max(origQuadArea, transQuadArea, 0.001);
      const minArea = Math.min(origQuadArea, transQuadArea);
      const ratio = minArea / maxArea;

      quadrantScores.push(ratio);

      if (ratio < PASS_THRESHOLD) {
        const transInQuad = elementsInQuadrant(transformed, transBounds, qx, qy);
        affected.push(...transInQuad.map(e => e.id));
      }
    }
  }

  const avgScore = quadrantScores.reduce((s, v) => s + v, 0) / quadrantScores.length;
  return { score: Math.min(avgScore, 1.0), affectedElements: affected };
}

/**
 * Computes visual tension as the consistency of spacing patterns.
 */
function computeVisualTension(
  original: PositionedElement[],
  transformed: PositionedElement[]
): { score: number; affectedElements: string[] } {
  if (original.length < 2 || transformed.length < 2) {
    return { score: 1.0, affectedElements: [] };
  }

  const origSpacings = computeSpacings(original);
  const transSpacings = computeSpacings(transformed);

  if (origSpacings.length === 0 || transSpacings.length === 0) {
    return { score: 1.0, affectedElements: [] };
  }

  const origStdDev = stdDev(origSpacings);
  const transStdDev = stdDev(transSpacings);
  const maxStdDev = Math.max(origStdDev, transStdDev, 0.001);
  const stdDevRatio = 1 - Math.abs(origStdDev - transStdDev) / maxStdDev;

  const origMean = mean(origSpacings);
  const transMean = mean(transSpacings);
  const maxMean = Math.max(origMean, transMean, 0.001);
  const meanRatio = 1 - Math.abs(origMean - transMean) / maxMean;

  const score = (stdDevRatio * 0.6 + meanRatio * 0.4);
  const affected = score < PASS_THRESHOLD ? transformed.map(e => e.id) : [];

  return { score: Math.min(score, 1.0), affectedElements: affected };
}

function getBounds(elements: PositionedElement[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(...elements.map(e => e.x)),
    minY: Math.min(...elements.map(e => e.y)),
    maxX: Math.max(...elements.map(e => e.x + e.width)),
    maxY: Math.max(...elements.map(e => e.y + e.height)),
  };
}

function quadrantOccupancy(
  elements: PositionedElement[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  qx: number,
  qy: number
): number {
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const qMinX = qx === 0 ? bounds.minX : midX;
  const qMaxX = qx === 0 ? midX : bounds.maxX;
  const qMinY = qy === 0 ? bounds.minY : midY;
  const qMaxY = qy === 0 ? midY : bounds.maxY;

  let totalArea = 0;
  for (const el of elements) {
    const overlapX = Math.max(0, Math.min(el.x + el.width, qMaxX) - Math.max(el.x, qMinX));
    const overlapY = Math.max(0, Math.min(el.y + el.height, qMaxY) - Math.max(el.y, qMinY));
    totalArea += overlapX * overlapY;
  }

  const quadrantArea = (qMaxX - qMinX) * (qMaxY - qMinY);
  return quadrantArea > 0 ? totalArea / quadrantArea : 0;
}

function elementsInQuadrant(
  elements: PositionedElement[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  qx: number,
  qy: number
): PositionedElement[] {
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const centerTest = (el: PositionedElement) => {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const inX = qx === 0 ? cx < midX : cx >= midX;
    const inY = qy === 0 ? cy < midY : cy >= midY;
    return inX && inY;
  };
  return elements.filter(centerTest);
}

function computeSpacings(elements: PositionedElement[]): number[] {
  const sorted = [...elements].sort((a, b) => a.x - b.x);
  const spacings: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    spacings.push(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width));
  }
  return spacings;
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + Math.pow(v - m, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Validates an RTL transformation by scoring hierarchy balance, density,
 * and visual tension. All scores must be >= 0.9 to pass.
 */
export function validateRTLTransformation(
  original: PositionedElement[],
  transformed: PositionedElement[]
): RTLScore {
  logger.info('Validating RTL transformation', {
    originalElements: original.length,
    transformedElements: transformed.length,
  });

  const hierarchy = computeHierarchyBalance(original, transformed);
  const density = computeDensityScore(original, transformed);
  const tension = computeVisualTension(original, transformed);

  const recommendations: AdjustmentRecommendation[] = [];

  if (hierarchy.score < PASS_THRESHOLD) {
    recommendations.push({
      metric: 'hierarchyBalance',
      currentValue: hierarchy.score,
      targetValue: PASS_THRESHOLD,
      suggestion: 'Adjust element widths and positions at failing depth levels to restore symmetrical distribution',
      affectedElements: hierarchy.affectedElements,
    });
  }

  if (density.score < PASS_THRESHOLD) {
    recommendations.push({
      metric: 'densityScore',
      currentValue: density.score,
      targetValue: PASS_THRESHOLD,
      suggestion: 'Redistribute elements to equalize visual density across quadrants after mirroring',
      affectedElements: density.affectedElements,
    });
  }

  if (tension.score < PASS_THRESHOLD) {
    recommendations.push({
      metric: 'visualTension',
      currentValue: tension.score,
      targetValue: PASS_THRESHOLD,
      suggestion: 'Normalize inter-element spacing to match original spacing distribution pattern',
      affectedElements: tension.affectedElements,
    });
  }

  const passed = hierarchy.score >= PASS_THRESHOLD &&
                 density.score >= PASS_THRESHOLD &&
                 tension.score >= PASS_THRESHOLD;

  logger.info('RTL validation complete', {
    hierarchyBalance: hierarchy.score,
    densityScore: density.score,
    visualTension: tension.score,
    passed,
    recommendations: recommendations.length,
  });

  return {
    hierarchyBalance: hierarchy.score,
    densityScore: density.score,
    visualTension: tension.score,
    passed,
    recommendations,
  };
}
