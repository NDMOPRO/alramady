import { useAuthStore } from '@/stores/auth-store';

const API_BASE = '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const authState = useAuthStore.getState();
  const headers: Record<string, string> = {
    'x-tenant-id': authState.user?.tenantId || 'a0000000-0000-0000-0000-000000000001',
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (authState.accessToken) {
    headers['Authorization'] = `Bearer ${authState.accessToken}`;
  }

  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...options, headers });

  // Auto-refresh on 401
  if (response.status === 401 && authState.refreshToken) {
    await authState.refresh();
    const newToken = useAuthStore.getState().accessToken;
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retryResponse = await fetch(url, { ...options, headers });
      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ error: retryResponse.statusText }));
        throw new Error(error.error || `API Error: ${retryResponse.status}`);
      }
      return retryResponse.json();
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API Error: ${response.status}`);
  }

  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
};

// Data service
export const dataApi = {
  listSources: () => api.get<{ success: boolean; data: unknown[] }>('/data/sources'),
  uploadFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.upload<{ success: boolean; data: { id: string } }>('/data/sources/upload', fd);
  },
};

// Dashboard service
export const dashboardApi = {
  list: () => api.get<{ success: boolean; data: { items: unknown[] } }>('/dashboard/dashboards'),
  create: (data: Record<string, unknown>) => api.post('/dashboard/dashboards', data),
};

// Presentation service
export const presentationApi = {
  list: () => api.get<{ success: boolean; data: unknown[] }>('/presentation/presentations'),
  create: (data: Record<string, unknown>) => api.post('/presentation/presentations', data),
};

// Reporting service
export const reportingApi = {
  list: () => api.get<{ success: boolean; data: unknown[] }>('/reporting/reports'),
  create: (data: Record<string, unknown>) => api.post('/reporting/reports', data),
};

// Library service
export const libraryApi = {
  listAssets: () => api.get<{ success: boolean; data: unknown[] }>('/library/assets'),
  uploadAsset: (file: File, description?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (description) fd.append('description', description);
    return api.upload<{ success: boolean; data: { id: string } }>('/library/assets', fd);
  },
};

// Template service
export const templateApi = {
  list: () => api.get<{ success: boolean; data: unknown[] }>('/template/templates'),
  getGallery: () => api.get<{ success: boolean; data: unknown[] }>('/template/templates/gallery'),
};

// Replication service — legacy job management
export const replicationApi = {
  listJobs: () => api.get<{ success: boolean; data: unknown[] }>('/replication/jobs'),
  createJob: (data: Record<string, unknown>) => api.post('/replication/jobs', data),
};

// ─── STRICT 1:1 Engine API ────────────────────────────────────────────────────

// Configurable base URL — set VITE_REPLICATION_BASE in your .env to override
declare const __REPLICATION_BASE__: string | undefined;
const REPLICATION_BASE: string =
  (typeof __REPLICATION_BASE__ !== 'undefined' ? __REPLICATION_BASE__ : null) ??
  '/api/replication';

async function strictRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${REPLICATION_BASE}${path}`;
  const { useAuthStore } = await import('@/stores/auth-store');
  const authState = useAuthStore.getState();

  const headers: Record<string, string> = {
    'x-tenant-id': authState.user?.tenantId || 'a0000000-0000-0000-0000-000000000001',
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (authState.accessToken) {
    headers['Authorization'] = `Bearer ${authState.accessToken}`;
  }

  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && authState.refreshToken) {
    await authState.refresh();
    const newToken = useAuthStore.getState().accessToken;
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retry = await fetch(url, { ...options, headers });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({ error: retry.statusText }));
        throw new Error((err as { error?: string }).error || `Replication API Error: ${retry.status}`);
      }
      return retry.json() as Promise<T>;
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((err as { error?: string }).error || `Replication API Error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export interface StrictConvertResponse {
  success: boolean;
  data: {
    runId: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    targetFormat: string;
    createdAt: string;
  };
}

export interface StrictToolExecuteResponse {
  success: boolean;
  data: {
    toolId: string;
    result: Record<string, unknown>;
    executionTimeMs: number;
    stepIndex?: number;
  };
}

export interface StrictTool {
  id: string;
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface StrictToolsResponse {
  success: boolean;
  data: StrictTool[];
}

export interface StrictEvidenceValidateResponse {
  success: boolean;
  data: {
    runId: string;
    gatesPassed: boolean;
    pixelDiff: number;
    structuralHash: string;
    layerCount: number;
    elementCount: number;
    validatedAt: string;
    failedGates: string[];
  };
}

export interface StrictPipelineStatusResponse {
  success: boolean;
  data: {
    runId: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    currentStep: number;
    totalSteps: number;
    steps: Array<{
      index: number;
      name: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      startedAt?: string;
      completedAt?: string;
      errorMessage?: string;
    }>;
    outputUrl?: string;
    evidenceId?: string;
    startedAt: string;
    updatedAt: string;
  };
}

export const strictApi = {
  /**
   * POST /api/replication/api/v1/strict/convert
   * Starts a STRICT 1:1 replication pipeline for the given file.
   */
  startReplication: (file: File, targetFormat: string): Promise<StrictConvertResponse> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('targetFormat', targetFormat);
    return strictRequest<StrictConvertResponse>('/api/v1/strict/convert', {
      method: 'POST',
      body: fd,
    });
  },

  /**
   * POST /api/replication/api/v1/strict/tool/execute
   * Executes a single STRICT tool by ID with provided inputs.
   */
  executeStrictTool: (
    toolId: string,
    inputs: Record<string, unknown>
  ): Promise<StrictToolExecuteResponse> =>
    strictRequest<StrictToolExecuteResponse>('/api/v1/strict/tool/execute', {
      method: 'POST',
      body: JSON.stringify({ toolId, inputs }),
    }),

  /**
   * GET /api/replication/api/v1/strict/tools
   * Returns the full list of registered STRICT tools (22 tools).
   */
  getAvailableTools: (): Promise<StrictToolsResponse> =>
    strictRequest<StrictToolsResponse>('/api/v1/strict/tools'),

  /**
   * POST /api/replication/api/v1/strict/evidence/validate
   * Validates the evidence pack for a completed run (pixel-diff, hashes, gates).
   */
  validateEvidence: (runId: string): Promise<StrictEvidenceValidateResponse> =>
    strictRequest<StrictEvidenceValidateResponse>('/api/v1/strict/evidence/validate', {
      method: 'POST',
      body: JSON.stringify({ runId }),
    }),

  /**
   * GET /api/replication/api/v1/strict/convert/{runId}/status
   * Returns the live status of a running or completed pipeline.
   */
  getPipelineStatus: (runId: string): Promise<StrictPipelineStatusResponse> =>
    strictRequest<StrictPipelineStatusResponse>(`/api/v1/strict/convert/${encodeURIComponent(runId)}/status`),
};

// Governance service
export const governanceApi = {
  listUsers: (page = 1, limit = 50) =>
    api.get<{ success: boolean; data: { users: unknown[]; total: number } }>(
      `/governance/auth/users?page=${page}&limit=${limit}`
    ),
  getUser: (id: string) =>
    api.get<{ success: boolean; data: unknown }>(`/governance/users/${id}`),
  getAuditLog: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<{ success: boolean; data: unknown[] }>(`/governance/audit${qs}`);
  },
  assignRole: (userId: string, roleName: string) =>
    api.post(`/governance/auth/users/${userId}/roles`, { roleName }),
  removeRole: (userId: string, roleName: string) =>
    api.delete(`/governance/auth/users/${userId}/roles/${roleName}`),
};
