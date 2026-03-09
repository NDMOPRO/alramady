'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

interface AuditLogListResponse {
  data: AuditLog[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
  };
}

interface FreezeRule {
  id: string;
  name: string;
  resourceType: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface FreezeStatus {
  isFrozen: boolean;
  frozenAt: string | null;
  frozenBy: string | null;
  reason: string | null;
  allowedOperations: string[];
}

interface Approval {
  id: string;
  requesterId: string;
  approverId: string | null;
  resourceType: string;
  resourceId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret: string;
}

interface ShutdownStatus {
  isShutdown: boolean;
  reason: string | null;
  initiatedBy: string | null;
  shutdownAt: string | null;
}

interface PromptInjectionResult {
  isMalicious: boolean;
  confidence: number;
  detectedPatterns: string[];
}

interface PromptGuardRule {
  id: string;
  pattern: string;
  action: 'block' | 'warn' | 'log';
  description: string;
  isActive: boolean;
}

interface M365Integration {
  id: string;
  tenantId: string;
  status: 'active' | 'inactive' | 'error';
  services: string[];
  lastSyncAt: string | null;
}

interface OfflineSyncStatus {
  enabled: boolean;
  lastSyncAt: string | null;
  pendingChanges: number;
  syncInterval: number;
}

export function useGovernance(auditPage = 1) {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [freezeRules, setFreezeRules] = useState<FreezeRule[]>([]);
  const [freezeStatus, setFreezeStatus] = useState<FreezeStatus | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [shutdownStatus, setShutdownStatus] = useState<ShutdownStatus | null>(null);
  const [promptGuardRules, setPromptGuardRules] = useState<PromptGuardRule[]>([]);
  const [m365, setM365] = useState<M365Integration | null>(null);
  const [offlineSync, setOfflineSync] = useState<OfflineSyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [auditRes, freezeRes, approvalRes, webhookRes, shutdownRes, guardRes, freezeStatusRes, m365Res, offlineRes] =
        await Promise.all([
          api.get<AuditLogListResponse>(
            `/api/v1/governance/audit?page=${auditPage}&pageSize=50`
          ),
          api.get<{ data: FreezeRule[] }>('/api/v1/governance/freeze-rules'),
          api.get<{ data: Approval[] }>('/api/v1/governance/approvals'),
          api.get<{ data: Webhook[] }>('/api/v1/governance/webhooks'),
          api.get<{ data: ShutdownStatus }>('/api/v1/governance/ai-shutdown'),
          api.get<{ data: PromptGuardRule[] }>('/api/v1/governance/prompt-guard'),
          api.get<{ data: FreezeStatus }>('/api/v1/governance/freeze'),
          api.get<{ data: M365Integration }>('/api/v1/governance/m365'),
          api.get<{ data: OfflineSyncStatus }>('/api/v1/governance/offline-sync'),
        ]);
      setAuditLogs(auditRes.data);
      setAuditTotal(auditRes.pagination.total);
      setFreezeRules(freezeRes.data);
      setApprovals(approvalRes.data);
      setWebhooks(webhookRes.data);
      setShutdownStatus(shutdownRes.data);
      setPromptGuardRules(guardRes.data);
      setFreezeStatus(freezeStatusRes.data);
      setM365(m365Res.data);
      setOfflineSync(offlineRes.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load governance data'
      );
    } finally {
      setIsLoading(false);
    }
  }, [auditPage]);

  // AI Shutdown
  const toggleAiShutdown = useCallback(
    async (shutdown: boolean, reason?: string) => {
      const res = await api.post<{ data: ShutdownStatus }>(
        '/api/v1/governance/ai-shutdown',
        { shutdown, reason }
      );
      setShutdownStatus(res.data);
      return res.data;
    },
    []
  );

  // Prompt Injection Check
  const checkPromptInjection = useCallback(async (prompt: string) => {
    const res = await api.post<{ data: PromptInjectionResult }>(
      '/api/v1/governance/prompt-injection-check',
      { prompt }
    );
    return res.data;
  }, []);

  // Prompt Guard Rules CRUD
  const createPromptGuardRule = useCallback(async (rule: Omit<PromptGuardRule, 'id'>) => {
    const res = await api.post<{ data: PromptGuardRule }>('/api/v1/governance/prompt-guard', rule);
    setPromptGuardRules(prev => [...prev, res.data]);
    return res.data;
  }, []);

  const updatePromptGuardRule = useCallback(async (ruleId: string, updates: Partial<PromptGuardRule>) => {
    const res = await api.put<{ data: PromptGuardRule }>(`/api/v1/governance/prompt-guard/${ruleId}`, updates);
    setPromptGuardRules(prev => prev.map(r => r.id === ruleId ? res.data : r));
    return res.data;
  }, []);

  const deletePromptGuardRule = useCallback(async (ruleId: string) => {
    await api.del(`/api/v1/governance/prompt-guard/${ruleId}`);
    setPromptGuardRules(prev => prev.filter(r => r.id !== ruleId));
  }, []);

  // Freeze Rules
  const createFreezeRule = useCallback(
    async (rule: Omit<FreezeRule, 'id' | 'isActive'>) => {
      const res = await api.post<{ data: FreezeRule }>(
        '/api/v1/governance/freeze-rules',
        rule
      );
      setFreezeRules((prev) => [...prev, res.data]);
      return res.data;
    },
    []
  );

  const deleteFreezeRule = useCallback(async (id: string) => {
    await api.del(`/api/v1/governance/freeze-rules/${id}`);
    setFreezeRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Freeze Toggle
  const toggleFreeze = useCallback(async (freeze: boolean, reason?: string) => {
    const res = await api.post<{ data: FreezeStatus }>('/api/v1/governance/freeze', { freeze, reason });
    setFreezeStatus(res.data);
    return res.data;
  }, []);

  // Approvals
  const approveRequest = useCallback(async (id: string) => {
    const res = await api.post<{ data: Approval }>(
      `/api/v1/governance/approvals/${id}/approve`,
      {}
    );
    setApprovals((prev) => prev.map((a) => (a.id === id ? res.data : a)));
    return res.data;
  }, []);

  const rejectRequest = useCallback(async (id: string, reason: string) => {
    const res = await api.post<{ data: Approval }>(
      `/api/v1/governance/approvals/${id}/reject`,
      { reason }
    );
    setApprovals((prev) => prev.map((a) => (a.id === id ? res.data : a)));
    return res.data;
  }, []);

  // M365 Integration
  const connectM365 = useCallback(async (tenantId: string, credentials: Record<string, string>) => {
    const res = await api.post<{ data: M365Integration }>('/api/v1/governance/m365/connect', { tenantId, credentials });
    setM365(res.data);
    return res.data;
  }, []);

  const disconnectM365 = useCallback(async () => {
    await api.del('/api/v1/governance/m365');
    setM365(null);
  }, []);

  // Offline Sync
  const configureOfflineSync = useCallback(async (config: { enabled: boolean; syncInterval: number }) => {
    const res = await api.post<{ data: OfflineSyncStatus }>('/api/v1/governance/offline-sync', config);
    setOfflineSync(res.data);
    return res.data;
  }, []);

  const triggerSync = useCallback(async () => {
    const res = await api.post<{ data: OfflineSyncStatus }>('/api/v1/governance/offline-sync/trigger', {});
    setOfflineSync(res.data);
    return res.data;
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return {
    auditLogs,
    auditTotal,
    freezeRules,
    freezeStatus,
    approvals,
    webhooks,
    shutdownStatus,
    promptGuardRules,
    m365,
    offlineSync,
    isLoading,
    error,
    toggleAiShutdown,
    checkPromptInjection,
    createPromptGuardRule,
    updatePromptGuardRule,
    deletePromptGuardRule,
    createFreezeRule,
    deleteFreezeRule,
    toggleFreeze,
    approveRequest,
    rejectRequest,
    connectM365,
    disconnectM365,
    configureOfflineSync,
    triggerSync,
    refresh: loadAll,
  };
}
