/**
 * Gmail Connector — Rasid Platform
 * تكامل مع Gmail API لاستيراد رسائل البريد والمرفقات
 */

import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
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

interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  body: string;
  snippet: string;
  labels: string[];
  attachments: EmailAttachment[];
  isRead: boolean;
}

interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export class GmailConnector implements IConnector {
  readonly type: ConnectorType = 'gmail';
  readonly meta: ConnectorMeta = {
    type: 'gmail',
    name: 'Gmail',
    icon: 'gmail',
    description: 'استيراد رسائل البريد الإلكتروني والمرفقات من Gmail',
    requiredScopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
    authType: 'oauth2',
  };

  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  getAuthUrl(state: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.meta.requiredScopes,
      prompt: 'consent',
      state,
    });
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    const { tokens } = await this.oauth2Client.getToken(code);
    if (!tokens.access_token) {
      throw new Error('فشل في الحصول على رمز الوصول من Gmail');
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
      tokenType: tokens.token_type ?? 'Bearer',
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ConnectorToken> {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    return {
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token ?? refreshToken,
      expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600_000),
      tokenType: credentials.token_type ?? 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const gmail = this.getGmailClient(token);
      await gmail.users.getProfile({ userId: 'me' });
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const gmail = this.getGmailClient(token);

    const query = options.query ?? 'has:attachment';
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: options.pageSize ?? 50,
      pageToken: options.pageToken,
    });

    const messages = res.data.messages ?? [];
    const files: ConnectorFile[] = [];

    // Fetch message details in batches of 10
    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const details = await Promise.all(
        batch.map((m) =>
          gmail.users.messages
            .get({ userId: 'me', id: m.id!, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] })
            .catch(() => null)
        )
      );

      for (const detail of details) {
        if (!detail?.data) continue;
        const headers = detail.data.payload?.headers ?? [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

        files.push({
          id: detail.data.id!,
          name: getHeader('Subject') || '(بدون عنوان)',
          mimeType: 'message/rfc822',
          size: Number(detail.data.sizeEstimate ?? 0),
          modifiedAt: new Date(getHeader('Date') || Date.now()),
          isFolder: false,
        });
      }
    }

    return {
      files,
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  }

  async downloadFile(token: ConnectorToken, messageId: string): Promise<Buffer> {
    const gmail = this.getGmailClient(token);
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'raw',
    });

    if (!res.data.raw) {
      throw new Error('فشل في تحميل الرسالة');
    }

    return Buffer.from(res.data.raw, 'base64');
  }

  async importData(
    token: ConnectorToken,
    messageIdOrQuery: string
  ): Promise<ConnectorImportResult> {
    const gmail = this.getGmailClient(token);

    // If it looks like a query, search for messages
    const isQuery = messageIdOrQuery.includes(':') || messageIdOrQuery.includes(' ');
    let messageIds: string[];

    if (isQuery) {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: messageIdOrQuery,
        maxResults: 100,
      });
      messageIds = (listRes.data.messages ?? []).map((m) => m.id!);
    } else {
      messageIds = [messageIdOrQuery];
    }

    const messages: EmailMessage[] = [];
    for (const msgId of messageIds) {
      const msg = await this.getFullMessage(gmail, msgId);
      if (msg) messages.push(msg);
    }

    const data = messages.map((m) => ({
      id: m.id,
      subject: m.subject,
      from: m.from,
      to: m.to,
      date: m.date.toISOString(),
      body: m.body.substring(0, 5000),
      snippet: m.snippet,
      labels: m.labels.join(', '),
      attachmentCount: m.attachments.length,
      attachments: m.attachments.map((a) => a.filename).join(', '),
      isRead: m.isRead,
    }));

    const columns = data.length > 0 ? Object.keys(data[0]) : [];

    return {
      data,
      columns,
      rowCount: data.length,
      sourceId: messageIdOrQuery,
      sourceName: `Gmail: ${messageIdOrQuery}`,
      sourceType: 'gmail',
    };
  }

  async downloadAttachment(
    token: ConnectorToken,
    messageId: string,
    attachmentId: string
  ): Promise<Buffer> {
    const gmail = this.getGmailClient(token);
    const res = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    if (!res.data.data) {
      throw new Error('فشل في تحميل المرفق');
    }

    return Buffer.from(res.data.data, 'base64');
  }

  async getAttachments(
    token: ConnectorToken,
    messageId: string
  ): Promise<EmailAttachment[]> {
    const gmail = this.getGmailClient(token);
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    return this.extractAttachments(res.data.payload);
  }

  private async getFullMessage(
    gmail: gmail_v1.Gmail,
    messageId: string
  ): Promise<EmailMessage | null> {
    try {
      const res = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const msg = res.data;
      const headers = msg.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

      return {
        id: msg.id!,
        threadId: msg.threadId!,
        subject: getHeader('Subject'),
        from: getHeader('From'),
        to: getHeader('To'),
        date: new Date(getHeader('Date') || Number(msg.internalDate)),
        body: this.extractBody(msg.payload),
        snippet: msg.snippet ?? '',
        labels: msg.labelIds ?? [],
        attachments: this.extractAttachments(msg.payload),
        isRead: !(msg.labelIds ?? []).includes('UNREAD'),
      };
    } catch (error) {
      logger.error('Failed to fetch Gmail message', { messageId, error });
      return null;
    }
  }

  private extractBody(payload?: gmail_v1.Schema$MessagePart): string {
    if (!payload) return '';

    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    if (payload.mimeType === 'text/html' && payload.body?.data) {
      const html = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      // Strip HTML tags for plain text extraction
      return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (payload.parts) {
      // Prefer plain text over HTML
      const plainPart = payload.parts.find((p) => p.mimeType === 'text/plain');
      if (plainPart) return this.extractBody(plainPart);

      const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
      if (htmlPart) return this.extractBody(htmlPart);

      // Recursively check nested parts
      for (const part of payload.parts) {
        const body = this.extractBody(part);
        if (body) return body;
      }
    }

    return '';
  }

  private extractAttachments(payload?: gmail_v1.Schema$MessagePart): EmailAttachment[] {
    if (!payload) return [];
    const attachments: EmailAttachment[] = [];

    if (payload.filename && payload.body?.attachmentId) {
      attachments.push({
        id: payload.body.attachmentId,
        filename: payload.filename,
        mimeType: payload.mimeType ?? 'application/octet-stream',
        size: payload.body.size ?? 0,
      });
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        attachments.push(...this.extractAttachments(part));
      }
    }

    return attachments;
  }

  private getGmailClient(token: ConnectorToken): gmail_v1.Gmail {
    this.oauth2Client.setCredentials({ access_token: token.accessToken });
    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }
}
