/**
 * Power BI Connector — Rasid Platform
 * تكامل كامل مع Power BI REST API
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

interface PowerBIDataset {
  id: string;
  name: string;
  addRowsAPIEnabled: boolean;
  configuredBy: string;
  isRefreshable: boolean;
  webUrl: string;
}

export class PowerBIConnector implements IConnector {
  readonly type: ConnectorType = 'powerbi';
  readonly meta: ConnectorMeta = {
    type: 'powerbi',
    name: 'Power BI',
    icon: 'powerbi',
    description: 'استيراد البيانات من Power BI datasets',
    requiredScopes: ['Dataset.Read.All'],
    authType: 'oauth2',
  };

  private readonly baseUrl = 'https://api.powerbi.com/v1.0/myorg';

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.POWERBI_CLIENT_ID ?? '',
      response_type: 'code',
      redirect_uri: process.env.POWERBI_REDIRECT_URI ?? '',
      scope: 'https://analysis.windows.net/powerbi/api/.default',
      state,
    });
    return `https://login.microsoftonline.com/${process.env.POWERBI_TENANT_ID ?? 'common'}/oauth2/v2.0/authorize?${params}`;
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    const body = new URLSearchParams({
      client_id: process.env.POWERBI_CLIENT_ID ?? '',
      client_secret: process.env.POWERBI_CLIENT_SECRET ?? '',
      code,
      redirect_uri: process.env.POWERBI_REDIRECT_URI ?? '',
      grant_type: 'authorization_code',
      scope: 'https://analysis.windows.net/powerbi/api/.default',
    });

    const tenantId = process.env.POWERBI_TENANT_ID ?? 'common';
    const res = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }
    );

    if (!res.ok) throw new Error(`Power BI token exchange failed: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string,
      expiresAt: new Date(Date.now() + ((data.expires_in as number) ?? 3600) * 1000),
      tokenType: 'Bearer',
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ConnectorToken> {
    const body = new URLSearchParams({
      client_id: process.env.POWERBI_CLIENT_ID ?? '',
      client_secret: process.env.POWERBI_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://analysis.windows.net/powerbi/api/.default',
    });

    const tenantId = process.env.POWERBI_TENANT_ID ?? 'common';
    const res = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }
    );

    if (!res.ok) throw new Error(`Power BI token refresh failed: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? refreshToken,
      expiresAt: new Date(Date.now() + ((data.expires_in as number) ?? 3600) * 1000),
      tokenType: 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/datasets`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      return res.ok;
    } catch (error) {
      logger.warn('Power BI connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const datasets = await this.listDatasets(token);

    const files: ConnectorFile[] = datasets.map((ds) => ({
      id: ds.id,
      name: ds.name,
      mimeType: 'application/vnd.powerbi.dataset',
      size: 0,
      modifiedAt: new Date(),
      webUrl: ds.webUrl,
      isFolder: false,
    }));

    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Power BI لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    datasetId: string,
    options?: { tableName?: string }
  ): Promise<ConnectorImportResult> {
    return this.fetchDataset(token, datasetId, options?.tableName ?? 'Table1');
  }

  async listDatasets(token: ConnectorToken): Promise<PowerBIDataset[]> {
    const res = await fetch(`${this.baseUrl}/datasets`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (!res.ok) throw new Error(`Power BI datasets list failed: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    return ((data.value ?? []) as Array<Record<string, unknown>>).map((ds) => ({
      id: String(ds.id),
      name: String(ds.name),
      addRowsAPIEnabled: Boolean(ds.addRowsAPIEnabled),
      configuredBy: String(ds.configuredBy ?? ''),
      isRefreshable: Boolean(ds.isRefreshable),
      webUrl: String(ds.webUrl ?? ''),
    }));
  }

  async fetchDataset(
    token: ConnectorToken,
    datasetId: string,
    tableName: string
  ): Promise<ConnectorImportResult> {
    const res = await fetch(
      `${this.baseUrl}/datasets/${datasetId}/tables/${tableName}/rows`,
      {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      }
    );

    if (!res.ok) throw new Error(`Power BI dataset fetch failed: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    const rows = (data.value ?? []) as Array<Record<string, unknown>>;
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      data: rows,
      columns,
      rowCount: rows.length,
      sourceId: `${datasetId}/${tableName}`,
      sourceName: `Power BI: ${tableName}`,
      sourceType: 'powerbi',
    };
  }
}
