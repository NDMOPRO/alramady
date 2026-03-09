import { api } from '@/lib/api';

// --- Interfaces ---

// Audit
export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string;
  timestamp: string;
}

export interface AuditLogQuery {
  userId?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

// Permissions
export interface Role {
  id: string;
  name: string;
  nameAr: string;
  permissions: string[];
  userCount: number;
  createdAt: string;
}

export interface CreateRoleInput {
  name: string;
  nameAr: string;
  permissions: string[];
}

export interface UpdateRoleInput {
  name?: string;
  nameAr?: string;
  permissions?: string[];
}

export interface UserPermission {
  userId: string;
  userName: string;
  roleId: string;
  roleName: string;
  customPermissions: string[];
}

export interface AssignRoleInput {
  userId: string;
  roleId: string;
  customPermissions?: string[];
}

export interface PermissionDefinition {
  key: string;
  nameAr: string;
  nameEn: string;
  category: string;
}

// AI Shutdown
export interface AiShutdownStatus {
  active: boolean;
  reason?: string;
  shutdownAt?: string;
  shutdownBy?: string;
}

export interface AiShutdownInput {
  reason: string;
}

// Prompt Guard
export interface PromptGuardRule {
  id: string;
  pattern: string;
  action: 'block' | 'warn' | 'log';
  description: string;
  active: boolean;
  createdAt: string;
}

export interface CreatePromptGuardRuleInput {
  pattern: string;
  action: PromptGuardRule['action'];
  description: string;
}

export interface UpdatePromptGuardRuleInput {
  pattern?: string;
  action?: PromptGuardRule['action'];
  description?: string;
  active?: boolean;
}

export interface PromptGuardCheckInput {
  prompt: string;
}

export interface PromptGuardCheckResult {
  allowed: boolean;
  matchedRules: { ruleId: string; action: string; description: string }[];
}

// Freeze
export interface FreezeStatus {
  frozen: boolean;
  reason?: string;
  frozenAt?: string;
  frozenBy?: string;
  allowedOperations?: string[];
}

export interface FreezeInput {
  reason: string;
  allowedOperations?: string[];
}

// Approval Workflows
export interface ApprovalWorkflow {
  id: string;
  name: string;
  nameAr: string;
  trigger: string;
  steps: ApprovalStep[];
  active: boolean;
  createdAt: string;
}

export interface ApprovalStep {
  order: number;
  approverRoleId: string;
  approverRoleName: string;
  requiredCount: number;
  timeoutHours?: number;
}

export interface CreateApprovalWorkflowInput {
  name: string;
  nameAr: string;
  trigger: string;
  steps: Omit<ApprovalStep, 'approverRoleName'>[];
}

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  workflowName: string;
  requesterId: string;
  requesterName: string;
  currentStep: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ApprovalDecisionInput {
  decision: 'approve' | 'reject';
  comment?: string;
}

// M365 Integration
export interface M365Config {
  tenantId: string;
  clientId: string;
  enabled: boolean;
  syncEnabled: boolean;
  lastSyncAt?: string;
}

export interface M365ConfigInput {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  syncEnabled?: boolean;
}

// Offline Sync
export interface OfflineSyncStatus {
  enabled: boolean;
  lastSyncAt?: string;
  pendingChanges: number;
  conflictCount: number;
}

export interface OfflineSyncConflict {
  id: string;
  resource: string;
  resourceId: string;
  localChange: Record<string, unknown>;
  remoteChange: Record<string, unknown>;
  detectedAt: string;
}

export interface ResolveConflictInput {
  resolution: 'local' | 'remote' | 'merge';
  mergedData?: Record<string, unknown>;
}

// SMS
export interface SmsConfig {
  provider: string;
  enabled: boolean;
  senderName: string;
}

export interface SmsConfigInput {
  provider: string;
  apiKey: string;
  senderName: string;
  enabled?: boolean;
}

export interface SendSmsInput {
  to: string[];
  message: string;
  templateId?: string;
}

export interface SmsResult {
  messageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  recipients: number;
}

// Webhooks
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
}

export interface CreateWebhookInput {
  url: string;
  events: string[];
  secret: string;
}

export interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
}

export interface WebhookEvent {
  name: string;
  description: string;
  descriptionAr: string;
  category: string;
}

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

interface ApiOk {
  success: boolean;
}

// --- API ---

export const governanceApi = {
  // Audit
  queryAuditLog: (query: AuditLogQuery) =>
    api.post<ApiSuccess<AuditLogPage>>('/api/v1/governance/audit', query),

  exportAuditLog: (query: AuditLogQuery, format: 'csv' | 'pdf') =>
    api.post<ApiSuccess<{ url: string; expiresAt: string }>>('/api/v1/governance/audit/export', { ...query, format }),

  // Permissions
  listRoles: () =>
    api.get<ApiSuccess<Role[]>>('/api/v1/governance/roles'),

  createRole: (input: CreateRoleInput) =>
    api.post<ApiSuccess<Role>>('/api/v1/governance/roles', input),

  updateRole: (id: string, input: UpdateRoleInput) =>
    api.patch<ApiSuccess<Role>>(`/api/v1/governance/roles/${id}`, input),

  removeRole: (id: string) =>
    api.del<ApiOk>(`/api/v1/governance/roles/${id}`),

  listPermissions: () =>
    api.get<ApiSuccess<PermissionDefinition[]>>('/api/v1/governance/permissions'),

  listUserPermissions: () =>
    api.get<ApiSuccess<UserPermission[]>>('/api/v1/governance/permissions/users'),

  assignRole: (input: AssignRoleInput) =>
    api.post<ApiOk>('/api/v1/governance/permissions/assign', input),

  // AI Shutdown
  getAiShutdownStatus: () =>
    api.get<ApiSuccess<AiShutdownStatus>>('/api/v1/governance/ai-shutdown'),

  activateAiShutdown: (input: AiShutdownInput) =>
    api.post<ApiOk>('/api/v1/governance/ai-shutdown/activate', input),

  deactivateAiShutdown: () =>
    api.post<ApiOk>('/api/v1/governance/ai-shutdown/deactivate', {}),

  // Prompt Guard
  listPromptGuardRules: () =>
    api.get<ApiSuccess<PromptGuardRule[]>>('/api/v1/governance/prompt-guard'),

  createPromptGuardRule: (input: CreatePromptGuardRuleInput) =>
    api.post<ApiSuccess<PromptGuardRule>>('/api/v1/governance/prompt-guard', input),

  updatePromptGuardRule: (id: string, input: UpdatePromptGuardRuleInput) =>
    api.patch<ApiSuccess<PromptGuardRule>>(`/api/v1/governance/prompt-guard/${id}`, input),

  removePromptGuardRule: (id: string) =>
    api.del<ApiOk>(`/api/v1/governance/prompt-guard/${id}`),

  checkPrompt: (input: PromptGuardCheckInput) =>
    api.post<ApiSuccess<PromptGuardCheckResult>>('/api/v1/governance/prompt-guard/check', input),

  // Freeze
  getFreezeStatus: () =>
    api.get<ApiSuccess<FreezeStatus>>('/api/v1/governance/freeze'),

  activateFreeze: (input: FreezeInput) =>
    api.post<ApiOk>('/api/v1/governance/freeze/activate', input),

  deactivateFreeze: () =>
    api.post<ApiOk>('/api/v1/governance/freeze/deactivate', {}),

  // Approval Workflows
  listApprovalWorkflows: () =>
    api.get<ApiSuccess<ApprovalWorkflow[]>>('/api/v1/governance/approval'),

  createApprovalWorkflow: (input: CreateApprovalWorkflowInput) =>
    api.post<ApiSuccess<ApprovalWorkflow>>('/api/v1/governance/approval', input),

  removeApprovalWorkflow: (id: string) =>
    api.del<ApiOk>(`/api/v1/governance/approval/${id}`),

  listApprovalRequests: (status?: ApprovalRequest['status']) =>
    api.get<ApiSuccess<ApprovalRequest[]>>(`/api/v1/governance/approval/requests${status ? `?status=${status}` : ''}`),

  decideApproval: (requestId: string, input: ApprovalDecisionInput) =>
    api.post<ApiOk>(`/api/v1/governance/approval/requests/${requestId}/decide`, input),

  // M365 Integration
  getM365Config: () =>
    api.get<ApiSuccess<M365Config>>('/api/v1/governance/m365'),

  updateM365Config: (input: M365ConfigInput) =>
    api.put<ApiSuccess<M365Config>>('/api/v1/governance/m365', input),

  triggerM365Sync: () =>
    api.post<ApiOk>('/api/v1/governance/m365/sync', {}),

  // Offline Sync
  getOfflineSyncStatus: () =>
    api.get<ApiSuccess<OfflineSyncStatus>>('/api/v1/governance/offline-sync'),

  toggleOfflineSync: (enabled: boolean) =>
    api.post<ApiOk>('/api/v1/governance/offline-sync/toggle', { enabled }),

  listConflicts: () =>
    api.get<ApiSuccess<OfflineSyncConflict[]>>('/api/v1/governance/offline-sync/conflicts'),

  resolveConflict: (conflictId: string, input: ResolveConflictInput) =>
    api.post<ApiOk>(`/api/v1/governance/offline-sync/conflicts/${conflictId}/resolve`, input),

  forceSync: () =>
    api.post<ApiOk>('/api/v1/governance/offline-sync/force', {}),

  // SMS
  getSmsConfig: () =>
    api.get<ApiSuccess<SmsConfig>>('/api/v1/governance/sms'),

  updateSmsConfig: (input: SmsConfigInput) =>
    api.put<ApiSuccess<SmsConfig>>('/api/v1/governance/sms', input),

  sendSms: (input: SendSmsInput) =>
    api.post<ApiSuccess<SmsResult>>('/api/v1/governance/sms/send', input),

  // Webhooks
  listWebhooks: () =>
    api.get<ApiSuccess<Webhook[]>>('/api/v1/governance/webhooks'),

  listWebhookEvents: () =>
    api.get<ApiSuccess<WebhookEvent[]>>('/api/v1/governance/webhooks/events'),

  createWebhook: (input: CreateWebhookInput) =>
    api.post<ApiSuccess<Webhook>>('/api/v1/governance/webhooks', input),

  updateWebhook: (id: string, input: UpdateWebhookInput) =>
    api.patch<ApiSuccess<Webhook>>(`/api/v1/governance/webhooks/${id}`, input),

  removeWebhook: (id: string) =>
    api.del<ApiOk>(`/api/v1/governance/webhooks/${id}`),

  testWebhook: (id: string) =>
    api.post<ApiOk>(`/api/v1/governance/webhooks/${id}/test`, {}),
};
