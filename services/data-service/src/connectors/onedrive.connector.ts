/**
 * OneDrive / Microsoft Graph Connector — Rasid Platform
 * تكامل كامل مع Microsoft OneDrive عبر Graph API
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

interface GraphDriveItem {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime: string;
  webUrl: string;
  file?: { mimeType: string };
  folder?: { childCount: number };
  '@microsoft.graph.downloadUrl'?: string;
  parentReference?: { id: string };
}

export class OneDriveConnector implements IConnector {
  readonly type: ConnectorType = 'onedrive';
  readonly meta: ConnectorMeta = {
    type: 'onedrive',
    name: 'Microsoft OneDrive',
    icon: 'onedrive',
    description: 'استيراد الملفات من Microsoft OneDrive و SharePoint',
    requiredScopes: ['Files.Read', 'Files.ReadWrite', 'offline_access', 'User.Read'],
    authType: 'oauth2',
  };

  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor() {
    this.tenantId = process.env.MICROSOFT_TENANT_ID ?? 'common';
    this.clientId = process.env.MICROSOFT_CLIENT_ID ?? '';
    this.clientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? '';
    this.redirectUri = process.env.MICROSOFT_REDIRECT_URI ?? '';
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: this.meta.requiredScopes.join(' '),
      state,
      response_mode: 'query',
      prompt: 'consent',
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params}`;
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
      scope: this.meta.requiredScopes.join(' '),
    });

    const res = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }
    );

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Microsoft token exchange failed: ${error}`);
    }

    const data = await res.json() as Record<string, any>;
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string,
      expiresAt: new Date(Date.now() + (data.expires_in as number) * 1000),
      tokenType: (data.token_type as string) ?? 'Bearer',
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ConnectorToken> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: this.meta.requiredScopes.join(' '),
    });

    const res = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }
    );

    if (!res.ok) {
      throw new Error(`Microsoft token refresh failed: ${res.status}`);
    }

    const data = await res.json() as Record<string, any>;
    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in as number) * 1000),
      tokenType: (data.token_type as string) ?? 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const res = await this.graphRequest(token, '/me');
      return res.ok;
    } catch {
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const endpoint = options.folderId
      ? `/me/drive/items/${options.folderId}/children`
      : '/me/drive/root/children';

    const params = new URLSearchParams({
      $top: String(options.pageSize ?? 100),
      $orderby: 'lastModifiedDateTime desc',
      $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder,parentReference,@microsoft.graph.downloadUrl',
    });

    if (options.query) {
      // Use search endpoint for queries
      const searchEndpoint = `/me/drive/root/search(q='${encodeURIComponent(options.query)}')`;
      const res = await this.graphRequest(token, `${searchEndpoint}?${params}`);
      const data = await res.json() as Record<string, any>;

      return {
        files: ((data.value ?? []) as GraphDriveItem[]).map((item: GraphDriveItem) => this.mapDriveItem(item)),
        nextPageToken: (data['@odata.nextLink'] as string) ?? undefined,
      };
    }

    if (options.pageToken) {
      // nextLink is a full URL
      const res = await fetch(options.pageToken, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      const data = await res.json() as Record<string, any>;
      return {
        files: ((data.value ?? []) as GraphDriveItem[]).map((item: GraphDriveItem) => this.mapDriveItem(item)),
        nextPageToken: (data['@odata.nextLink'] as string) ?? undefined,
      };
    }

    const res = await this.graphRequest(token, `${endpoint}?${params}`);
    const data = await res.json() as Record<string, any>;

    return {
      files: ((data.value ?? []) as GraphDriveItem[]).map((item: GraphDriveItem) => this.mapDriveItem(item)),
      nextPageToken: (data['@odata.nextLink'] as string) ?? undefined,
    };
  }

  async downloadFile(token: ConnectorToken, fileId: string): Promise<Buffer> {
    // First get the download URL
    const infoRes = await this.graphRequest(token, `/me/drive/items/${fileId}`);
    if (!infoRes.ok) {
      throw new Error(`Failed to get file info: ${infoRes.status}`);
    }

    const info = await infoRes.json() as Record<string, any>;
    const downloadUrl = info['@microsoft.graph.downloadUrl'] as string | undefined;

    if (!downloadUrl) {
      throw new Error('لم يتم العثور على رابط التحميل');
    }

    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) {
      throw new Error(`Download failed: ${fileRes.status}`);
    }

    return Buffer.from(await fileRes.arrayBuffer());
  }

  async importData(
    token: ConnectorToken,
    fileId: string
  ): Promise<ConnectorImportResult> {
    const infoRes = await this.graphRequest(token, `/me/drive/items/${fileId}`);
    const info = await infoRes.json() as Record<string, any>;

    const buffer = await this.downloadFile(token, fileId);

    return {
      data: [],
      columns: [],
      rowCount: 0,
      sourceId: info.id as string,
      sourceName: info.name as string,
      sourceType: 'onedrive',
    };
  }

  async getSharedWithMe(token: ConnectorToken): Promise<ConnectorFile[]> {
    const res = await this.graphRequest(
      token,
      '/me/drive/sharedWithMe?$select=id,name,size,lastModifiedDateTime,webUrl,file,folder'
    );
    const data = await res.json() as Record<string, any>;
    return ((data.value ?? []) as GraphDriveItem[]).map((item: GraphDriveItem) => this.mapDriveItem(item));
  }

  async getRecentFiles(token: ConnectorToken): Promise<ConnectorFile[]> {
    const res = await this.graphRequest(
      token,
      '/me/drive/recent?$select=id,name,size,lastModifiedDateTime,webUrl,file,folder&$top=25'
    );
    const data = await res.json() as Record<string, any>;
    return ((data.value ?? []) as GraphDriveItem[]).map((item: GraphDriveItem) => this.mapDriveItem(item));
  }

  private mapDriveItem(item: GraphDriveItem): ConnectorFile {
    return {
      id: item.id,
      name: item.name,
      mimeType: item.file?.mimeType ?? 'application/vnd.ms-folder',
      size: item.size,
      modifiedAt: new Date(item.lastModifiedDateTime),
      webUrl: item.webUrl,
      downloadUrl: item['@microsoft.graph.downloadUrl'],
      isFolder: !!item.folder,
      parentId: item.parentReference?.id,
    };
  }

  private async graphRequest(
    token: ConnectorToken,
    path: string
  ): Promise<Response> {
    const url = path.startsWith('http')
      ? path
      : `https://graph.microsoft.com/v1.0${path}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (res.status === 401) {
      throw new Error('OneDrive token expired — needs refresh');
    }

    return res;
  }
}
