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
  defaultMeta: { service: 'deployment-manager' },
  transports: [new winston.transports.Console()],
});

// ─── Validation Schemas ──────────────────────────────────────────────

const DeployModelSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  registeredModelId: z.string().uuid(),
  environment: z.enum(['staging', 'production']).default('staging'),
  strategy: z.enum(['direct', 'canary', 'ab_test']).default('direct'),
  canaryConfig: z.object({
    trafficPercentage: z.number().min(1).max(99).default(10),
    evaluationPeriodMinutes: z.number().int().min(5).max(1440).default(60),
    successThreshold: z.number().min(0).max(1).default(0.95),
    rollbackOnFailure: z.boolean().default(true),
  }).optional(),
  abTestConfig: z.object({
    variantModelId: z.string().uuid(),
    trafficSplit: z.number().min(10).max(90).default(50),
    durationMinutes: z.number().int().min(60).max(43200).default(1440),
    primaryMetric: z.string().min(1).default('accuracy'),
  }).optional(),
  rateLimits: z.object({
    requestsPerMinute: z.number().int().min(1).max(10000).default(60),
    requestsPerHour: z.number().int().min(1).max(100000).default(1000),
    maxConcurrent: z.number().int().min(1).max(1000).default(10),
  }).optional(),
});

// ─── Interfaces ──────────────────────────────────────────────────────

export interface Deployment {
  id: string;
  tenantId: string;
  userId: string;
  registeredModelId: string;
  modelId: string;
  environment: string;
  strategy: string;
  status: 'deploying' | 'active' | 'draining' | 'rolled_back' | 'failed' | 'completed';
  canaryConfig: CanaryConfig | null;
  abTestConfig: ABTestConfig | null;
  rateLimits: RateLimits;
  healthStatus: HealthStatus;
  metrics: DeploymentMetrics;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CanaryConfig {
  trafficPercentage: number;
  evaluationPeriodMinutes: number;
  successThreshold: number;
  rollbackOnFailure: boolean;
}

export interface ABTestConfig {
  variantModelId: string;
  trafficSplit: number;
  durationMinutes: number;
  primaryMetric: string;
  controlMetrics: Record<string, number>;
  variantMetrics: Record<string, number>;
}

export interface RateLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  maxConcurrent: number;
}

export interface HealthStatus {
  isHealthy: boolean;
  lastCheck: Date | null;
  uptime: number;
  errorRate: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  consecutiveFailures: number;
}

export interface DeploymentMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  totalTokensUsed: number;
  requestsPerMinute: number;
}

export interface DeploymentEvent {
  id: string;
  deploymentId: string;
  eventType: string;
  message: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

// ─── Service ─────────────────────────────────────────────────────────

export class DeploymentManagerService {
  private openai: OpenAI;
  private healthCheckTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  // ── Deploy Model ────────────────────────────────────────────────

  async deployModel(input: z.infer<typeof DeployModelSchema>): Promise<Deployment> {
    const validated = DeployModelSchema.parse(input);
    const deploymentId = crypto.randomUUID();

    logger.info('Deploying model', {
      deploymentId,
      registeredModelId: validated.registeredModelId,
      strategy: validated.strategy,
    });

    // Verify model exists and is in correct state
    const model = await this.prisma.registeredModel.findFirst({
      where: { id: validated.registeredModelId, tenantId: validated.tenantId },
    });

    if (!model) {
      throw new Error(`Registered model not found: ${validated.registeredModelId}`);
    }

    const modelTyped = model as Record<string, unknown>;
    const modelId = modelTyped.modelId as string;
    const modelStatus = modelTyped.status as string;

    if (!['registered', 'staging', 'production'].includes(modelStatus)) {
      throw new Error(`Model is in "${modelStatus}" state and cannot be deployed`);
    }

    // Check for existing active deployment with same model in same environment
    const existingDeployment = await this.prisma.deployment.findFirst({
      where: {
        tenantId: validated.tenantId,
        registeredModelId: validated.registeredModelId,
        environment: validated.environment,
        status: 'active',
      },
    });

    if (existingDeployment) {
      throw new Error(`Model already has an active deployment in ${validated.environment}`);
    }

    // Validate model is accessible via OpenAI
    try {
      await this.openai.models.retrieve(modelId);
    } catch (err) {
      logger.warn('Could not verify model access', { modelId, error: err instanceof Error ? err.message : String(err) });
    }

    const rateLimits: RateLimits = validated.rateLimits ?? {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      maxConcurrent: 10,
    };

    const healthStatus: HealthStatus = {
      isHealthy: true,
      lastCheck: null,
      uptime: 0,
      errorRate: 0,
      avgLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      consecutiveFailures: 0,
    };

    const metrics: DeploymentMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      totalTokensUsed: 0,
      requestsPerMinute: 0,
    };

    let canaryConfig: CanaryConfig | null = null;
    let abTestConfig: ABTestConfig | null = null;

    if (validated.strategy === 'canary' && validated.canaryConfig) {
      canaryConfig = {
        trafficPercentage: validated.canaryConfig.trafficPercentage,
        evaluationPeriodMinutes: validated.canaryConfig.evaluationPeriodMinutes,
        successThreshold: validated.canaryConfig.successThreshold,
        rollbackOnFailure: validated.canaryConfig.rollbackOnFailure,
      };
    }

    if (validated.strategy === 'ab_test' && validated.abTestConfig) {
      abTestConfig = {
        variantModelId: validated.abTestConfig.variantModelId,
        trafficSplit: validated.abTestConfig.trafficSplit,
        durationMinutes: validated.abTestConfig.durationMinutes,
        primaryMetric: validated.abTestConfig.primaryMetric,
        controlMetrics: {},
        variantMetrics: {},
      };
    }

    const deployment = await this.prisma.deployment.create({
      data: {
        id: deploymentId,
        tenantId: validated.tenantId,
        userId: validated.userId,
        registeredModelId: validated.registeredModelId,
        modelId,
        environment: validated.environment,
        strategy: validated.strategy,
        status: 'deploying',
        canaryConfig: canaryConfig ? JSON.stringify(canaryConfig) : null,
        abTestConfig: abTestConfig ? JSON.stringify(abTestConfig) : null,
        rateLimits: JSON.stringify(rateLimits),
        healthStatus: JSON.stringify(healthStatus),
        metrics: JSON.stringify(metrics),
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      },
    });

    // Record deployment event
    await this.recordEvent(deploymentId, 'deployment_started', 'Deployment initiated', {
      strategy: validated.strategy,
      environment: validated.environment,
    });

    // Activate deployment (in production, this would involve actual infrastructure changes)
    await this.activateDeployment(deploymentId, validated.tenantId);

    // Start health monitoring
    this.startHealthMonitoring(deploymentId, validated.tenantId, modelId);

    return this.toDeployment(deployment);
  }

  // ── Get Deployment ──────────────────────────────────────────────

  async getDeployment(deploymentId: string, tenantId: string): Promise<Deployment | null> {
    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deploymentId, tenantId },
    });

    if (!deployment) return null;
    return this.toDeployment(deployment);
  }

  // ── List Deployments ────────────────────────────────────────────

  async listDeployments(
    tenantId: string,
    options: { environment?: string; status?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: Deployment[]; total: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (options.environment) where.environment = options.environment;
    if (options.status) where.status = options.status;

    const [deployments, total] = await Promise.all([
      this.prisma.deployment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.deployment.count({ where }),
    ]);

    return {
      data: deployments.map((d: Record<string, unknown>) => this.toDeployment(d)),
      total,
    };
  }

  // ── Rollback Deployment ─────────────────────────────────────────

  async rollbackDeployment(deploymentId: string, tenantId: string, userId: string): Promise<Deployment> {
    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deploymentId, tenantId },
    });

    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const typed = deployment as Record<string, unknown>;

    if (typed.status !== 'active') {
      throw new Error(`Cannot rollback deployment in "${typed.status}" state`);
    }

    // Stop health monitoring
    this.stopHealthMonitoring(deploymentId);

    const updated = await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'rolled_back',
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await this.recordEvent(deploymentId, 'deployment_rolled_back', 'Deployment rolled back', {
      rolledBackBy: userId,
    });

    logger.info('Deployment rolled back', { deploymentId });

    return this.toDeployment(updated);
  }

  // ── Update Rate Limits ──────────────────────────────────────────

  async updateRateLimits(
    deploymentId: string,
    tenantId: string,
    rateLimits: RateLimits,
  ): Promise<Deployment> {
    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deploymentId, tenantId, status: 'active' },
    });

    if (!deployment) {
      throw new Error(`Active deployment not found: ${deploymentId}`);
    }

    const updated = await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        rateLimits: JSON.stringify(rateLimits),
        updatedAt: new Date(),
      },
    });

    await this.recordEvent(deploymentId, 'rate_limits_updated', 'Rate limits updated', { rateLimits });

    return this.toDeployment(updated);
  }

  // ── Get Health Status ───────────────────────────────────────────

  async getHealthStatus(deploymentId: string, tenantId: string): Promise<HealthStatus> {
    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deploymentId, tenantId },
    });

    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const typed = deployment as Record<string, unknown>;

    try {
      const raw = typed.healthStatus;
      return typeof raw === 'string' ? JSON.parse(raw) : raw as HealthStatus;
    } catch {
      return {
        isHealthy: false,
        lastCheck: null,
        uptime: 0,
        errorRate: 0,
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        consecutiveFailures: 0,
      };
    }
  }

  // ── Record Request Metrics ──────────────────────────────────────

  async recordRequest(
    deploymentId: string,
    tenantId: string,
    success: boolean,
    responseTimeMs: number,
    tokensUsed: number,
  ): Promise<void> {
    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deploymentId, tenantId, status: 'active' },
    });

    if (!deployment) return;

    const typed = deployment as Record<string, unknown>;

    let metrics: DeploymentMetrics;
    try {
      const raw = typed.metrics;
      metrics = typeof raw === 'string' ? JSON.parse(raw) : raw as DeploymentMetrics;
    } catch {
      metrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgResponseTime: 0,
        totalTokensUsed: 0,
        requestsPerMinute: 0,
      };
    }

    metrics.totalRequests++;
    if (success) {
      metrics.successfulRequests++;
    } else {
      metrics.failedRequests++;
    }

    // Running average for response time
    metrics.avgResponseTime = (
      (metrics.avgResponseTime * (metrics.totalRequests - 1) + responseTimeMs) /
      metrics.totalRequests
    );
    metrics.totalTokensUsed += tokensUsed;

    // Update health status
    let healthStatus: HealthStatus;
    try {
      const raw = typed.healthStatus;
      healthStatus = typeof raw === 'string' ? JSON.parse(raw) : raw as HealthStatus;
    } catch {
      healthStatus = {
        isHealthy: true,
        lastCheck: new Date(),
        uptime: 0,
        errorRate: 0,
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        consecutiveFailures: 0,
      };
    }

    healthStatus.errorRate = metrics.totalRequests > 0
      ? metrics.failedRequests / metrics.totalRequests
      : 0;
    healthStatus.avgLatency = metrics.avgResponseTime;
    healthStatus.lastCheck = new Date();

    if (!success) {
      healthStatus.consecutiveFailures++;
      if (healthStatus.consecutiveFailures >= 5) {
        healthStatus.isHealthy = false;
      }
    } else {
      healthStatus.consecutiveFailures = 0;
    }

    await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        metrics: JSON.stringify(metrics),
        healthStatus: JSON.stringify(healthStatus),
        updatedAt: new Date(),
      },
    });
  }

  // ── Get Deployment Events ───────────────────────────────────────

  async getDeploymentEvents(
    deploymentId: string,
    tenantId: string,
    limit: number = 50,
  ): Promise<DeploymentEvent[]> {
    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deploymentId, tenantId },
    });

    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const events = await this.prisma.deploymentEvent.findMany({
      where: { deploymentId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return events.map((e: Record<string, unknown>) => {
      let metadata: Record<string, unknown>;
      try {
        const raw = e.metadata;
        metadata = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>) || {};
      } catch {
        metadata = {};
      }

      return {
        id: e.id as string,
        deploymentId: e.deploymentId as string,
        eventType: e.eventType as string,
        message: e.message as string,
        metadata,
        timestamp: e.timestamp as Date,
      };
    });
  }

  // ── Stop All Monitoring ─────────────────────────────────────────

  stopAllMonitoring(): void {
    for (const [deploymentId, timer] of this.healthCheckTimers) {
      clearInterval(timer);
      logger.info('Stopped health monitoring', { deploymentId });
    }
    this.healthCheckTimers.clear();
  }

  // ── Private Helpers ─────────────────────────────────────────────

  private async activateDeployment(deploymentId: string, tenantId: string): Promise<void> {
    // Mark previous active deployments in same environment as draining
    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deploymentId },
    });

    if (!deployment) return;

    const typed = deployment as Record<string, unknown>;
    const environment = typed.environment as string;
    const registeredModelId = typed.registeredModelId as string;

    // Drain previous deployments for the same model in same environment
    await this.prisma.deployment.updateMany({
      where: {
        tenantId,
        environment,
        status: 'active',
        id: { not: deploymentId },
        registeredModelId,
      },
      data: {
        status: 'draining',
        updatedAt: new Date(),
      },
    });

    // Activate current deployment
    await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'active',
        updatedAt: new Date(),
      },
    });

    await this.recordEvent(deploymentId, 'deployment_activated', 'Deployment is now active', {
      environment,
    });
  }

  private startHealthMonitoring(deploymentId: string, tenantId: string, modelId: string): void {
    const checkInterval = 60_000; // 1 minute

    const timer = setInterval(async () => {
      try {
        const deployment = await this.prisma.deployment.findFirst({
          where: { id: deploymentId, tenantId },
        });

        if (!deployment) {
          this.stopHealthMonitoring(deploymentId);
          return;
        }

        const typed = deployment as Record<string, unknown>;
        const status = typed.status as string;

        if (status !== 'active') {
          this.stopHealthMonitoring(deploymentId);
          return;
        }

        // Perform health check by attempting a simple completion
        const startTime = Date.now();
        let isHealthy = true;

        try {
          await this.openai.chat.completions.create({
            model: modelId,
            messages: [{ role: 'user', content: 'Health check' }],
            max_tokens: 5,
            temperature: 0,
          });
        } catch {
          isHealthy = false;
        }

        const latency = Date.now() - startTime;

        let healthStatus: HealthStatus;
        try {
          const raw = typed.healthStatus;
          healthStatus = typeof raw === 'string' ? JSON.parse(raw) : raw as HealthStatus;
        } catch {
          healthStatus = {
            isHealthy: true,
            lastCheck: new Date(),
            uptime: 0,
            errorRate: 0,
            avgLatency: 0,
            p95Latency: 0,
            p99Latency: 0,
            consecutiveFailures: 0,
          };
        }

        healthStatus.lastCheck = new Date();
        healthStatus.isHealthy = isHealthy;
        healthStatus.avgLatency = (healthStatus.avgLatency + latency) / 2;

        if (!isHealthy) {
          healthStatus.consecutiveFailures++;

          if (healthStatus.consecutiveFailures >= 3) {
            await this.recordEvent(deploymentId, 'health_check_failed',
              `Health check failed ${healthStatus.consecutiveFailures} consecutive times`, {
                latency,
                consecutiveFailures: healthStatus.consecutiveFailures,
              });
          }
        } else {
          healthStatus.consecutiveFailures = 0;
          healthStatus.uptime += checkInterval / 1000;
        }

        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            healthStatus: JSON.stringify(healthStatus),
            updatedAt: new Date(),
          },
        });

        // Auto-rollback on sustained failures for canary deployments
        if (healthStatus.consecutiveFailures >= 5) {
          let canaryConfig: CanaryConfig | null = null;
          try {
            const raw = typed.canaryConfig;
            if (raw) canaryConfig = typeof raw === 'string' ? JSON.parse(raw) : raw as CanaryConfig;
          } catch {
            canaryConfig = null;
          }

          if (canaryConfig?.rollbackOnFailure) {
            logger.warn('Auto-rolling back deployment due to health failures', { deploymentId });
            await this.rollbackDeployment(deploymentId, tenantId, 'system');
          }
        }
      } catch (err) {
        logger.error('Health monitoring error', {
          deploymentId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, checkInterval);

    this.healthCheckTimers.set(deploymentId, timer);
  }

  private stopHealthMonitoring(deploymentId: string): void {
    const timer = this.healthCheckTimers.get(deploymentId);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(deploymentId);
    }
  }

  private async recordEvent(
    deploymentId: string,
    eventType: string,
    message: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.deploymentEvent.create({
      data: {
        id: crypto.randomUUID(),
        deploymentId,
        eventType,
        message,
        metadata: JSON.stringify(metadata),
        timestamp: new Date(),
      },
    });
  }

  private toDeployment(record: Record<string, unknown>): Deployment {
    let canaryConfig: CanaryConfig | null = null;
    let abTestConfig: ABTestConfig | null = null;
    let rateLimits: RateLimits;
    let healthStatus: HealthStatus;
    let metrics: DeploymentMetrics;

    try {
      const raw = record.canaryConfig;
      if (raw) canaryConfig = typeof raw === 'string' ? JSON.parse(raw) : raw as CanaryConfig;
    } catch {
      canaryConfig = null;
    }

    try {
      const raw = record.abTestConfig;
      if (raw) abTestConfig = typeof raw === 'string' ? JSON.parse(raw) : raw as ABTestConfig;
    } catch {
      abTestConfig = null;
    }

    try {
      const raw = record.rateLimits;
      rateLimits = typeof raw === 'string' ? JSON.parse(raw) : raw as RateLimits;
    } catch {
      rateLimits = { requestsPerMinute: 60, requestsPerHour: 1000, maxConcurrent: 10 };
    }

    try {
      const raw = record.healthStatus;
      healthStatus = typeof raw === 'string' ? JSON.parse(raw) : raw as HealthStatus;
    } catch {
      healthStatus = {
        isHealthy: false, lastCheck: null, uptime: 0, errorRate: 0,
        avgLatency: 0, p95Latency: 0, p99Latency: 0, consecutiveFailures: 0,
      };
    }

    try {
      const raw = record.metrics;
      metrics = typeof raw === 'string' ? JSON.parse(raw) : raw as DeploymentMetrics;
    } catch {
      metrics = {
        totalRequests: 0, successfulRequests: 0, failedRequests: 0,
        avgResponseTime: 0, totalTokensUsed: 0, requestsPerMinute: 0,
      };
    }

    return {
      id: record.id as string,
      tenantId: record.tenantId as string,
      userId: record.userId as string,
      registeredModelId: record.registeredModelId as string,
      modelId: record.modelId as string,
      environment: record.environment as string,
      strategy: record.strategy as string,
      status: record.status as Deployment['status'],
      canaryConfig,
      abTestConfig,
      rateLimits,
      healthStatus,
      metrics,
      createdAt: record.createdAt as Date,
      updatedAt: record.updatedAt as Date,
      completedAt: (record.completedAt as Date) || null,
    };
  }
}
