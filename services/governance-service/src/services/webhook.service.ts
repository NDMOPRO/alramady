import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { z } from 'zod';

const SIGNATURE_HEADER = 'X-Rasid-Signature-256';
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_BASE_MS = 1000;

const RegisterOutboundWebhookInputSchema = z.object({
  name: z.string().min(1).max(255),
  targetUrl: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
  secret: z.string().min(16),
  headers: z.record(z.string(), z.string()).optional(),
  isEnabled: z.boolean().default(true),
  createdBy: z.string().uuid(),
});

const TriggerWebhookInputSchema = z.object({
  event: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

const ReceiveInboundWebhookInputSchema = z.object({
  source: z.string().min(1),
  headers: z.record(z.string(), z.string()),
  body: z.unknown(),
  receivedBy: z.string().uuid().optional(),
});

const RetryFailedWebhooksInputSchema = z.object({
  webhookId: z.string().uuid().optional(),
  maxRetries: z.number().int().min(1).max(MAX_RETRY_ATTEMPTS).optional(),
});

interface WebhookRegistration {
  id: string;
  name: string;
  targetUrl: string;
  events: string[];
  isEnabled: boolean;
  createdAt: Date;
}

interface WebhookDeliveryResult {
  webhookId: string;
  deliveryId: string;
  statusCode: number;
  success: boolean;
  responseBody: string | null;
}

interface TriggerResult {
  event: string;
  triggeredWebhooks: number;
  deliveries: WebhookDeliveryResult[];
}

interface InboundWebhookResult {
  id: string;
  source: string;
  receivedAt: Date;
  bodySize: number;
}

interface RetryResult {
  retriedCount: number;
  successCount: number;
  failureCount: number;
  details: Array<{
    deliveryId: string;
    webhookId: string;
    success: boolean;
    statusCode: number | null;
    error: string | null;
  }>;
}

export class WebhookService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private generateSignature(payload: string, secret: string): string {
    return `sha256=${crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;
  }

  private verifySignature(payload: string, secret: string, signature: string): boolean {
    const expected = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  async registerOutboundWebhook(
    input: z.infer<typeof RegisterOutboundWebhookInputSchema>
  ): Promise<WebhookRegistration> {
    const validated = RegisterOutboundWebhookInputSchema.parse(input);

    const encryptedSecret = crypto
      .createHash('sha256')
      .update(validated.secret)
      .digest('hex');

    const webhook = await this.prisma.webhook.create({
      data: {
        name: validated.name,
        targetUrl: validated.targetUrl,
        events: JSON.stringify(validated.events),
        secretHash: encryptedSecret,
        secret: validated.secret,
        headers: validated.headers ? JSON.stringify(validated.headers) : null,
        isEnabled: validated.isEnabled,
        createdBy: validated.createdBy,
      },
    });

    return {
      id: webhook.id,
      name: webhook.name,
      targetUrl: webhook.targetUrl,
      events: validated.events,
      isEnabled: webhook.isEnabled,
      createdAt: webhook.createdAt,
    };
  }

  async triggerWebhook(input: z.infer<typeof TriggerWebhookInputSchema>): Promise<TriggerResult> {
    const validated = TriggerWebhookInputSchema.parse(input);

    const webhooks = await this.prisma.webhook.findMany({
      where: { isEnabled: true },
    });

    const matchingWebhooks = webhooks.filter((wh) => {
      const events = JSON.parse(wh.events as string) as string[];
      return events.includes(validated.event) || events.includes('*');
    });

    const deliveries: WebhookDeliveryResult[] = [];

    for (const webhook of matchingWebhooks) {
      const payloadBody = JSON.stringify({
        event: validated.event,
        timestamp: new Date().toISOString(),
        data: validated.payload,
      });

      const signature = this.generateSignature(payloadBody, webhook.secret || '');

      const customHeaders: Record<string, string> = webhook.headers
        ? (JSON.parse(webhook.headers as string) as Record<string, string>)
        : {};

      const deliveryRecord = await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event: validated.event,
          payload: payloadBody,
          status: 'PENDING',
          attemptCount: 0,
        },
      });

      try {
        const response = await fetch(webhook.targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [SIGNATURE_HEADER]: signature,
            'X-Rasid-Event': validated.event,
            'X-Rasid-Delivery': deliveryRecord.id,
            ...customHeaders,
          },
          body: payloadBody,
          signal: AbortSignal.timeout(30000),
        });

        const responseBody = await response.text();
        const success = response.status >= 200 && response.status < 300;

        await this.prisma.webhookDelivery.update({
          where: { id: deliveryRecord.id },
          data: {
            status: success ? 'DELIVERED' : 'FAILED',
            statusCode: response.status,
            responseBody: responseBody.substring(0, 4096),
            attemptCount: 1,
            deliveredAt: success ? new Date() : null,
          },
        });

        deliveries.push({
          webhookId: webhook.id,
          deliveryId: deliveryRecord.id,
          statusCode: response.status,
          success,
          responseBody: responseBody.substring(0, 1024),
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown delivery error';

        await this.prisma.webhookDelivery.update({
          where: { id: deliveryRecord.id },
          data: {
            status: 'FAILED',
            statusCode: null,
            responseBody: errorMessage,
            attemptCount: 1,
          },
        });

        deliveries.push({
          webhookId: webhook.id,
          deliveryId: deliveryRecord.id,
          statusCode: 0,
          success: false,
          responseBody: errorMessage,
        });
      }
    }

    return {
      event: validated.event,
      triggeredWebhooks: matchingWebhooks.length,
      deliveries,
    };
  }

  async receiveInboundWebhook(
    input: z.infer<typeof ReceiveInboundWebhookInputSchema>
  ): Promise<InboundWebhookResult> {
    const validated = ReceiveInboundWebhookInputSchema.parse(input);

    const bodyString = typeof validated.body === 'string'
      ? validated.body
      : JSON.stringify(validated.body);

    const signatureHeader = validated.headers[SIGNATURE_HEADER.toLowerCase()]
      || validated.headers[SIGNATURE_HEADER];

    if (signatureHeader) {
      const inboundConfig = await this.prisma.inboundWebhookConfig.findFirst({
        where: { source: validated.source, isEnabled: true },
      });

      if (inboundConfig) {
        const isValid = this.verifySignature(bodyString, inboundConfig.secret || '', signatureHeader);
        if (!isValid) {
          throw new Error('Invalid webhook signature: HMAC verification failed');
        }
      }
    }

    const record = await this.prisma.inboundWebhook.create({
      data: {
        source: validated.source,
        headers: JSON.stringify(validated.headers),
        body: bodyString,
        bodySize: Buffer.byteLength(bodyString, 'utf8'),
        receivedBy: validated.receivedBy || null,
        receivedAt: new Date(),
        status: 'RECEIVED',
      },
    });

    return {
      id: record.id,
      source: record.source,
      receivedAt: record.receivedAt,
      bodySize: record.bodySize,
    };
  }

  async retryFailedWebhooks(
    input: z.infer<typeof RetryFailedWebhooksInputSchema>
  ): Promise<RetryResult> {
    const validated = RetryFailedWebhooksInputSchema.parse(input);
    const maxRetries = validated.maxRetries ?? MAX_RETRY_ATTEMPTS;

    const whereClause: Record<string, unknown> = {
      status: 'FAILED',
      attemptCount: { lt: maxRetries },
    };

    if (validated.webhookId) {
      whereClause.webhookId = validated.webhookId;
    }

    const failedDeliveries = await this.prisma.webhookDelivery.findMany({
      where: whereClause,
      include: { webhook: true },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });

    let successCount = 0;
    let failureCount = 0;
    const details: RetryResult['details'] = [];

    for (const delivery of failedDeliveries) {
      const webhook = delivery.webhook;

      if (!webhook || !webhook.isEnabled) {
        continue;
      }

      const delayMs = RETRY_DELAY_BASE_MS * Math.pow(2, delivery.attemptCount);
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(delayMs, 30000)));

      const signature = this.generateSignature(delivery.payload as string, webhook.secret || '');

      const customHeaders: Record<string, string> = webhook.headers
        ? (JSON.parse(webhook.headers as string) as Record<string, string>)
        : {};

      try {
        const response = await fetch(webhook.targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [SIGNATURE_HEADER]: signature,
            'X-Rasid-Delivery': delivery.id,
            'X-Rasid-Retry': String(delivery.attemptCount + 1),
            ...customHeaders,
          },
          body: delivery.payload as string,
          signal: AbortSignal.timeout(30000),
        });

        const success = response.status >= 200 && response.status < 300;

        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: success ? 'DELIVERED' : 'FAILED',
            statusCode: response.status,
            attemptCount: delivery.attemptCount + 1,
            deliveredAt: success ? new Date() : null,
          },
        });

        if (success) {
          successCount++;
        } else {
          failureCount++;
        }

        details.push({
          deliveryId: delivery.id,
          webhookId: webhook.id,
          success,
          statusCode: response.status,
          error: null,
        });
      } catch (err) {
        failureCount++;
        const errorMessage = err instanceof Error ? err.message : 'Unknown retry error';

        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'FAILED',
            attemptCount: delivery.attemptCount + 1,
            responseBody: errorMessage,
          },
        });

        details.push({
          deliveryId: delivery.id,
          webhookId: webhook.id,
          success: false,
          statusCode: null,
          error: errorMessage,
        });
      }
    }

    return {
      retriedCount: details.length,
      successCount,
      failureCount,
      details,
    };
  }
}
