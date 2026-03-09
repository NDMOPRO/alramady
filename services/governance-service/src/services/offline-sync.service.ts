/**
 * Offline Mode + Auto Sync Service — Rasid Platform
 * وضع عدم الاتصال والمزامنة التلقائية
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  resource: string;
  resourceId: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  status: 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed';
  retryCount: number;
  conflictResolution?: 'client_wins' | 'server_wins' | 'manual';
}

interface SyncState {
  lastSyncedAt: Date | null;
  pendingOperations: number;
  conflictCount: number;
  isOnline: boolean;
}

interface ConflictDetail {
  operationId: string;
  resource: string;
  resourceId: string;
  clientVersion: Record<string, unknown>;
  serverVersion: Record<string, unknown>;
  divergedAt: Date;
}

export class OfflineSyncService {
  private readonly MAX_RETRIES = 5;
  private readonly BATCH_SIZE = 50;

  constructor(private prisma: PrismaClient) {}

  async queueOperation(
    tenantId: string,
    userId: string,
    type: SyncOperation['type'],
    resource: string,
    resourceId: string,
    payload: Record<string, unknown>
  ): Promise<SyncOperation> {
    const operation = await this.prisma.syncQueue.create({
      data: {
        tenantId,
        userId,
        operationType: type,
        resource,
        resourceId,
        payload: JSON.stringify(payload),
        payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        status: 'pending',
        retryCount: 0,
        createdAt: new Date(),
      },
    });

    return {
      id: operation.id,
      type,
      resource,
      resourceId,
      payload,
      timestamp: operation.createdAt,
      status: 'pending',
      retryCount: 0,
    };
  }

  async processPendingOperations(tenantId: string): Promise<{
    synced: number;
    failed: number;
    conflicts: number;
  }> {
    const pending = await this.prisma.syncQueue.findMany({
      where: {
        tenantId,
        status: { in: ['pending', 'failed'] },
        retryCount: { lt: this.MAX_RETRIES },
      },
      orderBy: { createdAt: 'asc' },
      take: this.BATCH_SIZE,
    });

    let synced = 0;
    let failed = 0;
    let conflicts = 0;

    for (const operation of pending) {
      try {
        await this.prisma.syncQueue.update({
          where: { id: operation.id },
          data: { status: 'syncing' },
        });

        const hasConflict = await this.detectConflict(
          operation.resource,
          operation.resourceId,
          operation.payloadHash || '',
          operation.createdAt
        );

        if (hasConflict) {
          await this.prisma.syncQueue.update({
            where: { id: operation.id },
            data: { status: 'conflict' },
          });
          conflicts++;
          continue;
        }

        await this.applyOperation(
          operation.operationType as SyncOperation['type'],
          operation.resource,
          operation.resourceId,
          JSON.parse(operation.payload as string) as Record<string, unknown>
        );

        await this.prisma.syncQueue.update({
          where: { id: operation.id },
          data: {
            status: 'synced',
            syncedAt: new Date(),
          },
        });
        synced++;
      } catch (err) {
        const retryCount = operation.retryCount + 1;
        await this.prisma.syncQueue.update({
          where: { id: operation.id },
          data: {
            status: retryCount >= this.MAX_RETRIES ? 'failed' : 'pending',
            retryCount,
            lastError: err instanceof Error ? err.message : String(err),
          },
        });
        failed++;
      }
    }

    return { synced, failed, conflicts };
  }

  private async detectConflict(
    resource: string,
    resourceId: string,
    clientHash: string,
    clientTimestamp: Date
  ): Promise<boolean> {
    const serverRecord = await this.prisma.syncVersion.findUnique({
      where: { resource_resourceId: { resource, resourceId } },
    });

    if (!serverRecord) return false;

    const serverUpdatedAfterClient = serverRecord.updatedAt > clientTimestamp;
    const hashMismatch = serverRecord.lastHash !== clientHash;

    return serverUpdatedAfterClient && hashMismatch;
  }

  private async applyOperation(
    type: SyncOperation['type'],
    resource: string,
    resourceId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    switch (type) {
      case 'create':
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "${resource}" (id, data, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
          resourceId,
          JSON.stringify(payload)
        );
        break;

      case 'update':
        await this.prisma.$executeRawUnsafe(
          `UPDATE "${resource}" SET data = $2, updated_at = NOW() WHERE id = $1`,
          resourceId,
          JSON.stringify(payload)
        );
        break;

      case 'delete':
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM "${resource}" WHERE id = $1`,
          resourceId
        );
        break;
    }

    await this.prisma.syncVersion.upsert({
      where: { resource_resourceId: { resource, resourceId } },
      create: {
        resource,
        resourceId,
        lastHash: payloadHash,
        version: 1,
        updatedAt: new Date(),
      },
      update: {
        lastHash: payloadHash,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }

  async resolveConflict(
    operationId: string,
    resolution: 'client_wins' | 'server_wins'
  ): Promise<void> {
    const operation = await this.prisma.syncQueue.findUnique({
      where: { id: operationId },
    });

    if (!operation || operation.status !== 'conflict') {
      throw new Error('No conflict found for this operation');
    }

    if (resolution === 'client_wins') {
      await this.applyOperation(
        operation.operationType as SyncOperation['type'],
        operation.resource,
        operation.resourceId,
        JSON.parse(operation.payload as string) as Record<string, unknown>
      );
      await this.prisma.syncQueue.update({
        where: { id: operationId },
        data: { status: 'synced', syncedAt: new Date(), conflictResolution: resolution },
      });
    } else {
      await this.prisma.syncQueue.update({
        where: { id: operationId },
        data: { status: 'synced', syncedAt: new Date(), conflictResolution: resolution },
      });
    }
  }

  async getSyncState(tenantId: string, userId: string): Promise<SyncState> {
    const [pendingCount, conflictCount, lastSync] = await Promise.all([
      this.prisma.syncQueue.count({
        where: { tenantId, userId, status: 'pending' },
      }),
      this.prisma.syncQueue.count({
        where: { tenantId, userId, status: 'conflict' },
      }),
      this.prisma.syncQueue.findFirst({
        where: { tenantId, userId, status: 'synced' },
        orderBy: { syncedAt: 'desc' },
        select: { syncedAt: true },
      }),
    ]);

    return {
      lastSyncedAt: lastSync?.syncedAt ?? null,
      pendingOperations: pendingCount,
      conflictCount,
      isOnline: true,
    };
  }

  async getConflicts(tenantId: string): Promise<ConflictDetail[]> {
    const conflictOps = await this.prisma.syncQueue.findMany({
      where: { tenantId, status: 'conflict' },
      orderBy: { createdAt: 'desc' },
    });

    const details: ConflictDetail[] = [];

    for (const op of conflictOps) {
      const serverVersion = await this.prisma.syncVersion.findUnique({
        where: { resource_resourceId: { resource: op.resource, resourceId: op.resourceId } },
      });

      details.push({
        operationId: op.id,
        resource: op.resource,
        resourceId: op.resourceId,
        clientVersion: JSON.parse(op.payload as string) as Record<string, unknown>,
        serverVersion: serverVersion ? { hash: serverVersion.lastHash, version: serverVersion.version } : {},
        divergedAt: op.createdAt,
      });
    }

    return details;
  }

  async cleanupSyncedOperations(tenantId: string, olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.syncQueue.deleteMany({
      where: {
        tenantId,
        status: 'synced',
        syncedAt: { lt: cutoffDate },
      },
    });

    return result.count;
  }

  generateOfflineManifest(
    tenantId: string,
    resources: string[]
  ): { cacheVersion: string; resources: string[]; timestamp: string } {
    const cacheVersion = createHash('md5')
      .update(`${tenantId}:${resources.join(',')}:${Date.now()}`)
      .digest('hex')
      .slice(0, 8);

    return {
      cacheVersion,
      resources,
      timestamp: new Date().toISOString(),
    };
  }
}
