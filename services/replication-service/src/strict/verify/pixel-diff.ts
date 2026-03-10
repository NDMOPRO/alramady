/**
 * PixelDiff — Section 5 STRICT definition.
 * Compares actual normalized render files and emits a heatmap on failure.
 */

import { createHash, randomUUID } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import type {
  RenderRef,
  DiffRef,
} from '../cdr/types';
import type { ToolRequest, ToolResponse } from '../tools/registry';
import { getStrictHeatmapsDir } from '../runtime/paths';

// ─── Normalization (Section 5.1) ─────────────────────────────────────
export interface NormalizedImage {
  width: number;
  height: number;
  data: Uint8Array;
  pixel_hash: string;
}

export async function normalizeImage(imageBuffer: Buffer): Promise<NormalizedImage> {
  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .toColorspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = new Uint8Array(data);
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3] / 255;
    rgba[i] = Math.round(rgba[i] * alpha);
    rgba[i + 1] = Math.round(rgba[i + 1] * alpha);
    rgba[i + 2] = Math.round(rgba[i + 2] * alpha);
  }

  return {
    width: info.width,
    height: info.height,
    data: rgba,
    pixel_hash: createHash('sha256').update(rgba).digest('hex'),
  };
}

// ─── PixelDiff Exact (Section 5.2 + Appendix C1) ────────────────────
export interface PixelDiffResult {
  pixel_diff: number;
  total_pixels: number;
  differing_pixels: number;
  pass: boolean;
  heatmap?: Uint8Array;
  heatmap_width?: number;
  heatmap_height?: number;
}

export function pixelDiffExact(source: NormalizedImage, target: NormalizedImage): PixelDiffResult {
  if (source.width !== target.width || source.height !== target.height) {
    return {
      pixel_diff: 1,
      total_pixels: Math.max(source.width * source.height, target.width * target.height),
      differing_pixels: Math.max(source.width * source.height, target.width * target.height),
      pass: false,
    };
  }

  const totalPixels = source.width * source.height;
  let differingPixels = 0;
  const heatmap = new Uint8Array(totalPixels * 4);

  for (let i = 0; i < source.data.length; i += 4) {
    const pixelIdx = i / 4;
    const differs =
      source.data[i] !== target.data[i] ||
      source.data[i + 1] !== target.data[i + 1] ||
      source.data[i + 2] !== target.data[i + 2] ||
      source.data[i + 3] !== target.data[i + 3];

    if (differs) {
      differingPixels += 1;
      heatmap[pixelIdx * 4] = 255;
      heatmap[pixelIdx * 4 + 1] = 0;
      heatmap[pixelIdx * 4 + 2] = 0;
      heatmap[pixelIdx * 4 + 3] = 255;
    }
  }

  return {
    pixel_diff: totalPixels === 0 ? 0 : differingPixels / totalPixels,
    total_pixels: totalPixels,
    differing_pixels: differingPixels,
    pass: differingPixels === 0,
    heatmap: differingPixels > 0 ? heatmap : undefined,
    heatmap_width: source.width,
    heatmap_height: source.height,
  };
}

async function writeHeatmap(
  diffId: string,
  heatmap: Uint8Array,
  width: number,
  height: number,
): Promise<string> {
  const png = new PNG({ width, height });
  png.data.set(heatmap);
  const filePath = join(getStrictHeatmapsDir(), `${diffId}.png`);
  await writeFile(filePath, PNG.sync.write(png));
  return filePath;
}

// ─── Tool Handler ────────────────────────────────────────────────────
export async function handleVerifyPixelDiff(
  request: ToolRequest<
    { source_render: RenderRef; target_render: RenderRef },
    { threshold: 0 }
  >,
): Promise<ToolResponse<{ diff: DiffRef }>> {
  const { source_render, target_render } = request.inputs;
  const [sourceBuffer, targetBuffer] = await Promise.all([
    readFile(source_render.uri),
    readFile(target_render.uri),
  ]);
  const [normalizedSource, normalizedTarget] = await Promise.all([
    normalizeImage(sourceBuffer),
    normalizeImage(targetBuffer),
  ]);

  const result = pixelDiffExact(normalizedSource, normalizedTarget);
  const diffId = randomUUID();
  const heatmapUri = result.heatmap && result.heatmap_width && result.heatmap_height
    ? await writeHeatmap(diffId, result.heatmap, result.heatmap_width, result.heatmap_height)
    : undefined;

  return {
    request_id: request.request_id,
    tool_id: 'verify.pixel_diff',
    status: result.pass ? 'ok' : 'failed',
    refs: {
      diff: {
        diff_id: diffId,
        pixel_diff: result.pixel_diff,
        pass: result.pass,
        heatmap_uri: heatmapUri,
      },
    },
  };
}
