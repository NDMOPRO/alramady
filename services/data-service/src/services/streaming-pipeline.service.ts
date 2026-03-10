import { Prisma, PrismaClient } from '@prisma/client';
import { createReadStream, statSync } from 'fs';
import { Transform, Readable, pipeline as streamPipeline } from 'stream';
import { promisify } from 'util';
import { createInterface } from 'readline';
import { randomUUID } from 'crypto';
import { createLogger, format, transports } from 'winston';

const prisma = new PrismaClient();
const pipelineAsync = promisify(streamPipeline);

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'streaming-pipeline' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

interface StreamingConfig {
  batchSize: number;
  maxConcurrency: number;
  backpressureThreshold: number;
  retryAttempts: number;
  retryDelayMs: number;
}

interface PipelineStage {
  name: string;
  transform: (batch: Record<string, any>[]) => Promise<Record<string, any>[]>;
}

interface PipelineStats {
  pipelineId: string;
  rowsProcessed: number;
  rowsFailed: number;
  batchesCompleted: number;
  startedAt: Date;
  completedAt?: Date;
  durationMs: number;
  throughputRowsPerSec: number;
  memoryUsageMb: number;
}

const DEFAULT_CONFIG: StreamingConfig = {
  batchSize: 10000,
  maxConcurrency: 4,
  backpressureThreshold: 50000,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

export class StreamingPipelineService {
  async processLargeFile(
    filePath: string,
    tenantId: string,
    userId: string,
    stages: PipelineStage[],
    config: Partial<StreamingConfig> = {},
  ): Promise<PipelineStats> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const pipelineId = randomUUID();
    const startedAt = new Date();
    let rowsProcessed = 0;
    let rowsFailed = 0;
    let batchesCompleted = 0;

    logger.info('Starting streaming pipeline', { pipelineId, filePath, tenantId, batchSize: cfg.batchSize });

    const fileStats = statSync(filePath);
    const fileSizeGb = fileStats.size / (1024 * 1024 * 1024);
    logger.info(`File size: ${fileSizeGb.toFixed(2)} GB`);

    const fileStream = createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 64 * 1024 });
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

    let headers: string[] = [];
    let currentBatch: Record<string, any>[] = [];
    let lineNumber = 0;
    const activeBatches: Promise<void>[] = [];

    const processBatch = async (batch: Record<string, any>[]): Promise<void> => {
      let processed = batch;
      for (const stage of stages) {
        try {
          processed = await stage.transform(processed);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.warn(`Stage "${stage.name}" failed for batch`, { error: msg, batchSize: batch.length });
          rowsFailed += batch.length;
          return;
        }
      }
      rowsProcessed += processed.length;
      batchesCompleted++;
    };

    for await (const line of rl) {
      lineNumber++;

      if (lineNumber === 1) {
        headers = line.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
        continue;
      }

      const values = this.parseCSVLine(line);
      if (values.length !== headers.length) {
        rowsFailed++;
        continue;
      }

      const row: Record<string, any> = {};
      for (let i = 0; i < headers.length; i++) {
        row[headers[i]] = this.inferType(values[i]);
      }
      currentBatch.push(row);

      if (currentBatch.length >= cfg.batchSize) {
        const batchToProcess = [...currentBatch];
        currentBatch = [];

        if (activeBatches.length >= cfg.maxConcurrency) {
          await Promise.race(activeBatches);
          const completed = activeBatches.filter((p) => {
            let resolved = false;
            p.then(() => { resolved = true; }).catch(() => { resolved = true; });
            return !resolved;
          });
          activeBatches.length = 0;
          activeBatches.push(...completed);
        }

        const batchPromise = this.retryAsync(
          () => processBatch(batchToProcess),
          cfg.retryAttempts,
          cfg.retryDelayMs,
        );
        activeBatches.push(batchPromise);

        if (batchesCompleted % 10 === 0) {
          const memUsage = process.memoryUsage();
          logger.info('Pipeline progress', {
            pipelineId,
            rowsProcessed,
            batchesCompleted,
            memoryMb: Math.round(memUsage.heapUsed / 1024 / 1024),
          });
        }
      }
    }

    if (currentBatch.length > 0) {
      await this.retryAsync(() => processBatch(currentBatch), cfg.retryAttempts, cfg.retryDelayMs);
    }

    await Promise.all(activeBatches);

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const throughput = durationMs > 0 ? (rowsProcessed / durationMs) * 1000 : 0;
    const memUsage = process.memoryUsage();

    const stats: PipelineStats = {
      pipelineId,
      rowsProcessed,
      rowsFailed,
      batchesCompleted,
      startedAt,
      completedAt,
      durationMs,
      throughputRowsPerSec: Math.round(throughput),
      memoryUsageMb: Math.round(memUsage.heapUsed / 1024 / 1024),
    };

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'streaming_pipeline_complete',
        entityType: 'dataset',
        entityId: null,
        detailsJson: {
          tenantId,
          userId,
          filePath,
          ...stats,
        } as Prisma.InputJsonValue,
      },
    });

    logger.info('Pipeline complete', stats);
    return stats;
  }

  async processStream(
    dataStream: Readable,
    tenantId: string,
    stages: PipelineStage[],
    config: Partial<StreamingConfig> = {},
  ): Promise<PipelineStats> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const pipelineId = randomUUID();
    const startedAt = new Date();
    let rowsProcessed = 0;
    let rowsFailed = 0;
    let batchesCompleted = 0;

    let currentBatch: Record<string, any>[] = [];

    const batchTransform = new Transform({
      objectMode: true,
      async transform(chunk: Record<string, any>, _encoding, callback) {
        currentBatch.push(chunk);
        if (currentBatch.length >= cfg.batchSize) {
          let processed = [...currentBatch];
          currentBatch = [];
          try {
            for (const stage of stages) {
              processed = await stage.transform(processed);
            }
            rowsProcessed += processed.length;
            batchesCompleted++;
            callback(null, { batchId: batchesCompleted, rows: processed.length });
          } catch (error: unknown) {
            rowsFailed += processed.length;
            callback(null, { batchId: batchesCompleted, error: true });
          }
        } else {
          callback();
        }
      },
      async flush(callback) {
        if (currentBatch.length > 0) {
          let processed = [...currentBatch];
          try {
            for (const stage of stages) {
              processed = await stage.transform(processed);
            }
            rowsProcessed += processed.length;
            batchesCompleted++;
          } catch {
            rowsFailed += processed.length;
          }
        }
        callback();
      },
    });

    await pipelineAsync(dataStream, batchTransform);

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    return {
      pipelineId,
      rowsProcessed,
      rowsFailed,
      batchesCompleted,
      startedAt,
      completedAt,
      durationMs,
      throughputRowsPerSec: durationMs > 0 ? Math.round((rowsProcessed / durationMs) * 1000) : 0,
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };
  }

  createIngestionPipeline(
    tenantId: string,
    datasetId: string,
    userId = 'system',
  ): PipelineStage[] {
    return [
      {
        name: 'validate',
        transform: async (batch) => batch.filter((row) => {
          return Object.values(row).some((v) => v !== null && v !== undefined && v !== '');
        }),
      },
      {
        name: 'normalize',
        transform: async (batch) => batch.map((row) => {
          const normalized: Record<string, any> = {};
          for (const [key, value] of Object.entries(row)) {
            const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '_');
            normalized[normalizedKey] = typeof value === 'string' ? value.trim() : value;
          }
          return normalized;
        }),
      },
      {
        name: 'store',
        transform: async (batch) => {
          const batchId = randomUUID();
          await prisma.auditLog.create({
            data: {
              tenantId,
              userId,
              action: 'batch_ingested',
              entityType: 'dataset',
              entityId: datasetId,
              detailsJson: { batchId, rowCount: batch.length, tenantId } as Prisma.InputJsonValue,
            },
          });
          return batch;
        },
      },
    ];
  }

  createTransformPipeline(
    transformations: Array<{ type: string; column: string; params: Record<string, any> }>,
  ): PipelineStage[] {
    return transformations.map((t) => ({
      name: `transform_${t.type}_${t.column}`,
      transform: async (batch) => {
        switch (t.type) {
          case 'uppercase':
            return batch.map((row) => ({
              ...row,
              [t.column]: typeof row[t.column] === 'string' ? (row[t.column] as string).toUpperCase() : row[t.column],
            }));
          case 'lowercase':
            return batch.map((row) => ({
              ...row,
              [t.column]: typeof row[t.column] === 'string' ? (row[t.column] as string).toLowerCase() : row[t.column],
            }));
          case 'round':
            return batch.map((row) => ({
              ...row,
              [t.column]: typeof row[t.column] === 'number' ? Math.round(row[t.column] as number * 100) / 100 : row[t.column],
            }));
          case 'fill_null':
            return batch.map((row) => ({
              ...row,
              [t.column]: row[t.column] ?? t.params.defaultValue ?? '',
            }));
          case 'filter':
            return batch.filter((row) => {
              const val = row[t.column];
              const op = t.params.operator as string;
              const target = t.params.value;
              if (op === 'eq') return val === target;
              if (op === 'neq') return val !== target;
              if (op === 'gt' && typeof val === 'number' && typeof target === 'number') return val > target;
              if (op === 'lt' && typeof val === 'number' && typeof target === 'number') return val < target;
              return true;
            });
          default:
            return batch;
        }
      },
    }));
  }

  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  private inferType(value: string): string | number | boolean | null {
    if (value === '' || value === 'null' || value === 'NULL') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') return num;
    return value.replace(/^"|"$/g, '');
  }

  private async retryAsync(
    fn: () => Promise<void>,
    maxRetries: number,
    delayMs: number,
  ): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await fn();
        return;
      } catch (error: unknown) {
        if (attempt === maxRetries) throw error;
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
}

export const streamingPipelineService = new StreamingPipelineService();
