import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { createLogger, format, transports } from 'winston';
import { randomUUID } from 'crypto';
import type { BoundingBox } from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'vector-reconstruction' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface VectorReconstructionRequest {
  imageBuffer: Buffer;
  regions: VectorRegion[];
  options?: VectorReconstructionOptions;
}

export interface VectorRegion {
  id: string;
  bbox: BoundingBox;
  type: 'icon' | 'logo' | 'shape' | 'divider' | 'decoration' | 'chart-element' | 'auto';
}

export interface VectorReconstructionOptions {
  traceMethod: 'potrace' | 'ai' | 'hybrid';
  smoothing: number;
  optimizePaths: boolean;
  colorMode: 'full' | 'monochrome' | 'limited';
  maxColors: number;
  minPathLength: number;
  outputFormat: 'svg' | 'svg_component';
}

const DEFAULT_OPTIONS: VectorReconstructionOptions = {
  traceMethod: 'ai',
  smoothing: 1.0,
  optimizePaths: true,
  colorMode: 'full',
  maxColors: 32,
  minPathLength: 4,
  outputFormat: 'svg',
};

export interface VectorReconstructionResult {
  id: string;
  vectors: ReconstructedVector[];
  totalPathCount: number;
  totalColorCount: number;
  processingTimeMs: number;
}

export interface ReconstructedVector {
  id: string;
  regionId: string;
  svgContent: string;
  viewBox: string;
  paths: SvgPath[];
  colors: string[];
  width: number;
  height: number;
  confidence: number;
}

export interface SvgPath {
  d: string;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class VectorReconstructionService {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  async reconstructVectors(request: VectorReconstructionRequest): Promise<VectorReconstructionResult> {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...request.options };
    const resultId = randomUUID();

    logger.info('Starting vector reconstruction', { regions: request.regions.length, method: options.traceMethod });

    const vectors: ReconstructedVector[] = [];

    for (const region of request.regions) {
      const regionBuffer = await this.extractRegion(request.imageBuffer, region.bbox);

      let vector: ReconstructedVector;
      if (options.traceMethod === 'ai' || options.traceMethod === 'hybrid') {
        vector = await this.reconstructWithAI(regionBuffer, region, options);
      } else {
        vector = await this.reconstructWithTracing(regionBuffer, region, options);
      }

      if (options.optimizePaths) {
        vector = this.optimizeSvgPaths(vector);
      }

      vectors.push(vector);
    }

    const totalPathCount = vectors.reduce((sum, v) => sum + v.paths.length, 0);
    const allColors = new Set<string>();
    for (const v of vectors) {
      for (const c of v.colors) allColors.add(c);
    }

    const result: VectorReconstructionResult = {
      id: resultId,
      vectors,
      totalPathCount,
      totalColorCount: allColors.size,
      processingTimeMs: Date.now() - startTime,
    };

    logger.info('Vector reconstruction complete', {
      vectors: vectors.length,
      paths: totalPathCount,
      colors: allColors.size,
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  }

  // ─── AI-based Reconstruction ────────────────────────────────────────────────

  private async reconstructWithAI(
    regionBuffer: Buffer,
    region: VectorRegion,
    options: VectorReconstructionOptions,
  ): Promise<ReconstructedVector> {
    const meta = await sharp(regionBuffer).metadata();
    const width = meta.width || 100;
    const height = meta.height || 100;

    const resized = await sharp(regionBuffer)
      .resize({ width: Math.min(width, 1024), fit: 'inside' })
      .png()
      .toBuffer();
    const base64 = resized.toString('base64');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert SVG artist and vector graphics specialist.
Convert this raster image region into clean SVG paths.

The region is ${width}x${height} pixels and contains: ${region.type}

Rules:
- Use precise SVG path commands (M, L, C, Q, Z)
- ViewBox should be "0 0 ${width} ${height}"
- Color mode: ${options.colorMode} (max ${options.maxColors} colors)
- Smoothing level: ${options.smoothing} (0=sharp, 2=very smooth)
- Minimum path length: ${options.minPathLength} commands
- Use clean, optimized paths
- Preserve visual fidelity

Return JSON:
{
  "viewBox": "0 0 ${width} ${height}",
  "paths": [{ "d": "M...", "fill": "#hex or null", "stroke": "#hex or null", "strokeWidth": 0, "opacity": 1 }],
  "colors": ["#hex1", "#hex2"],
  "confidence": 0.9
}`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
            { type: 'text', text: `Convert this ${region.type} to SVG vector paths.` },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { viewBox: `0 0 ${width} ${height}`, paths: [], colors: [], confidence: 0.3 };
    }

    const paths: SvgPath[] = (Array.isArray(parsed.paths) ? parsed.paths : []).map((p: Record<string, unknown>) => ({
      d: String(p.d || ''),
      fill: p.fill ? String(p.fill) : null,
      stroke: p.stroke ? String(p.stroke) : null,
      strokeWidth: Number(p.strokeWidth) || 0,
      opacity: p.opacity !== undefined ? Number(p.opacity) : 1,
    }));

    const colors = Array.isArray(parsed.colors) ? (parsed.colors as string[]) : [];

    const svgContent = this.buildSvgString(
      String(parsed.viewBox || `0 0 ${width} ${height}`),
      paths,
    );

    return {
      id: randomUUID(),
      regionId: region.id,
      svgContent,
      viewBox: String(parsed.viewBox || `0 0 ${width} ${height}`),
      paths,
      colors,
      width,
      height,
      confidence: Number(parsed.confidence) || 0.7,
    };
  }

  // ─── Bitmap Tracing ─────────────────────────────────────────────────────────

  private async reconstructWithTracing(
    regionBuffer: Buffer,
    region: VectorRegion,
    options: VectorReconstructionOptions,
  ): Promise<ReconstructedVector> {
    const meta = await sharp(regionBuffer).metadata();
    const width = meta.width || 100;
    const height = meta.height || 100;

    const bwBuffer = await sharp(regionBuffer)
      .grayscale()
      .threshold(128)
      .raw()
      .toBuffer();

    const paths = this.traceContours(bwBuffer, width, height, options.smoothing);
    const colorPalette = await this.extractColorPalette(regionBuffer, options.maxColors);

    const coloredPaths = paths.map((path, i) => ({
      ...path,
      fill: colorPalette[i % colorPalette.length] || '#000000',
    }));

    const viewBox = `0 0 ${width} ${height}`;
    const svgContent = this.buildSvgString(viewBox, coloredPaths);

    return {
      id: randomUUID(),
      regionId: region.id,
      svgContent,
      viewBox,
      paths: coloredPaths,
      colors: colorPalette,
      width,
      height,
      confidence: 0.6,
    };
  }

  // ─── Contour Tracing (simplified Potrace-style) ─────────────────────────────

  private traceContours(
    bwBuffer: Buffer,
    width: number,
    height: number,
    smoothing: number,
  ): SvgPath[] {
    const paths: SvgPath[] = [];
    const visited = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (visited[idx]) continue;

        const current = bwBuffer[idx];
        const left = bwBuffer[idx - 1];

        if (current !== left) {
          const contour = this.followContour(bwBuffer, visited, width, height, x, y);
          if (contour.length >= 4) {
            const smoothed = this.smoothContour(contour, smoothing);
            const pathD = this.contourToSvgPath(smoothed);
            paths.push({
              d: pathD,
              fill: '#000000',
              stroke: null,
              strokeWidth: 0,
              opacity: 1,
            });
          }
        }
      }
    }

    return paths;
  }

  private followContour(
    buffer: Buffer,
    visited: Uint8Array,
    width: number,
    height: number,
    startX: number,
    startY: number,
  ): Array<{ x: number; y: number }> {
    const contour: Array<{ x: number; y: number }> = [];
    let x = startX;
    let y = startY;
    let dir = 0;
    const dx = [0, 1, 0, -1];
    const dy = [-1, 0, 1, 0];
    const maxSteps = width * height;

    for (let step = 0; step < maxSteps; step++) {
      const idx = y * width + x;
      if (visited[idx] && contour.length > 2) break;

      visited[idx] = 1;
      contour.push({ x, y });

      let found = false;
      for (let turn = 0; turn < 4; turn++) {
        const newDir = (dir + turn + 3) % 4;
        const nx = x + dx[newDir];
        const ny = y + dy[newDir];

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (buffer[nIdx] !== buffer[idx]) {
            x = nx;
            y = ny;
            dir = newDir;
            found = true;
            break;
          }
        }
      }

      if (!found) break;
    }

    return contour;
  }

  private smoothContour(
    points: Array<{ x: number; y: number }>,
    factor: number,
  ): Array<{ x: number; y: number }> {
    if (factor <= 0 || points.length < 3) return points;

    const smoothed: Array<{ x: number; y: number }> = [];
    const window = Math.max(1, Math.round(factor * 3));

    for (let i = 0; i < points.length; i++) {
      let sumX = 0;
      let sumY = 0;
      let count = 0;

      for (let j = -window; j <= window; j++) {
        const idx = (i + j + points.length) % points.length;
        sumX += points[idx].x;
        sumY += points[idx].y;
        count++;
      }

      smoothed.push({ x: sumX / count, y: sumY / count });
    }

    return smoothed;
  }

  private contourToSvgPath(points: Array<{ x: number; y: number }>): string {
    if (points.length === 0) return '';

    let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

    for (let i = 1; i < points.length; i += 3) {
      if (i + 2 < points.length) {
        d += ` C ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}, ${points[i + 1].x.toFixed(2)} ${points[i + 1].y.toFixed(2)}, ${points[i + 2].x.toFixed(2)} ${points[i + 2].y.toFixed(2)}`;
      } else {
        d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
      }
    }

    d += ' Z';
    return d;
  }

  // ─── Color Palette Extraction ───────────────────────────────────────────────

  private async extractColorPalette(buffer: Buffer, maxColors: number): Promise<string[]> {
    const { data, info } = await sharp(buffer)
      .resize(50, 50, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colorCounts = new Map<string, number>();
    const channels = info.channels || 3;

    for (let i = 0; i < data.length; i += channels) {
      const r = Math.round(data[i] / 16) * 16;
      const g = Math.round(data[i + 1] / 16) * 16;
      const b = Math.round(data[i + 2] / 16) * 16;
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    }

    return Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxColors)
      .map(([color]) => color);
  }

  // ─── SVG Building ───────────────────────────────────────────────────────────

  private buildSvgString(viewBox: string, paths: SvgPath[]): string {
    const pathElements = paths
      .filter((p) => p.d.length > 0)
      .map((p) => {
        const attrs: string[] = [`d="${p.d}"`];
        if (p.fill) attrs.push(`fill="${p.fill}"`);
        else attrs.push('fill="none"');
        if (p.stroke) {
          attrs.push(`stroke="${p.stroke}"`);
          attrs.push('stroke-linejoin="round"');
          attrs.push('stroke-linecap="round"');
        }
        if (p.strokeWidth > 0) attrs.push(`stroke-width="${p.strokeWidth}"`);
        if (p.opacity < 1) attrs.push(`opacity="${p.opacity}"`);
        return `  <path ${attrs.join(' ')} />`;
      })
      .join('\n');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n${pathElements}\n</svg>`;
  }

  // ─── Path Optimization ──────────────────────────────────────────────────────

  private optimizeSvgPaths(vector: ReconstructedVector): ReconstructedVector {
    const optimizedPaths = vector.paths
      .filter((p) => p.d.length > 0)
      .map((p) => ({
        ...p,
        d: this.simplifyPath(p.d),
      }))
      .filter((p) => p.d.split(/[MLCQZ]/i).length > 2);

    return {
      ...vector,
      paths: optimizedPaths,
      svgContent: this.buildSvgString(vector.viewBox, optimizedPaths),
    };
  }

  private simplifyPath(d: string): string {
    return d
      .replace(/(\.\d{2})\d+/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ─── Region Extraction ──────────────────────────────────────────────────────

  private async extractRegion(imageBuffer: Buffer, bbox: BoundingBox): Promise<Buffer> {
    const meta = await sharp(imageBuffer).metadata();
    const imgWidth = meta.width || 1920;
    const imgHeight = meta.height || 1080;

    const left = Math.max(0, Math.min(Math.round(bbox.x), imgWidth - 1));
    const top = Math.max(0, Math.min(Math.round(bbox.y), imgHeight - 1));
    const width = Math.max(1, Math.min(Math.round(bbox.width), imgWidth - left));
    const height = Math.max(1, Math.min(Math.round(bbox.height), imgHeight - top));

    return sharp(imageBuffer)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();
  }
}
