import { PrismaClient } from '@prisma/client';
// @ts-expect-error - uuid has no type declarations in this project
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import winston from 'winston';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'governance-service', module: 'slack-integration' },
  transports: [new winston.transports.Console()],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SlackMessageResult {
  messageId: string;
  channel: string;
  slackTs: string | null;
  status: 'sent' | 'failed';
  timestamp: Date;
}

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  block_id?: string;
  elements?: Array<Record<string, unknown>>;
  fields?: Array<{ type: string; text: string }>;
  accessory?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  memberCount: number;
  topic: string;
  purpose: string;
}

export interface SlackNotification {
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high';
  actionUrl?: string;
}

export interface SlackWebhookPayload {
  type: string;
  token?: string;
  challenge?: string;
  team_id?: string;
  event?: {
    type: string;
    channel?: string;
    user?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    [key: string]: unknown;
  };
  event_id?: string;
  event_time?: number;
}

export interface SlackMessageHistoryResult {
  messages: Array<{
    id: string;
    channel: string;
    text: string;
    slackTs: string | null;
    status: string;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export interface SlackFileUploadResult {
  fileId: string;
  filename: string;
  channel: string;
  status: 'uploaded' | 'failed';
  permalink: string | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class SlackIntegrationService {
  private static readonly PAGE_SIZE = 25;
  private static readonly SLACK_API_BASE = 'https://slack.com/api';

  private readonly signingSecret: string;

  constructor(private prisma: PrismaClient & Record<string, any>) {
    this.signingSecret = process.env.SLACK_SIGNING_SECRET || '';

    if (!this.signingSecret) {
      logger.warn('SLACK_SIGNING_SECRET is not set');
    }
  }

  private async getBotToken(tenantId: string): Promise<string> {
    const config = await this.prisma.slackConfig.findFirst({
      where: { tenantId, active: true },
    });

    if (config && config.botToken) {
      return config.botToken;
    }

    const envToken = process.env.SLACK_BOT_TOKEN || '';
    if (!envToken) {
      throw new Error(`No Slack bot token configured for tenant ${tenantId}`);
    }

    return envToken;
  }

  async sendMessage(channel: string, text: string, tenantId: string): Promise<SlackMessageResult> {
    const messageId = uuidv4();
    const startTime = Date.now();
    logger.info('Sending Slack message', { messageId, channel, tenantId });

    const botToken = await this.getBotToken(tenantId);
    const url = `${SlackIntegrationService.SLACK_API_BASE}/chat.postMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text }),
    });

    const data = await response.json() as {
      ok: boolean;
      ts?: string;
      channel?: string;
      error?: string;
    };

    const durationMs = Date.now() - startTime;
    const status: 'sent' | 'failed' = data.ok ? 'sent' : 'failed';
    const slackTs = data.ts || null;

    if (!data.ok) {
      logger.error('Slack send failed', { messageId, error: data.error, durationMs });
    } else {
      logger.info('Slack message sent', { messageId, slackTs, durationMs });
    }

    await this.prisma.slackMessage.create({
      data: {
        id: messageId,
        tenantId,
        channel,
        text: text.substring(0, 40000),
        type: 'text',
        status,
        slackTs,
        failedReason: !data.ok ? (data.error || 'Unknown error') : null,
        createdAt: new Date(),
      },
    });

    return { messageId, channel, slackTs, status, timestamp: new Date() };
  }

  async sendRichMessage(
    channel: string,
    blocks: SlackBlock[],
    tenantId: string,
  ): Promise<SlackMessageResult> {
    const messageId = uuidv4();
    logger.info('Sending Slack rich message', { messageId, channel, tenantId, blockCount: blocks.length });

    const botToken = await this.getBotToken(tenantId);
    const url = `${SlackIntegrationService.SLACK_API_BASE}/chat.postMessage`;

    const fallbackText = blocks
      .filter((b) => b.type === 'section' && b.text)
      .map((b) => b.text?.text || '')
      .join('\n')
      .substring(0, 200) || 'New notification';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text: fallbackText, blocks }),
    });

    const data = await response.json() as {
      ok: boolean;
      ts?: string;
      error?: string;
    };

    const status: 'sent' | 'failed' = data.ok ? 'sent' : 'failed';
    const slackTs = data.ts || null;

    if (!data.ok) {
      logger.error('Slack rich message failed', { messageId, error: data.error });
    }

    await this.prisma.slackMessage.create({
      data: {
        id: messageId,
        tenantId,
        channel,
        text: fallbackText,
        type: 'blocks',
        blocksJson: JSON.stringify(blocks),
        status,
        slackTs,
        failedReason: !data.ok ? (data.error || 'Unknown error') : null,
        createdAt: new Date(),
      },
    });

    return { messageId, channel, slackTs, status, timestamp: new Date() };
  }

  async sendFile(
    channel: string,
    fileBuffer: Buffer,
    filename: string,
    tenantId: string,
  ): Promise<SlackFileUploadResult> {
    const fileId = uuidv4();
    logger.info('Uploading Slack file', { fileId, channel, filename, tenantId, size: fileBuffer.length });

    const botToken = await this.getBotToken(tenantId);

    const getUploadUrlResponse = await fetch(
      `${SlackIntegrationService.SLACK_API_BASE}/files.getUploadURLExternal`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          filename,
          length: fileBuffer.length.toString(),
        }),
      },
    );

    const uploadUrlData = await getUploadUrlResponse.json() as {
      ok: boolean;
      upload_url?: string;
      file_id?: string;
      error?: string;
    };

    if (!uploadUrlData.ok || !uploadUrlData.upload_url || !uploadUrlData.file_id) {
      logger.error('Failed to get upload URL', { error: uploadUrlData.error });
      return { fileId, filename, channel, status: 'failed', permalink: null };
    }

    const uploadResponse = await fetch(uploadUrlData.upload_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      logger.error('File upload failed', { status: uploadResponse.status });
      return { fileId, filename, channel, status: 'failed', permalink: null };
    }

    const completeResponse = await fetch(
      `${SlackIntegrationService.SLACK_API_BASE}/files.completeUploadExternal`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          files: [{ id: uploadUrlData.file_id, title: filename }],
          channel_id: channel,
        }),
      },
    );

    const completeData = await completeResponse.json() as {
      ok: boolean;
      files?: Array<{ id: string; permalink?: string }>;
      error?: string;
    };

    if (!completeData.ok) {
      logger.error('File upload completion failed', { error: completeData.error });
      return { fileId, filename, channel, status: 'failed', permalink: null };
    }

    const permalink = completeData.files?.[0]?.permalink || null;
    logger.info('File uploaded successfully', { fileId, permalink });

    await this.prisma.slackMessage.create({
      data: {
        id: fileId,
        tenantId,
        channel,
        text: `[File: ${filename}]`,
        type: 'file',
        status: 'sent',
        fileUrl: permalink,
        fileName: filename,
        createdAt: new Date(),
      },
    });

    return { fileId, filename, channel, status: 'uploaded', permalink };
  }

  async sendNotification(
    userId: string,
    tenantId: string,
    notification: SlackNotification,
  ): Promise<SlackMessageResult> {
    logger.info('Sending Slack notification', { userId, tenantId, title: notification.title });

    const user = await (this.prisma.user as any).findFirst({
      where: { id: userId, tenantId },
      select: { slackUserId: true, email: true, name: true },
    }) as { slackUserId?: string; email: string; name: string } | null;

    if (!user) {
      throw new Error(`User ${userId} not found in tenant ${tenantId}`);
    }

    let slackUserId = user.slackUserId;

    if (!slackUserId && user.email) {
      const botToken = await this.getBotToken(tenantId);
      const lookupResponse = await fetch(
        `${SlackIntegrationService.SLACK_API_BASE}/users.lookupByEmail?email=${encodeURIComponent(user.email)}`,
        {
          headers: { 'Authorization': `Bearer ${botToken}` },
        },
      );

      const lookupData = await lookupResponse.json() as {
        ok: boolean;
        user?: { id: string };
      };

      if (lookupData.ok && lookupData.user) {
        slackUserId = lookupData.user.id;

        await (this.prisma.user as any).update({
          where: { id: userId },
          data: { slackUserId },
        });
      }
    }

    if (!slackUserId) {
      throw new Error(`No Slack user ID found for user ${userId}`);
    }

    const botToken = await this.getBotToken(tenantId);
    const openDmResponse = await fetch(
      `${SlackIntegrationService.SLACK_API_BASE}/conversations.open`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ users: slackUserId }),
      },
    );

    const dmData = await openDmResponse.json() as {
      ok: boolean;
      channel?: { id: string };
      error?: string;
    };

    if (!dmData.ok || !dmData.channel) {
      throw new Error(`Failed to open DM channel: ${dmData.error || 'Unknown error'}`);
    }

    const priorityEmoji: Record<string, string> = {
      low: ':white_circle:',
      normal: ':large_blue_circle:',
      high: ':red_circle:',
    };

    const emoji = priorityEmoji[notification.priority] || ':bell:';
    let text = `${emoji} *${notification.title}*\n${notification.body}`;
    if (notification.actionUrl) {
      text += `\n<${notification.actionUrl}|View Details>`;
    }

    return this.sendMessage(dmData.channel.id, text, tenantId);
  }

  async listChannels(tenantId: string): Promise<SlackChannel[]> {
    logger.info('Listing Slack channels', { tenantId });

    const botToken = await this.getBotToken(tenantId);
    const channels: SlackChannel[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({
        types: 'public_channel,private_channel',
        limit: '200',
        exclude_archived: 'true',
      });
      if (cursor) {
        params.set('cursor', cursor);
      }

      const response = await fetch(
        `${SlackIntegrationService.SLACK_API_BASE}/conversations.list?${params.toString()}`,
        {
          headers: { 'Authorization': `Bearer ${botToken}` },
        },
      );

      const data = await response.json() as {
        ok: boolean;
        channels?: Array<{
          id: string;
          name: string;
          is_private: boolean;
          num_members: number;
          topic: { value: string };
          purpose: { value: string };
        }>;
        response_metadata?: { next_cursor?: string };
        error?: string;
      };

      if (!data.ok) {
        throw new Error(`Failed to list channels: ${data.error || 'Unknown error'}`);
      }

      if (data.channels) {
        for (const ch of data.channels) {
          channels.push({
            id: ch.id,
            name: ch.name,
            isPrivate: ch.is_private,
            memberCount: ch.num_members,
            topic: ch.topic.value,
            purpose: ch.purpose.value,
          });
        }
      }

      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);

    logger.info('Channels listed', { tenantId, count: channels.length });
    return channels;
  }

  async handleWebhook(payload: SlackWebhookPayload): Promise<{ challenge?: string }> {
    logger.info('Processing Slack webhook', { type: payload.type });

    if (payload.type === 'url_verification') {
      return { challenge: payload.challenge };
    }

    if (payload.type === 'event_callback' && payload.event) {
      const event = payload.event;

      await this.prisma.slackEvent.create({
        data: {
          id: payload.event_id || uuidv4(),
          teamId: payload.team_id || '',
          eventType: event.type,
          channel: event.channel || null,
          userId: event.user || null,
          text: typeof event.text === 'string' ? event.text.substring(0, 4000) : null,
          slackTs: typeof event.ts === 'string' ? event.ts : null,
          threadTs: typeof event.thread_ts === 'string' ? event.thread_ts : null,
          rawPayload: JSON.stringify(payload),
          eventTime: payload.event_time
            ? new Date(payload.event_time * 1000)
            : new Date(),
          createdAt: new Date(),
        },
      });

      logger.info('Slack event stored', {
        eventType: event.type,
        eventId: payload.event_id,
      });
    }

    return {};
  }

  verifyWebhookSignature(
    signature: string,
    timestamp: string,
    body: string,
  ): boolean {
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (parseInt(timestamp, 10) < fiveMinutesAgo) {
      logger.warn('Webhook timestamp too old', { timestamp });
      return false;
    }

    const sigBasestring = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', this.signingSecret);
    hmac.update(sigBasestring);
    const computedSignature = `v0=${hmac.digest('hex')}`;

    return crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(signature),
    );
  }

  async getMessageHistory(
    tenantId: string,
    channel: string,
    page: number = 1,
  ): Promise<SlackMessageHistoryResult> {
    const pageSize = SlackIntegrationService.PAGE_SIZE;

    const where: Record<string, unknown> = { tenantId };
    if (channel) {
      where.channel = channel;
    }

    const [messages, total] = await Promise.all([
      this.prisma.slackMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          channel: true,
          text: true,
          slackTs: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.slackMessage.count({ where }),
    ]);

    return {
      messages: messages.map((m: any) => ({
        id: m.id,
        channel: m.channel,
        text: m.text,
        slackTs: m.slackTs,
        status: m.status,
        createdAt: m.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async setupBotConnection(tenantId: string, botToken: string): Promise<{ teamId: string; teamName: string; botUserId: string }> {
    logger.info('Setting up Slack bot connection', { tenantId });

    const testResponse = await fetch(
      `${SlackIntegrationService.SLACK_API_BASE}/auth.test`,
      {
        headers: { 'Authorization': `Bearer ${botToken}` },
      },
    );

    const testData = await testResponse.json() as {
      ok: boolean;
      team_id?: string;
      team?: string;
      user_id?: string;
      bot_id?: string;
      error?: string;
    };

    if (!testData.ok) {
      throw new Error(`Invalid bot token: ${testData.error || 'Unknown error'}`);
    }

    const teamId = testData.team_id || '';
    const teamName = testData.team || '';
    const botUserId = testData.user_id || '';

    const existingConfig = await this.prisma.slackConfig.findFirst({
      where: { tenantId },
    });

    if (existingConfig) {
      await this.prisma.slackConfig.update({
        where: { id: existingConfig.id },
        data: {
          botToken,
          teamId,
          teamName,
          botUserId,
          active: true,
          updatedAt: new Date(),
        },
      });
    } else {
      await this.prisma.slackConfig.create({
        data: {
          id: uuidv4(),
          tenantId,
          botToken,
          teamId,
          teamName,
          botUserId,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    logger.info('Slack bot connection configured', { tenantId, teamId, teamName });

    return { teamId, teamName, botUserId };
  }
}
