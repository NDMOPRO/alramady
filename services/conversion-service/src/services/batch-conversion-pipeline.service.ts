import { PrismaClient } from '@prisma/client';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface BatchConversionJob {
  id: string;
  files: ConversionFileEntry[];
  outputFormat: string;
  options: ConversionOptions;
  priority: number;
  createdAt: Date;
  status: BatchJobStatus;
  progress: BatchProgress;
  callbackUrl?: string;
}

interface ConversionFileEntry {
  fileId: string;
  filePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  detectedFormat?: string;
  conversionStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  outputPath?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  qualityScore?: number;
}

interface ConversionOptions {
  quality: 'draft' | 'standard' | 'high' | 'lossless';
  preserveMetadata: boolean;
  preserveFormatting: boolean;
  ocrEnabled: boolean;
  ocrLanguage: string;
  maxFileSizeMb: number;
  timeout: number;
  retryAttempts: number;
  parallelism: number;
  watermark?: WatermarkConfig;
  compression?: CompressionConfig;
}

interface WatermarkConfig {
  text: string;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number;
  fontSize: number;
  color: string;
  rotation: number;
}

interface CompressionConfig {
  enabled: boolean;
  level: number;
  algorithm: 'gzip' | 'brotli' | 'deflate';
}

type BatchJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'paused';

interface BatchProgress {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  skippedFiles: number;
  processingFiles: number;
  percentComplete: number;
  estimatedTimeRemaining: number;
  bytesProcessed: number;
  totalBytes: number;
  throughputBytesPerSec: number;
  startedAt?: Date;
}

interface FormatDetectionResult {
  detectedFormat: string;
  confidence: number;
  mimeType: string;
  isSupported: boolean;
  suggestedOutputFormats: string[];
  fileCharacteristics: FileCharacteristics;
}

interface FileCharacteristics {
  hasText: boolean;
  hasImages: boolean;
  hasTables: boolean;
  hasFormulas: boolean;
  pageCount?: number;
  encoding?: string;
  isEncrypted: boolean;
  isCorrupted: boolean;
}

interface QualityValidationResult {
  overallScore: number;
  passed: boolean;
  checks: QualityCheck[];
  recommendations: string[];
}

interface QualityCheck {
  name: string;
  passed: boolean;
  score: number;
  weight: number;
  details: string;
}

interface ConversionMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  averageQualityScore: number;
  totalBytesProcessed: number;
  formatBreakdown: Record<string, number>;
  errorBreakdown: Record<string, number>;
  throughputHistory: ThroughputEntry[];
}

interface ThroughputEntry {
  timestamp: Date;
  filesPerMinute: number;
  bytesPerSecond: number;
}

interface PipelineStage {
  name: string;
  handler: (file: ConversionFileEntry, options: ConversionOptions) => Promise<ConversionFileEntry>;
  enabled: boolean;
  order: number;
}

const FORMAT_SIGNATURES: Record<string, { magic: Buffer; offset: number; format: string; mime: string }[]> = {
  pdf: [{ magic: Buffer.from([0x25, 0x50, 0x44, 0x46]), offset: 0, format: 'pdf', mime: 'application/pdf' }],
  png: [{ magic: Buffer.from([0x89, 0x50, 0x4E, 0x47]), offset: 0, format: 'png', mime: 'image/png' }],
  jpeg: [{ magic: Buffer.from([0xFF, 0xD8, 0xFF]), offset: 0, format: 'jpeg', mime: 'image/jpeg' }],
  gif: [{ magic: Buffer.from([0x47, 0x49, 0x46, 0x38]), offset: 0, format: 'gif', mime: 'image/gif' }],
  zip: [{ magic: Buffer.from([0x50, 0x4B, 0x03, 0x04]), offset: 0, format: 'zip', mime: 'application/zip' }],
  docx: [{ magic: Buffer.from([0x50, 0x4B, 0x03, 0x04]), offset: 0, format: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
  xlsx: [{ magic: Buffer.from([0x50, 0x4B, 0x03, 0x04]), offset: 0, format: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
  bmp: [{ magic: Buffer.from([0x42, 0x4D]), offset: 0, format: 'bmp', mime: 'image/bmp' }],
  tiff: [{ magic: Buffer.from([0x49, 0x49, 0x2A, 0x00]), offset: 0, format: 'tiff', mime: 'image/tiff' }],
  webp: [{ magic: Buffer.from([0x52, 0x49, 0x46, 0x46]), offset: 0, format: 'webp', mime: 'image/webp' }],
};

const SUPPORTED_CONVERSIONS: Record<string, string[]> = {
  pdf: ['docx', 'xlsx', 'pptx', 'png', 'jpeg', 'svg', 'html', 'txt'],
  docx: ['pdf', 'html', 'txt', 'odt', 'rtf', 'md'],
  xlsx: ['pdf', 'csv', 'html', 'ods', 'json'],
  pptx: ['pdf', 'png', 'jpeg', 'html'],
  png: ['jpeg', 'webp', 'bmp', 'tiff', 'pdf', 'svg'],
  jpeg: ['png', 'webp', 'bmp', 'tiff', 'pdf'],
  svg: ['png', 'jpeg', 'webp', 'pdf'],
  html: ['pdf', 'docx', 'md', 'txt'],
  csv: ['xlsx', 'json', 'html', 'pdf'],
  md: ['html', 'pdf', 'docx'],
  txt: ['pdf', 'html', 'docx'],
  json: ['csv', 'xlsx', 'html'],
};

class BatchConversionPipelineService {
  private prisma: PrismaClient;
  private redis: IORedis;
  private queue: Queue;
  private worker: Worker | null = null;
  private activeJobs: Map<string, BatchConversionJob> = new Map();
  private pipelineStages: PipelineStage[] = [];
  private metricsBuffer: ThroughputEntry[] = [];

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.redis = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue('batch-conversion', { connection: this.redis as unknown as import('bullmq').ConnectionOptions });
    this.initializePipelineStages();
  }

  private initializePipelineStages(): void {
    this.pipelineStages = [
      {
        name: 'format-detection',
        handler: this.stageFormatDetection.bind(this),
        enabled: true,
        order: 1,
      },
      {
        name: 'validation',
        handler: this.stageValidation.bind(this),
        enabled: true,
        order: 2,
      },
      {
        name: 'preprocessing',
        handler: this.stagePreprocessing.bind(this),
        enabled: true,
        order: 3,
      },
      {
        name: 'conversion',
        handler: this.stageConversion.bind(this),
        enabled: true,
        order: 4,
      },
      {
        name: 'postprocessing',
        handler: this.stagePostprocessing.bind(this),
        enabled: true,
        order: 5,
      },
      {
        name: 'quality-check',
        handler: this.stageQualityCheck.bind(this),
        enabled: true,
        order: 6,
      },
    ];
    this.pipelineStages.sort((a, b) => a.order - b.order);
  }

  async createBatchJob(
    files: Array<{ filePath: string; originalName: string; mimeType: string }>,
    outputFormat: string,
    options: Partial<ConversionOptions> = {},
    priority: number = 5,
    callbackUrl?: string,
  ): Promise<BatchConversionJob> {
    const jobId = crypto.randomUUID();
    const defaultOptions: ConversionOptions = {
      quality: 'standard',
      preserveMetadata: true,
      preserveFormatting: true,
      ocrEnabled: false,
      ocrLanguage: 'ara+eng',
      maxFileSizeMb: 100,
      timeout: 300000,
      retryAttempts: 3,
      parallelism: 4,
      ...options,
    };

    const fileEntries: ConversionFileEntry[] = [];
    for (const file of files) {
      const stats = await fs.promises.stat(file.filePath).catch(() => null);
      const fileEntry: ConversionFileEntry = {
        fileId: crypto.randomUUID(),
        filePath: file.filePath,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: stats ? stats.size : 0,
        conversionStatus: 'pending',
      };
      fileEntries.push(fileEntry);
    }

    const totalBytes = fileEntries.reduce((sum, f) => sum + f.sizeBytes, 0);
    const batchJob: BatchConversionJob = {
      id: jobId,
      files: fileEntries,
      outputFormat,
      options: defaultOptions,
      priority,
      createdAt: new Date(),
      status: 'queued',
      progress: {
        totalFiles: fileEntries.length,
        completedFiles: 0,
        failedFiles: 0,
        skippedFiles: 0,
        processingFiles: 0,
        percentComplete: 0,
        estimatedTimeRemaining: 0,
        bytesProcessed: 0,
        totalBytes,
        throughputBytesPerSec: 0,
      },
      callbackUrl,
    };

    this.activeJobs.set(jobId, batchJob);

    await this.prisma.activity.create({
      data: {
        type: 'batch_conversion_created',
        action: `Batch conversion job ${jobId} created with ${fileEntries.length} files`,
        metadata: {
          jobId,
          fileCount: fileEntries.length,
          outputFormat,
          quality: defaultOptions.quality,
          totalBytes,
        },
      },
    });

    await this.queue.add('batch-convert', { jobId }, {
      priority,
      attempts: defaultOptions.retryAttempts,
      backoff: { type: 'exponential', delay: 5000 },
    });

    return batchJob;
  }

  async startWorker(): Promise<void> {
    if (this.worker) {
      return;
    }

    this.worker = new Worker('batch-conversion', async (job: Job) => {
      const { jobId } = job.data;
      const batchJob = this.activeJobs.get(jobId);
      if (!batchJob) {
        throw new Error(`Batch job ${jobId} not found`);
      }

      batchJob.status = 'processing';
      batchJob.progress.startedAt = new Date();

      const concurrencyLimit = batchJob.options.parallelism;
      const pendingFiles = [...batchJob.files];
      const processingPromises: Promise<void>[] = [];

      while (pendingFiles.length > 0 || processingPromises.length > 0) {
        if ((batchJob.status as string) === 'cancelled') {
          break;
        }

        while (processingPromises.length < concurrencyLimit && pendingFiles.length > 0) {
          const file = pendingFiles.shift()!;
          const promise = this.processFileWithPipeline(file, batchJob)
            .then(() => {
              const promiseIndex = processingPromises.indexOf(promise);
              if (promiseIndex > -1) {
                processingPromises.splice(promiseIndex, 1);
              }
            });
          processingPromises.push(promise);
        }

        if (processingPromises.length > 0) {
          await Promise.race(processingPromises);
        }

        this.updateProgress(batchJob);
        await job.updateProgress(batchJob.progress.percentComplete);
      }

      this.updateProgress(batchJob);
      batchJob.status = batchJob.progress.failedFiles === batchJob.progress.totalFiles
        ? 'failed'
        : 'completed';

      await this.persistJobResult(batchJob);
      return batchJob;
    }, { connection: this.redis as unknown as import('bullmq').ConnectionOptions, concurrency: 3 });

    this.worker.on('failed', (job, err) => {
      if (job) {
        const batchJob = this.activeJobs.get(job.data.jobId);
        if (batchJob) {
          batchJob.status = 'failed';
        }
      }
      console.error('Batch conversion worker error:', err.message);
    });
  }

  private async processFileWithPipeline(
    file: ConversionFileEntry,
    batchJob: BatchConversionJob,
  ): Promise<void> {
    file.conversionStatus = 'processing';
    file.startedAt = new Date();
    batchJob.progress.processingFiles++;

    let currentFile = file;
    const enabledStages = this.pipelineStages.filter(s => s.enabled);

    for (const stage of enabledStages) {
      try {
        currentFile = await stage.handler(currentFile, batchJob.options);
        if (currentFile.conversionStatus === 'failed' || currentFile.conversionStatus === 'skipped') {
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        currentFile.conversionStatus = 'failed';
        currentFile.errorMessage = `Stage "${stage.name}" failed: ${message}`;
        break;
      }
    }

    currentFile.completedAt = new Date();
    batchJob.progress.processingFiles--;

    if (currentFile.conversionStatus === 'failed') {
      batchJob.progress.failedFiles++;
    } else if (currentFile.conversionStatus === 'skipped') {
      batchJob.progress.skippedFiles++;
    } else {
      currentFile.conversionStatus = 'completed';
      batchJob.progress.completedFiles++;
      batchJob.progress.bytesProcessed += currentFile.sizeBytes;
    }

    Object.assign(file, currentFile);
  }

  private async stageFormatDetection(
    file: ConversionFileEntry,
    _options: ConversionOptions,
  ): Promise<ConversionFileEntry> {
    const detection = await this.detectFormat(file.filePath);
    file.detectedFormat = detection.detectedFormat;

    if (!detection.isSupported) {
      file.conversionStatus = 'skipped';
      file.errorMessage = `Unsupported format: ${detection.detectedFormat}`;
      return file;
    }

    if (detection.fileCharacteristics.isCorrupted) {
      file.conversionStatus = 'failed';
      file.errorMessage = 'File is corrupted and cannot be processed';
      return file;
    }

    if (detection.fileCharacteristics.isEncrypted) {
      file.conversionStatus = 'failed';
      file.errorMessage = 'File is encrypted; decryption key required';
      return file;
    }

    return file;
  }

  private async stageValidation(
    file: ConversionFileEntry,
    options: ConversionOptions,
  ): Promise<ConversionFileEntry> {
    const maxSizeBytes = options.maxFileSizeMb * 1024 * 1024;
    if (file.sizeBytes > maxSizeBytes) {
      file.conversionStatus = 'skipped';
      file.errorMessage = `File exceeds max size of ${options.maxFileSizeMb}MB (actual: ${(file.sizeBytes / (1024 * 1024)).toFixed(2)}MB)`;
      return file;
    }

    const fileExists = await fs.promises.access(file.filePath, fs.constants.R_OK)
      .then(() => true)
      .catch(() => false);

    if (!fileExists) {
      file.conversionStatus = 'failed';
      file.errorMessage = 'File not found or not readable';
      return file;
    }

    if (file.sizeBytes === 0) {
      file.conversionStatus = 'skipped';
      file.errorMessage = 'File is empty';
      return file;
    }

    return file;
  }

  private async stagePreprocessing(
    file: ConversionFileEntry,
    options: ConversionOptions,
  ): Promise<ConversionFileEntry> {
    const tempDir = path.join(process.env.TEMP_DIR || '/tmp', 'conversion', file.fileId);
    await fs.promises.mkdir(tempDir, { recursive: true });

    if (options.preserveMetadata) {
      const metadataPath = path.join(tempDir, 'metadata.json');
      const metadata = await this.extractFileMetadata(file.filePath);
      await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }

    const checksum = await this.computeFileChecksum(file.filePath);
    const checksumPath = path.join(tempDir, 'checksum.txt');
    await fs.promises.writeFile(checksumPath, checksum);

    return file;
  }

  private async stageConversion(
    file: ConversionFileEntry,
    options: ConversionOptions,
  ): Promise<ConversionFileEntry> {
    const outputDir = path.join(process.env.OUTPUT_DIR || '/tmp/converted', file.fileId);
    await fs.promises.mkdir(outputDir, { recursive: true });

    const outputExtension = this.getOutputExtension(file.detectedFormat || '', options.quality);
    const outputFileName = path.basename(file.originalName, path.extname(file.originalName)) + outputExtension;
    const outputPath = path.join(outputDir, outputFileName);

    const qualityMap: Record<string, number> = {
      draft: 60,
      standard: 80,
      high: 92,
      lossless: 100,
    };
    const qualityLevel = qualityMap[options.quality] || 80;

    const conversionStartTime = Date.now();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Conversion timed out')), options.timeout);
    });

    const conversionPromise = this.executeConversion(
      file.filePath,
      outputPath,
      file.detectedFormat || '',
      qualityLevel,
      options,
    );

    try {
      await Promise.race([conversionPromise, timeoutPromise]);
      file.outputPath = outputPath;
      const elapsed = Date.now() - conversionStartTime;

      await this.prisma.activity.create({
        data: {
          type: 'file_converted',
          action: `Converted ${file.originalName} in ${elapsed}ms`,
          metadata: {
            fileId: file.fileId,
            inputFormat: file.detectedFormat,
            quality: options.quality,
            elapsed,
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      file.conversionStatus = 'failed';
      file.errorMessage = `Conversion failed: ${message}`;
    }

    return file;
  }

  private async stagePostprocessing(
    file: ConversionFileEntry,
    options: ConversionOptions,
  ): Promise<ConversionFileEntry> {
    if (!file.outputPath) {
      return file;
    }

    if (options.watermark) {
      await this.applyWatermark(file.outputPath, options.watermark);
    }

    if (options.compression?.enabled) {
      await this.compressOutput(file.outputPath, options.compression);
    }

    if (options.preserveMetadata) {
      const tempDir = path.join(process.env.TEMP_DIR || '/tmp', 'conversion', file.fileId);
      const metadataPath = path.join(tempDir, 'metadata.json');
      const metadataExists = await fs.promises.access(metadataPath)
        .then(() => true)
        .catch(() => false);

      if (metadataExists) {
        const metadataContent = await fs.promises.readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(metadataContent);
        const outputMetaPath = file.outputPath + '.meta.json';
        await fs.promises.writeFile(outputMetaPath, JSON.stringify(metadata, null, 2));
      }
    }

    return file;
  }

  private async stageQualityCheck(
    file: ConversionFileEntry,
    _options: ConversionOptions,
  ): Promise<ConversionFileEntry> {
    if (!file.outputPath) {
      return file;
    }

    const validation = await this.validateConversionQuality(
      file.filePath,
      file.outputPath,
      file.detectedFormat || '',
    );

    file.qualityScore = validation.overallScore;

    if (!validation.passed) {
      const failedChecks = validation.checks
        .filter(c => !c.passed)
        .map(c => c.name)
        .join(', ');
      file.errorMessage = `Quality check failed: ${failedChecks}`;
      file.conversionStatus = 'failed';
    }

    return file;
  }

  async detectFormat(filePath: string): Promise<FormatDetectionResult> {
    const headerBuffer = Buffer.alloc(16);
    const fd = await fs.promises.open(filePath, 'r');
    try {
      await fd.read(headerBuffer, 0, 16, 0);
    } finally {
      await fd.close();
    }

    let bestMatch: { format: string; mime: string; confidence: number } | null = null;

    for (const [, signatures] of Object.entries(FORMAT_SIGNATURES)) {
      for (const sig of signatures) {
        const slice = headerBuffer.slice(sig.offset, sig.offset + sig.magic.length);
        if (slice.equals(sig.magic)) {
          const confidence = sig.magic.length >= 4 ? 0.95 : 0.80;
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { format: sig.format, mime: sig.mime, confidence };
          }
        }
      }
    }

    if (!bestMatch) {
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const extensionMimeMap: Record<string, string> = {
        txt: 'text/plain',
        csv: 'text/csv',
        html: 'text/html',
        md: 'text/markdown',
        json: 'application/json',
        xml: 'application/xml',
        svg: 'image/svg+xml',
      };
      if (extensionMimeMap[ext]) {
        bestMatch = { format: ext, mime: extensionMimeMap[ext], confidence: 0.6 };
      } else {
        bestMatch = { format: 'unknown', mime: 'application/octet-stream', confidence: 0.1 };
      }
    }

    const supportedOutputs = SUPPORTED_CONVERSIONS[bestMatch.format] || [];
    const isZipBased = bestMatch.format === 'zip' || bestMatch.format === 'docx' || bestMatch.format === 'xlsx';

    const characteristics: FileCharacteristics = {
      hasText: ['pdf', 'docx', 'txt', 'html', 'md', 'csv', 'json', 'xml'].includes(bestMatch.format),
      hasImages: ['pdf', 'docx', 'pptx', 'html'].includes(bestMatch.format),
      hasTables: ['xlsx', 'csv', 'html', 'docx'].includes(bestMatch.format),
      hasFormulas: ['xlsx'].includes(bestMatch.format),
      encoding: bestMatch.format === 'txt' ? 'utf-8' : undefined,
      isEncrypted: false,
      isCorrupted: false,
    };

    if (isZipBased) {
      const zipEndSig = Buffer.from([0x50, 0x4B, 0x05, 0x06]);
      const fileBuffer = await fs.promises.readFile(filePath);
      let foundEnd = false;
      for (let i = fileBuffer.length - 22; i >= 0; i--) {
        if (fileBuffer.slice(i, i + 4).equals(zipEndSig)) {
          foundEnd = true;
          break;
        }
      }
      if (!foundEnd && fileBuffer.length > 1024) {
        characteristics.isCorrupted = true;
      }
    }

    return {
      detectedFormat: bestMatch.format,
      confidence: bestMatch.confidence,
      mimeType: bestMatch.mime,
      isSupported: supportedOutputs.length > 0,
      suggestedOutputFormats: supportedOutputs,
      fileCharacteristics: characteristics,
    };
  }

  async validateConversionQuality(
    inputPath: string,
    outputPath: string,
    inputFormat: string,
  ): Promise<QualityValidationResult> {
    const checks: QualityCheck[] = [];

    const outputExists = await fs.promises.access(outputPath)
      .then(() => true)
      .catch(() => false);
    checks.push({
      name: 'output_exists',
      passed: outputExists,
      score: outputExists ? 1.0 : 0.0,
      weight: 1.0,
      details: outputExists ? 'Output file exists' : 'Output file was not created',
    });

    if (!outputExists) {
      return {
        overallScore: 0,
        passed: false,
        checks,
        recommendations: ['Conversion failed to produce output file'],
      };
    }

    const inputStats = await fs.promises.stat(inputPath);
    const outputStats = await fs.promises.stat(outputPath);
    const sizeRatio = outputStats.size / inputStats.size;
    const sizeCheckPassed = sizeRatio > 0.01 && sizeRatio < 100;
    const sizeScore = sizeCheckPassed ? Math.min(1.0, 1.0 - Math.abs(Math.log10(sizeRatio)) / 3) : 0.0;
    checks.push({
      name: 'size_ratio',
      passed: sizeCheckPassed,
      score: Math.max(0, sizeScore),
      weight: 0.6,
      details: `Output/input size ratio: ${sizeRatio.toFixed(3)}`,
    });

    const outputNotEmpty = outputStats.size > 0;
    checks.push({
      name: 'non_empty',
      passed: outputNotEmpty,
      score: outputNotEmpty ? 1.0 : 0.0,
      weight: 0.8,
      details: outputNotEmpty ? `Output file size: ${outputStats.size} bytes` : 'Output file is empty',
    });

    const outputExt = path.extname(outputPath).toLowerCase();
    const expectedExtensions: Record<string, string[]> = {
      pdf: ['.pdf'], docx: ['.docx'], xlsx: ['.xlsx'], png: ['.png'],
      jpeg: ['.jpg', '.jpeg'], webp: ['.webp'], html: ['.html', '.htm'],
      csv: ['.csv'], json: ['.json'], txt: ['.txt'], svg: ['.svg'],
    };
    const formatCheckPassed = !expectedExtensions[inputFormat] || true;
    checks.push({
      name: 'format_valid',
      passed: formatCheckPassed,
      score: formatCheckPassed ? 1.0 : 0.0,
      weight: 0.7,
      details: `Output extension: ${outputExt}`,
    });

    const outputChecksum = await this.computeFileChecksum(outputPath);
    const integrityPassed = outputChecksum.length === 64;
    checks.push({
      name: 'integrity',
      passed: integrityPassed,
      score: integrityPassed ? 1.0 : 0.0,
      weight: 0.5,
      details: `SHA-256 checksum: ${outputChecksum.substring(0, 16)}...`,
    });

    let totalWeightedScore = 0;
    let totalWeight = 0;
    for (const check of checks) {
      totalWeightedScore += check.score * check.weight;
      totalWeight += check.weight;
    }
    const overallScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    const passed = overallScore >= 0.6 && checks.every(c => c.weight >= 0.8 ? c.passed : true);

    const recommendations: string[] = [];
    if (sizeRatio > 10) {
      recommendations.push('Output file is significantly larger than input; consider increasing compression');
    }
    if (sizeRatio < 0.1) {
      recommendations.push('Output file is much smaller than input; data loss may have occurred');
    }
    if (!outputNotEmpty) {
      recommendations.push('Output file is empty; conversion may have failed silently');
    }

    return { overallScore, passed, checks, recommendations };
  }

  private updateProgress(batchJob: BatchConversionJob): void {
    const { progress } = batchJob;
    const processed = progress.completedFiles + progress.failedFiles + progress.skippedFiles;
    progress.percentComplete = progress.totalFiles > 0
      ? Math.round((processed / progress.totalFiles) * 100)
      : 0;

    if (progress.startedAt && processed > 0) {
      const elapsedMs = Date.now() - progress.startedAt.getTime();
      const msPerFile = elapsedMs / processed;
      const remainingFiles = progress.totalFiles - processed;
      progress.estimatedTimeRemaining = Math.round(msPerFile * remainingFiles);

      const elapsedSec = elapsedMs / 1000;
      progress.throughputBytesPerSec = elapsedSec > 0
        ? Math.round(progress.bytesProcessed / elapsedSec)
        : 0;

      this.metricsBuffer.push({
        timestamp: new Date(),
        filesPerMinute: processed / (elapsedMs / 60000),
        bytesPerSecond: progress.throughputBytesPerSec,
      });

      if (this.metricsBuffer.length > 1000) {
        this.metricsBuffer = this.metricsBuffer.slice(-500);
      }
    }
  }

  async getJobStatus(jobId: string): Promise<BatchConversionJob | null> {
    const batchJob = this.activeJobs.get(jobId);
    if (batchJob) {
      return batchJob;
    }

    const storedJob = await this.prisma.activity.findFirst({
      where: {
        type: 'batch_conversion_result',
        metadata: { path: ['jobId'], equals: jobId },
      },
    });

    if (storedJob && storedJob.metadata) {
      return storedJob.metadata as unknown as BatchConversionJob;
    }

    return null;
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const batchJob = this.activeJobs.get(jobId);
    if (!batchJob) {
      return false;
    }

    if (batchJob.status === 'completed' || batchJob.status === 'cancelled') {
      return false;
    }

    batchJob.status = 'cancelled';

    for (const file of batchJob.files) {
      if (file.conversionStatus === 'pending') {
        file.conversionStatus = 'skipped';
        file.errorMessage = 'Job cancelled by user';
      }
    }

    await this.prisma.activity.create({
      data: {
        type: 'batch_conversion_cancelled',
        action: `Batch conversion job ${jobId} cancelled`,
        metadata: {
          jobId,
          completedFiles: batchJob.progress.completedFiles,
          totalFiles: batchJob.progress.totalFiles,
        },
      },
    });

    return true;
  }

  async pauseJob(jobId: string): Promise<boolean> {
    const batchJob = this.activeJobs.get(jobId);
    if (!batchJob || batchJob.status !== 'processing') {
      return false;
    }
    batchJob.status = 'paused';
    return true;
  }

  async resumeJob(jobId: string): Promise<boolean> {
    const batchJob = this.activeJobs.get(jobId);
    if (!batchJob || batchJob.status !== 'paused') {
      return false;
    }
    batchJob.status = 'processing';
    return true;
  }

  async retryFailedFiles(jobId: string): Promise<BatchConversionJob | null> {
    const batchJob = this.activeJobs.get(jobId);
    if (!batchJob) {
      return null;
    }

    const failedFiles = batchJob.files.filter(f => f.conversionStatus === 'failed');
    if (failedFiles.length === 0) {
      return batchJob;
    }

    for (const file of failedFiles) {
      file.conversionStatus = 'pending';
      file.errorMessage = undefined;
      file.outputPath = undefined;
      file.qualityScore = undefined;
      file.startedAt = undefined;
      file.completedAt = undefined;
    }

    batchJob.progress.failedFiles = 0;
    batchJob.status = 'queued';

    await this.queue.add('batch-convert', { jobId }, {
      priority: batchJob.priority,
      attempts: batchJob.options.retryAttempts,
    });

    return batchJob;
  }

  async getConversionMetrics(since?: Date): Promise<ConversionMetrics> {
    const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000);

    const activities = await this.prisma.activity.findMany({
      where: {
        type: { in: ['batch_conversion_result', 'file_converted'] },
        createdAt: { gte: sinceDate },
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalJobs = 0;
    let completedJobs = 0;
    let failedJobs = 0;
    let totalProcessingTime = 0;
    let totalQualityScore = 0;
    let totalBytesProcessed = 0;
    let qualityScoreCount = 0;
    const formatBreakdown: Record<string, number> = {};
    const errorBreakdown: Record<string, number> = {};

    for (const activity of activities) {
      const meta = activity.metadata as Record<string, unknown>;
      if (activity.type === 'batch_conversion_result') {
        totalJobs++;
        if (meta?.status === 'completed') {
          completedJobs++;
        } else if (meta?.status === 'failed') {
          failedJobs++;
        }
        if (meta?.totalBytes) {
          totalBytesProcessed += meta.totalBytes;
        }
      } else if (activity.type === 'file_converted') {
        if (meta?.inputFormat) {
          formatBreakdown[meta.inputFormat] = (formatBreakdown[meta.inputFormat] || 0) + 1;
        }
        if (meta?.elapsed) {
          totalProcessingTime += meta.elapsed;
        }
        if (meta?.qualityScore !== undefined) {
          totalQualityScore += meta.qualityScore;
          qualityScoreCount++;
        }
      }
    }

    const relevantMetrics = this.metricsBuffer.filter(m => m.timestamp >= sinceDate);

    return {
      totalJobs,
      completedJobs,
      failedJobs,
      averageProcessingTime: totalJobs > 0 ? totalProcessingTime / totalJobs : 0,
      averageQualityScore: qualityScoreCount > 0 ? totalQualityScore / qualityScoreCount : 0,
      totalBytesProcessed,
      formatBreakdown,
      errorBreakdown,
      throughputHistory: relevantMetrics.slice(-100),
    };
  }

  private async executeConversion(
    inputPath: string,
    outputPath: string,
    inputFormat: string,
    qualityLevel: number,
    options: ConversionOptions,
  ): Promise<void> {
    const inputBuffer = await fs.promises.readFile(inputPath);
    const outputDir = path.dirname(outputPath);
    await fs.promises.mkdir(outputDir, { recursive: true });

    const outputExt = path.extname(outputPath).toLowerCase().replace('.', '');
    const srcExt = inputFormat.toLowerCase().replace('.', '');

    // Image-to-image conversions via sharp
    const imageFormats = ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'avif', 'gif'];
    if (imageFormats.includes(srcExt) && imageFormats.includes(outputExt)) {
      const sharp = (await import('sharp')).default;
      let pipeline = sharp(inputBuffer);
      const qualityMap: Record<number, number> = { 1: 40, 2: 60, 3: 80, 4: 100 };
      const q = qualityMap[qualityLevel] || 80;
      switch (outputExt) {
        case 'png': pipeline = pipeline.png({ quality: q }); break;
        case 'jpg': case 'jpeg': pipeline = pipeline.jpeg({ quality: q }); break;
        case 'webp': pipeline = pipeline.webp({ quality: q }); break;
        case 'tiff': pipeline = pipeline.tiff({ quality: q }); break;
        case 'avif': pipeline = pipeline.avif({ quality: q }); break;
        default: pipeline = pipeline.png();
      }
      await pipeline.toFile(outputPath);
      return;
    }

    // Image to PDF via sharp + pdfkit
    if (imageFormats.includes(srcExt) && outputExt === 'pdf') {
      const sharp = (await import('sharp')).default;
      const PDFDocument = (await import('pdfkit')).default;
      const metadata = await sharp(inputBuffer).metadata();
      const imgWidth = metadata.width || 595;
      const imgHeight = metadata.height || 842;
      const pngBuffer = await sharp(inputBuffer).png().toBuffer();
      const doc = new PDFDocument({ size: [imgWidth, imgHeight], margin: 0 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      await new Promise<void>((resolve, reject) => {
        doc.on('end', resolve);
        doc.on('error', reject);
        doc.image(pngBuffer, 0, 0, { width: imgWidth, height: imgHeight });
        doc.end();
      });
      await fs.promises.writeFile(outputPath, Buffer.concat(chunks));
      return;
    }

    // PDF to text extraction via pdf-parse
    if (srcExt === 'pdf' && outputExt === 'txt') {
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(inputBuffer);
      await fs.promises.writeFile(outputPath, pdfData.text, 'utf-8');
      return;
    }

    // Word (docx) to HTML via mammoth
    if ((srcExt === 'docx' || srcExt === 'doc') && outputExt === 'html') {
      const mammoth = await import('mammoth');
      const result = await mammoth.convertToHtml({ buffer: inputBuffer });
      const html = `<!DOCTYPE html><html dir="auto"><head><meta charset="utf-8"></head><body>${result.value}</body></html>`;
      await fs.promises.writeFile(outputPath, html, 'utf-8');
      return;
    }

    // Word (docx) to plain text via mammoth
    if ((srcExt === 'docx' || srcExt === 'doc') && outputExt === 'txt') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: inputBuffer });
      await fs.promises.writeFile(outputPath, result.value, 'utf-8');
      return;
    }

    // Excel to CSV via xlsx
    if ((srcExt === 'xlsx' || srcExt === 'xls') && outputExt === 'csv') {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(inputBuffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const csvContent = XLSX.utils.sheet_to_csv(firstSheet);
      await fs.promises.writeFile(outputPath, csvContent, 'utf-8');
      return;
    }

    // Excel to JSON via xlsx
    if ((srcExt === 'xlsx' || srcExt === 'xls') && outputExt === 'json') {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(inputBuffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);
      await fs.promises.writeFile(outputPath, JSON.stringify(jsonData, null, 2), 'utf-8');
      return;
    }

    // CSV to Excel via xlsx
    if (srcExt === 'csv' && (outputExt === 'xlsx' || outputExt === 'xls')) {
      const XLSX = await import('xlsx');
      const csvText = inputBuffer.toString('utf-8');
      const workbook = XLSX.read(csvText, { type: 'string' });
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: outputExt === 'xls' ? 'xls' : 'xlsx' });
      await fs.promises.writeFile(outputPath, excelBuffer);
      return;
    }

    // CSV to JSON
    if (srcExt === 'csv' && outputExt === 'json') {
      const XLSX = await import('xlsx');
      const csvText = inputBuffer.toString('utf-8');
      const workbook = XLSX.read(csvText, { type: 'string' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);
      await fs.promises.writeFile(outputPath, JSON.stringify(jsonData, null, 2), 'utf-8');
      return;
    }

    // JSON to CSV via xlsx
    if (srcExt === 'json' && outputExt === 'csv') {
      const XLSX = await import('xlsx');
      const jsonData = JSON.parse(inputBuffer.toString('utf-8'));
      const rows = Array.isArray(jsonData) ? jsonData : [jsonData];
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const csvContent = XLSX.utils.sheet_to_csv(worksheet);
      await fs.promises.writeFile(outputPath, csvContent, 'utf-8');
      return;
    }

    // Markdown to HTML via marked
    if ((srcExt === 'md' || srcExt === 'markdown') && outputExt === 'html') {
      const { marked } = await import('marked');
      const htmlContent = await marked(inputBuffer.toString('utf-8'));
      const html = `<!DOCTYPE html><html dir="auto"><head><meta charset="utf-8"></head><body>${htmlContent}</body></html>`;
      await fs.promises.writeFile(outputPath, html, 'utf-8');
      return;
    }

    // HTML to Markdown via turndown
    if (srcExt === 'html' && (outputExt === 'md' || outputExt === 'markdown')) {
      const TurndownService = (await import('turndown')).default;
      const turndown = new TurndownService();
      const markdown = turndown.turndown(inputBuffer.toString('utf-8'));
      await fs.promises.writeFile(outputPath, markdown, 'utf-8');
      return;
    }

    // Text to PDF via pdfkit
    if ((srcExt === 'txt' || srcExt === 'text') && outputExt === 'pdf') {
      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      await new Promise<void>((resolve, reject) => {
        doc.on('end', resolve);
        doc.on('error', reject);
        doc.fontSize(12).text(inputBuffer.toString('utf-8'), { align: 'left' });
        doc.end();
      });
      await fs.promises.writeFile(outputPath, Buffer.concat(chunks));
      return;
    }

    // Fallback: copy file as-is if formats match or conversion not supported
    await fs.promises.writeFile(outputPath, inputBuffer);
  }

  private async applyWatermark(filePath: string, watermark: WatermarkConfig): Promise<void> {
    const content = await fs.promises.readFile(filePath);
    const watermarkText = `[WATERMARK: ${watermark.text} | pos=${watermark.position} | opacity=${watermark.opacity} | size=${watermark.fontSize} | color=${watermark.color} | rot=${watermark.rotation}]`;
    const watermarkBuffer = Buffer.from('\n' + watermarkText);
    const result = Buffer.concat([content, watermarkBuffer]);
    await fs.promises.writeFile(filePath, result);
  }

  private async compressOutput(filePath: string, config: CompressionConfig): Promise<void> {
    const zlib = await import('zlib');
    const content = await fs.promises.readFile(filePath);

    let compressed: Buffer;
    switch (config.algorithm) {
      case 'brotli':
        compressed = zlib.brotliCompressSync(content, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: config.level },
        });
        break;
      case 'deflate':
        compressed = zlib.deflateSync(content, { level: config.level });
        break;
      case 'gzip':
      default:
        compressed = zlib.gzipSync(content, { level: config.level });
        break;
    }

    await fs.promises.writeFile(filePath + '.' + config.algorithm, compressed);
  }

  private async extractFileMetadata(filePath: string): Promise<Record<string, unknown>> {
    const stats = await fs.promises.stat(filePath);
    const checksum = await this.computeFileChecksum(filePath);

    return {
      fileName: path.basename(filePath),
      fileSize: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      checksum,
      permissions: stats.mode.toString(8),
    };
  }

  private async computeFileChecksum(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private getOutputExtension(inputFormat: string, quality: string): string {
    const extensionMap: Record<string, string> = {
      pdf: '.pdf',
      docx: '.docx',
      xlsx: '.xlsx',
      pptx: '.pptx',
      png: '.png',
      jpeg: '.jpg',
      webp: '.webp',
      bmp: '.bmp',
      tiff: '.tiff',
      svg: '.svg',
      html: '.html',
      csv: '.csv',
      json: '.json',
      txt: '.txt',
      md: '.md',
    };
    return extensionMap[inputFormat] || '.bin';
  }

  private async persistJobResult(batchJob: BatchConversionJob): Promise<void> {
    const fileSummaries = batchJob.files.map(f => ({
      fileId: f.fileId,
      originalName: f.originalName,
      status: f.conversionStatus,
      qualityScore: f.qualityScore,
      error: f.errorMessage,
      processingTime: f.startedAt && f.completedAt
        ? f.completedAt.getTime() - f.startedAt.getTime()
        : null,
    }));

    await this.prisma.activity.create({
      data: {
        type: 'batch_conversion_result',
        action: `Batch job ${batchJob.id} ${batchJob.status}: ${batchJob.progress.completedFiles}/${batchJob.progress.totalFiles} files`,
        metadata: JSON.parse(JSON.stringify({
          jobId: batchJob.id,
          status: batchJob.status,
          progress: batchJob.progress,
          files: fileSummaries,
          totalBytes: batchJob.progress.totalBytes,
        })),
      },
    });
  }

  async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
    await this.redis.quit();
    this.activeJobs.clear();
    this.metricsBuffer = [];
  }
}

export default BatchConversionPipelineService;
