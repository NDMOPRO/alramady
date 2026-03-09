/**
 * Google Analytics Connector — Rasid Platform
 * تكامل مع Google Analytics Data API (GA4)
 */

import { google, analyticsdata_v1beta } from 'googleapis';
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

interface AnalyticsReport {
  propertyId: string;
  dimensions: string[];
  metrics: string[];
  dateRange: { startDate: string; endDate: string };
  rows: Record<string, unknown>[];
  rowCount: number;
  metadata: {
    propertyName: string;
    currencyCode: string;
    timeZone: string;
  };
}

export class GoogleAnalyticsConnector implements IConnector {
  readonly type: ConnectorType = 'google_analytics';
  readonly meta: ConnectorMeta = {
    type: 'google_analytics',
    name: 'Google Analytics',
    icon: 'google-analytics',
    description: 'ربط Google Analytics لاستيراد بيانات المواقع والتطبيقات',
    requiredScopes: [
      'https://www.googleapis.com/auth/analytics.readonly',
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
      throw new Error('فشل في الحصول على رمز الوصول من Google Analytics');
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
      const properties = await this.listProperties(token);
      return properties.length > 0;
    } catch {
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const properties = await this.listProperties(token);

    const files: ConnectorFile[] = properties.map((prop) => ({
      id: prop.name.replace('properties/', ''),
      name: prop.displayName || prop.name,
      mimeType: 'application/vnd.google-analytics.property',
      size: 0,
      modifiedAt: new Date(prop.updateTime || Date.now()),
      isFolder: false,
      webUrl: `https://analytics.google.com/analytics/web/#/p${prop.name.replace('properties/', '')}`,
    }));

    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Google Analytics لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    propertyId: string,
    options?: {
      dimensions?: string[];
      metrics?: string[];
      startDate?: string;
      endDate?: string;
    }
  ): Promise<ConnectorImportResult> {
    const report = await this.runReport(token, propertyId, {
      dimensions: options?.dimensions ?? ['date', 'country', 'city'],
      metrics: options?.metrics ?? ['sessions', 'activeUsers', 'screenPageViews', 'bounceRate'],
      dateRange: {
        startDate: options?.startDate ?? '30daysAgo',
        endDate: options?.endDate ?? 'today',
      },
    });

    const columns = [...report.dimensions, ...report.metrics];

    return {
      data: report.rows,
      columns,
      rowCount: report.rowCount,
      sourceId: propertyId,
      sourceName: report.metadata.propertyName,
      sourceType: 'google_analytics',
    };
  }

  async runReport(
    token: ConnectorToken,
    propertyId: string,
    config: {
      dimensions: string[];
      metrics: string[];
      dateRange: { startDate: string; endDate: string };
      limit?: number;
      offset?: number;
      orderBy?: string;
    }
  ): Promise<AnalyticsReport> {
    this.oauth2Client.setCredentials({ access_token: token.accessToken });
    const analytics = google.analyticsdata({
      version: 'v1beta',
      auth: this.oauth2Client,
    });

    const propertyPath = propertyId.startsWith('properties/')
      ? propertyId
      : `properties/${propertyId}`;

    const res = await analytics.properties.runReport({
      property: propertyPath,
      requestBody: {
        dateRanges: [
          {
            startDate: config.dateRange.startDate,
            endDate: config.dateRange.endDate,
          },
        ],
        dimensions: config.dimensions.map((d) => ({ name: d })),
        metrics: config.metrics.map((m) => ({ name: m })),
        limit: String(config.limit ?? 10000),
        offset: config.offset ? String(config.offset) : undefined,
        orderBys: config.orderBy
          ? [{ metric: { metricName: config.orderBy }, desc: true }]
          : undefined,
      },
    }) as unknown as { data: analyticsdata_v1beta.Schema$RunReportResponse };

    const dimensionHeaders =
      res.data.dimensionHeaders?.map((h: analyticsdata_v1beta.Schema$DimensionHeader) => h.name!) ?? [];
    const metricHeaders =
      res.data.metricHeaders?.map((h: analyticsdata_v1beta.Schema$MetricHeader) => h.name!) ?? [];

    const rows: Record<string, unknown>[] = (res.data.rows ?? []).map(
      (row: analyticsdata_v1beta.Schema$Row) => {
        const record: Record<string, unknown> = {};
        row.dimensionValues?.forEach((val: analyticsdata_v1beta.Schema$DimensionValue, i: number) => {
          record[dimensionHeaders[i]] = val.value;
        });
        row.metricValues?.forEach((val: analyticsdata_v1beta.Schema$MetricValue, i: number) => {
          const numVal = parseFloat(val.value ?? '0');
          record[metricHeaders[i]] = isNaN(numVal) ? val.value : numVal;
        });
        return record;
      }
    );

    // Get property metadata
    const adminApi = google.analyticsadmin({
      version: 'v1beta',
      auth: this.oauth2Client,
    });
    let propertyName = propertyId;
    let currencyCode = 'SAR';
    let timeZone = 'Asia/Riyadh';

    try {
      const propRes = await adminApi.properties.get({ name: propertyPath });
      propertyName = propRes.data.displayName ?? propertyId;
      currencyCode = propRes.data.currencyCode ?? 'SAR';
      timeZone = propRes.data.timeZone ?? 'Asia/Riyadh';
    } catch (error) {
      logger.warn('Failed to get GA4 property metadata', { propertyId, error });
    }

    return {
      propertyId,
      dimensions: dimensionHeaders,
      metrics: metricHeaders,
      dateRange: config.dateRange,
      rows,
      rowCount: rows.length,
      metadata: { propertyName, currencyCode, timeZone },
    };
  }

  async getRealtimeReport(
    token: ConnectorToken,
    propertyId: string
  ): Promise<Record<string, unknown>[]> {
    this.oauth2Client.setCredentials({ access_token: token.accessToken });
    const analytics = google.analyticsdata({
      version: 'v1beta',
      auth: this.oauth2Client,
    });

    const propertyPath = propertyId.startsWith('properties/')
      ? propertyId
      : `properties/${propertyId}`;

    const res = await analytics.properties.runRealtimeReport({
      property: propertyPath,
      requestBody: {
        dimensions: [{ name: 'country' }, { name: 'city' }],
        metrics: [{ name: 'activeUsers' }],
      },
    });

    return (res.data.rows ?? []).map((row) => ({
      country: row.dimensionValues?.[0]?.value,
      city: row.dimensionValues?.[1]?.value,
      activeUsers: parseInt(row.metricValues?.[0]?.value ?? '0', 10),
    }));
  }

  private async listProperties(
    token: ConnectorToken
  ): Promise<Array<{ name: string; displayName: string; updateTime: string }>> {
    this.oauth2Client.setCredentials({ access_token: token.accessToken });
    const admin = google.analyticsadmin({
      version: 'v1beta',
      auth: this.oauth2Client,
    });

    const accounts = await admin.accounts.list();
    const properties: Array<{ name: string; displayName: string; updateTime: string }> = [];

    for (const account of accounts.data.accounts ?? []) {
      const propsRes = await admin.properties.list({
        filter: `parent:${account.name}`,
      });
      for (const prop of propsRes.data.properties ?? []) {
        properties.push({
          name: prop.name!,
          displayName: prop.displayName ?? '',
          updateTime: prop.updateTime ?? new Date().toISOString(),
        });
      }
    }

    return properties;
  }
}
