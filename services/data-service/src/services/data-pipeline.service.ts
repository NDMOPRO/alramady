import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PipelineStep {
  id: string;
  name: string;
  type: 'extract' | 'transform' | 'load' | 'validate' | 'enrich';
  config: Record<string, any>;
  dependsOn: string[];
  retryPolicy: RetryPolicy;
  timeout: number;
  parallel: boolean;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  schedule?: string;
  enabled: boolean;
  createdBy: string;
  tags: string[];
}

export interface PipelineExecution {
  id: string;
  pipelineId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
  startedAt: Date;
  completedAt?: Date;
  stepResults: StepResult[];
  metrics: PipelineMetrics;
}

export interface StepResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  rowsProcessed: number;
  errorMessage?: string;
  outputData?: Record<string, any>;
}

export interface PipelineMetrics {
  totalRowsProcessed: number;
  totalDurationMs: number;
  stepDurations: Record<string, number>;
  memoryUsageMb: number;
  errorCount: number;
  retryCount: number;
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'type_check' | 'range' | 'regex' | 'custom';
  params: Record<string, any>;
  errorMessage: string;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: Omit<PipelineStep, 'id'>[];
  defaultConfig: Record<string, any>;
}

export interface ScheduleEntry {
  pipelineId: string;
  cronExpression: string;
  timezone: string;
  nextRunAt: Date;
  lastRunAt?: Date;
  enabled: boolean;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DataPipelineService {
  private pipelineQueue: Queue;
  private activeExecutions: Map<string, PipelineExecution>;
  private scheduledJobs: Map<string, NodeJS.Timeout>;
  private metricsBuffer: Map<string, PipelineMetrics[]>;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
  ) {
    this.pipelineQueue = new Queue('data-pipeline', {
      connection: { host: 'localhost', port: 6379 },
    });
    this.activeExecutions = new Map();
    this.scheduledJobs = new Map();
    this.metricsBuffer = new Map();
  }

  async createPipeline(definition: Omit<PipelineDefinition, 'id'>): Promise<PipelineDefinition> {
    const validationErrors = this.validatePipelineDefinition(definition);
    if (validationErrors.length > 0) {
      throw new Error(`Pipeline validation failed: ${validationErrors.join(', ')}`);
    }

    const topologicalOrder = this.computeTopologicalOrder(definition.steps);
    if (!topologicalOrder) {
      throw new Error('Pipeline contains circular dependencies between steps');
    }

    const pipeline = await this.prisma.pipeline.create({
      data: {
        name: definition.name,
        description: definition.description,
        steps: JSON.stringify(definition.steps),
        schedule: definition.schedule || null,
        enabled: definition.enabled,
        createdBy: definition.createdBy,
        tags: JSON.stringify(definition.tags),
        stepOrder: JSON.stringify(topologicalOrder),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    if (definition.schedule && definition.enabled) {
      await this.schedulePipeline(pipeline.id, definition.schedule);
    }

    await this.redis.hset('pipeline:definitions', pipeline.id, JSON.stringify({
      ...definition,
      id: pipeline.id,
    }));

    return { ...definition, id: pipeline.id };
  }

  async executePipeline(pipelineId: string, params?: Record<string, any>): Promise<PipelineExecution> {
    const pipelineDef = await this.getPipelineDefinition(pipelineId);
    if (!pipelineDef) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    const executionId = `exec_${Date.now()}_${crypto.randomUUID().split('-')[0]}`;
    const execution: PipelineExecution = {
      id: executionId,
      pipelineId,
      status: 'pending',
      startedAt: new Date(),
      stepResults: pipelineDef.steps.map(step => ({
        stepId: step.id,
        status: 'pending',
        rowsProcessed: 0,
      })),
      metrics: {
        totalRowsProcessed: 0,
        totalDurationMs: 0,
        stepDurations: {},
        memoryUsageMb: 0,
        errorCount: 0,
        retryCount: 0,
      },
    };

    this.activeExecutions.set(executionId, execution);

    await this.prisma.pipelineExecution.create({
      data: {
        id: executionId,
        pipelineId,
        status: 'running',
        startedAt: new Date(),
        params: params ? JSON.stringify(params) : undefined,
        stepResults: JSON.stringify(execution.stepResults),
      },
    });

    execution.status = 'running';
    const topologicalOrder = this.computeTopologicalOrder(pipelineDef.steps);
    const stepMap = new Map(pipelineDef.steps.map(s => [s.id, s]));
    const completedSteps = new Set<string>();
    const stepOutputs = new Map<string, Record<string, any>>();

    try {
      for (const stepId of topologicalOrder!) {
        const step = stepMap.get(stepId)!;
        const parallelGroup = this.getParallelGroup(step, pipelineDef.steps, completedSteps);

        if (parallelGroup.length > 1) {
          const parallelResults = await this.executeParallelSteps(
            parallelGroup, execution, stepOutputs, params,
          );
          for (const [sid, result] of parallelResults) {
            completedSteps.add(sid);
            stepOutputs.set(sid, result.outputData || {});
          }
        } else {
          const result = await this.executeStep(step, execution, stepOutputs, params);
          completedSteps.add(stepId);
          stepOutputs.set(stepId, result.outputData || {});
        }
      }

      execution.status = 'completed';
      execution.completedAt = new Date();
      execution.metrics.totalDurationMs = Date.now() - execution.startedAt.getTime();
    } catch (error) {
      execution.status = 'failed';
      execution.metrics.errorCount += 1;
      await this.rollbackPipeline(execution, Array.from(completedSteps), stepMap);
      execution.status = 'rolled_back';
      execution.completedAt = new Date();
      execution.metrics.totalDurationMs = Date.now() - execution.startedAt.getTime();
    }

    await this.prisma.pipelineExecution.update({
      where: { id: executionId },
      data: {
        status: execution.status,
        completedAt: execution.completedAt,
        stepResults: JSON.stringify(execution.stepResults),
        metrics: JSON.stringify(execution.metrics),
      },
    });

    await this.collectMetrics(pipelineId, execution.metrics);
    this.activeExecutions.delete(executionId);
    return execution;
  }

  private async executeStep(
    step: PipelineStep,
    execution: PipelineExecution,
    previousOutputs: Map<string, Record<string, any>>,
    params?: Record<string, any>,
  ): Promise<StepResult> {
    const stepResult = execution.stepResults.find(r => r.stepId === step.id)!;
    stepResult.status = 'running';
    stepResult.startedAt = new Date();

    const inputData: Record<string, any> = {};
    for (const depId of step.dependsOn) {
      const depOutput = previousOutputs.get(depId);
      if (depOutput) {
        Object.assign(inputData, depOutput);
      }
    }

    let attempt = 0;
    let lastError: Error | null = null;
    const maxAttempts = step.retryPolicy.maxRetries + 1;

    while (attempt < maxAttempts) {
      try {
        const result = await this.runStepLogic(step, inputData, params || {});
        stepResult.status = 'completed';
        stepResult.completedAt = new Date();
        stepResult.rowsProcessed = result.rowsProcessed;
        stepResult.outputData = result.outputData;

        const durationMs = stepResult.completedAt.getTime() - stepResult.startedAt!.getTime();
        execution.metrics.stepDurations[step.id] = durationMs;
        execution.metrics.totalRowsProcessed += result.rowsProcessed;

        await this.redis.publish('pipeline:step:completed', JSON.stringify({
          executionId: execution.id,
          stepId: step.id,
          rowsProcessed: result.rowsProcessed,
          durationMs,
        }));

        return stepResult;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempt += 1;
        execution.metrics.retryCount += 1;
        if (attempt < maxAttempts) {
          const backoff = step.retryPolicy.backoffMs *
            Math.pow(step.retryPolicy.backoffMultiplier, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    stepResult.status = 'failed';
    stepResult.completedAt = new Date();
    stepResult.errorMessage = lastError?.message || 'Unknown error';
    throw lastError;
  }

  private async runStepLogic(
    step: PipelineStep,
    inputData: Record<string, any>,
    params: Record<string, any>,
  ): Promise<{ rowsProcessed: number; outputData: Record<string, any> }> {
    const mergedConfig = { ...step.config, ...params };
    let rowsProcessed = 0;
    let outputData: Record<string, any> = {};

    switch (step.type) {
      case 'extract': {
        const sourceType = mergedConfig.sourceType as string;
        const query = mergedConfig.query as string;
        const batchSize = (mergedConfig.batchSize as number) || 1000;
        let allRecords: Record<string, any>[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const batch = await this.prisma.$queryRawUnsafe(
            `${query} LIMIT ${batchSize} OFFSET ${offset}`,
          ) as Record<string, any>[];
          allRecords = allRecords.concat(batch);
          rowsProcessed += batch.length;
          offset += batchSize;
          hasMore = batch.length === batchSize;

          await this.redis.set(
            `pipeline:extract:progress:${step.id}`,
            JSON.stringify({ rowsExtracted: rowsProcessed }),
            'EX', 3600,
          );
        }

        outputData = {
          records: allRecords,
          sourceType,
          extractedAt: new Date().toISOString(),
          totalRecords: allRecords.length,
        };
        break;
      }

      case 'transform': {
        const records = (inputData.records as Record<string, any>[]) || [];
        const transformType = mergedConfig.transformType as string;
        const transformedRecords: Record<string, any>[] = [];

        for (const record of records) {
          let transformed = { ...record };

          if (transformType === 'map') {
            const mappings = mergedConfig.mappings as Record<string, string>;
            const mapped: Record<string, any> = {};
            for (const [targetField, sourceField] of Object.entries(mappings)) {
              mapped[targetField] = transformed[sourceField];
            }
            transformed = mapped;
          } else if (transformType === 'filter') {
            const filterField = mergedConfig.filterField as string;
            const filterValue = mergedConfig.filterValue;
            const filterOp = (mergedConfig.filterOp as string) || 'eq';
            let passes = false;
            if (filterOp === 'eq') passes = transformed[filterField] === filterValue;
            else if (filterOp === 'neq') passes = transformed[filterField] !== filterValue;
            else if (filterOp === 'gt') passes = (transformed[filterField] as number) > (filterValue as number);
            else if (filterOp === 'lt') passes = (transformed[filterField] as number) < (filterValue as number);
            else if (filterOp === 'contains') passes = String(transformed[filterField]).includes(String(filterValue));
            if (!passes) continue;
          } else if (transformType === 'aggregate') {
            const groupBy = mergedConfig.groupByField as string;
            const aggField = mergedConfig.aggregateField as string;
            const aggOp = (mergedConfig.aggregateOp as string) || 'sum';
            transformed.__groupKey = transformed[groupBy];
            transformed.__aggField = aggField;
            transformed.__aggOp = aggOp;
          } else if (transformType === 'enrich') {
            const enrichFields = mergedConfig.enrichFields as Record<string, any>;
            for (const [key, value] of Object.entries(enrichFields || {})) {
              transformed[`enriched_${key}`] = value;
            }
            transformed.enrichedAt = new Date().toISOString();
          }

          transformedRecords.push(transformed);
          rowsProcessed += 1;
        }

        outputData = {
          records: transformedRecords,
          transformType,
          transformedAt: new Date().toISOString(),
          totalRecords: transformedRecords.length,
        };
        break;
      }

      case 'load': {
        const records = (inputData.records as Record<string, any>[]) || [];
        const targetTable = mergedConfig.targetTable as string;
        const loadMode = (mergedConfig.loadMode as string) || 'append';
        const batchSize = (mergedConfig.batchSize as number) || 500;

        if (loadMode === 'replace') {
          await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "${targetTable}"`);
        }

        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          const columns = Object.keys(batch[0] || {});
          const valuePlaceholders = batch.map((_, ri) =>
            `(${columns.map((_, ci) => `$${ri * columns.length + ci + 1}`).join(', ')})`,
          ).join(', ');
          const values = batch.flatMap(r => columns.map(c => r[c]));

          if (columns.length > 0 && batch.length > 0) {
            await this.prisma.$executeRawUnsafe(
              `INSERT INTO "${targetTable}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES ${valuePlaceholders}`,
              ...values,
            );
          }
          rowsProcessed += batch.length;
        }

        outputData = {
          targetTable,
          loadMode,
          loadedAt: new Date().toISOString(),
          totalLoaded: rowsProcessed,
        };
        break;
      }

      case 'validate': {
        const records = (inputData.records as Record<string, any>[]) || [];
        const rules = (mergedConfig.validationRules as ValidationRule[]) || [];
        const validRecords: Record<string, any>[] = [];
        const invalidRecords: { record: Record<string, any>; errors: string[] }[] = [];

        for (const record of records) {
          const errors: string[] = [];
          for (const rule of rules) {
            const value = record[rule.field];
            if (rule.type === 'required' && (value === null || value === undefined || value === '')) {
              errors.push(rule.errorMessage);
            } else if (rule.type === 'type_check') {
              const expectedType = rule.params.expectedType as string;
              if (typeof value !== expectedType) {
                errors.push(rule.errorMessage);
              }
            } else if (rule.type === 'range') {
              const min = rule.params.min as number;
              const max = rule.params.max as number;
              const numVal = Number(value);
              if (isNaN(numVal) || numVal < min || numVal > max) {
                errors.push(rule.errorMessage);
              }
            } else if (rule.type === 'regex') {
              const pattern = new RegExp(rule.params.pattern as string);
              if (!pattern.test(String(value))) {
                errors.push(rule.errorMessage);
              }
            }
          }

          if (errors.length === 0) {
            validRecords.push(record);
          } else {
            invalidRecords.push({ record, errors });
          }
          rowsProcessed += 1;
        }

        outputData = {
          records: validRecords,
          invalidRecords,
          validCount: validRecords.length,
          invalidCount: invalidRecords.length,
          validatedAt: new Date().toISOString(),
        };
        break;
      }

      case 'enrich': {
        const records = (inputData.records as Record<string, any>[]) || [];
        const enrichSource = mergedConfig.enrichSource as string;
        const lookupField = mergedConfig.lookupField as string;
        const enrichedRecords: Record<string, any>[] = [];

        const lookupValues = records.map(r => r[lookupField]).filter(Boolean);
        const lookupResults = await this.prisma.$queryRawUnsafe(
          `SELECT * FROM "${enrichSource}" WHERE "${lookupField}" = ANY($1)`,
          lookupValues,
        ) as Record<string, any>[];

        const lookupMap = new Map<string, Record<string, any>>();
        for (const result of lookupResults) {
          lookupMap.set(String(result[lookupField]), result);
        }

        for (const record of records) {
          const lookupVal = String(record[lookupField]);
          const enrichment = lookupMap.get(lookupVal);
          const enrichedRecord = { ...record };
          if (enrichment) {
            for (const [key, value] of Object.entries(enrichment)) {
              if (key !== lookupField) {
                enrichedRecord[`enriched_${key}`] = value;
              }
            }
          }
          enrichedRecord.enrichedAt = new Date().toISOString();
          enrichedRecords.push(enrichedRecord);
          rowsProcessed += 1;
        }

        outputData = {
          records: enrichedRecords,
          enrichSource,
          matchCount: lookupMap.size,
          totalRecords: enrichedRecords.length,
        };
        break;
      }
    }

    return { rowsProcessed, outputData };
  }

  private async executeParallelSteps(
    steps: PipelineStep[],
    execution: PipelineExecution,
    previousOutputs: Map<string, Record<string, any>>,
    params?: Record<string, any>,
  ): Promise<Map<string, StepResult>> {
    const results = new Map<string, StepResult>();
    const promises = steps.map(async (step) => {
      const result = await this.executeStep(step, execution, previousOutputs, params);
      results.set(step.id, result);
      return result;
    });

    const settled = await Promise.allSettled(promises);
    const failures = settled.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      const failedReasons = failures.map(f =>
        (f as PromiseRejectedResult).reason?.message || 'Unknown error',
      );
      throw new Error(`Parallel steps failed: ${failedReasons.join('; ')}`);
    }

    return results;
  }

  private async rollbackPipeline(
    execution: PipelineExecution,
    completedStepIds: string[],
    stepMap: Map<string, PipelineStep>,
  ): Promise<void> {
    const reversedSteps = [...completedStepIds].reverse();

    for (const stepId of reversedSteps) {
      const step = stepMap.get(stepId);
      if (!step) continue;

      try {
        if (step.type === 'load') {
          const targetTable = step.config.targetTable as string;
          const loadMode = (step.config.loadMode as string) || 'append';

          if (loadMode === 'append') {
            await this.prisma.$executeRawUnsafe(
              `DELETE FROM "${targetTable}" WHERE _pipeline_execution_id = $1`,
              execution.id,
            );
          }

          await this.redis.publish('pipeline:step:rolledback', JSON.stringify({
            executionId: execution.id,
            stepId,
            targetTable,
          }));
        }

        const stepResult = execution.stepResults.find(r => r.stepId === stepId);
        if (stepResult) {
          stepResult.status = 'skipped';
          stepResult.errorMessage = 'Rolled back due to downstream failure';
        }
      } catch (rollbackErr) {
        await this.prisma.pipelineLog.create({
          data: {
            executionId: execution.id,
            stepId,
            level: 'error',
            message: `Rollback failed: ${(rollbackErr as Error).message}`,
            timestamp: new Date(),
          },
        });
      }
    }
  }

  async schedulePipeline(pipelineId: string, cronExpression: string): Promise<ScheduleEntry> {
    if (this.scheduledJobs.has(pipelineId)) {
      clearInterval(this.scheduledJobs.get(pipelineId)!);
      this.scheduledJobs.delete(pipelineId);
    }

    const nextRun = this.calculateNextCronRun(cronExpression);
    const entry: ScheduleEntry = {
      pipelineId,
      cronExpression,
      timezone: 'UTC',
      nextRunAt: nextRun,
      enabled: true,
    };

    await this.prisma.pipelineSchedule.upsert({
      where: { pipelineId },
      create: {
        pipelineId,
        cronExpression,
        timezone: 'UTC',
        nextRunAt: nextRun,
        enabled: true,
      },
      update: {
        cronExpression,
        nextRunAt: nextRun,
        enabled: true,
        updatedAt: new Date(),
      },
    });

    const checkInterval = setInterval(async () => {
      const now = new Date();
      const schedule = await this.prisma.pipelineSchedule.findUnique({
        where: { pipelineId },
      });
      if (schedule && schedule.enabled && schedule.nextRunAt && now >= schedule.nextRunAt) {
        await this.executePipeline(pipelineId);
        const newNextRun = this.calculateNextCronRun(cronExpression);
        await this.prisma.pipelineSchedule.update({
          where: { pipelineId },
          data: { lastRunAt: now, nextRunAt: newNextRun },
        });
      }
    }, 60000);

    this.scheduledJobs.set(pipelineId, checkInterval);

    await this.redis.hset('pipeline:schedules', pipelineId, JSON.stringify(entry));
    return entry;
  }

  private calculateNextCronRun(cronExpression: string): Date {
    const parts = cronExpression.split(' ');
    const now = new Date();
    const minute = parts[0] === '*' ? now.getMinutes() + 1 : parseInt(parts[0], 10);
    const hour = parts[1] === '*' ? now.getHours() : parseInt(parts[1], 10);
    const dayOfMonth = parts[2] === '*' ? now.getDate() : parseInt(parts[2], 10);
    const month = parts[3] === '*' ? now.getMonth() : parseInt(parts[3], 10) - 1;

    const next = new Date(now.getFullYear(), month, dayOfMonth, hour, minute, 0, 0);
    if (next <= now) {
      if (parts[0] !== '*') next.setHours(next.getHours() + 1);
      else if (parts[1] !== '*') next.setDate(next.getDate() + 1);
      else next.setMinutes(next.getMinutes() + 1);
    }
    return next;
  }

  async getMonitoringDashboard(pipelineId: string): Promise<{
    recentExecutions: PipelineExecution[];
    averageDuration: number;
    successRate: number;
    lastFailure: PipelineExecution | null;
    metrics: PipelineMetrics;
  }> {
    const executions = await this.prisma.pipelineExecution.findMany({
      where: { pipelineId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    const parsedExecutions: PipelineExecution[] = executions.map(e => ({
      id: e.id,
      pipelineId: e.pipelineId,
      status: e.status as PipelineExecution['status'],
      startedAt: e.startedAt,
      completedAt: e.completedAt || undefined,
      stepResults: JSON.parse(e.stepResults as string || '[]'),
      metrics: JSON.parse(e.metrics as string || '{}'),
    }));

    const completedExecs = parsedExecutions.filter(e => e.completedAt);
    const totalDuration = completedExecs.reduce((sum, e) => {
      return sum + (e.completedAt!.getTime() - e.startedAt.getTime());
    }, 0);
    const averageDuration = completedExecs.length > 0 ? totalDuration / completedExecs.length : 0;

    const successCount = parsedExecutions.filter(e => e.status === 'completed').length;
    const successRate = parsedExecutions.length > 0 ? successCount / parsedExecutions.length : 0;

    const lastFailure = parsedExecutions.find(e => e.status === 'failed') || null;

    const aggregatedMetrics: PipelineMetrics = {
      totalRowsProcessed: parsedExecutions.reduce((s, e) => s + (e.metrics.totalRowsProcessed || 0), 0),
      totalDurationMs: totalDuration,
      stepDurations: {},
      memoryUsageMb: parsedExecutions.reduce((s, e) => Math.max(s, e.metrics.memoryUsageMb || 0), 0),
      errorCount: parsedExecutions.reduce((s, e) => s + (e.metrics.errorCount || 0), 0),
      retryCount: parsedExecutions.reduce((s, e) => s + (e.metrics.retryCount || 0), 0),
    };

    return {
      recentExecutions: parsedExecutions.slice(0, 10),
      averageDuration,
      successRate,
      lastFailure,
      metrics: aggregatedMetrics,
    };
  }

  async collectMetrics(pipelineId: string, metrics: PipelineMetrics): Promise<void> {
    const existing = this.metricsBuffer.get(pipelineId) || [];
    existing.push(metrics);
    if (existing.length > 100) {
      existing.splice(0, existing.length - 100);
    }
    this.metricsBuffer.set(pipelineId, existing);

    await this.redis.lpush(
      `pipeline:metrics:${pipelineId}`,
      JSON.stringify({ ...metrics, timestamp: new Date().toISOString() }),
    );
    await this.redis.ltrim(`pipeline:metrics:${pipelineId}`, 0, 999);

    await this.prisma.pipelineMetric.create({
      data: {
        pipelineId,
        totalRowsProcessed: metrics.totalRowsProcessed,
        totalDurationMs: metrics.totalDurationMs,
        memoryUsageMb: metrics.memoryUsageMb,
        errorCount: metrics.errorCount,
        retryCount: metrics.retryCount,
        stepDurations: JSON.stringify(metrics.stepDurations),
        recordedAt: new Date(),
      },
    });

    const avgDuration = existing.reduce((s, m) => s + m.totalDurationMs, 0) / existing.length;
    const avgErrors = existing.reduce((s, m) => s + m.errorCount, 0) / existing.length;

    if (metrics.totalDurationMs > avgDuration * 2) {
      await this.redis.publish('pipeline:alert', JSON.stringify({
        type: 'slow_execution',
        pipelineId,
        duration: metrics.totalDurationMs,
        averageDuration: avgDuration,
      }));
    }

    if (metrics.errorCount > avgErrors * 3 && metrics.errorCount > 0) {
      await this.redis.publish('pipeline:alert', JSON.stringify({
        type: 'high_error_rate',
        pipelineId,
        errorCount: metrics.errorCount,
        averageErrors: avgErrors,
      }));
    }
  }

  async validateBetweenSteps(
    sourceStepOutput: Record<string, any>,
    targetStep: PipelineStep,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const records = sourceStepOutput.records as Record<string, any>[] | undefined;

    if (!records || !Array.isArray(records)) {
      errors.push('Source step did not produce records array');
      return { valid: false, errors };
    }

    if (records.length === 0) {
      errors.push('Source step produced empty records');
      return { valid: false, errors };
    }

    const expectedFields = targetStep.config.expectedInputFields as string[] | undefined;
    if (expectedFields && expectedFields.length > 0) {
      const sampleRecord = records[0];
      const recordKeys = Object.keys(sampleRecord);
      for (const field of expectedFields) {
        if (!recordKeys.includes(field)) {
          errors.push(`Expected input field "${field}" not found in source output`);
        }
      }
    }

    const maxRecords = targetStep.config.maxInputRecords as number | undefined;
    if (maxRecords && records.length > maxRecords) {
      errors.push(`Record count ${records.length} exceeds maximum ${maxRecords}`);
    }

    const typeChecks = targetStep.config.inputTypeChecks as Record<string, string> | undefined;
    if (typeChecks) {
      const sample = records[0];
      for (const [field, expectedType] of Object.entries(typeChecks)) {
        if (sample[field] !== undefined && typeof sample[field] !== expectedType) {
          errors.push(`Field "${field}" expected type "${expectedType}" but got "${typeof sample[field]}"`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async createPipelineFromTemplate(
    templateId: string,
    name: string,
    createdBy: string,
    configOverrides?: Record<string, any>,
  ): Promise<PipelineDefinition> {
    const template = await this.prisma.pipelineTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const parsedTemplate: PipelineTemplate = {
      id: template.id,
      name: template.name,
      description: template.description || '',
      category: template.category || '',
      steps: JSON.parse(template.steps as string),
      defaultConfig: JSON.parse(template.defaultConfig as string),
    };

    const stepsWithIds: PipelineStep[] = parsedTemplate.steps.map((step, index) => ({
      ...step,
      id: `step_${Date.now()}_${index}`,
      config: {
        ...parsedTemplate.defaultConfig,
        ...step.config,
        ...(configOverrides || {}),
      },
    }));

    const pipeline = await this.createPipeline({
      name,
      description: `Created from template: ${parsedTemplate.name}`,
      steps: stepsWithIds,
      enabled: false,
      createdBy,
      tags: ['from-template', parsedTemplate.category],
    });

    await this.prisma.pipelineTemplate.update({
      where: { id: templateId },
      data: { usageCount: { increment: 1 } },
    });

    return pipeline;
  }

  async clonePipeline(pipelineId: string, newName: string, createdBy: string): Promise<PipelineDefinition> {
    const original = await this.getPipelineDefinition(pipelineId);
    if (!original) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    const clonedSteps = original.steps.map((step, index) => ({
      ...step,
      id: `step_${Date.now()}_${index}`,
    }));

    const clonedPipeline = await this.createPipeline({
      name: newName,
      description: `Cloned from: ${original.name}`,
      steps: clonedSteps,
      schedule: undefined,
      enabled: false,
      createdBy,
      tags: [...original.tags, 'cloned'],
    });

    await this.redis.publish('pipeline:cloned', JSON.stringify({
      originalId: pipelineId,
      cloneId: clonedPipeline.id,
      clonedBy: createdBy,
    }));

    return clonedPipeline;
  }

  async listTemplates(category?: string): Promise<PipelineTemplate[]> {
    const whereClause: Record<string, any> = {};
    if (category) {
      whereClause.category = category;
    }

    const templates = await this.prisma.pipelineTemplate.findMany({
      where: whereClause,
      orderBy: { usageCount: 'desc' },
    });

    return templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description || '',
      category: t.category || '',
      steps: JSON.parse(t.steps as string),
      defaultConfig: JSON.parse(t.defaultConfig as string),
    }));
  }

  private validatePipelineDefinition(definition: Omit<PipelineDefinition, 'id'>): string[] {
    const errors: string[] = [];

    if (!definition.name || definition.name.trim().length === 0) {
      errors.push('Pipeline name is required');
    }

    if (!definition.steps || definition.steps.length === 0) {
      errors.push('Pipeline must have at least one step');
    }

    const stepIds = new Set<string>();
    for (const step of definition.steps) {
      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);

      if (!step.name || step.name.trim().length === 0) {
        errors.push(`Step ${step.id} must have a name`);
      }

      for (const dep of step.dependsOn) {
        if (!definition.steps.some(s => s.id === dep)) {
          errors.push(`Step ${step.id} depends on unknown step ${dep}`);
        }
      }

      if (step.timeout <= 0) {
        errors.push(`Step ${step.id} must have a positive timeout`);
      }

      if (step.retryPolicy.maxRetries < 0) {
        errors.push(`Step ${step.id} maxRetries cannot be negative`);
      }
    }

    return errors;
  }

  private computeTopologicalOrder(steps: PipelineStep[]): string[] | null {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.id, step.dependsOn.length);
      adjacency.set(step.id, []);
    }

    for (const step of steps) {
      for (const dep of step.dependsOn) {
        const neighbors = adjacency.get(dep) || [];
        neighbors.push(step.id);
        adjacency.set(dep, neighbors);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      for (const neighbor of adjacency.get(current) || []) {
        const newDeg = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    return order.length === steps.length ? order : null;
  }

  private getParallelGroup(
    step: PipelineStep,
    allSteps: PipelineStep[],
    completedSteps: Set<string>,
  ): PipelineStep[] {
    if (!step.parallel) return [step];

    const group = allSteps.filter(s => {
      if (s.id === step.id) return true;
      if (!s.parallel) return false;
      if (completedSteps.has(s.id)) return false;
      const allDepsComplete = s.dependsOn.every(d => completedSteps.has(d));
      return allDepsComplete;
    });

    return group;
  }

  private async getPipelineDefinition(pipelineId: string): Promise<PipelineDefinition | null> {
    const cached = await this.redis.hget('pipeline:definitions', pipelineId);
    if (cached) {
      return JSON.parse(cached);
    }

    const pipeline = await this.prisma.pipeline.findUnique({
      where: { id: pipelineId },
    });

    if (!pipeline) return null;

    const definition: PipelineDefinition = {
      id: pipeline.id,
      name: pipeline.name,
      description: pipeline.description || '',
      steps: JSON.parse(pipeline.steps as string),
      schedule: pipeline.schedule || undefined,
      enabled: pipeline.enabled,
      createdBy: pipeline.createdBy || '',
      tags: JSON.parse(pipeline.tags as string),
    };

    await this.redis.hset('pipeline:definitions', pipelineId, JSON.stringify(definition));
    return definition;
  }

  async deletePipeline(pipelineId: string): Promise<void> {
    if (this.scheduledJobs.has(pipelineId)) {
      clearInterval(this.scheduledJobs.get(pipelineId)!);
      this.scheduledJobs.delete(pipelineId);
    }

    const activeExec = Array.from(this.activeExecutions.values())
      .find(e => e.pipelineId === pipelineId && e.status === 'running');
    if (activeExec) {
      throw new Error(`Cannot delete pipeline ${pipelineId} while execution ${activeExec.id} is running`);
    }

    await this.prisma.pipelineExecution.deleteMany({ where: { pipelineId } });
    await this.prisma.pipelineSchedule.deleteMany({ where: { pipelineId } });
    await this.prisma.pipelineMetric.deleteMany({ where: { pipelineId } });
    await this.prisma.pipelineLog.deleteMany({ where: { pipelineId } });
    await this.prisma.pipeline.delete({ where: { id: pipelineId } });

    await this.redis.hdel('pipeline:definitions', pipelineId);
    await this.redis.hdel('pipeline:schedules', pipelineId);
    await this.redis.del(`pipeline:metrics:${pipelineId}`);

    this.metricsBuffer.delete(pipelineId);
  }

  async getExecutionLogs(executionId: string, level?: string): Promise<{
    logs: { stepId: string; level: string; message: string; timestamp: Date }[];
    totalCount: number;
  }> {
    const whereClause: Record<string, any> = { executionId };
    if (level) {
      whereClause.level = level;
    }

    const logs = await this.prisma.pipelineLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'asc' },
    });

    const totalCount = await this.prisma.pipelineLog.count({
      where: whereClause,
    });

    return {
      logs: logs.map(l => ({
        stepId: l.stepId || '',
        level: l.level,
        message: l.message,
        timestamp: l.timestamp,
      })),
      totalCount,
    };
  }
}
