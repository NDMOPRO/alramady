/**
 * Outlook / Microsoft Exchange Connector — Rasid Platform
 * تكامل كامل مع Microsoft Graph API
 */

import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
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

export class OutlookConnector implements IConnector {
  readonly type: ConnectorType = 'outlook';
  readonly meta: ConnectorMeta = {
    type: 'outlook',
    name: 'Outlook / Microsoft Exchange',
    icon: 'outlook',
    description: 'استيراد البريد والتقويم وجهات الاتصال من Microsoft Outlook',
    requiredScopes: ['Mail.Read', 'Calendars.Read', 'Contacts.Read'],
    authType: 'oauth2',
  };

  private createGraphClient(token: ConnectorToken): GraphClient {
    return GraphClient.init({
      authProvider: (done) => done(null, token.accessToken),
    });
  }

  getAuthUrl(_state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
      response_type: 'code',
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI ?? '',
      scope: this.meta.requiredScopes.join(' '),
      response_mode: 'query',
      state: _state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    const body = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
      code,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI ?? '',
      grant_type: 'authorization_code',
      scope: this.meta.requiredScopes.join(' '),
    });

    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Microsoft token exchange failed: ${res.status}`);
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string,
      expiresAt: new Date(Date.now() + ((data.expires_in as number) ?? 3600) * 1000),
      tokenType: (data.token_type as string) ?? 'Bearer',
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ConnectorToken> {
    const body = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: this.meta.requiredScopes.join(' '),
    });

    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Microsoft token refresh failed: ${res.status}`);
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? refreshToken,
      expiresAt: new Date(Date.now() + ((data.expires_in as number) ?? 3600) * 1000),
      tokenType: (data.token_type as string) ?? 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const client = this.createGraphClient(token);
      await client.api('/me').get();
      return true;
    } catch (error) {
      logger.warn('Outlook connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    _token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const files: ConnectorFile[] = [
      { id: 'emails', name: 'البريد الإلكتروني', mimeType: 'application/vnd.outlook.emails', size: 0, modifiedAt: new Date(), isFolder: true },
      { id: 'calendar', name: 'التقويم', mimeType: 'application/vnd.outlook.calendar', size: 0, modifiedAt: new Date(), isFolder: true },
      { id: 'contacts', name: 'جهات الاتصال', mimeType: 'application/vnd.outlook.contacts', size: 0, modifiedAt: new Date(), isFolder: true },
    ];
    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Outlook لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    dataType: string,
    options?: { top?: number; folderId?: string; startDate?: string; endDate?: string }
  ): Promise<ConnectorImportResult> {
    switch (dataType) {
      case 'emails':
        return this.fetchEmails(token, options?.folderId, options?.top);
      case 'calendar':
        return this.fetchCalendarEvents(token, options?.startDate ?? '', options?.endDate ?? '');
      case 'contacts':
        return this.fetchContacts(token);
      default:
        throw new Error(`Unsupported Outlook data type: ${dataType}`);
    }
  }

  async fetchEmails(
    token: ConnectorToken,
    folderId?: string,
    top?: number
  ): Promise<ConnectorImportResult> {
    const client = this.createGraphClient(token);
    const limit = top ?? 100;
    const path = folderId
      ? `/me/mailFolders/${folderId}/messages`
      : '/me/messages';

    const response = await client
      .api(path)
      .select('subject,from,receivedDateTime,bodyPreview,importance,isRead')
      .top(limit)
      .orderby('receivedDateTime DESC')
      .get();

    const emails: Record<string, unknown>[] = (response.value ?? []).map(
      (msg: Record<string, unknown>) => ({
        subject: msg.subject,
        from: (msg.from as Record<string, Record<string, string>>)?.emailAddress?.address ?? '',
        fromName: (msg.from as Record<string, Record<string, string>>)?.emailAddress?.name ?? '',
        receivedDateTime: msg.receivedDateTime,
        bodyPreview: msg.bodyPreview,
        importance: msg.importance,
        isRead: msg.isRead,
      })
    );

    return {
      data: emails,
      columns: ['subject', 'from', 'fromName', 'receivedDateTime', 'bodyPreview', 'importance', 'isRead'],
      rowCount: emails.length,
      sourceId: folderId ?? 'inbox',
      sourceName: 'Outlook Emails',
      sourceType: 'outlook_emails',
    };
  }

  async fetchCalendarEvents(
    token: ConnectorToken,
    startDate: string,
    endDate: string
  ): Promise<ConnectorImportResult> {
    const client = this.createGraphClient(token);
    const start = startDate || new Date().toISOString();
    const end = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const response = await client
      .api('/me/events')
      .filter(`start/dateTime ge '${start}' and end/dateTime le '${end}'`)
      .select('subject,start,end,location,organizer,isAllDay,importance')
      .top(200)
      .get();

    const events: Record<string, unknown>[] = (response.value ?? []).map(
      (evt: Record<string, unknown>) => ({
        subject: evt.subject,
        startDateTime: (evt.start as Record<string, string>)?.dateTime ?? '',
        endDateTime: (evt.end as Record<string, string>)?.dateTime ?? '',
        location: (evt.location as Record<string, string>)?.displayName ?? '',
        organizer: (evt.organizer as Record<string, Record<string, string>>)?.emailAddress?.name ?? '',
        isAllDay: evt.isAllDay,
        importance: evt.importance,
      })
    );

    return {
      data: events,
      columns: ['subject', 'startDateTime', 'endDateTime', 'location', 'organizer', 'isAllDay', 'importance'],
      rowCount: events.length,
      sourceId: 'calendar',
      sourceName: 'Outlook Calendar',
      sourceType: 'outlook_calendar',
    };
  }

  async fetchContacts(token: ConnectorToken): Promise<ConnectorImportResult> {
    const client = this.createGraphClient(token);

    const response = await client
      .api('/me/contacts')
      .select('displayName,emailAddresses,businessPhones,companyName,jobTitle')
      .top(500)
      .get();

    const contacts: Record<string, unknown>[] = (response.value ?? []).map(
      (c: Record<string, unknown>) => ({
        displayName: c.displayName,
        email: ((c.emailAddresses as Array<Record<string, string>>) ?? [])[0]?.address ?? '',
        phone: ((c.businessPhones as string[]) ?? [])[0] ?? '',
        companyName: c.companyName ?? '',
        jobTitle: c.jobTitle ?? '',
      })
    );

    return {
      data: contacts,
      columns: ['displayName', 'email', 'phone', 'companyName', 'jobTitle'],
      rowCount: contacts.length,
      sourceId: 'contacts',
      sourceName: 'Outlook Contacts',
      sourceType: 'outlook_contacts',
    };
  }
}
