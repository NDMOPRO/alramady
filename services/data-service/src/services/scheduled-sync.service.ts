/**
 * Scheduled Sync Service — Rasid Platform
 * خدمة المزامنة المجدولة للمصادر الخارجية
 */

import { PrismaClient } from '@prisma/client';
import { Queue, Worker, Job } from 'bullmq';
import { ConnectorRegistry } from '../connectors/connector-registry';
import { ConnectorType } from '../connectors/connector.interface';
import { logger } from '../utils/logger';

interface SyncSchedule {
  id: string;
  sourceId: string;
  frequency: 'hourly' | 'daily' | 'weekly';
  tenantId: string;
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date;
  createdAt: Date;
}

interface SyncResult {
  sourceId: string;
  success: boolean;
  recordsImported: number;
  duration: number;
  error?: string;
  syncedAt: Date;
}

interface SyncLog {
  id: string;
  sourceId: string;
  status: 'success' | 'failed';
  recordsImported: number;
  duration: number;
  error: string | null;
  createdAt: Date;
}

const FREQUENCY_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export class ScheduledSyncService {
  private syncQueue: Queue;
  private registry: ConnectorRegistry;

  constructor(private prisma: PrismaClient) {
    this.syncQueue = new Queue('scheduled-sync', {
      connection: { url: REDIS_URL },
    });

    this.registry = new ConnectorRegistry(prisma);
    this.initWorker();
  }

  async scheduleSync(
    sourceId: string,
    frequency: 'hourly' | 'daily' | 'weekly',
    tenantId: string
  ): Promise<SyncSchedule> {
    const source = await this.prisma.dataSource.findFirst({
      where: { id: sourceId, tenantId },
    });

    if (!source) {
      throw new Error(`Data source ${sourceId} not found`);
    }

    // Remove existing schedule if any
    await this.pauseSync(sourceId).catch(() => {});

    const repeatEvery = FREQUENCY_MS[frequency];
    const nextRunAt = new Date(Date.now() + repeatEvery);

    // Add repeatable job
    await this.syncQueue.add(
      'sync',
      { sourceId, tenantId },
      {
        repeat: { every: repeatEvery },
        jobId: `sync:${sourceId}`,
      }
    );

    // Save schedule in database
    const schedule = await this.prisma.syncSchedule.upsert({
      where: { sourceId },
      create: {
        sourceId,
        frequency,
        tenantId,
        isActive: true,
        nextRunAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        frequency,
        isActive: true,
        nextRunAt,
        updatedAt: new Date(),
      },
    });

    logger.info('Sync scheduled', { sourceId, frequency, tenantId });

    return {
      id: schedule.id,
      sourceId,
      frequency,
      tenantId,
      isActive: true,
      lastRunAt: schedule.lastRunAt,
      nextRunAt,
      createdAt: schedule.createdAt,
    };
  }

  async executeSyncJob(sourceId: string): Promise<SyncResult> {
    const startTime = Date.now();

    const source = await this.prisma.dataSource.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      throw new Error(`Data source ${sourceId} not found`);
    }

    try {
      const connectorType = source.type as ConnectorType;
      const connector = this.registry.getConnector(connectorType);

      // Get the connection for this source
      const connection = await this.prisma.connectorConnection.findFirst({
        where: { connectorType, tenantId: source.tenantId, status: 'active' },
        orderBy: { lastUsedAt: 'desc' },
      });

      if (!connection) {
        throw new Error(`No active connection found for connector type: ${connectorType}`);
      }

      const token = await this.registry.getValidToken(connection.id, source.tenantId);
      const importResult = await connector.importData(token, source.externalId ?? sourceId);

      const duration = Date.now() - startTime;

      // Update data source with imported data
      await this.prisma.dataSource.update({
        where: { id: sourceId },
        data: {
          lastSyncAt: new Date(),
          recordCount: importResult.rowCount,
          columns: JSON.stringify(importResult.columns),
          updatedAt: new Date(),
        },
      });

      // Log success
      await this.createSyncLog(sourceId, 'success', importResult.rowCount, duration);

      // Update schedule
      await this.prisma.syncSchedule.updateMany({
        where: { sourceId },
        data: { lastRunAt: new Date(), updatedAt: new Date() },
      });

      logger.info('Sync completed', { sourceId, records: importResult.rowCount, duration });

      return {
        sourceId,
        success: true,
        recordsImported: importResult.rowCount,
        duration,
        syncedAt: new Date(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.createSyncLog(sourceId, 'failed', 0, duration, errorMessage);

      logger.error('Sync failed', { sourceId, error: errorMessage, duration });

      return {
        sourceId,
        success: false,
        recordsImported: 0,
        duration,
        error: errorMessage,
        syncedAt: new Date(),
      };
    }
  }

  async getSyncLogs(sourceId: string, limit: number = 50): Promise<SyncLog[]> {
    const logs = await this.prisma.syncLog.findMany({
      where: { sourceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map((log) => ({
      id: log.id,
      sourceId: log.sourceId,
      status: log.status as 'success' | 'failed',
      recordsImported: log.recordsImported,
      duration: log.duration,
      error: log.error,
      createdAt: log.createdAt,
    }));
  }

  async pauseSync(sourceId: string): Promise<void> {
    await this.syncQueue.removeRepeatable('sync', {
      every: 0, // Remove all repeatable jobs for this source
      jobId: `sync:${sourceId}`,
    }).catch(() => {});

    await this.prisma.syncSchedule.updateMany({
      where: { sourceId },
      data: { isActive: false, updatedAt: new Date() },
    });

    logger.info('Sync paused', { sourceId });
  }

  async resumeSync(sourceId: string): Promise<void> {
    const schedule = await this.prisma.syncSchedule.findFirst({
      where: { sourceId },
    });

    if (!schedule) {
      throw new Error(`No sync schedule found for source ${sourceId}`);
    }

    const repeatEvery = FREQUENCY_MS[schedule.frequency];

    await this.syncQueue.add(
      'sync',
      { sourceId, tenantId: schedule.tenantId },
      {
        repeat: { every: repeatEvery },
        jobId: `sync:${sourceId}`,
      }
    );

    await this.prisma.syncSchedule.updateMany({
      where: { sourceId },
      data: { isActive: true, updatedAt: new Date() },
    });

    logger.info('Sync resumed', { sourceId });
  }

  private async createSyncLog(
    sourceId: string,
    status: string,
    recordsImported: number,
    duration: number,
    error?: string
  ): Promise<void> {
    await this.prisma.syncLog.create({
      data: {
        sourceId,
        status,
        recordsImported,
        duration,
        error: error ?? null,
        createdAt: new Date(),
      },
    });
  }

  private initWorker(): void {
    const worker = new Worker(
      'scheduled-sync',
      async (job: Job) => {
        const { sourceId } = job.data;
        return this.executeSyncJob(sourceId);
      },
      {
        connection: { url: REDIS_URL },
        concurrency: 3,
      }
    );

    worker.on('failed', (job, err) => {
      logger.error('Sync worker job failed', {
        jobId: job?.id,
        sourceId: job?.data?.sourceId,
        error: err.message,
      });
    });
  }
}
