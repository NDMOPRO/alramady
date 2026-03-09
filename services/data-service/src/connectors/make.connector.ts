/**
 * Make.com Connector — Rasid Platform
 * تكامل مع Make.com (Integromat) webhooks
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

export class MakeConnector implements IConnector {
  readonly type: ConnectorType = 'make';
  readonly meta: ConnectorMeta = {
    type: 'make',
    name: 'Make.com',
    icon: 'make',
    description: 'ربط المنصة مع Make.com scenarios',
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
    throw new Error('Make.com webhooks do not use refresh tokens');
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
      logger.warn('Make.com connection test failed', { error });
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
    throw new Error('Make.com لا يدعم تحميل الملفات');
  }

  async importData(
    _token: ConnectorToken,
    _fileId: string
  ): Promise<ConnectorImportResult> {
    throw new Error('Make.com uses webhook-based data flow — use receiveFromScenario instead');
  }

  async sendToScenario(
    webhookUrl: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
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
      throw new Error(`Make.com webhook failed: ${res.status}`);
    }

    const responseData = await res.json().catch(() => ({}));
    logger.info('Data sent to Make.com scenario successfully');
    return responseData as Record<string, unknown>;
  }

  receiveFromScenario(
    payload: Record<string, unknown>
  ): ConnectorImportResult {
    const columns = Object.keys(payload);
    return {
      data: [payload],
      columns,
      rowCount: 1,
      sourceId: 'make_webhook',
      sourceName: 'Make.com Incoming Data',
      sourceType: 'make',
    };
  }
}
