import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';

import { DatasetManagerService } from '../services/training/dataset-manager.service.js';
import { ModelBuilderService } from '../services/training/model-builder.service.js';
import { HyperparameterTuningService } from '../services/training/hyperparameter-tuning.service.js';
import { EvaluationEngineService } from '../services/training/evaluation-engine.service.js';
import { ModelRegistryService } from '../services/training/model-registry.service.js';
import { DeploymentManagerService } from '../services/training/deployment-manager.service.js';
import { TrainingMonitorService } from '../services/training/training-monitor.service.js';

const router = Router();
const prisma = new PrismaClient();

const datasetManager = new DatasetManagerService(prisma);
const modelBuilder = new ModelBuilderService(prisma);
const tuningService = new HyperparameterTuningService(prisma);
const evaluationEngine = new EvaluationEngineService(prisma);
const modelRegistry = new ModelRegistryService(prisma);
const deploymentManager = new DeploymentManagerService(prisma);
const trainingMonitor = new TrainingMonitorService(prisma);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ════════════════════════════════════════════════════════════════════
// DATASETS
// ════════════════════════════════════════════════════════════════════

router.post('/datasets', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await datasetManager.createDataset({ ...req.body, tenantId, userId });
  res.status(201).json({ success: true, data: result });
}));

router.get('/datasets', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const taskType = req.query.taskType as string | undefined;
  const search = req.query.search as string | undefined;
  const result = await datasetManager.listDatasets(tenantId, { page, limit, taskType, search });
  res.json({ success: true, ...result });
}));

router.get('/datasets/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const datasetId = z.string().uuid().parse(req.params.id!);
  const result = await datasetManager.getDataset(datasetId, tenantId);
  if (!result) {
    res.status(404).json({ success: false, error: 'Dataset not found' });
    return;
  }
  res.json({ success: true, data: result });
}));

router.put('/datasets/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const datasetId = z.string().uuid().parse(req.params.id!);
  const result = await datasetManager.updateDataset(datasetId, tenantId, req.body);
  res.json({ success: true, data: result });
}));

router.delete('/datasets/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const datasetId = z.string().uuid().parse(req.params.id!);
  await datasetManager.deleteDataset(datasetId, tenantId);
  res.json({ success: true, message: 'Dataset deleted' });
}));

// ── Samples ─────────────────────────────────────────────────────

router.post('/datasets/:id/samples', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const datasetId = z.string().uuid().parse(req.params.id!);
  const result = await datasetManager.addSamples({ datasetId, samples: req.body.samples });
  res.status(201).json({ success: true, data: result });
}));

router.get('/datasets/:id/samples', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const datasetId = z.string().uuid().parse(req.params.id!);
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const split = req.query.split as string | undefined;
  const result = await datasetManager.getSamples(datasetId, { page, limit, split });
  res.json({ success: true, ...result });
}));

router.delete('/datasets/:datasetId/samples/:sampleId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const datasetId = z.string().uuid().parse(req.params.datasetId!);
  const sampleId = z.string().uuid().parse(req.params.sampleId!);
  await datasetManager.deleteSample(sampleId, datasetId);
  res.json({ success: true, message: 'Sample deleted' });
}));

// ── Versioning ──────────────────────────────────────────────────

router.post('/datasets/:id/versions', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const datasetId = z.string().uuid().parse(req.params.id!);
  const { description } = z.object({ description: z.string().min(1) }).parse(req.body);
  const result = await datasetManager.createVersion(datasetId, tenantId, description);
  res.status(201).json({ success: true, data: result });
}));

router.get('/datasets/:id/versions', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const datasetId = z.string().uuid().parse(req.params.id!);
  const result = await datasetManager.listVersions(datasetId);
  res.json({ success: true, data: result });
}));

router.post('/datasets/:id/versions/:versionId/restore', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const datasetId = z.string().uuid().parse(req.params.id!);
  const versionId = z.string().uuid().parse(req.params.versionId!);
  const result = await datasetManager.restoreVersion(datasetId, tenantId, versionId);
  res.json({ success: true, data: result });
}));

// ── Split & Augment ─────────────────────────────────────────────

router.post('/datasets/:id/split', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const datasetId = z.string().uuid().parse(req.params.id!);
  const result = await datasetManager.splitDataset(datasetId, tenantId, req.body);
  res.json({ success: true, data: result });
}));

router.post('/datasets/:id/augment', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const datasetId = z.string().uuid().parse(req.params.id!);
  const { techniques, maxAugmentPerSample } = req.body;
  const result = await datasetManager.augmentDataset(datasetId, tenantId, techniques, maxAugmentPerSample);
  res.json({ success: true, data: result });
}));

// ── Statistics & Export ─────────────────────────────────────────

router.get('/datasets/:id/statistics', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const datasetId = z.string().uuid().parse(req.params.id!);
  const result = await datasetManager.computeStatistics(datasetId, tenantId);
  res.json({ success: true, data: result });
}));

router.post('/datasets/:id/export', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const datasetId = z.string().uuid().parse(req.params.id!);
  const { format, split } = z.object({
    format: z.enum(['jsonl', 'csv', 'parquet']),
    split: z.string().optional(),
  }).parse(req.body);
  const result = await datasetManager.exportDataset(datasetId, tenantId, format, split);
  res.json({ success: true, data: result });
}));

// ════════════════════════════════════════════════════════════════════
// MODEL BUILDER
// ════════════════════════════════════════════════════════════════════

router.post('/models/build', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const config = await modelBuilder.createConfiguration({ ...req.body, tenantId, userId });
  res.status(201).json({ success: true, data: config });
}));

router.get('/models/configurations', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const taskType = req.query.taskType as string | undefined;
  const result = await modelBuilder.listConfigurations(tenantId, { page, limit, taskType });
  res.json({ success: true, ...result });
}));

router.get('/models/configurations/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const configId = z.string().uuid().parse(req.params.id!);
  const result = await modelBuilder.getConfiguration(configId, tenantId);
  if (!result) {
    res.status(404).json({ success: false, error: 'Configuration not found' });
    return;
  }
  res.json({ success: true, data: result });
}));

router.post('/models/configurations/:id/validate', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const configId = z.string().uuid().parse(req.params.id!);
  const result = await modelBuilder.validateConfiguration(configId, tenantId);
  res.json({ success: true, data: result });
}));

router.post('/models/configurations/:id/train', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const configId = z.string().uuid().parse(req.params.id!);
  const result = await modelBuilder.buildModel(configId, tenantId);
  res.json({ success: true, data: result });
}));

router.get('/models/base-models', authMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const result = modelBuilder.getAvailableBaseModels();
  res.json({ success: true, data: result });
}));

router.get('/models/default-hyperparameters/:taskType', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const taskType = req.params.taskType! as 'classification' | 'regression' | 'ner' | 'text-generation' | 'summarization' | 'translation';
  const result = modelBuilder.getDefaultHyperparameters(taskType);
  res.json({ success: true, data: result });
}));

// ════════════════════════════════════════════════════════════════════
// HYPERPARAMETER TUNING
// ════════════════════════════════════════════════════════════════════

router.post('/tune/grid', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await tuningService.gridSearch({ ...req.body, tenantId, userId });
  res.status(201).json({ success: true, data: result });
}));

router.post('/tune/random', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await tuningService.randomSearch({ ...req.body, tenantId, userId });
  res.status(201).json({ success: true, data: result });
}));

router.get('/tune/experiments', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const configId = req.query.configId as string | undefined;
  const result = await tuningService.listExperiments(tenantId, { page, limit, configId });
  res.json({ success: true, ...result });
}));

router.get('/tune/experiments/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const experimentId = z.string().uuid().parse(req.params.id!);
  const result = await tuningService.getExperiment(experimentId, tenantId);
  if (!result) {
    res.status(404).json({ success: false, error: 'Experiment not found' });
    return;
  }
  res.json({ success: true, data: result });
}));

router.get('/tune/experiments/:id/best', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const experimentId = z.string().uuid().parse(req.params.id!);
  const result = await tuningService.findBestConfiguration(experimentId, tenantId);
  res.json({ success: true, data: result });
}));

router.post('/tune/trials/:id/result', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const trialId = z.string().uuid().parse(req.params.id!);
  const { metricValue, duration } = z.object({
    metricValue: z.number(),
    duration: z.number(),
  }).parse(req.body);
  const result = await tuningService.recordTrialResult(trialId, metricValue, duration);
  res.json({ success: true, data: result });
}));

router.post('/tune/lr-schedule', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { schedule, baseLr, totalSteps, warmupSteps } = z.object({
    schedule: z.string().min(1),
    baseLr: z.number().min(0.00001),
    totalSteps: z.number().int().min(1),
    warmupSteps: z.number().int().min(0),
  }).parse(req.body);
  const result = tuningService.generateLearningRateSchedule(schedule, baseLr, totalSteps, warmupSteps);
  res.json({ success: true, data: result });
}));

// ════════════════════════════════════════════════════════════════════
// EVALUATION
// ════════════════════════════════════════════════════════════════════

router.post('/evaluate', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await evaluationEngine.evaluate({ ...req.body, tenantId, userId });
  res.status(201).json({ success: true, data: result });
}));

router.get('/evaluations', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const modelId = req.query.modelId as string | undefined;
  const datasetId = req.query.datasetId as string | undefined;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const result = await evaluationEngine.listEvaluations(tenantId, { modelId, datasetId, page, limit });
  res.json({ success: true, ...result });
}));

router.get('/evaluations/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const evalId = z.string().uuid().parse(req.params.id!);
  const result = await evaluationEngine.getEvaluation(evalId, tenantId);
  if (!result) {
    res.status(404).json({ success: false, error: 'Evaluation not found' });
    return;
  }
  res.json({ success: true, data: result });
}));

router.post('/evaluate/compare', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const result = await evaluationEngine.compareModels({ ...req.body, tenantId });
  res.json({ success: true, data: result });
}));

// ════════════════════════════════════════════════════════════════════
// MODEL REGISTRY
// ════════════════════════════════════════════════════════════════════

router.post('/registry', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await modelRegistry.registerModel({ ...req.body, tenantId, userId });
  res.status(201).json({ success: true, data: result });
}));

router.get('/registry', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const status = req.query.status as string | undefined;
  const taskType = req.query.taskType as string | undefined;
  const search = req.query.search as string | undefined;
  const result = await modelRegistry.listModels(tenantId, { page, limit, status, taskType, search });
  res.json({ success: true, ...result });
}));

router.get('/registry/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const modelId = z.string().uuid().parse(req.params.id!);
  const result = await modelRegistry.getModel(modelId, tenantId);
  if (!result) {
    res.status(404).json({ success: false, error: 'Model not found' });
    return;
  }
  res.json({ success: true, data: result });
}));

router.put('/registry/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const modelId = z.string().uuid().parse(req.params.id!);
  const result = await modelRegistry.updateModel(modelId, tenantId, req.body);
  res.json({ success: true, data: result });
}));

router.post('/registry/:id/promote', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const modelId = z.string().uuid().parse(req.params.id!);
  const { targetStatus } = z.object({ targetStatus: z.enum(['staging', 'production']) }).parse(req.body);
  const result = await modelRegistry.promoteModel(modelId, tenantId, userId, targetStatus);
  res.json({ success: true, data: result });
}));

router.post('/registry/:id/archive', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const modelId = z.string().uuid().parse(req.params.id!);
  const result = await modelRegistry.archiveModel(modelId, tenantId, userId);
  res.json({ success: true, data: result });
}));

router.post('/registry/rollback', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const { modelName, targetVersion } = z.object({
    modelName: z.string().min(1),
    targetVersion: z.number().int().min(1),
  }).parse(req.body);
  const result = await modelRegistry.rollbackToVersion(tenantId, userId, modelName, targetVersion);
  res.json({ success: true, data: result });
}));

router.get('/registry/:id/history', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const modelId = z.string().uuid().parse(req.params.id!);
  const result = await modelRegistry.getVersionHistory(modelId, tenantId);
  res.json({ success: true, data: result });
}));

router.post('/registry/compare', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const { modelIds } = z.object({ modelIds: z.array(z.string().uuid()).min(2) }).parse(req.body);
  const result = await modelRegistry.compareModels(tenantId, modelIds);
  res.json({ success: true, data: result });
}));

router.get('/registry/:id/lineage', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const modelId = z.string().uuid().parse(req.params.id!);
  const result = await modelRegistry.getModelLineage(modelId, tenantId);
  res.json({ success: true, data: result });
}));

// ════════════════════════════════════════════════════════════════════
// DEPLOYMENT
// ════════════════════════════════════════════════════════════════════

router.post('/deploy', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await deploymentManager.deployModel({ ...req.body, tenantId, userId });
  res.status(201).json({ success: true, data: result });
}));

router.get('/deployments', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const environment = req.query.environment as string | undefined;
  const status = req.query.status as string | undefined;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const result = await deploymentManager.listDeployments(tenantId, { environment, status, page, limit });
  res.json({ success: true, ...result });
}));

router.get('/deployments/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const deploymentId = z.string().uuid().parse(req.params.id!);
  const result = await deploymentManager.getDeployment(deploymentId, tenantId);
  if (!result) {
    res.status(404).json({ success: false, error: 'Deployment not found' });
    return;
  }
  res.json({ success: true, data: result });
}));

router.post('/deployments/:id/rollback', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const deploymentId = z.string().uuid().parse(req.params.id!);
  const result = await deploymentManager.rollbackDeployment(deploymentId, tenantId, userId);
  res.json({ success: true, data: result });
}));

router.put('/deployments/:id/rate-limits', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const deploymentId = z.string().uuid().parse(req.params.id!);
  const result = await deploymentManager.updateRateLimits(deploymentId, tenantId, req.body);
  res.json({ success: true, data: result });
}));

router.get('/deployments/:id/health', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const deploymentId = z.string().uuid().parse(req.params.id!);
  const result = await deploymentManager.getHealthStatus(deploymentId, tenantId);
  res.json({ success: true, data: result });
}));

router.get('/deployments/:id/events', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const deploymentId = z.string().uuid().parse(req.params.id!);
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const result = await deploymentManager.getDeploymentEvents(deploymentId, tenantId, limit);
  res.json({ success: true, data: result });
}));

// ════════════════════════════════════════════════════════════════════
// MONITORING
// ════════════════════════════════════════════════════════════════════

router.get('/monitor/:jobId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const jobId = z.string().uuid().parse(req.params.jobId!);
  const metrics = await trainingMonitor.getTrainingMetrics(jobId, tenantId);
  res.json({ success: true, data: metrics });
}));

router.get('/monitor/:jobId/resources', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const jobId = z.string().uuid().parse(req.params.jobId!);
  const result = await trainingMonitor.getResourceUtilization(jobId, tenantId);
  res.json({ success: true, data: result });
}));

router.get('/monitor/:jobId/early-stopping', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const jobId = z.string().uuid().parse(req.params.jobId!);
  const patience = req.query.patience ? parseInt(req.query.patience as string, 10) : 3;
  const result = await trainingMonitor.checkEarlyStopping(jobId, tenantId, patience);
  res.json({ success: true, data: result });
}));

router.get('/monitor/:jobId/anomalies', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const jobId = z.string().uuid().parse(req.params.jobId!);
  await trainingMonitor.detectAnomalies(jobId, tenantId);
  const anomalies = await trainingMonitor.getAnomalies(jobId);
  res.json({ success: true, data: anomalies });
}));

router.get('/monitor/:jobId/alerts', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const jobId = z.string().uuid().parse(req.params.jobId!);
  const unacknowledgedOnly = req.query.unacknowledgedOnly === 'true';
  const result = await trainingMonitor.getAlerts(jobId, { unacknowledgedOnly });
  res.json({ success: true, data: result });
}));

router.post('/monitor/alerts/:id/acknowledge', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const alertId = z.string().uuid().parse(req.params.id!);
  await trainingMonitor.acknowledgeAlert(alertId);
  res.json({ success: true, message: 'Alert acknowledged' });
}));

router.post('/monitor/:jobId/start', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const jobId = z.string().uuid().parse(req.params.jobId!);
  trainingMonitor.startMonitoring(jobId, tenantId);
  res.json({ success: true, message: 'Monitoring started' });
}));

router.post('/monitor/:jobId/stop', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const jobId = z.string().uuid().parse(req.params.jobId!);
  trainingMonitor.stopMonitoring(jobId);
  res.json({ success: true, message: 'Monitoring stopped' });
}));

export default router;
