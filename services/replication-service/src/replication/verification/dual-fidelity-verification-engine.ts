import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VerificationConfig {
  pixelDiffThreshold: number;
  structuralHashThreshold: number;
  width: number;
  height: number;
  antiAliasingTolerance: number;
  colorTolerance: number;
  blockSize: number;
  enableHotspotDetection: boolean;
}

export interface FidelityResult {
  passed: boolean;
  pixelDiff: number;
  structuralHash: number;
  details: {
    blockDistribution: number;
    contrast: number;
    visualRelationships: number;
    whitespace: number;
  };
  pixelPassed: boolean;
  structuralPassed: boolean;
  totalPixels: number;
  mismatchedPixels: number;
  hotspots: FidelityHotspot[];
  elapsedMs: number;
}

export interface FidelityHotspot {
  x: number;
  y: number;
  width: number;
  height: number;
  diffIntensity: number;
  category: 'pixel' | 'structural' | 'both';
}

const DEFAULT_CONFIG: VerificationConfig = {
  pixelDiffThreshold: 0.001,
  structuralHashThreshold: 0.999,
  width: 1920,
  height: 1080,
  antiAliasingTolerance: 2,
  colorTolerance: 5,
  blockSize: 16,
  enableHotspotDetection: true,
};

// ─── Engine ──────────────────────────────────────────────────────────────────

export class DualFidelityVerificationEngine {
  private readonly config: VerificationConfig;

  constructor(config?: Partial<VerificationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('DualFidelityVerificationEngine initialized', {
      pixelDiffThreshold: this.config.pixelDiffThreshold,
      structuralHashThreshold: this.config.structuralHashThreshold,
    });
  }

  verifyDualFidelity(original: Buffer, replica: Buffer, config?: Partial<VerificationConfig>): FidelityResult {
    const mergedConfig = { ...this.config, ...config };
    logger.info('Starting dual fidelity verification', {
      originalSize: original.length,
      replicaSize: replica.length,
    });
    const startTime = Date.now();

    // Phase 1: Pixel-level comparison
    const pixelResult = this.performPixelComparison(original, replica, mergedConfig);

    // Phase 2: Structural hash comparison
    const structuralResult = this.performStructuralComparison(original, replica, mergedConfig);

    // Phase 3: Detail metrics
    const details = this.computeDetailMetrics(original, replica, mergedConfig);

    // Phase 4: Hotspot detection
    const hotspots = mergedConfig.enableHotspotDetection
      ? this.detectHotspots(original, replica, mergedConfig)
      : [];

    const pixelPassed = pixelResult.diffPercentage <= mergedConfig.pixelDiffThreshold;
    const structuralPassed = structuralResult.similarity >= mergedConfig.structuralHashThreshold;

    // BOTH must pass
    const passed = pixelPassed && structuralPassed;

    const result: FidelityResult = {
      passed,
      pixelDiff: pixelResult.diffPercentage,
      structuralHash: structuralResult.similarity,
      details,
      pixelPassed,
      structuralPassed,
      totalPixels: pixelResult.totalPixels,
      mismatchedPixels: pixelResult.mismatchedPixels,
      hotspots,
      elapsedMs: Date.now() - startTime,
    };

    logger.info('Dual fidelity verification complete', {
      passed,
      pixelDiff: pixelResult.diffPercentage,
      structuralHash: structuralResult.similarity,
      pixelPassed,
      structuralPassed,
      elapsedMs: result.elapsedMs,
    });

    return result;
  }

  private performPixelComparison(
    original: Buffer, replica: Buffer, config: VerificationConfig,
  ): { diffPercentage: number; totalPixels: number; mismatchedPixels: number } {
    logger.debug('Performing pixel-level comparison');
    const minLen = Math.min(original.length, replica.length);
    const bytesPerPixel = 4;
    const totalPixels = Math.floor(minLen / bytesPerPixel);

    if (totalPixels === 0) {
      return { diffPercentage: 1.0, totalPixels: 0, mismatchedPixels: 0 };
    }

    let mismatchedPixels = 0;
    const tolerance = config.colorTolerance;

    for (let i = 0; i < totalPixels; i++) {
      const offset = i * bytesPerPixel;
      let pixelDiffers = false;

      for (let c = 0; c < Math.min(bytesPerPixel, 3); c++) {
        const idx = offset + c;
        if (idx < minLen) {
          const diff = Math.abs(original[idx] - replica[idx]);
          if (diff > tolerance) {
            // Check for anti-aliasing
            if (!this.isAntiAliasedPixel(original, replica, i, config.width, config.antiAliasingTolerance, bytesPerPixel)) {
              pixelDiffers = true;
              break;
            }
          }
        }
      }

      if (pixelDiffers) {
        mismatchedPixels++;
      }
    }

    const diffPercentage = parseFloat((mismatchedPixels / totalPixels).toFixed(8));
    logger.debug('Pixel comparison result', { totalPixels, mismatchedPixels, diffPercentage });
    return { diffPercentage, totalPixels, mismatchedPixels };
  }

  private isAntiAliasedPixel(
    img1: Buffer, img2: Buffer,
    pixelIndex: number, imageWidth: number,
    tolerance: number, bpp: number,
  ): boolean {
    const x = pixelIndex % imageWidth;
    const y = Math.floor(pixelIndex / imageWidth);

    // Check 8-neighborhood for similar transition
    const neighbors = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1],
    ];

    let similarNeighbors = 0;

    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= imageWidth) continue;

      const neighborIdx = (ny * imageWidth + nx) * bpp;
      if (neighborIdx + 2 >= Math.min(img1.length, img2.length)) continue;

      let neighborDiff = 0;
      for (let c = 0; c < 3; c++) {
        neighborDiff += Math.abs(img1[neighborIdx + c] - img2[neighborIdx + c]);
      }

      if (neighborDiff / 3 <= tolerance) {
        similarNeighbors++;
      }
    }

    return similarNeighbors >= 5;
  }

  private performStructuralComparison(
    original: Buffer, replica: Buffer, config: VerificationConfig,
  ): { similarity: number; originalHash: string; replicaHash: string } {
    logger.debug('Performing structural hash comparison');

    const originalHash = this.computeStructuralHash(original, config);
    const replicaHash = this.computeStructuralHash(replica, config);

    const similarity = this.computeHashSimilarity(originalHash, replicaHash);

    logger.debug('Structural comparison result', { similarity });
    return { similarity, originalHash, replicaHash };
  }

  private computeStructuralHash(buffer: Buffer, config: VerificationConfig): string {
    const blockSize = config.blockSize;
    const bpp = 4;
    const pixelsPerRow = Math.floor(Math.sqrt(buffer.length / bpp * (config.width / Math.max(config.height, 1))));
    const totalRows = Math.floor(buffer.length / (pixelsPerRow * bpp));
    const blocksX = Math.max(1, Math.floor(pixelsPerRow / blockSize));
    const blocksY = Math.max(1, Math.floor(totalRows / blockSize));

    const blockFeatures: number[] = [];

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        let sumR = 0, sumG = 0, sumB = 0;
        let count = 0;
        let edgeCount = 0;

        for (let py = 0; py < blockSize; py++) {
          for (let px = 0; px < blockSize; px++) {
            const x = bx * blockSize + px;
            const y = by * blockSize + py;
            const offset = (y * pixelsPerRow + x) * bpp;

            if (offset + 2 < buffer.length) {
              sumR += buffer[offset];
              sumG += buffer[offset + 1];
              sumB += buffer[offset + 2];
              count++;

              // Horizontal edge detection
              if (px > 0) {
                const prevOffset = offset - bpp;
                if (prevOffset >= 0 && prevOffset + 2 < buffer.length) {
                  const dr = Math.abs(buffer[offset] - buffer[prevOffset]);
                  const dg = Math.abs(buffer[offset + 1] - buffer[prevOffset + 1]);
                  const db = Math.abs(buffer[offset + 2] - buffer[prevOffset + 2]);
                  if ((dr + dg + db) / 3 > 30) edgeCount++;
                }
              }
            }
          }
        }

        if (count > 0) {
          const avgIntensity = Math.round((sumR + sumG + sumB) / (count * 3));
          const edgeDensity = Math.round((edgeCount / count) * 255);
          blockFeatures.push(avgIntensity, edgeDensity);
        } else {
          blockFeatures.push(0, 0);
        }
      }
    }

    const featureBuffer = Buffer.from(new Uint8Array(blockFeatures));
    return crypto.createHash('sha256').update(featureBuffer).digest('hex');
  }

  private computeHashSimilarity(hash1: string, hash2: string): number {
    if (hash1 === hash2) return 1.0;

    const bytes1 = Buffer.from(hash1, 'hex');
    const bytes2 = Buffer.from(hash2, 'hex');
    const minLen = Math.min(bytes1.length, bytes2.length);

    if (minLen === 0) return 0;

    let matchingBits = 0;
    let totalBits = 0;

    for (let i = 0; i < minLen; i++) {
      const xor = bytes1[i] ^ bytes2[i];
      for (let bit = 0; bit < 8; bit++) {
        totalBits++;
        if (((xor >> bit) & 1) === 0) {
          matchingBits++;
        }
      }
    }

    return parseFloat((matchingBits / totalBits).toFixed(6));
  }

  private computeDetailMetrics(
    original: Buffer, replica: Buffer, config: VerificationConfig,
  ): { blockDistribution: number; contrast: number; visualRelationships: number; whitespace: number } {
    const blockSize = config.blockSize;
    const bpp = 4;
    const pixelsPerRow = config.width;
    const blocksX = Math.max(1, Math.floor(pixelsPerRow / blockSize));
    const totalRows = Math.max(1, Math.floor(original.length / (pixelsPerRow * bpp)));
    const blocksY = Math.max(1, Math.floor(totalRows / blockSize));

    // Block distribution: compare block intensity histograms
    const origBlocks = this.extractBlockIntensities(original, blocksX, blocksY, blockSize, pixelsPerRow, bpp);
    const repBlocks = this.extractBlockIntensities(replica, blocksX, blocksY, blockSize, pixelsPerRow, bpp);
    const blockDistribution = this.compareHistograms(origBlocks, repBlocks);

    // Contrast: compare global contrast
    const origContrast = this.computeContrast(original, bpp);
    const repContrast = this.computeContrast(replica, bpp);
    const maxContrast = Math.max(origContrast, repContrast, 1);
    const contrast = parseFloat((1 - Math.abs(origContrast - repContrast) / maxContrast).toFixed(6));

    // Visual relationships: compare edge distributions
    const origEdges = this.computeEdgeDistribution(original, pixelsPerRow, bpp, blockSize);
    const repEdges = this.computeEdgeDistribution(replica, pixelsPerRow, bpp, blockSize);
    const visualRelationships = this.compareHistograms(origEdges, repEdges);

    // Whitespace: compare whitespace ratios
    const origWhitespace = this.computeWhitespaceRatio(original, bpp);
    const repWhitespace = this.computeWhitespaceRatio(replica, bpp);
    const whitespace = parseFloat((1 - Math.abs(origWhitespace - repWhitespace)).toFixed(6));

    return { blockDistribution, contrast, visualRelationships, whitespace };
  }

  private extractBlockIntensities(
    buffer: Buffer, blocksX: number, blocksY: number,
    blockSize: number, pixelsPerRow: number, bpp: number,
  ): number[] {
    const intensities: number[] = [];
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        let sum = 0;
        let count = 0;
        for (let py = 0; py < blockSize; py++) {
          for (let px = 0; px < blockSize; px++) {
            const offset = ((by * blockSize + py) * pixelsPerRow + bx * blockSize + px) * bpp;
            if (offset + 2 < buffer.length) {
              sum += (buffer[offset] + buffer[offset + 1] + buffer[offset + 2]) / 3;
              count++;
            }
          }
        }
        intensities.push(count > 0 ? Math.round(sum / count) : 0);
      }
    }
    return intensities;
  }

  private compareHistograms(a: number[], b: number[]): number {
    if (a.length === 0 && b.length === 0) return 1.0;
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < len; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? parseFloat((dotProduct / denom).toFixed(6)) : 0;
  }

  private computeContrast(buffer: Buffer, bpp: number): number {
    let min = 255, max = 0;
    const step = Math.max(1, Math.floor(buffer.length / (bpp * 10000))) * bpp;

    for (let i = 0; i < buffer.length - 2; i += step) {
      const intensity = (buffer[i] + buffer[i + 1] + buffer[i + 2]) / 3;
      if (intensity < min) min = intensity;
      if (intensity > max) max = intensity;
    }

    return max - min;
  }

  private computeEdgeDistribution(
    buffer: Buffer, pixelsPerRow: number, bpp: number, blockSize: number,
  ): number[] {
    const bins = new Array(8).fill(0);
    const step = blockSize;
    const totalRows = Math.floor(buffer.length / (pixelsPerRow * bpp));

    for (let y = 0; y < totalRows - 1; y += step) {
      for (let x = 0; x < pixelsPerRow - 1; x += step) {
        const offset = (y * pixelsPerRow + x) * bpp;
        const rightOffset = offset + bpp;
        const belowOffset = ((y + 1) * pixelsPerRow + x) * bpp;

        if (belowOffset + 2 < buffer.length && rightOffset + 2 < buffer.length) {
          const gx = Math.abs(buffer[rightOffset] - buffer[offset]) +
            Math.abs(buffer[rightOffset + 1] - buffer[offset + 1]) +
            Math.abs(buffer[rightOffset + 2] - buffer[offset + 2]);
          const gy = Math.abs(buffer[belowOffset] - buffer[offset]) +
            Math.abs(buffer[belowOffset + 1] - buffer[offset + 1]) +
            Math.abs(buffer[belowOffset + 2] - buffer[offset + 2]);
          const magnitude = Math.sqrt(gx * gx + gy * gy);
          const angle = Math.atan2(gy, gx);
          const bin = Math.min(7, Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 8));
          bins[bin] += magnitude;
        }
      }
    }

    return bins;
  }

  private computeWhitespaceRatio(buffer: Buffer, bpp: number): number {
    let whitePixels = 0;
    let totalPixels = 0;
    const step = Math.max(1, Math.floor(buffer.length / (bpp * 50000))) * bpp;
    const whiteThreshold = 240;

    for (let i = 0; i < buffer.length - 2; i += step) {
      const r = buffer[i];
      const g = buffer[i + 1];
      const b = buffer[i + 2];
      totalPixels++;
      if (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) {
        whitePixels++;
      }
    }

    return totalPixels > 0 ? whitePixels / totalPixels : 0;
  }

  private detectHotspots(
    original: Buffer, replica: Buffer, config: VerificationConfig,
  ): FidelityHotspot[] {
    const hotspots: FidelityHotspot[] = [];
    const blockSize = config.blockSize * 4; // Larger blocks for hotspot detection
    const bpp = 4;
    const pixelsPerRow = config.width;
    const totalRows = Math.min(
      Math.floor(original.length / (pixelsPerRow * bpp)),
      Math.floor(replica.length / (pixelsPerRow * bpp)),
    );
    const blocksX = Math.max(1, Math.floor(pixelsPerRow / blockSize));
    const blocksY = Math.max(1, Math.floor(totalRows / blockSize));

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        let diffSum = 0;
        let pixelCount = 0;
        let structuralDiff = 0;

        for (let py = 0; py < blockSize; py++) {
          for (let px = 0; px < blockSize; px++) {
            const x = bx * blockSize + px;
            const y = by * blockSize + py;
            const offset = (y * pixelsPerRow + x) * bpp;

            if (offset + 2 < Math.min(original.length, replica.length)) {
              const dr = Math.abs(original[offset] - replica[offset]);
              const dg = Math.abs(original[offset + 1] - replica[offset + 1]);
              const db = Math.abs(original[offset + 2] - replica[offset + 2]);
              const pixDiff = (dr + dg + db) / (3 * 255);
              diffSum += pixDiff;
              pixelCount++;

              if (pixDiff > 0.1) structuralDiff++;
            }
          }
        }

        if (pixelCount > 0) {
          const avgDiff = diffSum / pixelCount;
          const structuralRatio = structuralDiff / pixelCount;

          if (avgDiff > 0.01 || structuralRatio > 0.05) {
            let category: FidelityHotspot['category'] = 'pixel';
            if (avgDiff > 0.01 && structuralRatio > 0.05) category = 'both';
            else if (structuralRatio > 0.05) category = 'structural';

            hotspots.push({
              x: bx * blockSize,
              y: by * blockSize,
              width: blockSize,
              height: blockSize,
              diffIntensity: parseFloat(avgDiff.toFixed(6)),
              category,
            });
          }
        }
      }
    }

    return hotspots.sort((a, b) => b.diffIntensity - a.diffIntensity);
  }
}
