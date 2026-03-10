/**
 * Slack Connector — Rasid Platform
 * تكامل كامل مع Slack Web API
 */

import { WebClient } from '@slack/web-api';
import {
  IConnector,
  ConnectorType,
  ConnectorMeta,
  ConnectorToken,
  ConnectorFile,
  ConnectorListOptions,
  ConnectorListResult,
  ConnectorImportResult,
} from './connector.interface';
import { logger } from '../utils/logger';

interface SlackChannel {
  id: string;
  name: string;
  topic: string;
  memberCount: number;
  isPrivate: boolean;
}

export class SlackConnector implements IConnector {
  readonly type: ConnectorType = 'slack';
  readonly meta: ConnectorMeta = {
    type: 'slack',
    name: 'Slack',
    icon: 'slack',
    description: 'استيراد الرسائل والبيانات من قنوات Slack',
    requiredScopes: ['channels:read', 'channels:history', 'users:read'],
    authType: 'api_key',
  };

  private createClient(token: ConnectorToken): WebClient {
    return new WebClient(token.accessToken);
  }

  getAuthUrl(_state: string): string {
    return '';
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    return {
      accessToken: code,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      tokenType: 'Bearer',
    };
  }

  async refreshAccessToken(_refreshToken: string): Promise<ConnectorToken> {
    throw new Error('Slack bot tokens do not expire');
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const client = this.createClient(token);
      const result = await client.auth.test();
      return result.ok ?? false;
    } catch (error) {
      logger.warn('Slack connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const channels = await this.listChannels(token);

    const files: ConnectorFile[] = channels.map((channel) => ({
      id: channel.id,
      name: `#${channel.name}`,
      mimeType: 'application/vnd.slack.channel',
      size: channel.memberCount,
      modifiedAt: new Date(),
      isFolder: true,
    }));

    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Slack لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    channelId: string,
    options?: { limit?: number }
  ): Promise<ConnectorImportResult> {
    return this.fetchMessages(token, channelId, options?.limit);
  }

  async listChannels(token: ConnectorToken): Promise<SlackChannel[]> {
    const client = this.createClient(token);
    const allChannels: SlackChannel[] = [];
    let cursor: string | undefined;

    do {
      const result = await client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 200,
        cursor,
      });

      for (const channel of result.channels ?? []) {
        allChannels.push({
          id: channel.id ?? '',
          name: channel.name ?? '',
          topic: (channel.topic as Record<string, string>)?.value ?? '',
          memberCount: channel.num_members ?? 0,
          isPrivate: channel.is_private ?? false,
        });
      }

      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return allChannels;
  }

  async fetchMessages(
    token: ConnectorToken,
    channelId: string,
    limit?: number
  ): Promise<ConnectorImportResult> {
    const client = this.createClient(token);
    const allMessages: Record<string, any>[] = [];
    const maxMessages = limit ?? 500;
    let cursor: string | undefined;

    while (allMessages.length < maxMessages) {
      const result = await client.conversations.history({
        channel: channelId,
        limit: Math.min(200, maxMessages - allMessages.length),
        cursor,
      });

      for (const msg of result.messages ?? []) {
        allMessages.push({
          timestamp: msg.ts,
          user: msg.user ?? 'system',
          text: msg.text ?? '',
          type: msg.type ?? 'message',
          subtype: msg.subtype ?? '',
          threadTs: msg.thread_ts ?? null,
          replyCount: msg.reply_count ?? 0,
          date: new Date(parseFloat(msg.ts ?? '0') * 1000).toISOString(),
        });
      }

      if (!result.has_more || !result.response_metadata?.next_cursor) break;
      cursor = result.response_metadata.next_cursor;
    }

    return {
      data: allMessages,
      columns: ['timestamp', 'user', 'text', 'type', 'subtype', 'threadTs', 'replyCount', 'date'],
      rowCount: allMessages.length,
      sourceId: channelId,
      sourceName: `Slack Channel ${channelId}`,
      sourceType: 'slack',
    };
  }

  async fetchUsers(token: ConnectorToken): Promise<ConnectorImportResult> {
    const client = this.createClient(token);
    const allUsers: Record<string, any>[] = [];
    let cursor: string | undefined;

    do {
      const result = await client.users.list({ limit: 200, cursor });

      for (const user of result.members ?? []) {
        if (user.deleted || user.is_bot) continue;
        allUsers.push({
          id: user.id,
          name: user.name,
          realName: user.real_name ?? '',
          email: user.profile?.email ?? '',
          title: user.profile?.title ?? '',
          isAdmin: user.is_admin ?? false,
          timezone: user.tz ?? '',
        });
      }

      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return {
      data: allUsers,
      columns: ['id', 'name', 'realName', 'email', 'title', 'isAdmin', 'timezone'],
      rowCount: allUsers.length,
      sourceId: 'users',
      sourceName: 'Slack Users',
      sourceType: 'slack_users',
    };
  }
}
