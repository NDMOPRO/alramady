import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger, format, transports } from 'winston';
import { randomUUID } from 'crypto';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
  ),
  defaultMeta: { service: 'ocr-engine' },
  transports: [
    new transports.Console({ format: format.combine(format.colorize(), format.simple()) }),
  ],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface OcrRequest {
  fileId: string;
  filePath: string;
  languages: string[];
  options?: OcrOptions;
}

export interface OcrOptions {
  dpi: number;
  forceVision: boolean;
  enhanceContrast: boolean;
}

export interface OcrResult {
  pages: OcrPage[];
  fullText: string;
  confidence: number;
  wordCount: number;
  tables: OcrTable[];
  processingTimeMs: number;
  languages: string[];
}

export interface OcrPage {
  pageNumber: number;
  text: string;
  confidence: number;
  words: OcrWord[];
  lines: OcrLine[];
}

export interface OcrWord {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  isHandwritten: boolean;
}

export interface OcrLine {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  words: OcrWord[];
}

export interface OcrTable {
  id: string;
  rows: string[][];
  confidence: number;
  pageNumber: number;
}

export interface QualityAssessment {
  overallScore: number;
  sharpness: number;
  contrast: number;
  skewAngle: number;
  noiseLevel: number;
  recommendations: string[];
}

export interface BatchOcrJob {
  id: string;
  files: { fileId: string; filePath: string }[];
  languages: string[];
  options?: OcrOptions;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  results: OcrResult[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VISION_CONFIDENCE_THRESHOLD = 70;
const DEFAULT_DPI = 300;
const VISION_MODEL = 'claude-sonnet-4-5-20250514';

// ─── Service ─────────────────────────────────────────────────────────────────

export class OcrEngineService {
  private prisma: PrismaClient;
  private anthropic: Anthropic;

  constructor() {
    this.prisma = new PrismaClient();
    this.anthropic = new Anthropic();
  }

  // ── Main Entry Point ─────────────────────────────────────────────────────

  async processOcr(request: OcrRequest): Promise<OcrResult> {
    const startTime = Date.now();
    const dpi = request.options?.dpi ?? DEFAULT_DPI;
    const languages = request.languages.length > 0 ? request.languages : ['eng'];

    logger.info('Starting OCR processing', {
      fileId: request.fileId,
      filePath: request.filePath,
      languages,
      dpi,
    });

    // Step 1: Read and preprocess the image
    let imageBuffer = await sharp(request.filePath).toBuffer();

    if (request.options?.enhanceContrast) {
      logger.info('Enhancing image contrast before OCR');
    }

    imageBuffer = await this.enhanceImage(imageBuffer, dpi);

    // Step 2: Run Tesseract OCR
    const tesseractResult = await this.runTesseract(imageBuffer, languages);
    logger.info('Tesseract completed', {
      confidence: tesseractResult.confidence,
      wordCount: tesseractResult.wordCount,
    });

    let finalResult = tesseractResult;

    // Step 3: Fallback to Anthropic Vision if confidence is low or forced
    const needsVisionFallback =
      request.options?.forceVision || tesseractResult.confidence < VISION_CONFIDENCE_THRESHOLD;

    if (needsVisionFallback) {
      logger.info('Tesseract confidence below threshold or vision forced, falling back to Anthropic Vision', {
        tesseractConfidence: tesseractResult.confidence,
        threshold: VISION_CONFIDENCE_THRESHOLD,
      });

      try {
        const visionResult = await this.runAnthropicVision(imageBuffer, languages, request.filePath);

        // Use vision result if it produced meaningful output
        if (visionResult.fullText.length > 0) {
          finalResult = visionResult;
          logger.info('Using Anthropic Vision result', {
            confidence: visionResult.confidence,
            wordCount: visionResult.wordCount,
          });
        }
      } catch (error) {
        logger.error('Anthropic Vision fallback failed, using Tesseract result', { error });
      }
    }

    // Step 4: Detect tables from line data
    const tables = this.detectTablesFromLines(finalResult.pages);

    // Step 5: Assemble final result
    const processingTimeMs = Date.now() - startTime;
    const result: OcrResult = {
      pages: finalResult.pages,
      fullText: finalResult.fullText,
      confidence: finalResult.confidence,
      wordCount: finalResult.wordCount,
      tables,
      processingTimeMs,
      languages,
    };

    // Step 6: Persist to database
    try {
      await this.prisma.ocrResult.create({
        data: {
          fileId: request.fileId,
          fullText: result.fullText,
          confidence: result.confidence,
          languages: JSON.stringify(result.languages),
          pageCount: result.pages.length,
          wordCount: result.wordCount,
          tables: JSON.stringify(result.tables),
          processingTimeMs: result.processingTimeMs,
          processedAt: new Date(),
        },
      });
      logger.info('OCR result saved to database', { fileId: request.fileId });
    } catch (dbError) {
      logger.error('Failed to save OCR result to database', { error: dbError });
    }

    logger.info('OCR processing completed', {
      fileId: request.fileId,
      confidence: result.confidence,
      wordCount: result.wordCount,
      processingTimeMs: result.processingTimeMs,
      tablesFound: tables.length,
    });

    return result;
  }

  // ── Image Enhancement ────────────────────────────────────────────────────

  async enhanceImage(buffer: Buffer, targetDpi: number): Promise<Buffer> {
    const metadata = await sharp(buffer).metadata();
    const currentDpi = metadata.density ?? 72;
    const scaleFactor = targetDpi / currentDpi;

    let pipeline = sharp(buffer);

    // Resize for target DPI if the image is significantly below it
    if (scaleFactor > 1.1 && metadata.width && metadata.height) {
      const newWidth = Math.round(metadata.width * scaleFactor);
      const newHeight = Math.round(metadata.height * scaleFactor);
      pipeline = pipeline.resize(newWidth, newHeight, {
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: false,
      });
      logger.info('Resized image for DPI target', {
        from: `${metadata.width}x${metadata.height}`,
        to: `${newWidth}x${newHeight}`,
        currentDpi,
        targetDpi,
      });
    }

    // Apply grayscale, normalize, and sharpen
    pipeline = pipeline
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.5, m1: 1.0, m2: 0.5 });

    return pipeline.toBuffer();
  }

  // ── Tesseract OCR ────────────────────────────────────────────────────────

  async runTesseract(imageBuffer: Buffer, languages: string[]): Promise<OcrResult> {
    // Map language codes: support both ISO 639-1 and Tesseract codes
    const langMap: Record<string, string> = {
      ar: 'ara',
      en: 'eng',
      ara: 'ara',
      eng: 'eng',
    };
    const tessLangs = languages
      .map(l => langMap[l] ?? l)
      .join('+');

    // Default to ara+eng for Arabic-English support
    const langString = tessLangs || 'ara+eng';

    logger.info('Running Tesseract OCR', { languages: langString });

    const { data } = await Tesseract.recognize(imageBuffer, langString, {
      logger: (info: { status: string; progress: number }) => {
        if (info.status === 'recognizing text') {
          logger.debug('Tesseract progress', { progress: Math.round(info.progress * 100) });
        }
      },
    });

    // Extract words from Tesseract output
    const words: OcrWord[] = ((data as unknown as Record<string, unknown>).words as Tesseract.Word[] ?? []).map((w: Tesseract.Word) => ({
      text: w.text,
      confidence: w.confidence,
      boundingBox: {
        x: w.bbox.x0,
        y: w.bbox.y0,
        width: w.bbox.x1 - w.bbox.x0,
        height: w.bbox.y1 - w.bbox.y0,
      },
      isHandwritten: false,
    }));

    // Extract lines from Tesseract output
    const lines: OcrLine[] = ((data as unknown as Record<string, unknown>).lines as Tesseract.Line[] ?? []).map((line: Tesseract.Line) => {
      const lineWords: OcrWord[] = (line.words ?? []).map((w: Tesseract.Word) => ({
        text: w.text,
        confidence: w.confidence,
        boundingBox: {
          x: w.bbox.x0,
          y: w.bbox.y0,
          width: w.bbox.x1 - w.bbox.x0,
          height: w.bbox.y1 - w.bbox.y0,
        },
        isHandwritten: false,
      }));

      return {
        text: line.text,
        confidence: line.confidence,
        boundingBox: {
          x: line.bbox.x0,
          y: line.bbox.y0,
          width: line.bbox.x1 - line.bbox.x0,
          height: line.bbox.y1 - line.bbox.y0,
        },
        words: lineWords,
      };
    });

    const fullText = data.text ?? '';
    const confidence = data.confidence ?? 0;
    const wordCount = words.length;

    const page: OcrPage = {
      pageNumber: 1,
      text: fullText,
      confidence,
      words,
      lines,
    };

    return {
      pages: [page],
      fullText,
      confidence,
      wordCount,
      tables: [],
      processingTimeMs: 0,
      languages,
    };
  }

  // ── Anthropic Vision Fallback ────────────────────────────────────────────

  async runAnthropicVision(
    buffer: Buffer,
    languages: string[],
    filePath: string,
  ): Promise<OcrResult> {
    logger.info('Running Anthropic Vision OCR', { filePath, languages });

    const base64Image = buffer.toString('base64');

    // Determine media type from file path
    const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png';
    const mediaTypeMap: Record<string, 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const mediaType = mediaTypeMap[ext] ?? 'image/png';

    const languageNames = languages.map(l => {
      const nameMap: Record<string, string> = {
        ar: 'Arabic', ara: 'Arabic', en: 'English', eng: 'English',
        fr: 'French', fra: 'French', de: 'German', deu: 'German',
      };
      return nameMap[l] ?? l;
    });

    const response = await this.anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `You are a precise OCR engine. Extract ALL text from this image. The text may be in the following languages: ${languageNames.join(', ')}.

Return your response as valid JSON with this exact structure:
{
  "text": "the full extracted text, preserving line breaks",
  "confidence": <number between 0 and 100>,
  "words": [
    {
      "text": "word",
      "confidence": <number between 0 and 100>
    }
  ],
  "lines": [
    {
      "text": "full line text",
      "confidence": <number between 0 and 100>
    }
  ]
}

Important:
- Preserve the original text direction (RTL for Arabic, LTR for English)
- Preserve line breaks as they appear in the document
- Include ALL visible text, including headers, footers, and annotations
- Return ONLY the JSON, no markdown formatting or code blocks`,
            },
          ],
        },
      ],
    });

    // Parse the response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Anthropic Vision');
    }

    let parsed: {
      text: string;
      confidence: number;
      words: { text: string; confidence: number }[];
      lines: { text: string; confidence: number }[];
    };

    try {
      // Strip markdown code fences if present
      let rawJson = textBlock.text.trim();
      if (rawJson.startsWith('```')) {
        rawJson = rawJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      parsed = JSON.parse(rawJson);
    } catch (parseError) {
      logger.warn('Failed to parse Anthropic Vision JSON response, using raw text', { parseError });
      const rawText = textBlock.text;
      parsed = {
        text: rawText,
        confidence: 85,
        words: rawText.split(/\s+/).filter(Boolean).map(w => ({ text: w, confidence: 85 })),
        lines: rawText.split('\n').filter(Boolean).map(l => ({ text: l, confidence: 85 })),
      };
    }

    const words: OcrWord[] = (parsed.words ?? []).map((w, idx) => ({
      text: w.text,
      confidence: w.confidence,
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      isHandwritten: false,
    }));

    const lines: OcrLine[] = (parsed.lines ?? []).map((l, idx) => {
      const lineWords = l.text.split(/\s+/).filter(Boolean).map(wText => {
        const matchingWord = words.find(w => w.text === wText);
        return matchingWord ?? {
          text: wText,
          confidence: l.confidence,
          boundingBox: { x: 0, y: 0, width: 0, height: 0 },
          isHandwritten: false,
        };
      });

      return {
        text: l.text,
        confidence: l.confidence,
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        words: lineWords,
      };
    });

    const page: OcrPage = {
      pageNumber: 1,
      text: parsed.text,
      confidence: parsed.confidence,
      words,
      lines,
    };

    return {
      pages: [page],
      fullText: parsed.text,
      confidence: parsed.confidence,
      wordCount: words.length,
      tables: [],
      processingTimeMs: 0,
      languages,
    };
  }

  // ── Table Detection ──────────────────────────────────────────────────────

  detectTablesFromLines(pages: OcrPage[]): OcrTable[] {
    const tables: OcrTable[] = [];

    for (const page of pages) {
      if (page.lines.length < 3) continue;

      const lineYPositions = page.lines.map(l => l.boundingBox.y);
      const groups: number[][] = [];
      let currentGroup: number[] = [0];

      for (let i = 1; i < lineYPositions.length; i++) {
        const currentGap = lineYPositions[i] - lineYPositions[i - 1];
        const prevGap = i > 1 ? lineYPositions[i - 1] - lineYPositions[i - 2] : currentGap;

        // Lines are uniformly spaced if gap difference is within tolerance
        if (Math.abs(currentGap - prevGap) < 5 && currentGap > 0) {
          currentGroup.push(i);
        } else {
          if (currentGroup.length >= 3) {
            groups.push([...currentGroup]);
          }
          currentGroup = [i];
        }
      }
      if (currentGroup.length >= 3) {
        groups.push(currentGroup);
      }

      // For each group of uniformly spaced lines, check for multi-column content
      for (const group of groups) {
        const groupLines = group.map(idx => page.lines[idx]);

        // Check that lines have multi-column content (multiple word clusters with gaps)
        const hasMultipleColumns = groupLines.every(line => {
          if (line.words.length < 2) return false;
          // Check for significant gaps between words indicating columns
          for (let i = 1; i < line.words.length; i++) {
            const gap = line.words[i].boundingBox.x -
              (line.words[i - 1].boundingBox.x + line.words[i - 1].boundingBox.width);
            if (gap > 30) return true;
          }
          return false;
        });

        if (!hasMultipleColumns) continue;

        // Extract rows by splitting each line into columns based on large gaps
        const rows: string[][] = groupLines.map(line => {
          const cells: string[] = [];
          let currentCell = line.words[0]?.text ?? '';

          for (let i = 1; i < line.words.length; i++) {
            const gap = line.words[i].boundingBox.x -
              (line.words[i - 1].boundingBox.x + line.words[i - 1].boundingBox.width);
            if (gap > 30) {
              cells.push(currentCell.trim());
              currentCell = line.words[i].text;
            } else {
              currentCell += ' ' + line.words[i].text;
            }
          }
          if (currentCell.trim()) cells.push(currentCell.trim());
          return cells;
        });

        const avgConfidence = groupLines.reduce((sum, l) => sum + l.confidence, 0) / groupLines.length;

        tables.push({
          id: randomUUID(),
          rows,
          confidence: Math.round(avgConfidence * 100) / 100,
          pageNumber: page.pageNumber,
        });
      }
    }

    return tables;
  }

  // ── Image Quality Assessment ─────────────────────────────────────────────

  async assessImageQuality(imageBuffer: Buffer): Promise<QualityAssessment> {
    const { data, info } = await sharp(imageBuffer)
      .grayscale()
      .resize(300, 300, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Compute sharpness via edge detection (Sobel-like gradient magnitude)
    let edgeSum = 0;
    let pixelCount = 0;
    for (let y = 1; y < info.height - 1; y++) {
      for (let x = 1; x < info.width - 1; x++) {
        const idx = y * info.width + x;
        const gx = data[idx + 1] - data[idx - 1];
        const gy = data[idx + info.width] - data[idx - info.width];
        edgeSum += Math.sqrt(gx * gx + gy * gy);
        pixelCount++;
      }
    }
    const sharpness = Math.min(1, (edgeSum / pixelCount) / 100);

    // Compute contrast from pixel range
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const contrast = (max - min) / 255;

    // Compute noise level from histogram distribution
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) {
      histogram[data[i]]++;
    }
    const totalPixels = data.length;
    const lowBin = histogram.slice(0, 30).reduce((a: number, b: number) => a + b, 0);
    const highBin = histogram.slice(226).reduce((a: number, b: number) => a + b, 0);
    const midBin = totalPixels - lowBin - highBin;
    const noiseLevel = 1 - midBin / totalPixels;

    // Estimate skew angle using horizontal projection variance
    let bestAngle = 0;
    let bestVariance = 0;
    for (let angle = -5; angle <= 5; angle += 0.5) {
      const radians = (angle * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const projection = new Array(info.height).fill(0);

      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const newY = Math.round(x * sin + y * cos);
          if (newY >= 0 && newY < info.height && data[y * info.width + x] < 128) {
            projection[newY]++;
          }
        }
      }

      const mean = projection.reduce((a: number, b: number) => a + b, 0) / projection.length;
      const variance = projection.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / projection.length;
      if (variance > bestVariance) {
        bestVariance = variance;
        bestAngle = angle;
      }
    }
    const skewAngle = -bestAngle;

    // Overall quality score
    const overallScore =
      sharpness * 0.35 +
      contrast * 0.25 +
      (1 - noiseLevel) * 0.25 +
      (1 - Math.abs(skewAngle) / 10) * 0.15;

    // Generate recommendations
    const recommendations: string[] = [];
    if (sharpness < 0.4) {
      recommendations.push('Image is blurry. Consider rescanning at higher DPI.');
    }
    if (contrast < 0.3) {
      recommendations.push('Low contrast. Increase scan brightness/contrast settings.');
    }
    if (noiseLevel > 0.4) {
      recommendations.push('High noise level. Use denoising or clean scanner glass.');
    }
    if (Math.abs(skewAngle) > 2) {
      recommendations.push(`Image is skewed by ${skewAngle.toFixed(1)} degrees. Consider deskewing.`);
    }

    return {
      overallScore: Math.round(overallScore * 100) / 100,
      sharpness: Math.round(sharpness * 100) / 100,
      contrast: Math.round(contrast * 100) / 100,
      skewAngle: Math.round(skewAngle * 10) / 10,
      noiseLevel: Math.round(noiseLevel * 100) / 100,
      recommendations,
    };
  }

  // ── Batch Processing ─────────────────────────────────────────────────────

  async processBatch(job: BatchOcrJob): Promise<BatchOcrJob> {
    logger.info('Starting batch OCR processing', {
      jobId: job.id,
      fileCount: job.files.length,
      languages: job.languages,
    });

    job.status = 'processing';
    job.progress = 0;
    job.results = [];

    for (let i = 0; i < job.files.length; i++) {
      const file = job.files[i];
      logger.info('Processing batch file', {
        jobId: job.id,
        fileIndex: i + 1,
        totalFiles: job.files.length,
        fileId: file.fileId,
      });

      try {
        const result = await this.processOcr({
          fileId: file.fileId,
          filePath: file.filePath,
          languages: job.languages,
          options: job.options,
        });
        job.results.push(result);
      } catch (error) {
        logger.error('Failed to process file in batch', {
          jobId: job.id,
          fileId: file.fileId,
          error,
        });
        // Push a zero-confidence error result so batch tracking stays consistent
        job.results.push({
          pages: [],
          fullText: '',
          confidence: 0,
          wordCount: 0,
          tables: [],
          processingTimeMs: 0,
          languages: job.languages,
        });
      }

      // Update progress
      job.progress = Math.round(((i + 1) / job.files.length) * 100);
      logger.info('Batch progress', { jobId: job.id, progress: job.progress });
    }

    job.status = 'completed';
    logger.info('Batch OCR processing completed', {
      jobId: job.id,
      totalFiles: job.files.length,
      successCount: job.results.filter(r => r.confidence > 0).length,
    });

    return job;
  }
}
