/**
 * Image Segmentation — Section 8.1 + B2
 * MUST classify regions: background | text | table | chart | icon/vector-like | photo/logo | UI-controls
 * MUST output bbox + mask + confidence per region
 */

import { randomUUID } from 'crypto';
import type {
  AssetRef,
  ImageSegRef,
  ImageSegRegion,
  RegionKind,
  Warning,
} from '../cdr/types';
import type { ToolRequest, ToolResponse } from '../tools/registry';

// ─── Segmentation Config ─────────────────────────────────────────────
export interface SegmentationConfig {
  /** Minimum confidence to accept a region */
  min_confidence: number;
  /** Enable chart detection */
  detect_charts: boolean;
  /** Enable table detection */
  detect_tables: boolean;
  /** Enable UI control detection (for dashboard screenshots) */
  detect_ui_controls: boolean;
}

const DEFAULT_CONFIG: SegmentationConfig = {
  min_confidence: 0.7,
  detect_charts: true,
  detect_tables: true,
  detect_ui_controls: true,
};

// ─── In-memory storage ───────────────────────────────────────────────
const segmentStore = new Map<string, ImageSegRef>();

export function getImageSegments(ref: { seg_id: string }): ImageSegRef | undefined {
  return segmentStore.get(ref.seg_id);
}

// ─── Tool Handler ────────────────────────────────────────────────────
export async function handleExtractImageSegments(
  request: ToolRequest<{ image_asset: AssetRef }, Record<string, unknown>>
): Promise<ToolResponse<{ image_segments: ImageSegRef }>> {
  const { image_asset } = request.inputs;
  const warnings: Warning[] = [];

  try {
    const segId = randomUUID();
    const regions = await segmentImage(image_asset, DEFAULT_CONFIG, warnings);

    const segRef: ImageSegRef = {
      seg_id: segId,
      regions,
    };

    segmentStore.set(segId, segRef);

    return {
      request_id: request.request_id,
      tool_id: 'extract.image_segments',
      status: 'ok',
      refs: { image_segments: segRef },
      warnings,
    };
  } catch (error) {
    return {
      request_id: request.request_id,
      tool_id: 'extract.image_segments',
      status: 'failed',
      refs: {
        image_segments: { seg_id: '', regions: [] },
      },
      warnings: [{
        code: 'IMG_SEG_FAILED',
        message: error instanceof Error ? error.message : String(error),
        severity: 'error',
      }],
    };
  }
}

/**
 * Segment image into classified regions.
 * In production: uses ML-based segmentation (YOLO/LayoutParser/DocTR).
 * Here: implements deterministic heuristic segmentation.
 */
async function segmentImage(
  asset: AssetRef,
  config: SegmentationConfig,
  warnings: Warning[],
): Promise<ImageSegRegion[]> {
  let sharp: typeof import('sharp');
  try {
    sharp = require('sharp');
  } catch {
    warnings.push({
      code: 'SHARP_NOT_AVAILABLE',
      message: 'sharp is required for image segmentation',
      severity: 'error',
    });
    throw new Error('sharp is required for image segmentation');
  }

  // Load and analyze image
  const fs = await import('fs/promises');
  let imageBuffer: Buffer;
  try {
    imageBuffer = await fs.readFile(asset.uri);
  } catch {
    throw new Error(`Cannot read image asset at: ${asset.uri}`);
  }

  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 1920;
  const height = metadata.height ?? 1080;

  // Get raw pixel data for analysis
  const { data: rawPixels } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const regions: ImageSegRegion[] = [];

  // Background detection — analyze edges for dominant color
  const bgColor = detectBackgroundColor(rawPixels, width, height);
  regions.push({
    region_id: randomUUID(),
    kind: 'background',
    bbox: { x: 0, y: 0, w: width, h: height },
    confidence: 0.95,
  });

  // Content region detection using connected component analysis
  const contentMask = buildContentMask(rawPixels, width, height, bgColor);
  const components = findConnectedComponents(contentMask, width, height);

  for (const component of components) {
    const kind = classifyRegion(rawPixels, width, component, config);
    if (kind === 'background') continue;

    regions.push({
      region_id: randomUUID(),
      kind,
      bbox: component.bbox,
      confidence: component.confidence,
    });
  }

  return regions;
}

interface PixelColor {
  r: number;
  g: number;
  b: number;
}

function detectBackgroundColor(pixels: Buffer, width: number, height: number): PixelColor {
  // Sample edge pixels to determine background
  const samples: PixelColor[] = [];
  const stride = 4; // RGBA

  // Top and bottom edges
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 100))) {
    const topIdx = x * stride;
    const bottomIdx = ((height - 1) * width + x) * stride;
    samples.push({ r: pixels[topIdx], g: pixels[topIdx + 1], b: pixels[topIdx + 2] });
    samples.push({ r: pixels[bottomIdx], g: pixels[bottomIdx + 1], b: pixels[bottomIdx + 2] });
  }

  // Average
  const avg = samples.reduce(
    (acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b }),
    { r: 0, g: 0, b: 0 },
  );
  const n = samples.length || 1;
  return {
    r: Math.round(avg.r / n),
    g: Math.round(avg.g / n),
    b: Math.round(avg.b / n),
  };
}

function buildContentMask(
  pixels: Buffer,
  width: number,
  height: number,
  bgColor: PixelColor,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const threshold = 30; // Color distance threshold

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dr = pixels[idx] - bgColor.r;
      const dg = pixels[idx + 1] - bgColor.g;
      const db = pixels[idx + 2] - bgColor.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      mask[y * width + x] = dist > threshold ? 1 : 0;
    }
  }

  return mask;
}

interface ComponentInfo {
  bbox: { x: number; y: number; w: number; h: number };
  pixel_count: number;
  confidence: number;
}

function findConnectedComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): ComponentInfo[] {
  const visited = new Uint8Array(width * height);
  const components: ComponentInfo[] = [];

  // Divide into grid cells for region detection
  const gridSize = 64;
  const gridCols = Math.ceil(width / gridSize);
  const gridRows = Math.ceil(height / gridSize);

  // Scan grid for content regions
  let currentRegion: { minX: number; minY: number; maxX: number; maxY: number; count: number } | null = null;

  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      const x0 = gx * gridSize;
      const y0 = gy * gridSize;
      const x1 = Math.min(x0 + gridSize, width);
      const y1 = Math.min(y0 + gridSize, height);

      let contentPixels = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (mask[y * width + x]) contentPixels++;
        }
      }

      const density = contentPixels / ((x1 - x0) * (y1 - y0));
      if (density > 0.05) {
        if (!currentRegion) {
          currentRegion = { minX: x0, minY: y0, maxX: x1, maxY: y1, count: contentPixels };
        } else {
          currentRegion.maxX = Math.max(currentRegion.maxX, x1);
          currentRegion.maxY = Math.max(currentRegion.maxY, y1);
          currentRegion.count += contentPixels;
        }
      } else if (currentRegion) {
        components.push({
          bbox: {
            x: currentRegion.minX,
            y: currentRegion.minY,
            w: currentRegion.maxX - currentRegion.minX,
            h: currentRegion.maxY - currentRegion.minY,
          },
          pixel_count: currentRegion.count,
          confidence: 0.8,
        });
        currentRegion = null;
      }
    }
    // End of row — flush
    if (currentRegion) {
      components.push({
        bbox: {
          x: currentRegion.minX,
          y: currentRegion.minY,
          w: currentRegion.maxX - currentRegion.minX,
          h: currentRegion.maxY - currentRegion.minY,
        },
        pixel_count: currentRegion.count,
        confidence: 0.8,
      });
      currentRegion = null;
    }
  }

  return components;
}

function classifyRegion(
  pixels: Buffer,
  imageWidth: number,
  component: ComponentInfo,
  config: SegmentationConfig,
): RegionKind {
  const { bbox } = component;
  const aspectRatio = bbox.w / Math.max(bbox.h, 1);
  const area = bbox.w * bbox.h;
  const density = component.pixel_count / Math.max(area, 1);

  // Heuristic classification based on shape, density, and content analysis
  // Table: rectangular, grid-like internal structure
  if (config.detect_tables && aspectRatio > 0.5 && aspectRatio < 3 && density > 0.3) {
    const hasGridLines = detectGridLines(pixels, imageWidth, bbox);
    if (hasGridLines) return 'table';
  }

  // Chart: contains colored regions, axis-like structures
  if (config.detect_charts && area > 10000) {
    const colorVariety = measureColorVariety(pixels, imageWidth, bbox);
    if (colorVariety > 5) return 'chart';
  }

  // UI controls: small, standardized shapes
  if (config.detect_ui_controls && area < 5000 && density > 0.5) {
    return 'ui_control';
  }

  // Text: high density of fine detail, horizontal banding
  if (density > 0.1 && density < 0.5 && bbox.h < imageWidth * 0.1) {
    return 'text';
  }

  // Photo/logo: large area with smooth gradients
  if (area > 20000 && density > 0.6) {
    return 'photo';
  }

  // Figure: medium area content
  if (area > 5000) {
    return 'figure';
  }

  return 'unknown';
}

function detectGridLines(
  pixels: Buffer,
  imageWidth: number,
  bbox: { x: number; y: number; w: number; h: number },
): boolean {
  // Sample horizontal and vertical lines for consistent color patterns
  let horizontalLines = 0;
  const sampleInterval = Math.max(1, Math.floor(bbox.h / 20));

  for (let dy = 0; dy < bbox.h; dy += sampleInterval) {
    let linePixels = 0;
    const y = bbox.y + dy;
    for (let dx = 0; dx < bbox.w; dx++) {
      const x = bbox.x + dx;
      const idx = (y * imageWidth + x) * 4;
      // Dark pixel on a line
      if (pixels[idx] < 80 && pixels[idx + 1] < 80 && pixels[idx + 2] < 80) {
        linePixels++;
      }
    }
    if (linePixels > bbox.w * 0.5) horizontalLines++;
  }

  return horizontalLines >= 2;
}

function measureColorVariety(
  pixels: Buffer,
  imageWidth: number,
  bbox: { x: number; y: number; w: number; h: number },
): number {
  const colorBuckets = new Set<number>();
  const sampleStep = Math.max(1, Math.floor(Math.min(bbox.w, bbox.h) / 30));

  for (let dy = 0; dy < bbox.h; dy += sampleStep) {
    for (let dx = 0; dx < bbox.w; dx += sampleStep) {
      const x = bbox.x + dx;
      const y = bbox.y + dy;
      const idx = (y * imageWidth + x) * 4;
      // Quantize to 4-bit per channel
      const r = (pixels[idx] >> 4) & 0xF;
      const g = (pixels[idx + 1] >> 4) & 0xF;
      const b = (pixels[idx + 2] >> 4) & 0xF;
      colorBuckets.add((r << 8) | (g << 4) | b);
    }
  }

  return colorBuckets.size;
}
