/**
 * Airtable Connector — Rasid Platform
 * تكامل كامل مع Airtable API
 */

import Airtable from 'airtable';
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

export class AirtableConnector implements IConnector {
  readonly type: ConnectorType = 'airtable';
  readonly meta: ConnectorMeta = {
    type: 'airtable',
    name: 'Airtable',
    icon: 'airtable',
    description: 'استيراد البيانات من Airtable bases',
    requiredScopes: [],
    authType: 'api_key',
  };

  getAuthUrl(_state: string): string {
    return '';
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    // code format: "apiKey:baseId"
    return {
      accessToken: code,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      tokenType: 'Bearer',
    };
  }

  async refreshAccessToken(_refreshToken: string): Promise<ConnectorToken> {
    throw new Error('Airtable API keys do not expire');
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const { apiKey, baseId } = this.parseToken(token);
      const airtable = new Airtable({ apiKey });
      const base = airtable.base(baseId);
      // Try to access the base by listing one record from any table
      // Airtable doesn't have a dedicated health endpoint
      const tables = await this.fetchBaseSchema(apiKey, baseId);
      return tables.length > 0;
    } catch (error) {
      logger.warn('Airtable connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const { apiKey, baseId } = this.parseToken(token);
    const tables = await this.fetchBaseSchema(apiKey, baseId);

    const files: ConnectorFile[] = tables.map((table) => ({
      id: table.id,
      name: table.name,
      mimeType: 'application/vnd.airtable.table',
      size: 0,
      modifiedAt: new Date(),
      isFolder: false,
    }));

    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Airtable لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    tableId: string
  ): Promise<ConnectorImportResult> {
    const { apiKey, baseId } = this.parseToken(token);
    const airtable = new Airtable({ apiKey });
    const base = airtable.base(baseId);

    const allRecords: Record<string, any>[] = [];
    const columnsSet = new Set<string>();

    await new Promise<void>((resolve, reject) => {
      base(tableId)
        .select({ pageSize: 100 })
        .eachPage(
          (records, fetchNextPage) => {
            for (const record of records) {
              const row: Record<string, any> = { _id: record.id };
              for (const [key, value] of Object.entries(record.fields)) {
                columnsSet.add(key);
                row[key] = value;
              }
              allRecords.push(row);
            }
            fetchNextPage();
          },
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
    });

    return {
      data: allRecords,
      columns: ['_id', ...Array.from(columnsSet)],
      rowCount: allRecords.length,
      sourceId: tableId,
      sourceName: tableId,
      sourceType: 'airtable',
    };
  }

  private parseToken(token: ConnectorToken): { apiKey: string; baseId: string } {
    const parts = token.accessToken.split(':');
    if (parts.length < 2) {
      throw new Error('Invalid Airtable token format. Expected "apiKey:baseId"');
    }
    return { apiKey: parts[0], baseId: parts.slice(1).join(':') };
  }

  private async fetchBaseSchema(
    apiKey: string,
    baseId: string
  ): Promise<Array<{ id: string; name: string; fields: Array<{ name: string; type: string }> }>> {
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`Airtable schema fetch failed: ${res.status}`);
    }

    const data = await res.json() as Record<string, any>;
    return ((data.tables ?? []) as Array<Record<string, any>>).map((t: Record<string, any>) => ({
      id: t.id as string,
      name: t.name as string,
      fields: ((t.fields as Array<Record<string, any>>) ?? []).map((f) => ({
        name: f.name as string,
        type: f.type as string,
      })),
    }));
  }
}
