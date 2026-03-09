/**
 * Google Sheets Connector — Rasid Platform
 * تكامل مباشر مع Google Sheets API v4
 */

import { google, sheets_v4 } from 'googleapis';
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

export class GoogleSheetsConnector implements IConnector {
  readonly type: ConnectorType = 'google_sheets';
  readonly meta: ConnectorMeta = {
    type: 'google_sheets',
    name: 'Google Sheets',
    icon: 'google-sheets',
    description: 'ربط مباشر مع Google Sheets لاستيراد البيانات',
    requiredScopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
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
      throw new Error('فشل في الحصول على رمز الوصول');
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
      const drive = this.getDriveClient(token);
      await drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        pageSize: 1,
        fields: 'files(id)',
      });
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const drive = this.getDriveClient(token);

    const queryParts: string[] = [
      "mimeType='application/vnd.google-apps.spreadsheet'",
      'trashed=false',
    ];
    if (options.folderId) {
      queryParts.push(`'${options.folderId}' in parents`);
    }
    if (options.query) {
      queryParts.push(`name contains '${options.query.replace(/'/g, "\\'")}'`);
    }

    const res = await drive.files.list({
      q: queryParts.join(' and '),
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)',
      pageSize: options.pageSize ?? 50,
      pageToken: options.pageToken,
      orderBy: 'modifiedTime desc',
    });

    const files: ConnectorFile[] = (res.data.files ?? []).map((f) => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!,
      size: Number(f.size ?? 0),
      modifiedAt: new Date(f.modifiedTime!),
      webUrl: f.webViewLink ?? undefined,
      isFolder: false,
    }));

    return {
      files,
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  }

  async downloadFile(token: ConnectorToken, fileId: string): Promise<Buffer> {
    const drive = this.getDriveClient(token);
    const res = await drive.files.export(
      {
        fileId,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(res.data as ArrayBuffer);
  }

  async importData(
    token: ConnectorToken,
    spreadsheetId: string,
    sheetName?: string,
    range?: string
  ): Promise<ConnectorImportResult> {
    const sheets = this.getSheetsClient(token);

    // Get spreadsheet metadata
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const title = spreadsheet.data.properties?.title ?? 'Untitled';

    // Determine the range to read
    const targetSheet = sheetName ?? spreadsheet.data.sheets?.[0]?.properties?.title ?? 'Sheet1';
    const readRange = range ?? `${targetSheet}`;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: readRange,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      return {
        data: [],
        columns: [],
        rowCount: 0,
        sourceId: spreadsheetId,
        sourceName: title,
        sourceType: 'google_sheets',
      };
    }

    // First row as headers
    const headers = rows[0].map((h: unknown, idx: number) =>
      h ? String(h) : `Column_${idx + 1}`
    );

    const data: Record<string, unknown>[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const record: Record<string, unknown> = {};
      for (let j = 0; j < headers.length; j++) {
        record[headers[j]] = row[j] ?? null;
      }
      data.push(record);
    }

    return {
      data,
      columns: headers,
      rowCount: data.length,
      sourceId: spreadsheetId,
      sourceName: title,
      sourceType: 'google_sheets',
    };
  }

  async listSheets(
    token: ConnectorToken,
    spreadsheetId: string
  ): Promise<Array<{ id: number; title: string; rowCount: number; columnCount: number }>> {
    const sheets = this.getSheetsClient(token);
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties',
    });

    return (res.data.sheets ?? []).map((s) => ({
      id: s.properties?.sheetId ?? 0,
      title: s.properties?.title ?? '',
      rowCount: s.properties?.gridProperties?.rowCount ?? 0,
      columnCount: s.properties?.gridProperties?.columnCount ?? 0,
    }));
  }

  private getDriveClient(token: ConnectorToken) {
    this.oauth2Client.setCredentials({ access_token: token.accessToken });
    return google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  private getSheetsClient(token: ConnectorToken): sheets_v4.Sheets {
    this.oauth2Client.setCredentials({ access_token: token.accessToken });
    return google.sheets({ version: 'v4', auth: this.oauth2Client });
  }
}
