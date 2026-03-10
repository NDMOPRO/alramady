/**
 * Google Docs Connector — Rasid Platform
 * تكامل كامل مع Google Docs API
 */

import { google } from 'googleapis';
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

export class GoogleDocsConnector implements IConnector {
  readonly type: ConnectorType = 'google_docs';
  readonly meta: ConnectorMeta = {
    type: 'google_docs',
    name: 'Google Docs',
    icon: 'google-docs',
    description: 'استيراد المستندات من Google Docs',
    requiredScopes: [
      'https://www.googleapis.com/auth/documents.readonly',
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
    return {
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
      tokenType: tokens.token_type ?? 'Bearer',
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ConnectorToken> {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    return {
      accessToken: credentials.access_token ?? '',
      refreshToken: credentials.refresh_token ?? refreshToken,
      expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600_000),
      tokenType: 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      this.setCredentials(token);
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      await drive.files.list({
        pageSize: 1,
        q: "mimeType='application/vnd.google-apps.document'",
      });
      return true;
    } catch (error) {
      logger.warn('Google Docs connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    this.setCredentials(token);
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.document'",
      pageSize: options.pageSize ?? 50,
      pageToken: options.pageToken,
      fields: 'nextPageToken, files(id, name, modifiedTime, webViewLink)',
    });

    const files: ConnectorFile[] = (response.data.files ?? []).map((f) => ({
      id: f.id ?? '',
      name: f.name ?? '',
      mimeType: 'application/vnd.google-apps.document',
      size: 0,
      modifiedAt: new Date(f.modifiedTime ?? Date.now()),
      webUrl: f.webViewLink ?? undefined,
      isFolder: false,
    }));

    return {
      files,
      nextPageToken: response.data.nextPageToken ?? undefined,
    };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Google Docs لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    documentId: string
  ): Promise<ConnectorImportResult> {
    this.setCredentials(token);
    const docs = google.docs({ version: 'v1', auth: this.oauth2Client });
    const doc = await docs.documents.get({ documentId });

    const data: Record<string, any>[] = [];
    const body = doc.data.body?.content ?? [];

    for (const element of body) {
      if (element.paragraph) {
        const text = element.paragraph.elements
          ?.map((el) => el.textRun?.content ?? '')
          .join('') ?? '';

        const style = element.paragraph.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT';

        if (text.trim()) {
          data.push({
            type: 'paragraph',
            style,
            content: text.trim(),
            startIndex: element.startIndex ?? 0,
            endIndex: element.endIndex ?? 0,
          });
        }
      } else if (element.table) {
        const tableRows: string[][] = [];
        for (const row of element.table.tableRows ?? []) {
          const cells: string[] = [];
          for (const cell of row.tableCells ?? []) {
            const cellText = cell.content
              ?.map((c) =>
                c.paragraph?.elements?.map((el) => el.textRun?.content ?? '').join('') ?? ''
              )
              .join('') ?? '';
            cells.push(cellText.trim());
          }
          tableRows.push(cells);
        }

        data.push({
          type: 'table',
          style: 'TABLE',
          content: JSON.stringify(tableRows),
          startIndex: element.startIndex ?? 0,
          endIndex: element.endIndex ?? 0,
        });
      }
    }

    // Extract inline images
    const inlineObjects = doc.data.inlineObjects ?? {};
    for (const [objectId, obj] of Object.entries(inlineObjects)) {
      const imageProperties = obj.inlineObjectProperties?.embeddedObject?.imageProperties;
      const sourceUri = imageProperties?.sourceUri ??
        obj.inlineObjectProperties?.embeddedObject?.imageProperties?.contentUri ?? '';

      data.push({
        type: 'image',
        style: 'IMAGE',
        content: sourceUri,
        startIndex: 0,
        endIndex: 0,
        objectId,
      });
    }

    return {
      data,
      columns: ['type', 'style', 'content', 'startIndex', 'endIndex'],
      rowCount: data.length,
      sourceId: documentId,
      sourceName: doc.data.title ?? documentId,
      sourceType: 'google_docs',
    };
  }

  private setCredentials(token: ConnectorToken): void {
    this.oauth2Client.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
    });
  }
}
