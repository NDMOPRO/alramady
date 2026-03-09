import { PrismaClient } from '@prisma/client';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { spawn } from 'child_process';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import { z } from 'zod';

const prisma = new PrismaClient();

const VideoOptionsSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  resolution: z.enum(['720p', '1080p', '1440p', '4k']).default('1080p'),
  fps: z.number().min(1).max(60).default(30),
  slideDurationSec: z.number().min(1).max(300).default(5),
  transitionType: z.enum(['none', 'fade', 'slide-left', 'slide-right', 'dissolve', 'zoom']).default('fade'),
  transitionDurationSec: z.number().min(0).max(5).default(1),
  outputFormat: z.enum(['mp4', 'webm', 'avi']).default('mp4'),
  quality: z.enum(['low', 'medium', 'high', 'ultra']).default('high'),
  backgroundAudio: z.string().optional(),
  audioFadeIn: z.number().min(0).max(10).default(2),
  audioFadeOut: z.number().min(0).max(10).default(2),
  watermark: z.object({
    text: z.string(),
    position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']),
    opacity: z.number().min(0).max(1).default(0.3),
    fontSize: z.number().min(8).max(72).default(16),
  }).optional(),
});

type VideoOptions = z.infer<typeof VideoOptionsSchema>;

const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};

const QUALITY_CRF: Record<string, number> = {
  low: 28,
  medium: 23,
  high: 18,
  ultra: 14,
};

interface SlideImage {
  index: number;
  buffer: Buffer;
  width: number;
  height: number;
  durationSec: number;
}

interface VideoJobProgress {
  jobId: string;
  status: 'queued' | 'extracting-slides' | 'rendering-frames' | 'encoding-video' | 'adding-audio' | 'finalizing' | 'completed' | 'failed';
  progress: number;
  totalSlides: number;
  processedSlides: number;
  estimatedTimeRemainingSec: number;
  outputPath: string;
  errorMessage: string;
}

interface PresentationToVideoResult {
  jobId: string;
  status: string;
  outputPath: string;
  outputFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  videoDurationSec: number;
  slideCount: number;
  resolution: string;
  fps: number;
  processingTimeMs: number;
}

export class PresentationToVideoService {
  private redis: IORedis;
  private queue: Queue;
  private worker: Worker | null = null;
  private activeJobs: Map<string, VideoJobProgress> = new Map();

  constructor() {
    this.redis = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue('presentation-to-video', { connection: this.redis as unknown as import('bullmq').ConnectionOptions });
  }

  async convert(
    slideImages: Buffer[],
    filename: string,
    options: Partial<VideoOptions> & { tenantId: string; userId: string }
  ): Promise<PresentationToVideoResult> {
    const startTime = Date.now();
    const validated = VideoOptionsSchema.parse(options);

    logger.info('Starting presentation to video conversion', {
      filename,
      tenantId: validated.tenantId,
      slideCount: slideImages.length,
      resolution: validated.resolution,
      outputFormat: validated.outputFormat,
    });

    if (slideImages.length === 0) {
      throw new Error('No slide images provided for video conversion');
    }

    const resolution = RESOLUTION_MAP[validated.resolution];
    const jobId = crypto.randomUUID();
    const tempDir = path.join(process.env.TEMP_DIR || '/tmp', 'video-conversion', jobId);
    await fs.promises.mkdir(tempDir, { recursive: true });

    const progress: VideoJobProgress = {
      jobId,
      status: 'extracting-slides',
      progress: 0,
      totalSlides: slideImages.length,
      processedSlides: 0,
      estimatedTimeRemainingSec: 0,
      outputPath: '',
      errorMessage: '',
    };
    this.activeJobs.set(jobId, progress);

    try {
      const processedSlides: SlideImage[] = [];
      for (let i = 0; i < slideImages.length; i++) {
        const processedBuffer = await this.processSlideImage(
          slideImages[i],
          resolution.width,
          resolution.height,
          validated.watermark
        );

        const slidePath = path.join(tempDir, `slide_${String(i).padStart(4, '0')}.png`);
        await fs.promises.writeFile(slidePath, processedBuffer);

        processedSlides.push({
          index: i,
          buffer: processedBuffer,
          width: resolution.width,
          height: resolution.height,
          durationSec: validated.slideDurationSec,
        });

        progress.processedSlides = i + 1;
        progress.progress = Math.round(((i + 1) / slideImages.length) * 30);
      }

      logger.info('Slides processed', { count: processedSlides.length, jobId });

      progress.status = 'rendering-frames';
      progress.progress = 30;

      await this.generateFramesWithTransitions(
        tempDir,
        processedSlides,
        validated
      );

      progress.status = 'encoding-video';
      progress.progress = 60;

      const outputFilename = filename.replace(/\.[^.]+$/, `.${validated.outputFormat}`) || `presentation.${validated.outputFormat}`;
      const outputPath = path.join(tempDir, outputFilename);

      await this.encodeVideo(tempDir, outputPath, validated);

      if (validated.backgroundAudio) {
        progress.status = 'adding-audio';
        progress.progress = 85;
        await this.addBackgroundAudio(outputPath, validated.backgroundAudio, validated);
      }

      progress.status = 'finalizing';
      progress.progress = 95;

      const stats = await fs.promises.stat(outputPath);
      const videoDurationSec = slideImages.length * validated.slideDurationSec +
        (slideImages.length - 1) * validated.transitionDurationSec;

      const mimeMap: Record<string, string> = {
        mp4: 'video/mp4',
        webm: 'video/webm',
        avi: 'video/x-msvideo',
      };

      const processingTimeMs = Date.now() - startTime;

      const job = await prisma.conversionJob.create({
        data: {
          tenantId: validated.tenantId,
          userId: validated.userId,
          sourceFormat: 'PPTX_IMAGES',
          targetFormat: validated.outputFormat.toUpperCase() as string,
          sourceFilename: filename,
          outputFilename,
          sourceSizeBytes: slideImages.reduce((s, b) => s + b.length, 0),
          outputSizeBytes: stats.size,
          status: 'COMPLETED',
          durationMs: processingTimeMs,
          metadata: JSON.stringify({
            slideCount: slideImages.length,
            resolution: validated.resolution,
            fps: validated.fps,
            videoDurationSec,
            quality: validated.quality,
            transitionType: validated.transitionType,
          }),
        },
      });

      progress.status = 'completed';
      progress.progress = 100;
      progress.outputPath = outputPath;

      logger.info('Presentation to video conversion completed', {
        jobId: job.id,
        slideCount: slideImages.length,
        videoDuration: videoDurationSec,
        fileSize: stats.size,
        processingTimeMs,
      });

      return {
        jobId: job.id,
        status: 'COMPLETED',
        outputPath,
        outputFilename,
        mimeType: mimeMap[validated.outputFormat] || 'video/mp4',
        fileSizeBytes: stats.size,
        videoDurationSec,
        slideCount: slideImages.length,
        resolution: validated.resolution,
        fps: validated.fps,
        processingTimeMs,
      };
    } catch (error) {
      progress.status = 'failed';
      progress.errorMessage = error instanceof Error ? error.message : String(error);

      await prisma.conversionJob.create({
        data: {
          tenantId: validated.tenantId,
          userId: validated.userId,
          sourceFormat: 'PPTX_IMAGES',
          targetFormat: validated.outputFormat.toUpperCase() as string,
          sourceFilename: filename,
          outputFilename: `failed_${filename}`,
          status: 'FAILED',
          durationMs: Date.now() - startTime,
          metadata: JSON.stringify({ error: progress.errorMessage }),
        },
      });

      logger.error('Presentation to video conversion failed', {
        jobId,
        error: progress.errorMessage,
      });

      throw error;
    }
  }

  async queueConversion(
    slideImages: Buffer[],
    filename: string,
    options: Partial<VideoOptions> & { tenantId: string; userId: string }
  ): Promise<{ jobId: string; status: string }> {
    const validated = VideoOptionsSchema.parse(options);
    const jobId = crypto.randomUUID();

    logger.info('Queuing presentation to video conversion', {
      jobId,
      filename,
      slideCount: slideImages.length,
    });

    const tempDir = path.join(process.env.TEMP_DIR || '/tmp', 'video-conversion', jobId);
    await fs.promises.mkdir(tempDir, { recursive: true });

    for (let i = 0; i < slideImages.length; i++) {
      const slidePath = path.join(tempDir, `input_slide_${String(i).padStart(4, '0')}.png`);
      await fs.promises.writeFile(slidePath, slideImages[i]);
    }

    const progress: VideoJobProgress = {
      jobId,
      status: 'queued',
      progress: 0,
      totalSlides: slideImages.length,
      processedSlides: 0,
      estimatedTimeRemainingSec: slideImages.length * 10,
      outputPath: '',
      errorMessage: '',
    };
    this.activeJobs.set(jobId, progress);

    await this.queue.add('convert-video', {
      jobId,
      tempDir,
      slideCount: slideImages.length,
      filename,
      options: validated,
    }, {
      priority: 5,
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
    });

    return { jobId, status: 'queued' };
  }

  async startWorker(): Promise<void> {
    if (this.worker) return;

    this.worker = new Worker('presentation-to-video', async (job: Job) => {
      const { jobId, tempDir, slideCount, filename, options } = job.data;

      const slideImages: Buffer[] = [];
      for (let i = 0; i < slideCount; i++) {
        const slidePath = path.join(tempDir, `input_slide_${String(i).padStart(4, '0')}.png`);
        const buffer = await fs.promises.readFile(slidePath);
        slideImages.push(buffer);
      }

      return this.convert(slideImages, filename, options);
    }, {
      connection: this.redis as unknown as import('bullmq').ConnectionOptions,
      concurrency: 2,
    });

    this.worker.on('completed', (job, result) => {
      logger.info('Video conversion worker completed', { jobId: job.data.jobId });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('Video conversion worker failed', {
        jobId: job?.data?.jobId,
        error: err.message,
      });
    });
  }

  getJobProgress(jobId: string): VideoJobProgress | null {
    return this.activeJobs.get(jobId) || null;
  }

  private async processSlideImage(
    buffer: Buffer,
    targetWidth: number,
    targetHeight: number,
    watermark?: VideoOptions['watermark']
  ): Promise<Buffer> {
    let pipeline = sharp(buffer, { failOnError: false });

    pipeline = pipeline.resize(targetWidth, targetHeight, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: sharp.kernel.lanczos3,
    });

    if (watermark) {
      const watermarkSvg = this.createWatermarkSvg(
        watermark.text,
        watermark.fontSize,
        watermark.opacity,
        targetWidth,
        targetHeight,
        watermark.position
      );

      pipeline = pipeline.composite([{
        input: Buffer.from(watermarkSvg),
        gravity: this.mapPositionToGravity(watermark.position),
      }]);
    }

    return pipeline.png({ compressionLevel: 1 }).toBuffer();
  }

  private async generateFramesWithTransitions(
    tempDir: string,
    slides: SlideImage[],
    options: VideoOptions
  ): Promise<void> {
    const framesDir = path.join(tempDir, 'frames');
    await fs.promises.mkdir(framesDir, { recursive: true });

    let frameIndex = 0;
    const transitionFrames = Math.round(options.transitionDurationSec * options.fps);
    const slideFrames = Math.round(options.slideDurationSec * options.fps);

    for (let slideIdx = 0; slideIdx < slides.length; slideIdx++) {
      const slide = slides[slideIdx];

      for (let f = 0; f < slideFrames; f++) {
        const framePath = path.join(framesDir, `frame_${String(frameIndex).padStart(6, '0')}.png`);
        await fs.promises.writeFile(framePath, slide.buffer);
        frameIndex++;
      }

      if (slideIdx < slides.length - 1 && options.transitionType !== 'none' && transitionFrames > 0) {
        const nextSlide = slides[slideIdx + 1];

        for (let t = 0; t < transitionFrames; t++) {
          const progress = t / transitionFrames;
          const transitionFrame = await this.generateTransitionFrame(
            slide.buffer,
            nextSlide.buffer,
            progress,
            options.transitionType,
            slides[0].width,
            slides[0].height
          );

          const framePath = path.join(framesDir, `frame_${String(frameIndex).padStart(6, '0')}.png`);
          await fs.promises.writeFile(framePath, transitionFrame);
          frameIndex++;
        }
      }
    }

    logger.info('Frames generated', { totalFrames: frameIndex, tempDir });
  }

  private async generateTransitionFrame(
    fromBuffer: Buffer,
    toBuffer: Buffer,
    progress: number,
    transitionType: string,
    width: number,
    height: number
  ): Promise<Buffer> {
    switch (transitionType) {
      case 'fade': {
        const fromOpacity = 1 - progress;
        const toOpacity = progress;

        const fromLayer = await sharp(fromBuffer)
          .ensureAlpha()
          .modulate({ brightness: fromOpacity })
          .toBuffer();

        const toLayer = await sharp(toBuffer)
          .ensureAlpha()
          .modulate({ brightness: toOpacity })
          .toBuffer();

        return sharp(fromLayer)
          .composite([{ input: toLayer, blend: 'add' }])
          .png({ compressionLevel: 1 })
          .toBuffer();
      }

      case 'slide-left': {
        const offset = Math.round(width * progress);
        const canvas = sharp({
          create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
        });

        return canvas
          .composite([
            { input: fromBuffer, left: -offset, top: 0 },
            { input: toBuffer, left: width - offset, top: 0 },
          ])
          .png({ compressionLevel: 1 })
          .toBuffer();
      }

      case 'slide-right': {
        const offset = Math.round(width * progress);
        const canvas = sharp({
          create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
        });

        return canvas
          .composite([
            { input: fromBuffer, left: offset, top: 0 },
            { input: toBuffer, left: -(width - offset), top: 0 },
          ])
          .png({ compressionLevel: 1 })
          .toBuffer();
      }

      case 'dissolve': {
        if (progress < 0.5) {
          const brightness = 1 - progress * 2;
          return sharp(fromBuffer)
            .modulate({ brightness: Math.max(0.01, brightness) })
            .png({ compressionLevel: 1 })
            .toBuffer();
        }
        const brightness = (progress - 0.5) * 2;
        return sharp(toBuffer)
          .modulate({ brightness: Math.max(0.01, brightness) })
          .png({ compressionLevel: 1 })
          .toBuffer();
      }

      case 'zoom': {
        const scale = 1 + progress * 0.3;
        const zoomedWidth = Math.round(width * scale);
        const zoomedHeight = Math.round(height * scale);
        const cropLeft = Math.round((zoomedWidth - width) / 2);
        const cropTop = Math.round((zoomedHeight - height) / 2);

        if (progress < 0.5) {
          return sharp(fromBuffer)
            .resize(zoomedWidth, zoomedHeight, { kernel: sharp.kernel.lanczos3 })
            .extract({ left: cropLeft, top: cropTop, width, height })
            .modulate({ brightness: Math.max(0.01, 1 - progress * 2) })
            .png({ compressionLevel: 1 })
            .toBuffer();
        }
        return sharp(toBuffer)
          .modulate({ brightness: Math.max(0.01, (progress - 0.5) * 2) })
          .png({ compressionLevel: 1 })
          .toBuffer();
      }

      default:
        return progress < 0.5 ? fromBuffer : toBuffer;
    }
  }

  private async encodeVideo(
    tempDir: string,
    outputPath: string,
    options: VideoOptions
  ): Promise<void> {
    const framesDir = path.join(tempDir, 'frames');
    const crf = QUALITY_CRF[options.quality];

    const ffmpegArgs: string[] = [
      '-y',
      '-framerate', String(options.fps),
      '-i', path.join(framesDir, 'frame_%06d.png'),
    ];

    if (options.outputFormat === 'mp4') {
      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', options.quality === 'ultra' ? 'slow' : 'medium',
        '-crf', String(crf),
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      );
    } else if (options.outputFormat === 'webm') {
      ffmpegArgs.push(
        '-c:v', 'libvpx-vp9',
        '-crf', String(crf),
        '-b:v', '0',
        '-pix_fmt', 'yuv420p',
      );
    } else {
      ffmpegArgs.push(
        '-c:v', 'mpeg4',
        '-q:v', String(Math.max(1, Math.round(crf / 3))),
      );
    }

    ffmpegArgs.push(outputPath);

    logger.info('Starting ffmpeg encoding', {
      outputPath,
      format: options.outputFormat,
      resolution: options.resolution,
      fps: options.fps,
      quality: options.quality,
    });

    await this.runFFmpeg(ffmpegArgs);

    logger.info('Video encoding completed', { outputPath });
  }

  private async addBackgroundAudio(
    videoPath: string,
    audioPath: string,
    options: VideoOptions
  ): Promise<void> {
    const audioExists = await fs.promises.access(audioPath, fs.constants.R_OK)
      .then(() => true)
      .catch(() => false);

    if (!audioExists) {
      logger.warn('Background audio file not found, skipping', { audioPath });
      return;
    }

    const tempOutputPath = videoPath.replace(/(\.[^.]+)$/, '_with_audio$1');

    const ffmpegArgs = [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-af', `afade=t=in:st=0:d=${options.audioFadeIn},afade=t=out:st=end:d=${options.audioFadeOut}`,
      '-shortest',
      tempOutputPath,
    ];

    await this.runFFmpeg(ffmpegArgs);

    await fs.promises.rename(tempOutputPath, videoPath);
    logger.info('Background audio added to video', { videoPath });
  }

  private runFFmpeg(args: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
      const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stderr = '';

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          const errorLines = stderr.split('\n').filter(l => l.trim().length > 0).slice(-5);
          reject(new Error(`FFmpeg exited with code ${code}: ${errorLines.join(' | ')}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start FFmpeg: ${err.message}. Ensure FFmpeg is installed.`));
      });
    });
  }

  private createWatermarkSvg(
    text: string,
    fontSize: number,
    opacity: number,
    width: number,
    height: number,
    position: string
  ): string {
    let x: string;
    let y: string;
    let anchor: string;

    switch (position) {
      case 'top-left':
        x = '20'; y = String(fontSize + 10); anchor = 'start'; break;
      case 'top-right':
        x = String(width - 20); y = String(fontSize + 10); anchor = 'end'; break;
      case 'bottom-left':
        x = '20'; y = String(height - 20); anchor = 'start'; break;
      case 'bottom-right':
        x = String(width - 20); y = String(height - 20); anchor = 'end'; break;
      default:
        x = String(width / 2); y = String(height / 2); anchor = 'middle'; break;
    }

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}"
    fill="white" fill-opacity="${opacity}" text-anchor="${anchor}"
    stroke="black" stroke-width="0.5" stroke-opacity="${opacity * 0.3}">
    ${this.escapeXml(text)}
  </text>
</svg>`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private mapPositionToGravity(position: string): string {
    const map: Record<string, string> = {
      'top-left': 'northwest',
      'top-right': 'northeast',
      'bottom-left': 'southwest',
      'bottom-right': 'southeast',
      'center': 'center',
    };
    return map[position] || 'southeast';
  }

  async cleanup(jobId: string): Promise<void> {
    const tempDir = path.join(process.env.TEMP_DIR || '/tmp', 'video-conversion', jobId);
    const dirExists = await fs.promises.access(tempDir).then(() => true).catch(() => false);
    if (dirExists) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      logger.info('Cleaned up temp directory', { jobId, tempDir });
    }
    this.activeJobs.delete(jobId);
  }
}

export const presentationToVideoService = new PresentationToVideoService();
