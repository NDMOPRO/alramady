/**
 * Google Drive Connector — Rasid Platform
 * تكامل كامل مع Google Drive API v3
 */

import { google, drive_v3 } from 'googleapis';
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

export class GoogleDriveConnector implements IConnector {
  readonly type: ConnectorType = 'google_drive';
  readonly meta: ConnectorMeta = {
    type: 'google_drive',
    name: 'Google Drive',
    icon: 'google-drive',
    description: 'استيراد الملفات مباشرة من Google Drive',
    requiredScopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
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
      throw new Error('فشل في الحصول على رمز الوصول من Google');
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
      await drive.about.get({ fields: 'user' });
      return true;
    } catch (error) {
      logger.error('Google Drive connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const drive = this.getDriveClient(token);

    const queryParts: string[] = ['trashed=false'];
    if (options.folderId) {
      queryParts.push(`'${options.folderId}' in parents`);
    }
    if (options.mimeType) {
      queryParts.push(`mimeType='${options.mimeType}'`);
    }
    if (options.query) {
      queryParts.push(`name contains '${options.query.replace(/'/g, "\\'")}'`);
    }

    const res = await drive.files.list({
      q: queryParts.join(' and '),
      fields:
        'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, thumbnailLink, parents)',
      pageSize: options.pageSize ?? 100,
      pageToken: options.pageToken,
      orderBy: 'modifiedTime desc',
    });

    const files: ConnectorFile[] = (res.data.files ?? []).map((f) =>
      this.mapDriveFile(f)
    );

    return {
      files,
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  }

  async downloadFile(token: ConnectorToken, fileId: string): Promise<Buffer> {
    const drive = this.getDriveClient(token);

    // أولاً تحقق من نوع الملف — Google native formats تحتاج تصدير
    const fileMeta = await drive.files.get({
      fileId,
      fields: 'mimeType, name, size',
    });

    const mimeType = fileMeta.data.mimeType ?? '';
    const isGoogleNative = mimeType.startsWith('application/vnd.google-apps.');

    if (isGoogleNative) {
      return this.exportGoogleFile(drive, fileId, mimeType);
    }

    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    return Buffer.from(res.data as ArrayBuffer);
  }

  async importData(
    token: ConnectorToken,
    fileId: string
  ): Promise<ConnectorImportResult> {
    const drive = this.getDriveClient(token);
    const fileMeta = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size',
    });

    const buffer = await this.downloadFile(token, fileId);

    return {
      data: [],
      columns: [],
      rowCount: 0,
      sourceId: fileMeta.data.id!,
      sourceName: fileMeta.data.name!,
      sourceType: 'google_drive',
    };
  }

  private getDriveClient(token: ConnectorToken): drive_v3.Drive {
    this.oauth2Client.setCredentials({
      access_token: token.accessToken,
    });
    return google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  private async exportGoogleFile(
    drive: drive_v3.Drive,
    fileId: string,
    mimeType: string
  ): Promise<Buffer> {
    const exportMimeMap: Record<string, string> = {
      'application/vnd.google-apps.spreadsheet':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.google-apps.document':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.google-apps.presentation':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.google-apps.drawing': 'image/png',
    };

    const exportMime = exportMimeMap[mimeType] ?? 'application/pdf';

    const res = await drive.files.export(
      { fileId, mimeType: exportMime },
      { responseType: 'arraybuffer' }
    );

    return Buffer.from(res.data as ArrayBuffer);
  }

  private mapDriveFile(f: drive_v3.Schema$File): ConnectorFile {
    return {
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!,
      size: Number(f.size ?? 0),
      modifiedAt: new Date(f.modifiedTime!),
      webUrl: f.webViewLink ?? undefined,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      parentId: f.parents?.[0],
      thumbnailUrl: f.thumbnailLink ?? undefined,
    };
  }
}
