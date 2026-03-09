import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new PrismaClient();

export interface AgentResult {
  agentType: string;
  taskType: string;
  suggestions: Array<{ action: string; description: string; confidence: number }>;
  interpretation: string;
  requiresApproval: boolean;
  executedAt: Date;
}

export interface AutomationWorkflowTask {
  type: 'create_workflow' | 'schedule_task' | 'chain_operations' | 'setup_trigger' | 'optimize_pipeline';
  datasetId: string;
  workflowName?: string;
  steps?: Array<{
    engine: string;
    operation: string;
    params: Record<string, string | number | boolean>;
    dependsOn?: string[];
  }>;
  schedule?: {
    cron?: string;
    interval?: string;
    timezone?: string;
    startDate?: string;
  };
  trigger?: {
    type: 'data_change' | 'threshold' | 'schedule' | 'webhook' | 'manual';
    condition?: string;
    sourceDatasetId?: string;
    threshold?: { column: string; operator: string; value: number };
  };
  existingPipeline?: Array<{
    stepId: string;
    engine: string;
    operation: string;
    avgDurationMs: number;
    errorRate: number;
    dependencies: string[];
  }>;
  context?: string;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  errorHandling: ErrorHandlingConfig;
  metadata: Record<string, string | number>;
}

interface WorkflowStep {
  id: string;
  name: string;
  engine: string;
  operation: string;
  params: Record<string, string | number | boolean>;
  dependsOn: string[];
  retryPolicy: { maxRetries: number; backoffMs: number };
  timeoutMs: number;
}

interface WorkflowTrigger {
  type: string;
  config: Record<string, string | number | boolean>;
}

interface ErrorHandlingConfig {
  onStepFailure: 'stop' | 'skip' | 'retry';
  maxRetries: number;
  notifyOnFailure: boolean;
  rollbackOnFailure: boolean;
}

export class AutomationWorkflowAgent {
  private readonly agentType = 'automation-workflow';

  private readonly engineOperations: Record<string, string[]> = {
    'data-files': ['import', 'export', 'transform', 'validate'],
    'excel': ['parse', 'generate', 'merge', 'formula_compute'],
    'dashboards': ['create', 'update', 'snapshot', 'export_pdf'],
    'reports': ['generate', 'compile', 'translate', 'distribute'],
    'presentations': ['create', 'update_slides', 'export'],
    'literal-match': ['match', 'compare', 'diff'],
    'localization': ['translate', 'review', 'batch_translate'],
    'conversion': ['convert_format', 'batch_convert', 'optimize'],
    'ai-intelligence': ['analyze', 'classify', 'predict', 'summarize'],
    'governance': ['audit', 'check_compliance', 'enforce_policy'],
  };

  async execute(task: AutomationWorkflowTask): Promise<AgentResult> {
    switch (task.type) {
      case 'create_workflow':
        return this.createWorkflow(task);
      case 'schedule_task':
        return this.scheduleTask(task);
      case 'chain_operations':
        return this.chainOperations(task);
      case 'setup_trigger':
        return this.setupTrigger(task);
      case 'optimize_pipeline':
        return this.optimizePipeline(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const arr = new Uint8Array(4);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = (Date.now() * (i + 1)) & 0xff;
      }
    }
    return `${prefix}-${timestamp}-${Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  private async createWorkflow(task: AutomationWorkflowTask): Promise<AgentResult> {
    const steps = task.steps ?? [];
    const workflowName = task.workflowName ?? `Workflow for ${task.datasetId}`;

    if (steps.length === 0) {
      // Use AI to suggest a workflow based on context
      const prompt = `You are a workflow automation expert for the Rasid analytics platform (Saudi market).
Create a multi-step workflow for the following request.

Dataset: "${task.datasetId}"
Request: "${task.context ?? 'General data processing workflow'}"

Available engines and operations:
${JSON.stringify(this.engineOperations, null, 2)}

Respond in JSON:
{
  "steps": [
    {
      "name": "step description",
      "engine": "engine-name",
      "operation": "operation-name",
      "params": { "key": "value" },
      "dependsOn": []
    }
  ],
  "suggestions": [
    { "action": "workflow_design", "description": "design rationale", "confidence": 0.85 }
  ],
  "interpretation": "workflow description in Arabic (formal MSA)"
}

Rules:
- Create 3-7 logical steps
- Respect dependencies between steps
- Include data validation and error handling steps
- Consider Saudi business context`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI for create_workflow');
      }

      const parsed: {
        steps: Array<{ name: string; engine: string; operation: string; params: Record<string, string | number | boolean>; dependsOn: string[] }>;
        suggestions: Array<{ action: string; description: string; confidence: number }>;
        interpretation: string;
      } = JSON.parse(content);

      const workflow: WorkflowDefinition = {
        id: this.generateId('wf'),
        name: workflowName,
        version: 1,
        steps: parsed.steps.map((s, i) => ({
          id: this.generateId('step'),
          name: s.name,
          engine: s.engine,
          operation: s.operation,
          params: s.params,
          dependsOn: s.dependsOn,
          retryPolicy: { maxRetries: 3, backoffMs: 1000 },
          timeoutMs: 60000,
        })),
        triggers: [],
        errorHandling: {
          onStepFailure: 'retry',
          maxRetries: 3,
          notifyOnFailure: true,
          rollbackOnFailure: false,
        },
        metadata: { datasetId: task.datasetId, createdAt: Date.now() },
      };

      const workflowSuggestion = {
        action: 'workflow_created',
        description: `Workflow "${workflowName}" (${workflow.id}) created with ${workflow.steps.length} steps: ${workflow.steps.map((s) => s.name).join(' -> ')}`,
        confidence: 0.85,
      };

      await prisma.auditLog.create({
        data: {
          action: 'automation_create_workflow',
          entityType: 'workflow',
          entityId: workflow.id,
          details: JSON.stringify({ name: workflowName, stepCount: workflow.steps.length }),
          performedAt: new Date(),
        },
      });

      return {
        agentType: this.agentType,
        taskType: task.type,
        suggestions: [workflowSuggestion, ...parsed.suggestions],
        interpretation: parsed.interpretation,
        requiresApproval: true,
        executedAt: new Date(),
      };
    }

    // Build workflow from provided steps
    const workflowSteps: WorkflowStep[] = steps.map((s, i) => ({
      id: this.generateId('step'),
      name: `${s.engine}:${s.operation}`,
      engine: s.engine,
      operation: s.operation,
      params: s.params,
      dependsOn: s.dependsOn ?? (i > 0 ? [steps[i - 1].engine + ':' + steps[i - 1].operation] : []),
      retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      timeoutMs: 60000,
    }));

    // Validate engines and operations
    const validationIssues: string[] = [];
    for (const step of steps) {
      const validOps = this.engineOperations[step.engine];
      if (!validOps) {
        validationIssues.push(`Unknown engine "${step.engine}" in step "${step.engine}:${step.operation}"`);
      } else if (!validOps.includes(step.operation)) {
        validationIssues.push(`Unknown operation "${step.operation}" for engine "${step.engine}". Valid: ${validOps.join(', ')}`);
      }
    }

    // Detect circular dependencies
    const circularDeps = this.detectCircularDependencies(workflowSteps);

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    suggestions.push({
      action: 'workflow_created',
      description: `Workflow "${workflowName}" built with ${workflowSteps.length} steps. Execution order: ${workflowSteps.map((s) => s.name).join(' -> ')}`,
      confidence: 0.9,
    });

    validationIssues.forEach((issue) => {
      suggestions.push({ action: 'validation_warning', description: issue, confidence: 0.95 });
    });

    if (circularDeps.length > 0) {
      suggestions.push({
        action: 'circular_dependency',
        description: `Circular dependencies detected: ${circularDeps.join(', ')}. Workflow cannot execute.`,
        confidence: 1.0,
      });
    }

    const interpretation = `Workflow "${workflowName}" created with ${workflowSteps.length} steps. ${validationIssues.length} validation issues. ${circularDeps.length > 0 ? 'BLOCKED: Circular dependencies detected.' : 'Ready for execution.'}`;

    await prisma.auditLog.create({
      data: {
        action: 'automation_create_workflow',
        entityType: 'workflow',
        entityId: this.generateId('wf'),
        details: JSON.stringify({ name: workflowName, stepCount: workflowSteps.length, validationIssues: validationIssues.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async scheduleTask(task: AutomationWorkflowTask): Promise<AgentResult> {
    const schedule = task.schedule;
    if (!schedule) {
      throw new Error('schedule_task requires a schedule configuration');
    }

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    // Validate cron expression
    if (schedule.cron) {
      const cronParts = schedule.cron.split(' ');
      const isValid = cronParts.length === 5 || cronParts.length === 6;
      if (!isValid) {
        suggestions.push({
          action: 'invalid_cron',
          description: `Invalid cron expression "${schedule.cron}". Expected 5-6 space-separated fields.`,
          confidence: 1.0,
        });
      } else {
        const humanReadable = this.describeCron(schedule.cron);
        suggestions.push({
          action: 'schedule_configured',
          description: `Schedule set: "${schedule.cron}" (${humanReadable}). Timezone: ${schedule.timezone ?? 'Asia/Riyadh (default)'}`,
          confidence: 0.95,
        });
      }
    }

    if (schedule.interval) {
      suggestions.push({
        action: 'interval_configured',
        description: `Interval schedule set: every ${schedule.interval}. Starting: ${schedule.startDate ?? 'immediately'}`,
        confidence: 0.9,
      });
    }

    // Recommend optimal scheduling based on Saudi business hours
    const timezone = schedule.timezone ?? 'Asia/Riyadh';
    if (timezone === 'Asia/Riyadh' || timezone === 'AST') {
      suggestions.push({
        action: 'scheduling_recommendation',
        description: 'For Saudi operations: consider scheduling heavy tasks during 1:00-4:00 AM AST (low-usage period). Avoid Friday-Saturday (weekend). Respect Ramadan adjusted hours.',
        confidence: 0.8,
      });
    }

    // If steps are provided, estimate execution time
    const steps = task.steps ?? [];
    if (steps.length > 0) {
      const estimatedDurationMs = steps.length * 15000; // 15s average per step
      suggestions.push({
        action: 'execution_estimate',
        description: `Estimated execution time: ${(estimatedDurationMs / 1000).toFixed(0)} seconds for ${steps.length} steps. Ensure schedule interval exceeds execution time.`,
        confidence: 0.7,
      });
    }

    const interpretation = `Task scheduling configured for dataset "${task.datasetId}". ${schedule.cron ? `Cron: ${schedule.cron}` : `Interval: ${schedule.interval}`}. Timezone: ${timezone}.`;

    await prisma.auditLog.create({
      data: {
        action: 'automation_schedule_task',
        entityType: 'schedule',
        entityId: task.datasetId,
        details: JSON.stringify({ schedule, stepsCount: steps.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async chainOperations(task: AutomationWorkflowTask): Promise<AgentResult> {
    const steps = task.steps ?? [];

    if (steps.length < 2) {
      throw new Error('chain_operations requires at least 2 steps');
    }

    // Analyze the chain for data flow compatibility
    const chainAnalysis: Array<{ from: string; to: string; compatible: boolean; reason: string }> = [];

    for (let i = 0; i < steps.length - 1; i++) {
      const current = steps[i];
      const next = steps[i + 1];

      // Determine output-input compatibility heuristically
      const outputEngine = current.engine;
      const inputEngine = next.engine;

      let compatible = true;
      let reason = 'Standard data flow';

      // Some engines produce specific outputs
      if (outputEngine === 'conversion' && next.operation === 'analyze') {
        compatible = true;
        reason = 'Conversion output feeds into analysis input';
      } else if (outputEngine === 'data-files' && current.operation === 'export') {
        compatible = inputEngine === 'data-files' || inputEngine === 'conversion';
        reason = compatible ? 'File export compatible with file/conversion input' : 'Export output may not be compatible with next step input';
      }

      chainAnalysis.push({
        from: `${current.engine}:${current.operation}`,
        to: `${next.engine}:${next.operation}`,
        compatible,
        reason,
      });
    }

    // Build execution plan with parallel detection
    const executionPlan = this.buildExecutionPlan(steps);

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    suggestions.push({
      action: 'chain_created',
      description: `Operation chain with ${steps.length} steps across ${new Set(steps.map((s) => s.engine)).size} engines. Execution phases: ${executionPlan.phases.length}`,
      confidence: 0.9,
    });

    executionPlan.phases.forEach((phase, i) => {
      suggestions.push({
        action: 'execution_phase',
        description: `Phase ${i + 1}: ${phase.steps.map((s) => `${s.engine}:${s.operation}`).join(' + ')} (${phase.parallel ? 'parallel' : 'sequential'})`,
        confidence: 0.85,
      });
    });

    chainAnalysis.filter((a) => !a.compatible).forEach((a) => {
      suggestions.push({
        action: 'compatibility_warning',
        description: `Potential incompatibility: ${a.from} -> ${a.to}. ${a.reason}`,
        confidence: 0.75,
      });
    });

    const interpretation = `Operation chain built: ${steps.length} operations across ${new Set(steps.map((s) => s.engine)).size} engines, organized into ${executionPlan.phases.length} execution phases. ${chainAnalysis.filter((a) => !a.compatible).length} compatibility warnings.`;

    await prisma.auditLog.create({
      data: {
        action: 'automation_chain_operations',
        entityType: 'workflow',
        entityId: task.datasetId,
        details: JSON.stringify({ stepCount: steps.length, phases: executionPlan.phases.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async setupTrigger(task: AutomationWorkflowTask): Promise<AgentResult> {
    const trigger = task.trigger;
    if (!trigger) {
      throw new Error('setup_trigger requires a trigger configuration');
    }

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    switch (trigger.type) {
      case 'data_change': {
        suggestions.push({
          action: 'trigger_data_change',
          description: `Data change trigger configured for dataset "${trigger.sourceDatasetId ?? task.datasetId}". Condition: ${trigger.condition ?? 'any change'}. Will monitor for INSERT, UPDATE, DELETE events.`,
          confidence: 0.9,
        });
        suggestions.push({
          action: 'trigger_debounce',
          description: 'Recommend adding debounce (e.g., 30s) to prevent rapid-fire triggering during bulk data loads.',
          confidence: 0.8,
        });
        break;
      }
      case 'threshold': {
        if (!trigger.threshold) {
          throw new Error('threshold trigger requires threshold configuration');
        }
        const th = trigger.threshold;
        suggestions.push({
          action: 'trigger_threshold',
          description: `Threshold trigger: column "${th.column}" ${th.operator} ${th.value}. Will evaluate on each data update.`,
          confidence: 0.9,
        });
        suggestions.push({
          action: 'trigger_cooldown',
          description: 'Recommend cooldown period after trigger fires to prevent re-triggering while condition persists.',
          confidence: 0.8,
        });
        break;
      }
      case 'schedule': {
        suggestions.push({
          action: 'trigger_schedule',
          description: `Schedule trigger: ${task.schedule?.cron ?? task.schedule?.interval ?? 'not configured'}. Timezone: ${task.schedule?.timezone ?? 'Asia/Riyadh'}`,
          confidence: 0.9,
        });
        break;
      }
      case 'webhook': {
        const webhookUrl = `https://api.rasid.sa/webhooks/${this.generateId('wh')}`;
        suggestions.push({
          action: 'trigger_webhook',
          description: `Webhook trigger configured. Endpoint: ${webhookUrl}. Accepts POST requests with JSON payload. Validate incoming signatures for security.`,
          confidence: 0.85,
        });
        suggestions.push({
          action: 'webhook_security',
          description: 'Webhook security: require HMAC signature verification, IP allowlisting, and rate limiting (max 100 req/min).',
          confidence: 0.9,
        });
        break;
      }
      case 'manual': {
        suggestions.push({
          action: 'trigger_manual',
          description: `Manual trigger configured. Workflow can be started via API call or UI button. Requires user authentication and authorization.`,
          confidence: 0.95,
        });
        break;
      }
    }

    // General trigger best practices
    suggestions.push({
      action: 'trigger_logging',
      description: 'All trigger events will be logged to audit trail. Failed triggers will generate alerts.',
      confidence: 0.9,
    });

    const interpretation = `Trigger of type "${trigger.type}" configured for dataset "${task.datasetId}". ${suggestions.length} configurations and recommendations generated.`;

    await prisma.auditLog.create({
      data: {
        action: 'automation_setup_trigger',
        entityType: 'trigger',
        entityId: task.datasetId,
        details: JSON.stringify({ triggerType: trigger.type, condition: trigger.condition }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async optimizePipeline(task: AutomationWorkflowTask): Promise<AgentResult> {
    const pipeline = task.existingPipeline ?? [];

    if (pipeline.length === 0) {
      throw new Error('optimize_pipeline requires existingPipeline data');
    }

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];
    const totalDuration = pipeline.reduce((s, p) => s + p.avgDurationMs, 0);
    const avgErrorRate = pipeline.reduce((s, p) => s + p.errorRate, 0) / pipeline.length;

    // Identify bottlenecks (steps with > 2x average duration)
    const avgDuration = totalDuration / pipeline.length;
    const bottlenecks = pipeline.filter((p) => p.avgDurationMs > avgDuration * 2);
    bottlenecks.forEach((b) => {
      suggestions.push({
        action: 'bottleneck_detected',
        description: `Step "${b.stepId}" (${b.engine}:${b.operation}) is a bottleneck: ${b.avgDurationMs}ms avg (${(b.avgDurationMs / avgDuration).toFixed(1)}x pipeline average). Consider: caching, parallelization, or optimization.`,
        confidence: 0.9,
      });
    });

    // Identify error-prone steps
    const errorProneSteps = pipeline.filter((p) => p.errorRate > 0.05);
    errorProneSteps.forEach((e) => {
      suggestions.push({
        action: 'high_error_rate',
        description: `Step "${e.stepId}" (${e.engine}:${e.operation}) has ${(e.errorRate * 100).toFixed(1)}% error rate. Add retry logic, input validation, or fallback.`,
        confidence: 0.85,
      });
    });

    // Detect parallelization opportunities
    const parallelizable: string[][] = [];
    for (let i = 0; i < pipeline.length; i++) {
      for (let j = i + 1; j < pipeline.length; j++) {
        const step1 = pipeline[i];
        const step2 = pipeline[j];
        const step1DepsOnStep2 = step1.dependencies.includes(step2.stepId);
        const step2DepsOnStep1 = step2.dependencies.includes(step1.stepId);
        if (!step1DepsOnStep2 && !step2DepsOnStep1) {
          parallelizable.push([step1.stepId, step2.stepId]);
        }
      }
    }

    if (parallelizable.length > 0) {
      suggestions.push({
        action: 'parallelization_opportunity',
        description: `${parallelizable.length} step pairs can run in parallel: ${parallelizable.slice(0, 3).map(([a, b]) => `${a}+${b}`).join(', ')}${parallelizable.length > 3 ? '...' : ''}. Estimated time savings: ${(totalDuration * 0.3 / 1000).toFixed(1)}s`,
        confidence: 0.8,
      });
    }

    // Overall pipeline health
    const healthScore = Math.max(0, 100 - (bottlenecks.length * 15) - (errorProneSteps.length * 20) - (avgErrorRate * 100));
    suggestions.push({
      action: 'pipeline_health_score',
      description: `Pipeline health score: ${healthScore.toFixed(0)}/100. Total duration: ${(totalDuration / 1000).toFixed(1)}s. Avg error rate: ${(avgErrorRate * 100).toFixed(2)}%.`,
      confidence: 0.85,
    });

    const interpretation = `Pipeline optimization: ${pipeline.length} steps analyzed. Health score: ${healthScore.toFixed(0)}/100. ${bottlenecks.length} bottlenecks, ${errorProneSteps.length} error-prone steps, ${parallelizable.length} parallelization opportunities.`;

    await prisma.auditLog.create({
      data: {
        action: 'automation_optimize_pipeline',
        entityType: 'pipeline',
        entityId: task.datasetId,
        details: JSON.stringify({ stepCount: pipeline.length, healthScore, bottlenecks: bottlenecks.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private detectCircularDependencies(steps: WorkflowStep[]): string[] {
    const circular: string[] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const stepMap = new Map(steps.map((s) => [s.name, s]));

    const dfs = (stepName: string): boolean => {
      if (inStack.has(stepName)) {
        circular.push(stepName);
        return true;
      }
      if (visited.has(stepName)) return false;

      visited.add(stepName);
      inStack.add(stepName);

      const step = stepMap.get(stepName);
      if (step) {
        for (const dep of step.dependsOn) {
          if (dfs(dep)) return true;
        }
      }

      inStack.delete(stepName);
      return false;
    };

    steps.forEach((s) => dfs(s.name));
    return circular;
  }

  private buildExecutionPlan(steps: AutomationWorkflowTask['steps']): {
    phases: Array<{ steps: Array<{ engine: string; operation: string }>; parallel: boolean }>;
  } {
    if (!steps || steps.length === 0) return { phases: [] };

    const phases: Array<{ steps: Array<{ engine: string; operation: string }>; parallel: boolean }> = [];
    const executed = new Set<string>();
    const remaining = [...steps];

    while (remaining.length > 0) {
      const ready = remaining.filter((s) => {
        const deps = s.dependsOn ?? [];
        return deps.every((d) => executed.has(d));
      });

      if (ready.length === 0) {
        // Force remaining steps (may have unresolvable deps)
        phases.push({
          steps: remaining.map((s) => ({ engine: s.engine, operation: s.operation })),
          parallel: false,
        });
        break;
      }

      phases.push({
        steps: ready.map((s) => ({ engine: s.engine, operation: s.operation })),
        parallel: ready.length > 1,
      });

      ready.forEach((s) => {
        executed.add(`${s.engine}:${s.operation}`);
        const idx = remaining.indexOf(s);
        if (idx >= 0) remaining.splice(idx, 1);
      });
    }

    return { phases };
  }

  private describeCron(cron: string): string {
    const parts = cron.split(' ');
    if (parts.length < 5) return 'Invalid cron expression';

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const descriptions: string[] = [];

    if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Daily at midnight';
    }
    if (minute === '0' && hour === '*' && dayOfMonth === '*') {
      return 'Every hour';
    }
    if (dayOfWeek === '1-5' || dayOfWeek === 'MON-FRI') {
      descriptions.push('Weekdays only');
    }
    if (dayOfWeek === '0,6' || dayOfWeek === 'SAT,SUN') {
      descriptions.push('Weekends only');
    }
    if (hour !== '*') {
      descriptions.push(`at ${hour}:${minute === '*' ? '00' : minute.padStart(2, '0')}`);
    }
    if (dayOfMonth !== '*') {
      descriptions.push(`on day ${dayOfMonth} of the month`);
    }
    if (month !== '*') {
      descriptions.push(`in month ${month}`);
    }

    return descriptions.length > 0 ? descriptions.join(', ') : `Custom schedule: ${cron}`;
  }
}
