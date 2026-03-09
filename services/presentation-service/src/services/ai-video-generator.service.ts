import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger, format, transports } from 'winston';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new PrismaClient();

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'ai-video-generator' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

interface VideoGenerationConfig {
  presentationId: string;
  tenantId: string;
  userId: string;
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  language?: 'ar' | 'en';
  resolution?: '720p' | '1080p';
  transitionType?: 'fade' | 'slide' | 'none';
  slideDurationMs?: number;
  includeNarration?: boolean;
  backgroundMusic?: string;
}

interface VideoGenerationResult {
  id: string;
  status: 'completed' | 'failed';
  presentationId: string;
  outputPath: string;
  durationMs: number;
  slideCount: number;
  fileSize: number;
  audioSegments: AudioSegment[];
  processingTimeMs: number;
}

interface AudioSegment {
  slideIndex: number;
  text: string;
  audioPath: string;
  durationMs: number;
}

interface SlideFrame {
  slideIndex: number;
  title: string;
  narrationText: string;
  elements: Array<{
    type: string;
    content: string;
    position: { x: number; y: number; width: number; height: number };
  }>;
}

export class AIVideoGeneratorService {
  private readonly outputDir: string;

  constructor() {
    this.outputDir = process.env.VIDEO_OUTPUT_DIR || '/tmp/rasid/videos';
  }

  async generateVideoFromPresentation(config: VideoGenerationConfig): Promise<VideoGenerationResult> {
    const startTime = Date.now();
    const jobId = randomUUID();
    const voice = config.voice || 'nova';
    const language = config.language || 'ar';
    const slideDuration = config.slideDurationMs || 8000;

    logger.info('Starting video generation', { jobId, presentationId: config.presentationId });

    const presentation = await prisma.presentation.findUnique({
      where: { id: config.presentationId },
    });

    if (!presentation) {
      throw new Error(`Presentation ${config.presentationId} not found`);
    }

    const slidesData = (presentation.slides ?? (presentation as Record<string, unknown>).data) as Array<Record<string, unknown>>;
    if (!slidesData || !Array.isArray(slidesData)) {
      throw new Error('Presentation has no slides data');
    }

    const outputDir = path.join(this.outputDir, jobId);
    await fs.mkdir(outputDir, { recursive: true });

    const frames = await this.extractSlideFrames(slidesData, language);
    const audioSegments: AudioSegment[] = [];

    if (config.includeNarration !== false) {
      for (const frame of frames) {
        if (!frame.narrationText.trim()) continue;

        try {
          const audioResponse = await openai.audio.speech.create({
            model: 'tts-1-hd',
            voice,
            input: frame.narrationText,
            response_format: 'mp3',
            speed: language === 'ar' ? 0.9 : 1.0,
          });

          const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
          const audioPath = path.join(outputDir, `slide_${frame.slideIndex}.mp3`);
          await fs.writeFile(audioPath, audioBuffer);

          const estimatedDurationMs = Math.max(
            slideDuration,
            frame.narrationText.length * (language === 'ar' ? 80 : 60),
          );

          audioSegments.push({
            slideIndex: frame.slideIndex,
            text: frame.narrationText,
            audioPath,
            durationMs: estimatedDurationMs,
          });
        } catch (err) {
          logger.warn('Failed to generate audio for slide', {
            slideIndex: frame.slideIndex,
            error: String(err),
          });
          audioSegments.push({
            slideIndex: frame.slideIndex,
            text: frame.narrationText,
            audioPath: '',
            durationMs: slideDuration,
          });
        }
      }
    }

    const totalDuration = audioSegments.length > 0
      ? audioSegments.reduce((sum, s) => sum + s.durationMs, 0)
      : frames.length * slideDuration;

    const htmlFrames = await this.generateHTMLFrames(frames, config);
    const htmlPath = path.join(outputDir, 'presentation.html');
    await fs.writeFile(htmlPath, htmlFrames, 'utf-8');

    const manifestPath = path.join(outputDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify({
      id: jobId,
      presentationId: config.presentationId,
      slideCount: frames.length,
      totalDurationMs: totalDuration,
      resolution: config.resolution || '1080p',
      voice,
      language,
      transitionType: config.transitionType || 'fade',
      audioSegments: audioSegments.map((s) => ({
        slideIndex: s.slideIndex,
        durationMs: s.durationMs,
        hasAudio: Boolean(s.audioPath),
      })),
      htmlFile: 'presentation.html',
      createdAt: new Date().toISOString(),
    }, null, 2), 'utf-8');

    const totalFileSize = await this.calculateDirSize(outputDir);

    // Log video generation (auditLog model not in this service's schema)
    logger.info('Video generation audit', {
      action: 'video_generation_complete',
      entityId: config.presentationId,
      userId: config.userId,
      tenantId: config.tenantId,
      jobId,
      slideCount: frames.length,
      durationMs: totalDuration,
      audioSegments: audioSegments.length,
    });

    logger.info('Video generation complete', {
      jobId,
      slideCount: frames.length,
      totalDurationMs: totalDuration,
      processingTimeMs: Date.now() - startTime,
    });

    return {
      id: jobId,
      status: 'completed',
      presentationId: config.presentationId,
      outputPath: outputDir,
      durationMs: totalDuration,
      slideCount: frames.length,
      fileSize: totalFileSize,
      audioSegments,
      processingTimeMs: Date.now() - startTime,
    };
  }

  async generateNarrationScript(
    presentationId: string,
    language: 'ar' | 'en' = 'ar',
  ): Promise<Array<{ slideIndex: number; narration: string }>> {
    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
    });

    if (!presentation) throw new Error(`Presentation ${presentationId} not found`);

    const slidesData = (presentation.slides ?? (presentation as Record<string, unknown>).data) as Array<Record<string, unknown>>;
    if (!slidesData) throw new Error('No slides data');

    const slideContents = slidesData.map((slide, idx) => {
      const title = (slide.title as string) || `Slide ${idx + 1}`;
      const notes = (slide.speakerNotes as string) || '';
      const textElements = ((slide.elements as Array<Record<string, unknown>>) || [])
        .filter((e) => e.type === 'text')
        .map((e) => String(e.content || ''))
        .join('\n');
      return `Slide ${idx + 1}: "${title}"\nContent: ${textElements}\nNotes: ${notes}`;
    }).join('\n\n');

    const prompt = language === 'ar'
      ? `أنت مقدم عروض محترف. اكتب نص سرد صوتي لكل شريحة من العرض التالي. يجب أن يكون النص باللغة العربية الفصحى، واضح ومهني.

${slideContents}

أجب بصيغة JSON:
{ "narrations": [{ "slideIndex": 0, "narration": "النص هنا" }] }`
      : `You are a professional presenter. Write narration text for each slide of the following presentation. Keep it clear and professional.

${slideContents}

Respond in JSON:
{ "narrations": [{ "slideIndex": 0, "narration": "text here" }] }`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    const parsed: { narrations: Array<{ slideIndex: number; narration: string }> } = JSON.parse(content);
    return parsed.narrations;
  }

  async listVoices(): Promise<Array<{ id: string; name: string; language: string; gender: string }>> {
    return [
      { id: 'alloy', name: 'Alloy', language: 'multilingual', gender: 'neutral' },
      { id: 'echo', name: 'Echo', language: 'multilingual', gender: 'male' },
      { id: 'fable', name: 'Fable', language: 'multilingual', gender: 'neutral' },
      { id: 'onyx', name: 'Onyx', language: 'multilingual', gender: 'male' },
      { id: 'nova', name: 'Nova', language: 'multilingual', gender: 'female' },
      { id: 'shimmer', name: 'Shimmer', language: 'multilingual', gender: 'female' },
    ];
  }

  private async extractSlideFrames(
    slidesData: Array<Record<string, unknown>>,
    language: string,
  ): Promise<SlideFrame[]> {
    return slidesData.map((slide, idx) => {
      const title = (slide.title as string) || `Slide ${idx + 1}`;
      const notes = (slide.speakerNotes as string) || '';
      const elements = ((slide.elements as Array<Record<string, unknown>>) || []).map((el) => ({
        type: String(el.type || 'text'),
        content: String(el.content || el.text || ''),
        position: (el.position as { x: number; y: number; width: number; height: number }) || {
          x: 0, y: 0, width: 100, height: 50,
        },
      }));

      const narrationText = notes || elements.map((e) => e.content).filter(Boolean).join('. ');

      return {
        slideIndex: idx,
        title,
        narrationText,
        elements,
      };
    });
  }

  private async generateHTMLFrames(
    frames: SlideFrame[],
    config: VideoGenerationConfig,
  ): Promise<string> {
    const isRtl = (config.language || 'ar') === 'ar';
    const resolution = config.resolution === '720p'
      ? { width: 1280, height: 720 }
      : { width: 1920, height: 1080 };
    const transition = config.transitionType || 'fade';
    const slideDuration = config.slideDurationMs || 8000;

    const slideHtml = frames.map((frame, idx) => {
      const elementsHtml = frame.elements.map((el) => {
        if (el.type === 'text') {
          return `<div style="position:absolute;left:${el.position.x}%;top:${el.position.y}%;width:${el.position.width}%;font-size:1.5vw;color:#333;">${this.escapeHtml(el.content)}</div>`;
        }
        return '';
      }).join('\n');

      return `<div class="slide" id="slide-${idx}" style="display:${idx === 0 ? 'flex' : 'none'};position:relative;width:${resolution.width}px;height:${resolution.height}px;background:#fff;align-items:center;justify-content:center;flex-direction:column;">
  <h1 style="font-size:3vw;margin-bottom:20px;">${this.escapeHtml(frame.title)}</h1>
  ${elementsHtml}
</div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${config.language || 'ar'}">
<head>
<meta charset="utf-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ${isRtl ? "'Noto Sans Arabic', 'Arial'" : "'Arial', sans-serif"}; background: #000; overflow: hidden; }
.slide { transition: opacity ${transition === 'fade' ? '0.5s' : '0s'} ease; }
</style>
</head>
<body>
${slideHtml}
<script>
let current = 0;
const slides = document.querySelectorAll('.slide');
const duration = ${slideDuration};
setInterval(() => {
  slides[current].style.display = 'none';
  current = (current + 1) % slides.length;
  slides[current].style.display = 'flex';
}, duration);
</script>
</body>
</html>`;
  }

  private async calculateDirSize(dirPath: string): Promise<number> {
    let total = 0;
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          total += stat.size;
        }
      }
    } catch { /* ignore */ }
    return total;
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
}

export const aiVideoGeneratorService = new AIVideoGeneratorService();
