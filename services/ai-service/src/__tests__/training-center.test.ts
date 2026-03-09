// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────

const mockDatasetCreate = jest.fn();
const mockDatasetFindFirst = jest.fn();
const mockDatasetFindMany = jest.fn();
const mockDatasetUpdate = jest.fn();
const mockDatasetDelete = jest.fn();
const mockDatasetCount = jest.fn();
const mockSampleCreate = jest.fn();
const mockSampleCreateMany = jest.fn();
const mockSampleFindMany = jest.fn();
const mockSampleCount = jest.fn();
const mockSampleDelete = jest.fn();
const mockSampleDeleteMany = jest.fn();
const mockSampleUpdate = jest.fn();
const mockVersionCreate = jest.fn();
const mockVersionFindMany = jest.fn();
const mockVersionFindFirst = jest.fn();
const mockVersionDeleteMany = jest.fn();
const mockConfigCreate = jest.fn();
const mockConfigFindFirst = jest.fn();
const mockConfigFindMany = jest.fn();
const mockConfigUpdate = jest.fn();
const mockConfigCount = jest.fn();
const mockJobCreate = jest.fn();
const mockJobFindFirst = jest.fn();
const mockEvalCreate = jest.fn();
const mockEvalFindFirst = jest.fn();
const mockEvalFindMany = jest.fn();
const mockEvalCount = jest.fn();
const mockRegisteredModelCreate = jest.fn();
const mockRegisteredModelFindFirst = jest.fn();
const mockRegisteredModelFindMany = jest.fn();
const mockRegisteredModelUpdate = jest.fn();
const mockRegisteredModelUpdateMany = jest.fn();
const mockRegisteredModelCount = jest.fn();
const mockVersionHistoryCreate = jest.fn();
const mockVersionHistoryFindMany = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    trainingDataset: {
      create: mockDatasetCreate,
      findFirst: mockDatasetFindFirst,
      findMany: mockDatasetFindMany,
      update: mockDatasetUpdate,
      delete: mockDatasetDelete,
      count: mockDatasetCount,
    },
    trainingSample: {
      create: mockSampleCreate,
      createMany: mockSampleCreateMany,
      findMany: mockSampleFindMany,
      count: mockSampleCount,
      delete: mockSampleDelete,
      deleteMany: mockSampleDeleteMany,
      update: mockSampleUpdate,
    },
    datasetVersion: {
      create: mockVersionCreate,
      findMany: mockVersionFindMany,
      findFirst: mockVersionFindFirst,
      deleteMany: mockVersionDeleteMany,
    },
    modelConfiguration: {
      create: mockConfigCreate,
      findFirst: mockConfigFindFirst,
      findMany: mockConfigFindMany,
      update: mockConfigUpdate,
      count: mockConfigCount,
    },
    trainingJob: {
      create: mockJobCreate,
      findFirst: mockJobFindFirst,
    },
    evaluationResult: {
      create: mockEvalCreate,
      findFirst: mockEvalFindFirst,
      findMany: mockEvalFindMany,
      count: mockEvalCount,
    },
    registeredModel: {
      create: mockRegisteredModelCreate,
      findFirst: mockRegisteredModelFindFirst,
      findMany: mockRegisteredModelFindMany,
      update: mockRegisteredModelUpdate,
      updateMany: mockRegisteredModelUpdateMany,
      count: mockRegisteredModelCount,
    },
    modelVersionHistory: {
      create: mockVersionHistoryCreate,
      findMany: mockVersionHistoryFindMany,
    },
  })),
}));

const mockChatCreate = jest.fn();
const mockModelsRetrieve = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
    models: { retrieve: mockModelsRetrieve },
  })),
}));

// ─── Imports ────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import { DatasetManagerService } from '../services/training/dataset-manager.service';
import { ModelBuilderService } from '../services/training/model-builder.service';
import { EvaluationEngineService } from '../services/training/evaluation-engine.service';
import { ModelRegistryService } from '../services/training/model-registry.service';

// ─── Setup ──────────────────────────────────────────────────────────

let prisma: PrismaClient;
let datasetManager: DatasetManagerService;
let modelBuilder: ModelBuilderService;
let evaluationEngine: EvaluationEngineService;
let modelRegistry: ModelRegistryService;

beforeEach(() => {
  jest.clearAllMocks();
  prisma = new PrismaClient();
  datasetManager = new DatasetManagerService(prisma);
  modelBuilder = new ModelBuilderService(prisma);
  evaluationEngine = new EvaluationEngineService(prisma);
  modelRegistry = new ModelRegistryService(prisma);
});

// ═══════════════════════════════════════════════════════════════════
// Dataset Manager Tests
// ═══════════════════════════════════════════════════════════════════

describe('DatasetManagerService', () => {
  const tenantId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const datasetId = '550e8400-e29b-41d4-a716-446655440010';

  describe('createDataset', () => {
    it('should create a new dataset with valid input', async () => {
      const input = {
        name: 'Test Dataset',
        description: 'A test dataset for classification',
        tenantId,
        userId,
        language: 'ar' as const,
        taskType: 'classification' as const,
        tags: ['test', 'arabic'],
      };

      const mockResult = {
        id: 'dataset-uuid',
        ...input,
        version: 1,
        sampleCount: 0,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDatasetCreate.mockResolvedValue(mockResult);

      const result = await datasetManager.createDataset(input);

      expect(mockDatasetCreate).toHaveBeenCalledTimes(1);
      expect(result.name).toBe('Test Dataset');
      expect(result.taskType).toBe('classification');
      expect(result.language).toBe('ar');
      expect(result.sampleCount).toBe(0);
      expect(result.status).toBe('draft');
    });

    it('should reject invalid task type', async () => {
      const input = {
        name: 'Bad Dataset',
        tenantId,
        userId,
        taskType: 'invalid_type' as any,
      };

      await expect(datasetManager.createDataset(input)).rejects.toThrow();
    });

    it('should reject empty name', async () => {
      const input = {
        name: '',
        tenantId,
        userId,
        taskType: 'classification' as const,
      };

      await expect(datasetManager.createDataset(input)).rejects.toThrow();
    });
  });

  describe('addSamples', () => {
    it('should add samples to a dataset', async () => {
      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId,
        tenantId,
        sampleCount: 0,
      });

      mockSampleCreateMany.mockResolvedValue({ count: 3 });
      mockSampleCount.mockResolvedValue(3);
      mockDatasetUpdate.mockResolvedValue({ id: datasetId, sampleCount: 3 });

      const result = await datasetManager.addSamples({
        datasetId,
        samples: [
          { input: 'Hello world', expectedOutput: 'positive' },
          { input: 'Bad weather', expectedOutput: 'negative' },
          { input: 'Nice day', expectedOutput: 'positive' },
        ],
      });

      expect(result.added).toBe(3);
      expect(result.total).toBe(3);
      expect(mockSampleCreateMany).toHaveBeenCalledTimes(1);
    });

    it('should reject when dataset does not exist', async () => {
      mockDatasetFindFirst.mockResolvedValue(null);

      await expect(datasetManager.addSamples({
        datasetId: '550e8400-e29b-41d4-a716-446655440099',
        samples: [{ input: 'test', expectedOutput: 'test' }],
      })).rejects.toThrow('Dataset not found');
    });

    it('should reject empty samples array', async () => {
      await expect(datasetManager.addSamples({
        datasetId,
        samples: [],
      })).rejects.toThrow();
    });
  });

  describe('splitDataset', () => {
    it('should split dataset with correct ratios', async () => {
      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId,
        tenantId,
        sampleCount: 100,
      });

      const samples = Array.from({ length: 100 }, (_, i) => ({
        id: `sample-${i}`,
        datasetId,
        input: `Input ${i}`,
        expectedOutput: `Output ${i}`,
        quality: 0.8,
        tags: [],
        isAugmented: false,
        split: null,
        createdAt: new Date(),
      }));

      mockSampleFindMany.mockResolvedValue(samples);
      mockSampleUpdate.mockResolvedValue({});

      const result = await datasetManager.splitDataset(datasetId, tenantId, {
        trainRatio: 0.8,
        validationRatio: 0.1,
        testRatio: 0.1,
      });

      expect(result.train).toBe(80);
      expect(result.validation).toBe(10);
      expect(result.test).toBe(10);
    });

    it('should reject when ratios do not sum to 1', async () => {
      mockDatasetFindFirst.mockResolvedValue({ id: 'id', tenantId });

      await expect(datasetManager.splitDataset('id', tenantId, {
        trainRatio: 0.5,
        validationRatio: 0.1,
        testRatio: 0.1,
      })).rejects.toThrow('Split ratios must sum to 1.0');
    });
  });

  describe('computeStatistics', () => {
    it('should compute correct statistics', async () => {
      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId,
        tenantId,
        sampleCount: 5,
      });

      const samples = [
        { id: '1', input: 'Input Arabic text', expectedOutput: 'positive', quality: 0.8, isAugmented: false, split: 'train', tags: [] },
        { id: '2', input: 'Another input', expectedOutput: 'negative', quality: 0.6, isAugmented: false, split: 'train', tags: [] },
        { id: '3', input: 'Third input', expectedOutput: 'positive', quality: 0.9, isAugmented: true, split: 'test', tags: [] },
        { id: '4', input: 'Fourth input', expectedOutput: 'negative', quality: 0.7, isAugmented: false, split: 'validation', tags: [] },
        { id: '5', input: 'Fifth input', expectedOutput: 'neutral', quality: 0.5, isAugmented: false, split: null, tags: [] },
      ];

      mockSampleFindMany.mockResolvedValue(samples);

      const stats = await datasetManager.computeStatistics(datasetId, tenantId);

      expect(stats.totalSamples).toBe(5);
      expect(stats.augmentedSamples).toBe(1);
      expect(stats.originalSamples).toBe(4);
      expect(stats.qualityDistribution.high).toBe(3);
      expect(stats.qualityDistribution.medium).toBe(2);
      expect(stats.qualityDistribution.low).toBe(0);
      expect(stats.splitDistribution.train).toBe(2);
      expect(stats.splitDistribution.test).toBe(1);
      expect(stats.splitDistribution.validation).toBe(1);
      expect(stats.splitDistribution.unassigned).toBe(1);
      expect(stats.qualityScore).toBeGreaterThan(0);
    });

    it('should return zero stats for empty dataset', async () => {
      mockDatasetFindFirst.mockResolvedValue({ id: 'id', tenantId });
      mockSampleFindMany.mockResolvedValue([]);

      const stats = await datasetManager.computeStatistics('id', tenantId);

      expect(stats.totalSamples).toBe(0);
      expect(stats.qualityScore).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Model Builder Tests
// ═══════════════════════════════════════════════════════════════════

describe('ModelBuilderService', () => {
  const tenantId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const datasetId = '550e8400-e29b-41d4-a716-446655440002';

  describe('createConfiguration', () => {
    it('should create a valid model configuration', async () => {
      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId,
        sampleCount: 100,
      });

      const mockConfig = {
        id: 'config-uuid',
        name: 'Classifier v1',
        description: '',
        tenantId,
        userId,
        datasetId,
        baseModel: 'gpt-4o-mini-2024-07-18',
        taskType: 'classification',
        hyperparameters: JSON.stringify({
          epochs: 3, batchSize: 8, learningRateMultiplier: 1.0,
          warmupSteps: 100, weightDecay: 0.01, maxGradNorm: 1.0, lrSchedule: 'cosine',
        }),
        systemPrompt: 'System prompt',
        suffix: 'rasid-classifi',
        validationDatasetId: null,
        trainingObjective: 'Objective',
        status: 'draft',
        validationErrors: JSON.stringify([]),
        estimatedTrainingTime: 10,
        estimatedCost: 2.4,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockConfigCreate.mockResolvedValue(mockConfig);

      const result = await modelBuilder.createConfiguration({
        name: 'Classifier v1',
        tenantId,
        userId,
        datasetId,
        baseModel: 'gpt-4o-mini-2024-07-18',
        taskType: 'classification',
      });

      expect(result.name).toBe('Classifier v1');
      expect(result.taskType).toBe('classification');
      expect(result.status).toBe('draft');
      expect(result.hyperparameters.epochs).toBe(3);
    });

    it('should reject unsupported base model', async () => {
      await expect(modelBuilder.createConfiguration({
        name: 'Bad Config',
        tenantId,
        userId,
        datasetId,
        baseModel: 'nonexistent-model',
        taskType: 'classification',
      })).rejects.toThrow('Unsupported base model');
    });

    it('should reject incompatible task type for base model', async () => {
      await expect(modelBuilder.createConfiguration({
        name: 'Bad Config',
        tenantId,
        userId,
        datasetId,
        baseModel: 'gpt-4o-mini-2024-07-18',
        taskType: 'regression',
      })).rejects.toThrow('does not support task type');
    });
  });

  describe('validateConfiguration', () => {
    it('should validate a correct configuration', async () => {
      const configData = {
        id: 'config-uuid',
        tenantId,
        userId,
        datasetId,
        baseModel: 'gpt-4o-mini-2024-07-18',
        taskType: 'classification',
        hyperparameters: JSON.stringify({
          epochs: 3, batchSize: 8, learningRateMultiplier: 1.0,
          warmupSteps: 100, weightDecay: 0.01, maxGradNorm: 1.0, lrSchedule: 'cosine',
        }),
        systemPrompt: 'System prompt',
        suffix: 'rasid',
        validationDatasetId: null,
        trainingObjective: 'Objective',
        status: 'draft',
        validationErrors: JSON.stringify([]),
        estimatedTrainingTime: 10,
        estimatedCost: 2.4,
        name: 'Config',
        description: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockConfigFindFirst.mockResolvedValue(configData);
      mockDatasetFindFirst.mockResolvedValue({ id: datasetId, sampleCount: 200 });
      mockConfigUpdate.mockResolvedValue(configData);

      const result = await modelBuilder.validateConfiguration('config-uuid', tenantId);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.estimatedTrainingTime).toBeGreaterThan(0);
    });

    it('should detect insufficient samples', async () => {
      const configData = {
        id: 'config-uuid',
        tenantId,
        userId,
        datasetId,
        baseModel: 'gpt-4o-mini-2024-07-18',
        taskType: 'classification',
        hyperparameters: JSON.stringify({
          epochs: 3, batchSize: 8, learningRateMultiplier: 1.0,
          warmupSteps: 100, weightDecay: 0.01, maxGradNorm: 1.0, lrSchedule: 'cosine',
        }),
        systemPrompt: '',
        suffix: '',
        validationDatasetId: null,
        trainingObjective: '',
        status: 'draft',
        validationErrors: JSON.stringify([]),
        estimatedTrainingTime: 5,
        estimatedCost: 0.1,
        name: 'Config',
        description: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockConfigFindFirst.mockResolvedValue(configData);
      mockDatasetFindFirst.mockResolvedValue({ id: datasetId, sampleCount: 3 });
      mockConfigUpdate.mockResolvedValue(configData);

      const result = await modelBuilder.validateConfiguration('config-uuid', tenantId);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Insufficient'))).toBe(true);
    });
  });

  describe('getAvailableBaseModels', () => {
    it('should return list of available base models', () => {
      const models = modelBuilder.getAvailableBaseModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('id');
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('maxTokens');
      expect(models[0]).toHaveProperty('supportedTasks');
    });
  });

  describe('getDefaultHyperparameters', () => {
    it('should return default hyperparameters for classification', () => {
      const params = modelBuilder.getDefaultHyperparameters('classification');

      expect(params.epochs).toBe(3);
      expect(params.batchSize).toBe(8);
      expect(params.learningRateMultiplier).toBe(1.0);
      expect(params.lrSchedule).toBe('cosine');
    });

    it('should return different defaults for different tasks', () => {
      const classParams = modelBuilder.getDefaultHyperparameters('classification');
      const nerParams = modelBuilder.getDefaultHyperparameters('ner');

      expect(classParams.epochs).not.toBe(nerParams.epochs);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Evaluation Engine Tests
// ═══════════════════════════════════════════════════════════════════

describe('EvaluationEngineService', () => {
  const tenantId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const datasetId = '550e8400-e29b-41d4-a716-446655440020';

  describe('evaluate', () => {
    it('should run evaluation and compute metrics', async () => {
      const samples = [
        { id: '1', input: 'Good product', expectedOutput: 'positive', quality: 0.9, split: 'test' },
        { id: '2', input: 'Bad quality', expectedOutput: 'negative', quality: 0.8, split: 'test' },
        { id: '3', input: 'Average item', expectedOutput: 'neutral', quality: 0.7, split: 'test' },
      ];

      mockSampleFindMany.mockResolvedValue(samples);

      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'positive' }, logprobs: null }],
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'negative' }, logprobs: null }],
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'neutral' }, logprobs: null }],
        });

      mockEvalCreate.mockResolvedValue({ id: 'eval-uuid' });

      const result = await evaluationEngine.evaluate({
        tenantId,
        userId,
        modelId: 'ft:gpt-4o-mini:rasid:test',
        datasetId,
        split: 'test',
        metrics: ['accuracy', 'precision', 'recall', 'f1'],
      });

      expect(result.metrics).toHaveProperty('accuracy');
      expect(result.metrics).toHaveProperty('precision');
      expect(result.metrics).toHaveProperty('recall');
      expect(result.metrics).toHaveProperty('f1');
      expect(result.metrics.accuracy).toBe(1);
      expect(result.evaluatedSamples).toBe(3);
    });

    it('should reject when no samples found', async () => {
      mockSampleFindMany.mockResolvedValue([]);

      await expect(evaluationEngine.evaluate({
        tenantId,
        userId,
        modelId: 'test-model',
        datasetId,
        metrics: ['accuracy'],
      })).rejects.toThrow('No samples found');
    });
  });

  describe('compareModels', () => {
    it('should compare multiple models and determine winner', async () => {
      mockEvalFindFirst
        .mockResolvedValueOnce({
          tenantId,
          modelId: 'model-a',
          metrics: JSON.stringify({ accuracy: 0.9, f1: 0.88 }),
        })
        .mockResolvedValueOnce({
          tenantId,
          modelId: 'model-b',
          metrics: JSON.stringify({ accuracy: 0.85, f1: 0.82 }),
        });

      const result = await evaluationEngine.compareModels({
        tenantId,
        modelIds: ['model-a', 'model-b'],
        datasetId,
        metrics: ['accuracy', 'f1'],
      });

      expect(result.models).toHaveLength(2);
      expect(result.winner).toBe('model-a');
      expect(result.metricDifferences).toHaveProperty('accuracy');
      expect(result.recommendation).toContain('model-a');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Model Registry Tests
// ═══════════════════════════════════════════════════════════════════

describe('ModelRegistryService', () => {
  const tenantId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const datasetId = '550e8400-e29b-41d4-a716-446655440030';

  describe('registerModel', () => {
    it('should register a new model with version 1', async () => {
      mockRegisteredModelFindMany.mockResolvedValue([]);
      mockDatasetFindFirst.mockResolvedValue({ id: datasetId, version: 2 });
      mockEvalFindMany.mockResolvedValue([]);

      const mockModel = {
        id: 'model-uuid',
        tenantId,
        userId,
        name: 'Classifier Model',
        description: 'First version',
        modelId: 'ft:gpt-4o-mini:rasid:test',
        baseModel: 'gpt-4o-mini-2024-07-18',
        taskType: 'classification',
        datasetId,
        configId: null,
        trainingJobId: null,
        version: 1,
        status: 'registered',
        metrics: JSON.stringify({ accuracy: 0.92 }),
        tags: ['production-ready'],
        artifacts: JSON.stringify([]),
        lineage: JSON.stringify({
          baseModel: 'gpt-4o-mini-2024-07-18',
          datasetId,
          datasetVersion: 2,
          configId: null,
          trainingJobId: null,
          parentModelId: null,
          evaluationIds: [],
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
        promotedAt: null,
        archivedAt: null,
      };

      mockRegisteredModelCreate.mockResolvedValue(mockModel);
      mockVersionHistoryCreate.mockResolvedValue({ id: 'vh-uuid' });

      const result = await modelRegistry.registerModel({
        tenantId,
        userId,
        name: 'Classifier Model',
        description: 'First version',
        modelId: 'ft:gpt-4o-mini:rasid:test',
        baseModel: 'gpt-4o-mini-2024-07-18',
        taskType: 'classification',
        datasetId,
        metrics: { accuracy: 0.92 },
        tags: ['production-ready'],
      });

      expect(result.name).toBe('Classifier Model');
      expect(result.version).toBe(1);
      expect(result.status).toBe('registered');
      expect(mockRegisteredModelCreate).toHaveBeenCalledTimes(1);
      expect(mockVersionHistoryCreate).toHaveBeenCalledTimes(1);
    });

    it('should increment version for existing model name', async () => {
      mockRegisteredModelFindMany.mockResolvedValue([{
        id: 'prev-uuid',
        version: 2,
      }]);
      mockDatasetFindFirst.mockResolvedValue({ id: datasetId, version: 3 });
      mockEvalFindMany.mockResolvedValue([]);

      const mockModel = {
        id: 'model-uuid',
        tenantId,
        userId,
        name: 'Classifier Model',
        version: 3,
        status: 'registered',
        modelId: 'ft:model',
        baseModel: 'gpt-4o-mini-2024-07-18',
        taskType: 'classification',
        datasetId,
        metrics: JSON.stringify({}),
        tags: [],
        artifacts: JSON.stringify([]),
        lineage: JSON.stringify({
          baseModel: 'gpt-4o-mini-2024-07-18',
          datasetId,
          datasetVersion: 3,
          configId: null,
          trainingJobId: null,
          parentModelId: 'prev-uuid',
          evaluationIds: [],
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
        promotedAt: null,
        archivedAt: null,
        description: '',
        configId: null,
        trainingJobId: null,
      };

      mockRegisteredModelCreate.mockResolvedValue(mockModel);
      mockVersionHistoryCreate.mockResolvedValue({ id: 'vh-uuid' });

      const result = await modelRegistry.registerModel({
        tenantId,
        userId,
        name: 'Classifier Model',
        modelId: 'ft:model',
        baseModel: 'gpt-4o-mini-2024-07-18',
        taskType: 'classification',
        datasetId,
      });

      expect(result.version).toBe(3);
    });
  });

  describe('promoteModel', () => {
    it('should promote model from registered to staging', async () => {
      mockRegisteredModelFindFirst.mockResolvedValue({
        id: 'model-uuid',
        tenantId,
        name: 'Model',
        version: 1,
        status: 'registered',
        metrics: JSON.stringify({}),
      });

      mockRegisteredModelUpdate.mockResolvedValue({
        id: 'model-uuid',
        tenantId,
        name: 'Model',
        version: 1,
        status: 'staging',
        modelId: 'ft:model',
        baseModel: 'gpt-4o-mini-2024-07-18',
        taskType: 'classification',
        datasetId: 'ds-uuid',
        metrics: JSON.stringify({}),
        tags: [],
        artifacts: JSON.stringify([]),
        lineage: JSON.stringify({
          baseModel: 'gpt-4o-mini-2024-07-18',
          datasetId: 'ds-uuid',
          datasetVersion: null,
          configId: null,
          trainingJobId: null,
          parentModelId: null,
          evaluationIds: [],
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
        promotedAt: new Date(),
        archivedAt: null,
        description: '',
        userId,
        configId: null,
        trainingJobId: null,
      });

      mockVersionHistoryCreate.mockResolvedValue({ id: 'vh-uuid' });

      const result = await modelRegistry.promoteModel('model-uuid', tenantId, userId, 'staging');

      expect(result.status).toBe('staging');
      expect(mockVersionHistoryCreate).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid promotion path', async () => {
      mockRegisteredModelFindFirst.mockResolvedValue({
        id: 'model-uuid',
        tenantId,
        status: 'deprecated',
      });

      await expect(
        modelRegistry.promoteModel('model-uuid', tenantId, userId, 'production'),
      ).rejects.toThrow('Cannot promote');
    });
  });

  describe('getVersionHistory', () => {
    it('should return version history sorted by date', async () => {
      mockRegisteredModelFindFirst.mockResolvedValue({ id: 'model-uuid', tenantId });

      mockVersionHistoryFindMany.mockResolvedValue([
        {
          version: 2,
          status: 'staging',
          metrics: JSON.stringify({ accuracy: 0.95 }),
          changedBy: userId,
          changedAt: new Date(),
          description: 'Promoted to staging',
        },
        {
          version: 1,
          status: 'registered',
          metrics: JSON.stringify({ accuracy: 0.92 }),
          changedBy: userId,
          changedAt: new Date(),
          description: 'Model registered',
        },
      ]);

      const history = await modelRegistry.getVersionHistory('model-uuid', tenantId);

      expect(history).toHaveLength(2);
      expect(history[0].status).toBe('staging');
      expect(history[1].status).toBe('registered');
    });
  });

  describe('compareModels', () => {
    it('should compare models and provide recommendation', async () => {
      mockRegisteredModelFindFirst
        .mockResolvedValueOnce({
          id: 'model-a',
          tenantId,
          name: 'Model A',
          version: 1,
          status: 'registered',
          metrics: JSON.stringify({ accuracy: 0.95, f1: 0.93 }),
        })
        .mockResolvedValueOnce({
          id: 'model-b',
          tenantId,
          name: 'Model B',
          version: 1,
          status: 'registered',
          metrics: JSON.stringify({ accuracy: 0.88, f1: 0.85 }),
        });

      const result = await modelRegistry.compareModels(tenantId, ['model-a', 'model-b']);

      expect(result.models).toHaveLength(2);
      expect(result.metricComparison).toHaveProperty('accuracy');
      expect(result.recommendation).toContain('Model A');
    });
  });
});
