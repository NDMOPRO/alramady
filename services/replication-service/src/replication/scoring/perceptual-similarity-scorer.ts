/**
 * Perceptual Similarity Scorer
 * Compares two images using block-based histogram comparison,
 * contrast analysis, and density measurement. This is NOT a simple
 * pixel diff — it compares structural layout patterns perceptually.
 */

import sharp from 'sharp';
import { logger } from '../../utils/logger.js';

/** Result of perceptual similarity comparison */
export interface PerceptualScore {
  /** Overall similarity score 0–1 */
  overall: number;
  /** Per-block similarity scores (row-major 2D grid) */
  blockScores: number[][];
  /** Similarity of contrast distribution 0–1 */
  contrastSimilarity: number;
  /** Similarity of visual density distribution 0–1 */
  densitySimilarity: number;
}

/** Options for perceptual comparison */
export interface PerceptualComparisonOptions {
  /** Number of blocks per axis (creates gridSize x gridSize grid). Default 8. */
  gridSize?: number;
  /** Number of histogram bins per channel. Default 16. */
  histogramBins?: number;
  /** Target dimension to resize both images to before comparison. Default 512. */
  normalizeDimension?: number;
}

/** Internal representation of a normalized image */
interface NormalizedImage {
  pixels: Uint8Array;
  width: number;
  height: number;
}

/**
 * Normalize an image buffer to a fixed size and extract raw RGB pixels.
 */
async function normalizeImage(
  buffer: Buffer,
  dimension: number
): Promise<NormalizedImage> {
  const { data, info } = await sharp(buffer)
    .resize(dimension, dimension, { fit: 'fill' })
    .removeAlpha()
    .toColorspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    pixels: new Uint8Array(data.buffer, data.byteOffset, data.length),
    width: info.width,
    height: info.height,
  };
}

/**
 * Compute a color histogram for a rectangular block of pixels.
 */
function computeBlockHistogram(
  pixels: Uint8Array,
  imgWidth: number,
  blockX: number,
  blockY: number,
  blockW: number,
  blockH: number,
  bins: number
): Float64Array {
  // Combined histogram: bins for R, then G, then B
  const histogram = new Float64Array(bins * 3);
  const binScale = bins / 256;
  let count = 0;

  for (let y = blockY; y < blockY + blockH; y++) {
    for (let x = blockX; x < blockX + blockW; x++) {
      const offset = (y * imgWidth + x) * 3;
      const rBin = Math.min(Math.floor(pixels[offset] * binScale), bins - 1);
      const gBin = Math.min(Math.floor(pixels[offset + 1] * binScale), bins - 1);
      const bBin = Math.min(Math.floor(pixels[offset + 2] * binScale), bins - 1);

      histogram[rBin]++;
      histogram[bins + gBin]++;
      histogram[bins * 2 + bBin]++;
      count++;
    }
  }

  // Normalize to probability distribution
  if (count > 0) {
    for (let i = 0; i < histogram.length; i++) {
      histogram[i] /= count;
    }
  }

  return histogram;
}

/**
 * Compute histogram intersection (Swain & Ballard) between two histograms.
 * Returns similarity 0–1.
 */
function histogramIntersection(a: Float64Array, b: Float64Array): number {
  let intersection = 0;
  for (let i = 0; i < a.length; i++) {
    intersection += Math.min(a[i], b[i]);
  }
  // Normalize: max intersection for normalized histograms is 1.0 per channel
  // With 3 channels, max is 3.0
  return intersection / 3;
}

/**
 * Compute Bhattacharyya coefficient between two histograms.
 * Returns similarity 0–1.
 */
function bhattacharyyaCoefficient(a: Float64Array, b: Float64Array): number {
  let bc = 0;
  for (let i = 0; i < a.length; i++) {
    bc += Math.sqrt(a[i] * b[i]);
  }
  // Normalize for 3 channels
  return Math.min(bc / 3, 1.0);
}

/**
 * Compute contrast map: for each pixel, the local contrast (luminance gradient magnitude).
 * Returns a 2D array of contrast values.
 */
function computeContrastMap(
  pixels: Uint8Array,
  width: number,
  height: number
): Float64Array {
  const contrast = new Float64Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 3;
      const idxR = (y * width + x + 1) * 3;
      const idxD = ((y + 1) * width + x) * 3;

      const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
      const lumR = 0.299 * pixels[idxR] + 0.587 * pixels[idxR + 1] + 0.114 * pixels[idxR + 2];
      const lumD = 0.299 * pixels[idxD] + 0.587 * pixels[idxD + 1] + 0.114 * pixels[idxD + 2];

      const gx = lumR - lum;
      const gy = lumD - lum;
      contrast[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  return contrast;
}

/**
 * Compute visual density: ratio of non-background pixels per block.
 * Background is estimated as the most frequent luminance bin.
 */
function computeDensityMap(
  pixels: Uint8Array,
  width: number,
  height: number,
  gridSize: number
): Float64Array {
  // Determine background luminance via global histogram peak
  const lumBins = 32;
  const lumHist = new Float64Array(lumBins);
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 3;
    const lum = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
    const bin = Math.min(Math.floor(lum / 256 * lumBins), lumBins - 1);
    lumHist[bin]++;
  }

  let bgBin = 0;
  let maxCount = 0;
  for (let i = 0; i < lumBins; i++) {
    if (lumHist[i] > maxCount) {
      maxCount = lumHist[i];
      bgBin = i;
    }
  }

  const bgLumLow = (bgBin / lumBins) * 256;
  const bgLumHigh = ((bgBin + 1) / lumBins) * 256;

  // Compute density per block
  const blockW = Math.floor(width / gridSize);
  const blockH = Math.floor(height / gridSize);
  const density = new Float64Array(gridSize * gridSize);

  for (let by = 0; by < gridSize; by++) {
    for (let bx = 0; bx < gridSize; bx++) {
      let foreground = 0;
      let total = 0;
      const startX = bx * blockW;
      const startY = by * blockH;

      for (let y = startY; y < startY + blockH && y < height; y++) {
        for (let x = startX; x < startX + blockW && x < width; x++) {
          const offset = (y * width + x) * 3;
          const lum = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
          if (lum < bgLumLow || lum >= bgLumHigh) foreground++;
          total++;
        }
      }

      density[by * gridSize + bx] = total > 0 ? foreground / total : 0;
    }
  }

  return density;
}

/**
 * Compare contrast distributions between two images.
 */
function compareContrast(
  imgA: NormalizedImage,
  imgB: NormalizedImage,
  gridSize: number
): number {
  const contrastA = computeContrastMap(imgA.pixels, imgA.width, imgA.height);
  const contrastB = computeContrastMap(imgB.pixels, imgB.width, imgB.height);

  const blockW = Math.floor(imgA.width / gridSize);
  const blockH = Math.floor(imgA.height / gridSize);
  let totalSimilarity = 0;
  let blockCount = 0;

  for (let by = 0; by < gridSize; by++) {
    for (let bx = 0; bx < gridSize; bx++) {
      let sumA = 0, sumB = 0;
      let count = 0;
      const startX = bx * blockW;
      const startY = by * blockH;

      for (let y = startY; y < startY + blockH; y++) {
        for (let x = startX; x < startX + blockW; x++) {
          const idx = y * imgA.width + x;
          sumA += contrastA[idx];
          sumB += contrastB[idx];
          count++;
        }
      }

      if (count > 0) {
        const meanA = sumA / count;
        const meanB = sumB / count;
        const maxMean = Math.max(meanA, meanB, 1);
        const diff = Math.abs(meanA - meanB) / maxMean;
        totalSimilarity += 1 - diff;
        blockCount++;
      }
    }
  }

  return blockCount > 0 ? totalSimilarity / blockCount : 1.0;
}

/**
 * Compare density distributions between two images.
 */
function compareDensity(
  imgA: NormalizedImage,
  imgB: NormalizedImage,
  gridSize: number
): number {
  const densityA = computeDensityMap(imgA.pixels, imgA.width, imgA.height, gridSize);
  const densityB = computeDensityMap(imgB.pixels, imgB.width, imgB.height, gridSize);

  let totalSimilarity = 0;
  const n = gridSize * gridSize;

  for (let i = 0; i < n; i++) {
    totalSimilarity += 1 - Math.abs(densityA[i] - densityB[i]);
  }

  return totalSimilarity / n;
}

/**
 * Calculate perceptual similarity between two image buffers.
 * Uses block-based histogram comparison, contrast analysis, and density measurement.
 */
export async function calculatePerceptualSimilarity(
  original: Buffer,
  replica: Buffer,
  options: PerceptualComparisonOptions = {}
): Promise<PerceptualScore> {
  const {
    gridSize = 8,
    histogramBins = 16,
    normalizeDimension = 512,
  } = options;

  logger.info('Calculating perceptual similarity', {
    gridSize,
    histogramBins,
    normalizeDimension,
  });

  // Normalize both images to the same dimensions
  const [imgA, imgB] = await Promise.all([
    normalizeImage(original, normalizeDimension),
    normalizeImage(replica, normalizeDimension),
  ]);

  const blockW = Math.floor(imgA.width / gridSize);
  const blockH = Math.floor(imgA.height / gridSize);

  // Block-based histogram comparison
  const blockScores: number[][] = [];
  let blockSimilaritySum = 0;
  let blockCount = 0;

  for (let by = 0; by < gridSize; by++) {
    const row: number[] = [];
    for (let bx = 0; bx < gridSize; bx++) {
      const startX = bx * blockW;
      const startY = by * blockH;

      const histA = computeBlockHistogram(imgA.pixels, imgA.width, startX, startY, blockW, blockH, histogramBins);
      const histB = computeBlockHistogram(imgB.pixels, imgB.width, startX, startY, blockW, blockH, histogramBins);

      // Combine intersection and Bhattacharyya for robustness
      const intersection = histogramIntersection(histA, histB);
      const bhattacharyya = bhattacharyyaCoefficient(histA, histB);
      const score = intersection * 0.5 + bhattacharyya * 0.5;

      row.push(parseFloat(score.toFixed(4)));
      blockSimilaritySum += score;
      blockCount++;
    }
    blockScores.push(row);
  }

  const blockSimilarity = blockCount > 0 ? blockSimilaritySum / blockCount : 0;

  // Contrast similarity
  const contrastSimilarity = compareContrast(imgA, imgB, gridSize);

  // Density similarity
  const densitySimilarity = compareDensity(imgA, imgB, gridSize);

  // Weighted overall score
  const overall = (
    blockSimilarity * 0.50 +
    contrastSimilarity * 0.25 +
    densitySimilarity * 0.25
  );

  logger.info('Perceptual similarity calculated', {
    overall: overall.toFixed(4),
    contrastSimilarity: contrastSimilarity.toFixed(4),
    densitySimilarity: densitySimilarity.toFixed(4),
  });

  return {
    overall: parseFloat(overall.toFixed(6)),
    blockScores,
    contrastSimilarity: parseFloat(contrastSimilarity.toFixed(6)),
    densitySimilarity: parseFloat(densitySimilarity.toFixed(6)),
  };
}
