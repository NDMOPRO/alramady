/**
 * Canva Connector — Rasid Platform
 * تكامل مع Canva REST API
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

interface CanvaDesign {
  id: string;
  title: string;
  thumbnailUrl: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export class CanvaConnector implements IConnector {
  readonly type: ConnectorType = 'canva';
  readonly meta: ConnectorMeta = {
    type: 'canva',
    name: 'Canva',
    icon: 'canva',
    description: 'استيراد التصاميم من Canva',
    requiredScopes: ['design:content:read', 'design:meta:read'],
    authType: 'api_key',
  };

  private readonly baseUrl = 'https://api.canva.com/rest/v1';

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

  async refreshAccessToken(refreshToken: string): Promise<ConnectorToken> {
    // Canva uses API keys — return existing token as-is with extended expiry
    logger.info('Canva: API key-based auth does not require token refresh');
    return {
      accessToken: refreshToken,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      tokenType: 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/users/me`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      return res.ok;
    } catch (error) {
      logger.warn('Canva connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const designs = await this.listDesigns(token);

    const files: ConnectorFile[] = designs.map((design) => ({
      id: design.id,
      name: design.title,
      mimeType: 'application/vnd.canva.design',
      size: 0,
      modifiedAt: new Date(design.updatedAt),
      webUrl: design.url,
      thumbnailUrl: design.thumbnailUrl,
      isFolder: false,
    }));

    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Canva لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    designId: string
  ): Promise<ConnectorImportResult> {
    const design = await this.getDesign(token, designId);

    return {
      data: [design],
      columns: Object.keys(design),
      rowCount: 1,
      sourceId: designId,
      sourceName: String(design.title ?? designId),
      sourceType: 'canva',
    };
  }

  async listDesigns(token: ConnectorToken): Promise<CanvaDesign[]> {
    const res = await fetch(`${this.baseUrl}/designs`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (!res.ok) throw new Error(`Canva designs list failed: ${res.status}`);

    const data = await res.json() as Record<string, any>;
    return ((data.items ?? []) as Array<Record<string, any>>).map((d) => ({
      id: String(d.id),
      title: String(d.title ?? 'Untitled'),
      thumbnailUrl: String((d.thumbnail as Record<string, string>)?.url ?? ''),
      url: String(d.url ?? ''),
      createdAt: String(d.created_at ?? ''),
      updatedAt: String(d.updated_at ?? ''),
    }));
  }

  private async getDesign(
    token: ConnectorToken,
    designId: string
  ): Promise<Record<string, any>> {
    const res = await fetch(`${this.baseUrl}/designs/${designId}`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (!res.ok) throw new Error(`Canva design fetch failed: ${res.status}`);

    return (await res.json()) as Record<string, any>;
  }
}
