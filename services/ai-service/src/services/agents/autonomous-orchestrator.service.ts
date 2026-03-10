import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AgentOrchestratorService, AgentResult } from './agent-orchestrator.service.js';
import { DataIntelligenceAgent } from './data-intelligence.agent.js';
import { AnalyticsAgent } from './analytics.agent.js';
import { DashboardBuilderAgent } from './dashboard-builder.agent.js';
import { DataCleaningAgent } from './data-cleaning.agent.js';
import { ComplianceGovernanceAgent } from './compliance-governance.agent.js';
import { AutomationWorkflowAgent } from './automation-workflow.agent.js';
import { ResearchAgent } from './research.agent.js';
import { KnowledgeGraphAgent } from './knowledge-graph.agent.js';
import { AdminCopilotAgent } from './admin-copilot.agent.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });
const prisma = new PrismaClient();

export enum AutonomousAgentType {
  DATA_ADMIN = 'data-admin',
  ANALYST = 'analyst',
  DESIGNER = 'designer',
  REPORT_WRITER = 'report-writer',
  PRESENTATION = 'presentation',
  MONITORING = 'monitoring',
  DATA_INTELLIGENCE = 'data-intelligence',
  ANALYTICS = 'analytics',
  DASHBOARD_BUILDER = 'dashboard-builder',
  DATA_CLEANING = 'data-cleaning',
  COMPLIANCE_GOVERNANCE = 'compliance-governance',
  AUTOMATION_WORKFLOW = 'automation-workflow',
  RESEARCH = 'research',
  KNOWLEDGE_GRAPH = 'knowledge-graph',
  ADMIN_COPILOT = 'admin-copilot',
}

export interface AutonomousRequest {
  description: string;
  tenantId: string;
  userId: string;
  context?: string;
  data?: Record<string, unknown>;
  autoExecute?: boolean;
  qualityThreshold?: number;
}

export interface ExecutionStep {
  stepId: string;
  agentType: string;
  taskType: string;
  dependsOn: string[];
  priority: number;
  params: Record<string, unknown>;
}

export interface ExecutionPlan {
  requestId: string;
  steps: ExecutionStep[];
  estimatedDurationMs: number;
  requiredAgents: string[];
}

export interface ProactiveInsight {
  type: 'anomaly' | 'opportunity' | 'recommendation' | 'alert';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  suggestedAction: string;
  relatedEntities: string[];
  confidence: number;
}

export interface AutonomousResult {
  requestId: string;
  plan: ExecutionPlan;
  results: AgentResult[];
  proactiveInsights: ProactiveInsight[];
  orchestrationSummary: string;
  qualityScore: number;
  totalDurationMs: number;
  retryCount: number;
  failedAgents: string[];
}

interface DecomposedStep {
  agentType: string;
  taskType: string;
  dependsOn: string[];
  priority: number;
  params: Record<string, unknown>;
  reason: string;
}

interface AgentCapability {
  agentType: string;
  name: string;
  description: string;
  supportedTasks: string[];
  category: string;
}

const AGENT_CAPABILITIES: AgentCapability[] = [
  {
    agentType: AutonomousAgentType.DATA_ADMIN,
    name: 'Data Admin Agent',
    description: 'Manages data schemas, column unification, type adjustments, and KPI policies',
    supportedTasks: ['unify_columns', 'adjust_types', 'kpi_policy'],
    category: 'data-management',
  },
  {
    agentType: AutonomousAgentType.ANALYST,
    name: 'Analyst Agent',
    description: 'Performs data analysis including gap detection, anomaly finding, root cause analysis',
    supportedTasks: ['detect_gaps', 'find_anomalies', 'root_cause', 'recommendations'],
    category: 'analysis',
  },
  {
    agentType: AutonomousAgentType.DESIGNER,
    name: 'Designer Agent',
    description: 'Reviews and improves UI/UX layouts, contrast, RTL compliance',
    supportedTasks: ['improve_layout', 'check_contrast', 'simplify', 'rtl_check'],
    category: 'design',
  },
  {
    agentType: AutonomousAgentType.REPORT_WRITER,
    name: 'Report Writer Agent',
    description: 'Generates professional narratives, executive summaries, and formal translations',
    supportedTasks: ['generate_narrative', 'executive_summary', 'translate_formal'],
    category: 'reporting',
  },
  {
    agentType: AutonomousAgentType.PRESENTATION,
    name: 'Presentation Agent',
    description: 'Creates slides, presenter notes, Q&A content, and appendices',
    supportedTasks: ['generate_slides', 'presenter_notes', 'qa_generation', 'generate_appendix'],
    category: 'presentation',
  },
  {
    agentType: AutonomousAgentType.MONITORING,
    name: 'Monitoring Agent',
    description: 'Watches data changes, suggests updates, alerts on anomalies',
    supportedTasks: ['watch_changes', 'suggest_updates', 'alert_anomalies'],
    category: 'monitoring',
  },
  {
    agentType: AutonomousAgentType.DATA_INTELLIGENCE,
    name: 'Data Intelligence Agent',
    description: 'Advanced data profiling, correlation discovery, and metadata enrichment',
    supportedTasks: ['auto_analyze_dataset', 'detect_anomalies', 'suggest_enrichment', 'profile_quality', 'auto_classify'],
    category: 'intelligence',
  },
  {
    agentType: AutonomousAgentType.ANALYTICS,
    name: 'Analytics Agent',
    description: 'Statistical analysis, trend detection, forecasting, and segmentation',
    supportedTasks: ['run_regression', 'cluster_data', 'forecast_trend', 'correlation_analysis', 'segment_analysis'],
    category: 'analysis',
  },
  {
    agentType: AutonomousAgentType.DASHBOARD_BUILDER,
    name: 'Dashboard Builder Agent',
    description: 'Designs and configures interactive dashboards and KPI visualizations',
    supportedTasks: ['auto_create_dashboard', 'suggest_widgets', 'optimize_layout', 'generate_kpi_dashboard'],
    category: 'visualization',
  },
  {
    agentType: AutonomousAgentType.DATA_CLEANING,
    name: 'Data Cleaning Agent',
    description: 'Detects and fixes data quality issues, deduplication, normalization',
    supportedTasks: ['auto_clean', 'fix_types', 'handle_missing', 'remove_duplicates', 'standardize_formats'],
    category: 'data-management',
  },
  {
    agentType: AutonomousAgentType.COMPLIANCE_GOVERNANCE,
    name: 'Compliance & Governance Agent',
    description: 'Enforces data governance policies, audit trails, access controls',
    supportedTasks: ['audit_access', 'check_compliance', 'detect_pii', 'enforce_retention', 'review_permissions'],
    category: 'governance',
  },
  {
    agentType: AutonomousAgentType.AUTOMATION_WORKFLOW,
    name: 'Automation Workflow Agent',
    description: 'Creates and manages automated data pipelines and scheduled tasks',
    supportedTasks: ['create_workflow', 'schedule_task', 'chain_operations', 'setup_trigger', 'optimize_pipeline'],
    category: 'automation',
  },
  {
    agentType: AutonomousAgentType.RESEARCH,
    name: 'Research Agent',
    description: 'Deep research on topics, literature review, competitive analysis',
    supportedTasks: ['analyze_market', 'compare_metrics', 'benchmark_performance', 'generate_insights', 'trend_analysis'],
    category: 'research',
  },
  {
    agentType: AutonomousAgentType.KNOWLEDGE_GRAPH,
    name: 'Knowledge Graph Agent',
    description: 'Builds and queries knowledge graphs, entity resolution, relationship mapping',
    supportedTasks: ['discover_relationships', 'map_dependencies', 'suggest_connections', 'trace_lineage', 'find_similar'],
    category: 'intelligence',
  },
  {
    agentType: AutonomousAgentType.ADMIN_COPILOT,
    name: 'Admin Copilot Agent',
    description: 'Assists administrators with system configuration, user management, and troubleshooting',
    supportedTasks: ['system_health', 'usage_analytics', 'security_alerts', 'optimize_resources', 'natural_language_admin'],
    category: 'administration',
  },
];

export class AutonomousOrchestratorService {
  private readonly baseOrchestrator = new AgentOrchestratorService();

  async orchestrate(request: AutonomousRequest): Promise<AutonomousResult> {
    const startTime = Date.now();
    const qualityThreshold = request.qualityThreshold ?? 0.7;

    const steps = await this.decomposeTask(request.description, request.context);
    const plan = this.generateExecutionPlan(steps, request);

    try {
      await prisma.$queryRawUnsafe(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, details, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, NOW())`,
        request.tenantId,
        request.userId,
        'autonomous_orchestration_started',
        'orchestration',
        plan.requestId,
        JSON.stringify({
          description: request.description,
          stepCount: plan.steps.length,
          requiredAgents: plan.requiredAgents,
          autoExecute: request.autoExecute ?? false,
        }),
      );
    } catch {
      // Audit log failure should not block orchestration
    }

    if (!request.autoExecute) {
      return {
        requestId: plan.requestId,
        plan,
        results: [],
        proactiveInsights: [],
        orchestrationSummary: 'Execution plan created. Set autoExecute=true to run automatically.',
        qualityScore: 0,
        totalDurationMs: Date.now() - startTime,
        retryCount: 0,
        failedAgents: [],
      };
    }

    const { results, retryCount, failedAgents } = await this.executePlan(
      plan,
      request,
      qualityThreshold
    );

    const qualityScore = this.computeOverallQuality(results);

    const proactiveInsights = await this.generateProactiveInsights(
      request.tenantId,
      results
    );

    const orchestrationSummary = await this.generateEnhancedSummary(
      request,
      results,
      failedAgents,
      qualityScore
    );

    const totalDurationMs = Date.now() - startTime;

    await prisma.auditLog.create({
      data: {
        action: 'autonomous_orchestration_complete',
        entityType: 'orchestration',
        entityId: plan.requestId,
        details: JSON.stringify({
          tenantId: request.tenantId,
          userId: request.userId,
          stepCount: plan.steps.length,
          completedSteps: results.length,
          failedAgents,
          retryCount,
          qualityScore,
          totalDurationMs,
        }),
        performedAt: new Date(),
      },
    });

    return {
      requestId: plan.requestId,
      plan,
      results,
      proactiveInsights,
      orchestrationSummary,
      qualityScore,
      totalDurationMs,
      retryCount,
      failedAgents,
    };
  }

  async decomposeTask(
    description: string,
    context?: string
  ): Promise<DecomposedStep[]> {
    const capabilitiesSummary = AGENT_CAPABILITIES.map(
      (c) =>
        `- ${c.agentType}: ${c.description} (tasks: ${c.supportedTasks.join(', ')})`
    ).join('\n');

    const prompt = `You are a task decomposition engine for the Rasid analytics platform.
Break the user's request into concrete steps that can be executed by the available agents.

Available agents:
${capabilitiesSummary}

User request: "${description}"
${context ? `Context: ${context}` : ''}

Respond in JSON:
{
  "steps": [
    {
      "agentType": "analyst",
      "taskType": "find_anomalies",
      "dependsOn": [],
      "priority": 1,
      "params": {},
      "reason": "why this step is needed"
    }
  ]
}

Rules:
- Break the request into the minimum steps necessary
- Set dependsOn to reference previous step indices (0-based) when a step requires output from a prior step
- Priority 1 = highest, 5 = lowest
- Use only the available agent types and their supported tasks
- Maximum 8 steps per decomposition
- If the request is simple, use 1-2 steps`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for task decomposition');
    }

    const parsed: { steps: DecomposedStep[] } = JSON.parse(content);

    return parsed.steps.slice(0, 8).map((step) => ({
      agentType: step.agentType,
      taskType: step.taskType,
      dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : [],
      priority: typeof step.priority === 'number' ? step.priority : 3,
      params: step.params ?? {},
      reason: step.reason ?? '',
    }));
  }

  generateExecutionPlan(
    steps: DecomposedStep[],
    request: AutonomousRequest
  ): ExecutionPlan {
    const requestId = `auto-${randomUUID()}`;

    const executionSteps: ExecutionStep[] = steps.map((step, index) => ({
      stepId: `step-${index}`,
      agentType: step.agentType,
      taskType: step.taskType,
      dependsOn: step.dependsOn.map((dep) => {
        if (typeof dep === 'number') {
          return `step-${dep}`;
        }
        return String(dep);
      }),
      priority: step.priority,
      params: {
        ...step.params,
        ...(request.data ?? {}),
      },
    }));

    const requiredAgents = [...new Set(executionSteps.map((s) => s.agentType))];

    const estimatedDurationMs = executionSteps.length * 3000;

    return {
      requestId,
      steps: executionSteps,
      estimatedDurationMs,
      requiredAgents,
    };
  }

  async executeWithRetry(
    step: ExecutionStep,
    request: AutonomousRequest,
    qualityThreshold: number,
    maxRetries: number = 2
  ): Promise<{ result: AgentResult | null; retries: number }> {
    let retries = 0;

    while (retries <= maxRetries) {
      try {
        const result = await this.executeAgentStep(step, request);

        if (this.validateResult(result, qualityThreshold)) {
          return { result, retries };
        }

        if (retries >= maxRetries) {
          return { result, retries };
        }

        retries++;
        step.params = {
          ...step.params,
          retryAttempt: retries,
          adjustedTemperature: 0.1 * retries,
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        await prisma.auditLog.create({
          data: {
            action: 'agent_execution_error',
            entityType: 'agent',
            entityId: step.stepId,
            details: JSON.stringify({
              agentType: step.agentType,
              taskType: step.taskType,
              error: errorMessage,
              retryAttempt: retries,
            }),
            performedAt: new Date(),
          },
        });

        if (retries >= maxRetries) {
          return { result: null, retries };
        }

        retries++;
      }
    }

    return { result: null, retries };
  }

  validateResult(result: AgentResult, qualityThreshold: number): boolean {
    if (!result.interpretation || result.interpretation.trim().length === 0) {
      return false;
    }

    if (!result.suggestions || result.suggestions.length === 0) {
      return false;
    }

    const avgConfidence =
      result.suggestions.reduce((sum, s) => sum + s.confidence, 0) /
      result.suggestions.length;

    return avgConfidence >= qualityThreshold;
  }

  getAgentCapabilities(): AgentCapability[] {
    return AGENT_CAPABILITIES;
  }

  async runProactiveAnalysis(tenantId: string): Promise<ProactiveInsight[]> {
    const datasets = await prisma.dataset.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        rowCount: true,
        columnCount: true,
        updatedAt: true,
      },
      take: 50,
    });

    const dashboards = await prisma.dashboard.findMany({
      where: { tenantId },
      select: { id: true, name: true, updatedAt: true },
      take: 50,
    });

    const reports = await prisma.report.findMany({
      where: { tenantId },
      select: { id: true, title: true, updatedAt: true },
      take: 50,
    });

    const insights: ProactiveInsight[] = [];

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const ds of datasets) {
      if (ds.updatedAt < thirtyDaysAgo) {
        insights.push({
          type: 'alert',
          severity: 'medium',
          title: `Dataset "${ds.name}" has not been updated in over 30 days`,
          description: `The dataset was last updated on ${ds.updatedAt.toISOString().split('T')[0]}. Stale data may affect accuracy of reports and dashboards.`,
          suggestedAction: `Review and refresh dataset "${ds.name}" or configure automated data ingestion.`,
          relatedEntities: [ds.id],
          confidence: 0.9,
        });
      }

      if (ds.rowCount !== null && ds.rowCount > 100000 && ds.columnCount !== null && ds.columnCount > 20) {
        insights.push({
          type: 'opportunity',
          severity: 'low',
          title: `Large dataset "${ds.name}" may benefit from segmentation`,
          description: `Dataset has ${ds.rowCount} rows and ${ds.columnCount} columns. Consider creating focused views for better performance.`,
          suggestedAction: `Use the Analytics agent to segment dataset "${ds.name}" and create optimized sub-views.`,
          relatedEntities: [ds.id],
          confidence: 0.75,
        });
      }
    }

    if (datasets.length > 0 && dashboards.length === 0) {
      insights.push({
        type: 'recommendation',
        severity: 'medium',
        title: 'No dashboards configured',
        description: `You have ${datasets.length} dataset(s) but no dashboards. Visual dashboards improve data comprehension.`,
        suggestedAction: 'Use the Dashboard Builder agent to auto-generate dashboards from your existing datasets.',
        relatedEntities: datasets.map((d) => d.id),
        confidence: 0.85,
      });
    }

    if (datasets.length > 0 && reports.length === 0) {
      insights.push({
        type: 'recommendation',
        severity: 'medium',
        title: 'No reports generated',
        description: `You have ${datasets.length} dataset(s) but no reports. Automated reports can surface key insights.`,
        suggestedAction: 'Use the Report Writer agent to generate executive summaries from your datasets.',
        relatedEntities: datasets.map((d) => d.id),
        confidence: 0.85,
      });
    }

    const recentlyUpdatedDatasets = datasets.filter(
      (d) => d.updatedAt >= sevenDaysAgo
    );
    if (recentlyUpdatedDatasets.length >= 3) {
      insights.push({
        type: 'opportunity',
        severity: 'low',
        title: 'High data activity detected',
        description: `${recentlyUpdatedDatasets.length} datasets updated in the last 7 days. Consider setting up automated monitoring.`,
        suggestedAction: 'Enable the Monitoring agent to watch for anomalies in frequently updated datasets.',
        relatedEntities: recentlyUpdatedDatasets.map((d) => d.id),
        confidence: 0.8,
      });
    }

    if (insights.length > 0) {
      const prompt = `You are a proactive analytics advisor for the Rasid platform.
Given the following detected conditions, generate additional AI-powered insights.

Current conditions:
${insights.map((i) => `- [${i.type}] ${i.title}: ${i.description}`).join('\n')}

Tenant has: ${datasets.length} datasets, ${dashboards.length} dashboards, ${reports.length} reports.

Generate 1-3 additional high-value insights in JSON:
{
  "insights": [
    {
      "type": "anomaly|opportunity|recommendation|alert",
      "severity": "low|medium|high|critical",
      "title": "...",
      "description": "...",
      "suggestedAction": "...",
      "relatedEntities": [],
      "confidence": 0.8
    }
  ]
}

Rules:
- Only include genuinely useful insights
- Confidence between 0.6 and 1.0
- Write titles and descriptions in Arabic (formal MSA)`;

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          const parsed: { insights: ProactiveInsight[] } = JSON.parse(content);
          for (const aiInsight of parsed.insights) {
            insights.push({
              type: aiInsight.type,
              severity: aiInsight.severity,
              title: aiInsight.title,
              description: aiInsight.description,
              suggestedAction: aiInsight.suggestedAction,
              relatedEntities: aiInsight.relatedEntities ?? [],
              confidence: typeof aiInsight.confidence === 'number'
                ? aiInsight.confidence
                : 0.7,
            });
          }
        }
      } catch (aiError: unknown) {
        const errorMsg =
          aiError instanceof Error ? aiError.message : String(aiError);
        await prisma.auditLog.create({
          data: {
            action: 'proactive_ai_insight_error',
            entityType: 'proactive',
            entityId: tenantId,
            details: JSON.stringify({ error: errorMsg }),
            performedAt: new Date(),
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        action: 'proactive_analysis_complete',
        entityType: 'proactive',
        entityId: tenantId,
        details: JSON.stringify({
          insightsCount: insights.length,
          datasetCount: datasets.length,
          dashboardCount: dashboards.length,
          reportCount: reports.length,
        }),
        performedAt: new Date(),
      },
    });

    return insights;
  }

  private async executePlan(
    plan: ExecutionPlan,
    request: AutonomousRequest,
    qualityThreshold: number
  ): Promise<{
    results: AgentResult[];
    retryCount: number;
    failedAgents: string[];
  }> {
    const results: AgentResult[] = [];
    const completedSteps = new Map<string, AgentResult>();
    const failedAgents: string[] = [];
    let totalRetries = 0;

    const stepsByLevel = this.groupStepsByDependencyLevel(plan.steps);

    for (const levelSteps of stepsByLevel) {
      const stepPromises = levelSteps.map(async (step) => {
        const allDependenciesMet = step.dependsOn.every((dep) =>
          completedSteps.has(dep)
        );

        if (!allDependenciesMet) {
          failedAgents.push(step.agentType);
          return { stepId: step.stepId, result: null, retries: 0 };
        }

        const dependencyResults: Record<string, unknown> = {};
        for (const dep of step.dependsOn) {
          const depResult = completedSteps.get(dep);
          if (depResult) {
            dependencyResults[dep] = {
              interpretation: depResult.interpretation,
              suggestions: depResult.suggestions,
            };
          }
        }

        const enrichedStep: ExecutionStep = {
          ...step,
          params: {
            ...step.params,
            dependencyResults,
          },
        };

        const { result, retries } = await this.executeWithRetry(
          enrichedStep,
          request,
          qualityThreshold
        );

        return { stepId: step.stepId, result, retries };
      });

      const levelResults = await Promise.all(stepPromises);

      for (const { stepId, result, retries } of levelResults) {
        totalRetries += retries;
        if (result) {
          completedSteps.set(stepId, result);
          results.push(result);
        } else {
          const step = plan.steps.find((s) => s.stepId === stepId);
          if (step && !failedAgents.includes(step.agentType)) {
            failedAgents.push(step.agentType);
          }
        }
      }
    }

    return { results, retryCount: totalRetries, failedAgents };
  }

  private groupStepsByDependencyLevel(
    steps: ExecutionStep[]
  ): ExecutionStep[][] {
    const levels: ExecutionStep[][] = [];
    const assigned = new Set<string>();

    let remaining = [...steps];

    while (remaining.length > 0) {
      const currentLevel: ExecutionStep[] = [];

      for (const step of remaining) {
        const allDepsAssigned = step.dependsOn.every((dep) =>
          assigned.has(dep)
        );
        if (allDepsAssigned) {
          currentLevel.push(step);
        }
      }

      if (currentLevel.length === 0) {
        for (const step of remaining) {
          currentLevel.push(step);
        }
        levels.push(currentLevel);
        break;
      }

      for (const step of currentLevel) {
        assigned.add(step.stepId);
      }

      remaining = remaining.filter(
        (s) => !currentLevel.includes(s)
      );

      levels.push(currentLevel);
    }

    return levels;
  }

  private async executeAgentStep(
    step: ExecutionStep,
    request: AutonomousRequest
  ): Promise<AgentResult> {
    const coreAgentTypes = [
      'data-admin',
      'analyst',
      'designer',
      'report-writer',
      'presentation',
      'monitoring',
    ];

    if (coreAgentTypes.includes(step.agentType)) {
      const orchestrationResult = await this.baseOrchestrator.orchestrate({
        description: `Execute ${step.taskType} using ${step.agentType} agent`,
        context: request.context,
        data: {
          ...request.data,
          ...step.params,
        },
      });

      if (orchestrationResult.results.length > 0) {
        return orchestrationResult.results[0];
      }

      throw new Error(
        `No result from base orchestrator for ${step.agentType}/${step.taskType}`
      );
    }

    return this.executeExtendedAgent(step, request);
  }

  private readonly dataIntelligenceAgent = new DataIntelligenceAgent();
  private readonly analyticsAgent = new AnalyticsAgent();
  private readonly dashboardBuilderAgent = new DashboardBuilderAgent();
  private readonly dataCleaningAgent = new DataCleaningAgent();
  private readonly complianceAgent = new ComplianceGovernanceAgent();
  private readonly automationAgent = new AutomationWorkflowAgent();
  private readonly researchAgent = new ResearchAgent();
  private readonly knowledgeGraphAgent = new KnowledgeGraphAgent();
  private readonly adminCopilotAgent = new AdminCopilotAgent();

  private async executeExtendedAgent(
    step: ExecutionStep,
    request: AutonomousRequest
  ): Promise<AgentResult> {
    const capability = AGENT_CAPABILITIES.find(
      (c) => c.agentType === step.agentType
    );

    if (!capability) {
      throw new Error(`Unknown agent type: ${step.agentType}`);
    }

    const params = step.params as Record<string, unknown>;
    const data = (params.data ?? request.data ?? {}) as Record<string, unknown>;
    const dataArray = Array.isArray(data) ? data : (data.rows as Array<Record<string, number | string | null>>) ?? [];
    const columns = (params.columns ?? data.columns ?? []) as string[];
    const datasetId = (params.datasetId ?? data.datasetId ?? request.tenantId) as string;

    let result: AgentResult;

    switch (step.agentType) {
      case AutonomousAgentType.DATA_INTELLIGENCE:
        result = await this.dataIntelligenceAgent.execute({
          type: this.mapTaskType(step.taskType, ['auto_analyze_dataset', 'detect_anomalies', 'suggest_enrichment', 'profile_quality', 'auto_classify']) as 'auto_analyze_dataset',
          datasetId,
          data: dataArray as Array<Record<string, number | string | null>>,
          columns,
          context: request.context,
        });
        break;

      case AutonomousAgentType.ANALYTICS:
        result = await this.analyticsAgent.execute({
          type: this.mapTaskType(step.taskType, ['run_regression', 'cluster_data', 'forecast_trend', 'correlation_analysis', 'segment_analysis']) as 'run_regression',
          datasetId,
          data: dataArray as Array<Record<string, number | string | null>>,
          targetColumn: (params.targetColumn as string) || columns[0],
          featureColumns: (params.featureColumns as string[]) || columns.slice(1),
          context: request.context,
        });
        break;

      case AutonomousAgentType.DASHBOARD_BUILDER:
        result = await this.dashboardBuilderAgent.execute({
          type: this.mapTaskType(step.taskType, ['auto_create_dashboard', 'suggest_widgets', 'optimize_layout', 'generate_kpi_dashboard']) as 'auto_create_dashboard',
          datasetId,
          data: dataArray as Array<Record<string, number | string | null>>,
          columns,
          context: request.context,
        });
        break;

      case AutonomousAgentType.DATA_CLEANING:
        result = await this.dataCleaningAgent.execute({
          type: this.mapTaskType(step.taskType, ['auto_clean', 'fix_types', 'handle_missing', 'remove_duplicates', 'standardize_formats']) as 'auto_clean',
          datasetId,
          data: dataArray as Array<Record<string, number | string | null>>,
          columns,
          context: request.context,
        });
        break;

      case AutonomousAgentType.COMPLIANCE_GOVERNANCE:
        result = await this.complianceAgent.execute({
          type: this.mapTaskType(step.taskType, ['audit_access', 'check_compliance', 'detect_pii', 'enforce_retention', 'review_permissions']) as 'audit_access',
          datasetId,
          data: dataArray as Array<Record<string, number | string | null>>,
          columns,
          context: request.context,
        });
        break;

      case AutonomousAgentType.AUTOMATION_WORKFLOW:
        result = await this.automationAgent.execute({
          type: this.mapTaskType(step.taskType, ['create_workflow', 'schedule_task', 'chain_operations', 'setup_trigger', 'optimize_pipeline']) as 'create_workflow',
          datasetId,
          workflowName: (params.workflowName as string) || request.description,
          context: request.context,
        });
        break;

      case AutonomousAgentType.RESEARCH:
        result = await this.researchAgent.execute({
          type: this.mapTaskType(step.taskType, ['analyze_market', 'compare_metrics', 'benchmark_performance', 'generate_insights', 'trend_analysis']) as 'analyze_market',
          datasetId,
          data: dataArray as Array<Record<string, number | string | null>>,
          targetMetrics: columns.length > 0 ? columns : undefined,
          context: request.context,
        });
        break;

      case AutonomousAgentType.KNOWLEDGE_GRAPH:
        result = await this.knowledgeGraphAgent.execute({
          type: this.mapTaskType(step.taskType, ['discover_relationships', 'map_dependencies', 'suggest_connections', 'trace_lineage', 'find_similar']) as 'discover_relationships',
          tenantId: request.tenantId,
          entityId: params.entityId as string,
          entityType: params.entityType as string,
          datasets: params.datasets as Array<{ id: string; name: string; columns: string[] }>,
          context: request.context,
        });
        break;

      case AutonomousAgentType.ADMIN_COPILOT:
        result = await this.adminCopilotAgent.execute({
          type: this.mapTaskType(step.taskType, ['system_health', 'usage_analytics', 'security_alerts', 'optimize_resources', 'natural_language_admin']) as 'system_health',
          tenantId: request.tenantId,
          query: request.description,
          context: request.context,
        });
        break;

      default:
        result = await this.executeGenericAgent(step, request, capability);
    }

    await prisma.auditLog.create({
      data: {
        action: 'extended_agent_execution',
        entityType: 'agent',
        entityId: step.agentType,
        details: JSON.stringify({
          taskType: step.taskType,
          tenantId: request.tenantId,
          userId: request.userId,
          suggestionsCount: result.suggestions.length,
          requiresApproval: result.requiresApproval,
        }),
        performedAt: new Date(),
      },
    });

    return result;
  }

  private mapTaskType(requestedTask: string, validTasks: string[]): string {
    if (validTasks.includes(requestedTask)) return requestedTask;
    const normalized = requestedTask.toLowerCase().replace(/[_\s-]/g, '');
    for (const task of validTasks) {
      if (task.toLowerCase().replace(/[_\s-]/g, '') === normalized) return task;
    }
    return validTasks[0];
  }

  private async executeGenericAgent(
    step: ExecutionStep,
    request: AutonomousRequest,
    capability: AgentCapability
  ): Promise<AgentResult> {
    const prompt = `You are the "${capability.name}" for the Rasid analytics platform.
Your role: ${capability.description}

Task: ${step.taskType}
User request: "${request.description}"
${request.context ? `Context: ${request.context}` : ''}
Parameters: ${JSON.stringify(step.params)}

Analyze the request and provide actionable results.

Respond in JSON:
{
  "interpretation": "Your analysis of what was found/done",
  "suggestions": [
    {
      "action": "specific_action_id",
      "description": "What should be done",
      "confidence": 0.85
    }
  ],
  "requiresApproval": false
}

Rules:
- Provide concrete, actionable suggestions
- Confidence between 0.0 and 1.0
- Set requiresApproval=true for destructive or irreversible actions
- Maximum 10 suggestions
- Write interpretation in Arabic (formal MSA)`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(
        `Empty response from OpenAI for ${step.agentType}/${step.taskType}`
      );
    }

    const parsed: {
      interpretation: string;
      suggestions: Array<{
        action: string;
        description: string;
        confidence: number;
      }>;
      requiresApproval: boolean;
    } = JSON.parse(content);

    return {
      agentType: step.agentType,
      taskType: step.taskType,
      interpretation: parsed.interpretation,
      suggestions: parsed.suggestions.slice(0, 10).map((s) => ({
        action: s.action,
        description: s.description,
        confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
      })),
      requiresApproval: parsed.requiresApproval ?? false,
      executedAt: new Date(),
    };
  }

  private computeOverallQuality(results: AgentResult[]): number {
    if (results.length === 0) {
      return 0;
    }

    let totalScore = 0;

    for (const result of results) {
      let stepScore = 0;

      if (result.interpretation && result.interpretation.trim().length > 0) {
        stepScore += 0.4;
      }

      if (result.suggestions.length > 0) {
        const avgConfidence =
          result.suggestions.reduce((sum, s) => sum + s.confidence, 0) /
          result.suggestions.length;
        stepScore += 0.6 * avgConfidence;
      }

      totalScore += stepScore;
    }

    return totalScore / results.length;
  }

  private async generateProactiveInsights(
    tenantId: string,
    results: AgentResult[]
  ): Promise<ProactiveInsight[]> {
    if (results.length === 0) {
      return [];
    }

    const prompt = `You are a proactive analytics engine for the Rasid platform.
Based on the following agent execution results, identify any proactive insights.

Results:
${results.map((r) => `Agent: ${r.agentType} (${r.taskType})\nInterpretation: ${r.interpretation}\nSuggestions: ${r.suggestions.map((s) => s.description).join('; ')}`).join('\n\n')}

Generate proactive insights in JSON:
{
  "insights": [
    {
      "type": "anomaly|opportunity|recommendation|alert",
      "severity": "low|medium|high|critical",
      "title": "...",
      "description": "...",
      "suggestedAction": "...",
      "relatedEntities": [],
      "confidence": 0.8
    }
  ]
}

Rules:
- Only include insights that go beyond what the agents already found
- Focus on cross-agent patterns and opportunities
- Maximum 5 insights
- Write in Arabic (formal MSA)
- If no additional insights, return empty array`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      const parsed: { insights: ProactiveInsight[] } = JSON.parse(content);
      return parsed.insights.slice(0, 5).map((insight) => ({
        type: insight.type,
        severity: insight.severity,
        title: insight.title,
        description: insight.description,
        suggestedAction: insight.suggestedAction,
        relatedEntities: insight.relatedEntities ?? [],
        confidence: typeof insight.confidence === 'number'
          ? insight.confidence
          : 0.7,
      }));
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      await prisma.auditLog.create({
        data: {
          action: 'proactive_insight_generation_error',
          entityType: 'proactive',
          entityId: tenantId,
          details: JSON.stringify({ error: errorMsg }),
          performedAt: new Date(),
        },
      });
      return [];
    }
  }

  private async generateEnhancedSummary(
    request: AutonomousRequest,
    results: AgentResult[],
    failedAgents: string[],
    qualityScore: number
  ): Promise<string> {
    const prompt = `You are an executive summarizer for the Rasid analytics platform.
Summarize the autonomous orchestration results.

Original request: "${request.description}"

Agent results (${results.length} completed):
${results.map((r) => `- ${r.agentType} (${r.taskType}): ${r.interpretation}`).join('\n')}

${failedAgents.length > 0 ? `Failed agents: ${failedAgents.join(', ')}` : 'All agents completed successfully.'}

Quality score: ${(qualityScore * 100).toFixed(1)}%

Write a 3-4 sentence summary in Arabic (formal MSA) covering:
- What was analyzed and executed
- Key findings across all agents
- Any failures or quality concerns
- Recommended next steps

Respond in JSON:
{ "summary": "the summary text" }`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return 'Failed to generate orchestration summary.';
      }

      const parsed: { summary: string } = JSON.parse(content);
      return parsed.summary;
    } catch {
      return 'Failed to generate orchestration summary.';
    }
  }
}
