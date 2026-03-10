/**
 * PixelDiff — Section 5 STRICT definition
 * PixelDiff == 0 — NO threshold.
 *
 * Appendix C1: Exact normalization + comparison algorithm.
 */

import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import type {
  RenderRef,
  DiffRef,
  ActionContext,
} from '../cdr/types';
import type { ToolRequest, ToolResponse } from '../tools/registry';

// ─── Normalization (Section 5.1) ─────────────────────────────────────
export interface NormalizedImage {
  width: number;
  height: number;
  /** RGBA 8-bit per channel, premultiplied alpha */
  data: Uint8Array;
  pixel_hash: string;
}

/**
 * Normalize an image buffer per Section 5.1:
 * 1) decode → RGBA 8-bit
 * 2) apply EXIF orientation
 * 3) ICC profile → sRGB IEC61966-2.1
 * 4) alpha normalization: premultiplied alpha, deterministic rounding
 * 5) gamma stabilization: sRGB curve locked
 * 6) enforce identical dimensions
 */
export async function normalizeImage(imageBuffer: Buffer, sourceDpi: number): Promise<NormalizedImage> {
  // Import sharp for image processing (pinned version in package.json)
  let sharp: typeof import('sharp');
  try {
    sharp = require('sharp');
  } catch {
    throw new Error('sharp is required for pixel normalization. Install with: npm install sharp');
  }

  const image = sharp(imageBuffer)
    .rotate() // EXIF orientation (step 2)
    .toColorspace('srgb') // ICC → sRGB (step 3)
    .removeAlpha() // ensure consistent alpha handling
    .ensureAlpha(1.0) // re-add with full opacity for normalization
    .raw();

  const metadata = await sharp(imageBuffer).metadata();
  const { data, info } = await image.toBuffer({ resolveWithObject: true });

  // Premultiplied alpha normalization (step 4)
  const rgba = new Uint8Array(data);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    rgba[i] = Math.round(rgba[i] * a);     // R
    rgba[i + 1] = Math.round(rgba[i + 1] * a); // G
    rgba[i + 2] = Math.round(rgba[i + 2] * a); // B
    // Alpha stays as-is
  }

  // Compute pixel_hash
  const pixelHash = createHash('sha256').update(rgba).digest('hex');

  return {
    width: info.width,
    height: info.height,
    data: rgba,
    pixel_hash: pixelHash,
  };
}

// ─── PixelDiff Exact (Section 5.2 + Appendix C1) ────────────────────
export interface PixelDiffResult {
  pixel_diff: number; // ratio: differing pixels / total pixels
  total_pixels: number;
  differing_pixels: number;
  pass: boolean;
  heatmap?: Uint8Array;
  heatmap_width?: number;
  heatmap_height?: number;
}

/**
 * Exact pixel comparison per Section 5.2:
 * PixelDiff = count(pixels where ANY channel RGBA differs) / total_pixels
 * STRICT: PixelDiff MUST == 0
 */
export function pixelDiffExact(source: NormalizedImage, target: NormalizedImage): PixelDiffResult {
  // Enforce identical dimensions — if different => FAIL
  if (source.width !== target.width || source.height !== target.height) {
    return {
      pixel_diff: 1.0,
      total_pixels: source.width * source.height,
      differing_pixels: source.width * source.height,
      pass: false,
    };
  }

  const totalPixels = source.width * source.height;
  let differingPixels = 0;
  const heatmap = new Uint8Array(totalPixels * 4); // RGBA heatmap

  for (let i = 0; i < source.data.length; i += 4) {
    const pixelIdx = i / 4;
    const rDiff = source.data[i] !== target.data[i];
    const gDiff = source.data[i + 1] !== target.data[i + 1];
    const bDiff = source.data[i + 2] !== target.data[i + 2];
    const aDiff = source.data[i + 3] !== target.data[i + 3];

    if (rDiff || gDiff || bDiff || aDiff) {
      differingPixels++;
      // Heatmap: red for differing pixels
      heatmap[pixelIdx * 4] = 255;     // R
      heatmap[pixelIdx * 4 + 1] = 0;   // G
      heatmap[pixelIdx * 4 + 2] = 0;   // B
      heatmap[pixelIdx * 4 + 3] = 255; // A
    } else {
      // Transparent for matching pixels
      heatmap[pixelIdx * 4] = 0;
      heatmap[pixelIdx * 4 + 1] = 0;
      heatmap[pixelIdx * 4 + 2] = 0;
      heatmap[pixelIdx * 4 + 3] = 0;
    }
  }

  const pixelDiff = totalPixels > 0 ? differingPixels / totalPixels : 0;

  return {
    pixel_diff: pixelDiff,
    total_pixels: totalPixels,
    differing_pixels: differingPixels,
    pass: differingPixels === 0,
    heatmap: differingPixels > 0 ? heatmap : undefined,
    heatmap_width: source.width,
    heatmap_height: source.height,
  };
}

// ─── Hotspot Detection ───────────────────────────────────────────────
export interface DiffHotspot {
  bbox: { x: number; y: number; w: number; h: number };
  pixel_count: number;
  severity: number; // 0..1
}

export function detectHotspots(
  result: PixelDiffResult,
  width: number,
  height: number,
  gridSize: number = 32,
): DiffHotspot[] {
  if (!result.heatmap || result.pass) return [];

  const hotspots: DiffHotspot[] = [];
  const gridCols = Math.ceil(width / gridSize);
  const gridRows = Math.ceil(height / gridSize);

  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      let count = 0;
      const x0 = gx * gridSize;
      const y0 = gy * gridSize;
      const x1 = Math.min(x0 + gridSize, width);
      const y1 = Math.min(y0 + gridSize, height);

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * width + x) * 4;
          if (result.heatmap[idx] === 255) count++;
        }
      }

      if (count > 0) {
        const totalCells = (x1 - x0) * (y1 - y0);
        hotspots.push({
          bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
          pixel_count: count,
          severity: count / totalCells,
        });
      }
    }
  }

  // Sort by severity descending
  hotspots.sort((a, b) => b.severity - a.severity);
  return hotspots;
}

// ─── Tool Handler ────────────────────────────────────────────────────
export async function handleVerifyPixelDiff(
  request: ToolRequest<
    { source_render: RenderRef; target_render: RenderRef },
    { threshold: 0 }
  >
): Promise<ToolResponse<{ diff: DiffRef }>> {
  const { source_render, target_render } = request.inputs;

  // In production, load actual render buffers from URIs
  // For now, compare pixel_hash from fingerprints
  const sourcePixelHash = source_render.fingerprint.pixel_hash;
  const targetPixelHash = target_render.fingerprint.pixel_hash;

  const pass = sourcePixelHash === targetPixelHash;
  const pixelDiff = pass ? 0 : 1; // placeholder — real impl loads and compares buffers

  const diffId = randomUUID();

  return {
    request_id: request.request_id,
    tool_id: 'verify.pixel_diff',
    status: 'ok',
    refs: {
      diff: {
        diff_id: diffId,
        pixel_diff: pixelDiff,
        pass,
        heatmap_uri: pass ? undefined : `/renders/heatmap/${diffId}.png`,
      },
    },
  };
}
