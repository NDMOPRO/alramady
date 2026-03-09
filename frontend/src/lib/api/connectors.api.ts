import { api } from '@/lib/api';

// --- Interfaces ---

export interface ConnectorInfo {
  type: string;
  name: string;
  authType: 'oauth2' | 'api_key';
}

export interface Connection {
  id: string;
  type: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface AuthUrlResponse {
  authUrl: string;
}

export interface FetchParams {
  resource: string;
  params?: Record<string, unknown>;
}

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

interface ApiOk {
  success: boolean;
}

// --- API ---

export const connectorsApi = {
  listTypes: () =>
    api.get<ApiSuccess<ConnectorInfo[]>>('/api/v1/connectors/types'),

  listConnections: () =>
    api.get<ApiSuccess<Connection[]>>('/api/v1/connectors/connections'),

  getAuthUrl: (type: string) =>
    api.get<ApiSuccess<AuthUrlResponse>>(`/api/v1/connectors/auth/${type}`),

  connect: (type: string, credentials: Record<string, string>) =>
    api.post<ApiSuccess<Connection>>('/api/v1/connectors/connect', { type, credentials }),

  disconnect: (connectionId: string) =>
    api.del<ApiOk>(`/api/v1/connectors/${connectionId}`),

  fetch: (connectionId: string, resource: string, params?: Record<string, unknown>) =>
    api.post<ApiSuccess<unknown>>(`/api/v1/connectors/${connectionId}/fetch`, { resource, params }),

  sync: (connectionId: string) =>
    api.post<ApiOk>(`/api/v1/connectors/${connectionId}/sync`, {}),
};
