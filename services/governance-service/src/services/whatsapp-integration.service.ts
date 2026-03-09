import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'governance-service', module: 'whatsapp-integration' },
  transports: [new winston.transports.Console()],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface WhatsAppMessageResult {
  messageId: string;
  to: string;
  status: 'sent' | 'failed';
  timestamp: Date;
  waMessageId: string | null;
}

export interface WhatsAppTemplateParams {
  [key: string]: string;
}

export interface WhatsAppNotification {
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high';
  actionUrl?: string;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface MessageHistoryResult {
  messages: Array<{
    id: string;
    to: string;
    body: string;
    type: string;
    status: string;
    waMessageId: string | null;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export interface DeliveryStatusResult {
  messageId: string;
  status: string;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedReason: string | null;
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────

class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private lastRefill: number;

  constructor(maxPerSecond: number) {
    this.maxTokens = maxPerSecond;
    this.tokens = maxPerSecond;
    this.refillRate = maxPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class WhatsAppIntegrationService {
  private static readonly PAGE_SIZE = 25;
  private static readonly RATE_LIMIT = 80;
  private static readonly BASE_URL = 'https://graph.facebook.com/v18.0';

  private readonly rateLimiter: RateLimiter;
  private readonly apiToken: string;
  private readonly phoneNumberId: string;
  private readonly businessId: string;

  constructor(private prisma: PrismaClient) {
    this.apiToken = process.env.WHATSAPP_API_TOKEN || '';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.businessId = process.env.WHATSAPP_BUSINESS_ID || '';
    this.rateLimiter = new RateLimiter(WhatsAppIntegrationService.RATE_LIMIT);

    if (!this.apiToken) {
      logger.warn('WHATSAPP_API_TOKEN is not set');
    }
    if (!this.phoneNumberId) {
      logger.warn('WHATSAPP_PHONE_NUMBER_ID is not set');
    }
  }

  async sendMessage(to: string, body: string, tenantId: string): Promise<WhatsAppMessageResult> {
    const messageId = uuidv4();
    const startTime = Date.now();
    logger.info('Sending WhatsApp message', { messageId, to, tenantId });

    await this.rateLimiter.acquire();

    const url = `${WhatsAppIntegrationService.BASE_URL}/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as {
      messages?: Array<{ id: string }>;
      error?: { message: string; code: number };
    };

    const durationMs = Date.now() - startTime;
    const waMessageId = data.messages?.[0]?.id || null;
    const status: 'sent' | 'failed' = response.ok ? 'sent' : 'failed';

    if (!response.ok) {
      logger.error('WhatsApp send failed', {
        messageId,
        statusCode: response.status,
        error: data.error?.message,
        durationMs,
      });
    } else {
      logger.info('WhatsApp message sent', { messageId, waMessageId, durationMs });
    }

    await this.prisma.whatsappMessage.create({
      data: {
        id: messageId,
        tenantId,
        to,
        body: body.substring(0, 4096),
        type: 'text',
        status,
        waMessageId,
        failedReason: !response.ok ? (data.error?.message || 'Unknown error') : null,
        createdAt: new Date(),
      },
    });

    return {
      messageId,
      to,
      status,
      timestamp: new Date(),
      waMessageId,
    };
  }

  async sendTemplate(
    to: string,
    templateName: string,
    params: WhatsAppTemplateParams,
    tenantId: string,
  ): Promise<WhatsAppMessageResult> {
    const messageId = uuidv4();
    logger.info('Sending WhatsApp template', { messageId, to, templateName, tenantId });

    await this.rateLimiter.acquire();

    const components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }> = [];
    const paramKeys = Object.keys(params);
    if (paramKeys.length > 0) {
      components.push({
        type: 'body',
        parameters: paramKeys.map((key) => ({ type: 'text', text: params[key] })),
      });
    }

    const url = `${WhatsAppIntegrationService.BASE_URL}/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'ar' },
        components,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as {
      messages?: Array<{ id: string }>;
      error?: { message: string; code: number };
    };

    const waMessageId = data.messages?.[0]?.id || null;
    const status: 'sent' | 'failed' = response.ok ? 'sent' : 'failed';

    if (!response.ok) {
      logger.error('WhatsApp template send failed', {
        messageId,
        templateName,
        error: data.error?.message,
      });
    }

    await this.prisma.whatsappMessage.create({
      data: {
        id: messageId,
        tenantId,
        to,
        body: `template:${templateName}`,
        type: 'template',
        status,
        waMessageId,
        templateName,
        templateParams: JSON.stringify(params),
        failedReason: !response.ok ? (data.error?.message || 'Unknown error') : null,
        createdAt: new Date(),
      },
    });

    return { messageId, to, status, timestamp: new Date(), waMessageId };
  }

  async sendDocument(
    to: string,
    documentUrl: string,
    caption: string,
    tenantId: string,
  ): Promise<WhatsAppMessageResult> {
    const messageId = uuidv4();
    logger.info('Sending WhatsApp document', { messageId, to, tenantId, documentUrl });

    await this.rateLimiter.acquire();

    const url = `${WhatsAppIntegrationService.BASE_URL}/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: {
        link: documentUrl,
        caption,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as {
      messages?: Array<{ id: string }>;
      error?: { message: string; code: number };
    };

    const waMessageId = data.messages?.[0]?.id || null;
    const status: 'sent' | 'failed' = response.ok ? 'sent' : 'failed';

    if (!response.ok) {
      logger.error('WhatsApp document send failed', { messageId, error: data.error?.message });
    }

    await this.prisma.whatsappMessage.create({
      data: {
        id: messageId,
        tenantId,
        to,
        body: caption.substring(0, 4096),
        type: 'document',
        status,
        waMessageId,
        documentUrl,
        failedReason: !response.ok ? (data.error?.message || 'Unknown error') : null,
        createdAt: new Date(),
      },
    });

    return { messageId, to, status, timestamp: new Date(), waMessageId };
  }

  async sendNotification(
    userId: string,
    tenantId: string,
    notification: WhatsAppNotification,
  ): Promise<WhatsAppMessageResult> {
    logger.info('Sending WhatsApp notification', { userId, tenantId, title: notification.title });

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { phone: true, name: true },
    });

    if (!user || !user.phone) {
      throw new Error(`User ${userId} does not have a phone number registered`);
    }

    const body = notification.actionUrl
      ? `*${notification.title}*\n\n${notification.body}\n\n${notification.actionUrl}`
      : `*${notification.title}*\n\n${notification.body}`;

    return this.sendMessage(user.phone, body, tenantId);
  }

  async sendBulk(
    recipients: string[],
    body: string,
    tenantId: string,
  ): Promise<{ total: number; sent: number; failed: number; results: WhatsAppMessageResult[] }> {
    logger.info('Starting bulk WhatsApp send', { tenantId, recipientCount: recipients.length });

    const results: WhatsAppMessageResult[] = [];
    let sent = 0;
    let failed = 0;

    for (const to of recipients) {
      try {
        const result = await this.sendMessage(to, body, tenantId);
        results.push(result);
        if (result.status === 'sent') {
          sent++;
        } else {
          failed++;
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Bulk send failed for recipient', { to, error: errMsg });
        failed++;
        results.push({
          messageId: uuidv4(),
          to,
          status: 'failed',
          timestamp: new Date(),
          waMessageId: null,
        });
      }
    }

    logger.info('Bulk send complete', { tenantId, total: recipients.length, sent, failed });

    return { total: recipients.length, sent, failed, results };
  }

  async handleWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
    logger.info('Processing WhatsApp webhook', { object: payload.object });

    if (payload.object !== 'whatsapp_business_account') {
      logger.warn('Unknown webhook object type', { object: payload.object });
      return;
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const value = change.value;

        if (value.statuses) {
          for (const statusUpdate of value.statuses) {
            logger.info('Status update received', {
              waMessageId: statusUpdate.id,
              status: statusUpdate.status,
            });

            const existingMessage = await this.prisma.whatsappMessage.findFirst({
              where: { waMessageId: statusUpdate.id },
            });

            if (existingMessage) {
              const updateData: Record<string, unknown> = {
                status: statusUpdate.status,
              };

              if (statusUpdate.status === 'delivered') {
                updateData.deliveredAt = new Date(parseInt(statusUpdate.timestamp, 10) * 1000);
              } else if (statusUpdate.status === 'read') {
                updateData.readAt = new Date(parseInt(statusUpdate.timestamp, 10) * 1000);
              } else if (statusUpdate.status === 'failed') {
                updateData.failedReason = 'Delivery failed';
              }

              await this.prisma.whatsappMessage.update({
                where: { id: existingMessage.id },
                data: updateData,
              });
            }
          }
        }

        if (value.messages) {
          for (const incomingMsg of value.messages) {
            const contactName = value.contacts?.[0]?.profile?.name || 'Unknown';
            logger.info('Incoming message received', {
              from: incomingMsg.from,
              type: incomingMsg.type,
              contactName,
            });

            await this.prisma.whatsappIncoming.create({
              data: {
                id: uuidv4(),
                waMessageId: incomingMsg.id,
                from: incomingMsg.from,
                contactName,
                type: incomingMsg.type,
                body: incomingMsg.text?.body || '',
                phoneNumberId: value.metadata.phone_number_id,
                timestamp: new Date(parseInt(incomingMsg.timestamp, 10) * 1000),
                createdAt: new Date(),
              },
            });
          }
        }
      }
    }
  }

  async getMessageHistory(tenantId: string, page: number = 1): Promise<MessageHistoryResult> {
    const pageSize = WhatsAppIntegrationService.PAGE_SIZE;

    const [messages, total] = await Promise.all([
      this.prisma.whatsappMessage.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          to: true,
          body: true,
          type: true,
          status: true,
          waMessageId: true,
          createdAt: true,
        },
      }),
      this.prisma.whatsappMessage.count({ where: { tenantId } }),
    ]);

    return {
      messages: messages.map((m) => ({
        id: m.id,
        to: m.to,
        body: m.body,
        type: m.type,
        status: m.status,
        waMessageId: m.waMessageId,
        createdAt: m.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getDeliveryStatus(messageId: string): Promise<DeliveryStatusResult> {
    const message = await this.prisma.whatsappMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    return {
      messageId: message.id,
      status: message.status,
      deliveredAt: message.deliveredAt || null,
      readAt: message.readAt || null,
      failedReason: message.failedReason || null,
    };
  }
}
