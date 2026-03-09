import sharp from 'sharp';
import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { createLogger, format, transports } from 'winston';
import { randomUUID } from 'crypto';
import type { BoundingBox, FontRecognitionResult, DetectedFont, TypographyLevel } from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'font-recognition' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Known Font Database ──────────────────────────────────────────────────────

const ARABIC_FONT_DATABASE: Record<string, { weights: number[]; category: string; fallbacks: string[] }> = {
  'Cairo': { weights: [200, 300, 400, 500, 600, 700, 800, 900], category: 'sans-serif', fallbacks: ['Tajawal', 'Noto Sans Arabic'] },
  'Tajawal': { weights: [200, 300, 400, 500, 700, 800, 900], category: 'sans-serif', fallbacks: ['Cairo', 'Noto Sans Arabic'] },
  'IBM Plex Sans Arabic': { weights: [100, 200, 300, 400, 500, 600, 700], category: 'sans-serif', fallbacks: ['Cairo', 'Noto Sans Arabic'] },
  'Noto Sans Arabic': { weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: 'sans-serif', fallbacks: ['Cairo', 'Tajawal'] },
  'Noto Kufi Arabic': { weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: 'sans-serif', fallbacks: ['Noto Sans Arabic'] },
  'Amiri': { weights: [400, 700], category: 'serif', fallbacks: ['Scheherazade', 'Noto Naskh Arabic'] },
  'Scheherazade New': { weights: [400, 500, 600, 700], category: 'serif', fallbacks: ['Amiri', 'Noto Naskh Arabic'] },
  'Noto Naskh Arabic': { weights: [400, 500, 600, 700], category: 'serif', fallbacks: ['Amiri', 'Scheherazade New'] },
  'Lateef': { weights: [200, 300, 400, 500, 600, 700, 800], category: 'serif', fallbacks: ['Scheherazade New'] },
  'Harmattan': { weights: [400, 500, 600, 700], category: 'sans-serif', fallbacks: ['Noto Sans Arabic'] },
  'Almarai': { weights: [300, 400, 700, 800], category: 'sans-serif', fallbacks: ['Cairo', 'Tajawal'] },
  'El Messiri': { weights: [400, 500, 600, 700], category: 'sans-serif', fallbacks: ['Cairo'] },
  'Changa': { weights: [200, 300, 400, 500, 600, 700, 800], category: 'sans-serif', fallbacks: ['Tajawal'] },
  'Rubik': { weights: [300, 400, 500, 600, 700, 800, 900], category: 'sans-serif', fallbacks: ['Cairo'] },
};

const LATIN_FONT_DATABASE: Record<string, { weights: number[]; category: string; fallbacks: string[] }> = {
  'Arial': { weights: [400, 700], category: 'sans-serif', fallbacks: ['Helvetica', 'sans-serif'] },
  'Helvetica Neue': { weights: [100, 200, 300, 400, 500, 700, 800, 900], category: 'sans-serif', fallbacks: ['Helvetica', 'Arial'] },
  'Roboto': { weights: [100, 300, 400, 500, 700, 900], category: 'sans-serif', fallbacks: ['Arial', 'Helvetica'] },
  'Inter': { weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: 'sans-serif', fallbacks: ['Roboto', 'Arial'] },
  'Open Sans': { weights: [300, 400, 500, 600, 700, 800], category: 'sans-serif', fallbacks: ['Roboto', 'Arial'] },
  'Poppins': { weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: 'sans-serif', fallbacks: ['Inter', 'Roboto'] },
  'Montserrat': { weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: 'sans-serif', fallbacks: ['Poppins', 'Roboto'] },
  'Times New Roman': { weights: [400, 700], category: 'serif', fallbacks: ['Georgia', 'serif'] },
  'Georgia': { weights: [400, 700], category: 'serif', fallbacks: ['Times New Roman'] },
  'Courier New': { weights: [400, 700], category: 'monospace', fallbacks: ['Consolas', 'monospace'] },
};

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface FontRecognitionRequest {
  imageBuffer: Buffer;
  regions?: BoundingBox[];
  options?: FontRecognitionOptions;
}

export interface FontRecognitionOptions {
  includeAlternatives: boolean;
  maxAlternatives: number;
  detectOpenTypeFeatures: boolean;
  matchAgainstDatabase: boolean;
}

const DEFAULT_OPTIONS: FontRecognitionOptions = {
  includeAlternatives: true,
  maxAlternatives: 5,
  detectOpenTypeFeatures: true,
  matchAgainstDatabase: true,
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class FontRecognitionService {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  async recognizeFonts(request: FontRecognitionRequest): Promise<FontRecognitionResult> {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...request.options };

    logger.info('Starting font recognition', { regions: request.regions?.length || 0 });

    const meta = await sharp(request.imageBuffer).metadata();
    const width = meta.width || 1920;
    const height = meta.height || 1080;

    const resized = await sharp(request.imageBuffer)
      .resize({ width: Math.min(width, 4096), fit: 'inside' })
      .png()
      .toBuffer();
    const base64 = resized.toString('base64');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a world-class typographer and font recognition expert, trained on DeepFont and glyph similarity models.

Analyze the image (${width}x${height}px) and identify EVERY distinct font usage.

For each detected font:
1. family: Be extremely specific. Check against these known fonts:
   Arabic: ${Object.keys(ARABIC_FONT_DATABASE).join(', ')}
   Latin: ${Object.keys(LATIN_FONT_DATABASE).join(', ')}
   If you recognize a specific font, use its exact name.

2. weight: Exact numeric weight (100-900). Common:
   Thin=100, ExtraLight=200, Light=300, Regular=400, Medium=500, SemiBold=600, Bold=700, ExtraBold=800, Black=900

3. style: normal or italic

4. size: Estimated size in pixels (be precise)

5. lineHeight: As ratio (e.g., 1.2, 1.5, 1.8)

6. letterSpacing: In pixels (positive for wide, negative for tight, 0 for normal)

7. confidence: Your confidence in the identification (0-1)

8. sampleText: A short sample of text rendered in this font

9. bbox: Approximate bounding box as {x, y, width, height} in pixels

10. isArabic: Whether this text is Arabic

11. openTypeFeatures: Detected OpenType features:
    - liga (ligatures)
    - kern (kerning)
    - calt (contextual alternates)
    - frac (fractions)
    - onum (old-style numerals)
    - smcp (small caps)

12. alternatives: Top ${options.maxAlternatives} visually similar fonts with similarity scores

Also provide typography hierarchy (roles h1-data with font assignments).

Return JSON: {
  "detectedFonts": [...],
  "typographyHierarchy": [{"role": "h1", "fontIndex": 0, "count": 1, "averageLineLength": 20}],
  "confidence": 0.85
}`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
            { type: 'text', text: 'Identify all fonts with precise specifications.' },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { detectedFonts: [], typographyHierarchy: [], confidence: 0.5 };
    }

    let detectedFonts: DetectedFont[] = (Array.isArray(parsed.detectedFonts) ? parsed.detectedFonts : []).map(
      (f: Record<string, unknown>) => {
        const family = String(f.family || 'sans-serif');
        const isArabic = Boolean(f.isArabic);
        const db = isArabic ? ARABIC_FONT_DATABASE : LATIN_FONT_DATABASE;

        let alternatives: Array<{ family: string; similarity: number }> = [];
        if (options.includeAlternatives) {
          alternatives = Array.isArray(f.alternatives)
            ? (f.alternatives as Array<Record<string, unknown>>).map((a) => ({
                family: String(a.family || ''),
                similarity: Number(a.similarity) || 0.5,
              }))
            : [];

          if (options.matchAgainstDatabase && db[family]) {
            const dbFallbacks = db[family].fallbacks;
            for (const fb of dbFallbacks) {
              if (!alternatives.find((a) => a.family === fb)) {
                alternatives.push({ family: fb, similarity: 0.7 });
              }
            }
          }

          alternatives = alternatives.slice(0, options.maxAlternatives);
        }

        const openTypeFeatures = options.detectOpenTypeFeatures
          ? (Array.isArray(f.openTypeFeatures) ? (f.openTypeFeatures as string[]) : [])
          : [];

        return {
          family,
          weight: this.snapToValidWeight(Number(f.weight) || 400, family, isArabic),
          style: (f.style === 'italic' ? 'italic' : 'normal') as 'normal' | 'italic',
          size: Number(f.size) || 16,
          lineHeight: Number(f.lineHeight) || 1.5,
          letterSpacing: Number(f.letterSpacing) || 0,
          confidence: Number(f.confidence) || 0.7,
          sampleText: String(f.sampleText || ''),
          bbox: this.parseBbox(f.bbox, width, height),
          alternatives,
          isArabic,
          openTypeFeatures,
        };
      },
    );

    const typographyHierarchy: TypographyLevel[] = (
      Array.isArray(parsed.typographyHierarchy) ? parsed.typographyHierarchy : []
    ).map((t: Record<string, unknown>) => {
      const fontIndex = Number(t.fontIndex) || 0;
      return {
        role: (t.role || 'body') as TypographyLevel['role'],
        font: detectedFonts[fontIndex] || detectedFonts[0] || this.defaultFont(),
        count: Number(t.count) || 1,
        averageLineLength: Number(t.averageLineLength) || 40,
      };
    });

    const result: FontRecognitionResult = {
      fonts: detectedFonts,
      dominantFont: detectedFonts[0] || null,
      fontCount: detectedFonts.length,
      typographyHierarchy,
      confidence: Number(parsed.confidence) || 0.7,
    };

    logger.info('Font recognition complete', {
      fonts: detectedFonts.length,
      hierarchy: typographyHierarchy.length,
      confidence: result.confidence,
      processingTimeMs: Date.now() - startTime,
    });

    return result;
  }

  async verifyFontsInRenderingEnvironment(
    fonts: DetectedFont[],
  ): Promise<{ verified: Array<{ family: string; installed: boolean }>; missingCount: number }> {
    const renderUrl = process.env.RENDERING_SERVICE_URL || 'http://rendering-environment:8014';
    try {
      const requiredFonts = fonts.map((f) => f.family);
      const response = await fetch(`${renderUrl}/api/v1/render/validate-fonts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requiredFonts }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { verified: [], missingCount: -1 };
      const data = await response.json() as { results: Array<{ font: string; installed: boolean }>; missing: string[] };
      return {
        verified: data.results.map((r) => ({ family: r.font, installed: r.installed })),
        missingCount: data.missing.length,
      };
    } catch {
      logger.warn('Could not verify fonts against rendering environment');
      return { verified: [], missingCount: -1 };
    }
  }

  async findClosestAvailableFont(
    detectedFont: DetectedFont,
    availableFonts: string[],
  ): Promise<{ family: string; similarity: number }> {
    const exactMatch = availableFonts.find(
      (f) => f.toLowerCase() === detectedFont.family.toLowerCase(),
    );
    if (exactMatch) return { family: exactMatch, similarity: 1.0 };

    for (const alt of detectedFont.alternatives || []) {
      const altMatch = availableFonts.find(
        (f) => f.toLowerCase() === alt.family.toLowerCase(),
      );
      if (altMatch) return { family: altMatch, similarity: alt.similarity };
    }

    const db = detectedFont.isArabic ? ARABIC_FONT_DATABASE : LATIN_FONT_DATABASE;
    const entry = db[detectedFont.family];
    if (entry) {
      for (const fallback of entry.fallbacks) {
        const fbMatch = availableFonts.find(
          (f) => f.toLowerCase() === fallback.toLowerCase(),
        );
        if (fbMatch) return { family: fbMatch, similarity: 0.6 };
      }

      const sameCategory = Object.entries(db)
        .filter(([, v]) => v.category === entry.category)
        .map(([k]) => k);
      for (const cat of sameCategory) {
        const catMatch = availableFonts.find(
          (f) => f.toLowerCase() === cat.toLowerCase(),
        );
        if (catMatch) return { family: catMatch, similarity: 0.4 };
      }
    }

    const genericFallback = detectedFont.isArabic ? 'Noto Sans Arabic' : 'Arial';
    const genericMatch = availableFonts.find(
      (f) => f.toLowerCase() === genericFallback.toLowerCase(),
    );
    if (genericMatch) return { family: genericMatch, similarity: 0.3 };

    return { family: availableFonts[0] || 'sans-serif', similarity: 0.1 };
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private snapToValidWeight(weight: number, family: string, isArabic: boolean): number {
    const db = isArabic ? ARABIC_FONT_DATABASE : LATIN_FONT_DATABASE;
    const entry = db[family];
    if (!entry) return weight;

    const validWeights = entry.weights;
    let closest = validWeights[0];
    let closestDiff = Math.abs(weight - closest);

    for (const w of validWeights) {
      const diff = Math.abs(weight - w);
      if (diff < closestDiff) {
        closest = w;
        closestDiff = diff;
      }
    }

    return closest;
  }

  private parseBbox(raw: unknown, w: number, h: number): BoundingBox {
    if (!raw || typeof raw !== 'object') return { x: 0, y: 0, width: w, height: h };
    const r = raw as Record<string, unknown>;
    return {
      x: Math.max(0, Number(r.x) || 0),
      y: Math.max(0, Number(r.y) || 0),
      width: Math.max(1, Number(r.width) || 100),
      height: Math.max(1, Number(r.height) || 20),
    };
  }

  private defaultFont(): DetectedFont {
    return {
      family: 'sans-serif',
      weight: 400,
      style: 'normal',
      size: 16,
      lineHeight: 1.5,
      letterSpacing: 0,
      confidence: 0.3,
      sampleText: '',
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      alternatives: [],
      isArabic: false,
      openTypeFeatures: [],
    };
  }
}
