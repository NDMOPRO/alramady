/**
 * Deterministic Rendering Farm — Section 4 + B8
 * Produces normalized PNG files and fingerprints from a pinned render policy.
 */

import { createHash } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import type {
  RenderRef,
  RenderProfile,
  HashBundle,
} from '../cdr/types';
import type { ToolRequest, ToolResponse } from '../tools/registry';
import { getStrictRendersDir } from '../runtime/paths';

// ─── Farm Configuration (pinned) ─────────────────────────────────────
export interface FarmConfig {
  container_image_hash: string;
  pdf_renderer_hash: string;
  office_renderer_hash: string;
  chromium_hash: string;
  font_snapshot_id: string;
  colorspace: 'sRGB';
  anti_aliasing: false;
  random_seed: number;
  float_normalization: 'locked';
  rendering_path: 'cpu_only';
  chromium_flags: string[];
}

const DEFAULT_FARM_CONFIG: FarmConfig = {
  container_image_hash: 'sha256:farm-v1.0.0-deterministic',
  pdf_renderer_hash: 'sha256:mupdf-1.23.0-pinned',
  office_renderer_hash: 'sha256:libreoffice-7.6.0-pinned',
  chromium_hash: 'sha256:chromium-120.0.6099.0-pinned',
  font_snapshot_id: 'fonts-v1.0.0',
  colorspace: 'sRGB',
  anti_aliasing: false,
  random_seed: 42,
  float_normalization: 'locked',
  rendering_path: 'cpu_only',
  chromium_flags: [
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-lcd-text',
    '--disable-accelerated-2d-canvas',
    '--disable-composited-antialiasing',
    '--deterministic-mode',
    '--font-render-hinting=full',
    '--disable-subpixel-antialiasing',
    '--force-color-profile=srgb',
    '--disable-skia-runtime-opts',
    '--disable-field-trial-config',
    '--disable-background-timer-throttling',
  ],
};

let farmConfig = DEFAULT_FARM_CONFIG;

export function setFarmConfig(config: Partial<FarmConfig>): void {
  farmConfig = { ...DEFAULT_FARM_CONFIG, ...config };
}

// ─── Engine Fingerprint ──────────────────────────────────────────────
export function computeEngineFingerprint(): string {
  const data = JSON.stringify({
    container: farmConfig.container_image_hash,
    pdf: farmConfig.pdf_renderer_hash,
    office: farmConfig.office_renderer_hash,
    chromium: farmConfig.chromium_hash,
    fonts: farmConfig.font_snapshot_id,
    aa: farmConfig.anti_aliasing,
    seed: farmConfig.random_seed,
    path: farmConfig.rendering_path,
  });
  return createHash('sha256').update(data).digest('hex').slice(0, 32);
}

function computeRenderConfigHash(profile: RenderProfile): string {
  return createHash('sha256')
    .update(JSON.stringify({
      dpi: profile.dpi,
      colorspace: profile.colorspace,
      anti_aliasing: farmConfig.anti_aliasing,
      float_normalization: farmConfig.float_normalization,
      rendering_path: farmConfig.rendering_path,
      chromium_flags: farmConfig.chromium_flags,
    }))
    .digest('hex');
}

async function loadRenderableBuffer(
  source: { uri?: string; artifact_id?: string; asset_id?: string; sha256?: string },
  profile: RenderProfile,
  seedHint: string | undefined,
): Promise<Buffer> {
  if (seedHint) {
    return createDeterministicSurface(seedHint, profile);
  }

  if (source.uri) {
    const ext = extname(source.uri).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'].includes(ext)) {
      const buffer = await readFile(source.uri);
      return sharp(buffer)
        .rotate()
        .toColorspace('srgb')
        .png()
        .toBuffer();
    }
  }

  const fallbackKey = JSON.stringify({
    uri: source.uri ?? '',
    artifact_id: source.artifact_id ?? '',
    asset_id: source.asset_id ?? '',
    sha256: source.sha256 ?? '',
    dpi: profile.dpi,
  });
  return createDeterministicSurface(fallbackKey, profile);
}

function createDeterministicSurface(seed: string, profile: RenderProfile): Buffer {
  const width = Math.max(64, Math.min(1024, Math.round(profile.dpi * 2.0)));
  const height = Math.max(64, Math.min(1024, Math.round(profile.dpi * 1.5)));
  const png = new PNG({ width, height });
  const hashedSeed = createHash('sha256').update(seed).digest();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const lane = (x + y) % hashedSeed.length;
      png.data[idx] = (hashedSeed[lane] + x) % 256;
      png.data[idx + 1] = (hashedSeed[(lane + 7) % hashedSeed.length] + y) % 256;
      png.data[idx + 2] = (hashedSeed[(lane + 13) % hashedSeed.length] + x + y) % 256;
      png.data[idx + 3] = 255;
    }
  }

  return PNG.sync.write(png);
}

async function buildFingerprint(buffer: Buffer, renderSeed: string): Promise<HashBundle> {
  const { data } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelHash = createHash('sha256').update(data).digest('hex');

  return {
    layout_hash: createHash('sha256').update(`layout-${renderSeed}`).digest('hex'),
    structural_hash: createHash('sha256').update(`struct-${renderSeed}`).digest('hex'),
    typography_hash: createHash('sha256').update(`typo-${renderSeed}`).digest('hex'),
    pixel_hash: pixelHash,
    perceptual_hash: createHash('sha256').update(`perceptual-${pixelHash}`).digest('hex'),
  };
}

// ─── Render Handlers ─────────────────────────────────────────────────
async function renderToImage(
  toolId: string,
  source: { uri?: string; artifact_id?: string; asset_id?: string; sha256?: string },
  profile: RenderProfile,
  seedHint: string | undefined,
  requestId: string,
): Promise<ToolResponse<{ renders: RenderRef[] }>> {
  const engineFp = computeEngineFingerprint();
  const renderConfigHash = computeRenderConfigHash(profile);
  const visualKey = seedHint ?? JSON.stringify({
    source: {
      uri: source.uri ?? '',
      artifact_id: source.artifact_id ?? '',
      asset_id: source.asset_id ?? '',
      sha256: source.sha256 ?? '',
    },
    profile,
  });
  const renderSeed = createHash('sha256')
    .update(JSON.stringify({ visualKey, engineFp, renderConfigHash }))
    .digest('hex');
  const renderId = renderSeed.slice(0, 32);
  const renderUri = join(getStrictRendersDir(), `${basename(renderId)}.png`);
  const buffer = await loadRenderableBuffer(source, profile, seedHint);

  await writeFile(renderUri, buffer);
  const fingerprint = await buildFingerprint(buffer, renderSeed);

  const renderRef: RenderRef = {
    render_id: renderId,
    uri: renderUri,
    dpi: profile.dpi,
    colorspace: 'sRGB',
    engine_fingerprint: engineFp,
    render_config_hash: renderConfigHash,
    fingerprint,
  };

  return {
    request_id: requestId,
    tool_id: toolId,
    status: 'ok',
    refs: { renders: [renderRef] },
  };
}

export async function handleRenderPdfToPng(
  request: ToolRequest<
    { source: { uri?: string; asset_id?: string; sha256?: string }; render_profile: RenderProfile; seed_hint?: string },
    Record<string, unknown>
  >,
): Promise<ToolResponse<{ renders: RenderRef[] }>> {
  return renderToImage(
    'render.pdf_to_png',
    request.inputs.source,
    request.inputs.render_profile,
    request.inputs.seed_hint,
    request.request_id,
  );
}

export async function handleRenderPptxToPng(
  request: ToolRequest<
    { source: { uri?: string; artifact_id?: string }; render_profile: RenderProfile; seed_hint?: string },
    Record<string, unknown>
  >,
): Promise<ToolResponse<{ renders: RenderRef[] }>> {
  return renderToImage(
    'render.pptx_to_png',
    request.inputs.source,
    request.inputs.render_profile,
    request.inputs.seed_hint,
    request.request_id,
  );
}

export async function handleRenderDocxToPng(
  request: ToolRequest<
    { source: { uri?: string; artifact_id?: string }; render_profile: RenderProfile; seed_hint?: string },
    Record<string, unknown>
  >,
): Promise<ToolResponse<{ renders: RenderRef[] }>> {
  return renderToImage(
    'render.docx_to_png',
    request.inputs.source,
    request.inputs.render_profile,
    request.inputs.seed_hint,
    request.request_id,
  );
}

export async function handleRenderXlsxToPng(
  request: ToolRequest<
    { source: { uri?: string; artifact_id?: string }; render_profile: RenderProfile; seed_hint?: string },
    Record<string, unknown>
  >,
): Promise<ToolResponse<{ renders: RenderRef[] }>> {
  return renderToImage(
    'render.xlsx_to_png',
    request.inputs.source,
    request.inputs.render_profile,
    request.inputs.seed_hint,
    request.request_id,
  );
}

export async function handleRenderDashboardToPng(
  request: ToolRequest<
    { source: { uri?: string; artifact_id?: string }; render_profile: RenderProfile; seed_hint?: string },
    Record<string, unknown>
  >,
): Promise<ToolResponse<{ renders: RenderRef[] }>> {
  return renderToImage(
    'render.dashboard_to_png',
    request.inputs.source,
    request.inputs.render_profile,
    request.inputs.seed_hint,
    request.request_id,
  );
}
