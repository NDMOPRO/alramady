import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import winston from 'winston';
import { z } from 'zod';

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'model-builder' },
  transports: [new winston.transports.Console()],
});

// ─── Enums & Constants ──────────────────────────────────────────────

export const TASK_TYPES = [
  'classification',
  'regression',
  'ner',
  'text-generation',
  'summarization',
  'translation',
] as const;

export type TaskType = typeof TASK_TYPES[number];

export const BASE_MODELS: Record<string, { name: string; maxTokens: number; supportedTasks: TaskType[] }> = {
  'gpt-4o-mini-2024-07-18': {
    name: 'GPT-4o Mini',
    maxTokens: 16384,
    supportedTasks: ['classification', 'ner', 'text-generation', 'summarization', 'translation'],
  },
  'gpt-4o-2024-08-06': {
    name: 'GPT-4o',
    maxTokens: 16384,
    supportedTasks: ['classification', 'regression', 'ner', 'text-generation', 'summarization', 'translation'],
  },
  'gpt-3.5-turbo-0125': {
    name: 'GPT-3.5 Turbo',
    maxTokens: 4096,
    supportedTasks: ['classification', 'ner', 'text-generation', 'summarization', 'translation'],
  },
};

const DEFAULT_HYPERPARAMETERS: Record<TaskType, HyperparameterConfig> = {
  classification: {
    epochs: 3,
    batchSize: 8,
    learningRateMultiplier: 1.0,
    warmupSteps: 100,
    weightDecay: 0.01,
    maxGradNorm: 1.0,
    lrSchedule: 'cosine',
  },
  regression: {
    epochs: 5,
    batchSize: 8,
    learningRateMultiplier: 0.5,
    warmupSteps: 50,
    weightDecay: 0.01,
    maxGradNorm: 1.0,
    lrSchedule: 'linear',
  },
  ner: {
    epochs: 5,
    batchSize: 4,
    learningRateMultiplier: 0.8,
    warmupSteps: 200,
    weightDecay: 0.01,
    maxGradNorm: 1.0,
    lrSchedule: 'cosine',
  },
  'text-generation': {
    epochs: 3,
    batchSize: 4,
    learningRateMultiplier: 1.0,
    warmupSteps: 100,
    weightDecay: 0.1,
    maxGradNorm: 1.0,
    lrSchedule: 'cosine_with_restarts',
  },
  summarization: {
    epochs: 4,
    batchSize: 4,
    learningRateMultiplier: 0.8,
    warmupSteps: 150,
    weightDecay: 0.01,
    maxGradNorm: 1.0,
    lrSchedule: 'cosine',
  },
  translation: {
    epochs: 5,
    batchSize: 8,
    learningRateMultiplier: 1.0,
    warmupSteps: 200,
    weightDecay: 0.01,
    maxGradNorm: 1.0,
    lrSchedule: 'linear',
  },
};

// ─── Validation Schemas ──────────────────────────────────────────────

const HyperparameterSchema = z.object({
  epochs: z.number().int().min(1).max(50).optional(),
  batchSize: z.number().int().min(1).max(256).optional(),
  learningRateMultiplier: z.number().min(0.01).max(10.0).optional(),
  warmupSteps: z.number().int().min(0).max(10000).optional(),
  weightDecay: z.number().min(0).max(1).optional(),
  maxGradNorm: z.number().min(0.1).max(10).optional(),
  lrSchedule: z.enum(['linear', 'cosine', 'cosine_with_restarts', 'constant', 'polynomial']).optional(),
});

const ModelConfigSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  datasetId: z.string().uuid(),
  baseModel: z.string().min(1),
  taskType: z.enum(TASK_TYPES),
  hyperparameters: HyperparameterSchema.optional(),
  systemPrompt: z.string().max(10000).optional(),
  suffix: z.string().max(40).optional(),
  validationDatasetId: z.string().uuid().optional(),
  trainingObjective: z.string().max(500).optional(),
});

// ─── Interfaces ──────────────────────────────────────────────────────

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
  tenantId: string;
  userId: string;
  datasetId: string;
  baseModel: string;
  taskType: TaskType;
  hyperparameters: HyperparameterConfig;
  systemPrompt: string;
  suffix: string;
  validationDatasetId: string | null;
  trainingObjective: string;
  status: string;
  validationErrors: string[];
  estimatedTrainingTime: number;
  estimatedCost: number;
  createdAt: Date;
  updatedAt: Date;
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
  estimatedCompletionTime: Date;
}

// ─── Service ─────────────────────────────────────────────────────────

export class ModelBuilderService {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  // ── Create Model Configuration ──────────────────────────────────

  async createConfiguration(input: z.infer<typeof ModelConfigSchema>): Promise<ModelConfiguration> {
    const validated = ModelConfigSchema.parse(input);
    const id = crypto.randomUUID();

    const baseModelInfo = BASE_MODELS[validated.baseModel];
    if (!baseModelInfo) {
      throw new Error(`Unsupported base model: ${validated.baseModel}. Available: ${Object.keys(BASE_MODELS).join(', ')}`);
    }

    if (!baseModelInfo.supportedTasks.includes(validated.taskType)) {
      throw new Error(
        `Base model ${validated.baseModel} does not support task type ${validated.taskType}. ` +
        `Supported tasks: ${baseModelInfo.supportedTasks.join(', ')}`,
      );
    }

    const defaults = DEFAULT_HYPERPARAMETERS[validated.taskType];
    const hyperparameters: HyperparameterConfig = {
      epochs: validated.hyperparameters?.epochs ?? defaults.epochs,
      batchSize: validated.hyperparameters?.batchSize ?? defaults.batchSize,
      learningRateMultiplier: validated.hyperparameters?.learningRateMultiplier ?? defaults.learningRateMultiplier,
      warmupSteps: validated.hyperparameters?.warmupSteps ?? defaults.warmupSteps,
      weightDecay: validated.hyperparameters?.weightDecay ?? defaults.weightDecay,
      maxGradNorm: validated.hyperparameters?.maxGradNorm ?? defaults.maxGradNorm,
      lrSchedule: validated.hyperparameters?.lrSchedule ?? defaults.lrSchedule,
    };

    const systemPrompt = validated.systemPrompt ||
      this.generateDefaultSystemPrompt(validated.taskType);

    const suffix = validated.suffix || `rasid-${validated.taskType.substring(0, 8)}`;

    const trainingObjective = validated.trainingObjective ||
      this.generateDefaultObjective(validated.taskType);

    // Estimate cost and time
    const dataset = await this.prisma.trainingDataset.findFirst({
      where: { id: validated.datasetId },
    });

    const sampleCount = dataset ? (dataset as Record<string, unknown>).sampleCount as number : 0;
    const estimatedTrainingTime = this.estimateTrainingTime(sampleCount, hyperparameters.epochs, validated.baseModel);
    const estimatedCost = this.estimateCost(sampleCount, hyperparameters.epochs, validated.baseModel);

    const config = await this.prisma.modelConfiguration.create({
      data: {
        id,
        name: validated.name,
        description: validated.description,
        tenantId: validated.tenantId,
        userId: validated.userId,
        datasetId: validated.datasetId,
        baseModel: validated.baseModel,
        taskType: validated.taskType,
        hyperparameters: JSON.stringify(hyperparameters),
        systemPrompt,
        suffix,
        validationDatasetId: validated.validationDatasetId || null,
        trainingObjective,
        status: 'draft',
        validationErrors: JSON.stringify([]),
        estimatedTrainingTime,
        estimatedCost,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    logger.info('Model configuration created', { id, name: validated.name, taskType: validated.taskType });

    return this.toModelConfiguration(config);
  }

  // ── Get Configuration ───────────────────────────────────────────

  async getConfiguration(configId: string, tenantId: string): Promise<ModelConfiguration | null> {
    const config = await this.prisma.modelConfiguration.findFirst({
      where: { id: configId, tenantId },
    });

    if (!config) return null;
    return this.toModelConfiguration(config);
  }

  // ── List Configurations ─────────────────────────────────────────

  async listConfigurations(
    tenantId: string,
    options: { page?: number; limit?: number; taskType?: string } = {},
  ): Promise<{ data: ModelConfiguration[]; total: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (options.taskType) where.taskType = options.taskType;

    const [configs, total] = await Promise.all([
      this.prisma.modelConfiguration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.modelConfiguration.count({ where }),
    ]);

    return {
      data: configs.map((c: Record<string, unknown>) => this.toModelConfiguration(c)),
      total,
    };
  }

  // ── Validate Configuration ──────────────────────────────────────

  async validateConfiguration(configId: string, tenantId: string): Promise<ValidationResult> {
    const config = await this.getConfiguration(configId, tenantId);
    if (!config) {
      throw new Error(`Configuration not found: ${configId}`);
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // 1. Check base model exists
    const baseModelInfo = BASE_MODELS[config.baseModel];
    if (!baseModelInfo) {
      errors.push(`Unsupported base model: ${config.baseModel}`);
    } else if (!baseModelInfo.supportedTasks.includes(config.taskType)) {
      errors.push(`Base model does not support task type: ${config.taskType}`);
    }

    // 2. Check dataset exists and has sufficient samples
    const dataset = await this.prisma.trainingDataset.findFirst({
      where: { id: config.datasetId },
    });

    if (!dataset) {
      errors.push(`Dataset not found: ${config.datasetId}`);
    } else {
      const typed = dataset as Record<string, unknown>;
      const sampleCount = typed.sampleCount as number;

      if (sampleCount < 10) {
        errors.push(`Insufficient training samples: ${sampleCount}. Minimum 10 required.`);
      } else if (sampleCount < 50) {
        warnings.push(`Only ${sampleCount} samples. Consider adding more for better results (recommended: 100+).`);
      }

      if (sampleCount < 100) {
        recommendations.push('Consider data augmentation to increase dataset size.');
      }
    }

    // 3. Hyperparameter validation
    if (config.hyperparameters.epochs > 10) {
      warnings.push('High epoch count may lead to overfitting. Consider using early stopping.');
    }

    if (config.hyperparameters.batchSize > 32) {
      warnings.push('Large batch size may reduce model quality. Consider smaller batches.');
    }

    if (config.hyperparameters.learningRateMultiplier > 5.0) {
      warnings.push('Very high learning rate multiplier. Training may be unstable.');
    }

    // 4. Validation dataset check
    if (!config.validationDatasetId) {
      recommendations.push('Consider providing a validation dataset to monitor overfitting.');
    } else {
      const valDataset = await this.prisma.trainingDataset.findFirst({
        where: { id: config.validationDatasetId },
      });
      if (!valDataset) {
        errors.push(`Validation dataset not found: ${config.validationDatasetId}`);
      }
    }

    // 5. Task-specific recommendations
    if (config.taskType === 'translation') {
      recommendations.push('Ensure bilingual sample pairs are consistent in meaning.');
    }

    if (config.taskType === 'ner') {
      recommendations.push('Verify entity annotations use consistent formatting (e.g., BIO tags).');
    }

    if (config.taskType === 'summarization') {
      recommendations.push('Ensure summaries are significantly shorter than inputs.');
    }

    const isValid = errors.length === 0;

    // Update configuration status
    await this.prisma.modelConfiguration.update({
      where: { id: configId },
      data: {
        status: isValid ? 'validated' : 'invalid',
        validationErrors: JSON.stringify(errors),
        updatedAt: new Date(),
      },
    });

    logger.info('Configuration validated', { configId, isValid, errorCount: errors.length });

    return {
      isValid,
      errors,
      warnings,
      estimatedTrainingTime: config.estimatedTrainingTime,
      estimatedCost: config.estimatedCost,
      recommendations,
    };
  }

  // ── Build Model (Start Training) ───────────────────────────────

  async buildModel(configId: string, tenantId: string): Promise<BuildResult> {
    const validation = await this.validateConfiguration(configId, tenantId);

    if (!validation.isValid) {
      throw new Error(`Configuration is invalid: ${validation.errors.join('; ')}`);
    }

    const config = await this.getConfiguration(configId, tenantId);
    if (!config) {
      throw new Error(`Configuration not found: ${configId}`);
    }

    // Update status
    await this.prisma.modelConfiguration.update({
      where: { id: configId },
      data: { status: 'building', updatedAt: new Date() },
    });

    // Create a training job record
    const trainingJobId = crypto.randomUUID();

    await this.prisma.trainingJob.create({
      data: {
        id: trainingJobId,
        tenantId,
        datasetId: config.datasetId,
        openaiJobId: '',
        openaiFileId: '',
        baseModel: config.baseModel,
        fineTunedModel: null,
        status: 'pending',
        trainLoss: [],
        trainAccuracy: [],
        validationLoss: [],
        validationAccuracy: [],
        currentEpoch: 0,
        totalEpochs: config.hyperparameters.epochs,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        configId,
      },
    });

    logger.info('Model build initiated', { configId, trainingJobId });

    const estimatedCompletionTime = new Date(
      Date.now() + config.estimatedTrainingTime * 60 * 1000,
    );

    return {
      configId,
      trainingJobId,
      status: 'pending',
      estimatedCompletionTime,
    };
  }

  // ── Get Available Models ────────────────────────────────────────

  getAvailableBaseModels(): Array<{
    id: string;
    name: string;
    maxTokens: number;
    supportedTasks: TaskType[];
  }> {
    return Object.entries(BASE_MODELS).map(([id, info]) => ({
      id,
      ...info,
    }));
  }

  // ── Get Default Hyperparameters ─────────────────────────────────

  getDefaultHyperparameters(taskType: TaskType): HyperparameterConfig {
    const defaults = DEFAULT_HYPERPARAMETERS[taskType];
    if (!defaults) {
      throw new Error(`Unknown task type: ${taskType}`);
    }
    return { ...defaults };
  }

  // ── Private Helpers ─────────────────────────────────────────────

  private generateDefaultSystemPrompt(taskType: TaskType): string {
    const prompts: Record<TaskType, string> = {
      classification: 'You are an expert text classifier. Analyze the given text and classify it into the appropriate category. Respond only with the category label.',
      regression: 'You are a precise numerical estimator. Analyze the given input and provide a numerical score. Respond only with the number.',
      ner: 'You are a named entity recognition expert. Identify and tag all entities in the given text using BIO format.',
      'text-generation': 'You are a skilled Arabic content writer. Generate high-quality, contextually relevant text based on the given prompt.',
      summarization: 'You are an expert summarizer. Create a concise, accurate summary of the given text in Arabic.',
      translation: 'You are a professional translator specializing in Arabic-English translation. Provide accurate, natural-sounding translations.',
    };

    return prompts[taskType];
  }

  private generateDefaultObjective(taskType: TaskType): string {
    const objectives: Record<TaskType, string> = {
      classification: 'Minimize cross-entropy loss for accurate text classification',
      regression: 'Minimize mean squared error for numerical prediction',
      ner: 'Maximize entity detection F1 score with precise boundary detection',
      'text-generation': 'Minimize perplexity while maintaining text coherence and relevance',
      summarization: 'Maximize ROUGE scores while maintaining factual accuracy',
      translation: 'Maximize BLEU score while preserving meaning across languages',
    };

    return objectives[taskType];
  }

  private estimateTrainingTime(sampleCount: number, epochs: number, baseModel: string): number {
    // Returns estimated time in minutes
    const baseTimePerSample: Record<string, number> = {
      'gpt-4o-mini-2024-07-18': 0.02,
      'gpt-4o-2024-08-06': 0.05,
      'gpt-3.5-turbo-0125': 0.01,
    };

    const timePerSample = baseTimePerSample[baseModel] ?? 0.03;
    const totalMinutes = sampleCount * epochs * timePerSample;

    return Math.max(5, Math.ceil(totalMinutes));
  }

  private estimateCost(sampleCount: number, epochs: number, baseModel: string): number {
    // Returns estimated cost in USD
    const costPerSample: Record<string, number> = {
      'gpt-4o-mini-2024-07-18': 0.003,
      'gpt-4o-2024-08-06': 0.025,
      'gpt-3.5-turbo-0125': 0.008,
    };

    const perSample = costPerSample[baseModel] ?? 0.01;
    const totalCost = sampleCount * epochs * perSample;

    return Math.round(totalCost * 100) / 100;
  }

  private toModelConfiguration(record: Record<string, unknown>): ModelConfiguration {
    let hyperparameters: HyperparameterConfig;

    try {
      const raw = record.hyperparameters;
      hyperparameters = typeof raw === 'string' ? JSON.parse(raw) : raw as HyperparameterConfig;
    } catch {
      hyperparameters = DEFAULT_HYPERPARAMETERS.classification;
    }

    let validationErrors: string[];
    try {
      const raw = record.validationErrors;
      validationErrors = typeof raw === 'string' ? JSON.parse(raw) : (raw as string[]) || [];
    } catch {
      validationErrors = [];
    }

    return {
      id: record.id as string,
      name: record.name as string,
      description: (record.description as string) || '',
      tenantId: record.tenantId as string,
      userId: record.userId as string,
      datasetId: record.datasetId as string,
      baseModel: record.baseModel as string,
      taskType: record.taskType as TaskType,
      hyperparameters,
      systemPrompt: (record.systemPrompt as string) || '',
      suffix: (record.suffix as string) || '',
      validationDatasetId: (record.validationDatasetId as string) || null,
      trainingObjective: (record.trainingObjective as string) || '',
      status: (record.status as string) || 'draft',
      validationErrors,
      estimatedTrainingTime: (record.estimatedTrainingTime as number) || 0,
      estimatedCost: (record.estimatedCost as number) || 0,
      createdAt: record.createdAt as Date,
      updatedAt: record.updatedAt as Date,
    };
  }
}
