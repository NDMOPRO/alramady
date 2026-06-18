import { apiCall } from './apiClient';

const BASE = '/api/v1/governance';

export interface LoginResponse {
  success: boolean;
  data: {
    accessToken: string;
    refreshToken: string;
    user: Record<string, unknown>;
    expiresIn?: number;
  };
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  username?: string;
  displayName?: string;
  role: string;
  status: string;
  isOwner?: boolean;
  createdAt?: string;
  updatedAt?: string;
  department?: string;
  lastLogin?: string;
  joinDate?: string;
}

export interface UsersListResponse {
  success: boolean;
  data: UserSummary[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
}

export const governanceService = {
  // ⚠️ API يستقبل { username, password }
  async login(usernameOrEmail: string, password: string): Promise<LoginResponse> {
    return apiCall<LoginResponse>(`${BASE}/auth/login`, {
      method: 'POST',
      body: { username: usernameOrEmail, password },
    });
  },

  async createUser(data: { username: string; password: string; email?: string; displayName?: string; displayNameAr?: string; roleNames?: string[] }) {
    return apiCall(`${BASE}/auth/users`, { method: 'POST', body: data });
  },

  async getUser(id: string): Promise<{ success: boolean; data: UserSummary }> {
    return apiCall(`${BASE}/users/${id}`);
  },

  async listUsers(page = 1, limit = 20): Promise<UsersListResponse> {
    return apiCall<UsersListResponse>(`${BASE}/users?page=${page}&limit=${limit}`);
  },

  async updateUserStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') {
    return apiCall(`${BASE}/auth/users/${id}/status`, { method: 'PATCH', body: { status } });
  },

  async assignRole(userId: string, roleName: string) {
    return apiCall(`${BASE}/auth/users/${userId}/roles`, { method: 'POST', body: { roleName } });
  },

  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    return apiCall<LoginResponse>(`${BASE}/auth/refresh`, {
      method: 'POST',
      body: { refreshToken },
    });
  },

  // existing flows used in UI
  async register(data: { username: string; password: string; email?: string; name?: string }) {
    return apiCall<{ success: boolean; data?: unknown; message?: string }>(`${BASE}/auth/register`, {
      method: 'POST',
      body: {
        email: data.email || `${data.username}@rasid.local`,
        password: data.password,
        name: data.name || data.username,
        role: 'viewer',
        tenantId: 'default',
      },
    });
  },

  async forgotPassword(email: string): Promise<{ success: boolean }> {
    return apiCall(`${BASE}/auth/forgot-password`, {
      method: 'POST',
      body: { email },
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
    return apiCall(`${BASE}/auth/reset-password`, {
      method: 'POST',
      body: { token, newPassword },
    });
  },

  async seedOwner(): Promise<{ success: boolean; data?: { userId: string } }> {
    return apiCall(`${BASE}/auth/seed-owner`, { method: 'POST' });
  },

  async getAuditLogs(params?: { page?: number; limit?: number; action?: string }): Promise<{ success: boolean; data: AuditLogEntry[]; pagination?: unknown }> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.action) query.set('action', params.action);
    return apiCall(`${BASE}/audit?${query}`);
  },

  async exportAuditLogs(format: 'csv' | 'pdf' = 'csv'): Promise<Blob> {
    return apiCall<Blob>(`${BASE}/audit/export?format=${format}`);
  },
};
