import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';
import { ExecutionPlan, TaskStep } from './task-decomposition.service.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StepResult {
  stepId: string;
  stepName: string;
  engine: string;
  status: 'success' | 'failed' | 'skipped';
  result: unknown;
  duration: number;
  error?: string;
}

export interface ExecutionResult {
  executionId: string;
  planId: string;
  status: 'complete' | 'partial' | 'failed';
  steps: StepResult[];
  finalResult: unknown;
  totalDuration: number;
  completedAt: string;
}

// ─── Engine URL Map ──────────────────────────────────────────────────────────

const SERVICE_URLS: Record<string, string> = {
  data_files: process.env.DATA_SERVICE_URL || 'http://data-service:3001',
  excel: process.env.EXCEL_SERVICE_URL || 'http://excel-service:3002',
  dashboards: process.env.DASHBOARD_SERVICE_URL || 'http://dashboard-service:3003',
  reports: process.env.REPORTING_SERVICE_URL || 'http://reporting-service:3004',
  presentations: process.env.PRESENTATION_SERVICE_URL || 'http://presentation-service:3005',
  ai_intelligence: process.env.AI_SERVICE_URL || 'http://ai-service:8009',
  localization: process.env.LOCALIZATION_SERVICE_URL || 'http://localization-service:3009',
  conversion: process.env.CONVERSION_SERVICE_URL || 'http://conversion-service:3008',
  governance: process.env.GOVERNANCE_SERVICE_URL || 'http://governance-service:3010',
  literal_match: process.env.REPLICATION_SERVICE_URL || 'http://replication-service:3007',
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class ExecutionEngineService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async execute(plan: ExecutionPlan, tenantId: string, userId: string): Promise<ExecutionResult> {
    const executionId = `exec_${randomUUID().substring(0, 8)}`;
    const stepResults: StepResult[] = [];
    const outputs = new Map<string, unknown>();
    const startTime = Date.now();

    logger.info('Starting execution', { executionId, planId: plan.id, totalSteps: plan.steps.length });

    // Execute by levels (parallel within each level)
    for (const level of plan.executionOrder) {
      const levelPromises = level.map(async (stepId) => {
        const step = plan.steps.find((s) => s.id === stepId);
        if (!step) return;

        // Check dependencies are met
        const depsOk = step.dependencies.every((depId) => {
          const depResult = stepResults.find((r) => r.stepId === depId);
          return depResult && depResult.status === 'success';
        });

        if (!depsOk) {
          stepResults.push({
            stepId: step.id,
            stepName: step.name,
            engine: step.engine,
            status: 'skipped',
            result: null,
            duration: 0,
          });
          return;
        }

        // Check condition if present
        if (step.condition) {
          const depOutput = outputs.get(step.condition.dependsOn) as Record<string, unknown> | undefined;
          if (depOutput && !this.evaluateCondition(step.condition, depOutput)) {
            stepResults.push({
              stepId: step.id,
              stepName: step.name,
              engine: step.engine,
              status: 'skipped',
              result: null,
              duration: 0,
            });
            return;
          }
        }

        // Build input from dependencies
        const input = this.buildStepInput(step, outputs);

        await this.executeStep(step, input, tenantId, userId, stepResults, outputs);
      });

      await Promise.allSettled(levelPromises);
    }

    const failedCount = stepResults.filter((r) => r.status === 'failed').length;
    const totalSteps = plan.steps.length;
    const status: ExecutionResult['status'] =
      failedCount === 0 ? 'complete' : failedCount === totalSteps ? 'failed' : 'partial';

    const lastSuccess = [...stepResults].reverse().find((r) => r.status === 'success');

    // Log execution
    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'SMART_OBSERVER_EXECUTION',
          entityType: 'ai_session',
          entityId: executionId,
          details: JSON.stringify({
            planId: plan.id,
            status,
            stepsCompleted: totalSteps - failedCount,
            totalSteps,
            durationMs: Date.now() - startTime,
            tenantId,
            userId,
          }),
          performedAt: new Date(),
        },
      });
    } catch (err) {
      logger.warn('Failed to create audit log', { error: err });
    }

    const result: ExecutionResult = {
      executionId,
      planId: plan.id,
      status,
      steps: stepResults,
      finalResult: lastSuccess?.result || null,
      totalDuration: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    };

    logger.info('Execution completed', {
      executionId,
      status,
      totalDuration: result.totalDuration,
      stepsRun: stepResults.length,
    });

    return result;
  }

  private async executeStep(
    step: TaskStep,
    input: Record<string, unknown>,
    tenantId: string,
    userId: string,
    stepResults: StepResult[],
    outputs: Map<string, unknown>,
  ): Promise<void> {
    const stepStart = Date.now();
    let retriesLeft = step.retryPolicy.maxRetries;
    let delay = step.retryPolicy.retryDelayMs;

    while (retriesLeft >= 0) {
      try {
        const serviceUrl = SERVICE_URLS[step.engine];
        if (!serviceUrl) throw new Error(`Unknown engine: ${step.engine}`);

        const endpoint = this.resolveEndpoint(step.engine, step.action);

        const response = await axios.post(
          `${serviceUrl}${endpoint}`,
          { ...input, tenantId, userId },
          {
            headers: {
              'X-Tenant-Id': tenantId,
              'X-Internal-Key': process.env.INTERNAL_API_KEY || '',
              'Content-Type': 'application/json',
            },
            timeout: 120000,
          },
        );

        const result = response.data?.data || response.data;
        stepResults.push({
          stepId: step.id,
          stepName: step.name,
          engine: step.engine,
          status: 'success',
          result,
          duration: Date.now() - stepStart,
        });
        outputs.set(step.id, result);

        logger.info('Step completed', { stepId: step.id, stepName: step.name, engine: step.engine });
        return;
      } catch (err: unknown) {
        retriesLeft--;
        if (retriesLeft >= 0) {
          logger.warn('Step failed, retrying', {
            stepId: step.id,
            retriesLeft,
            delay,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= step.retryPolicy.backoffMultiplier;
        } else {
          const errorMessage = err instanceof Error ? err.message : String(err);
          stepResults.push({
            stepId: step.id,
            stepName: step.name,
            engine: step.engine,
            status: step.isOptional ? 'skipped' : 'failed',
            result: null,
            duration: Date.now() - stepStart,
            error: errorMessage,
          });
          logger.error('Step failed permanently', { stepId: step.id, error: errorMessage });
        }
      }
    }
  }

  private buildStepInput(step: TaskStep, outputs: Map<string, unknown>): Record<string, unknown> {
    const input: Record<string, unknown> = { ...step.inputSchema };

    for (const depId of step.dependencies) {
      const depOutput = outputs.get(depId) as Record<string, unknown> | undefined;
      if (depOutput) {
        if (depOutput.id) input.datasetId = depOutput.id;
        if (depOutput.datasetId) input.datasetId = depOutput.datasetId;
        if (depOutput.data) input.sourceData = depOutput.data;
        if (depOutput.analysis) input.analysis = depOutput.analysis;
      }
    }

    return input;
  }

  private resolveEndpoint(engine: string, action: string): string {
    const endpointMap: Record<string, Record<string, string>> = {
      data_files: {
        read_file: '/api/v1/data/read',
        profile_data: '/api/v1/data/profile',
        clean_data: '/api/v1/data/cleanse',
        merge_data: '/api/v1/data/merge',
        filter_data: '/api/v1/data/filter',
      },
      ai_intelligence: {
        analyze_data: '/api/v1/ai/analyze',
        summarize: '/api/v1/ai/summarize',
        forecast: '/api/v1/ai/forecast',
        query_answer: '/api/v1/ai/free-query',
      },
      dashboards: {
        create_dashboard: '/api/v1/dashboards/auto-generate',
        add_widget: '/api/v1/dashboards/widgets',
        configure_layout: '/api/v1/dashboards/layout',
      },
      reports: {
        generate_report: '/api/v1/reports/generate',
        add_section: '/api/v1/reports/sections',
      },
      presentations: {
        create_presentation: '/api/v1/presentations/generate',
        create_infographic: '/api/v1/infographic/generate',
      },
      conversion: {
        convert_format: '/api/v1/conversion/convert',
      },
      localization: {
        translate: '/api/v1/localization/translate',
        arabize: '/api/v1/localization/arabize',
      },
      governance: {
        check_permissions: '/api/v1/governance/check',
        audit_log: '/api/v1/governance/audit',
      },
      literal_match: {
        exact_match: '/api/v1/replication/match',
      },
      excel: {
        process_workbook: '/api/v1/excel/process',
        apply_formulas: '/api/v1/excel/formulas',
      },
    };

    return endpointMap[engine]?.[action] || `/api/v1/${engine}/${action}`;
  }

  private evaluateCondition(
    condition: { field: string; operator: string; value: unknown },
    output: Record<string, unknown>,
  ): boolean {
    const fieldValue = output[condition.field];

    switch (condition.operator) {
      case 'eq': return fieldValue === condition.value;
      case 'neq': return fieldValue !== condition.value;
      case 'gt': return Number(fieldValue) > Number(condition.value);
      case 'lt': return Number(fieldValue) < Number(condition.value);
      case 'contains': return String(fieldValue).includes(String(condition.value));
      case 'exists': return fieldValue !== undefined && fieldValue !== null;
      default: return true;
    }
  }
}
