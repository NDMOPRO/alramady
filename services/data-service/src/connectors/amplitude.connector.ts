/**
 * Amplitude Connector — Rasid Platform
 * تكامل كامل مع Amplitude Analytics API
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

export class AmplitudeConnector implements IConnector {
  readonly type: ConnectorType = 'amplitude';
  readonly meta: ConnectorMeta = {
    type: 'amplitude',
    name: 'Amplitude',
    icon: 'amplitude',
    description: 'استيراد بيانات التحليلات من Amplitude',
    requiredScopes: [],
    authType: 'api_key',
  };

  getAuthUrl(_state: string): string {
    return '';
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    // code format: "apiKey:secretKey"
    return {
      accessToken: code,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      tokenType: 'Basic',
    };
  }

  async refreshAccessToken(_refreshToken: string): Promise<ConnectorToken> {
    throw new Error('Amplitude API keys do not expire');
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const { apiKey, secretKey } = this.parseToken(token);
      const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const res = await fetch(
        `https://amplitude.com/api/2/events/segmentation?e={"event_type":"_active"}&start=${start}&end=${end}`,
        { headers: { Authorization: `Basic ${auth}` } }
      );
      return res.ok;
    } catch (error) {
      logger.warn('Amplitude connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    _token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const files: ConnectorFile[] = [
      { id: 'events', name: 'أحداث المستخدمين', mimeType: 'application/vnd.amplitude.events', size: 0, modifiedAt: new Date(), isFolder: false },
      { id: 'sessions', name: 'جلسات المستخدمين', mimeType: 'application/vnd.amplitude.sessions', size: 0, modifiedAt: new Date(), isFolder: false },
    ];
    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Amplitude لا يدعم تحميل الملفات مباشرة');
  }

  async importData(
    token: ConnectorToken,
    dataType: string,
    options?: { startDate?: string; endDate?: string }
  ): Promise<ConnectorImportResult> {
    const end = options?.endDate ?? new Date().toISOString().split('T')[0];
    const start = options?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    switch (dataType) {
      case 'events':
        return this.fetchEvents(token, start, end);
      case 'sessions':
        return this.fetchUserSessions(token, start, end);
      default:
        throw new Error(`Unsupported Amplitude data type: ${dataType}`);
    }
  }

  async fetchEvents(
    token: ConnectorToken,
    startDate: string,
    endDate: string
  ): Promise<ConnectorImportResult> {
    const { apiKey, secretKey } = this.parseToken(token);
    const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');

    const eventParam = encodeURIComponent(JSON.stringify({ event_type: '_active' }));
    const res = await fetch(
      `https://amplitude.com/api/2/events/segmentation?e=${eventParam}&start=${startDate}&end=${endDate}&m=uniques`,
      { headers: { Authorization: `Basic ${auth}` } }
    );

    if (!res.ok) throw new Error(`Amplitude events fetch failed: ${res.status}`);

    const data = await res.json() as Record<string, any>;
    const innerData = (data.data ?? {}) as Record<string, any>;
    const series = (innerData.series ?? []) as Array<number[]>;
    const xValues = (innerData.xValues ?? []) as string[];

    const rows: Record<string, any>[] = xValues.map((date: string, i: number) => ({
      date,
      activeUsers: series[0]?.[i] ?? 0,
    }));

    return {
      data: rows,
      columns: ['date', 'activeUsers'],
      rowCount: rows.length,
      sourceId: 'events',
      sourceName: 'Amplitude Events',
      sourceType: 'amplitude',
    };
  }

  async fetchUserSessions(
    token: ConnectorToken,
    startDate: string,
    endDate: string
  ): Promise<ConnectorImportResult> {
    const { apiKey, secretKey } = this.parseToken(token);
    const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');

    const res = await fetch(
      `https://amplitude.com/api/2/sessions/average?start=${startDate}&end=${endDate}`,
      { headers: { Authorization: `Basic ${auth}` } }
    );

    if (!res.ok) throw new Error(`Amplitude sessions fetch failed: ${res.status}`);

    const data = await res.json() as Record<string, any>;
    const innerData = (data.data ?? {}) as Record<string, any>;
    const series = (innerData.series ?? []) as Array<number[]>;
    const xValues = (innerData.xValues ?? []) as string[];

    const rows: Record<string, any>[] = xValues.map((date: string, i: number) => ({
      date,
      avgSessionLength: series[0]?.[i] ?? 0,
    }));

    return {
      data: rows,
      columns: ['date', 'avgSessionLength'],
      rowCount: rows.length,
      sourceId: 'sessions',
      sourceName: 'Amplitude Sessions',
      sourceType: 'amplitude_sessions',
    };
  }

  private parseToken(token: ConnectorToken): { apiKey: string; secretKey: string } {
    const parts = token.accessToken.split(':');
    if (parts.length < 2) {
      throw new Error('Invalid Amplitude token format. Expected "apiKey:secretKey"');
    }
    return { apiKey: parts[0], secretKey: parts[1] };
  }
}
