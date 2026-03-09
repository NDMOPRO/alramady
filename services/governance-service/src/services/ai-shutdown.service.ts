import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface ShutdownStatus {
  id: string;
  isActive: boolean;
  reason: string;
  activatedBy: string;
  activatedAt: Date;
  deactivatedBy?: string;
  deactivatedAt?: Date;
  scope: 'global' | 'tenant' | 'engine';
  tenantId?: string;
  affectedEngines: string[];
}

interface AIAllowedResult {
  allowed: boolean;
  reason?: string;
  shutdownId?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_ENGINES = [
  'data-files',
  'excel',
  'dashboards',
  'reports',
  'presentations',
  'literal-match',
  'localization',
  'conversion',
  'ai-intelligence',
  'governance',
] as const;

type EngineName = typeof VALID_ENGINES[number];

// ─── Service ─────────────────────────────────────────────────────────────────

export class AIShutdownService {
  constructor(private prisma: PrismaClient) {}

  async activateShutdown(
    userId: string,
    reason: string,
    scope: 'global' | 'tenant' | 'engine',
    tenantId?: string,
    engines?: string[],
  ): Promise<ShutdownStatus> {
    if (!userId || !userId.trim()) {
      throw new Error('User ID is required to activate shutdown');
    }
    if (!reason || !reason.trim()) {
      throw new Error('A reason is required to activate shutdown');
    }
    if (scope === 'tenant' && !tenantId) {
      throw new Error('Tenant ID is required for tenant-scoped shutdown');
    }
    if (scope === 'engine' && (!engines || engines.length === 0)) {
      throw new Error('At least one engine must be specified for engine-scoped shutdown');
    }

    const affectedEngines: string[] = scope === 'global'
      ? [...VALID_ENGINES]
      : (engines ?? []).filter((e) => (VALID_ENGINES as readonly string[]).includes(e));

    if (scope === 'engine' && affectedEngines.length === 0) {
      throw new Error('No valid engine names provided. Valid engines: ' + VALID_ENGINES.join(', '));
    }

    const shutdownId = crypto.randomUUID();
    const activatedAt = new Date();

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenantId ?? 'system',
        userId,
        action: 'ai_shutdown.activated',
        entityType: 'ai_shutdown',
        entityId: shutdownId,
        detailsJson: {
          shutdownId,
          isActive: true,
          reason: reason.trim(),
          activatedBy: userId,
          activatedAt: activatedAt.toISOString(),
          scope,
          tenantId: tenantId ?? null,
          affectedEngines,
        },
      },
    });

    logger.warn('AI shutdown activated', {
      shutdownId,
      scope,
      tenantId,
      affectedEngines,
      activatedBy: userId,
      reason: reason.trim(),
    });

    // Notify admins via audit log entry
    await this.prisma.auditLog.create({
      data: {
        tenantId: tenantId ?? 'system',
        userId,
        action: 'ai_shutdown.admin_notified',
        entityType: 'ai_shutdown',
        entityId: shutdownId,
        detailsJson: {
          shutdownId,
          notification: 'admin_alert',
          message: `AI shutdown activated by ${userId}: ${reason.trim()}`,
          scope,
          affectedEngines,
          notifiedAt: new Date().toISOString(),
        },
      },
    });

    return {
      id: shutdownId,
      isActive: true,
      reason: reason.trim(),
      activatedBy: userId,
      activatedAt,
      scope,
      tenantId,
      affectedEngines,
    };
  }

  async deactivateShutdown(userId: string, shutdownId: string): Promise<void> {
    if (!userId || !userId.trim()) {
      throw new Error('User ID is required to deactivate shutdown');
    }
    if (!shutdownId || !shutdownId.trim()) {
      throw new Error('Shutdown ID is required');
    }

    const shutdownLogs = await this.prisma.auditLog.findMany({
      where: {
        entityId: shutdownId,
        entityType: 'ai_shutdown',
        action: 'ai_shutdown.activated',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (shutdownLogs.length === 0) {
      throw new Error(`Shutdown record '${shutdownId}' not found`);
    }

    const shutdownData = shutdownLogs[0].detailsJson as Record<string, unknown>;

    // Check if already deactivated
    const deactivationLogs = await this.prisma.auditLog.findMany({
      where: {
        entityId: shutdownId,
        entityType: 'ai_shutdown',
        action: 'ai_shutdown.deactivated',
      },
      take: 1,
    });

    if (deactivationLogs.length > 0) {
      throw new Error(`Shutdown '${shutdownId}' is already deactivated`);
    }

    const deactivatedAt = new Date();

    await this.prisma.auditLog.create({
      data: {
        tenantId: shutdownLogs[0].tenantId,
        userId,
        action: 'ai_shutdown.deactivated',
        entityType: 'ai_shutdown',
        entityId: shutdownId,
        detailsJson: {
          ...shutdownData,
          isActive: false,
          deactivatedBy: userId,
          deactivatedAt: deactivatedAt.toISOString(),
        },
      },
    });

    logger.info('AI shutdown deactivated', {
      shutdownId,
      deactivatedBy: userId,
    });
  }

  async isAIAllowed(tenantId: string, engine: string): Promise<AIAllowedResult> {
    if (!tenantId || !engine) {
      throw new Error('Tenant ID and engine name are required');
    }

    const activeShutdowns = await this.getActiveShutdowns();

    // Check global shutdowns first
    for (const shutdown of activeShutdowns) {
      if (shutdown.scope === 'global') {
        return {
          allowed: false,
          reason: `Global AI shutdown active: ${shutdown.reason}`,
          shutdownId: shutdown.id,
        };
      }
    }

    // Check tenant-scoped shutdowns
    for (const shutdown of activeShutdowns) {
      if (shutdown.scope === 'tenant' && shutdown.tenantId === tenantId) {
        return {
          allowed: false,
          reason: `Tenant-level AI shutdown active: ${shutdown.reason}`,
          shutdownId: shutdown.id,
        };
      }
    }

    // Check engine-scoped shutdowns
    for (const shutdown of activeShutdowns) {
      if (shutdown.scope === 'engine' && shutdown.affectedEngines.includes(engine)) {
        if (!shutdown.tenantId || shutdown.tenantId === tenantId) {
          return {
            allowed: false,
            reason: `Engine '${engine}' is shut down: ${shutdown.reason}`,
            shutdownId: shutdown.id,
          };
        }
      }
    }

    return { allowed: true };
  }

  async getActiveShutdowns(): Promise<ShutdownStatus[]> {
    // Get all activation events
    const activationLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'ai_shutdown',
        action: 'ai_shutdown.activated',
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get all deactivation events
    const deactivationLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'ai_shutdown',
        action: 'ai_shutdown.deactivated',
      },
    });

    const deactivatedIds = new Set(deactivationLogs.map((log) => log.entityId));

    const activeShutdowns: ShutdownStatus[] = [];

    for (const log of activationLogs) {
      if (deactivatedIds.has(log.entityId)) {
        continue;
      }

      const data = log.detailsJson as Record<string, unknown>;
      activeShutdowns.push({
        id: data.shutdownId as string,
        isActive: true,
        reason: data.reason as string,
        activatedBy: data.activatedBy as string,
        activatedAt: new Date(data.activatedAt as string),
        scope: data.scope as 'global' | 'tenant' | 'engine',
        tenantId: (data.tenantId as string) ?? undefined,
        affectedEngines: data.affectedEngines as string[],
      });
    }

    logger.debug('Active shutdowns retrieved', { count: activeShutdowns.length });

    return activeShutdowns;
  }
}
