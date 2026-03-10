import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'presentation-service', module: 'ai-voiceover' },
  transports: [new winston.transports.Console()],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export type VoiceName = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type AudioFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export interface VoiceoverOptions {
  format?: AudioFormat;
  speed?: number;
  model?: 'tts-1' | 'tts-1-hd';
}

export interface VoiceoverResult {
  jobId: string;
  audioUrl: string;
  durationMs: number;
  format: AudioFormat;
  voice: VoiceName;
  language: string;
  sizeBytes: number;
}

export interface VoiceInfo {
  name: VoiceName;
  description: string;
  suitableFor: string[];
  languages: string[];
}

export interface AudioJobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  audioUrl: string | null;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface AudioSegment {
  buffer: Buffer;
  durationMs: number;
  slideIndex: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AIVoiceoverService {
  private readonly openai: OpenAI;
  private readonly s3: S3Client;
  private readonly bucket: string;

  private static readonly VOICES: VoiceInfo[] = [
    { name: 'alloy', description: 'Neutral and balanced', suitableFor: ['narration', 'general'], languages: ['en', 'ar', 'multi'] },
    { name: 'echo', description: 'Warm and confident', suitableFor: ['presentations', 'storytelling'], languages: ['en', 'ar', 'multi'] },
    { name: 'fable', description: 'Expressive and dynamic', suitableFor: ['stories', 'marketing'], languages: ['en', 'ar', 'multi'] },
    { name: 'onyx', description: 'Deep and authoritative', suitableFor: ['corporate', 'announcements'], languages: ['en', 'ar', 'multi'] },
    { name: 'nova', description: 'Friendly and upbeat', suitableFor: ['tutorials', 'explainers'], languages: ['en', 'ar', 'multi'] },
    { name: 'shimmer', description: 'Clear and pleasant', suitableFor: ['customer-facing', 'notifications'], languages: ['en', 'ar', 'multi'] },
  ];

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    this.s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT || process.env.MINIO_ENDPOINT || 'http://localhost:9000',
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || process.env.MINIO_SECRET_KEY || '',
      },
      forcePathStyle: true,
    });
    this.bucket = process.env.S3_BUCKET || process.env.MINIO_BUCKET || 'rasid-voiceovers';
  }

  async generateVoiceover(
    text: string,
    voice: VoiceName,
    language: string,
    options: VoiceoverOptions = {},
  ): Promise<VoiceoverResult> {
    const jobId = uuidv4();
    const startTime = Date.now();
    const format = options.format || 'mp3';
    const speed = Math.min(4.0, Math.max(0.25, options.speed || 1.0));
    const model = options.model || 'tts-1-hd';

    logger.info('Generating voiceover', { jobId, voice, language, textLength: text.length, format, speed, model });

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    if (text.length > 4096) {
      throw new Error('Text exceeds maximum length of 4096 characters. Split into segments.');
    }

    const validVoices: VoiceName[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (!validVoices.includes(voice)) {
      throw new Error(`Invalid voice: ${voice}. Valid voices: ${validVoices.join(', ')}`);
    }

    const response = await this.openai.audio.speech.create({
      model,
      voice,
      input: text,
      response_format: format,
      speed,
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const durationMs = Date.now() - startTime;
    const sizeBytes = audioBuffer.length;

    const s3Key = `voiceovers/${jobId}.${format}`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      Body: audioBuffer,
      ContentType: this.getContentType(format),
      Metadata: {
        jobId,
        voice,
        language,
        model,
      },
    }));

    const audioUrl = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
      { expiresIn: 86400 },
    );

    const estimatedAudioDuration = this.estimateAudioDuration(text, speed, language);

    await (this.prisma as unknown as Record<string, { create: Function; update: Function; findUnique: Function }>).voiceoverJob.create({
      data: {
        id: jobId,
        text: text.substring(0, 4096),
        voice,
        language,
        format,
        speed,
        model,
        s3Key,
        audioUrl,
        sizeBytes,
        durationMs: estimatedAudioDuration,
        processingMs: durationMs,
        status: 'completed',
        completedAt: new Date(),
        createdAt: new Date(),
      },
    });

    logger.info('Voiceover generated', { jobId, sizeBytes, durationMs, estimatedAudioDuration });

    return {
      jobId,
      audioUrl,
      durationMs: estimatedAudioDuration,
      format,
      voice,
      language,
      sizeBytes,
    };
  }

  async generateForSlide(
    presentationId: string,
    slideIndex: number,
    tenantId: string,
  ): Promise<VoiceoverResult> {
    logger.info('Generating voiceover for slide', { presentationId, slideIndex, tenantId });

    const presentation = await this.prisma.presentation.findFirst({
      where: { id: presentationId, tenantId },
    });

    if (!presentation) {
      throw new Error(`Presentation ${presentationId} not found in tenant ${tenantId}`);
    }

    const slides = await this.prisma.slide.findMany({
      where: { presentationId },
      orderBy: { order: 'asc' },
    });

    if (slideIndex < 0 || slideIndex >= slides.length) {
      throw new Error(`Slide index ${slideIndex} is out of range (0-${slides.length - 1})`);
    }

    const slide = slides[slideIndex];
    const speakerNotes = (slide as Record<string, unknown>).speakerNotes as string || '';

    if (!speakerNotes || speakerNotes.trim().length === 0) {
      throw new Error(`Slide ${slideIndex} has no speaker notes to convert to voiceover`);
    }

    const language = this.detectLanguage(speakerNotes);
    const voice: VoiceName = language === 'ar' ? 'onyx' : 'nova';

    const result = await this.generateVoiceover(speakerNotes, voice, language, {
      model: 'tts-1-hd',
      format: 'mp3',
    });

    await (this.prisma as unknown as Record<string, { upsert: Function }>).slideVoiceover.upsert({
      where: {
        presentationId_slideIndex: {
          presentationId,
          slideIndex,
        },
      },
      create: {
        presentationId,
        slideIndex,
        slideId: slide.id,
        jobId: result.jobId,
        audioUrl: result.audioUrl,
        durationMs: result.durationMs,
        voice,
        language,
        createdAt: new Date(),
      },
      update: {
        jobId: result.jobId,
        audioUrl: result.audioUrl,
        durationMs: result.durationMs,
        voice,
        language,
        updatedAt: new Date(),
      },
    });

    return result;
  }

  async generateForPresentation(
    presentationId: string,
    tenantId: string,
  ): Promise<{ jobId: string; audioUrl: string; totalDurationMs: number; slideCount: number; segments: Array<{ slideIndex: number; durationMs: number; audioUrl: string }> }> {
    const jobId = uuidv4();
    logger.info('Generating voiceover for entire presentation', { jobId, presentationId, tenantId });

    const presentation = await this.prisma.presentation.findFirst({
      where: { id: presentationId, tenantId },
    });

    if (!presentation) {
      throw new Error(`Presentation ${presentationId} not found in tenant ${tenantId}`);
    }

    const slides = await this.prisma.slide.findMany({
      where: { presentationId },
      orderBy: { order: 'asc' },
    });

    const slidesWithNotes = slides.filter((s) => {
      const notes = (s as Record<string, unknown>).speakerNotes as string;
      return notes && notes.trim().length > 0;
    });

    if (slidesWithNotes.length === 0) {
      throw new Error('No slides with speaker notes found in this presentation');
    }

    await (this.prisma as unknown as Record<string, { create: Function; update: Function; findUnique: Function }>).voiceoverJob.create({
      data: {
        id: jobId,
        text: `Presentation: ${presentationId}`,
        voice: 'nova',
        language: 'multi',
        format: 'mp3',
        speed: 1.0,
        model: 'tts-1-hd',
        s3Key: '',
        audioUrl: '',
        sizeBytes: 0,
        durationMs: 0,
        processingMs: 0,
        status: 'processing',
        createdAt: new Date(),
      },
    });

    const segments: Array<{ slideIndex: number; durationMs: number; audioUrl: string }> = [];
    const audioBuffers: Buffer[] = [];

    for (let i = 0; i < slides.length; i++) {
      const notes = (slides[i] as Record<string, unknown>).speakerNotes as string;
      if (!notes || notes.trim().length === 0) {
        continue;
      }

      const language = this.detectLanguage(notes);
      const voice: VoiceName = language === 'ar' ? 'onyx' : 'nova';

      const response = await this.openai.audio.speech.create({
        model: 'tts-1-hd',
        voice,
        input: notes,
        response_format: 'mp3',
        speed: 1.0,
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      audioBuffers.push(buffer);

      const segmentS3Key = `voiceovers/${jobId}/slide-${i}.mp3`;
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: segmentS3Key,
        Body: buffer,
        ContentType: 'audio/mpeg',
      }));

      const segmentUrl = await getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.bucket, Key: segmentS3Key }),
        { expiresIn: 86400 },
      );

      const estimatedDuration = this.estimateAudioDuration(notes, 1.0, language);
      segments.push({ slideIndex: i, durationMs: estimatedDuration, audioUrl: segmentUrl });

      logger.info('Slide voiceover generated', { jobId, slideIndex: i, sizeBytes: buffer.length });
    }

    const mergedBuffer = this.mergeAudioSegments(audioBuffers.map((buf, idx) => ({
      buffer: buf,
      durationMs: segments[idx]?.durationMs || 0,
      slideIndex: idx,
    })));

    const mergedS3Key = `voiceovers/${jobId}/full.mp3`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: mergedS3Key,
      Body: mergedBuffer,
      ContentType: 'audio/mpeg',
    }));

    const fullAudioUrl = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: mergedS3Key }),
      { expiresIn: 86400 },
    );

    const totalDurationMs = segments.reduce((sum, s) => sum + s.durationMs, 0);

    await (this.prisma as unknown as Record<string, { create: Function; update: Function; findUnique: Function }>).voiceoverJob.update({
      where: { id: jobId },
      data: {
        s3Key: mergedS3Key,
        audioUrl: fullAudioUrl,
        sizeBytes: mergedBuffer.length,
        durationMs: totalDurationMs,
        processingMs: 0,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    logger.info('Full presentation voiceover complete', { jobId, slideCount: segments.length, totalDurationMs });

    return {
      jobId,
      audioUrl: fullAudioUrl,
      totalDurationMs,
      slideCount: segments.length,
      segments,
    };
  }

  listVoices(): VoiceInfo[] {
    return AIVoiceoverService.VOICES;
  }

  async getAudioStatus(jobId: string): Promise<AudioJobStatus> {
    const job = await (this.prisma as unknown as Record<string, { create: Function; update: Function; findUnique: Function }>).voiceoverJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Voiceover job ${jobId} not found`);
    }

    let progress = 0;
    if (job.status === 'completed') progress = 100;
    else if (job.status === 'processing') progress = 50;
    else if (job.status === 'pending') progress = 0;

    return {
      jobId: job.id,
      status: job.status as AudioJobStatus['status'],
      progress,
      audioUrl: job.status === 'completed' ? job.audioUrl : null,
      error: job.status === 'failed' ? ((job as Record<string, unknown>).errorMessage as string || 'Unknown error') : null,
      createdAt: job.createdAt,
      completedAt: job.completedAt || null,
    };
  }

  adjustTiming(audioBuffer: Buffer, targetDurationMs: number): Buffer {
    logger.info('Adjusting audio timing', { originalSize: audioBuffer.length, targetDurationMs });

    if (targetDurationMs <= 0) {
      throw new Error('Target duration must be positive');
    }

    // For MP3 format: calculate frame-level adjustment
    // MP3 frames at 128kbps, 44100Hz = ~26ms per frame, 417 bytes per frame
    const bytesPerFrame = 417;
    const msPerFrame = 26;
    const totalFrames = Math.floor(audioBuffer.length / bytesPerFrame);
    const currentDurationMs = totalFrames * msPerFrame;

    if (currentDurationMs === 0) {
      return audioBuffer;
    }

    const ratio = targetDurationMs / currentDurationMs;

    if (ratio >= 0.9 && ratio <= 1.1) {
      return audioBuffer;
    }

    // For significant timing changes, we return the original buffer
    // as proper time-stretching requires ffmpeg or similar DSP library.
    // The caller should use the `speed` option in generateVoiceover instead.
    logger.warn('Audio timing adjustment requires regeneration with speed parameter', {
      currentDurationMs,
      targetDurationMs,
      suggestedSpeed: Math.round((1 / ratio) * 100) / 100,
    });

    return audioBuffer;
  }

  mergeAudioSegments(segments: AudioSegment[]): Buffer {
    if (segments.length === 0) {
      return Buffer.alloc(0);
    }

    if (segments.length === 1) {
      return segments[0].buffer;
    }

    const sortedSegments = [...segments].sort((a, b) => a.slideIndex - b.slideIndex);

    // Simple concatenation of MP3 frames - works for MP3 format
    // as MP3 is a frame-based format that supports concatenation
    const totalSize = sortedSegments.reduce((sum, seg) => sum + seg.buffer.length, 0);
    const merged = Buffer.alloc(totalSize);
    let offset = 0;

    for (const segment of sortedSegments) {
      segment.buffer.copy(merged, offset);
      offset += segment.buffer.length;
    }

    logger.info('Audio segments merged', {
      segmentCount: segments.length,
      totalSize: merged.length,
    });

    return merged;
  }

  private estimateAudioDuration(text: string, speed: number, language: string): number {
    // Average speaking rate: ~150 words/min English, ~130 words/min Arabic
    const wordsPerMinute = language === 'ar' ? 130 : 150;
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
    const baseDurationMs = (wordCount / wordsPerMinute) * 60 * 1000;
    return Math.round(baseDurationMs / speed);
  }

  private detectLanguage(text: string): string {
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    const arabicChars = (text.match(new RegExp(arabicPattern.source, 'g')) || []).length;
    const totalChars = text.replace(/\s/g, '').length;

    if (totalChars === 0) return 'en';
    return arabicChars / totalChars > 0.3 ? 'ar' : 'en';
  }

  private getContentType(format: AudioFormat): string {
    const contentTypes: Record<AudioFormat, string> = {
      mp3: 'audio/mpeg',
      opus: 'audio/opus',
      aac: 'audio/aac',
      flac: 'audio/flac',
      wav: 'audio/wav',
      pcm: 'audio/pcm',
    };
    return contentTypes[format] || 'application/octet-stream';
  }
}
