import { PrismaClient } from '@prisma/client';
import * as cron from 'node-cron';
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface ScheduledJobConfig {
  id: string;
  name: string;
  cronExpression: string;
  dataSourceId: string;
  importConfig: ImportConfig;
  retryPolicy: RetryPolicy;
  enabled: boolean;
  createdBy: string;
  metadata: Record<string, any>;
}

interface ImportConfig {
  sourceType: 'database' | 'api' | 'file' | 'ftp' | 's3';
  connectionString?: string;
  apiEndpoint?: string;
  filePath?: string;
  tableName?: string;
  query?: string;
  batchSize: number;
  transformations: TransformRule[];
  targetTable: string;
  upsertKey?: string;
  conflictStrategy: 'skip' | 'overwrite' | 'merge' | 'error';
}

interface TransformRule {
  sourceField: string;
  targetField: string;
  transformType: 'map' | 'cast' | 'format' | 'compute' | 'lookup';
  expression?: string;
  lookupTable?: string;
  defaultValue?: unknown;
}

interface RetryPolicy {
  maxRetries: number;
  initialDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
  retryableErrors: string[];
}

interface JobHistoryEntry {
  id: string;
  jobId: string;
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  rowsProcessed: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsFailed: number;
  errorMessages: string[];
  duration: number;
  retryCount: number;
}

interface JobQueueMetrics {
  activeJobs: number;
  waitingJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageDuration: number;
  throughput: number;
}

interface DataBatch {
  records: Record<string, any>[];
  batchIndex: number;
  totalBatches: number;
  sourceOffset: number;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class DataSchedulerService extends EventEmitter {
  private prisma: PrismaClient;
  private redisConnection: IORedis;
  private importQueue: Queue;
  private queueEvents: QueueEvents;
  private worker: Worker | null = null;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private jobConfigs: Map<string, ScheduledJobConfig> = new Map();
  private runningJobs: Map<string, JobHistoryEntry> = new Map();
  private jobHistoryCache: Map<string, JobHistoryEntry[]> = new Map();
  private metricsBuffer: JobQueueMetrics;
  private readonly QUEUE_NAME = 'data-import-queue';
  private readonly MAX_CONCURRENT_JOBS = 5;

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.redisConnection = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });
    this.importQueue = new Queue(this.QUEUE_NAME, {
      connection: this.redisConnection as any,
      defaultJobOptions: {
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 5000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
    this.queueEvents = new QueueEvents(this.QUEUE_NAME, {
      connection: this.redisConnection as any,
    });
    this.metricsBuffer = {
      activeJobs: 0,
      waitingJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      averageDuration: 0,
      throughput: 0,
    };
  }

  async initialize(): Promise<void> {
    this.worker = new Worker(
      this.QUEUE_NAME,
      async (job: Job) => {
        return this.processImportJob(job);
      },
      {
        connection: this.redisConnection as any,
        concurrency: this.MAX_CONCURRENT_JOBS,
        limiter: { max: 10, duration: 60000 },
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.handleJobComplete(job.id || '', job.returnvalue);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      if (job) {
        this.handleJobFailed(job.id || '', err);
      }
    });

    this.queueEvents.on('progress', ({ jobId, data }: { jobId: string; data: unknown }) => {
      this.emit('job:progress', { jobId, progress: data });
    });

    const savedJobs = await this.prisma.scheduledJob.findMany({
      where: { enabled: true },
    });
    for (const jobRecord of savedJobs) {
      const config: ScheduledJobConfig = {
        id: jobRecord.id,
        name: jobRecord.name,
        cronExpression: jobRecord.cronExpression,
        dataSourceId: jobRecord.dataSourceId || '',
        importConfig: jobRecord.importConfig as unknown as ImportConfig,
        retryPolicy: jobRecord.retryPolicy as unknown as RetryPolicy,
        enabled: true,
        createdBy: jobRecord.createdBy || '',
        metadata: (jobRecord.metadata as Record<string, any>) || {},
      };
      await this.scheduleJob(config);
    }
  }

  async scheduleJob(config: ScheduledJobConfig): Promise<string> {
    const isValidCron = cron.validate(config.cronExpression);
    if (!isValidCron) {
      throw new Error(`Invalid cron expression: ${config.cronExpression}`);
    }

    if (this.scheduledTasks.has(config.id)) {
      const existingTask = this.scheduledTasks.get(config.id);
      if (existingTask) {
        existingTask.stop();
      }
    }

    const task = cron.schedule(config.cronExpression, async () => {
      try {
        await this.enqueueImportJob(config);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.emit('scheduler:error', {
          jobId: config.id,
          error: errorMessage,
          timestamp: new Date(),
        });
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Riyadh',
    });

    this.scheduledTasks.set(config.id, task);
    this.jobConfigs.set(config.id, config);

    await this.prisma.scheduledJob.upsert({
      where: { id: config.id },
      update: {
        name: config.name,
        cronExpression: config.cronExpression,
        dataSourceId: config.dataSourceId,
        importConfig: JSON.parse(JSON.stringify(config.importConfig)),
        retryPolicy: JSON.parse(JSON.stringify(config.retryPolicy)),
        enabled: config.enabled,
        updatedAt: new Date(),
      },
      create: {
        id: config.id,
        name: config.name,
        cronExpression: config.cronExpression,
        dataSourceId: config.dataSourceId,
        importConfig: JSON.parse(JSON.stringify(config.importConfig)),
        retryPolicy: JSON.parse(JSON.stringify(config.retryPolicy)),
        enabled: config.enabled,
        createdBy: config.createdBy,
        metadata: JSON.parse(JSON.stringify(config.metadata)),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    this.emit('job:scheduled', { jobId: config.id, name: config.name });
    return config.id;
  }

  async unscheduleJob(jobId: string): Promise<void> {
    const task = this.scheduledTasks.get(jobId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(jobId);
    }
    this.jobConfigs.delete(jobId);

    await this.prisma.scheduledJob.update({
      where: { id: jobId },
      data: { enabled: false, updatedAt: new Date() },
    });

    this.emit('job:unscheduled', { jobId });
  }

  async enqueueImportJob(config: ScheduledJobConfig): Promise<string> {
    const runId = crypto.randomUUID();
    const priority = this.calculateJobPriority(config);

    const job = await this.importQueue.add(
      'import',
      {
        runId,
        jobId: config.id,
        importConfig: config.importConfig,
        retryPolicy: config.retryPolicy,
        enqueuedAt: new Date().toISOString(),
      },
      {
        jobId: runId,
        priority,
        attempts: config.retryPolicy.maxRetries,
        backoff: {
          type: 'exponential',
          delay: config.retryPolicy.initialDelay,
        },
      },
    );

    const historyEntry: JobHistoryEntry = {
      id: crypto.randomUUID(),
      jobId: config.id,
      runId,
      status: 'pending',
      startedAt: new Date(),
      rowsProcessed: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      rowsFailed: 0,
      errorMessages: [],
      duration: 0,
      retryCount: 0,
    };

    this.runningJobs.set(runId, historyEntry);

    await this.prisma.jobHistory.create({
      data: {
        id: historyEntry.id,
        jobId: config.id,
        runId,
        status: 'pending',
        startedAt: new Date(),
        rowsProcessed: 0,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
        rowsFailed: 0,
        errorMessages: [],
        retryCount: 0,
      },
    });

    this.emit('job:enqueued', { runId, jobId: config.id });
    return runId;
  }

  private calculateJobPriority(config: ScheduledJobConfig): number {
    let priority = 10;
    const sourceType = config.importConfig.sourceType;

    if (sourceType === 'database') {
      priority -= 2;
    } else if (sourceType === 'api') {
      priority -= 1;
    } else if (sourceType === 'file') {
      priority += 0;
    } else if (sourceType === 'ftp' || sourceType === 's3') {
      priority += 1;
    }

    const batchSize = config.importConfig.batchSize;
    if (batchSize > 10000) {
      priority += 3;
    } else if (batchSize > 1000) {
      priority += 1;
    }

    const historyEntries = this.jobHistoryCache.get(config.id) || [];
    const recentFailures = historyEntries
      .filter(e => e.status === 'failed')
      .filter(e => {
        const ageMs = Date.now() - e.startedAt.getTime();
        return ageMs < 3600000;
      }).length;

    if (recentFailures > 3) {
      priority += 5;
    }

    return Math.max(1, Math.min(priority, 20));
  }

  private async processImportJob(job: Job): Promise<JobHistoryEntry> {
    const { runId, jobId, importConfig, retryPolicy } = job.data;
    const historyEntry = this.runningJobs.get(runId);

    if (historyEntry) {
      historyEntry.status = 'running';
      historyEntry.startedAt = new Date();
    }

    await this.prisma.jobHistory.update({
      where: { runId },
      data: { status: 'running', startedAt: new Date() },
    });

    const config = importConfig as ImportConfig;
    let totalRecords: Record<string, any>[] = [];

    try {
      totalRecords = await this.fetchSourceData(config);
    } catch (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      if (historyEntry) {
        historyEntry.status = 'failed';
        historyEntry.errorMessages.push(`Fetch error: ${errorMsg}`);
        historyEntry.completedAt = new Date();
        historyEntry.duration = Date.now() - historyEntry.startedAt.getTime();
      }
      throw fetchError;
    }

    const batches = this.createBatches(totalRecords, config.batchSize);
    let processedCount = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const result = await this.processBatch(batch, config);
        processedCount += result.processed;
        insertedCount += result.inserted;
        updatedCount += result.updated;
        skippedCount += result.skipped;
        failedCount += result.failed;
        errors.push(...result.errors);

        const progress = Math.round(((i + 1) / batches.length) * 100);
        await job.updateProgress(progress);
      } catch (batchError) {
        const batchErrMsg = batchError instanceof Error ? batchError.message : String(batchError);
        errors.push(`Batch ${i + 1} error: ${batchErrMsg}`);
        failedCount += batch.records.length;

        const shouldRetry = this.shouldRetryBatch(batchErrMsg, retryPolicy as RetryPolicy);
        if (shouldRetry && job.attemptsMade < (retryPolicy as RetryPolicy).maxRetries) {
          throw batchError;
        }
      }
    }

    const completedAt = new Date();
    const duration = completedAt.getTime() - (historyEntry?.startedAt.getTime() || Date.now());

    const finalEntry: JobHistoryEntry = {
      id: historyEntry?.id || crypto.randomUUID(),
      jobId,
      runId,
      status: failedCount > 0 && insertedCount === 0 && updatedCount === 0 ? 'failed' : 'completed',
      startedAt: historyEntry?.startedAt || new Date(),
      completedAt,
      rowsProcessed: processedCount,
      rowsInserted: insertedCount,
      rowsUpdated: updatedCount,
      rowsSkipped: skippedCount,
      rowsFailed: failedCount,
      errorMessages: errors,
      duration,
      retryCount: job.attemptsMade,
    };

    await this.prisma.jobHistory.update({
      where: { runId },
      data: {
        status: finalEntry.status,
        completedAt,
        rowsProcessed: processedCount,
        rowsInserted: insertedCount,
        rowsUpdated: updatedCount,
        rowsSkipped: skippedCount,
        rowsFailed: failedCount,
        errorMessages: errors,
        duration,
        retryCount: job.attemptsMade,
      },
    });

    this.runningJobs.delete(runId);
    this.addToHistoryCache(jobId, finalEntry);
    return finalEntry;
  }

  private async fetchSourceData(config: ImportConfig): Promise<Record<string, any>[]> {
    const records: Record<string, any>[] = [];

    if (config.sourceType === 'database' && config.query) {
      const rawResults: Record<string, any>[] = await this.prisma.$queryRawUnsafe(config.query);
      for (const row of rawResults) {
        const transformedRow: Record<string, any> = {};
        for (const rule of config.transformations) {
          const sourceValue = row[rule.sourceField];
          transformedRow[rule.targetField] = this.applyTransform(sourceValue, rule);
        }
        records.push(transformedRow);
      }
    } else if (config.sourceType === 'api' && config.apiEndpoint) {
      const response = await fetch(config.apiEndpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        throw new Error(`API fetch failed: ${response.status} ${response.statusText}`);
      }
      const data = await response.json() as unknown;
      const dataObj = data as Record<string, any>;
      const items = Array.isArray(data) ? data as Record<string, any>[] : (dataObj.items || dataObj.results || dataObj.data || []) as Record<string, any>[];
      for (const item of items) {
        const transformedRow: Record<string, any> = {};
        for (const rule of config.transformations) {
          const sourceValue = this.getNestedValue(item, rule.sourceField);
          transformedRow[rule.targetField] = this.applyTransform(sourceValue, rule);
        }
        records.push(transformedRow);
      }
    } else if (config.sourceType === 'file' && config.filePath) {
      const fs = await import('fs/promises');
      const fileContent = await fs.readFile(config.filePath, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        return records;
      }
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        const row: Record<string, any> = {};
        for (let j = 0; j < headers.length && j < values.length; j++) {
          row[headers[j]] = values[j];
        }
        const transformedRow: Record<string, any> = {};
        for (const rule of config.transformations) {
          const sourceValue = row[rule.sourceField];
          transformedRow[rule.targetField] = this.applyTransform(sourceValue, rule);
        }
        records.push(transformedRow);
      }
    }

    return records;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = i + 1 < line.length ? line[i + 1] : '';

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  private applyTransform(value: unknown, rule: TransformRule): unknown {
    if (value === null || value === undefined) {
      return rule.defaultValue !== undefined ? rule.defaultValue : null;
    }

    switch (rule.transformType) {
      case 'cast': {
        const expression = rule.expression || 'string';
        if (expression === 'number') {
          const num = Number(value);
          return isNaN(num) ? rule.defaultValue || 0 : num;
        } else if (expression === 'boolean') {
          return Boolean(value);
        } else if (expression === 'date') {
          const date = new Date(String(value));
          return isNaN(date.getTime()) ? rule.defaultValue || null : date;
        }
        return String(value);
      }
      case 'format': {
        const strValue = String(value);
        if (rule.expression === 'uppercase') return strValue.toUpperCase();
        if (rule.expression === 'lowercase') return strValue.toLowerCase();
        if (rule.expression === 'trim') return strValue.trim();
        if (rule.expression === 'slug') {
          return strValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        }
        return strValue;
      }
      case 'compute': {
        if (rule.expression === 'hash') {
          return crypto.createHash('sha256').update(String(value)).digest('hex');
        }
        if (rule.expression === 'length') {
          return String(value).length;
        }
        return value;
      }
      case 'map': {
        return value;
      }
      default:
        return value;
    }
  }

  private getNestedValue(obj: Record<string, any>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === 'object' && current !== null) {
        current = (current as Record<string, any>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  private createBatches(records: Record<string, any>[], batchSize: number): DataBatch[] {
    const batches: DataBatch[] = [];
    const totalBatches = Math.ceil(records.length / batchSize);

    for (let i = 0; i < records.length; i += batchSize) {
      batches.push({
        records: records.slice(i, i + batchSize),
        batchIndex: Math.floor(i / batchSize),
        totalBatches,
        sourceOffset: i,
      });
    }

    return batches;
  }

  private async processBatch(
    batch: DataBatch,
    config: ImportConfig,
  ): Promise<{
    processed: number;
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: string[];
  }> {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const record of batch.records) {
      try {
        if (config.upsertKey && config.conflictStrategy !== 'error') {
          const keyValue = record[config.upsertKey];
          const existing = await this.prisma.$queryRawUnsafe(
            `SELECT COUNT(*) as cnt FROM "${config.targetTable}" WHERE "${config.upsertKey}" = $1`,
            keyValue,
          );
          const exists = (existing as Record<string, any>[])[0]?.cnt > 0;

          if (exists) {
            if (config.conflictStrategy === 'skip') {
              skipped++;
              continue;
            } else if (config.conflictStrategy === 'overwrite' || config.conflictStrategy === 'merge') {
              const setClauses = Object.entries(record)
                .filter(([key]) => key !== config.upsertKey)
                .map(([key], idx) => `"${key}" = $${idx + 2}`)
                .join(', ');
              const values = Object.entries(record)
                .filter(([key]) => key !== config.upsertKey)
                .map(([, val]) => val);

              await this.prisma.$executeRawUnsafe(
                `UPDATE "${config.targetTable}" SET ${setClauses} WHERE "${config.upsertKey}" = $1`,
                keyValue,
                ...values,
              );
              updated++;
            }
          } else {
            const columns = Object.keys(record).map(k => `"${k}"`).join(', ');
            const paramSlots = Object.keys(record).map((_, idx) => `$${idx + 1}`).join(', ');
            const values = Object.values(record);

            await this.prisma.$executeRawUnsafe(
              `INSERT INTO "${config.targetTable}" (${columns}) VALUES (${paramSlots})`,
              ...values,
            );
            inserted++;
          }
        } else {
          const columns = Object.keys(record).map(k => `"${k}"`).join(', ');
          const paramSlots = Object.keys(record).map((_, idx) => `$${idx + 1}`).join(', ');
          const values = Object.values(record);

          await this.prisma.$executeRawUnsafe(
            `INSERT INTO "${config.targetTable}" (${columns}) VALUES (${paramSlots})`,
            ...values,
          );
          inserted++;
        }
      } catch (recordError) {
        failed++;
        const errMsg = recordError instanceof Error ? recordError.message : String(recordError);
        errors.push(`Record at offset ${batch.sourceOffset}: ${errMsg}`);
      }
    }

    return {
      processed: batch.records.length,
      inserted,
      updated,
      skipped,
      failed,
      errors,
    };
  }

  private shouldRetryBatch(errorMessage: string, retryPolicy: RetryPolicy): boolean {
    if (retryPolicy.retryableErrors.length === 0) {
      const nonRetryablePatterns = [
        'unique constraint',
        'not null violation',
        'syntax error',
        'permission denied',
      ];
      const isNonRetryable = nonRetryablePatterns.some(pattern =>
        errorMessage.toLowerCase().includes(pattern),
      );
      return !isNonRetryable;
    }

    return retryPolicy.retryableErrors.some(pattern =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase()),
    );
  }

  private handleJobComplete(jobId: string, result: JobHistoryEntry): void {
    this.metricsBuffer.completedJobs++;
    if (this.metricsBuffer.activeJobs > 0) {
      this.metricsBuffer.activeJobs--;
    }
    this.metricsBuffer.averageDuration = this.calculateRunningAverage(
      this.metricsBuffer.averageDuration,
      result.duration,
      this.metricsBuffer.completedJobs,
    );
    this.emit('job:completed', {
      jobId,
      result,
      metrics: { ...this.metricsBuffer },
    });
  }

  private handleJobFailed(jobId: string, error: Error): void {
    this.metricsBuffer.failedJobs++;
    if (this.metricsBuffer.activeJobs > 0) {
      this.metricsBuffer.activeJobs--;
    }
    this.emit('job:failed', {
      jobId,
      error: error.message,
      metrics: { ...this.metricsBuffer },
    });
  }

  private calculateRunningAverage(currentAvg: number, newValue: number, count: number): number {
    if (count <= 1) return newValue;
    return currentAvg + (newValue - currentAvg) / count;
  }

  private addToHistoryCache(jobId: string, entry: JobHistoryEntry): void {
    const existing = this.jobHistoryCache.get(jobId) || [];
    existing.push(entry);
    if (existing.length > 100) {
      existing.splice(0, existing.length - 100);
    }
    this.jobHistoryCache.set(jobId, existing);
  }

  async getJobHistory(jobId: string, limit: number = 50, offset: number = 0): Promise<JobHistoryEntry[]> {
    const records = await this.prisma.jobHistory.findMany({
      where: { jobId },
      orderBy: { startedAt: 'desc' },
      skip: offset,
      take: limit,
    });

    return records.map(record => ({
      id: record.id,
      jobId: record.jobId,
      runId: record.runId,
      status: record.status as JobHistoryEntry['status'],
      startedAt: record.startedAt || new Date(),
      completedAt: record.completedAt || undefined,
      rowsProcessed: record.rowsProcessed,
      rowsInserted: record.rowsInserted,
      rowsUpdated: record.rowsUpdated,
      rowsSkipped: record.rowsSkipped,
      rowsFailed: record.rowsFailed,
      errorMessages: record.errorMessages as string[],
      duration: record.duration || 0,
      retryCount: record.retryCount,
    }));
  }

  async getQueueMetrics(): Promise<JobQueueMetrics> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.importQueue.getWaitingCount(),
      this.importQueue.getActiveCount(),
      this.importQueue.getCompletedCount(),
      this.importQueue.getFailedCount(),
    ]);

    const recentHistory = await this.prisma.jobHistory.findMany({
      where: {
        status: 'completed',
        completedAt: {
          gte: new Date(Date.now() - 3600000),
        },
      },
      select: { duration: true },
    });

    const avgDuration = recentHistory.length > 0
      ? recentHistory.reduce((sum, h) => sum + (h.duration || 0), 0) / recentHistory.length
      : 0;

    const throughput = recentHistory.length;

    return {
      activeJobs: active,
      waitingJobs: waiting,
      completedJobs: completed,
      failedJobs: failed,
      averageDuration: Math.round(avgDuration),
      throughput,
    };
  }

  async cancelJob(runId: string): Promise<boolean> {
    const job = await this.importQueue.getJob(runId);
    if (!job) {
      return false;
    }

    const state = await job.getState();
    if (state === 'active') {
      await job.moveToFailed(new Error('Job cancelled by user'), '0');
    } else if (state === 'waiting' || state === 'delayed') {
      await job.remove();
    } else {
      return false;
    }

    await this.prisma.jobHistory.update({
      where: { runId },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
      },
    });

    this.runningJobs.delete(runId);
    this.emit('job:cancelled', { runId });
    return true;
  }

  async pauseQueue(): Promise<void> {
    await this.importQueue.pause();
    this.emit('queue:paused', { timestamp: new Date() });
  }

  async resumeQueue(): Promise<void> {
    await this.importQueue.resume();
    this.emit('queue:resumed', { timestamp: new Date() });
  }

  async cleanupOldHistory(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 86400000);

    const result = await this.prisma.jobHistory.deleteMany({
      where: {
        completedAt: {
          lt: cutoffDate,
        },
        status: {
          in: ['completed', 'cancelled'],
        },
      },
    });

    this.jobHistoryCache.clear();
    this.emit('history:cleaned', {
      deletedCount: result.count,
      cutoffDate,
    });

    return result.count;
  }

  async getScheduledJobs(): Promise<ScheduledJobConfig[]> {
    const configs: ScheduledJobConfig[] = [];
    for (const [, config] of this.jobConfigs) {
      configs.push({ ...config });
    }
    return configs;
  }

  async triggerManualRun(jobId: string): Promise<string> {
    const config = this.jobConfigs.get(jobId);
    if (!config) {
      throw new Error(`Job config not found: ${jobId}`);
    }
    return this.enqueueImportJob(config);
  }

  async shutdown(): Promise<void> {
    for (const [id, task] of this.scheduledTasks) {
      task.stop();
      this.scheduledTasks.delete(id);
    }

    if (this.worker) {
      await this.worker.close();
    }

    await this.queueEvents.close();
    await this.importQueue.close();
    await this.redisConnection.quit();
    this.emit('scheduler:shutdown', { timestamp: new Date() });
  }
}
