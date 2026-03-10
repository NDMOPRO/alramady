import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import ffmpegPath from 'ffmpeg-static';

export type MultimodalInputType =
  | 'pdf'
  | 'docx'
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'unknown';

export interface ExactExtractionResult {
  text: string;
  language: string;
  sourceEngine: string;
  metadata: Record<string, unknown>;
}

export interface StructuredStepResult {
  title: string;
  summary: string;
  language: string;
  steps: Array<{
    index: number;
    title: string;
    description: string;
    evidence: string[];
  }>;
}

export interface MultimodalExtractionResult {
  inputType: MultimodalInputType;
  filename: string;
  exactExtraction: ExactExtractionResult;
  structuredSteps?: StructuredStepResult;
  visibleText?: ExactExtractionResult;
  spokenTranscript?: ExactExtractionResult;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function detectLanguageFromText(text: string): string {
  if (/[\u0600-\u06FF]/.test(text) && /[A-Za-z]/.test(text)) return 'mixed';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[A-Za-z]/.test(text)) return 'en';
  return 'unknown';
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values.map((entry) => entry.trim()).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function normalizeImageMimeType(mimeType: string | undefined, filename: string): string {
  if (mimeType && /^image\/(png|jpeg|jpg|webp|gif)$/i.test(mimeType)) {
    return mimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mimeType;
  }

  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

export class MultimodalBlockedError extends Error {
  readonly code = 'MULTIMODAL_BLOCKED';
}

export class MultimodalExtractionService {
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  detectInputType(filename: string, mimeType?: string): MultimodalInputType {
    const lowerName = filename.toLowerCase();
    const lowerMime = (mimeType || '').toLowerCase();

    if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) return 'pdf';
    if (
      lowerMime.includes('wordprocessingml') ||
      lowerName.endsWith('.docx')
    ) return 'docx';
    if (lowerMime.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff|gif|svg)$/i.test(lowerName)) {
      return 'image';
    }
    if (lowerMime.startsWith('audio/') || /\.(mp3|wav|m4a|webm|ogg)$/i.test(lowerName)) {
      return 'audio';
    }
    if (lowerMime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(lowerName)) {
      return 'video';
    }
    if (
      lowerMime.startsWith('text/') ||
      lowerMime.includes('json') ||
      lowerMime.includes('xml') ||
      lowerMime.includes('html') ||
      /\.(txt|md|csv|json|xml|html|htm)$/i.test(lowerName)
    ) {
      return 'text';
    }
    return 'unknown';
  }

  async extract(
    buffer: Buffer,
    filename: string,
    mimeType?: string,
    languageHint: 'auto' | 'ar' | 'en' = 'auto',
    includeStructuredSteps = true,
  ): Promise<MultimodalExtractionResult> {
    const inputType = this.detectInputType(filename, mimeType);

    if (inputType === 'unknown') {
      throw new Error(`Unsupported input type for file ${filename}`);
    }

    if (inputType === 'video') {
      return this.extractVideo(buffer, filename, mimeType, languageHint, includeStructuredSteps);
    }

    const exactExtraction = await this.extractExact(buffer, filename, mimeType, languageHint, inputType);
    const structuredSteps = includeStructuredSteps
      ? await this.extractStructuredSteps(exactExtraction.text, languageHint, filename)
      : undefined;

    return {
      inputType,
      filename,
      exactExtraction,
      structuredSteps,
    };
  }

  async extractExact(
    buffer: Buffer,
    filename: string,
    mimeType: string | undefined,
    languageHint: 'auto' | 'ar' | 'en',
    inputType?: MultimodalInputType,
  ): Promise<ExactExtractionResult> {
    const resolvedType = inputType || this.detectInputType(filename, mimeType);

    switch (resolvedType) {
      case 'pdf':
        return this.extractPdf(buffer, filename);
      case 'docx':
        return this.extractDocx(buffer, filename);
      case 'text':
        return this.extractText(buffer, filename, mimeType);
      case 'image':
        return this.extractImage(buffer, filename, mimeType, languageHint);
      case 'audio':
        return this.extractAudio(buffer, filename, languageHint);
      default:
        throw new Error(`Exact extraction is not supported for ${resolvedType}`);
    }
  }

  private async extractPdf(buffer: Buffer, filename: string): Promise<ExactExtractionResult> {
    let parsed: Awaited<ReturnType<typeof pdfParse>>;
    try {
      parsed = await pdfParse(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new MultimodalBlockedError(`PDF file ${filename} is structurally invalid or unreadable: ${message}`);
    }

    const text = parsed.text?.trim() || '';

    if (!text) {
      throw new MultimodalBlockedError(
        `PDF file ${filename} does not contain an extractable text layer in the current pipeline.`,
      );
    }

    return {
      text,
      language: detectLanguageFromText(text),
      sourceEngine: 'pdf-parse',
      metadata: {
        pageCount: parsed.numpages,
        info: parsed.info || {},
        version: parsed.version || null,
      },
    };
  }

  private async extractDocx(buffer: Buffer, filename: string): Promise<ExactExtractionResult> {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();

    if (!text) {
      throw new MultimodalBlockedError(`DOCX file ${filename} produced no extractable text.`);
    }

    return {
      text,
      language: detectLanguageFromText(text),
      sourceEngine: 'mammoth',
      metadata: {
        warnings: result.messages,
      },
    };
  }

  private async extractText(
    buffer: Buffer,
    filename: string,
    mimeType?: string,
  ): Promise<ExactExtractionResult> {
    const text = buffer.toString('utf-8').replace(/\u0000/g, '').trim();

    if (!text) {
      throw new MultimodalBlockedError(`Text file ${filename} is empty after decoding.`);
    }

    return {
      text,
      language: detectLanguageFromText(text),
      sourceEngine: mimeType?.includes('json') ? 'utf8-decoder-json' : 'utf8-decoder',
      metadata: {
        bytes: buffer.length,
      },
    };
  }

  private async extractImage(
    buffer: Buffer,
    filename: string,
    mimeType: string | undefined,
    languageHint: 'auto' | 'ar' | 'en',
  ): Promise<ExactExtractionResult> {
    const promptLanguage =
      languageHint === 'auto'
        ? 'Detect whether the image text is Arabic, English, or mixed.'
        : `The expected text language is ${languageHint}.`;

    const normalizedMimeType = normalizeImageMimeType(mimeType, filename);

    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are an OCR engine. Read the image exactly as written. Preserve line breaks, list order, and Arabic/English spelling. Return JSON with fields: language, fullText, lines (array of strings). Do not summarize.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `${promptLanguage} Extract the visible text exactly.` },
            {
              type: 'image_url',
              image_url: {
                url: `data:${normalizedMimeType};base64,${buffer.toString('base64')}`,
              },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || '{}';
    const parsed = safeJsonParse<{ language?: string; fullText?: string; lines?: string[] }>(raw, {});
    const text = parsed.fullText?.trim() || uniqueNonEmpty(parsed.lines || []).join('\n').trim();

    if (!text) {
      throw new MultimodalBlockedError(`Image OCR for ${filename} returned no text.`);
    }

    return {
      text,
      language: parsed.language || detectLanguageFromText(text),
      sourceEngine: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      metadata: {
        lineCount: (parsed.lines || []).length,
      },
    };
  }

  private async extractAudio(
    buffer: Buffer,
    filename: string,
    languageHint: 'auto' | 'ar' | 'en',
  ): Promise<ExactExtractionResult> {
    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'rasid-audio-'));
    const inputPath = path.join(tmpDir, filename);

    try {
      await fsPromises.writeFile(inputPath, buffer);
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(inputPath),
        model: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
        language: languageHint === 'auto' ? undefined : languageHint,
        response_format: 'verbose_json',
      } as never);

      const transcriptionAny = transcription as unknown as {
        text?: string;
        language?: string;
        duration?: number;
        segments?: Array<{ text?: string; start?: number; end?: number }>;
      };

      const text = transcriptionAny.text?.trim() || '';
      if (!text) {
        throw new MultimodalBlockedError(`Audio transcription for ${filename} returned no text.`);
      }

      return {
        text,
        language: transcriptionAny.language || languageHint || detectLanguageFromText(text),
        sourceEngine: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
        metadata: {
          duration: transcriptionAny.duration ?? null,
          segmentCount: transcriptionAny.segments?.length || 0,
        },
      };
    } finally {
      await fsPromises.rm(tmpDir, { recursive: true, force: true });
    }
  }

  private async extractStructuredSteps(
    text: string,
    languageHint: 'auto' | 'ar' | 'en',
    filename: string,
  ): Promise<StructuredStepResult> {
    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You convert instructional content into structured steps. Return JSON with fields: title, summary, language, steps. Each step must include index, title, description, evidence (array of exact supporting snippets). If the text is not instructional, return steps as an empty array and explain that in summary. Preserve the source language unless explicitly mixed.',
        },
        {
          role: 'user',
          content: `Filename: ${filename}\nLanguage hint: ${languageHint}\n\nContent:\n${text.slice(0, 15000)}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || '{}';
    const parsed = safeJsonParse<StructuredStepResult>(
      raw,
      {
        title: filename,
        summary: 'لم يتمكن المحرك من تحويل المحتوى إلى خطوات منظمة.',
        language: languageHint === 'auto' ? detectLanguageFromText(text) : languageHint,
        steps: [],
      },
    );

    return {
      title: parsed.title || filename,
      summary: parsed.summary || '',
      language: parsed.language || detectLanguageFromText(text),
      steps: Array.isArray(parsed.steps)
        ? parsed.steps.map((step, index) => ({
            index: Number(step.index || index + 1),
            title: step.title || `Step ${index + 1}`,
            description: step.description || '',
            evidence: Array.isArray(step.evidence) ? step.evidence.map(String) : [],
          }))
        : [],
    };
  }

  private async extractVideo(
    buffer: Buffer,
    filename: string,
    mimeType: string | undefined,
    languageHint: 'auto' | 'ar' | 'en',
    includeStructuredSteps: boolean,
  ): Promise<MultimodalExtractionResult> {
    if (!ffmpegPath) {
      throw new MultimodalBlockedError(
        'Video extraction requires ffmpeg-static, which is unavailable in the current runtime.',
      );
    }

    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'rasid-video-'));
    const inputPath = path.join(tmpDir, filename);
    const audioPath = path.join(tmpDir, 'audio.wav');
    const framePattern = path.join(tmpDir, 'frame-%03d.jpg');

    try {
      await fsPromises.writeFile(inputPath, buffer);

      await this.runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        audioPath,
      ]);

      await this.runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-vf',
        'fps=1/2',
        '-frames:v',
        '4',
        framePattern,
      ]);

      const frameFiles = (await fsPromises.readdir(tmpDir))
        .filter((entry) => /^frame-\d+\.jpg$/.test(entry))
        .sort();

      const visibleTextResults: ExactExtractionResult[] = [];
      for (const frameFile of frameFiles) {
        const frameBuffer = await fsPromises.readFile(path.join(tmpDir, frameFile));
        try {
          const frameResult = await this.extractImage(frameBuffer, frameFile, 'image/jpeg', languageHint);
          if (frameResult.text.trim()) {
            visibleTextResults.push(frameResult);
          }
        } catch {
          // Ignore empty OCR frames and keep processing the rest.
        }
      }

      const visibleText = uniqueNonEmpty(visibleTextResults.map((result) => result.text)).join('\n');
      const spokenTranscript = await this.extractAudio(
        await fsPromises.readFile(audioPath),
        `${path.parse(filename).name}.wav`,
        languageHint,
      );

      const exactText = [visibleText, spokenTranscript.text].filter(Boolean).join('\n\n');

      if (!exactText.trim()) {
        throw new MultimodalBlockedError(`Video file ${filename} produced no extractable visible or spoken text.`);
      }

      const exactExtraction: ExactExtractionResult = {
        text: exactText,
        language: spokenTranscript.language || detectLanguageFromText(exactText),
        sourceEngine: `${process.env.OPENAI_VISION_MODEL || 'gpt-4o'} + ${process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1'}`,
        metadata: {
          mimeType: mimeType || null,
          frameCount: frameFiles.length,
        },
      };

      return {
        inputType: 'video',
        filename,
        exactExtraction,
        visibleText: {
          text: visibleText,
          language: detectLanguageFromText(visibleText),
          sourceEngine: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
          metadata: { frameCount: frameFiles.length },
        },
        spokenTranscript,
        structuredSteps: includeStructuredSteps
          ? await this.extractStructuredSteps(
              spokenTranscript.text.trim() || exactText,
              languageHint,
              filename,
            )
          : undefined,
      };
    } finally {
      await fsPromises.rm(tmpDir, { recursive: true, force: true });
    }
  }

  private async runFfmpeg(args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath as string, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      });
    });
  }
}

export const multimodalExtractionService = new MultimodalExtractionService();
