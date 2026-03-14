import { governanceApi } from "./client";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    organizationId: string;
    avatar?: string;
  };
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface Role {
  id: string;
  name: string;
  nameAr: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDetails extends UserSummary {
  updatedAt: string;
  tenantId?: string;
  locale?: string;
  timezone?: string;
  preferences?: Record<string, unknown>;
  isOwner?: boolean;
}

export interface TeamSummary {
  id: string;
  name: string;
  description?: string | null;
  organizationId?: string | null;
  config?: Record<string, unknown> | null;
  status?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  systemRole?: string | null;
  teamRole?: string | null;
  joinedAt: string;
}

export interface TeamMembersResponse {
  teamId: string;
  teamName: string;
  members: TeamMember[];
  totalMembers: number;
}

export interface FeatureFlag {
  id: string;
  key: string;
  tenantId: string;
  defaultValue: boolean;
  description: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface FeatureFlagRule {
  id: string;
  flagId: string;
  conditions: {
    userIds?: string[];
    roleIds?: string[];
    percentage?: number;
  };
  resultValue: boolean;
  priority: number;
}

export interface UserUsageSummary {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string | null;
    status: string;
    lastLoginAt: string | null;
    createdAt: string;
  };
  usage: {
    datasetsCreated: number;
    dashboardsCreated: number;
    reportsCreated: number;
    presentationsCreated: number;
    projectsTotal: number;
    auditEventsTotal: number;
    teamMemberships: number;
    permissionSuggestions: number;
    filesTracked: number | null;
    lastLoginAt: string | null;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    createdAt: string;
  }>;
  availability: {
    filesTracked: boolean;
    projectsTotal: boolean;
    activity: boolean;
    usageIndicators: boolean;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/* ── Auth ───────────────────────────────────────────────────────────── */

export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  const response = await governanceApi.post<AuthResponse>("/auth/register", payload);
  return response.data;
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const response = await governanceApi.post<AuthResponse>("/auth/login", payload);
  return response.data;
}

export async function forgotPassword(payload: ForgotPasswordPayload): Promise<{ message: string }> {
  const response = await governanceApi.post<{ message: string }>("/auth/forgot-password", payload);
  return response.data;
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<{ message: string }> {
  const response = await governanceApi.post<{ message: string }>("/auth/reset-password", payload);
  return response.data;
}

export async function refreshToken(refreshTokenValue: string): Promise<AuthResponse> {
  const response = await governanceApi.post<AuthResponse>("/auth/refresh", {
    refreshToken: refreshTokenValue,
  });
  return response.data;
}

export async function getProfile(): Promise<AuthResponse["user"]> {
  const response = await governanceApi.get<AuthResponse["user"]>("/auth/profile");
  return response.data;
}

/* ── Roles ──────────────────────────────────────────────────────────── */

export async function getRoles(): Promise<Role[]> {
  const response = await governanceApi.get<Role[]>("/roles");
  return response.data;
}

export async function getRoleById(id: string): Promise<Role> {
  const response = await governanceApi.get<Role>(`/roles/${id}`);
  return response.data;
}

export async function createRole(payload: Omit<Role, "id" | "createdAt" | "updatedAt">): Promise<Role> {
  const response = await governanceApi.post<Role>("/roles", payload);
  return response.data;
}

export async function updateRole(id: string, payload: Partial<Role>): Promise<Role> {
  const response = await governanceApi.put<Role>(`/roles/${id}`, payload);
  return response.data;
}

export async function deleteRole(id: string): Promise<void> {
  await governanceApi.delete(`/roles/${id}`);
}

/* ── Audit Logs ─────────────────────────────────────────────────────── */

export async function getAuditLogs(params?: {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  resource?: string;
}): Promise<PaginatedResponse<AuditLogEntry>> {
  const response = await governanceApi.get<{
    success: boolean;
    data: Array<{
      id: string;
      userId: string;
      userName: string;
      action: string;
      entityType?: string;
      entityId?: string;
      details: Record<string, unknown>;
      ipAddress: string;
      createdAt: string;
    }>;
    pagination?: { page: number; limit: number; total: number; totalPages: number };
  }>("/audit", { params });
  const items = Array.isArray(response.data.data)
    ? response.data.data.map((entry) => ({
        id: entry.id,
        userId: entry.userId,
        userName: entry.userName,
        action: entry.action,
        resource: entry.entityType ?? "",
        resourceId: entry.entityId ?? "",
        details: entry.details ?? {},
        ipAddress: entry.ipAddress,
        createdAt: entry.createdAt,
      }))
    : [];
  const pagination = response.data.pagination;
  return {
    data: items,
    total: pagination?.total ?? items.length,
    page: pagination?.page ?? 1,
    pageSize: pagination?.limit ?? items.length,
    totalPages: pagination?.totalPages ?? 1,
  };
}

export async function getAuditTrail(resourceId: string): Promise<AuditLogEntry[]> {
  const response = await governanceApi.get<{ success: boolean; data: AuditLogEntry[] }>(`/audit/trail/${resourceId}`);
  return response.data.data ?? [];
}

export async function getUserActivity(userId: string): Promise<AuditLogEntry[]> {
  const response = await governanceApi.get<{
    success: boolean;
    data:
      | AuditLogEntry[]
      | {
          recentActions?: Array<{
            action: string;
            entityType?: string | null;
            entityId?: string | null;
            timestamp?: string;
            ipAddress?: string | null;
          }>;
        };
  }>(`/audit/user/${userId}`);
  const payload = response.data.data;
  if (Array.isArray(payload)) {
    return payload;
  }

  return Array.isArray(payload?.recentActions)
    ? payload.recentActions.map((entry, index) => ({
        id: `${userId}-${entry.action}-${entry.entityId ?? index}`,
        userId,
        userName: "",
        action: entry.action,
        resource: entry.entityType ?? "",
        resourceId: entry.entityId ?? "",
        details: {},
        ipAddress: entry.ipAddress ?? "",
        createdAt: entry.timestamp ?? new Date(0).toISOString(),
      }))
    : [];
}

export async function getUsers(params?: {
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<UserSummary>> {
  const response = await governanceApi.get<{
    success: boolean;
    data: UserSummary[];
    pagination?: { page: number; limit: number; total: number; totalPages: number };
  }>("/users", { params });
  const items = Array.isArray(response.data.data) ? response.data.data : [];
  const pagination = response.data.pagination;
  return {
    data: items,
    total: pagination?.total ?? items.length,
    page: pagination?.page ?? 1,
    pageSize: pagination?.limit ?? items.length,
    totalPages: pagination?.totalPages ?? 1,
  };
}

export async function getUserById(id: string): Promise<UserDetails> {
  const response = await governanceApi.get<{
    success: boolean;
    data: UserDetails;
  }>(`/users/${id}`);
  return response.data.data;
}

export async function updateUser(
  id: string,
  payload: Partial<Pick<UserDetails, "role" | "status" | "locale" | "timezone" | "preferences">>
): Promise<UserDetails> {
  const response = await governanceApi.patch<{
    success: boolean;
    data: UserDetails;
  }>(`/users/${id}`, payload);
  return response.data.data;
}

export async function getUserUsage(id: string): Promise<UserUsageSummary> {
  const response = await governanceApi.get<{
    success: boolean;
    data: UserUsageSummary;
  }>(`/users/${id}/usage`);
  return response.data.data;
}

export async function getTeams(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<PaginatedResponse<TeamSummary>> {
  const response = await governanceApi.get<{
    success: boolean;
    data: TeamSummary[];
    pagination?: { page: number; limit: number; total: number; totalPages: number };
  }>("/teamwork", { params });
  const items = Array.isArray(response.data.data) ? response.data.data : [];
  const pagination = response.data.pagination;
  return {
    data: items,
    total: pagination?.total ?? items.length,
    page: pagination?.page ?? 1,
    pageSize: pagination?.limit ?? items.length,
    totalPages: pagination?.totalPages ?? 1,
  };
}

export async function createTeam(payload: {
  name: string;
  description?: string;
  organizationId?: string;
  type?: "project" | "department" | "cross-functional" | "ad-hoc";
  maxMembers?: number;
}): Promise<TeamSummary> {
  const response = await governanceApi.post<{
    success: boolean;
    data: TeamSummary;
  }>("/teamwork", payload);
  return response.data.data;
}

export async function getTeamMembers(teamId: string): Promise<TeamMembersResponse> {
  const response = await governanceApi.get<{
    success: boolean;
    data: TeamMembersResponse;
  }>(`/teamwork/${teamId}/members`);
  return response.data.data;
}

export async function addTeamMember(teamId: string, userId: string, role = "member"): Promise<{
  id: string;
  teamId: string;
  userId: string;
  role: string;
  teamName: string;
  userName: string;
  addedAt: string;
}> {
  const response = await governanceApi.post<{
    success: boolean;
    data: {
      id: string;
      teamId: string;
      userId: string;
      role: string;
      teamName: string;
      userName: string;
      addedAt: string;
    };
  }>(`/teamwork/${teamId}/members`, { userId, role });
  return response.data.data;
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await governanceApi.delete(`/teamwork/${teamId}/members/${userId}`);
}

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const response = await governanceApi.get<{
    success: boolean;
    data: FeatureFlag[];
  }>("/feature-flags");
  return Array.isArray(response.data.data) ? response.data.data : [];
}

export async function createFeatureFlag(payload: {
  key: string;
  defaultValue: boolean;
  description?: string;
}): Promise<FeatureFlag> {
  const response = await governanceApi.post<{
    success: boolean;
    data: FeatureFlag;
  }>("/feature-flags", payload);
  return response.data.data;
}

export async function updateFeatureFlag(
  id: string,
  payload: Partial<Pick<FeatureFlag, "defaultValue" | "description" | "enabled">>
): Promise<FeatureFlag> {
  const response = await governanceApi.put<{
    success: boolean;
    data: FeatureFlag;
  }>(`/feature-flags/${id}`, payload);
  return response.data.data;
}

export async function addFeatureFlagRule(
  flagId: string,
  payload: {
    userIds?: string[];
    roleIds?: string[];
    percentage?: number;
    resultValue: boolean;
    priority?: number;
  }
): Promise<FeatureFlagRule> {
  const response = await governanceApi.post<{
    success: boolean;
    data: FeatureFlagRule;
  }>(`/feature-flags/${flagId}/rules`, payload);
  return response.data.data;
}

export async function evaluateFeatureFlag(flagKey: string, userId: string): Promise<{
  flagKey: string;
  userId: string;
  enabled: boolean;
}> {
  const response = await governanceApi.get<{
    success: boolean;
    data: {
      flagKey: string;
      userId: string;
      enabled: boolean;
    };
  }>("/feature-flags/evaluate", {
    params: { flagKey, userId },
  });
  return response.data.data;
}

export async function exportAuditLogs(params?: {
  format?: "csv" | "pdf";
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Blob> {
  const response = await governanceApi.get("/audit/export", {
    params,
    responseType: "blob",
  });
  return response.data;
}
