/**
 * Pixel Matrix Extractor
 * Decodes image buffers into raw RGB pixel matrices using sharp,
 * and generates SHA-256 hashes of pixel data for fingerprinting.
 */

import sharp from 'sharp';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

/** Result of extracting a pixel matrix from an image buffer */
export interface PixelMatrixResult {
  /** Raw RGB pixel data (3 bytes per pixel, row-major order) */
  matrix: Uint8Array;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Number of channels (always 3 for RGB) */
  channels: 3;
  /** Total number of pixels */
  pixelCount: number;
}

/** Options for pixel matrix extraction */
export interface ExtractOptions {
  /** Maximum dimension (width or height) to resize to before extraction */
  maxDimension?: number;
  /** Whether to normalize pixel values to 0–255 range */
  normalize?: boolean;
  /** Target color space */
  colorSpace?: 'srgb' | 'linear';
}

/** Statistics about a pixel matrix */
export interface PixelStatistics {
  meanR: number;
  meanG: number;
  meanB: number;
  stdR: number;
  stdG: number;
  stdB: number;
  minLuminance: number;
  maxLuminance: number;
  meanLuminance: number;
}

/**
 * Extract raw RGB pixel matrix from an image buffer using sharp.
 * Always outputs 3-channel sRGB data regardless of input format.
 */
export async function extractPixelMatrix(
  imageBuffer: Buffer,
  options: ExtractOptions = {}
): Promise<PixelMatrixResult> {
  const { maxDimension, colorSpace = 'srgb' } = options;

  logger.info('Extracting pixel matrix from image buffer', {
    bufferSize: imageBuffer.length,
    maxDimension,
    colorSpace,
  });

  let pipeline = sharp(imageBuffer).removeAlpha().toColorspace(colorSpace === 'linear' ? 'b-w' : 'srgb');

  if (maxDimension) {
    pipeline = pipeline.resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const { data, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });

  const matrix = new Uint8Array(data.buffer, data.byteOffset, data.length);

  logger.info('Pixel matrix extracted', {
    width: info.width,
    height: info.height,
    channels: info.channels,
    totalBytes: matrix.length,
  });

  return {
    matrix,
    width: info.width,
    height: info.height,
    channels: 3,
    pixelCount: info.width * info.height,
  };
}

/**
 * Generate a SHA-256 hash of a pixel matrix.
 * The hash uniquely identifies the pixel content.
 */
export function generatePixelHash(matrix: Uint8Array): string {
  const hash = crypto.createHash('sha256');
  hash.update(matrix);
  return hash.digest('hex');
}

/**
 * Generate a SHA-256 hash that also encodes dimensions.
 * This distinguishes identical pixel data at different resolutions.
 */
export function generateDimensionalHash(
  matrix: Uint8Array,
  width: number,
  height: number
): string {
  const hash = crypto.createHash('sha256');
  const header = Buffer.alloc(8);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  hash.update(header);
  hash.update(matrix);
  return hash.digest('hex');
}

/**
 * Compute basic statistical properties of the pixel matrix.
 * Useful for quick similarity checks before full comparison.
 */
export function computePixelStatistics(
  matrix: Uint8Array,
  width: number,
  height: number
): PixelStatistics {
  const pixelCount = width * height;
  let sumR = 0, sumG = 0, sumB = 0;
  let sumR2 = 0, sumG2 = 0, sumB2 = 0;
  let minLum = 255, maxLum = 0, sumLum = 0;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 3;
    const r = matrix[offset];
    const g = matrix[offset + 1];
    const b = matrix[offset + 2];

    sumR += r;
    sumG += g;
    sumB += b;
    sumR2 += r * r;
    sumG2 += g * g;
    sumB2 += b * b;

    // ITU-R BT.601 luminance
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
    sumLum += lum;
  }

  const meanR = sumR / pixelCount;
  const meanG = sumG / pixelCount;
  const meanB = sumB / pixelCount;

  return {
    meanR,
    meanG,
    meanB,
    stdR: Math.sqrt(sumR2 / pixelCount - meanR * meanR),
    stdG: Math.sqrt(sumG2 / pixelCount - meanG * meanG),
    stdB: Math.sqrt(sumB2 / pixelCount - meanB * meanB),
    minLuminance: minLum,
    maxLuminance: maxLum,
    meanLuminance: sumLum / pixelCount,
  };
}

/**
 * Extract a sub-region of the pixel matrix.
 * Returns a new Uint8Array containing only pixels within the bounding box.
 */
export function extractSubMatrix(
  matrix: Uint8Array,
  srcWidth: number,
  x: number,
  y: number,
  regionWidth: number,
  regionHeight: number
): Uint8Array {
  const sub = new Uint8Array(regionWidth * regionHeight * 3);
  for (let row = 0; row < regionHeight; row++) {
    const srcOffset = ((y + row) * srcWidth + x) * 3;
    const dstOffset = row * regionWidth * 3;
    sub.set(matrix.subarray(srcOffset, srcOffset + regionWidth * 3), dstOffset);
  }
  return sub;
}

/**
 * Compute a color histogram for the pixel matrix (or a sub-region).
 * Bins each channel into the specified number of bins.
 */
export function computeColorHistogram(
  matrix: Uint8Array,
  bins: number = 16
): { r: Float64Array; g: Float64Array; b: Float64Array } {
  const rHist = new Float64Array(bins);
  const gHist = new Float64Array(bins);
  const bHist = new Float64Array(bins);
  const binScale = bins / 256;
  const pixelCount = matrix.length / 3;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 3;
    rHist[Math.min(Math.floor(matrix[offset] * binScale), bins - 1)]++;
    gHist[Math.min(Math.floor(matrix[offset + 1] * binScale), bins - 1)]++;
    bHist[Math.min(Math.floor(matrix[offset + 2] * binScale), bins - 1)]++;
  }

  // Normalize to probability distribution
  for (let b = 0; b < bins; b++) {
    rHist[b] /= pixelCount;
    gHist[b] /= pixelCount;
    bHist[b] /= pixelCount;
  }

  return { r: rHist, g: gHist, b: bHist };
}
