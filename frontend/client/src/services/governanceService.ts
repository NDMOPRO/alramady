/**
 * RASID Governance Service — إدارة المستخدمين والمصادقة والأدوار
 * متصل بـ governance-service (port 8010) عبر gateway
 */
import { apiCall } from './apiClient';

const BASE = '/api/v1/governance';

export interface LoginResponse {
  success: boolean;
  data: {
    user: {
      id: string;
      email: string;
      name: string;
      username?: string;
      displayName?: string;
      display_name_ar?: string;
      role: string;
      tenantId: string;
      isOwner?: boolean;
      phone?: string;
      avatarUrl?: string;
    };
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
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
  createdAt: string;
  updatedAt?: string;
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
  // ──── المصادقة ────
  async login(username: string, password: string): Promise<LoginResponse> {
    return apiCall<LoginResponse>(`${BASE}/auth/login`, {
      method: 'POST',
      body: { email: username, password },
    });
  },

  async register(data: { username: string; password: string; email?: string; name?: string }): Promise<{ success: boolean; data?: unknown; message?: string }> {
    return apiCall(`${BASE}/auth/register`, {
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

  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    return apiCall<LoginResponse>(`${BASE}/auth/refresh`, {
      method: 'POST',
      body: { refreshToken },
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

  // ──── إدارة المستخدمين ────
  async listUsers(page = 1, limit = 20): Promise<UsersListResponse> {
    return apiCall<UsersListResponse>(`${BASE}/users?page=${page}&limit=${limit}`);
  },

  async getUser(id: string): Promise<{ success: boolean; data: UserSummary }> {
    return apiCall(`${BASE}/users/${id}`);
  },

  async updateUser(id: string, data: Partial<{ role: string; status: string; locale: string; timezone: string }>): Promise<{ success: boolean; data: UserSummary }> {
    return apiCall(`${BASE}/users/${id}`, { method: 'PATCH', body: data });
  },

  async deleteUser(id: string): Promise<{ success: boolean }> {
    return apiCall(`${BASE}/users/${id}`, { method: 'DELETE' });
  },

  // ──── سجل التدقيق ────
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

  // ──── الأدوار ────
  async getRoles(): Promise<{ success: boolean; data: Array<{ id: string; name: string; description?: string; permissions?: unknown[] }> }> {
    return apiCall(`${BASE}/roles`);
  },

  async assignRole(userId: string, roleId: string): Promise<{ success: boolean }> {
    return apiCall(`${BASE}/roles/${roleId}/assign`, { method: 'POST', body: { userId } });
  },

  // ──── الفرق ────
  async getTeams(params?: { page?: number; limit?: number }): Promise<{ success: boolean; data: Array<{ id: string; name: string; description?: string; type?: string }> }> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    return apiCall(`${BASE}/teamwork?${query}`);
  },
};
