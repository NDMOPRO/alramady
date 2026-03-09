/**
 * Microsoft 365 Integration Service — Rasid Platform
 * تكامل مع Microsoft 365 (SharePoint, OneDrive, Excel Online, Word Online)
 */

import { PrismaClient } from '@prisma/client';

interface M365Config {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
}

interface M365Token {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

interface SharePointSite {
  id: string;
  name: string;
  webUrl: string;
  description: string;
}

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  webUrl: string;
  lastModified: string;
  downloadUrl?: string;
}

interface ExcelWorkbook {
  id: string;
  name: string;
  sheets: Array<{ id: string; name: string; position: number }>;
}

export class Microsoft365IntegrationService {
  private config: M365Config;
  private graphBaseUrl = 'https://graph.microsoft.com/v1.0';

  constructor(private prisma: PrismaClient) {
    this.config = {
      clientId: process.env.AZURE_CLIENT_ID ?? '',
      clientSecret: process.env.AZURE_CLIENT_SECRET ?? '',
      tenantId: process.env.AZURE_TENANT_ID ?? '',
      redirectUri: process.env.AZURE_REDIRECT_URI ?? '',
    };
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: [
        'openid', 'profile', 'email', 'offline_access',
        'Files.ReadWrite.All', 'Sites.ReadWrite.All',
        'User.Read', 'Calendars.ReadWrite',
      ].join(' '),
      state,
      response_mode: 'query',
    });
    return `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/authorize?${params}`;
  }

  async exchangeCode(code: string, rasidUserId: string): Promise<M365Token> {
    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const token: M365Token = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };

    await this.prisma.externalIntegration.upsert({
      where: { userId_provider: { userId: rasidUserId, provider: 'microsoft365' } },
      create: {
        userId: rasidUserId,
        provider: 'microsoft365',
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        createdAt: new Date(),
      },
      update: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        updatedAt: new Date(),
      },
    });

    return token;
  }

  async refreshToken(rasidUserId: string): Promise<M365Token> {
    const integration = await this.prisma.externalIntegration.findUnique({
      where: { userId_provider: { userId: rasidUserId, provider: 'microsoft365' } },
    });

    if (!integration?.refreshToken) {
      throw new Error('No Microsoft 365 integration found. Please re-authenticate.');
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: integration.refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed. Please re-authenticate.');
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const token: M365Token = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };

    await this.prisma.externalIntegration.update({
      where: { userId_provider: { userId: rasidUserId, provider: 'microsoft365' } },
      data: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        updatedAt: new Date(),
      },
    });

    return token;
  }

  private async getAccessToken(rasidUserId: string): Promise<string> {
    const integration = await this.prisma.externalIntegration.findUnique({
      where: { userId_provider: { userId: rasidUserId, provider: 'microsoft365' } },
    });

    if (!integration) {
      throw new Error('No Microsoft 365 integration found');
    }

    if (integration.expiresAt && new Date() >= integration.expiresAt) {
      const refreshed = await this.refreshToken(rasidUserId);
      return refreshed.accessToken;
    }

    return integration.accessToken || '';
  }

  private async graphRequest<T>(
    userId: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const accessToken = await this.getAccessToken(userId);
    const url = endpoint.startsWith('http') ? endpoint : `${this.graphBaseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Graph API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  // ─── SharePoint ─────────────────────────────────────────────────────────────

  async listSharePointSites(userId: string, search?: string): Promise<SharePointSite[]> {
    const endpoint = search
      ? `/sites?search=${encodeURIComponent(search)}`
      : '/sites?search=*';

    const data = await this.graphRequest<{
      value: Array<{ id: string; displayName: string; webUrl: string; description: string }>;
    }>(userId, endpoint);

    return data.value.map(site => ({
      id: site.id,
      name: site.displayName,
      webUrl: site.webUrl,
      description: site.description ?? '',
    }));
  }

  async listSiteFiles(userId: string, siteId: string, folderId?: string): Promise<DriveItem[]> {
    const path = folderId
      ? `/sites/${siteId}/drive/items/${folderId}/children`
      : `/sites/${siteId}/drive/root/children`;

    const data = await this.graphRequest<{
      value: Array<{
        id: string;
        name: string;
        file?: { mimeType: string };
        size: number;
        webUrl: string;
        lastModifiedDateTime: string;
        '@microsoft.graph.downloadUrl'?: string;
      }>;
    }>(userId, path);

    return data.value.map(item => ({
      id: item.id,
      name: item.name,
      mimeType: item.file?.mimeType ?? 'folder',
      size: item.size,
      webUrl: item.webUrl,
      lastModified: item.lastModifiedDateTime,
      downloadUrl: item['@microsoft.graph.downloadUrl'],
    }));
  }

  // ─── OneDrive ───────────────────────────────────────────────────────────────

  async listOneDriveFiles(userId: string, folderId?: string): Promise<DriveItem[]> {
    const path = folderId
      ? `/me/drive/items/${folderId}/children`
      : '/me/drive/root/children';

    const data = await this.graphRequest<{
      value: Array<{
        id: string;
        name: string;
        file?: { mimeType: string };
        size: number;
        webUrl: string;
        lastModifiedDateTime: string;
        '@microsoft.graph.downloadUrl'?: string;
      }>;
    }>(userId, path);

    return data.value.map(item => ({
      id: item.id,
      name: item.name,
      mimeType: item.file?.mimeType ?? 'folder',
      size: item.size,
      webUrl: item.webUrl,
      lastModified: item.lastModifiedDateTime,
      downloadUrl: item['@microsoft.graph.downloadUrl'],
    }));
  }

  async downloadFile(userId: string, itemId: string): Promise<Buffer> {
    const accessToken = await this.getAccessToken(userId);
    const url = `${this.graphBaseUrl}/me/drive/items/${itemId}/content`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async uploadFile(
    userId: string,
    fileName: string,
    content: Buffer,
    folderId?: string
  ): Promise<DriveItem> {
    const path = folderId
      ? `/me/drive/items/${folderId}:/${encodeURIComponent(fileName)}:/content`
      : `/me/drive/root:/${encodeURIComponent(fileName)}:/content`;

    const accessToken = await this.getAccessToken(userId);
    const url = `${this.graphBaseUrl}${path}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: content,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${errorText}`);
    }

    const item = await response.json() as {
      id: string;
      name: string;
      file?: { mimeType: string };
      size: number;
      webUrl: string;
      lastModifiedDateTime: string;
    };

    return {
      id: item.id,
      name: item.name,
      mimeType: item.file?.mimeType ?? 'application/octet-stream',
      size: item.size,
      webUrl: item.webUrl,
      lastModified: item.lastModifiedDateTime,
    };
  }

  // ─── Excel Online ───────────────────────────────────────────────────────────

  async getExcelWorkbook(userId: string, itemId: string): Promise<ExcelWorkbook> {
    const data = await this.graphRequest<{
      id: string;
      name: string;
    }>(userId, `/me/drive/items/${itemId}`);

    const sheetsData = await this.graphRequest<{
      value: Array<{ id: string; name: string; position: number }>;
    }>(userId, `/me/drive/items/${itemId}/workbook/worksheets`);

    return {
      id: data.id,
      name: data.name,
      sheets: sheetsData.value.map(s => ({
        id: s.id,
        name: s.name,
        position: s.position,
      })),
    };
  }

  async readExcelRange(
    userId: string,
    itemId: string,
    sheetName: string,
    range: string
  ): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
    const encodedSheet = encodeURIComponent(sheetName);
    const data = await this.graphRequest<{
      values: unknown[][];
    }>(userId, `/me/drive/items/${itemId}/workbook/worksheets('${encodedSheet}')/range(address='${range}')`);

    if (!data.values || data.values.length === 0) {
      return { columns: [], rows: [] };
    }

    const headers = data.values[0].map(h => String(h ?? ''));
    const rows = data.values.slice(1).map(row => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        record[header] = row[idx] ?? null;
      });
      return record;
    });

    return { columns: headers, rows };
  }

  async writeExcelRange(
    userId: string,
    itemId: string,
    sheetName: string,
    range: string,
    values: unknown[][]
  ): Promise<void> {
    const encodedSheet = encodeURIComponent(sheetName);
    await this.graphRequest(
      userId,
      `/me/drive/items/${itemId}/workbook/worksheets('${encodedSheet}')/range(address='${range}')`,
      {
        method: 'PATCH',
        body: JSON.stringify({ values }),
      }
    );
  }

  // ─── Word Online ────────────────────────────────────────────────────────────

  async getWordDocumentContent(userId: string, itemId: string): Promise<Buffer> {
    const accessToken = await this.getAccessToken(userId);
    const url = `${this.graphBaseUrl}/me/drive/items/${itemId}/content?format=pdf`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Word export failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ─── Sync Management ───────────────────────────────────────────────────────

  async syncFromOneDrive(
    userId: string,
    rasidTenantId: string,
    folderId?: string
  ): Promise<{ synced: number; errors: string[] }> {
    const files = await this.listOneDriveFiles(userId, folderId);
    let synced = 0;
    const errors: string[] = [];

    const supportedTypes = new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/pdf',
      'text/csv',
      'application/json',
    ]);

    for (const file of files) {
      if (file.mimeType === 'folder') continue;
      if (!supportedTypes.has(file.mimeType)) continue;

      try {
        const buffer = await this.downloadFile(userId, file.id);

        await this.prisma.syncedFile.upsert({
          where: {
            tenantId_externalId: {
              tenantId: rasidTenantId,
              externalId: file.id,
            },
          },
          create: {
            tenantId: rasidTenantId,
            externalId: file.id,
            provider: 'microsoft365',
            filename: file.name,
            mimeType: file.mimeType,
            fileSize: buffer.length,
            lastSyncedAt: new Date(),
            createdAt: new Date(),
          },
          update: {
            filename: file.name,
            fileSize: buffer.length,
            lastSyncedAt: new Date(),
          },
        });

        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to sync ${file.name}: ${msg}`);
      }
    }

    return { synced, errors };
  }

  async disconnect(userId: string): Promise<void> {
    await this.prisma.externalIntegration.deleteMany({
      where: { userId, provider: 'microsoft365' },
    });
  }
}
