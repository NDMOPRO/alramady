/**
 * Axis Mirroring Engine
 * Inverts chart axes mathematically for RTL layouts while preserving
 * visual density, tick distribution symmetry, and label spacing ratios.
 */

import { logger } from '../../utils/logger.js';

/** Axis configuration */
export interface AxisConfig {
  id: string;
  type: 'x' | 'y';
  position: 'top' | 'bottom' | 'left' | 'right';
  min: number;
  max: number;
  ticks: TickConfig[];
  labels: AxisLabelConfig[];
  title: string;
  titlePosition: number;
  gridlines: AxisGridline[];
  length: number;
  direction: 'ltr' | 'rtl';
}

/** Tick mark configuration */
export interface TickConfig {
  value: number;
  position: number;
  major: boolean;
  label: string;
}

/** Axis label configuration */
export interface AxisLabelConfig {
  text: string;
  position: number;
  rotation: number;
  anchor: 'start' | 'middle' | 'end';
}

/** Axis gridline */
export interface AxisGridline {
  position: number;
  color: string;
  width: number;
  opacity: number;
}

/** Mirrored axis result */
export interface MirroredAxis {
  config: AxisConfig;
  metrics: MirrorMetrics;
}

/** Metrics about the mirroring quality */
export interface MirrorMetrics {
  tickDistributionSymmetry: number;
  labelSpacingRatioPreserved: boolean;
  visualDensityPreserved: boolean;
  originalDensity: number;
  mirroredDensity: number;
}

/**
 * Computes tick distribution symmetry by comparing the spacing regularity.
 * Returns 1.0 for perfectly symmetric distribution.
 */
function computeTickSymmetry(originalTicks: TickConfig[], mirroredTicks: TickConfig[], axisLength: number): number {
  if (originalTicks.length < 2 || mirroredTicks.length < 2) return 1.0;

  const origSpacings = computeSpacings(originalTicks.map(t => t.position));
  const mirSpacings = computeSpacings(mirroredTicks.map(t => t.position));

  if (origSpacings.length === 0) return 1.0;

  const origStdDev = standardDeviation(origSpacings);
  const mirStdDev = standardDeviation(mirSpacings);

  const maxDev = Math.max(origStdDev, mirStdDev, 0.001);
  const deviationRatio = 1 - Math.abs(origStdDev - mirStdDev) / maxDev;

  const origMean = mean(origSpacings);
  const mirMean = mean(mirSpacings);
  const maxMean = Math.max(origMean, mirMean, 0.001);
  const meanRatio = 1 - Math.abs(origMean - mirMean) / maxMean;

  return Math.min((deviationRatio * 0.5 + meanRatio * 0.5), 1.0);
}

/**
 * Checks whether label spacing ratios are preserved after mirroring.
 */
function checkLabelSpacingPreserved(
  originalLabels: AxisLabelConfig[],
  mirroredLabels: AxisLabelConfig[]
): boolean {
  if (originalLabels.length < 2) return true;

  const origSpacings = computeSpacings(originalLabels.map(l => l.position));
  const mirSpacings = computeSpacings(mirroredLabels.map(l => l.position));

  if (origSpacings.length !== mirSpacings.length) return false;

  const tolerance = 1.0;

  for (let i = 0; i < origSpacings.length; i++) {
    if (Math.abs(origSpacings[i] - mirSpacings[i]) > tolerance) {
      return false;
    }
  }

  return true;
}

/**
 * Computes visual density as the number of visual elements per unit length.
 */
function computeVisualDensity(ticks: TickConfig[], labels: AxisLabelConfig[], gridlines: AxisGridline[], length: number): number {
  if (length === 0) return 0;
  const totalElements = ticks.length + labels.length + gridlines.length;
  return totalElements / length;
}

/**
 * Computes spacings between sorted positions.
 */
function computeSpacings(positions: number[]): number[] {
  const sorted = [...positions].sort((a, b) => a - b);
  const spacings: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    spacings.push(Math.abs(sorted[i] - sorted[i - 1]));
  }
  return spacings;
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + Math.pow(v - m, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Mirrors a single tick position on the axis.
 */
function mirrorTick(tick: TickConfig, axisLength: number): TickConfig {
  return {
    ...tick,
    position: axisLength - tick.position,
  };
}

/**
 * Mirrors a label, flipping position and adjusting anchor.
 */
function mirrorLabel(label: AxisLabelConfig, axisLength: number): AxisLabelConfig {
  const anchorMap: Record<string, 'start' | 'middle' | 'end'> = {
    start: 'end',
    end: 'start',
    middle: 'middle',
  };

  return {
    ...label,
    position: axisLength - label.position,
    anchor: anchorMap[label.anchor] ?? 'middle',
  };
}

/**
 * Mirrors a gridline position.
 */
function mirrorGridline(gridline: AxisGridline, axisLength: number): AxisGridline {
  return {
    ...gridline,
    position: axisLength - gridline.position,
  };
}

/**
 * Mirrors an axis configuration for RTL/LTR direction change.
 * For X-axes: inverts positions mathematically.
 * For Y-axes: swaps left/right positioning.
 * Preserves visual density, tick distribution symmetry, and label spacing ratios.
 */
export function mirrorAxis(axisConfig: AxisConfig, direction: 'ltr' | 'rtl'): MirroredAxis {
  logger.info('Mirroring axis', {
    axisId: axisConfig.id,
    type: axisConfig.type,
    fromDirection: axisConfig.direction,
    toDirection: direction,
    tickCount: axisConfig.ticks.length,
    labelCount: axisConfig.labels.length,
  });

  if (axisConfig.direction === direction) {
    logger.debug('Axis already in target direction, no mirroring needed');
    const density = computeVisualDensity(axisConfig.ticks, axisConfig.labels, axisConfig.gridlines, axisConfig.length);
    return {
      config: { ...axisConfig },
      metrics: {
        tickDistributionSymmetry: 1.0,
        labelSpacingRatioPreserved: true,
        visualDensityPreserved: true,
        originalDensity: density,
        mirroredDensity: density,
      },
    };
  }

  let mirroredConfig: AxisConfig;

  if (axisConfig.type === 'x') {
    const mirroredTicks = axisConfig.ticks.map(t => mirrorTick(t, axisConfig.length));
    const mirroredLabels = axisConfig.labels.map(l => mirrorLabel(l, axisConfig.length));
    const mirroredGridlines = axisConfig.gridlines.map(g => mirrorGridline(g, axisConfig.length));

    mirroredTicks.sort((a, b) => a.position - b.position);
    mirroredLabels.sort((a, b) => a.position - b.position);
    mirroredGridlines.sort((a, b) => a.position - b.position);

    mirroredConfig = {
      ...axisConfig,
      ticks: mirroredTicks,
      labels: mirroredLabels,
      gridlines: mirroredGridlines,
      titlePosition: axisConfig.length - axisConfig.titlePosition,
      direction,
    };
  } else {
    const positionMap: Record<string, 'left' | 'right'> = {
      left: 'right',
      right: 'left',
    };

    const newPosition = axisConfig.position === 'left' || axisConfig.position === 'right'
      ? positionMap[axisConfig.position] ?? axisConfig.position
      : axisConfig.position;

    const mirroredLabels = axisConfig.labels.map(l => ({
      ...l,
      anchor: (l.anchor === 'start' ? 'end' : l.anchor === 'end' ? 'start' : 'middle') as 'start' | 'middle' | 'end',
    }));

    mirroredConfig = {
      ...axisConfig,
      position: newPosition as 'top' | 'bottom' | 'left' | 'right',
      labels: mirroredLabels,
      direction,
    };
  }

  const originalDensity = computeVisualDensity(
    axisConfig.ticks, axisConfig.labels, axisConfig.gridlines, axisConfig.length
  );
  const mirroredDensity = computeVisualDensity(
    mirroredConfig.ticks, mirroredConfig.labels, mirroredConfig.gridlines, mirroredConfig.length
  );

  const tickSymmetry = computeTickSymmetry(axisConfig.ticks, mirroredConfig.ticks, axisConfig.length);
  const labelSpacingPreserved = checkLabelSpacingPreserved(axisConfig.labels, mirroredConfig.labels);
  const densityPreserved = Math.abs(originalDensity - mirroredDensity) < 0.01;

  if (!densityPreserved) {
    logger.warn('Visual density changed after axis mirroring', {
      axisId: axisConfig.id,
      originalDensity,
      mirroredDensity,
    });
  }

  if (tickSymmetry < 0.9) {
    logger.warn('Tick distribution symmetry below threshold', {
      axisId: axisConfig.id,
      symmetry: tickSymmetry,
    });
  }

  const metrics: MirrorMetrics = {
    tickDistributionSymmetry: tickSymmetry,
    labelSpacingRatioPreserved: labelSpacingPreserved,
    visualDensityPreserved: densityPreserved,
    originalDensity,
    mirroredDensity,
  };

  logger.info('Axis mirroring complete', {
    axisId: axisConfig.id,
    tickSymmetry: metrics.tickDistributionSymmetry,
    labelSpacingPreserved: metrics.labelSpacingRatioPreserved,
    densityPreserved: metrics.visualDensityPreserved,
  });

  return { config: mirroredConfig, metrics };
}
