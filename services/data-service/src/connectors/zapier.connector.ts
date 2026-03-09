/**
 * Zapier Connector — Rasid Platform
 * تكامل مع Zapier webhooks
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

export class ZapierConnector implements IConnector {
  readonly type: ConnectorType = 'zapier';
  readonly meta: ConnectorMeta = {
    type: 'zapier',
    name: 'Zapier',
    icon: 'zapier',
    description: 'ربط المنصة مع آلاف التطبيقات عبر Zapier',
    requiredScopes: [],
    authType: 'api_key',
  };

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
    throw new Error('Zapier webhooks do not use refresh tokens');
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const webhookUrl = token.accessToken;
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, source: 'rasid', timestamp: new Date().toISOString() }),
      });
      return res.ok;
    } catch (error) {
      logger.warn('Zapier connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    _token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    return { files: [] };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Zapier لا يدعم تحميل الملفات');
  }

  async importData(
    _token: ConnectorToken,
    _fileId: string
  ): Promise<ConnectorImportResult> {
    throw new Error('Zapier uses webhook-based data flow — use receiveFromZap instead');
  }

  async sendToZap(
    webhookUrl: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        source: 'rasid',
        timestamp: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      throw new Error(`Zapier webhook failed: ${res.status}`);
    }

    logger.info('Data sent to Zapier webhook successfully');
  }

  receiveFromZap(
    payload: Record<string, unknown>
  ): ConnectorImportResult {
    const columns = Object.keys(payload);
    return {
      data: [payload],
      columns,
      rowCount: 1,
      sourceId: 'zapier_webhook',
      sourceName: 'Zapier Incoming Data',
      sourceType: 'zapier',
    };
  }
}
