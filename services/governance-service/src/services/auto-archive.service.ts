import { PrismaClient } from '@prisma/client';
import { Queue, QueueEvents, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { z } from 'zod';

const ARCHIVE_QUEUE_NAME = 'rasid:auto-archive';

const ConfigureAutoArchiveInputSchema = z.object({
  entityType: z.string().min(1),
  retentionDays: z.number().int().min(1).max(3650),
  archiveStrategy: z.enum(['MOVE', 'COMPRESS', 'SOFT_DELETE']),
  isEnabled: z.boolean(),
  configuredBy: z.string().uuid(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

const SearchArchiveInputSchema = z.object({
  entityType: z.string().min(1).optional(),
  query: z.string().optional(),
  archivedAfter: z.string().datetime().optional(),
  archivedBefore: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

const RestoreFromArchiveInputSchema = z.object({
  archiveEntryId: z.string().uuid(),
  restoredBy: z.string().uuid(),
});

interface ArchiveConfig {
  id: string;
  entityType: string;
  retentionDays: number;
  archiveStrategy: string;
  isEnabled: boolean;
}

interface ArchiveCycleResult {
  processedConfigs: number;
  totalArchived: number;
  errors: Array<{ entityType: string; error: string }>;
}

interface ArchiveSearchResult {
  entries: Array<{
    id: string;
    entityType: string;
    entityId: string;
    archivedAt: Date;
    strategy: string;
    metadata: unknown;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

interface RestoreResult {
  success: boolean;
  entityType: string;
  entityId: string;
  restoredAt: Date;
}

export class AutoArchiveService {
  private readonly prisma: PrismaClient;
  private readonly archiveQueue: Queue;
  private readonly queueEvents: QueueEvents;
  private archiveWorker: Worker | null;

  constructor(prisma: PrismaClient, redisConnection: Redis) {
    this.prisma = prisma;
    this.archiveWorker = null;

    const connection = redisConnection as unknown as ConnectionOptions;

    this.archiveQueue = new Queue(ARCHIVE_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
      },
    });

    this.queueEvents = new QueueEvents(ARCHIVE_QUEUE_NAME, { connection });
    this.initializeWorker(redisConnection);
    this.scheduleDailyCycle();
  }

  private initializeWorker(redisConnection: Redis): void {
    this.archiveWorker = new Worker(
      ARCHIVE_QUEUE_NAME,
      async (job: Job) => {
        if (job.name === 'daily-archive-cycle') {
          return await this.executeCycle();
        }
        if (job.name === 'archive-entity-batch') {
          return await this.processEntityBatch(job.data as {
            configId: string;
            entityType: string;
            archiveStrategy: string;
            cutoffDate: string;
          });
        }
        throw new Error(`Unknown job name: ${job.name}`);
      },
      {
        connection: redisConnection as unknown as ConnectionOptions,
        concurrency: 2,
      }
    );
  }

  private async scheduleDailyCycle(): Promise<void> {
    const existingJobs = await this.archiveQueue.getRepeatableJobs();
    const alreadyScheduled = existingJobs.some((j) => j.name === 'daily-archive-cycle');

    if (!alreadyScheduled) {
      await this.archiveQueue.add(
        'daily-archive-cycle',
        {},
        {
          repeat: {
            pattern: '0 2 * * *', // Daily at 2 AM
          },
        }
      );
    }
  }

  async configureAutoArchive(
    input: z.infer<typeof ConfigureAutoArchiveInputSchema>
  ): Promise<ArchiveConfig> {
    const validated = ConfigureAutoArchiveInputSchema.parse(input);

    const existing = await this.prisma.archiveConfig.findFirst({
      where: { entityType: validated.entityType },
    });

    if (existing) {
      const updated = await this.prisma.archiveConfig.update({
        where: { id: existing.id },
        data: {
          retentionDays: validated.retentionDays,
          archiveStrategy: validated.archiveStrategy,
          isEnabled: validated.isEnabled,
          filters: validated.filters ? JSON.stringify(validated.filters) : null,
          configuredBy: validated.configuredBy,
          updatedAt: new Date(),
        },
      });

      return {
        id: updated.id,
        entityType: updated.entityType,
        retentionDays: updated.retentionDays,
        archiveStrategy: updated.archiveStrategy,
        isEnabled: updated.isEnabled,
      };
    }

    const created = await this.prisma.archiveConfig.create({
      data: {
        entityType: validated.entityType,
        retentionDays: validated.retentionDays,
        archiveStrategy: validated.archiveStrategy,
        isEnabled: validated.isEnabled,
        filters: validated.filters ? JSON.stringify(validated.filters) : null,
        configuredBy: validated.configuredBy,
      },
    });

    return {
      id: created.id,
      entityType: created.entityType,
      retentionDays: created.retentionDays,
      archiveStrategy: created.archiveStrategy,
      isEnabled: created.isEnabled,
    };
  }

  async runArchiveCycle(): Promise<ArchiveCycleResult> {
    const job = await this.archiveQueue.add('daily-archive-cycle', {}, {
      priority: 1,
    });

    const result = await job.waitUntilFinished(
      this.queueEvents,
      300000 // 5 minute timeout
    );

    return result as ArchiveCycleResult;
  }

  private async executeCycle(): Promise<ArchiveCycleResult> {
    const configs = await this.prisma.archiveConfig.findMany({
      where: { isEnabled: true },
    });

    let totalArchived = 0;
    const errors: Array<{ entityType: string; error: string }> = [];

    for (const config of configs) {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

        const batchJob = await this.archiveQueue.add('archive-entity-batch', {
          configId: config.id,
          entityType: config.entityType,
          archiveStrategy: config.archiveStrategy,
          cutoffDate: cutoffDate.toISOString(),
        });

        const batchResult = await batchJob.waitUntilFinished(
          this.queueEvents,
          120000
        );

        totalArchived += (batchResult as { archivedCount: number }).archivedCount;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error during archive cycle';
        errors.push({ entityType: config.entityType, error: message });
      }
    }

    await this.prisma.archiveCycleLog.create({
      data: {
        processedConfigs: configs.length,
        totalArchived,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        executedAt: new Date(),
      },
    });

    return {
      processedConfigs: configs.length,
      totalArchived,
      errors,
    };
  }

  private async processEntityBatch(data: {
    configId: string;
    entityType: string;
    archiveStrategy: string;
    cutoffDate: string;
  }): Promise<{ archivedCount: number }> {
    const cutoff = new Date(data.cutoffDate);

    const entitiesToArchive = await this.prisma.archivableEntity.findMany({
      where: {
        entityType: data.entityType,
        isArchived: false,
        updatedAt: { lt: cutoff },
      },
      take: 500,
    });

    if (entitiesToArchive.length === 0) {
      return { archivedCount: 0 };
    }

    const entityIds = entitiesToArchive.map((e) => e.id);

    const archiveEntries = entitiesToArchive.map((entity) => ({
      entityType: data.entityType,
      entityId: entity.id,
      originalData: JSON.stringify(entity),
      archiveStrategy: data.archiveStrategy,
      archivedAt: new Date(),
      configId: data.configId,
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.archiveEntry.createMany({ data: archiveEntries });

      if (data.archiveStrategy === 'SOFT_DELETE') {
        await tx.archivableEntity.updateMany({
          where: { id: { in: entityIds } },
          data: { isArchived: true, archivedAt: new Date() },
        });
      } else if (data.archiveStrategy === 'MOVE') {
        await tx.archivableEntity.updateMany({
          where: { id: { in: entityIds } },
          data: { isArchived: true, archivedAt: new Date() },
        });
      } else if (data.archiveStrategy === 'COMPRESS') {
        await tx.archivableEntity.updateMany({
          where: { id: { in: entityIds } },
          data: { isArchived: true, isCompressed: true, archivedAt: new Date() },
        });
      }
    });

    return { archivedCount: entitiesToArchive.length };
  }

  async searchArchive(input: z.infer<typeof SearchArchiveInputSchema>): Promise<ArchiveSearchResult> {
    const validated = SearchArchiveInputSchema.parse(input);

    const whereClause: Record<string, unknown> = {};

    if (validated.entityType) {
      whereClause.entityType = validated.entityType;
    }

    if (validated.archivedAfter || validated.archivedBefore) {
      const archivedAtFilter: Record<string, Date> = {};
      if (validated.archivedAfter) {
        archivedAtFilter.gte = new Date(validated.archivedAfter);
      }
      if (validated.archivedBefore) {
        archivedAtFilter.lte = new Date(validated.archivedBefore);
      }
      whereClause.archivedAt = archivedAtFilter;
    }

    if (validated.query) {
      whereClause.originalData = { contains: validated.query };
    }

    const [entries, total] = await Promise.all([
      this.prisma.archiveEntry.findMany({
        where: whereClause,
        skip: (validated.page - 1) * validated.pageSize,
        take: validated.pageSize,
        orderBy: { archivedAt: 'desc' },
      }),
      this.prisma.archiveEntry.count({ where: whereClause }),
    ]);

    return {
      entries: entries.map((e) => ({
        id: e.id,
        entityType: e.entityType,
        entityId: e.entityId,
        archivedAt: e.archivedAt,
        strategy: e.archiveStrategy || '',
        metadata: e.originalData ? JSON.parse(e.originalData as string) : null,
      })),
      total,
      page: validated.page,
      pageSize: validated.pageSize,
    };
  }

  async restoreFromArchive(
    input: z.infer<typeof RestoreFromArchiveInputSchema>
  ): Promise<RestoreResult> {
    const validated = RestoreFromArchiveInputSchema.parse(input);

    const archiveEntry = await this.prisma.archiveEntry.findUnique({
      where: { id: validated.archiveEntryId },
    });

    if (!archiveEntry) {
      throw new Error(`Archive entry not found: ${validated.archiveEntryId}`);
    }

    const restoredAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.archivableEntity.update({
        where: { id: archiveEntry.entityId },
        data: {
          isArchived: false,
          isCompressed: false,
          archivedAt: null,
          updatedAt: restoredAt,
        },
      });

      await tx.archiveEntry.update({
        where: { id: archiveEntry.id },
        data: {
          restoredAt,
          restoredBy: validated.restoredBy,
        },
      });

      await tx.archiveRestoreLog.create({
        data: {
          archiveEntryId: archiveEntry.id,
          entityType: archiveEntry.entityType,
          entityId: archiveEntry.entityId,
          restoredBy: validated.restoredBy,
          restoredAt,
        },
      });
    });

    return {
      success: true,
      entityType: archiveEntry.entityType,
      entityId: archiveEntry.entityId,
      restoredAt,
    };
  }

  async shutdown(): Promise<void> {
    if (this.archiveWorker) {
      await this.archiveWorker.close();
    }
    await this.queueEvents.close();
    await this.archiveQueue.close();
  }
}
