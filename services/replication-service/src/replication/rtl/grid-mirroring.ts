/**
 * Grid Mirroring for RTL Layouts
 * Performs mathematical mirror transformation of grid layouts
 * for right-to-left content while preserving spacing ratios and visual density.
 */

import { logger } from '../../utils/logger.js';

/** A grid cell with absolute position */
export interface GridCell {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
  content: string;
  direction: 'ltr' | 'rtl';
}

/** Grid layout definition */
export interface GridLayout {
  cells: GridCell[];
  columns: number;
  rows: number;
  columnWidths: number[];
  rowHeights: number[];
  columnGaps: number[];
  rowGaps: number[];
  totalWidth: number;
  totalHeight: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

/** Mirrored layout result */
export interface MirroredLayout {
  cells: GridCell[];
  columns: number;
  rows: number;
  columnWidths: number[];
  rowHeights: number[];
  columnGaps: number[];
  rowGaps: number[];
  totalWidth: number;
  totalHeight: number;
  padding: { top: number; right: number; bottom: number; left: number };
  mirrorMetrics: MirrorMetrics;
}

/** Metrics about the mirroring transformation */
export interface MirrorMetrics {
  cellsMirrored: number;
  maxPositionDelta: number;
  spacingRatioPreserved: boolean;
  densityPreserved: boolean;
  originalDensity: number;
  mirroredDensity: number;
}

/**
 * Computes visual density as the ratio of occupied area to total area.
 */
function computeDensity(cells: GridCell[], totalWidth: number, totalHeight: number): number {
  if (totalWidth === 0 || totalHeight === 0) return 0;

  const totalArea = totalWidth * totalHeight;
  let occupiedArea = 0;

  for (const cell of cells) {
    occupiedArea += cell.width * cell.height;
  }

  return occupiedArea / totalArea;
}

/**
 * Validates that spacing ratios between cells are preserved after mirroring.
 */
function validateSpacingRatios(
  original: GridCell[],
  mirrored: GridCell[],
  containerWidth: number
): boolean {
  if (original.length < 2) return true;

  const tolerance = 1.0;

  const origSorted = [...original].sort((a, b) => a.x - b.x);
  const mirSorted = [...mirrored].sort((a, b) => a.x - b.x);

  for (let i = 0; i < origSorted.length - 1; i++) {
    const origGap = origSorted[i + 1].x - (origSorted[i].x + origSorted[i].width);
    const mirGap = mirSorted[i + 1].x - (mirSorted[i].x + mirSorted[i].width);

    if (Math.abs(origGap) > tolerance && Math.abs(mirGap) > tolerance) {
      const ratio = Math.abs(origGap - mirGap);
      if (ratio > tolerance) {
        logger.warn('Spacing ratio deviation detected', {
          index: i,
          originalGap: origGap,
          mirroredGap: mirGap,
          delta: ratio,
        });
        return false;
      }
    }
  }

  return true;
}

/**
 * Mirrors the X position of a cell: newX = containerWidth - (x + width)
 */
function mirrorCellX(cell: GridCell, containerWidth: number): GridCell {
  const newX = containerWidth - (cell.x + cell.width);
  const newColumn = cell.columnSpan > 0
    ? Math.max(0, (cell.column + cell.columnSpan - 1))
    : cell.column;

  return {
    ...cell,
    x: newX,
    column: newColumn,
    direction: cell.direction === 'ltr' ? 'rtl' : 'ltr',
  };
}

/**
 * Mirrors a grid layout from LTR to RTL (or vice versa).
 * Uses the mathematical transformation: newX = containerWidth - (x + width)
 * Preserves relative spacing ratios and visual density.
 */
export function mirrorGrid(layout: GridLayout, containerWidth: number): MirroredLayout {
  logger.info('Starting grid mirroring', {
    cells: layout.cells.length,
    columns: layout.columns,
    rows: layout.rows,
    containerWidth,
  });

  const effectiveWidth = containerWidth > 0 ? containerWidth : layout.totalWidth;
  const mirroredCells: GridCell[] = [];
  let maxDelta = 0;

  for (const cell of layout.cells) {
    const mirrored = mirrorCellX(cell, effectiveWidth);
    const delta = Math.abs(mirrored.x - cell.x);
    if (delta > maxDelta) maxDelta = delta;
    mirroredCells.push(mirrored);
  }

  const mirroredColumnWidths = [...layout.columnWidths].reverse();
  const mirroredColumnGaps = [...layout.columnGaps].reverse();

  const mirroredPadding = {
    top: layout.padding.top,
    right: layout.padding.left,
    bottom: layout.padding.bottom,
    left: layout.padding.right,
  };

  const originalDensity = computeDensity(layout.cells, layout.totalWidth, layout.totalHeight);
  const mirroredDensity = computeDensity(mirroredCells, effectiveWidth, layout.totalHeight);
  const densityPreserved = Math.abs(originalDensity - mirroredDensity) < 0.01;
  const spacingRatioPreserved = validateSpacingRatios(layout.cells, mirroredCells, effectiveWidth);

  if (!densityPreserved) {
    logger.warn('Visual density changed after mirroring', {
      originalDensity,
      mirroredDensity,
      delta: Math.abs(originalDensity - mirroredDensity),
    });
  }

  if (!spacingRatioPreserved) {
    logger.warn('Spacing ratios not perfectly preserved after mirroring');
  }

  const metrics: MirrorMetrics = {
    cellsMirrored: mirroredCells.length,
    maxPositionDelta: maxDelta,
    spacingRatioPreserved,
    densityPreserved,
    originalDensity,
    mirroredDensity,
  };

  logger.info('Grid mirroring complete', {
    cellsMirrored: metrics.cellsMirrored,
    maxPositionDelta: metrics.maxPositionDelta,
    densityPreserved: metrics.densityPreserved,
  });

  return {
    cells: mirroredCells,
    columns: layout.columns,
    rows: layout.rows,
    columnWidths: mirroredColumnWidths,
    rowHeights: layout.rowHeights,
    columnGaps: mirroredColumnGaps,
    rowGaps: layout.rowGaps,
    totalWidth: effectiveWidth,
    totalHeight: layout.totalHeight,
    padding: mirroredPadding,
    mirrorMetrics: metrics,
  };
}
