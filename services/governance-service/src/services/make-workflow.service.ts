import crypto from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface WorkflowTrigger {
  id: string;
  tenantId: string;
  event: string;
  webhookUrl: string;
  isActive: boolean;
  lastTriggered?: Date;
  payload: Record<string, unknown>;
  createdAt: Date;
}

interface TriggerResult {
  success: boolean;
  statusCode: number;
}

interface WebhookTestResult {
  success: boolean;
  response: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class MakeWorkflowService {
  constructor(private prisma: PrismaClient) {}

  async registerWebhook(
    tenantId: string,
    event: string,
    webhookUrl: string,
  ): Promise<WorkflowTrigger> {
    if (!tenantId || !tenantId.trim()) {
      throw new Error('Tenant ID is required');
    }
    if (!event || !event.trim()) {
      throw new Error('Event name is required');
    }
    if (!webhookUrl || !webhookUrl.trim()) {
      throw new Error('Webhook URL is required');
    }

    this.validateWebhookUrl(webhookUrl);

    const webhookId = crypto.randomUUID();
    const createdAt = new Date();

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: 'system',
        action: 'make_webhook.registered',
        entityType: 'make_webhook',
        entityId: webhookId,
        detailsJson: {
          webhookId,
          tenantId,
          event: event.trim(),
          webhookUrl: webhookUrl.trim(),
          isActive: true,
          payload: {},
          createdAt: createdAt.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    logger.info('Make.com webhook registered', {
      webhookId,
      tenantId,
      event: event.trim(),
      webhookUrl: this.maskUrl(webhookUrl),
    });

    return {
      id: webhookId,
      tenantId,
      event: event.trim(),
      webhookUrl: webhookUrl.trim(),
      isActive: true,
      payload: {},
      createdAt,
    };
  }

  async triggerWorkflow(
    event: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<TriggerResult> {
    if (!event || !tenantId) {
      throw new Error('Event name and tenant ID are required');
    }

    const webhooks = await this.listWebhooks(tenantId);
    const matchingWebhooks = webhooks.filter(
      (w) => w.event === event.trim() && w.isActive,
    );

    if (matchingWebhooks.length === 0) {
      logger.warn('No active webhooks found for event', { event, tenantId });
      return { success: false, statusCode: 404 };
    }

    let lastStatusCode = 0;
    let allSucceeded = true;

    for (const webhook of matchingWebhooks) {
      const enrichedPayload = {
        ...payload,
        _meta: {
          event: event.trim(),
          tenantId,
          webhookId: webhook.id,
          triggeredAt: new Date().toISOString(),
          source: 'rasid-governance',
        },
      };

      try {
        const response = await fetch(webhook.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Rasid-Governance/1.0',
            'X-Webhook-Id': webhook.id,
            'X-Event-Type': event.trim(),
          },
          body: JSON.stringify(enrichedPayload),
          signal: AbortSignal.timeout(30000),
        });

        lastStatusCode = response.status;
        const succeeded = response.ok;

        if (!succeeded) {
          allSucceeded = false;
        }

        // Log the trigger
        await this.prisma.auditLog.create({
          data: {
            tenantId,
            userId: 'system',
            action: 'make_webhook.triggered',
            entityType: 'make_webhook',
            entityId: webhook.id,
            detailsJson: {
              webhookId: webhook.id,
              event: event.trim(),
              statusCode: response.status,
              success: succeeded,
              triggeredAt: new Date().toISOString(),
              payloadKeys: Object.keys(payload),
            } as Prisma.InputJsonValue,
          },
        });

        // Update lastTriggered
        await this.updateLastTriggered(webhook.id, tenantId, webhook);

        logger.info('Make.com webhook triggered', {
          webhookId: webhook.id,
          event: event.trim(),
          statusCode: response.status,
          success: succeeded,
        });
      } catch (error: unknown) {
        allSucceeded = false;
        const errorMessage = error instanceof Error ? error.message : String(error);

        await this.prisma.auditLog.create({
          data: {
            tenantId,
            userId: 'system',
            action: 'make_webhook.trigger_failed',
            entityType: 'make_webhook',
            entityId: webhook.id,
            detailsJson: {
              webhookId: webhook.id,
              event: event.trim(),
              error: errorMessage,
              triggeredAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });

        logger.error('Failed to trigger Make.com webhook', {
          webhookId: webhook.id,
          event: event.trim(),
          error: errorMessage,
        });
      }
    }

    return {
      success: allSucceeded,
      statusCode: allSucceeded ? lastStatusCode : 502,
    };
  }

  async listWebhooks(tenantId: string): Promise<WorkflowTrigger[]> {
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Get all registered webhooks
    const registrationLogs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: 'make_webhook',
        action: 'make_webhook.registered',
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get deactivation logs
    const deactivationLogs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: 'make_webhook',
        action: 'make_webhook.deactivated',
      },
    });

    const deactivatedIds = new Set(deactivationLogs.map((log) => log.entityId));

    // Get latest trigger times
    const triggerLogs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: 'make_webhook',
        action: 'make_webhook.triggered',
      },
      orderBy: { createdAt: 'desc' },
    });

    const lastTriggeredMap = new Map<string, Date>();
    for (const log of triggerLogs) {
      if (log.entityId && !lastTriggeredMap.has(log.entityId)) {
        lastTriggeredMap.set(log.entityId, log.createdAt);
      }
    }

    const webhooks: WorkflowTrigger[] = [];
    const seenIds = new Set<string>();

    for (const log of registrationLogs) {
      const data = log.detailsJson as Record<string, unknown>;
      const webhookId = data.webhookId as string;

      // Deduplicate - only take the most recent registration per ID
      if (seenIds.has(webhookId)) {
        continue;
      }
      seenIds.add(webhookId);

      const isActive = !deactivatedIds.has(log.entityId || '');

      webhooks.push({
        id: webhookId,
        tenantId: data.tenantId as string,
        event: data.event as string,
        webhookUrl: data.webhookUrl as string,
        isActive,
        lastTriggered: lastTriggeredMap.get(log.entityId || ''),
        payload: (data.payload as Record<string, unknown>) ?? {},
        createdAt: new Date(data.createdAt as string),
      });
    }

    return webhooks;
  }

  async deactivateWebhook(webhookId: string): Promise<void> {
    if (!webhookId) {
      throw new Error('Webhook ID is required');
    }

    const webhookLogs = await this.prisma.auditLog.findMany({
      where: {
        entityId: webhookId,
        entityType: 'make_webhook',
        action: 'make_webhook.registered',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (webhookLogs.length === 0) {
      throw new Error(`Webhook '${webhookId}' not found`);
    }

    // Check if already deactivated
    const deactivationLogs = await this.prisma.auditLog.findMany({
      where: {
        entityId: webhookId,
        entityType: 'make_webhook',
        action: 'make_webhook.deactivated',
      },
      take: 1,
    });

    if (deactivationLogs.length > 0) {
      throw new Error(`Webhook '${webhookId}' is already deactivated`);
    }

    const data = webhookLogs[0].detailsJson as Record<string, unknown>;

    await this.prisma.auditLog.create({
      data: {
        tenantId: webhookLogs[0].tenantId,
        userId: 'system',
        action: 'make_webhook.deactivated',
        entityType: 'make_webhook',
        entityId: webhookId,
        detailsJson: {
          webhookId,
          event: String(data.event),
          deactivatedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    logger.info('Make.com webhook deactivated', {
      webhookId,
      event: String(data.event),
    });
  }

  async testWebhook(webhookId: string): Promise<WebhookTestResult> {
    if (!webhookId) {
      throw new Error('Webhook ID is required');
    }

    const webhookLogs = await this.prisma.auditLog.findMany({
      where: {
        entityId: webhookId,
        entityType: 'make_webhook',
        action: 'make_webhook.registered',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (webhookLogs.length === 0) {
      throw new Error(`Webhook '${webhookId}' not found`);
    }

    const data = webhookLogs[0].detailsJson as Record<string, unknown>;
    const webhookUrl = data.webhookUrl as string;

    const testPayload = {
      _test: true,
      _meta: {
        event: data.event,
        tenantId: data.tenantId,
        webhookId,
        triggeredAt: new Date().toISOString(),
        source: 'rasid-governance-test',
      },
      message: 'This is a test trigger from RASID Governance Platform',
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Rasid-Governance/1.0',
          'X-Webhook-Id': webhookId,
          'X-Event-Type': 'test',
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(15000),
      });

      const responseText = await response.text().catch(() => '');
      const success = response.ok;

      await this.prisma.auditLog.create({
        data: {
          tenantId: webhookLogs[0].tenantId,
          userId: 'system',
          action: 'make_webhook.tested',
          entityType: 'make_webhook',
          entityId: webhookId,
          detailsJson: {
            webhookId,
            success,
            statusCode: response.status,
            testedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      logger.info('Make.com webhook test completed', {
        webhookId,
        success,
        statusCode: response.status,
      });

      return {
        success,
        response: success
          ? `OK (${response.status}): ${responseText.slice(0, 500)}`
          : `Failed (${response.status}): ${responseText.slice(0, 500)}`,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Make.com webhook test failed', {
        webhookId,
        error: errorMessage,
      });

      return {
        success: false,
        response: `Connection error: ${errorMessage}`,
      };
    }
  }

  private validateWebhookUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid webhook URL: '${url}'`);
    }

    if (parsed.protocol !== 'https:') {
      throw new Error('Webhook URL must use HTTPS');
    }

    // Block private/internal URLs
    const hostname = parsed.hostname.toLowerCase();
    const blockedPatterns = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '10.',
      '172.16.',
      '172.17.',
      '172.18.',
      '172.19.',
      '172.20.',
      '172.21.',
      '172.22.',
      '172.23.',
      '172.24.',
      '172.25.',
      '172.26.',
      '172.27.',
      '172.28.',
      '172.29.',
      '172.30.',
      '172.31.',
      '192.168.',
      '169.254.',
    ];

    for (const blocked of blockedPatterns) {
      if (hostname.startsWith(blocked) || hostname === blocked) {
        throw new Error('Webhook URL must not point to private/internal addresses');
      }
    }
  }

  private maskUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;
      if (path.length > 10) {
        return `${parsed.origin}${path.slice(0, 10)}...`;
      }
      return `${parsed.origin}${path}`;
    } catch {
      return url.slice(0, 30) + '...';
    }
  }

  private async updateLastTriggered(
    webhookId: string,
    tenantId: string,
    webhook: WorkflowTrigger,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: 'system',
        action: 'make_webhook.registered',
        entityType: 'make_webhook',
        entityId: webhookId,
        detailsJson: {
          webhookId,
          tenantId: webhook.tenantId,
          event: webhook.event,
          webhookUrl: webhook.webhookUrl,
          isActive: webhook.isActive,
          payload: webhook.payload as Prisma.InputJsonValue,
          createdAt: webhook.createdAt.toISOString(),
          lastTriggered: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }
}
