/**
 * Figma Connector — Rasid Platform
 * تكامل كامل مع Figma REST API
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

export class FigmaConnector implements IConnector {
  readonly type: ConnectorType = 'figma';
  readonly meta: ConnectorMeta = {
    type: 'figma',
    name: 'Figma',
    icon: 'figma',
    description: 'استيراد التصاميم والنماذج الأولية من Figma',
    requiredScopes: [],
    authType: 'api_key',
  };

  private readonly baseUrl = 'https://api.figma.com/v1';

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
    throw new Error('Figma personal access tokens do not expire');
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/me`, {
        headers: { 'X-FIGMA-TOKEN': token.accessToken },
      });
      return res.ok;
    } catch (error) {
      logger.warn('Figma connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const teamId = options.folderId;
    if (!teamId) {
      return { files: [] };
    }

    const projects = await this.listProjects(token, teamId);
    const files: ConnectorFile[] = projects.map((p) => ({
      id: String(p.id),
      name: String(p.name),
      mimeType: 'application/vnd.figma.project',
      size: 0,
      modifiedAt: new Date(),
      isFolder: true,
    }));

    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Figma لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    fileKey: string
  ): Promise<ConnectorImportResult> {
    const fileData = await this.importFile(token, fileKey);

    const data: Record<string, unknown>[] = [];
    this.flattenNodes(fileData.document as Record<string, unknown>, data);

    return {
      data,
      columns: ['id', 'name', 'type', 'x', 'y', 'width', 'height', 'characters'],
      rowCount: data.length,
      sourceId: fileKey,
      sourceName: String(fileData.name ?? fileKey),
      sourceType: 'figma',
    };
  }

  async listProjects(
    token: ConnectorToken,
    teamId: string
  ): Promise<Array<{ id: number; name: string }>> {
    const res = await fetch(`${this.baseUrl}/teams/${teamId}/projects`, {
      headers: { 'X-FIGMA-TOKEN': token.accessToken },
    });

    if (!res.ok) throw new Error(`Figma projects list failed: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    return (data.projects ?? []) as Array<{ id: number; name: string }>;
  }

  async importFile(
    token: ConnectorToken,
    fileKey: string
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/files/${fileKey}`, {
      headers: { 'X-FIGMA-TOKEN': token.accessToken },
    });

    if (!res.ok) throw new Error(`Figma file fetch failed: ${res.status}`);

    return (await res.json()) as Record<string, unknown>;
  }

  async exportImages(
    token: ConnectorToken,
    fileKey: string,
    nodeIds: string[],
    format: 'png' | 'svg' | 'pdf' = 'png'
  ): Promise<Record<string, string>> {
    const ids = nodeIds.join(',');
    const res = await fetch(
      `${this.baseUrl}/images/${fileKey}?ids=${ids}&format=${format}&scale=2`,
      { headers: { 'X-FIGMA-TOKEN': token.accessToken } }
    );

    if (!res.ok) throw new Error(`Figma image export failed: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    return (data.images ?? {}) as Record<string, string>;
  }

  private flattenNodes(
    node: Record<string, unknown>,
    result: Record<string, unknown>[],
    depth: number = 0
  ): void {
    if (depth > 10) return; // Prevent infinite recursion

    const bounds = node.absoluteBoundingBox as Record<string, number> | undefined;

    result.push({
      id: node.id ?? '',
      name: node.name ?? '',
      type: node.type ?? '',
      x: bounds?.x ?? 0,
      y: bounds?.y ?? 0,
      width: bounds?.width ?? 0,
      height: bounds?.height ?? 0,
      characters: node.characters ?? '',
    });

    const children = node.children as Array<Record<string, unknown>> | undefined;
    if (children) {
      for (const child of children) {
        this.flattenNodes(child, result, depth + 1);
      }
    }
  }
}
