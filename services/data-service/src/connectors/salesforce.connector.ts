/**
 * Salesforce Connector — Rasid Platform
 * تكامل كامل مع Salesforce REST API
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

interface SalesforceObject {
  name: string;
  label: string;
  labelPlural: string;
  queryable: boolean;
  createable: boolean;
  updateable: boolean;
  custom: boolean;
  keyPrefix: string;
}

interface SalesforceField {
  name: string;
  label: string;
  type: string;
  length: number;
  nillable: boolean;
  referenceTo: string[];
}

export class SalesforceConnector implements IConnector {
  readonly type: ConnectorType = 'salesforce';
  readonly meta: ConnectorMeta = {
    type: 'salesforce',
    name: 'Salesforce',
    icon: 'salesforce',
    description: 'استيراد البيانات من Salesforce CRM (Accounts, Contacts, Opportunities, Reports)',
    requiredScopes: ['api', 'refresh_token', 'offline_access'],
    authType: 'oauth2',
  };

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly loginUrl: string;

  constructor() {
    this.clientId = process.env.SALESFORCE_CLIENT_ID ?? '';
    this.clientSecret = process.env.SALESFORCE_CLIENT_SECRET ?? '';
    this.redirectUri = process.env.SALESFORCE_REDIRECT_URI ?? '';
    this.loginUrl = process.env.SALESFORCE_LOGIN_URL ?? 'https://login.salesforce.com';
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.meta.requiredScopes.join(' '),
      state,
      prompt: 'consent',
    });
    return `${this.loginUrl}/services/oauth2/authorize?${params}`;
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      code,
    });

    const res = await fetch(`${this.loginUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Salesforce token exchange failed: ${error}`);
    }

    const data = await res.json() as Record<string, any>;
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string,
      expiresAt: new Date(Date.now() + 7200_000), // Salesforce tokens typically last 2 hours
      tokenType: (data.token_type as string) ?? 'Bearer',
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ConnectorToken> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    });

    const res = await fetch(`${this.loginUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Salesforce token refresh failed: ${res.status}`);
    }

    const data = await res.json() as Record<string, any>;
    return {
      accessToken: data.access_token as string,
      refreshToken: refreshToken, // Salesforce reuses refresh token
      expiresAt: new Date(Date.now() + 7200_000),
      tokenType: (data.token_type as string) ?? 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const res = await this.sfRequest(token, '/services/data/v59.0/');
      return res.ok;
    } catch {
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    // In Salesforce context, "files" = SObjects (tables)
    const res = await this.sfRequest(
      token,
      '/services/data/v59.0/sobjects/'
    );
    const data = await res.json() as Record<string, any>;

    const objects: SalesforceObject[] = ((data.sobjects ?? []) as SalesforceObject[]).filter(
      (obj: SalesforceObject) => obj.queryable
    );

    const filtered = options.query
      ? objects.filter(
          (o) =>
            o.name.toLowerCase().includes(options.query!.toLowerCase()) ||
            o.label.toLowerCase().includes(options.query!.toLowerCase())
        )
      : objects;

    const pageSize = options.pageSize ?? 100;
    const files: ConnectorFile[] = filtered.slice(0, pageSize).map((obj) => ({
      id: obj.name,
      name: `${obj.label} (${obj.name})`,
      mimeType: 'application/vnd.salesforce.sobject',
      size: 0,
      modifiedAt: new Date(),
      isFolder: false,
    }));

    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error(
      'Salesforce لا يدعم تحميل الملفات مباشرة — استخدم importData أو queryRecords'
    );
  }

  async importData(
    token: ConnectorToken,
    objectName: string,
    options?: { fields?: string[]; where?: string; limit?: number }
  ): Promise<ConnectorImportResult> {
    // First, get the object's fields
    const descRes = await this.sfRequest(
      token,
      `/services/data/v59.0/sobjects/${objectName}/describe/`
    );
    const descData = await descRes.json() as Record<string, any>;
    const allFields: SalesforceField[] = (descData.fields ?? []) as SalesforceField[];

    // Use specified fields or default to common fields
    const fields =
      options?.fields ??
      allFields
        .filter(
          (f) =>
            !f.type.includes('address') &&
            !f.type.includes('location') &&
            f.type !== 'base64'
        )
        .slice(0, 50)
        .map((f) => f.name);

    // Build SOQL query
    const soql = this.buildQuery(objectName, fields, options?.where, options?.limit);
    const records = await this.queryRecords(token, soql);

    const data = records.map((record) => {
      const row: Record<string, any> = {};
      for (const field of fields) {
        row[field] = record[field] ?? null;
      }
      return row;
    });

    return {
      data,
      columns: fields,
      rowCount: data.length,
      sourceId: objectName,
      sourceName: (descData.label as string) ?? objectName,
      sourceType: 'salesforce',
    };
  }

  async queryRecords(
    token: ConnectorToken,
    soql: string
  ): Promise<Record<string, any>[]> {
    const allRecords: Record<string, any>[] = [];
    let nextUrl: string | null = `/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`;

    while (nextUrl) {
      const res = await this.sfRequest(token, nextUrl);
      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Salesforce query failed: ${errorBody}`);
      }

      const data = await res.json() as Record<string, any>;
      const records = ((data.records ?? []) as Record<string, any>[]).map((r: Record<string, any>) => {
        const { attributes, ...fields } = r;
        return fields;
      });

      allRecords.push(...records);

      nextUrl = data.done === false && data.nextRecordsUrl
        ? data.nextRecordsUrl as string
        : null;
    }

    return allRecords;
  }

  async describeObject(
    token: ConnectorToken,
    objectName: string
  ): Promise<{
    name: string;
    label: string;
    fields: SalesforceField[];
    recordCount: number;
  }> {
    const descRes = await this.sfRequest(
      token,
      `/services/data/v59.0/sobjects/${objectName}/describe/`
    );
    const descData = await descRes.json() as Record<string, any>;

    // Get approximate record count
    const countRes = await this.sfRequest(
      token,
      `/services/data/v59.0/query/?q=${encodeURIComponent(`SELECT COUNT() FROM ${objectName}`)}`
    );
    const countData = await countRes.json() as Record<string, any>;

    return {
      name: descData.name as string,
      label: descData.label as string,
      fields: ((descData.fields ?? []) as SalesforceField[]).map((f: SalesforceField) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        length: f.length,
        nillable: f.nillable,
        referenceTo: f.referenceTo,
      })),
      recordCount: (countData.totalSize as number) ?? 0,
    };
  }

  async getReports(
    token: ConnectorToken
  ): Promise<Array<{ id: string; name: string; folderName: string }>> {
    const soql =
      "SELECT Id, Name, FolderName FROM Report WHERE IsDeleted = false ORDER BY Name ASC LIMIT 200";
    const records = await this.queryRecords(token, soql);
    return records.map((r) => ({
      id: String(r.Id),
      name: String(r.Name),
      folderName: String(r.FolderName ?? ''),
    }));
  }

  async runReport(
    token: ConnectorToken,
    reportId: string
  ): Promise<ConnectorImportResult> {
    const res = await this.sfRequest(
      token,
      `/services/data/v59.0/analytics/reports/${reportId}`,
      { method: 'POST', body: JSON.stringify({ reportMetadata: { reportFormat: 'TABULAR' } }) }
    );

    if (!res.ok) {
      throw new Error(`Salesforce report execution failed: ${res.status}`);
    }

    const reportData = await res.json() as Record<string, any>;
    const reportMetadata = reportData.reportMetadata as Record<string, any> | undefined;
    const reportExtendedMetadata = reportData.reportExtendedMetadata as Record<string, any> | undefined;
    const columns =
      ((reportMetadata?.detailColumns ?? []) as string[]).map(
        (col: string) => {
          const detailColumnInfo = reportExtendedMetadata?.detailColumnInfo as Record<string, Record<string, string>> | undefined;
          return detailColumnInfo?.[col]?.label ?? col;
        }
      ) ?? [];

    const rows: Record<string, any>[] = [];
    const factMap = (reportData.factMap ?? {}) as Record<string, Record<string, any>>;
    for (const key of Object.keys(factMap)) {
      const section = factMap[key];
      for (const row of (section.rows ?? []) as Array<Record<string, any>>) {
        const record: Record<string, any> = {};
        (row.dataCells as Array<{ label: string; value: unknown }>).forEach((cell: { label: string; value: unknown }, idx: number) => {
          record[columns[idx] ?? `col_${idx}`] = cell.value ?? cell.label;
        });
        rows.push(record);
      }
    }

    return {
      data: rows,
      columns,
      rowCount: rows.length,
      sourceId: reportId,
      sourceName: (reportMetadata?.name as string) ?? reportId,
      sourceType: 'salesforce_report',
    };
  }

  private buildQuery(
    objectName: string,
    fields: string[],
    where?: string,
    limit?: number
  ): string {
    let soql = `SELECT ${fields.join(', ')} FROM ${objectName}`;
    if (where) soql += ` WHERE ${where}`;
    soql += ` LIMIT ${limit ?? 2000}`;
    return soql;
  }

  private async sfRequest(
    token: ConnectorToken,
    path: string,
    options?: { method?: string; body?: string }
  ): Promise<Response> {
    // Instance URL is derived from the token exchange
    const instanceUrl =
      process.env.SALESFORCE_INSTANCE_URL ?? 'https://login.salesforce.com';

    const url = path.startsWith('http') ? path : `${instanceUrl}${path}`;

    const res = await fetch(url, {
      method: options?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: options?.body,
    });

    if (res.status === 401) {
      throw new Error('Salesforce token expired — needs refresh');
    }

    return res;
  }
}
