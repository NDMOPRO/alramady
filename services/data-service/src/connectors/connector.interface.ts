/**
 * Connector Abstraction Layer — Rasid Platform
 * واجهة موحدة لجميع الموصلات الخارجية
 */

export interface ConnectorAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface ConnectorToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  tokenType: string;
}

export interface ConnectorFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedAt: Date;
  webUrl?: string;
  downloadUrl?: string;
  isFolder: boolean;
  parentId?: string;
  thumbnailUrl?: string;
}

export interface ConnectorListOptions {
  folderId?: string;
  mimeType?: string;
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface ConnectorListResult {
  files: ConnectorFile[];
  nextPageToken?: string;
  totalCount?: number;
}

export interface ConnectorImportResult {
  data: Record<string, any>[];
  columns: string[];
  rowCount: number;
  sourceId: string;
  sourceName: string;
  sourceType: string;
}

export type ConnectorType =
  | 'google_drive'
  | 'google_sheets'
  | 'google_slides'
  | 'google_docs'
  | 'google_analytics'
  | 'google_forms'
  | 'gmail'
  | 'onedrive'
  | 'salesforce'
  | 'notion'
  | 'airtable'
  | 'jira'
  | 'slack'
  | 'dropbox'
  | 'hubspot'
  | 'outlook'
  | 'teams'
  | 'zapier'
  | 'make'
  | 'youtube'
  | 'typeform'
  | 'powerbi'
  | 'canva'
  | 'figma'
  | 'miro'
  | 'calendly'
  | 'amplitude'
  | 'instagram'
  | 'spotify'
  | 'database';

export interface ConnectorMeta {
  type: ConnectorType;
  name: string;
  icon: string;
  description: string;
  requiredScopes: string[];
  authType: 'oauth2' | 'api_key' | 'service_account';
}

export interface IConnector {
  readonly type: ConnectorType;
  readonly meta: ConnectorMeta;

  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<ConnectorToken>;
  refreshAccessToken(refreshToken: string): Promise<ConnectorToken>;
  testConnection(token: ConnectorToken): Promise<boolean>;
  listFiles(token: ConnectorToken, options?: ConnectorListOptions): Promise<ConnectorListResult>;
  downloadFile(token: ConnectorToken, fileId: string): Promise<Buffer>;
  importData(token: ConnectorToken, fileId: string): Promise<ConnectorImportResult>;
}
