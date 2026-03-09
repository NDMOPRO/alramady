import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import winston from 'winston';
import { z } from 'zod';

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'model-registry' },
  transports: [new winston.transports.Console()],
});

// ─── Validation Schemas ──────────────────────────────────────────────

const RegisterModelSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  modelId: z.string().min(1),
  baseModel: z.string().min(1),
  taskType: z.string().min(1),
  datasetId: z.string().uuid(),
  configId: z.string().uuid().optional(),
  trainingJobId: z.string().uuid().optional(),
  metrics: z.record(z.string(), z.number()).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
  artifacts: z.array(z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    path: z.string().min(1),
    size: z.number().int().min(0),
  })).optional().default([]),
});

const UpdateModelSchema = z.object({
  description: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
});

// ─── Interfaces ──────────────────────────────────────────────────────

export interface RegisteredModel {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  description: string;
  modelId: string;
  baseModel: string;
  taskType: string;
  datasetId: string;
  configId: string | null;
  trainingJobId: string | null;
  version: number;
  status: 'registered' | 'staging' | 'production' | 'archived' | 'deprecated';
  metrics: Record<string, number>;
  tags: string[];
  artifacts: ModelArtifact[];
  lineage: ModelLineage;
  createdAt: Date;
  updatedAt: Date;
  promotedAt: Date | null;
  archivedAt: Date | null;
}

export interface ModelArtifact {
  name: string;
  type: string;
  path: string;
  size: number;
}

export interface ModelLineage {
  baseModel: string;
  datasetId: string;
  datasetVersion: number | null;
  configId: string | null;
  trainingJobId: string | null;
  parentModelId: string | null;
  evaluationIds: string[];
}

export interface ModelVersionHistory {
  version: number;
  status: string;
  metrics: Record<string, number>;
  changedBy: string;
  changedAt: Date;
  description: string;
}

export interface ModelComparisonResult {
  models: Array<{
    id: string;
    name: string;
    version: number;
    status: string;
    metrics: Record<string, number>;
  }>;
  metricComparison: Record<string, Record<string, number>>;
  recommendation: string;
}

// ─── Service ─────────────────────────────────────────────────────────

export class ModelRegistryService {
  private artifactBasePath: string;

  constructor(private prisma: PrismaClient) {
    this.artifactBasePath = process.env.MODEL_ARTIFACT_PATH || '/data/rasid/models';
  }

  // ── Register Model ──────────────────────────────────────────────

  async registerModel(input: z.infer<typeof RegisterModelSchema>): Promise<RegisteredModel> {
    const validated = RegisterModelSchema.parse(input);
    const id = crypto.randomUUID();

    logger.info('Registering model', { id, name: validated.name, modelId: validated.modelId });

    // Determine version (increment if name exists for tenant)
    const existingModels = await this.prisma.registeredModel.findMany({
      where: { tenantId: validated.tenantId, name: validated.name },
      orderBy: { version: 'desc' },
      take: 1,
    });

    const version = existingModels.length > 0
      ? ((existingModels[0] as Record<string, unknown>).version as number) + 1
      : 1;

    // Build lineage
    const lineage: ModelLineage = {
      baseModel: validated.baseModel,
      datasetId: validated.datasetId,
      datasetVersion: null,
      configId: validated.configId || null,
      trainingJobId: validated.trainingJobId || null,
      parentModelId: existingModels.length > 0
        ? (existingModels[0] as Record<string, unknown>).id as string
        : null,
      evaluationIds: [],
    };

    // Get dataset version
    const dataset = await this.prisma.trainingDataset.findFirst({
      where: { id: validated.datasetId },
    });

    if (dataset) {
      lineage.datasetVersion = (dataset as Record<string, unknown>).version as number;
    }

    // Get evaluation IDs for this model
    const evaluations = await this.prisma.evaluationResult.findMany({
      where: { tenantId: validated.tenantId, modelId: validated.modelId },
      select: { id: true },
    });

    lineage.evaluationIds = evaluations.map((e: Record<string, unknown>) => e.id as string);

    const model = await this.prisma.registeredModel.create({
      data: {
        id,
        tenantId: validated.tenantId,
        userId: validated.userId,
        name: validated.name,
        description: validated.description,
        modelId: validated.modelId,
        baseModel: validated.baseModel,
        taskType: validated.taskType,
        datasetId: validated.datasetId,
        configId: validated.configId || null,
        trainingJobId: validated.trainingJobId || null,
        version,
        status: 'registered',
        metrics: JSON.stringify(validated.metrics),
        tags: validated.tags,
        artifacts: JSON.stringify(validated.artifacts),
        lineage: JSON.stringify(lineage),
        createdAt: new Date(),
        updatedAt: new Date(),
        promotedAt: null,
        archivedAt: null,
      },
    });

    // Create version history entry
    await this.prisma.modelVersionHistory.create({
      data: {
        id: crypto.randomUUID(),
        registeredModelId: id,
        version,
        status: 'registered',
        metrics: JSON.stringify(validated.metrics),
        changedBy: validated.userId,
        changedAt: new Date(),
        description: 'Model registered',
      },
    });

    logger.info('Model registered', { id, version });

    return this.toRegisteredModel(model);
  }

  // ── Get Model ───────────────────────────────────────────────────

  async getModel(modelRegistryId: string, tenantId: string): Promise<RegisteredModel | null> {
    const model = await this.prisma.registeredModel.findFirst({
      where: { id: modelRegistryId, tenantId },
    });

    if (!model) return null;
    return this.toRegisteredModel(model);
  }

  // ── List Models ─────────────────────────────────────────────────

  async listModels(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      taskType?: string;
      search?: string;
    } = {},
  ): Promise<{ data: RegisteredModel[]; total: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (options.status) where.status = options.status;
    if (options.taskType) where.taskType = options.taskType;
    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { description: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [models, total] = await Promise.all([
      this.prisma.registeredModel.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.registeredModel.count({ where }),
    ]);

    return {
      data: models.map((m: Record<string, unknown>) => this.toRegisteredModel(m)),
      total,
    };
  }

  // ── Update Model ────────────────────────────────────────────────

  async updateModel(
    modelRegistryId: string,
    tenantId: string,
    input: z.infer<typeof UpdateModelSchema>,
  ): Promise<RegisteredModel> {
    const validated = UpdateModelSchema.parse(input);

    const existing = await this.prisma.registeredModel.findFirst({
      where: { id: modelRegistryId, tenantId },
    });

    if (!existing) {
      throw new Error(`Model not found: ${modelRegistryId}`);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.tags !== undefined) updateData.tags = validated.tags;

    const updated = await this.prisma.registeredModel.update({
      where: { id: modelRegistryId },
      data: updateData,
    });

    return this.toRegisteredModel(updated);
  }

  // ── Promote Model ───────────────────────────────────────────────

  async promoteModel(
    modelRegistryId: string,
    tenantId: string,
    userId: string,
    targetStatus: 'staging' | 'production',
  ): Promise<RegisteredModel> {
    const model = await this.prisma.registeredModel.findFirst({
      where: { id: modelRegistryId, tenantId },
    });

    if (!model) {
      throw new Error(`Model not found: ${modelRegistryId}`);
    }

    const typed = model as Record<string, unknown>;
    const currentStatus = typed.status as string;

    // Validate promotion path
    const validPromotions: Record<string, string[]> = {
      registered: ['staging'],
      staging: ['production'],
      production: [],
      archived: ['staging'],
      deprecated: [],
    };

    if (!validPromotions[currentStatus]?.includes(targetStatus)) {
      throw new Error(`Cannot promote from "${currentStatus}" to "${targetStatus}"`);
    }

    // If promoting to production, archive current production model of same name
    if (targetStatus === 'production') {
      const name = typed.name as string;
      await this.prisma.registeredModel.updateMany({
        where: {
          tenantId,
          name,
          status: 'production',
          id: { not: modelRegistryId },
        },
        data: {
          status: 'archived',
          archivedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    const updated = await this.prisma.registeredModel.update({
      where: { id: modelRegistryId },
      data: {
        status: targetStatus,
        promotedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Record history
    await this.prisma.modelVersionHistory.create({
      data: {
        id: crypto.randomUUID(),
        registeredModelId: modelRegistryId,
        version: typed.version as number,
        status: targetStatus,
        metrics: typed.metrics as string,
        changedBy: userId,
        changedAt: new Date(),
        description: `Promoted to ${targetStatus}`,
      },
    });

    logger.info('Model promoted', { modelRegistryId, from: currentStatus, to: targetStatus });

    return this.toRegisteredModel(updated);
  }

  // ── Archive Model ───────────────────────────────────────────────

  async archiveModel(modelRegistryId: string, tenantId: string, userId: string): Promise<RegisteredModel> {
    const model = await this.prisma.registeredModel.findFirst({
      where: { id: modelRegistryId, tenantId },
    });

    if (!model) {
      throw new Error(`Model not found: ${modelRegistryId}`);
    }

    const typed = model as Record<string, unknown>;

    const updated = await this.prisma.registeredModel.update({
      where: { id: modelRegistryId },
      data: {
        status: 'archived',
        archivedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await this.prisma.modelVersionHistory.create({
      data: {
        id: crypto.randomUUID(),
        registeredModelId: modelRegistryId,
        version: typed.version as number,
        status: 'archived',
        metrics: typed.metrics as string,
        changedBy: userId,
        changedAt: new Date(),
        description: 'Model archived',
      },
    });

    logger.info('Model archived', { modelRegistryId });

    return this.toRegisteredModel(updated);
  }

  // ── Rollback ────────────────────────────────────────────────────

  async rollbackToVersion(
    tenantId: string,
    userId: string,
    modelName: string,
    targetVersion: number,
  ): Promise<RegisteredModel> {
    const targetModel = await this.prisma.registeredModel.findFirst({
      where: { tenantId, name: modelName, version: targetVersion },
    });

    if (!targetModel) {
      throw new Error(`Model version not found: ${modelName} v${targetVersion}`);
    }

    const typed = targetModel as Record<string, unknown>;

    // Archive current production
    await this.prisma.registeredModel.updateMany({
      where: { tenantId, name: modelName, status: 'production' },
      data: {
        status: 'archived',
        archivedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Promote target to production
    const updated = await this.prisma.registeredModel.update({
      where: { id: typed.id as string },
      data: {
        status: 'production',
        promotedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await this.prisma.modelVersionHistory.create({
      data: {
        id: crypto.randomUUID(),
        registeredModelId: typed.id as string,
        version: targetVersion,
        status: 'production',
        metrics: typed.metrics as string,
        changedBy: userId,
        changedAt: new Date(),
        description: `Rolled back to version ${targetVersion}`,
      },
    });

    logger.info('Model rolled back', { modelName, targetVersion });

    return this.toRegisteredModel(updated);
  }

  // ── Get Version History ─────────────────────────────────────────

  async getVersionHistory(modelRegistryId: string, tenantId: string): Promise<ModelVersionHistory[]> {
    const model = await this.prisma.registeredModel.findFirst({
      where: { id: modelRegistryId, tenantId },
    });

    if (!model) {
      throw new Error(`Model not found: ${modelRegistryId}`);
    }

    const history = await this.prisma.modelVersionHistory.findMany({
      where: { registeredModelId: modelRegistryId },
      orderBy: { changedAt: 'desc' },
    });

    return history.map((h: Record<string, unknown>) => {
      let metrics: Record<string, number>;
      try {
        const raw = h.metrics;
        metrics = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, number>) || {};
      } catch {
        metrics = {};
      }

      return {
        version: h.version as number,
        status: h.status as string,
        metrics,
        changedBy: h.changedBy as string,
        changedAt: h.changedAt as Date,
        description: h.description as string,
      };
    });
  }

  // ── Compare Models ──────────────────────────────────────────────

  async compareModels(
    tenantId: string,
    modelIds: string[],
  ): Promise<ModelComparisonResult> {
    const models: Array<{
      id: string;
      name: string;
      version: number;
      status: string;
      metrics: Record<string, number>;
    }> = [];

    for (const modelId of modelIds) {
      const model = await this.prisma.registeredModel.findFirst({
        where: { id: modelId, tenantId },
      });

      if (model) {
        const typed = model as Record<string, unknown>;
        let metrics: Record<string, number>;
        try {
          const raw = typed.metrics;
          metrics = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, number>) || {};
        } catch {
          metrics = {};
        }

        models.push({
          id: typed.id as string,
          name: typed.name as string,
          version: typed.version as number,
          status: typed.status as string,
          metrics,
        });
      }
    }

    // Build metric comparison
    const allMetricNames = new Set<string>();
    for (const model of models) {
      Object.keys(model.metrics).forEach((k) => allMetricNames.add(k));
    }

    const metricComparison: Record<string, Record<string, number>> = {};
    for (const metricName of allMetricNames) {
      metricComparison[metricName] = {};
      for (const model of models) {
        metricComparison[metricName][model.id] = model.metrics[metricName] ?? 0;
      }
    }

    // Determine recommendation
    let recommendation = 'Unable to determine a recommendation.';
    if (models.length >= 2) {
      const scores = models.map((m) => {
        const values = Object.values(m.metrics);
        const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        return { id: m.id, name: m.name, avg };
      });
      scores.sort((a, b) => b.avg - a.avg);
      recommendation = `Model "${scores[0].name}" has the highest average metric scores and is recommended for production deployment.`;
    }

    return {
      models,
      metricComparison,
      recommendation,
    };
  }

  // ── Get Model Lineage ──────────────────────────────────────────

  async getModelLineage(modelRegistryId: string, tenantId: string): Promise<{
    current: RegisteredModel;
    ancestors: RegisteredModel[];
    lineage: ModelLineage;
  }> {
    const model = await this.getModel(modelRegistryId, tenantId);
    if (!model) {
      throw new Error(`Model not found: ${modelRegistryId}`);
    }

    const ancestors: RegisteredModel[] = [];
    let currentLineage = model.lineage;

    while (currentLineage.parentModelId) {
      const parent = await this.prisma.registeredModel.findFirst({
        where: { id: currentLineage.parentModelId },
      });

      if (!parent) break;

      const parentModel = this.toRegisteredModel(parent);
      ancestors.push(parentModel);
      currentLineage = parentModel.lineage;
    }

    return {
      current: model,
      ancestors,
      lineage: model.lineage,
    };
  }

  // ── Artifact Management ─────────────────────────────────────────

  async getArtifactPath(modelRegistryId: string, tenantId: string): Promise<string> {
    const model = await this.prisma.registeredModel.findFirst({
      where: { id: modelRegistryId, tenantId },
    });

    if (!model) {
      throw new Error(`Model not found: ${modelRegistryId}`);
    }

    const artifactDir = path.join(this.artifactBasePath, tenantId, modelRegistryId);

    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }

    return artifactDir;
  }

  // ── Private Helpers ─────────────────────────────────────────────

  private toRegisteredModel(record: Record<string, unknown>): RegisteredModel {
    let metrics: Record<string, number>;
    let artifacts: ModelArtifact[];
    let lineage: ModelLineage;

    try {
      const raw = record.metrics;
      metrics = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, number>) || {};
    } catch {
      metrics = {};
    }

    try {
      const raw = record.artifacts;
      artifacts = typeof raw === 'string' ? JSON.parse(raw) : (raw as ModelArtifact[]) || [];
    } catch {
      artifacts = [];
    }

    try {
      const raw = record.lineage;
      lineage = typeof raw === 'string' ? JSON.parse(raw) : (raw as ModelLineage) || {
        baseModel: record.baseModel as string,
        datasetId: record.datasetId as string,
        datasetVersion: null,
        configId: null,
        trainingJobId: null,
        parentModelId: null,
        evaluationIds: [],
      };
    } catch {
      lineage = {
        baseModel: record.baseModel as string,
        datasetId: record.datasetId as string,
        datasetVersion: null,
        configId: null,
        trainingJobId: null,
        parentModelId: null,
        evaluationIds: [],
      };
    }

    return {
      id: record.id as string,
      tenantId: record.tenantId as string,
      userId: record.userId as string,
      name: record.name as string,
      description: (record.description as string) || '',
      modelId: record.modelId as string,
      baseModel: record.baseModel as string,
      taskType: record.taskType as string,
      datasetId: record.datasetId as string,
      configId: (record.configId as string) || null,
      trainingJobId: (record.trainingJobId as string) || null,
      version: (record.version as number) || 1,
      status: (record.status as string) as RegisteredModel['status'],
      metrics,
      tags: (record.tags as string[]) || [],
      artifacts,
      lineage,
      createdAt: record.createdAt as Date,
      updatedAt: record.updatedAt as Date,
      promotedAt: (record.promotedAt as Date) || null,
      archivedAt: (record.archivedAt as Date) || null,
    };
  }
}
