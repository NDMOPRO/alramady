import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { IntentResult, IntentType, ExtractedEntity } from './intent-engine.service.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TaskStep {
  id: string;
  name: string;
  description: string;
  engine: string;
  action: string;
  inputSchema: Record<string, unknown>;
  expectedOutputSchema: Record<string, unknown>;
  dependencies: string[];
  estimatedTimeMs: number;
  estimatedResources: ResourceEstimate;
  priority: number;
  isOptional: boolean;
  retryPolicy: RetryPolicy;
  condition: StepCondition | null;
}

export interface ResourceEstimate {
  cpuIntensity: 'low' | 'medium' | 'high';
  memoryMb: number;
  requiresGpu: boolean;
  networkCalls: number;
  dbQueries: number;
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
}

export interface StepCondition {
  dependsOn: string;
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists';
  value: unknown;
}

export interface ExecutionPlan {
  id: string;
  name: string;
  description: string;
  steps: TaskStep[];
  executionOrder: string[][];
  totalEstimatedTimeMs: number;
  parallelizable: boolean;
  criticalPath: string[];
  createdAt: Date;
}

export interface DecompositionResult {
  plan: ExecutionPlan;
  dag: DAGNode[];
  warnings: string[];
}

export interface DAGNode {
  stepId: string;
  children: string[];
  parents: string[];
  depth: number;
  canRunInParallel: boolean;
}

// ─── Engine-Action Registry ──────────────────────────────────────────────────

interface EngineAction {
  engine: string;
  action: string;
  description: string;
  estimatedTimeMs: number;
  resources: ResourceEstimate;
}

const ENGINE_ACTIONS: Record<string, EngineAction[]> = {
  data_files: [
    {
      engine: 'data_files',
      action: 'read_file',
      description: 'Read and parse a data file',
      estimatedTimeMs: 2000,
      resources: { cpuIntensity: 'medium', memoryMb: 256, requiresGpu: false, networkCalls: 0, dbQueries: 1 },
    },
    {
      engine: 'data_files',
      action: 'profile_data',
      description: 'Profile data quality and statistics',
      estimatedTimeMs: 5000,
      resources: { cpuIntensity: 'high', memoryMb: 512, requiresGpu: false, networkCalls: 0, dbQueries: 2 },
    },
    {
      engine: 'data_files',
      action: 'clean_data',
      description: 'Clean and normalize data',
      estimatedTimeMs: 8000,
      resources: { cpuIntensity: 'high', memoryMb: 512, requiresGpu: false, networkCalls: 0, dbQueries: 3 },
    },
    {
      engine: 'data_files',
      action: 'merge_data',
      description: 'Merge multiple data sources',
      estimatedTimeMs: 10000,
      resources: { cpuIntensity: 'high', memoryMb: 1024, requiresGpu: false, networkCalls: 0, dbQueries: 4 },
    },
    {
      engine: 'data_files',
      action: 'filter_data',
      description: 'Filter data by criteria',
      estimatedTimeMs: 3000,
      resources: { cpuIntensity: 'medium', memoryMb: 256, requiresGpu: false, networkCalls: 0, dbQueries: 1 },
    },
  ],
  excel: [
    {
      engine: 'excel',
      action: 'process_workbook',
      description: 'Process Excel workbook',
      estimatedTimeMs: 5000,
      resources: { cpuIntensity: 'medium', memoryMb: 512, requiresGpu: false, networkCalls: 0, dbQueries: 2 },
    },
    {
      engine: 'excel',
      action: 'apply_formulas',
      description: 'Apply formulas to spreadsheet',
      estimatedTimeMs: 3000,
      resources: { cpuIntensity: 'medium', memoryMb: 256, requiresGpu: false, networkCalls: 0, dbQueries: 1 },
    },
  ],
  dashboards: [
    {
      engine: 'dashboards',
      action: 'create_dashboard',
      description: 'Create interactive dashboard',
      estimatedTimeMs: 15000,
      resources: { cpuIntensity: 'high', memoryMb: 512, requiresGpu: false, networkCalls: 1, dbQueries: 5 },
    },
    {
      engine: 'dashboards',
      action: 'add_widget',
      description: 'Add widget to dashboard',
      estimatedTimeMs: 3000,
      resources: { cpuIntensity: 'low', memoryMb: 128, requiresGpu: false, networkCalls: 0, dbQueries: 2 },
    },
    {
      engine: 'dashboards',
      action: 'configure_layout',
      description: 'Configure dashboard layout',
      estimatedTimeMs: 2000,
      resources: { cpuIntensity: 'low', memoryMb: 128, requiresGpu: false, networkCalls: 0, dbQueries: 1 },
    },
  ],
  reports: [
    {
      engine: 'reports',
      action: 'generate_report',
      description: 'Generate professional report',
      estimatedTimeMs: 20000,
      resources: { cpuIntensity: 'high', memoryMb: 1024, requiresGpu: false, networkCalls: 2, dbQueries: 5 },
    },
    {
      engine: 'reports',
      action: 'add_section',
      description: 'Add section to report',
      estimatedTimeMs: 5000,
      resources: { cpuIntensity: 'medium', memoryMb: 256, requiresGpu: false, networkCalls: 1, dbQueries: 2 },
    },
  ],
  presentations: [
    {
      engine: 'presentations',
      action: 'create_presentation',
      description: 'Create presentation slides',
      estimatedTimeMs: 25000,
      resources: { cpuIntensity: 'high', memoryMb: 1024, requiresGpu: false, networkCalls: 2, dbQueries: 4 },
    },
    {
      engine: 'presentations',
      action: 'create_infographic',
      description: 'Create infographic',
      estimatedTimeMs: 20000,
      resources: { cpuIntensity: 'high', memoryMb: 512, requiresGpu: false, networkCalls: 2, dbQueries: 3 },
    },
  ],
  ai_intelligence: [
    {
      engine: 'ai_intelligence',
      action: 'analyze_data',
      description: 'AI-powered data analysis',
      estimatedTimeMs: 15000,
      resources: { cpuIntensity: 'high', memoryMb: 512, requiresGpu: false, networkCalls: 3, dbQueries: 2 },
    },
    {
      engine: 'ai_intelligence',
      action: 'summarize',
      description: 'AI summarization',
      estimatedTimeMs: 10000,
      resources: { cpuIntensity: 'medium', memoryMb: 256, requiresGpu: false, networkCalls: 2, dbQueries: 1 },
    },
    {
      engine: 'ai_intelligence',
      action: 'forecast',
      description: 'AI forecasting',
      estimatedTimeMs: 20000,
      resources: { cpuIntensity: 'high', memoryMb: 512, requiresGpu: false, networkCalls: 3, dbQueries: 3 },
    },
    {
      engine: 'ai_intelligence',
      action: 'query_answer',
      description: 'Answer natural language query',
      estimatedTimeMs: 8000,
      resources: { cpuIntensity: 'medium', memoryMb: 256, requiresGpu: false, networkCalls: 2, dbQueries: 2 },
    },
  ],
  localization: [
    {
      engine: 'localization',
      action: 'translate',
      description: 'Translate content',
      estimatedTimeMs: 12000,
      resources: { cpuIntensity: 'medium', memoryMb: 256, requiresGpu: false, networkCalls: 2, dbQueries: 1 },
    },
    {
      engine: 'localization',
      action: 'arabize',
      description: 'Professional arabization',
      estimatedTimeMs: 15000,
      resources: { cpuIntensity: 'medium', memoryMb: 256, requiresGpu: false, networkCalls: 3, dbQueries: 2 },
    },
  ],
  conversion: [
    {
      engine: 'conversion',
      action: 'convert_format',
      description: 'Convert between file formats',
      estimatedTimeMs: 5000,
      resources: { cpuIntensity: 'medium', memoryMb: 256, requiresGpu: false, networkCalls: 0, dbQueries: 1 },
    },
  ],
  literal_match: [
    {
      engine: 'literal_match',
      action: 'exact_match',
      description: 'Perform exact text matching',
      estimatedTimeMs: 3000,
      resources: { cpuIntensity: 'low', memoryMb: 128, requiresGpu: false, networkCalls: 0, dbQueries: 2 },
    },
  ],
  governance: [
    {
      engine: 'governance',
      action: 'check_permissions',
      description: 'Check user permissions',
      estimatedTimeMs: 1000,
      resources: { cpuIntensity: 'low', memoryMb: 64, requiresGpu: false, networkCalls: 0, dbQueries: 1 },
    },
    {
      engine: 'governance',
      action: 'audit_log',
      description: 'Create audit log entry',
      estimatedTimeMs: 500,
      resources: { cpuIntensity: 'low', memoryMb: 64, requiresGpu: false, networkCalls: 0, dbQueries: 1 },
    },
  ],
};

// ─── Intent to Steps Mapping ─────────────────────────────────────────────────

const INTENT_STEP_TEMPLATES: Record<IntentType, Array<{
  name: string;
  engine: string;
  action: string;
  dependsOnPrevious: boolean;
  isOptional: boolean;
  priority: number;
}>> = {
  analyze: [
    { name: 'Load Data', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Profile Data', engine: 'data_files', action: 'profile_data', dependsOnPrevious: true, isOptional: false, priority: 2 },
    { name: 'AI Analysis', engine: 'ai_intelligence', action: 'analyze_data', dependsOnPrevious: true, isOptional: false, priority: 3 },
    { name: 'Audit', engine: 'governance', action: 'audit_log', dependsOnPrevious: false, isOptional: true, priority: 4 },
  ],
  build_dashboard: [
    { name: 'Load Data', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Profile Data', engine: 'data_files', action: 'profile_data', dependsOnPrevious: true, isOptional: false, priority: 2 },
    { name: 'Create Dashboard', engine: 'dashboards', action: 'create_dashboard', dependsOnPrevious: true, isOptional: false, priority: 3 },
    { name: 'Configure Layout', engine: 'dashboards', action: 'configure_layout', dependsOnPrevious: true, isOptional: false, priority: 4 },
    { name: 'Audit', engine: 'governance', action: 'audit_log', dependsOnPrevious: false, isOptional: true, priority: 5 },
  ],
  generate_report: [
    { name: 'Load Data', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Analyze Data', engine: 'ai_intelligence', action: 'analyze_data', dependsOnPrevious: true, isOptional: false, priority: 2 },
    { name: 'Generate Report', engine: 'reports', action: 'generate_report', dependsOnPrevious: true, isOptional: false, priority: 3 },
    { name: 'Audit', engine: 'governance', action: 'audit_log', dependsOnPrevious: false, isOptional: true, priority: 4 },
  ],
  compare: [
    { name: 'Load Source A', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Load Source B', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Compare Analysis', engine: 'ai_intelligence', action: 'analyze_data', dependsOnPrevious: true, isOptional: false, priority: 2 },
  ],
  clean_data: [
    { name: 'Load Data', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Profile Data', engine: 'data_files', action: 'profile_data', dependsOnPrevious: true, isOptional: false, priority: 2 },
    { name: 'Clean Data', engine: 'data_files', action: 'clean_data', dependsOnPrevious: true, isOptional: false, priority: 3 },
    { name: 'Audit', engine: 'governance', action: 'audit_log', dependsOnPrevious: false, isOptional: true, priority: 4 },
  ],
  import: [
    { name: 'Check Permissions', engine: 'governance', action: 'check_permissions', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Read File', engine: 'data_files', action: 'read_file', dependsOnPrevious: true, isOptional: false, priority: 2 },
    { name: 'Profile Data', engine: 'data_files', action: 'profile_data', dependsOnPrevious: true, isOptional: false, priority: 3 },
    { name: 'Audit', engine: 'governance', action: 'audit_log', dependsOnPrevious: false, isOptional: true, priority: 4 },
  ],
  export: [
    { name: 'Load Data', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Convert Format', engine: 'conversion', action: 'convert_format', dependsOnPrevious: true, isOptional: false, priority: 2 },
    { name: 'Audit', engine: 'governance', action: 'audit_log', dependsOnPrevious: false, isOptional: true, priority: 3 },
  ],
  translate: [
    { name: 'Load Content', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Translate', engine: 'localization', action: 'translate', dependsOnPrevious: true, isOptional: false, priority: 2 },
  ],
  present: [
    { name: 'Load Data', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Analyze Data', engine: 'ai_intelligence', action: 'analyze_data', dependsOnPrevious: true, isOptional: false, priority: 2 },
    { name: 'Create Presentation', engine: 'presentations', action: 'create_presentation', dependsOnPrevious: true, isOptional: false, priority: 3 },
  ],
  query: [
    { name: 'Query Answer', engine: 'ai_intelligence', action: 'query_answer', dependsOnPrevious: false, isOptional: false, priority: 1 },
  ],
  forecast: [
    { name: 'Load Data', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Profile Data', engine: 'data_files', action: 'profile_data', dependsOnPrevious: true, isOptional: false, priority: 2 },
    { name: 'Forecast', engine: 'ai_intelligence', action: 'forecast', dependsOnPrevious: true, isOptional: false, priority: 3 },
  ],
  summarize: [
    { name: 'Load Content', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Summarize', engine: 'ai_intelligence', action: 'summarize', dependsOnPrevious: true, isOptional: false, priority: 2 },
  ],
  extract: [
    { name: 'Load Data', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Filter Data', engine: 'data_files', action: 'filter_data', dependsOnPrevious: true, isOptional: false, priority: 2 },
  ],
  merge: [
    { name: 'Load Source A', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Load Source B', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Merge Data', engine: 'data_files', action: 'merge_data', dependsOnPrevious: true, isOptional: false, priority: 2 },
  ],
  visualize: [
    { name: 'Load Data', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Create Dashboard', engine: 'dashboards', action: 'create_dashboard', dependsOnPrevious: true, isOptional: false, priority: 2 },
    { name: 'Add Widget', engine: 'dashboards', action: 'add_widget', dependsOnPrevious: true, isOptional: false, priority: 3 },
  ],
  govern: [
    { name: 'Check Permissions', engine: 'governance', action: 'check_permissions', dependsOnPrevious: false, isOptional: false, priority: 1 },
  ],
  match: [
    { name: 'Load Data', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Exact Match', engine: 'literal_match', action: 'exact_match', dependsOnPrevious: true, isOptional: false, priority: 2 },
  ],
  convert: [
    { name: 'Load File', engine: 'data_files', action: 'read_file', dependsOnPrevious: false, isOptional: false, priority: 1 },
    { name: 'Convert Format', engine: 'conversion', action: 'convert_format', dependsOnPrevious: true, isOptional: false, priority: 2 },
  ],
  unknown: [
    { name: 'Query Answer', engine: 'ai_intelligence', action: 'query_answer', dependsOnPrevious: false, isOptional: false, priority: 1 },
  ],
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class TaskDecompositionService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' || '' });
    logger.info('TaskDecompositionService initialized');
  }

  async decompose(intentResult: IntentResult, context?: Record<string, unknown>): Promise<DecompositionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // Get base template steps
    const templates = INTENT_STEP_TEMPLATES[intentResult.intent] || INTENT_STEP_TEMPLATES.unknown;

    // Generate steps from templates
    const steps = this.generateStepsFromTemplates(templates, intentResult);

    // If the intent is complex (multiple entities, high specificity), use AI for refinement
    const isComplex = intentResult.entities.length > 3 || intentResult.originalText.length > 200;

    if (isComplex) {
      const aiSteps = await this.refineWithAI(intentResult, steps, context);
      if (aiSteps.length > 0) {
        steps.length = 0;
        steps.push(...aiSteps);
      }
    }

    // Build DAG
    const dag = this.buildDAG(steps);

    // Validate DAG for cycles
    const hasCycle = this.detectCycle(dag);
    if (hasCycle) {
      warnings.push('Circular dependency detected in execution plan, linearizing steps');
      this.linearizeSteps(steps);
    }

    // Compute execution order (levels of parallelism)
    const executionOrder = this.computeExecutionOrder(steps, dag);

    // Compute critical path
    const criticalPath = this.computeCriticalPath(steps, dag);

    // Compute total time considering parallelism
    const totalEstimatedTimeMs = this.computeTotalTime(steps, executionOrder);

    const plan: ExecutionPlan = {
      id: randomUUID(),
      name: `Plan for: ${intentResult.normalizedCommand.substring(0, 100)}`,
      description: `Execution plan for intent "${intentResult.intent}" with ${steps.length} steps`,
      steps,
      executionOrder,
      totalEstimatedTimeMs,
      parallelizable: executionOrder.some((level) => level.length > 1),
      criticalPath,
      createdAt: new Date(),
    };

    const elapsed = Date.now() - startTime;
    logger.info('Task decomposed', {
      planId: plan.id,
      intent: intentResult.intent,
      stepCount: steps.length,
      parallelizable: plan.parallelizable,
      estimatedTimeMs: totalEstimatedTimeMs,
      decompositionTimeMs: elapsed,
    });

    return { plan, dag, warnings };
  }

  // ─── Step Generation ───────────────────────────────────────────────────

  private generateStepsFromTemplates(
    templates: Array<{
      name: string;
      engine: string;
      action: string;
      dependsOnPrevious: boolean;
      isOptional: boolean;
      priority: number;
    }>,
    intentResult: IntentResult,
  ): TaskStep[] {
    const steps: TaskStep[] = [];
    let previousStepId: string | null = null;

    for (const template of templates) {
      const stepId = randomUUID();

      const engineActions = ENGINE_ACTIONS[template.engine] || [];
      const actionDef = engineActions.find((a) => a.action === template.action);

      const inputSchema = this.buildInputSchema(template.action, intentResult.entities);
      const expectedOutputSchema = this.buildOutputSchema(template.action);

      const dependencies: string[] = [];
      if (template.dependsOnPrevious && previousStepId) {
        dependencies.push(previousStepId);
      }

      const step: TaskStep = {
        id: stepId,
        name: template.name,
        description: actionDef?.description || template.name,
        engine: template.engine,
        action: template.action,
        inputSchema,
        expectedOutputSchema,
        dependencies,
        estimatedTimeMs: actionDef?.estimatedTimeMs || 5000,
        estimatedResources: actionDef?.resources || {
          cpuIntensity: 'medium',
          memoryMb: 256,
          requiresGpu: false,
          networkCalls: 1,
          dbQueries: 1,
        },
        priority: template.priority,
        isOptional: template.isOptional,
        retryPolicy: {
          maxRetries: template.isOptional ? 1 : 3,
          retryDelayMs: 1000,
          backoffMultiplier: 2,
        },
        condition: null,
      };

      steps.push(step);
      previousStepId = stepId;
    }

    return steps;
  }

  private buildInputSchema(action: string, entities: ExtractedEntity[]): Record<string, unknown> {
    const schema: Record<string, unknown> = { action };

    const fileEntities = entities.filter((e) => e.type === 'file');
    if (fileEntities.length > 0) {
      schema.files = fileEntities.map((e) => e.normalizedValue);
    }

    const dateEntities = entities.filter((e) => e.type === 'date_range');
    if (dateEntities.length > 0) {
      schema.dateRange = dateEntities.map((e) => e.normalizedValue);
    }

    const columnEntities = entities.filter((e) => e.type === 'column');
    if (columnEntities.length > 0) {
      schema.columns = columnEntities.map((e) => e.normalizedValue);
    }

    const metricEntities = entities.filter((e) => e.type === 'metric');
    if (metricEntities.length > 0) {
      schema.metrics = metricEntities.map((e) => e.normalizedValue);
    }

    const formatEntities = entities.filter((e) => e.type === 'format');
    if (formatEntities.length > 0) {
      schema.format = formatEntities[0].normalizedValue;
    }

    const aggEntities = entities.filter((e) => e.type === 'aggregation');
    if (aggEntities.length > 0) {
      schema.aggregations = aggEntities.map((e) => e.normalizedValue);
    }

    const langEntities = entities.filter((e) => e.type === 'language');
    if (langEntities.length > 0) {
      schema.language = langEntities[0].normalizedValue;
    }

    return schema;
  }

  private buildOutputSchema(action: string): Record<string, unknown> {
    const outputSchemas: Record<string, Record<string, unknown>> = {
      read_file: { data: 'array', rowCount: 'number', columns: 'string[]' },
      profile_data: { statistics: 'object', qualityScore: 'number', issues: 'string[]' },
      clean_data: { cleanedData: 'array', changesApplied: 'string[]', removedRows: 'number' },
      merge_data: { mergedData: 'array', totalRows: 'number', matchedRows: 'number' },
      filter_data: { filteredData: 'array', matchCount: 'number' },
      create_dashboard: { dashboardId: 'string', url: 'string' },
      add_widget: { widgetId: 'string' },
      configure_layout: { layoutId: 'string' },
      generate_report: { reportId: 'string', url: 'string', pageCount: 'number' },
      add_section: { sectionId: 'string' },
      create_presentation: { presentationId: 'string', url: 'string', slideCount: 'number' },
      create_infographic: { infographicId: 'string', url: 'string' },
      analyze_data: { analysis: 'object', insights: 'string[]', confidence: 'number' },
      summarize: { summary: 'string', keyPoints: 'string[]' },
      forecast: { predictions: 'array', trend: 'string', confidence: 'number' },
      query_answer: { answer: 'string', confidence: 'number', sources: 'string[]' },
      translate: { translatedContent: 'string', sourceLanguage: 'string', targetLanguage: 'string' },
      arabize: { arabizedContent: 'string', qualityScore: 'number' },
      convert_format: { outputFile: 'string', outputFormat: 'string' },
      exact_match: { matches: 'array', matchCount: 'number' },
      check_permissions: { allowed: 'boolean', permissions: 'string[]' },
      audit_log: { logId: 'string' },
      process_workbook: { workbookId: 'string', sheetCount: 'number' },
      apply_formulas: { resultCells: 'object' },
    };

    return outputSchemas[action] || { result: 'unknown' };
  }

  // ─── AI Refinement ─────────────────────────────────────────────────────

  private async refineWithAI(
    intentResult: IntentResult,
    baseSteps: TaskStep[],
    context?: Record<string, unknown>,
  ): Promise<TaskStep[]> {
    const systemPrompt = `You are a task decomposition engine for a data platform called Rasid.
Given a user request and initial execution steps, refine the plan by:
1. Adding missing steps if needed
2. Adjusting dependencies for parallel execution where possible
3. Adding conditional steps if warranted

Available engines: ${Object.keys(ENGINE_ACTIONS).join(', ')}

Return a JSON array of steps with fields: name, engine, action, dependencies (array of step indices, 0-based), isOptional, priority, estimatedTimeMs.
Respond ONLY with valid JSON array, no markdown.`;

    const userPrompt = `Request: "${intentResult.originalText}"
Intent: ${intentResult.intent}
Entities: ${JSON.stringify(intentResult.entities.map((e) => ({ type: e.type, value: e.value })))}
Current steps: ${JSON.stringify(baseSteps.map((s, i) => ({ index: i, name: s.name, engine: s.engine, action: s.action })))}
${context ? `Context: ${JSON.stringify(context)}` : ''}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      });

      const raw = response.choices[0]?.message?.content || '[]';
      let parsed: Array<Record<string, unknown>>;
      try {
        const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        logger.warn('AI refinement returned non-JSON', { raw: raw.substring(0, 200) });
        return [];
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [];
      }

      const stepIds: string[] = [];
      const refinedSteps: TaskStep[] = [];

      for (const item of parsed) {
        const stepId = randomUUID();
        stepIds.push(stepId);

        const engine = String(item.engine || 'ai_intelligence');
        const action = String(item.action || 'query_answer');
        const engineActions = ENGINE_ACTIONS[engine] || [];
        const actionDef = engineActions.find((a) => a.action === action);

        const depIndices = Array.isArray(item.dependencies)
          ? (item.dependencies as number[]).filter((idx) => idx >= 0 && idx < stepIds.length - 1)
          : [];

        const step: TaskStep = {
          id: stepId,
          name: String(item.name || `Step ${refinedSteps.length + 1}`),
          description: actionDef?.description || String(item.name || action),
          engine,
          action,
          inputSchema: this.buildInputSchema(action, intentResult.entities),
          expectedOutputSchema: this.buildOutputSchema(action),
          dependencies: depIndices.map((idx) => stepIds[idx]),
          estimatedTimeMs: Number(item.estimatedTimeMs) || actionDef?.estimatedTimeMs || 5000,
          estimatedResources: actionDef?.resources || {
            cpuIntensity: 'medium',
            memoryMb: 256,
            requiresGpu: false,
            networkCalls: 1,
            dbQueries: 1,
          },
          priority: Number(item.priority) || refinedSteps.length + 1,
          isOptional: Boolean(item.isOptional),
          retryPolicy: {
            maxRetries: Boolean(item.isOptional) ? 1 : 3,
            retryDelayMs: 1000,
            backoffMultiplier: 2,
          },
          condition: null,
        };

        refinedSteps.push(step);
      }

      return refinedSteps;
    } catch (err) {
      logger.error('AI task refinement failed', { error: err });
      return [];
    }
  }

  // ─── DAG Construction ──────────────────────────────────────────────────

  private buildDAG(steps: TaskStep[]): DAGNode[] {
    const nodes: DAGNode[] = steps.map((step) => ({
      stepId: step.id,
      children: [],
      parents: [...step.dependencies],
      depth: 0,
      canRunInParallel: step.dependencies.length === 0,
    }));

    const nodeMap = new Map<string, DAGNode>();
    for (const node of nodes) {
      nodeMap.set(node.stepId, node);
    }

    // Build children references
    for (const node of nodes) {
      for (const parentId of node.parents) {
        const parentNode = nodeMap.get(parentId);
        if (parentNode) {
          parentNode.children.push(node.stepId);
        }
      }
    }

    // Compute depths
    this.computeDepths(nodes, nodeMap);

    // Mark parallel execution capability
    for (const node of nodes) {
      const siblings = nodes.filter(
        (n) => n.depth === node.depth && n.stepId !== node.stepId,
      );
      node.canRunInParallel = siblings.length > 0;
    }

    return nodes;
  }

  private computeDepths(nodes: DAGNode[], nodeMap: Map<string, DAGNode>): void {
    const visited = new Set<string>();
    const depths = new Map<string, number>();

    const computeDepth = (nodeId: string): number => {
      if (depths.has(nodeId)) return depths.get(nodeId)!;
      if (visited.has(nodeId)) return 0; // cycle guard

      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node || node.parents.length === 0) {
        depths.set(nodeId, 0);
        return 0;
      }

      let maxParentDepth = 0;
      for (const parentId of node.parents) {
        maxParentDepth = Math.max(maxParentDepth, computeDepth(parentId) + 1);
      }

      depths.set(nodeId, maxParentDepth);
      return maxParentDepth;
    };

    for (const node of nodes) {
      node.depth = computeDepth(node.stepId);
    }
  }

  private detectCycle(dag: DAGNode[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const nodeMap = new Map<string, DAGNode>();
    for (const node of dag) {
      nodeMap.set(node.stepId, node);
    }

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (node) {
        for (const childId of node.children) {
          if (!visited.has(childId)) {
            if (dfs(childId)) return true;
          } else if (recursionStack.has(childId)) {
            return true;
          }
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of dag) {
      if (!visited.has(node.stepId)) {
        if (dfs(node.stepId)) return true;
      }
    }

    return false;
  }

  private linearizeSteps(steps: TaskStep[]): void {
    for (let i = 0; i < steps.length; i++) {
      steps[i].dependencies = i > 0 ? [steps[i - 1].id] : [];
    }
  }

  // ─── Execution Order ──────────────────────────────────────────────────

  private computeExecutionOrder(steps: TaskStep[], dag: DAGNode[]): string[][] {
    const maxDepth = dag.reduce((max, node) => Math.max(max, node.depth), 0);
    const levels: string[][] = [];

    for (let depth = 0; depth <= maxDepth; depth++) {
      const levelSteps = dag
        .filter((node) => node.depth === depth)
        .map((node) => node.stepId);

      if (levelSteps.length > 0) {
        levels.push(levelSteps);
      }
    }

    return levels;
  }

  private computeCriticalPath(steps: TaskStep[], dag: DAGNode[]): string[] {
    const stepMap = new Map<string, TaskStep>();
    for (const step of steps) {
      stepMap.set(step.id, step);
    }

    const nodeMap = new Map<string, DAGNode>();
    for (const node of dag) {
      nodeMap.set(node.stepId, node);
    }

    // Find the longest path by total estimated time
    const pathTimes = new Map<string, number>();
    const pathPredecessors = new Map<string, string | null>();

    const computePathTime = (nodeId: string): number => {
      if (pathTimes.has(nodeId)) return pathTimes.get(nodeId)!;

      const step = stepMap.get(nodeId);
      const node = nodeMap.get(nodeId);

      if (!step || !node) {
        pathTimes.set(nodeId, 0);
        return 0;
      }

      let maxParentPath = 0;
      let bestParent: string | null = null;

      for (const parentId of node.parents) {
        const parentTime = computePathTime(parentId);
        if (parentTime > maxParentPath) {
          maxParentPath = parentTime;
          bestParent = parentId;
        }
      }

      const totalTime = maxParentPath + step.estimatedTimeMs;
      pathTimes.set(nodeId, totalTime);
      pathPredecessors.set(nodeId, bestParent);

      return totalTime;
    };

    // Compute all path times
    for (const node of dag) {
      computePathTime(node.stepId);
    }

    // Find the end node with the maximum path time
    let maxTime = 0;
    let endNode: string | null = null;

    for (const [nodeId, time] of pathTimes.entries()) {
      if (time > maxTime) {
        maxTime = time;
        endNode = nodeId;
      }
    }

    // Trace back the critical path
    const criticalPath: string[] = [];
    let current = endNode;
    while (current) {
      criticalPath.unshift(current);
      current = pathPredecessors.get(current) || null;
    }

    return criticalPath;
  }

  private computeTotalTime(steps: TaskStep[], executionOrder: string[][]): number {
    const stepMap = new Map<string, TaskStep>();
    for (const step of steps) {
      stepMap.set(step.id, step);
    }

    let totalTime = 0;
    for (const level of executionOrder) {
      // Steps in the same level run in parallel, so take the max
      let levelMax = 0;
      for (const stepId of level) {
        const step = stepMap.get(stepId);
        if (step) {
          levelMax = Math.max(levelMax, step.estimatedTimeMs);
        }
      }
      totalTime += levelMax;
    }

    return totalTime;
  }
}
