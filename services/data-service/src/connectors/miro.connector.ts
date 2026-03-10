/**
 * Miro Connector — Rasid Platform
 * تكامل كامل مع Miro REST API v2
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

export class MiroConnector implements IConnector {
  readonly type: ConnectorType = 'miro';
  readonly meta: ConnectorMeta = {
    type: 'miro',
    name: 'Miro',
    icon: 'miro',
    description: 'استيراد اللوحات والعناصر من Miro',
    requiredScopes: ['boards:read'],
    authType: 'api_key',
  };

  private readonly baseUrl = 'https://api.miro.com/v2';

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
    // Miro uses API keys — return existing token with extended expiry
    logger.info('Miro: API key-based auth does not require token refresh');
    return {
      accessToken: refreshToken,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      tokenType: 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/boards?limit=1`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      return res.ok;
    } catch (error) {
      logger.warn('Miro connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const boards = await this.listBoards(token);

    const files: ConnectorFile[] = boards.map((board) => ({
      id: String(board.id),
      name: String(board.name),
      mimeType: 'application/vnd.miro.board',
      size: 0,
      modifiedAt: new Date(String(board.modifiedAt ?? '')),
      webUrl: String(board.viewLink ?? ''),
      isFolder: false,
    }));

    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Miro لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    boardId: string
  ): Promise<ConnectorImportResult> {
    return this.importBoard(token, boardId);
  }

  async listBoards(
    token: ConnectorToken
  ): Promise<Array<Record<string, any>>> {
    const res = await fetch(`${this.baseUrl}/boards?limit=50`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (!res.ok) throw new Error(`Miro boards list failed: ${res.status}`);

    const data = await res.json() as Record<string, any>;
    return (data.data ?? []) as Array<Record<string, any>>;
  }

  async importBoard(
    token: ConnectorToken,
    boardId: string
  ): Promise<ConnectorImportResult> {
    const allItems: Record<string, any>[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({ limit: '50' });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(
        `${this.baseUrl}/boards/${boardId}/items?${params}`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );

      if (!res.ok) throw new Error(`Miro board items fetch failed: ${res.status}`);

      const data = await res.json() as Record<string, any>;
      const items = (data.data ?? []) as Array<Record<string, any>>;

      for (const item of items) {
        const position = item.position as Record<string, number> | undefined;
        const geometry = item.geometry as Record<string, number> | undefined;

        allItems.push({
          id: item.id,
          type: item.type,
          content: this.extractItemContent(item),
          x: position?.x ?? 0,
          y: position?.y ?? 0,
          width: geometry?.width ?? 0,
          height: geometry?.height ?? 0,
          createdAt: item.createdAt,
          modifiedAt: item.modifiedAt,
        });
      }

      cursor = (data.cursor as string | undefined) ?? undefined;
    } while (cursor);

    return {
      data: allItems,
      columns: ['id', 'type', 'content', 'x', 'y', 'width', 'height', 'createdAt', 'modifiedAt'],
      rowCount: allItems.length,
      sourceId: boardId,
      sourceName: `Miro Board ${boardId}`,
      sourceType: 'miro',
    };
  }

  private extractItemContent(item: Record<string, any>): string {
    const data = item.data as Record<string, any> | undefined;
    if (!data) return '';

    if (typeof data.content === 'string') {
      return data.content.replace(/<[^>]*>/g, '');
    }
    if (typeof data.title === 'string') return data.title;
    if (typeof data.text === 'string') return data.text;
    return '';
  }
}
