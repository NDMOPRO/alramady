import { api } from '@/lib/api';

// --- Interfaces ---

export interface AiQueryInput {
  question: string;
  dataSourceIds: string[];
  language?: 'ar' | 'en';
  context?: Record<string, unknown>;
}

export interface AiQueryResult {
  answer: string;
  sources: AiSource[];
  confidence: number;
  tokensUsed: number;
}

export interface AiSource {
  documentId: string;
  documentName: string;
  page?: number;
  snippet: string;
  relevanceScore: number;
}

export interface SqlPreviewInput {
  question: string;
  dataSourceId: string;
}

export interface SqlPreviewResult {
  sql: string;
  explanation: string;
  estimatedRows: number;
}

export interface SqlExecuteInput {
  sql: string;
  dataSourceId: string;
}

export interface SqlExecuteResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

export interface ConfidenceInput {
  question: string;
  answer: string;
  sources: AiSource[];
}

export interface ConfidenceResult {
  overallScore: number;
  factualAccuracy: number;
  sourceRelevance: number;
  completeness: number;
  explanation: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  tools: string[];
  active: boolean;
  createdAt: string;
}

export interface CreateAgentInput {
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  tools?: string[];
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  tools?: string[];
  active?: boolean;
}

export interface AgentChatInput {
  agentId: string;
  message: string;
  conversationId?: string;
}

export interface AgentChatResult {
  reply: string;
  conversationId: string;
  toolsUsed: string[];
  tokensUsed: number;
}

export interface FineTuneInput {
  baseModel: string;
  trainingDataSourceId: string;
  name: string;
  hyperparameters?: Record<string, unknown>;
}

export interface FineTuneJob {
  id: string;
  name: string;
  baseModel: string;
  status: 'queued' | 'training' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  completedAt?: string;
  resultModelId?: string;
}

export interface StressTestInput {
  prompt: string;
  concurrentRequests: number;
  iterations: number;
  model?: string;
}

export interface StressTestResult {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  results?: {
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    errorRate: number;
    totalRequests: number;
  };
}

export interface AnomalyDetectInput {
  dataSourceId: string;
  columns: string[];
  sensitivity?: 'low' | 'medium' | 'high';
}

export interface Anomaly {
  id: string;
  column: string;
  rowIndex: number;
  value: unknown;
  expectedRange: { min: number; max: number };
  severity: 'low' | 'medium' | 'high';
  explanation: string;
}

export interface AnomalyResult {
  anomalies: Anomaly[];
  totalScanned: number;
  summaryAr: string;
  summaryEn: string;
}

export interface TemporalAnalysisInput {
  dataSourceId: string;
  dateColumn: string;
  valueColumn: string;
  granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  forecastPeriods?: number;
}

export interface TemporalResult {
  historical: { date: string; value: number }[];
  forecast: { date: string; value: number; lower: number; upper: number }[];
  trend: 'increasing' | 'decreasing' | 'stable' | 'seasonal';
  summaryAr: string;
  summaryEn: string;
}

export interface WhatIfInput {
  dataSourceId: string;
  baselineQuery: string;
  scenarios: {
    name: string;
    changes: Record<string, unknown>;
  }[];
}

export interface WhatIfResult {
  baseline: Record<string, unknown>;
  scenarios: {
    name: string;
    result: Record<string, unknown>;
    impactSummaryAr: string;
    impactSummaryEn: string;
  }[];
}

export interface PredictiveInput {
  dataSourceId: string;
  targetColumn: string;
  featureColumns: string[];
  algorithm?: 'auto' | 'linear' | 'tree' | 'neural';
  horizonPeriods?: number;
}

export interface PredictiveResult {
  jobId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  predictions?: {
    period: string;
    value: number;
    lower: number;
    upper: number;
  }[];
  modelMetrics?: {
    accuracy: number;
    mae: number;
    rmse: number;
  };
  summaryAr?: string;
  summaryEn?: string;
}

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

interface ApiOk {
  success: boolean;
}

// --- API ---

export const aiApi = {
  // Query
  query: (input: AiQueryInput) =>
    api.post<ApiSuccess<AiQueryResult>>('/api/v1/ai/query', input),

  // SQL Preview & Execute
  sqlPreview: (input: SqlPreviewInput) =>
    api.post<ApiSuccess<SqlPreviewResult>>('/api/v1/ai/sql-preview', input),

  sqlExecute: (input: SqlExecuteInput) =>
    api.post<ApiSuccess<SqlExecuteResult>>('/api/v1/ai/sql-execute', input),

  // Confidence
  confidence: (input: ConfidenceInput) =>
    api.post<ApiSuccess<ConfidenceResult>>('/api/v1/ai/confidence', input),

  // Agents
  listAgents: () =>
    api.get<ApiSuccess<Agent[]>>('/api/v1/ai/agents'),

  getAgent: (id: string) =>
    api.get<ApiSuccess<Agent>>(`/api/v1/ai/agents/${id}`),

  createAgent: (input: CreateAgentInput) =>
    api.post<ApiSuccess<Agent>>('/api/v1/ai/agents', input),

  updateAgent: (id: string, input: UpdateAgentInput) =>
    api.patch<ApiSuccess<Agent>>(`/api/v1/ai/agents/${id}`, input),

  removeAgent: (id: string) =>
    api.del<ApiOk>(`/api/v1/ai/agents/${id}`),

  chatWithAgent: (input: AgentChatInput) =>
    api.post<ApiSuccess<AgentChatResult>>('/api/v1/ai/agents/chat', input),

  // Fine-tuning
  startFineTune: (input: FineTuneInput) =>
    api.post<ApiSuccess<FineTuneJob>>('/api/v1/ai/fine-tune', input),

  listFineTuneJobs: () =>
    api.get<ApiSuccess<FineTuneJob[]>>('/api/v1/ai/fine-tune'),

  getFineTuneJob: (id: string) =>
    api.get<ApiSuccess<FineTuneJob>>(`/api/v1/ai/fine-tune/${id}`),

  cancelFineTune: (id: string) =>
    api.del<ApiOk>(`/api/v1/ai/fine-tune/${id}`),

  // Stress Test
  startStressTest: (input: StressTestInput) =>
    api.post<ApiSuccess<StressTestResult>>('/api/v1/ai/stress-test', input),

  getStressTestStatus: (jobId: string) =>
    api.get<ApiSuccess<StressTestResult>>(`/api/v1/ai/stress-test/${jobId}`),

  // Anomaly Detection
  detectAnomalies: (input: AnomalyDetectInput) =>
    api.post<ApiSuccess<AnomalyResult>>('/api/v1/ai/anomaly', input),

  // Temporal Analysis
  analyzeTemporal: (input: TemporalAnalysisInput) =>
    api.post<ApiSuccess<TemporalResult>>('/api/v1/ai/temporal', input),

  // What-If Analysis
  whatIf: (input: WhatIfInput) =>
    api.post<ApiSuccess<WhatIfResult>>('/api/v1/ai/what-if', input),

  // Predictive Analytics
  predict: (input: PredictiveInput) =>
    api.post<ApiSuccess<PredictiveResult>>('/api/v1/ai/predictive', input),

  getPredictionStatus: (jobId: string) =>
    api.get<ApiSuccess<PredictiveResult>>(`/api/v1/ai/predictive/${jobId}`),
};
