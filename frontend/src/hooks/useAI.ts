'use client';

import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface AiQueryResult {
  answer: string;
  confidence: number;
  sources: Array<{ file: string; page: number; snippet: string }>;
  sqlPreview: string | null;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  status: 'active' | 'inactive' | 'training';
  createdAt: string;
}

interface FineTuneJob {
  id: string;
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
}

interface StressTestResult {
  totalQueries: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
  results: Array<{ query: string; latencyMs: number; success: boolean }>;
}

interface AnomalyResult {
  field: string;
  value: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestedAction: string;
}

export function useAI() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<AiQueryResult | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [fineTuneJobs, setFineTuneJobs] = useState<FineTuneJob[]>([]);

  const query = useCallback(async (text: string, options?: { dataSourceId?: string; maxTokens?: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<{ data: AiQueryResult }>('/api/v1/ai/query', { text, ...options });
      setLastResult(result.data);
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI query failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sqlPreview = useCallback(async (naturalLanguage: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<{ data: { sql: string; explanation: string } }>('/api/v1/ai/sql-preview', { query: naturalLanguage });
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SQL preview failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getConfidence = useCallback(async (queryText: string, answer: string) => {
    const result = await api.post<{ data: { confidence: number; reasoning: string } }>('/api/v1/ai/confidence', { query: queryText, answer });
    return result.data;
  }, []);

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<{ data: Agent[] }>('/api/v1/ai/agents');
      setAgents(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createAgent = useCallback(async (payload: { name: string; description: string; model: string }) => {
    const result = await api.post<{ data: Agent }>('/api/v1/ai/agents', payload);
    setAgents(prev => [...prev, result.data]);
    return result.data;
  }, []);

  const updateAgent = useCallback(async (agentId: string, payload: Partial<Pick<Agent, 'name' | 'description' | 'model'>>) => {
    const result = await api.put<{ data: Agent }>(`/api/v1/ai/agents/${agentId}`, payload);
    setAgents(prev => prev.map(a => a.id === agentId ? result.data : a));
    return result.data;
  }, []);

  const deleteAgent = useCallback(async (agentId: string) => {
    await api.del(`/api/v1/ai/agents/${agentId}`);
    setAgents(prev => prev.filter(a => a.id !== agentId));
  }, []);

  const startFineTune = useCallback(async (agentId: string, payload: { datasetUrl: string; epochs: number }) => {
    const result = await api.post<{ data: FineTuneJob }>(`/api/v1/ai/agents/${agentId}/fine-tune`, payload);
    setFineTuneJobs(prev => [...prev, result.data]);
    return result.data;
  }, []);

  const getFineTuneStatus = useCallback(async (agentId: string, jobId: string) => {
    const result = await api.get<{ data: FineTuneJob }>(`/api/v1/ai/agents/${agentId}/fine-tune/${jobId}`);
    setFineTuneJobs(prev => prev.map(j => j.id === jobId ? result.data : j));
    return result.data;
  }, []);

  const runStressTest = useCallback(async (payload: { queries: string[]; concurrency: number; agentId?: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<{ data: StressTestResult }>('/api/v1/ai/stress-test', payload);
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stress test failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const detectAnomalies = useCallback(async (dataSourceId: string, options?: { sensitivity?: number; fields?: string[] }) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<{ data: AnomalyResult[] }>('/api/v1/ai/anomalies', { dataSourceId, ...options });
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Anomaly detection failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    lastResult,
    agents,
    fineTuneJobs,
    query,
    sqlPreview,
    getConfidence,
    loadAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    startFineTune,
    getFineTuneStatus,
    runStressTest,
    detectAnomalies,
  };
}
