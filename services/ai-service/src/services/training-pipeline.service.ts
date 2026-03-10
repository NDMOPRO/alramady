import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import winston from 'winston';

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'training-pipeline' },
  transports: [
    new winston.transports.Console(),
  ],
});

// ─── Interfaces ──────────────────────────────────────────────────────

export interface TrainingConfig {
  datasetId: string;
  tenantId: string;
  baseModel: string;
  suffix?: string;
  epochs?: number;
  batchSize?: number;
  learningRateMultiplier?: number;
  validationFileId?: string;
}

interface TrainingJobRecord {
  id: string;
  tenantId: string;
  datasetId: string;
  openaiJobId: string;
  openaiFileId: string;
  baseModel: string;
  fineTunedModel: string | null;
  status: string;
  trainLoss: number[];
  trainAccuracy: number[];
  validationLoss: number[];
  validationAccuracy: number[];
  currentEpoch: number;
  totalEpochs: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

interface TrainingSampleRow {
  id: string;
  input: string;
  expectedOutput: string;
  metadata: Record<string, unknown>;
  quality: number;
  tags: string[];
  isAugmented: boolean;
}

interface JsonlMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface JsonlEntry {
  messages: JsonlMessage[];
}

// ─── Service ─────────────────────────────────────────────────────────

export default class TrainingPipelineService {
  private openai: OpenAI;
  private pollingTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });
  }

  /**
   * Creates a fine-tuning job via the OpenAI API.
   * Fetches training samples from the DB, writes a JSONL file,
   * uploads it to OpenAI, and starts the fine-tuning job.
   */
  async createTrainingJob(config: TrainingConfig): Promise<TrainingJobRecord> {
    const dbJobId = crypto.randomUUID();

    logger.info('Creating training job', { dbJobId, datasetId: config.datasetId, baseModel: config.baseModel });

    // Fetch samples from DB
    const samples = await this.prisma.trainingSample.findMany({
      where: { datasetId: config.datasetId },
      orderBy: { quality: 'desc' },
    });

    if (samples.length < 10) {
      throw new Error(`Insufficient training samples: ${samples.length}. Minimum 10 required for fine-tuning.`);
    }

    // Generate JSONL file
    const jsonlPath = path.join(os.tmpdir(), `rasid-ft-${dbJobId}.jsonl`);
    const jsonlEntries: string[] = [];

    for (const sample of samples as unknown as TrainingSampleRow[]) {
      const entry: JsonlEntry = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant trained on domain-specific data.' },
          { role: 'user', content: sample.input },
          { role: 'assistant', content: sample.expectedOutput },
        ],
      };
      jsonlEntries.push(JSON.stringify(entry));
    }

    fs.writeFileSync(jsonlPath, jsonlEntries.join('\n'), 'utf-8');

    logger.info('JSONL file written', { jsonlPath, sampleCount: samples.length });

    // Upload file to OpenAI
    const fileStream = fs.createReadStream(jsonlPath);
    const uploadedFile = await this.openai.files.create({
      file: fileStream,
      purpose: 'fine-tune',
    });

    logger.info('File uploaded to OpenAI', { openaiFileId: uploadedFile.id });

    // Clean up temp file
    fs.unlinkSync(jsonlPath);

    // Create fine-tuning job via OpenAI
    const fineTuneParams: OpenAI.FineTuning.JobCreateParams = {
      training_file: uploadedFile.id,
      model: config.baseModel,
    };

    if (config.suffix) {
      fineTuneParams.suffix = config.suffix;
    }

    if (config.epochs || config.learningRateMultiplier || config.batchSize) {
      fineTuneParams.hyperparameters = {};
      if (config.epochs) {
        fineTuneParams.hyperparameters.n_epochs = config.epochs;
      }
      if (config.learningRateMultiplier) {
        fineTuneParams.hyperparameters.learning_rate_multiplier = config.learningRateMultiplier;
      }
      if (config.batchSize) {
        fineTuneParams.hyperparameters.batch_size = config.batchSize;
      }
    }

    if (config.validationFileId) {
      fineTuneParams.validation_file = config.validationFileId;
    }

    const fineTuneJob = await this.openai.fineTuning.jobs.create(fineTuneParams);

    logger.info('Fine-tuning job created', { openaiJobId: fineTuneJob.id, status: fineTuneJob.status });

    // Save to DB
    const jobRecord: TrainingJobRecord = {
      id: dbJobId,
      tenantId: config.tenantId,
      datasetId: config.datasetId,
      openaiJobId: fineTuneJob.id,
      openaiFileId: uploadedFile.id,
      baseModel: config.baseModel,
      fineTunedModel: null,
      status: fineTuneJob.status,
      trainLoss: [],
      trainAccuracy: [],
      validationLoss: [],
      validationAccuracy: [],
      currentEpoch: 0,
      totalEpochs: config.epochs || 0,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    };

    await this.prisma.trainingJob.create({
      data: {
        id: jobRecord.id,
        tenantId: jobRecord.tenantId,
        datasetId: jobRecord.datasetId,
        openaiJobId: jobRecord.openaiJobId,
        openaiFileId: jobRecord.openaiFileId,
        baseModel: jobRecord.baseModel,
        fineTunedModel: jobRecord.fineTunedModel,
        status: jobRecord.status,
        trainLoss: jobRecord.trainLoss,
        trainAccuracy: jobRecord.trainAccuracy,
        validationLoss: jobRecord.validationLoss,
        validationAccuracy: jobRecord.validationAccuracy,
        currentEpoch: jobRecord.currentEpoch,
        totalEpochs: jobRecord.totalEpochs,
        error: jobRecord.error,
        createdAt: jobRecord.createdAt,
        updatedAt: jobRecord.updatedAt,
        completedAt: jobRecord.completedAt,
      },
    });

    // Start polling for real metrics
    this.startPolling(fineTuneJob.id, dbJobId);

    return jobRecord;
  }

  /**
   * Polls the OpenAI fine-tuning job every 30 seconds.
   * Extracts REAL metrics from job events (train_loss, train_mean_token_accuracy).
   * Updates DB with actual training progress.
   */
  startPolling(openaiJobId: string, dbJobId: string): void {
    logger.info('Starting polling', { openaiJobId, dbJobId });

    const timer = setInterval(async () => {
      try {
        const job = await this.openai.fineTuning.jobs.retrieve(openaiJobId);

        logger.info('Poll result', { openaiJobId, status: job.status });

        // Fetch training events to extract real metrics
        const events = await this.openai.fineTuning.jobs.listEvents(openaiJobId, { limit: 100 });

        const trainLoss: number[] = [];
        const trainAccuracy: number[] = [];
        const validationLoss: number[] = [];
        const validationAccuracy: number[] = [];
        let currentEpoch = 0;

        for (const event of events.data) {
          if (event.type === 'metrics' && event.data) {
            const metricsData = event.data as Record<string, unknown>;
            const step = metricsData.step as number | undefined;
            const epoch = metricsData.epoch as number | undefined;

            if (epoch !== undefined && epoch > currentEpoch) {
              currentEpoch = epoch;
            }

            if (metricsData.train_loss !== undefined) {
              trainLoss.push(metricsData.train_loss as number);
            }
            if (metricsData.train_mean_token_accuracy !== undefined) {
              trainAccuracy.push(metricsData.train_mean_token_accuracy as number);
            }
            if (metricsData.valid_loss !== undefined) {
              validationLoss.push(metricsData.valid_loss as number);
            }
            if (metricsData.valid_mean_token_accuracy !== undefined) {
              validationAccuracy.push(metricsData.valid_mean_token_accuracy as number);
            }
          }
        }

        // Determine completion
        const isTerminal = ['succeeded', 'failed', 'cancelled'].includes(job.status);

        const updateData: Record<string, unknown> = {
          status: job.status,
          trainLoss,
          trainAccuracy,
          validationLoss,
          validationAccuracy,
          currentEpoch: Math.floor(currentEpoch),
          updatedAt: new Date(),
        };

        if (job.status === 'succeeded' && job.fine_tuned_model) {
          updateData.fineTunedModel = job.fine_tuned_model;
          updateData.completedAt = new Date();
        }

        if (job.status === 'failed') {
          updateData.error = job.error?.message || 'Fine-tuning job failed';
          updateData.completedAt = new Date();
        }

        if (job.status === 'cancelled') {
          updateData.completedAt = new Date();
        }

        await this.prisma.trainingJob.update({
          where: { id: dbJobId },
          data: updateData,
        });

        if (isTerminal) {
          logger.info('Job reached terminal state, stopping polling', {
            openaiJobId,
            dbJobId,
            status: job.status,
            fineTunedModel: job.fine_tuned_model,
          });
          clearInterval(timer);
          this.pollingTimers.delete(dbJobId);
        }
      } catch (err) {
        logger.error('Polling error', {
          openaiJobId,
          dbJobId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, 30_000);

    this.pollingTimers.set(dbJobId, timer);
  }

  /**
   * Returns the job record from DB, including real metrics.
   */
  async getJobStatus(jobId: string, tenantId: string): Promise<TrainingJobRecord | null> {
    const job = await this.prisma.trainingJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) return null;

    const typed = job as unknown as TrainingJobRecord;
    return {
      id: typed.id,
      tenantId: typed.tenantId,
      datasetId: typed.datasetId,
      openaiJobId: typed.openaiJobId,
      openaiFileId: typed.openaiFileId,
      baseModel: typed.baseModel,
      fineTunedModel: typed.fineTunedModel,
      status: typed.status,
      trainLoss: typed.trainLoss || [],
      trainAccuracy: typed.trainAccuracy || [],
      validationLoss: typed.validationLoss || [],
      validationAccuracy: typed.validationAccuracy || [],
      currentEpoch: typed.currentEpoch || 0,
      totalEpochs: typed.totalEpochs || 0,
      error: typed.error,
      createdAt: typed.createdAt,
      updatedAt: typed.updatedAt,
      completedAt: typed.completedAt,
    };
  }

  /**
   * Cancels a fine-tuning job via the OpenAI API.
   */
  async cancelJob(jobId: string, tenantId: string): Promise<void> {
    const job = await this.prisma.trainingJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new Error(`Training job not found: ${jobId}`);
    }

    const typed = job as unknown as TrainingJobRecord;
    const openaiJobId = typed.openaiJobId as string;

    // Cancel on OpenAI
    await this.openai.fineTuning.jobs.cancel(openaiJobId);

    logger.info('Fine-tuning job cancelled', { jobId, openaiJobId });

    // Stop polling
    const timer = this.pollingTimers.get(jobId);
    if (timer) {
      clearInterval(timer);
      this.pollingTimers.delete(jobId);
    }

    // Update DB
    await this.prisma.trainingJob.update({
      where: { id: jobId },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Returns a paginated list of training jobs for a tenant.
   */
  async listJobs(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: TrainingJobRecord[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      this.prisma.trainingJob.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.trainingJob.count({ where: { tenantId } }),
    ]);

    const data: TrainingJobRecord[] = jobs.map((j: Record<string, unknown>) => ({
      id: j.id,
      tenantId: j.tenantId,
      datasetId: j.datasetId,
      openaiJobId: j.openaiJobId,
      openaiFileId: j.openaiFileId,
      baseModel: j.baseModel,
      fineTunedModel: j.fineTunedModel,
      status: j.status,
      trainLoss: j.trainLoss || [],
      trainAccuracy: j.trainAccuracy || [],
      validationLoss: j.validationLoss || [],
      validationAccuracy: j.validationAccuracy || [],
      currentEpoch: j.currentEpoch || 0,
      totalEpochs: j.totalEpochs || 0,
      error: j.error,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      completedAt: j.completedAt,
    }));

    return { data, total, page, limit };
  }

  /**
   * Validates and formats training data from a dataset for fine-tuning.
   * Returns the count of valid samples and any validation errors.
   */
  async prepareTrainingData(
    datasetId: string,
    tenantId: string,
  ): Promise<{ validCount: number; invalidCount: number; errors: string[]; samplePreview: JsonlEntry[] }> {
    const dataset = await this.prisma.trainingDataset.findFirst({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const samples = await this.prisma.trainingSample.findMany({
      where: { datasetId },
      orderBy: { quality: 'desc' },
    });

    let validCount = 0;
    let invalidCount = 0;
    const errors: string[] = [];
    const samplePreview: JsonlEntry[] = [];

    for (const sample of samples as unknown as TrainingSampleRow[]) {
      const sampleErrors: string[] = [];

      if (!sample.input || sample.input.trim().length === 0) {
        sampleErrors.push(`Sample ${sample.id}: empty input`);
      }

      if (!sample.expectedOutput || sample.expectedOutput.trim().length === 0) {
        sampleErrors.push(`Sample ${sample.id}: empty output`);
      }

      if (sample.input && sample.input.length > 32000) {
        sampleErrors.push(`Sample ${sample.id}: input exceeds 32k characters`);
      }

      if (sample.expectedOutput && sample.expectedOutput.length > 32000) {
        sampleErrors.push(`Sample ${sample.id}: output exceeds 32k characters`);
      }

      if (sampleErrors.length > 0) {
        invalidCount++;
        errors.push(...sampleErrors);
      } else {
        validCount++;
        if (samplePreview.length < 3) {
          samplePreview.push({
            messages: [
              { role: 'system', content: 'You are a helpful assistant trained on domain-specific data.' },
              { role: 'user', content: sample.input },
              { role: 'assistant', content: sample.expectedOutput },
            ],
          });
        }
      }
    }

    if (validCount < 10) {
      errors.unshift(`Only ${validCount} valid samples found. Minimum 10 required for fine-tuning.`);
    }

    logger.info('Training data prepared', { datasetId, validCount, invalidCount, errorCount: errors.length });

    return { validCount, invalidCount, errors, samplePreview };
  }

  /**
   * Stops all active polling timers (for graceful shutdown).
   */
  stopAllPolling(): void {
    for (const [jobId, timer] of this.pollingTimers) {
      clearInterval(timer);
      logger.info('Stopped polling for job', { jobId });
    }
    this.pollingTimers.clear();
  }
}
