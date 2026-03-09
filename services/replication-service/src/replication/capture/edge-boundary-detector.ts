/**
 * Edge & Boundary Detector
 * Applies Sobel edge detection to raw pixel matrices and extracts
 * bounding boxes of distinct visual regions. Detects grid lines
 * and alignment edges for layout analysis.
 */

import { logger } from '../../utils/logger.js';
import { BoundingBox } from '../layers/index.js';

/** A detected edge region with magnitude information */
export interface EdgeRegion {
  bounds: BoundingBox;
  averageMagnitude: number;
  orientation: 'horizontal' | 'vertical' | 'diagonal' | 'mixed';
}

/** Grid line detected in the image */
export interface GridLine {
  orientation: 'horizontal' | 'vertical';
  position: number;
  start: number;
  end: number;
  strength: number;
}

/** A group of bounding boxes that share an alignment edge */
export interface AlignmentGroup {
  edge: 'top' | 'bottom' | 'left' | 'right' | 'centerX' | 'centerY';
  position: number;
  tolerance: number;
  members: BoundingBox[];
}

/** Options for edge detection */
export interface EdgeDetectionOptions {
  /** Gradient magnitude threshold (0–255). Default 30. */
  threshold?: number;
  /** Minimum region area in pixels to keep. Default 100. */
  minArea?: number;
  /** Whether to apply Gaussian blur before Sobel. Default true. */
  preBlur?: boolean;
}

/**
 * Convert RGB pixel data to single-channel grayscale luminance.
 */
function toGrayscale(rgb: Uint8Array, width: number, height: number): Float64Array {
  const gray = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 3;
    gray[i] = 0.299 * rgb[o] + 0.587 * rgb[o + 1] + 0.114 * rgb[o + 2];
  }
  return gray;
}

/**
 * Apply a 3x3 Gaussian blur to reduce noise before edge detection.
 */
function gaussianBlur3x3(src: Float64Array, width: number, height: number): Float64Array {
  const dst = new Float64Array(width * height);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kSum = 16;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += src[(y + ky) * width + (x + kx)] * kernel[ki++];
        }
      }
      dst[y * width + x] = sum / kSum;
    }
  }
  return dst;
}

/**
 * Apply Sobel edge detection to pixel data.
 * Returns gradient magnitude and direction arrays.
 */
function sobelOperator(
  gray: Float64Array,
  width: number,
  height: number
): { magnitude: Float64Array; direction: Float64Array } {
  const magnitude = new Float64Array(width * height);
  const direction = new Float64Array(width * height);

  // Sobel kernels
  const gxK = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyK = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const val = gray[(y + ky) * width + (x + kx)];
          gx += val * gxK[ki];
          gy += val * gyK[ki];
          ki++;
        }
      }
      const idx = y * width + x;
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
      direction[idx] = Math.atan2(gy, gx);
    }
  }

  return { magnitude, direction };
}

/**
 * Flood-fill connected-component labeling on a binary edge map.
 * Returns label array and number of labels.
 */
function labelConnectedComponents(
  binary: Uint8Array,
  width: number,
  height: number
): { labels: Int32Array; count: number } {
  const labels = new Int32Array(width * height);
  let currentLabel = 0;
  const stack: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] === 1 && labels[idx] === 0) {
        currentLabel++;
        stack.push(idx);
        while (stack.length > 0) {
          const ci = stack.pop()!;
          if (labels[ci] !== 0) continue;
          labels[ci] = currentLabel;
          const cx = ci % width;
          const cy = Math.floor(ci / width);
          // 4-connected neighbors
          if (cx > 0 && binary[ci - 1] === 1 && labels[ci - 1] === 0) stack.push(ci - 1);
          if (cx < width - 1 && binary[ci + 1] === 1 && labels[ci + 1] === 0) stack.push(ci + 1);
          if (cy > 0 && binary[ci - width] === 1 && labels[ci - width] === 0) stack.push(ci - width);
          if (cy < height - 1 && binary[ci + width] === 1 && labels[ci + width] === 0) stack.push(ci + width);
        }
      }
    }
  }

  return { labels, count: currentLabel };
}

/**
 * Detect edges in a pixel matrix using Sobel operator and return bounding boxes
 * of connected edge regions.
 */
export function detectEdges(
  pixelMatrix: Uint8Array,
  width: number,
  height: number,
  options: EdgeDetectionOptions = {}
): BoundingBox[] {
  const { threshold = 30, minArea = 100, preBlur = true } = options;

  logger.info('Detecting edges', { width, height, threshold, minArea });

  let gray = toGrayscale(pixelMatrix, width, height);
  if (preBlur) {
    gray = gaussianBlur3x3(gray, width, height);
  }

  const { magnitude } = sobelOperator(gray, width, height);

  // Threshold to binary
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < magnitude.length; i++) {
    binary[i] = magnitude[i] >= threshold ? 1 : 0;
  }

  // Dilate to connect nearby edge pixels (3x3 dilation)
  const dilated = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (binary[y * width + x] === 1) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            dilated[(y + dy) * width + (x + dx)] = 1;
          }
        }
      }
    }
  }

  // Connected component labeling
  const { labels, count } = labelConnectedComponents(dilated, width, height);

  // Extract bounding boxes per label
  const boxes: BoundingBox[] = [];
  for (let label = 1; label <= count; label++) {
    let minX = width, maxX = 0, minY = height, maxY = 0;
    let area = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (labels[y * width + x] === label) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          area++;
        }
      }
    }
    if (area >= minArea) {
      boxes.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
    }
  }

  logger.info('Edge detection complete', { totalRegions: count, filteredBoxes: boxes.length });
  return boxes;
}

/**
 * Detect dominant horizontal and vertical grid lines from edge data.
 * Uses Hough-like accumulation on the gradient magnitude map.
 */
export function detectGridLines(
  pixelMatrix: Uint8Array,
  width: number,
  height: number,
  options: { threshold?: number; minLength?: number } = {}
): GridLine[] {
  const { threshold = 40, minLength = 0.3 } = options;
  const minLenPx = Math.floor(Math.min(width, height) * minLength);

  const gray = toGrayscale(pixelMatrix, width, height);
  const { magnitude, direction } = sobelOperator(gray, width, height);

  const lines: GridLine[] = [];

  // Accumulate horizontal lines (edges with vertical gradient ~pi/2)
  const hAccum = new Float64Array(height);
  for (let y = 1; y < height - 1; y++) {
    let runLength = 0;
    let runStrength = 0;
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const dir = Math.abs(direction[idx]);
      const isHorizontalEdge = magnitude[idx] >= threshold && (dir > Math.PI * 0.35 && dir < Math.PI * 0.65);
      if (isHorizontalEdge) {
        runLength++;
        runStrength += magnitude[idx];
      }
    }
    hAccum[y] = runLength;
    if (runLength >= minLenPx) {
      lines.push({
        orientation: 'horizontal',
        position: y,
        start: 0,
        end: width,
        strength: runStrength / runLength,
      });
    }
  }

  // Accumulate vertical lines (edges with horizontal gradient ~0)
  const vAccum = new Float64Array(width);
  for (let x = 1; x < width - 1; x++) {
    let runLength = 0;
    let runStrength = 0;
    for (let y = 1; y < height - 1; y++) {
      const idx = y * width + x;
      const dir = Math.abs(direction[idx]);
      const isVerticalEdge = magnitude[idx] >= threshold && (dir < Math.PI * 0.15 || dir > Math.PI * 0.85);
      if (isVerticalEdge) {
        runLength++;
        runStrength += magnitude[idx];
      }
    }
    vAccum[x] = runLength;
    if (runLength >= minLenPx) {
      lines.push({
        orientation: 'vertical',
        position: x,
        start: 0,
        end: height,
        strength: runStrength / runLength,
      });
    }
  }

  logger.info('Grid line detection complete', {
    horizontalLines: lines.filter(l => l.orientation === 'horizontal').length,
    verticalLines: lines.filter(l => l.orientation === 'vertical').length,
  });

  return lines;
}

/**
 * Find groups of bounding boxes that share an alignment edge.
 * Tolerance is given as a fraction of the image dimension.
 */
export function detectAlignmentEdges(
  boundingBoxes: BoundingBox[],
  toleranceFraction: number = 0.01
): AlignmentGroup[] {
  if (boundingBoxes.length < 2) return [];

  // Determine max dimension for tolerance calculation
  let maxW = 0, maxH = 0;
  for (const box of boundingBoxes) {
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    if (right > maxW) maxW = right;
    if (bottom > maxH) maxH = bottom;
  }

  const tolX = maxW * toleranceFraction;
  const tolY = maxH * toleranceFraction;

  type EdgeType = 'top' | 'bottom' | 'left' | 'right' | 'centerX' | 'centerY';

  function getEdgeValue(box: BoundingBox, edge: EdgeType): number {
    switch (edge) {
      case 'top': return box.y;
      case 'bottom': return box.y + box.height;
      case 'left': return box.x;
      case 'right': return box.x + box.width;
      case 'centerX': return box.x + box.width / 2;
      case 'centerY': return box.y + box.height / 2;
    }
  }

  const edgeTypes: EdgeType[] = ['top', 'bottom', 'left', 'right', 'centerX', 'centerY'];
  const groups: AlignmentGroup[] = [];

  for (const edgeType of edgeTypes) {
    const isVerticalEdge = edgeType === 'top' || edgeType === 'bottom' || edgeType === 'centerY';
    const tol = isVerticalEdge ? tolY : tolX;

    // Sort boxes by edge value
    const sorted = [...boundingBoxes].sort(
      (a, b) => getEdgeValue(a, edgeType) - getEdgeValue(b, edgeType)
    );

    // Cluster boxes with similar edge values
    let clusterStart = 0;
    while (clusterStart < sorted.length) {
      const refVal = getEdgeValue(sorted[clusterStart], edgeType);
      const members: BoundingBox[] = [sorted[clusterStart]];
      let clusterEnd = clusterStart + 1;

      while (clusterEnd < sorted.length) {
        const val = getEdgeValue(sorted[clusterEnd], edgeType);
        if (Math.abs(val - refVal) <= tol) {
          members.push(sorted[clusterEnd]);
          clusterEnd++;
        } else {
          break;
        }
      }

      if (members.length >= 2) {
        // Compute mean position of the cluster
        let sum = 0;
        for (const m of members) sum += getEdgeValue(m, edgeType);
        groups.push({
          edge: edgeType,
          position: sum / members.length,
          tolerance: tol,
          members,
        });
      }

      clusterStart = clusterEnd;
    }
  }

  logger.info('Alignment edge detection complete', { groupCount: groups.length });
  return groups;
}
