/**
 * Dropbox Connector — Rasid Platform
 * تكامل كامل مع Dropbox API v2
 */

import { Dropbox } from 'dropbox';
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

export class DropboxConnector implements IConnector {
  readonly type: ConnectorType = 'dropbox';
  readonly meta: ConnectorMeta = {
    type: 'dropbox',
    name: 'Dropbox',
    icon: 'dropbox',
    description: 'استيراد الملفات من Dropbox',
    requiredScopes: ['files.metadata.read', 'files.content.read'],
    authType: 'api_key',
  };

  private createClient(token: ConnectorToken): Dropbox {
    return new Dropbox({ accessToken: token.accessToken });
  }

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
    throw new Error('Dropbox access tokens managed externally');
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const dbx = this.createClient(token);
      await dbx.usersGetCurrentAccount();
      return true;
    } catch (error) {
      logger.warn('Dropbox connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const dbx = this.createClient(token);
    const path = options.folderId ?? '';

    let response;
    if (options.pageToken) {
      response = await dbx.filesListFolderContinue({ cursor: options.pageToken });
    } else {
      response = await dbx.filesListFolder({
        path,
        limit: options.pageSize ?? 100,
        recursive: false,
      });
    }

    const files: ConnectorFile[] = response.result.entries.map((entry) => ({
      id: entry.path_lower ?? entry.name,
      name: entry.name,
      mimeType: entry['.tag'] === 'folder' ? 'application/vnd.dropbox.folder' : this.guessMimeType(entry.name),
      size: 'size' in entry ? (entry.size as number) : 0,
      modifiedAt: 'server_modified' in entry ? new Date(entry.server_modified as string) : new Date(),
      isFolder: entry['.tag'] === 'folder',
    }));

    return {
      files,
      nextPageToken: response.result.has_more ? response.result.cursor : undefined,
    };
  }

  async downloadFile(token: ConnectorToken, path: string): Promise<Buffer> {
    const dbx = this.createClient(token);
    const response = await dbx.filesDownload({ path });
    const fileBlob = (response.result as unknown as Record<string, any>).fileBinary as Buffer;
    return Buffer.from(fileBlob);
  }

  async importData(
    token: ConnectorToken,
    filePath: string
  ): Promise<ConnectorImportResult> {
    const buffer = await this.downloadFile(token, filePath);

    return {
      data: [{ filePath, size: buffer.length, content: buffer.toString('utf-8').slice(0, 10000) }],
      columns: ['filePath', 'size', 'content'],
      rowCount: 1,
      sourceId: filePath,
      sourceName: filePath.split('/').pop() ?? filePath,
      sourceType: 'dropbox',
    };
  }

  private guessMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      csv: 'text/csv',
      json: 'application/json',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      txt: 'text/plain',
    };
    return mimeMap[ext] ?? 'application/octet-stream';
  }
}
