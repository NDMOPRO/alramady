import { trainingApi } from './client';

// ─── Dataset Interfaces ──────────────────────────────────────────────

export interface TrainingDataset {
  id: string;
  name: string;
  description: string;
  tenantId: string;
  userId: string;
  language: string;
  taskType: string;
  tags: string[];
  version: number;
  sampleCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetSample {
  id: string;
  datasetId: string;
  input: string;
  expectedOutput: string;
  metadata: Record<string, unknown>;
  quality: number;
  tags: string[];
  isAugmented: boolean;
  split: string | null;
  createdAt: string;
}

export interface DatasetStatistics {
  totalSamples: number;
  augmentedSamples: number;
  originalSamples: number;
  avgInputLength: number;
  avgOutputLength: number;
  avgQuality: number;
  labelDistribution: Record<string, number>;
  qualityDistribution: { high: number; medium: number; low: number };
  splitDistribution: { train: number; validation: number; test: number; unassigned: number };
  languageBreakdown: Record<string, number>;
  qualityScore: number;
}

export interface DatasetVersion {
  id: string;
  datasetId: string;
  version: number;
  sampleCount: number;
  checksum: string;
  description: string;
  createdAt: string;
}

export interface AugmentationResult {
  originalCount: number;
  augmentedCount: number;
  totalAfter: number;
  techniques: string[];
}

// ─── Model Builder Interfaces ────────────────────────────────────────

export interface HyperparameterConfig {
  epochs: number;
  batchSize: number;
  learningRateMultiplier: number;
  warmupSteps: number;
  weightDecay: number;
  maxGradNorm: number;
  lrSchedule: string;
}

export interface ModelConfiguration {
  id: string;
  name: string;
  description: string;
  datasetId: string;
  baseModel: string;
  taskType: string;
  hyperparameters: HyperparameterConfig;
  systemPrompt: string;
  suffix: string;
  validationDatasetId: string | null;
  trainingObjective: string;
  status: string;
  validationErrors: string[];
  estimatedTrainingTime: number;
  estimatedCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  estimatedTrainingTime: number;
  estimatedCost: number;
  recommendations: string[];
}

export interface BuildResult {
  configId: string;
  trainingJobId: string;
  status: string;
  estimatedCompletionTime: string;
}

export interface BaseModelInfo {
  id: string;
  name: string;
  maxTokens: number;
  supportedTasks: string[];
}

// ─── Tuning Interfaces ───────────────────────────────────────────────

export interface TuningExperiment {
  id: string;
  configId: string;
  searchStrategy: string;
  metric: string;
  objective: string;
  totalTrials: number;
  completedTrials: number;
  bestTrialId: string | null;
  bestMetricValue: number | null;
  bestHyperparameters: HyperparameterConfig | null;
  status: string;
  trials: ExperimentTrial[];
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentTrial {
  id: string;
  experimentId: string;
  trialNumber: number;
  hyperparameters: HyperparameterConfig;
  metricValue: number | null;
  metricName: string;
  status: string;
  duration: number;
}

export interface LearningRateSchedule {
  name: string;
  description: string;
  formula: string;
  schedule: Array<{ step: number; lr: number }>;
}

// ─── Evaluation Interfaces ───────────────────────────────────────────

export interface EvaluationResult {
  id: string;
  modelId: string;
  datasetId: string;
  split: string;
  metrics: Record<string, number>;
  confusionMatrix: {
    labels: string[];
    matrix: number[][];
  } | null;
  perClassMetrics: Array<{
    label: string;
    precision: number;
    recall: number;
    f1: number;
    support: number;
  }>;
  sampleResults: Array<{
    input: string;
    expected: string;
    predicted: string;
    isCorrect: boolean;
    confidence: number;
  }>;
  totalSamples: number;
  evaluatedSamples: number;
  duration: number;
  createdAt: string;
}

export interface ModelComparison {
  models: Array<{
    modelId: string;
    metrics: Record<string, number>;
  }>;
  winner: string;
  metricDifferences: Record<string, Record<string, number>>;
  recommendation: string;
}

// ─── Registry Interfaces ─────────────────────────────────────────────

export interface RegisteredModel {
  id: string;
  name: string;
  description: string;
  modelId: string;
  baseModel: string;
  taskType: string;
  datasetId: string;
  version: number;
  status: string;
  metrics: Record<string, number>;
  tags: string[];
  lineage: {
    baseModel: string;
    datasetId: string;
    datasetVersion: number | null;
    parentModelId: string | null;
  };
  createdAt: string;
  updatedAt: string;
  promotedAt: string | null;
  archivedAt: string | null;
}

export interface ModelVersionHistory {
  version: number;
  status: string;
  metrics: Record<string, number>;
  changedBy: string;
  changedAt: string;
  description: string;
}

// ─── Deployment Interfaces ───────────────────────────────────────────

export interface Deployment {
  id: string;
  registeredModelId: string;
  modelId: string;
  environment: string;
  strategy: string;
  status: string;
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    maxConcurrent: number;
  };
  healthStatus: {
    isHealthy: boolean;
    lastCheck: string | null;
    uptime: number;
    errorRate: number;
    avgLatency: number;
    consecutiveFailures: number;
  };
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgResponseTime: number;
    totalTokensUsed: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentEvent {
  id: string;
  deploymentId: string;
  eventType: string;
  message: string;
  timestamp: string;
}

// ─── Monitor Interfaces ──────────────────────────────────────────────

export interface TrainingMetrics {
  jobId: string;
  status: string;
  currentEpoch: number;
  totalEpochs: number;
  trainLoss: number[];
  trainAccuracy: number[];
  validationLoss: number[];
  validationAccuracy: number[];
  stepMetrics: Array<{
    step: number;
    epoch: number;
    trainLoss: number;
    trainAccuracy: number | null;
    validationLoss: number | null;
  }>;
  estimatedTimeRemaining: number;
  elapsedTime: number;
  progress: number;
}

export interface ResourceUtilization {
  gpuUtilization: number;
  gpuMemoryUsed: number;
  gpuMemoryTotal: number;
  cpuUtilization: number;
  memoryUsed: number;
  memoryTotal: number;
  timestamp: string;
}

export interface EarlyStoppingStatus {
  shouldStop: boolean;
  reason: string | null;
  bestEpoch: number;
  bestMetricValue: number;
  epochsWithoutImprovement: number;
  patience: number;
}

export interface TrainingAnomaly {
  id: string;
  jobId: string;
  type: string;
  severity: string;
  message: string;
  detectedAt: string;
}

export interface TrainingAlert {
  id: string;
  jobId: string;
  alertType: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════
// API Functions
// ═══════════════════════════════════════════════════════════════════

// ─── Datasets ────────────────────────────────────────────────────────

export async function createDataset(payload: {
  name: string;
  description?: string;
  language?: string;
  taskType: string;
  tags?: string[];
}): Promise<TrainingDataset> {
  const response = await trainingApi.post('/datasets', payload);
  return response.data.data;
}

export async function fetchDatasets(params?: {
  page?: number;
  limit?: number;
  taskType?: string;
  search?: string;
}): Promise<{ data: TrainingDataset[]; total: number }> {
  const response = await trainingApi.get('/datasets', { params });
  return response.data;
}

export async function fetchDataset(id: string): Promise<TrainingDataset> {
  const response = await trainingApi.get(`/datasets/${id}`);
  return response.data.data;
}

export async function updateDataset(id: string, payload: {
  name?: string;
  description?: string;
  tags?: string[];
}): Promise<TrainingDataset> {
  const response = await trainingApi.put(`/datasets/${id}`, payload);
  return response.data.data;
}

export async function deleteDataset(id: string): Promise<void> {
  await trainingApi.delete(`/datasets/${id}`);
}

export async function addSamples(datasetId: string, samples: Array<{
  input: string;
  expectedOutput: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}>): Promise<{ added: number; total: number }> {
  const response = await trainingApi.post(`/datasets/${datasetId}/samples`, { samples });
  return response.data.data;
}

export async function fetchSamples(datasetId: string, params?: {
  page?: number;
  limit?: number;
  split?: string;
}): Promise<{ data: DatasetSample[]; total: number }> {
  const response = await trainingApi.get(`/datasets/${datasetId}/samples`, { params });
  return response.data;
}

export async function deleteSample(datasetId: string, sampleId: string): Promise<void> {
  await trainingApi.delete(`/datasets/${datasetId}/samples/${sampleId}`);
}

export async function splitDataset(datasetId: string, config: {
  trainRatio: number;
  validationRatio: number;
  testRatio: number;
  seed?: number;
}): Promise<{ train: number; validation: number; test: number }> {
  const response = await trainingApi.post(`/datasets/${datasetId}/split`, config);
  return response.data.data;
}

export async function augmentDataset(datasetId: string, payload: {
  techniques?: string[];
  maxAugmentPerSample?: number;
}): Promise<AugmentationResult> {
  const response = await trainingApi.post(`/datasets/${datasetId}/augment`, payload);
  return response.data.data;
}

export async function fetchDatasetStatistics(datasetId: string): Promise<DatasetStatistics> {
  const response = await trainingApi.get(`/datasets/${datasetId}/statistics`);
  return response.data.data;
}

export async function exportDataset(datasetId: string, format: string, split?: string): Promise<{
  filePath: string;
  format: string;
  sampleCount: number;
}> {
  const response = await trainingApi.post(`/datasets/${datasetId}/export`, { format, split });
  return response.data.data;
}

export async function createDatasetVersion(datasetId: string, description: string): Promise<DatasetVersion> {
  const response = await trainingApi.post(`/datasets/${datasetId}/versions`, { description });
  return response.data.data;
}

export async function fetchDatasetVersions(datasetId: string): Promise<DatasetVersion[]> {
  const response = await trainingApi.get(`/datasets/${datasetId}/versions`);
  return response.data.data;
}

export async function restoreDatasetVersion(datasetId: string, versionId: string): Promise<TrainingDataset> {
  const response = await trainingApi.post(`/datasets/${datasetId}/versions/${versionId}/restore`);
  return response.data.data;
}

// ─── Model Builder ───────────────────────────────────────────────────

export async function createModelConfiguration(payload: {
  name: string;
  description?: string;
  datasetId: string;
  baseModel: string;
  taskType: string;
  hyperparameters?: Partial<HyperparameterConfig>;
  systemPrompt?: string;
  suffix?: string;
  validationDatasetId?: string;
}): Promise<ModelConfiguration> {
  const response = await trainingApi.post('/models/build', payload);
  return response.data.data;
}

export async function fetchModelConfigurations(params?: {
  page?: number;
  limit?: number;
  taskType?: string;
}): Promise<{ data: ModelConfiguration[]; total: number }> {
  const response = await trainingApi.get('/models/configurations', { params });
  return response.data;
}

export async function fetchModelConfiguration(id: string): Promise<ModelConfiguration> {
  const response = await trainingApi.get(`/models/configurations/${id}`);
  return response.data.data;
}

export async function validateModelConfiguration(id: string): Promise<ValidationResult> {
  const response = await trainingApi.post(`/models/configurations/${id}/validate`);
  return response.data.data;
}

export async function startTraining(configId: string): Promise<BuildResult> {
  const response = await trainingApi.post(`/models/configurations/${configId}/train`);
  return response.data.data;
}

export async function fetchBaseModels(): Promise<BaseModelInfo[]> {
  const response = await trainingApi.get('/models/base-models');
  return response.data.data;
}

export async function fetchDefaultHyperparameters(taskType: string): Promise<HyperparameterConfig> {
  const response = await trainingApi.get(`/models/default-hyperparameters/${taskType}`);
  return response.data.data;
}

// ─── Hyperparameter Tuning ───────────────────────────────────────────

export async function startGridSearch(payload: {
  configId: string;
  searchSpace: {
    epochs: number[];
    batchSize: number[];
    learningRateMultiplier: number[];
  };
  maxTrials?: number;
  metric?: string;
  objective?: string;
}): Promise<TuningExperiment> {
  const response = await trainingApi.post('/tune/grid', payload);
  return response.data.data;
}

export async function startRandomSearch(payload: {
  configId: string;
  searchSpace: {
    epochs: { min: number; max: number };
    batchSize: { min: number; max: number };
    learningRateMultiplier: { min: number; max: number };
  };
  numTrials?: number;
  metric?: string;
  objective?: string;
}): Promise<TuningExperiment> {
  const response = await trainingApi.post('/tune/random', payload);
  return response.data.data;
}

export async function fetchExperiments(params?: {
  page?: number;
  limit?: number;
  configId?: string;
}): Promise<{ data: TuningExperiment[]; total: number }> {
  const response = await trainingApi.get('/tune/experiments', { params });
  return response.data;
}

export async function fetchExperiment(id: string): Promise<TuningExperiment> {
  const response = await trainingApi.get(`/tune/experiments/${id}`);
  return response.data.data;
}

export async function fetchBestConfiguration(experimentId: string): Promise<{
  trial: ExperimentTrial;
  hyperparameters: HyperparameterConfig;
} | null> {
  const response = await trainingApi.get(`/tune/experiments/${experimentId}/best`);
  return response.data.data;
}

export async function generateLRSchedule(payload: {
  schedule: string;
  baseLr: number;
  totalSteps: number;
  warmupSteps: number;
}): Promise<LearningRateSchedule> {
  const response = await trainingApi.post('/tune/lr-schedule', payload);
  return response.data.data;
}

// ─── Evaluation ──────────────────────────────────────────────────────

export async function runEvaluation(payload: {
  modelId: string;
  datasetId: string;
  split?: string;
  metrics: string[];
  maxSamples?: number;
}): Promise<EvaluationResult> {
  const response = await trainingApi.post('/evaluate', payload);
  return response.data.data;
}

export async function fetchEvaluations(params?: {
  modelId?: string;
  datasetId?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: EvaluationResult[]; total: number }> {
  const response = await trainingApi.get('/evaluations', { params });
  return response.data;
}

export async function fetchEvaluation(id: string): Promise<EvaluationResult> {
  const response = await trainingApi.get(`/evaluations/${id}`);
  return response.data.data;
}

export async function compareModels(payload: {
  modelIds: string[];
  datasetId: string;
  metrics: string[];
}): Promise<ModelComparison> {
  const response = await trainingApi.post('/evaluate/compare', payload);
  return response.data.data;
}

// ─── Model Registry ──────────────────────────────────────────────────

export async function registerModel(payload: {
  name: string;
  description?: string;
  modelId: string;
  baseModel: string;
  taskType: string;
  datasetId: string;
  configId?: string;
  trainingJobId?: string;
  metrics?: Record<string, number>;
  tags?: string[];
}): Promise<RegisteredModel> {
  const response = await trainingApi.post('/registry', payload);
  return response.data.data;
}

export async function fetchRegisteredModels(params?: {
  page?: number;
  limit?: number;
  status?: string;
  taskType?: string;
  search?: string;
}): Promise<{ data: RegisteredModel[]; total: number }> {
  const response = await trainingApi.get('/registry', { params });
  return response.data;
}

export async function fetchRegisteredModel(id: string): Promise<RegisteredModel> {
  const response = await trainingApi.get(`/registry/${id}`);
  return response.data.data;
}

export async function updateRegisteredModel(id: string, payload: {
  description?: string;
  tags?: string[];
}): Promise<RegisteredModel> {
  const response = await trainingApi.put(`/registry/${id}`, payload);
  return response.data.data;
}

export async function promoteModel(id: string, targetStatus: 'staging' | 'production'): Promise<RegisteredModel> {
  const response = await trainingApi.post(`/registry/${id}/promote`, { targetStatus });
  return response.data.data;
}

export async function archiveModel(id: string): Promise<RegisteredModel> {
  const response = await trainingApi.post(`/registry/${id}/archive`);
  return response.data.data;
}

export async function rollbackModel(modelName: string, targetVersion: number): Promise<RegisteredModel> {
  const response = await trainingApi.post('/registry/rollback', { modelName, targetVersion });
  return response.data.data;
}

export async function fetchModelHistory(id: string): Promise<ModelVersionHistory[]> {
  const response = await trainingApi.get(`/registry/${id}/history`);
  return response.data.data;
}

export async function compareRegisteredModels(modelIds: string[]): Promise<{
  models: Array<{ id: string; name: string; version: number; status: string; metrics: Record<string, number> }>;
  metricComparison: Record<string, Record<string, number>>;
  recommendation: string;
}> {
  const response = await trainingApi.post('/registry/compare', { modelIds });
  return response.data.data;
}

export async function fetchModelLineage(id: string): Promise<{
  current: RegisteredModel;
  ancestors: RegisteredModel[];
}> {
  const response = await trainingApi.get(`/registry/${id}/lineage`);
  return response.data.data;
}

// ─── Deployment ──────────────────────────────────────────────────────

export async function deployModel(payload: {
  registeredModelId: string;
  environment?: string;
  strategy?: string;
  canaryConfig?: {
    trafficPercentage: number;
    evaluationPeriodMinutes: number;
    successThreshold: number;
    rollbackOnFailure: boolean;
  };
  rateLimits?: {
    requestsPerMinute: number;
    requestsPerHour: number;
    maxConcurrent: number;
  };
}): Promise<Deployment> {
  const response = await trainingApi.post('/deploy', payload);
  return response.data.data;
}

export async function fetchDeployments(params?: {
  environment?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: Deployment[]; total: number }> {
  const response = await trainingApi.get('/deployments', { params });
  return response.data;
}

export async function fetchDeployment(id: string): Promise<Deployment> {
  const response = await trainingApi.get(`/deployments/${id}`);
  return response.data.data;
}

export async function rollbackDeployment(id: string): Promise<Deployment> {
  const response = await trainingApi.post(`/deployments/${id}/rollback`);
  return response.data.data;
}

export async function updateDeploymentRateLimits(id: string, rateLimits: {
  requestsPerMinute: number;
  requestsPerHour: number;
  maxConcurrent: number;
}): Promise<Deployment> {
  const response = await trainingApi.put(`/deployments/${id}/rate-limits`, rateLimits);
  return response.data.data;
}

export async function fetchDeploymentHealth(id: string): Promise<Deployment['healthStatus']> {
  const response = await trainingApi.get(`/deployments/${id}/health`);
  return response.data.data;
}

export async function fetchDeploymentEvents(id: string, limit?: number): Promise<DeploymentEvent[]> {
  const response = await trainingApi.get(`/deployments/${id}/events`, { params: { limit } });
  return response.data.data;
}

// ─── Monitoring ──────────────────────────────────────────────────────

export async function fetchTrainingMetrics(jobId: string): Promise<TrainingMetrics> {
  const response = await trainingApi.get(`/monitor/${jobId}`);
  return response.data.data;
}

export async function fetchResourceUtilization(jobId: string): Promise<ResourceUtilization> {
  const response = await trainingApi.get(`/monitor/${jobId}/resources`);
  return response.data.data;
}

export async function fetchEarlyStoppingStatus(jobId: string, patience?: number): Promise<EarlyStoppingStatus> {
  const response = await trainingApi.get(`/monitor/${jobId}/early-stopping`, { params: { patience } });
  return response.data.data;
}

export async function fetchTrainingAnomalies(jobId: string): Promise<TrainingAnomaly[]> {
  const response = await trainingApi.get(`/monitor/${jobId}/anomalies`);
  return response.data.data;
}

export async function fetchTrainingAlerts(jobId: string, unacknowledgedOnly?: boolean): Promise<TrainingAlert[]> {
  const response = await trainingApi.get(`/monitor/${jobId}/alerts`, {
    params: { unacknowledgedOnly },
  });
  return response.data.data;
}

export async function acknowledgeAlert(alertId: string): Promise<void> {
  await trainingApi.post(`/monitor/alerts/${alertId}/acknowledge`);
}

export async function startMonitoring(jobId: string): Promise<void> {
  await trainingApi.post(`/monitor/${jobId}/start`);
}

export async function stopMonitoring(jobId: string): Promise<void> {
  await trainingApi.post(`/monitor/${jobId}/stop`);
}
