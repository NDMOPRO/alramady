/**
 * Element Segmenter
 * Segments image regions into typed visual elements using color histogram
 * analysis. Does NOT interpret content — only identifies element boundaries
 * and classifies by visual characteristics.
 */

import sharp from 'sharp';
import { logger } from '../../utils/logger.js';
import { BoundingBox } from '../layers/index.js';

/** Type classification for a segmented visual element */
export type SegmentedElementType = 'text' | 'image' | 'icon' | 'table' | 'chart' | 'shape';

/** A segmented visual element with type classification */
export interface SegmentedElement {
  type: SegmentedElementType;
  bounds: BoundingBox;
  confidence: number;
}

/** Color histogram for a region */
interface RegionHistogram {
  r: Float64Array;
  g: Float64Array;
  b: Float64Array;
  entropy: number;
  dominantColorRatio: number;
  colorCount: number;
}

/** Internal region analysis result */
interface RegionAnalysis {
  histogram: RegionHistogram;
  edgeDensity: number;
  aspectRatio: number;
  area: number;
  hasBorderPattern: boolean;
  hasRegularSpacing: boolean;
}

const HISTOGRAM_BINS = 16;

/**
 * Compute a color histogram for a sub-region of the pixel buffer.
 */
function computeRegionHistogram(
  pixels: Uint8Array,
  srcWidth: number,
  box: BoundingBox
): RegionHistogram {
  const rHist = new Float64Array(HISTOGRAM_BINS);
  const gHist = new Float64Array(HISTOGRAM_BINS);
  const bHist = new Float64Array(HISTOGRAM_BINS);
  const binScale = HISTOGRAM_BINS / 256;
  let pixelCount = 0;

  const colorSet = new Set<number>();

  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      const offset = (y * srcWidth + x) * 3;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];

      rHist[Math.min(Math.floor(r * binScale), HISTOGRAM_BINS - 1)]++;
      gHist[Math.min(Math.floor(g * binScale), HISTOGRAM_BINS - 1)]++;
      bHist[Math.min(Math.floor(b * binScale), HISTOGRAM_BINS - 1)]++;

      // Quantize to 4-bit per channel for color counting
      const quantized = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      colorSet.add(quantized);
      pixelCount++;
    }
  }

  if (pixelCount === 0) {
    return { r: rHist, g: gHist, b: bHist, entropy: 0, dominantColorRatio: 1, colorCount: 0 };
  }

  // Normalize
  for (let i = 0; i < HISTOGRAM_BINS; i++) {
    rHist[i] /= pixelCount;
    gHist[i] /= pixelCount;
    bHist[i] /= pixelCount;
  }

  // Compute entropy across combined histogram
  let entropy = 0;
  for (let i = 0; i < HISTOGRAM_BINS; i++) {
    const combined = (rHist[i] + gHist[i] + bHist[i]) / 3;
    if (combined > 0) {
      entropy -= combined * Math.log2(combined);
    }
  }

  // Find dominant color ratio
  let maxBin = 0;
  for (let i = 0; i < HISTOGRAM_BINS; i++) {
    const combined = rHist[i] + gHist[i] + bHist[i];
    if (combined > maxBin) maxBin = combined;
  }

  return {
    r: rHist,
    g: gHist,
    b: bHist,
    entropy,
    dominantColorRatio: maxBin / 3,
    colorCount: colorSet.size,
  };
}

/**
 * Compute edge density in a region using simple gradient magnitude.
 */
function computeEdgeDensity(
  pixels: Uint8Array,
  srcWidth: number,
  box: BoundingBox
): number {
  let edgePixels = 0;
  let totalPixels = 0;
  const threshold = 25;

  for (let y = box.y + 1; y < box.y + box.height - 1; y++) {
    for (let x = box.x + 1; x < box.x + box.width - 1; x++) {
      const idx = (y * srcWidth + x) * 3;
      const idxR = (y * srcWidth + x + 1) * 3;
      const idxD = ((y + 1) * srcWidth + x) * 3;

      // Luminance at current, right, and below
      const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
      const lumR = 0.299 * pixels[idxR] + 0.587 * pixels[idxR + 1] + 0.114 * pixels[idxR + 2];
      const lumD = 0.299 * pixels[idxD] + 0.587 * pixels[idxD + 1] + 0.114 * pixels[idxD + 2];

      const gx = Math.abs(lumR - lum);
      const gy = Math.abs(lumD - lum);

      if (gx + gy > threshold) edgePixels++;
      totalPixels++;
    }
  }

  return totalPixels > 0 ? edgePixels / totalPixels : 0;
}

/**
 * Detect border pattern by checking if edges are concentrated at region borders.
 */
function detectBorderPattern(
  pixels: Uint8Array,
  srcWidth: number,
  box: BoundingBox
): boolean {
  const borderWidth = Math.max(2, Math.floor(Math.min(box.width, box.height) * 0.05));
  let borderEdges = 0;
  let interiorEdges = 0;
  const threshold = 30;

  for (let y = box.y + 1; y < box.y + box.height - 1; y++) {
    for (let x = box.x + 1; x < box.x + box.width - 1; x++) {
      const idx = (y * srcWidth + x) * 3;
      const idxR = (y * srcWidth + x + 1) * 3;
      const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
      const lumR = 0.299 * pixels[idxR] + 0.587 * pixels[idxR + 1] + 0.114 * pixels[idxR + 2];

      if (Math.abs(lumR - lum) > threshold) {
        const isBorder =
          (x - box.x < borderWidth) || (box.x + box.width - x < borderWidth) ||
          (y - box.y < borderWidth) || (box.y + box.height - y < borderWidth);
        if (isBorder) borderEdges++;
        else interiorEdges++;
      }
    }
  }

  const total = borderEdges + interiorEdges;
  return total > 0 && borderEdges / total > 0.5;
}

/**
 * Detect regular vertical spacing patterns (indicative of tables or grids).
 */
function detectRegularSpacing(
  pixels: Uint8Array,
  srcWidth: number,
  box: BoundingBox
): boolean {
  // Sum horizontal edge strength per row
  const rowStrengths = new Float64Array(box.height);

  for (let dy = 1; dy < box.height - 1; dy++) {
    let strength = 0;
    const y = box.y + dy;
    for (let dx = 1; dx < box.width - 1; dx++) {
      const x = box.x + dx;
      const idx = (y * srcWidth + x) * 3;
      const idxD = ((y + 1) * srcWidth + x) * 3;
      const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
      const lumD = 0.299 * pixels[idxD] + 0.587 * pixels[idxD + 1] + 0.114 * pixels[idxD + 2];
      strength += Math.abs(lumD - lum);
    }
    rowStrengths[dy] = strength / box.width;
  }

  // Find peaks in row strengths
  const peakThreshold = 10;
  const peaks: number[] = [];
  for (let i = 1; i < rowStrengths.length - 1; i++) {
    if (rowStrengths[i] > peakThreshold &&
        rowStrengths[i] > rowStrengths[i - 1] &&
        rowStrengths[i] > rowStrengths[i + 1]) {
      peaks.push(i);
    }
  }

  if (peaks.length < 3) return false;

  // Check if intervals are roughly equal
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }

  const meanInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const variance = intervals.reduce((s, v) => s + (v - meanInterval) ** 2, 0) / intervals.length;
  const cv = Math.sqrt(variance) / meanInterval; // coefficient of variation

  return cv < 0.3; // regular if CV < 30%
}

/**
 * Analyze a region and produce analysis metrics.
 */
function analyzeRegion(
  pixels: Uint8Array,
  srcWidth: number,
  box: BoundingBox
): RegionAnalysis {
  return {
    histogram: computeRegionHistogram(pixels, srcWidth, box),
    edgeDensity: computeEdgeDensity(pixels, srcWidth, box),
    aspectRatio: box.width / Math.max(box.height, 1),
    area: box.width * box.height,
    hasBorderPattern: detectBorderPattern(pixels, srcWidth, box),
    hasRegularSpacing: detectRegularSpacing(pixels, srcWidth, box),
  };
}

/**
 * Classify a region into an element type based on its visual properties.
 */
function classifyRegion(analysis: RegionAnalysis): { type: SegmentedElementType; confidence: number } {
  const { histogram, edgeDensity, aspectRatio, area, hasBorderPattern, hasRegularSpacing } = analysis;

  // Table: has border pattern + regular spacing + moderate edge density
  if (hasBorderPattern && hasRegularSpacing && edgeDensity > 0.05) {
    return { type: 'table', confidence: 0.75 + Math.min(edgeDensity * 2, 0.2) };
  }

  // Chart: high color diversity + moderate-high edge density + not too elongated
  if (histogram.colorCount > 50 && edgeDensity > 0.08 && aspectRatio > 0.5 && aspectRatio < 3) {
    return { type: 'chart', confidence: 0.6 + Math.min(histogram.entropy / 10, 0.25) };
  }

  // Text: low color count, high contrast (bimodal histogram), high edge density in narrow bands
  if (histogram.dominantColorRatio > 0.6 && histogram.colorCount < 30 && edgeDensity > 0.03) {
    return { type: 'text', confidence: 0.7 + Math.min(histogram.dominantColorRatio * 0.2, 0.2) };
  }

  // Icon: small area, few colors, compact aspect ratio
  if (area < 10000 && histogram.colorCount < 40 && aspectRatio > 0.5 && aspectRatio < 2) {
    return { type: 'icon', confidence: 0.6 + (area < 5000 ? 0.15 : 0) };
  }

  // Image: high color diversity and entropy
  if (histogram.colorCount > 100 && histogram.entropy > 2.5) {
    return { type: 'image', confidence: 0.65 + Math.min(histogram.entropy / 15, 0.25) };
  }

  // Shape: low color count, low edge density, uniform regions
  if (histogram.colorCount < 20 && edgeDensity < 0.05) {
    return { type: 'shape', confidence: 0.55 + Math.min(histogram.dominantColorRatio * 0.3, 0.3) };
  }

  // Default: classify as shape with low confidence
  return { type: 'shape', confidence: 0.3 };
}

/**
 * Segment an image into typed visual elements based on detected edge bounding boxes.
 * Uses color histogram analysis and edge density to classify each region.
 */
export async function segmentElements(
  imageBuffer: Buffer,
  edges: BoundingBox[]
): Promise<SegmentedElement[]> {
  logger.info('Segmenting elements', { edgeCount: edges.length });

  // Decode to raw RGB
  const { data, info } = await sharp(imageBuffer)
    .removeAlpha()
    .toColorspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data.buffer, data.byteOffset, data.length);
  const srcWidth = info.width;
  const srcHeight = info.height;

  const elements: SegmentedElement[] = [];

  for (const box of edges) {
    // Clamp bounding box to image dimensions
    const clamped: BoundingBox = {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: Math.min(box.width, srcWidth - Math.max(0, box.x)),
      height: Math.min(box.height, srcHeight - Math.max(0, box.y)),
    };

    if (clamped.width < 4 || clamped.height < 4) continue;

    const analysis = analyzeRegion(pixels, srcWidth, clamped);
    const { type, confidence } = classifyRegion(analysis);

    elements.push({ type, bounds: clamped, confidence });
  }

  logger.info('Element segmentation complete', {
    total: elements.length,
    byType: {
      text: elements.filter(e => e.type === 'text').length,
      image: elements.filter(e => e.type === 'image').length,
      icon: elements.filter(e => e.type === 'icon').length,
      table: elements.filter(e => e.type === 'table').length,
      chart: elements.filter(e => e.type === 'chart').length,
      shape: elements.filter(e => e.type === 'shape').length,
    },
  });

  return elements;
}
