import { PrismaClient } from '@prisma/client';
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
  defaultMeta: { service: 'hyperparameter-tuning' },
  transports: [new winston.transports.Console()],
});

// ─── Validation Schemas ──────────────────────────────────────────────

const SearchSpaceSchema = z.object({
  epochs: z.array(z.number().int().min(1).max(50)).min(1),
  batchSize: z.array(z.number().int().min(1).max(256)).min(1),
  learningRateMultiplier: z.array(z.number().min(0.01).max(10.0)).min(1),
  warmupSteps: z.array(z.number().int().min(0).max(10000)).optional(),
  weightDecay: z.array(z.number().min(0).max(1)).optional(),
});

const GridSearchSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  configId: z.string().uuid(),
  searchSpace: SearchSpaceSchema,
  maxTrials: z.number().int().min(1).max(500).optional().default(50),
  metric: z.enum(['loss', 'accuracy', 'f1', 'bleu', 'rouge']).optional().default('loss'),
  objective: z.enum(['minimize', 'maximize']).optional().default('minimize'),
});

const RandomSearchSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  configId: z.string().uuid(),
  searchSpace: z.object({
    epochs: z.object({ min: z.number().int().min(1), max: z.number().int().max(50) }),
    batchSize: z.object({ min: z.number().int().min(1), max: z.number().int().max(256) }),
    learningRateMultiplier: z.object({ min: z.number().min(0.01), max: z.number().max(10.0) }),
    warmupSteps: z.object({ min: z.number().int().min(0), max: z.number().int().max(10000) }).optional(),
    weightDecay: z.object({ min: z.number().min(0), max: z.number().max(1) }).optional(),
  }),
  numTrials: z.number().int().min(1).max(200).optional().default(20),
  metric: z.enum(['loss', 'accuracy', 'f1', 'bleu', 'rouge']).optional().default('loss'),
  objective: z.enum(['minimize', 'maximize']).optional().default('minimize'),
  seed: z.number().int().optional(),
});

// ─── Interfaces ──────────────────────────────────────────────────────

export interface HyperparameterSet {
  epochs: number;
  batchSize: number;
  learningRateMultiplier: number;
  warmupSteps: number;
  weightDecay: number;
}

export interface ExperimentTrial {
  id: string;
  experimentId: string;
  trialNumber: number;
  hyperparameters: HyperparameterSet;
  metricValue: number | null;
  metricName: string;
  status: string;
  duration: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface TuningExperiment {
  id: string;
  tenantId: string;
  userId: string;
  configId: string;
  searchStrategy: string;
  metric: string;
  objective: string;
  totalTrials: number;
  completedTrials: number;
  bestTrialId: string | null;
  bestMetricValue: number | null;
  bestHyperparameters: HyperparameterSet | null;
  status: string;
  trials: ExperimentTrial[];
  createdAt: Date;
  updatedAt: Date;
}

export interface LearningRateSchedule {
  name: string;
  description: string;
  formula: string;
  schedule: Array<{ step: number; lr: number }>;
}

// ─── Service ─────────────────────────────────────────────────────────

export class HyperparameterTuningService {
  constructor(private prisma: PrismaClient) {}

  // ── Grid Search ─────────────────────────────────────────────────

  async gridSearch(input: z.infer<typeof GridSearchSchema>): Promise<TuningExperiment> {
    const validated = GridSearchSchema.parse(input);
    const experimentId = crypto.randomUUID();

    logger.info('Starting grid search', { experimentId, configId: validated.configId });

    // Verify config exists
    const config = await this.prisma.modelConfiguration.findFirst({
      where: { id: validated.configId, tenantId: validated.tenantId },
    });

    if (!config) {
      throw new Error(`Model configuration not found: ${validated.configId}`);
    }

    // Generate all combinations
    const combinations = this.generateGridCombinations(validated.searchSpace);

    // Limit to maxTrials
    const limitedCombinations = combinations.slice(0, validated.maxTrials);

    // Create experiment
    const experiment = await this.prisma.tuningExperiment.create({
      data: {
        id: experimentId,
        tenantId: validated.tenantId,
        userId: validated.userId,
        configId: validated.configId,
        searchStrategy: 'grid',
        metric: validated.metric,
        objective: validated.objective,
        totalTrials: limitedCombinations.length,
        completedTrials: 0,
        bestTrialId: null,
        bestMetricValue: null,
        bestHyperparameters: null,
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Create trial records
    const trials: ExperimentTrial[] = [];

    for (let i = 0; i < limitedCombinations.length; i++) {
      const trialId = crypto.randomUUID();
      const params = limitedCombinations[i];

      const trial = await this.prisma.tuningTrial.create({
        data: {
          id: trialId,
          experimentId,
          trialNumber: i + 1,
          hyperparameters: JSON.stringify(params),
          metricValue: null,
          metricName: validated.metric,
          status: 'pending',
          duration: 0,
          startedAt: null,
          completedAt: null,
        },
      });

      trials.push(this.toTrialRecord(trial));
    }

    logger.info('Grid search experiment created', {
      experimentId,
      totalCombinations: combinations.length,
      trials: limitedCombinations.length,
    });

    return {
      id: experimentId,
      tenantId: validated.tenantId,
      userId: validated.userId,
      configId: validated.configId,
      searchStrategy: 'grid',
      metric: validated.metric,
      objective: validated.objective,
      totalTrials: limitedCombinations.length,
      completedTrials: 0,
      bestTrialId: null,
      bestMetricValue: null,
      bestHyperparameters: null,
      status: 'running',
      trials,
      createdAt: experiment.createdAt as Date,
      updatedAt: experiment.updatedAt as Date,
    };
  }

  // ── Random Search ───────────────────────────────────────────────

  async randomSearch(input: z.infer<typeof RandomSearchSchema>): Promise<TuningExperiment> {
    const validated = RandomSearchSchema.parse(input);
    const experimentId = crypto.randomUUID();

    logger.info('Starting random search', { experimentId, configId: validated.configId });

    const config = await this.prisma.modelConfiguration.findFirst({
      where: { id: validated.configId, tenantId: validated.tenantId },
    });

    if (!config) {
      throw new Error(`Model configuration not found: ${validated.configId}`);
    }

    // Generate random combinations
    const seed = validated.seed ?? Date.now();
    const combinations = this.generateRandomCombinations(validated.searchSpace, validated.numTrials, seed);

    const experiment = await this.prisma.tuningExperiment.create({
      data: {
        id: experimentId,
        tenantId: validated.tenantId,
        userId: validated.userId,
        configId: validated.configId,
        searchStrategy: 'random',
        metric: validated.metric,
        objective: validated.objective,
        totalTrials: combinations.length,
        completedTrials: 0,
        bestTrialId: null,
        bestMetricValue: null,
        bestHyperparameters: null,
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const trials: ExperimentTrial[] = [];

    for (let i = 0; i < combinations.length; i++) {
      const trialId = crypto.randomUUID();

      const trial = await this.prisma.tuningTrial.create({
        data: {
          id: trialId,
          experimentId,
          trialNumber: i + 1,
          hyperparameters: JSON.stringify(combinations[i]),
          metricValue: null,
          metricName: validated.metric,
          status: 'pending',
          duration: 0,
          startedAt: null,
          completedAt: null,
        },
      });

      trials.push(this.toTrialRecord(trial));
    }

    logger.info('Random search experiment created', { experimentId, trials: combinations.length });

    return {
      id: experimentId,
      tenantId: validated.tenantId,
      userId: validated.userId,
      configId: validated.configId,
      searchStrategy: 'random',
      metric: validated.metric,
      objective: validated.objective,
      totalTrials: combinations.length,
      completedTrials: 0,
      bestTrialId: null,
      bestMetricValue: null,
      bestHyperparameters: null,
      status: 'running',
      trials,
      createdAt: experiment.createdAt as Date,
      updatedAt: experiment.updatedAt as Date,
    };
  }

  // ── Record Trial Result ─────────────────────────────────────────

  async recordTrialResult(
    trialId: string,
    metricValue: number,
    duration: number,
  ): Promise<ExperimentTrial> {
    const trial = await this.prisma.tuningTrial.findFirst({
      where: { id: trialId },
    });

    if (!trial) {
      throw new Error(`Trial not found: ${trialId}`);
    }

    const typed = trial as Record<string, unknown>;
    const experimentId = typed.experimentId as string;

    const updatedTrial = await this.prisma.tuningTrial.update({
      where: { id: trialId },
      data: {
        metricValue,
        status: 'completed',
        duration,
        completedAt: new Date(),
      },
    });

    // Update experiment
    const completedCount = await this.prisma.tuningTrial.count({
      where: { experimentId, status: 'completed' },
    });

    const experiment = await this.prisma.tuningExperiment.findFirst({
      where: { id: experimentId },
    });

    if (experiment) {
      const expTyped = experiment as Record<string, unknown>;
      const objective = expTyped.objective as string;

      // Find best trial
      const allCompleted = await this.prisma.tuningTrial.findMany({
        where: { experimentId, status: 'completed' },
        orderBy: { metricValue: objective === 'minimize' ? 'asc' : 'desc' },
        take: 1,
      });

      const bestTrial = allCompleted[0] as Record<string, unknown> | undefined;
      const totalTrials = expTyped.totalTrials as number;

      const updateData: Record<string, unknown> = {
        completedTrials: completedCount,
        updatedAt: new Date(),
      };

      if (bestTrial) {
        updateData.bestTrialId = bestTrial.id;
        updateData.bestMetricValue = bestTrial.metricValue;
        updateData.bestHyperparameters = bestTrial.hyperparameters;
      }

      if (completedCount >= totalTrials) {
        updateData.status = 'completed';
      }

      await this.prisma.tuningExperiment.update({
        where: { id: experimentId },
        data: updateData,
      });
    }

    logger.info('Trial result recorded', { trialId, metricValue, duration });

    return this.toTrialRecord(updatedTrial);
  }

  // ── Get Experiment Results ──────────────────────────────────────

  async getExperiment(experimentId: string, tenantId: string): Promise<TuningExperiment | null> {
    const experiment = await this.prisma.tuningExperiment.findFirst({
      where: { id: experimentId, tenantId },
    });

    if (!experiment) return null;

    const trials = await this.prisma.tuningTrial.findMany({
      where: { experimentId },
      orderBy: { trialNumber: 'asc' },
    });

    const typed = experiment as Record<string, unknown>;

    let bestHyperparameters: HyperparameterSet | null = null;
    if (typed.bestHyperparameters) {
      try {
        const raw = typed.bestHyperparameters;
        bestHyperparameters = typeof raw === 'string' ? JSON.parse(raw) : raw as HyperparameterSet;
      } catch {
        bestHyperparameters = null;
      }
    }

    return {
      id: typed.id as string,
      tenantId: typed.tenantId as string,
      userId: typed.userId as string,
      configId: typed.configId as string,
      searchStrategy: typed.searchStrategy as string,
      metric: typed.metric as string,
      objective: typed.objective as string,
      totalTrials: typed.totalTrials as number,
      completedTrials: typed.completedTrials as number,
      bestTrialId: typed.bestTrialId as string | null,
      bestMetricValue: typed.bestMetricValue as number | null,
      bestHyperparameters,
      status: typed.status as string,
      trials: trials.map((t: Record<string, unknown>) => this.toTrialRecord(t)),
      createdAt: typed.createdAt as Date,
      updatedAt: typed.updatedAt as Date,
    };
  }

  // ── List Experiments ────────────────────────────────────────────

  async listExperiments(
    tenantId: string,
    options: { page?: number; limit?: number; configId?: string } = {},
  ): Promise<{ data: TuningExperiment[]; total: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (options.configId) where.configId = options.configId;

    const [experiments, total] = await Promise.all([
      this.prisma.tuningExperiment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tuningExperiment.count({ where }),
    ]);

    const results: TuningExperiment[] = [];

    for (const exp of experiments) {
      const trials = await this.prisma.tuningTrial.findMany({
        where: { experimentId: (exp as Record<string, unknown>).id as string },
        orderBy: { trialNumber: 'asc' },
      });

      const typed = exp as Record<string, unknown>;

      let bestHyperparameters: HyperparameterSet | null = null;
      if (typed.bestHyperparameters) {
        try {
          const raw = typed.bestHyperparameters;
          bestHyperparameters = typeof raw === 'string' ? JSON.parse(raw) : raw as HyperparameterSet;
        } catch {
          bestHyperparameters = null;
        }
      }

      results.push({
        id: typed.id as string,
        tenantId: typed.tenantId as string,
        userId: typed.userId as string,
        configId: typed.configId as string,
        searchStrategy: typed.searchStrategy as string,
        metric: typed.metric as string,
        objective: typed.objective as string,
        totalTrials: typed.totalTrials as number,
        completedTrials: typed.completedTrials as number,
        bestTrialId: typed.bestTrialId as string | null,
        bestMetricValue: typed.bestMetricValue as number | null,
        bestHyperparameters,
        status: typed.status as string,
        trials: trials.map((t: Record<string, unknown>) => this.toTrialRecord(t)),
        createdAt: typed.createdAt as Date,
        updatedAt: typed.updatedAt as Date,
      });
    }

    return { data: results, total };
  }

  // ── Find Best Configuration ─────────────────────────────────────

  async findBestConfiguration(
    experimentId: string,
    tenantId: string,
  ): Promise<{ trial: ExperimentTrial; hyperparameters: HyperparameterSet } | null> {
    const experiment = await this.getExperiment(experimentId, tenantId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    if (!experiment.bestTrialId) return null;

    const bestTrial = experiment.trials.find((t) => t.id === experiment.bestTrialId);
    if (!bestTrial) return null;

    return {
      trial: bestTrial,
      hyperparameters: bestTrial.hyperparameters,
    };
  }

  // ── Learning Rate Schedules ─────────────────────────────────────

  generateLearningRateSchedule(
    scheduleName: string,
    baseLr: number,
    totalSteps: number,
    warmupSteps: number,
  ): LearningRateSchedule {
    const schedule: Array<{ step: number; lr: number }> = [];
    const numPoints = Math.min(100, totalSteps);
    const stepInterval = Math.max(1, Math.floor(totalSteps / numPoints));

    for (let step = 0; step <= totalSteps; step += stepInterval) {
      let lr: number;

      if (step < warmupSteps) {
        // Linear warmup
        lr = baseLr * (step / Math.max(1, warmupSteps));
      } else {
        const progress = (step - warmupSteps) / Math.max(1, totalSteps - warmupSteps);

        switch (scheduleName) {
          case 'linear':
            lr = baseLr * (1 - progress);
            break;

          case 'cosine':
            lr = baseLr * 0.5 * (1 + Math.cos(Math.PI * progress));
            break;

          case 'cosine_with_restarts': {
            const numCycles = 3;
            const cycleProgress = (progress * numCycles) % 1;
            lr = baseLr * 0.5 * (1 + Math.cos(Math.PI * cycleProgress));
            break;
          }

          case 'constant':
            lr = baseLr;
            break;

          case 'polynomial': {
            const power = 2;
            lr = baseLr * Math.pow(1 - progress, power);
            break;
          }

          default:
            lr = baseLr * (1 - progress);
        }
      }

      schedule.push({ step, lr: Math.round(lr * 1e8) / 1e8 });
    }

    const descriptions: Record<string, { desc: string; formula: string }> = {
      linear: {
        desc: 'Linear decay from base learning rate to zero',
        formula: 'lr = base_lr * (1 - progress)',
      },
      cosine: {
        desc: 'Cosine annealing schedule with smooth decay',
        formula: 'lr = base_lr * 0.5 * (1 + cos(pi * progress))',
      },
      cosine_with_restarts: {
        desc: 'Cosine schedule with periodic warm restarts',
        formula: 'lr = base_lr * 0.5 * (1 + cos(pi * cycle_progress))',
      },
      constant: {
        desc: 'Constant learning rate throughout training',
        formula: 'lr = base_lr',
      },
      polynomial: {
        desc: 'Polynomial decay with configurable power',
        formula: 'lr = base_lr * (1 - progress)^power',
      },
    };

    const info = descriptions[scheduleName] || descriptions.linear;

    return {
      name: scheduleName,
      description: info.desc,
      formula: info.formula,
      schedule,
    };
  }

  // ── Private Helpers ─────────────────────────────────────────────

  private generateGridCombinations(
    space: z.infer<typeof SearchSpaceSchema>,
  ): HyperparameterSet[] {
    const combinations: HyperparameterSet[] = [];
    const warmupValues = space.warmupSteps || [100];
    const decayValues = space.weightDecay || [0.01];

    for (const epochs of space.epochs) {
      for (const batchSize of space.batchSize) {
        for (const lr of space.learningRateMultiplier) {
          for (const warmup of warmupValues) {
            for (const decay of decayValues) {
              combinations.push({
                epochs,
                batchSize,
                learningRateMultiplier: lr,
                warmupSteps: warmup,
                weightDecay: decay,
              });
            }
          }
        }
      }
    }

    return combinations;
  }

  private generateRandomCombinations(
    space: {
      epochs: { min: number; max: number };
      batchSize: { min: number; max: number };
      learningRateMultiplier: { min: number; max: number };
      warmupSteps?: { min: number; max: number };
      weightDecay?: { min: number; max: number };
    },
    numTrials: number,
    seed: number,
  ): HyperparameterSet[] {
    const combinations: HyperparameterSet[] = [];
    let currentSeed = seed;

    const nextRandom = (): number => {
      currentSeed = (currentSeed * 16807) % 2147483647;
      return (currentSeed - 1) / 2147483646;
    };

    const randInt = (min: number, max: number): number => {
      return Math.floor(nextRandom() * (max - min + 1)) + min;
    };

    const randFloat = (min: number, max: number): number => {
      return Math.round((nextRandom() * (max - min) + min) * 10000) / 10000;
    };

    for (let i = 0; i < numTrials; i++) {
      combinations.push({
        epochs: randInt(space.epochs.min, space.epochs.max),
        batchSize: randInt(space.batchSize.min, space.batchSize.max),
        learningRateMultiplier: randFloat(space.learningRateMultiplier.min, space.learningRateMultiplier.max),
        warmupSteps: space.warmupSteps
          ? randInt(space.warmupSteps.min, space.warmupSteps.max)
          : 100,
        weightDecay: space.weightDecay
          ? randFloat(space.weightDecay.min, space.weightDecay.max)
          : 0.01,
      });
    }

    return combinations;
  }

  private toTrialRecord(record: Record<string, unknown>): ExperimentTrial {
    let hyperparameters: HyperparameterSet;
    try {
      const raw = record.hyperparameters;
      hyperparameters = typeof raw === 'string' ? JSON.parse(raw) : raw as HyperparameterSet;
    } catch {
      hyperparameters = {
        epochs: 3,
        batchSize: 8,
        learningRateMultiplier: 1.0,
        warmupSteps: 100,
        weightDecay: 0.01,
      };
    }

    return {
      id: record.id as string,
      experimentId: record.experimentId as string,
      trialNumber: record.trialNumber as number,
      hyperparameters,
      metricValue: record.metricValue as number | null,
      metricName: (record.metricName as string) || 'loss',
      status: (record.status as string) || 'pending',
      duration: (record.duration as number) || 0,
      startedAt: record.startedAt as Date | null,
      completedAt: record.completedAt as Date | null,
    };
  }
}
