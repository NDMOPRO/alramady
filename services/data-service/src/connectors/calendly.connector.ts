/**
 * Calendly Connector — Rasid Platform
 * تكامل كامل مع Calendly API v2
 */

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

export class CalendlyConnector implements IConnector {
  readonly type: ConnectorType = 'calendly';
  readonly meta: ConnectorMeta = {
    type: 'calendly',
    name: 'Calendly',
    icon: 'calendly',
    description: 'استيراد المواعيد والمقابلات من Calendly',
    requiredScopes: [],
    authType: 'api_key',
  };

  private readonly baseUrl = 'https://api.calendly.com';

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
    throw new Error('Calendly personal tokens do not expire');
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/users/me`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      return res.ok;
    } catch (error) {
      logger.warn('Calendly connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    _token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const files: ConnectorFile[] = [
      { id: 'events', name: 'المواعيد المجدولة', mimeType: 'application/vnd.calendly.events', size: 0, modifiedAt: new Date(), isFolder: false },
    ];
    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Calendly لا يدعم تحميل الملفات مباشرة');
  }

  async importData(
    token: ConnectorToken,
    _fileId: string
  ): Promise<ConnectorImportResult> {
    const userUri = await this.getUserUri(token);
    return this.fetchEvents(token, userUri);
  }

  async fetchEvents(
    token: ConnectorToken,
    userUri: string
  ): Promise<ConnectorImportResult> {
    const allEvents: Record<string, any>[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        user: userUri,
        count: '100',
        status: 'active',
      });
      if (pageToken) params.set('page_token', pageToken);

      const res = await fetch(`${this.baseUrl}/scheduled_events?${params}`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });

      if (!res.ok) throw new Error(`Calendly events fetch failed: ${res.status}`);

      const data = await res.json() as Record<string, any>;
      const events = (data.collection ?? []) as Array<Record<string, any>>;

      for (const event of events) {
        allEvents.push({
          uri: event.uri,
          name: event.name,
          status: event.status,
          startTime: (event.start_time as string) ?? '',
          endTime: (event.end_time as string) ?? '',
          eventType: event.event_type,
          location: JSON.stringify(event.location ?? {}),
          inviteesCount: (event.invitees_counter as Record<string, number>)?.total ?? 0,
          createdAt: event.created_at,
          updatedAt: event.updated_at,
        });
      }

      const pagination = data.pagination as Record<string, string> | undefined;
      pageToken = pagination?.next_page_token;
    } while (pageToken);

    return {
      data: allEvents,
      columns: ['uri', 'name', 'status', 'startTime', 'endTime', 'eventType', 'location', 'inviteesCount', 'createdAt', 'updatedAt'],
      rowCount: allEvents.length,
      sourceId: 'events',
      sourceName: 'Calendly Events',
      sourceType: 'calendly',
    };
  }

  async fetchInvitees(
    token: ConnectorToken,
    eventUri: string
  ): Promise<ConnectorImportResult> {
    const eventUuid = eventUri.split('/').pop() ?? '';
    const allInvitees: Record<string, any>[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({ count: '100' });
      if (pageToken) params.set('page_token', pageToken);

      const res = await fetch(
        `${this.baseUrl}/scheduled_events/${eventUuid}/invitees?${params}`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );

      if (!res.ok) throw new Error(`Calendly invitees fetch failed: ${res.status}`);

      const data = await res.json() as Record<string, any>;
      const invitees = (data.collection ?? []) as Array<Record<string, any>>;

      for (const invitee of invitees) {
        allInvitees.push({
          email: invitee.email,
          name: invitee.name,
          status: invitee.status,
          createdAt: invitee.created_at,
          updatedAt: invitee.updated_at,
          timezone: invitee.timezone,
        });
      }

      const pagination = data.pagination as Record<string, string> | undefined;
      pageToken = pagination?.next_page_token;
    } while (pageToken);

    return {
      data: allInvitees,
      columns: ['email', 'name', 'status', 'createdAt', 'updatedAt', 'timezone'],
      rowCount: allInvitees.length,
      sourceId: eventUuid,
      sourceName: 'Calendly Invitees',
      sourceType: 'calendly_invitees',
    };
  }

  private async getUserUri(token: ConnectorToken): Promise<string> {
    const res = await fetch(`${this.baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (!res.ok) throw new Error(`Calendly user fetch failed: ${res.status}`);

    const data = await res.json() as Record<string, any>;
    return String((data.resource as Record<string, string>)?.uri ?? '');
  }
}
