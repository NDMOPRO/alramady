import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { DataAdminAgent, DataAdminTask } from './data-admin.agent';
import { AnalystAgent, AnalystTask } from './analyst.agent';
import { DesignerAgent, DesignerTask } from './designer.agent';
import { ReportWriterAgent, ReportWriterTask } from './report-writer.agent';
import { PresentationAgent, PresentationTask } from './presentation.agent';
import { MonitoringAgent, MonitoringTask } from './monitoring.agent';

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

export enum AgentType {
  DATA_ADMIN = 'data-admin',
  ANALYST = 'analyst',
  DESIGNER = 'designer',
  REPORT_WRITER = 'report-writer',
  PRESENTATION = 'presentation',
  MONITORING = 'monitoring',
}

type AgentTask =
  | { agentType: AgentType.DATA_ADMIN; task: DataAdminTask }
  | { agentType: AgentType.ANALYST; task: AnalystTask }
  | { agentType: AgentType.DESIGNER; task: DesignerTask }
  | { agentType: AgentType.REPORT_WRITER; task: ReportWriterTask }
  | { agentType: AgentType.PRESENTATION; task: PresentationTask }
  | { agentType: AgentType.MONITORING; task: MonitoringTask };

interface OrchestratorRequest {
  description: string;
  context?: string;
  data?: Record<string, unknown>;
}

interface OrchestrationResult {
  requestId: string;
  results: AgentResult[];
  orchestrationSummary: string;
  totalDurationMs: number;
}

export class AgentOrchestratorService {
  private readonly dataAdminAgent = new DataAdminAgent();
  private readonly analystAgent = new AnalystAgent();
  private readonly designerAgent = new DesignerAgent();
  private readonly reportWriterAgent = new ReportWriterAgent();
  private readonly presentationAgent = new PresentationAgent();
  private readonly monitoringAgent = new MonitoringAgent();

  async runAgent(agentTask: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();

    let result: AgentResult;

    switch (agentTask.agentType) {
      case AgentType.DATA_ADMIN:
        result = await this.dataAdminAgent.execute(agentTask.task);
        break;
      case AgentType.ANALYST:
        result = await this.analystAgent.execute(agentTask.task);
        break;
      case AgentType.DESIGNER:
        result = await this.designerAgent.execute(agentTask.task);
        break;
      case AgentType.REPORT_WRITER:
        result = await this.reportWriterAgent.execute(agentTask.task);
        break;
      case AgentType.PRESENTATION:
        result = await this.presentationAgent.execute(agentTask.task);
        break;
      case AgentType.MONITORING:
        result = await this.monitoringAgent.execute(agentTask.task);
        break;
      default: {
        const exhaustive: never = agentTask;
        throw new Error(`Unknown agent type: ${(exhaustive as AgentTask).agentType}`);
      }
    }

    const durationMs = Date.now() - startTime;

    await prisma.auditLog.create({
      data: {
        action: 'agent_execution',
        entityType: 'agent',
        entityId: agentTask.agentType,
        details: JSON.stringify({
          taskType: result.taskType,
          suggestionsCount: result.suggestions.length,
          requiresApproval: result.requiresApproval,
          durationMs,
        }),
        performedAt: new Date(),
      },
    });

    return result;
  }

  async orchestrate(request: OrchestratorRequest): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    const routingDecision = await this.determineAgents(request);

    const results: AgentResult[] = [];
    for (const agentTask of routingDecision.tasks) {
      const result = await this.runAgent(agentTask);
      results.push(result);
    }

    const totalDurationMs = Date.now() - startTime;

    const orchestrationSummary = await this.generateSummary(request, results);

    await prisma.auditLog.create({
      data: {
        action: 'orchestration_complete',
        entityType: 'orchestration',
        entityId: requestId,
        details: JSON.stringify({
          agentsInvolved: routingDecision.tasks.map((t) => t.agentType),
          totalResults: results.length,
          totalSuggestions: results.reduce((sum, r) => sum + r.suggestions.length, 0),
          requiresApproval: results.some((r) => r.requiresApproval),
          totalDurationMs,
        }),
        performedAt: new Date(),
      },
    });

    return {
      requestId,
      results,
      orchestrationSummary,
      totalDurationMs,
    };
  }

  private async determineAgents(
    request: OrchestratorRequest
  ): Promise<{ tasks: AgentTask[] }> {
    const prompt = `You are an AI orchestration router for the Rasid analytics platform.
Given the user's request, determine which agents should be invoked and in what order.

Available agents:
- data-admin: Data schema management (unify_columns, adjust_types, kpi_policy)
- analyst: Data analysis (detect_gaps, find_anomalies, root_cause, recommendations)
- designer: UI/UX review (improve_layout, check_contrast, simplify, rtl_check)
- report-writer: Report generation (generate_narrative, executive_summary, translate_formal)
- presentation: Presentation creation (generate_slides, presenter_notes, qa_generation, generate_appendix)
- monitoring: Data monitoring (watch_changes, suggest_updates, alert_anomalies)

User request: "${request.description}"
${request.context ? `Context: ${request.context}` : ''}

Respond in JSON:
{
  "agents": [
    { "agentType": "analyst", "taskType": "find_anomalies", "reason": "why this agent is needed" }
  ]
}

Rules:
- Only include agents that are clearly relevant
- Order agents logically (e.g., analysis before reporting)
- Maximum 4 agents per orchestration`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for routing decision');
    }

    const parsed: {
      agents: Array<{ agentType: string; taskType: string; reason: string }>;
    } = JSON.parse(content);

    const tasks: AgentTask[] = parsed.agents
      .slice(0, 4)
      .map((agent) => this.buildAgentTask(agent.agentType, agent.taskType, request))
      .filter((t): t is AgentTask => t !== null);

    return { tasks };
  }

  private buildAgentTask(
    agentType: string,
    taskType: string,
    request: OrchestratorRequest
  ): AgentTask | null {
    const datasetId = (request.data?.['datasetId'] as string) ?? 'unknown';
    const resourceId = (request.data?.['resourceId'] as string) ?? 'unknown';
    const reportId = (request.data?.['reportId'] as string) ?? 'unknown';
    const presentationId = (request.data?.['presentationId'] as string) ?? 'unknown';

    switch (agentType) {
      case 'data-admin':
        return {
          agentType: AgentType.DATA_ADMIN,
          task: {
            type: taskType as DataAdminTask['type'],
            datasetId,
            context: request.description,
          },
        };
      case 'analyst':
        return {
          agentType: AgentType.ANALYST,
          task: {
            type: taskType as AnalystTask['type'],
            datasetId,
            data: (request.data?.['rows'] as Array<Record<string, number | string | null>>) ?? [],
            targetColumn: request.data?.['targetColumn'] as string | undefined,
            context: request.description,
          },
        };
      case 'designer':
        return {
          agentType: AgentType.DESIGNER,
          task: {
            type: taskType as DesignerTask['type'],
            resourceId,
            imageBase64: request.data?.['imageBase64'] as string | undefined,
            imageUrl: request.data?.['imageUrl'] as string | undefined,
            context: request.description,
          },
        };
      case 'report-writer':
        return {
          agentType: AgentType.REPORT_WRITER,
          task: {
            type: taskType as ReportWriterTask['type'],
            reportId,
            sourceText: request.data?.['sourceText'] as string | undefined,
            dataSummary: request.data?.['dataSummary'] as Record<string, unknown> | undefined,
            context: request.description,
          },
        };
      case 'presentation':
        return {
          agentType: AgentType.PRESENTATION,
          task: {
            type: taskType as PresentationTask['type'],
            presentationId,
            topic: request.data?.['topic'] as string | undefined,
            dataSummary: request.data?.['dataSummary'] as Record<string, unknown> | undefined,
            context: request.description,
          },
        };
      case 'monitoring':
        return {
          agentType: AgentType.MONITORING,
          task: {
            type: taskType as MonitoringTask['type'],
            datasetId,
            baselineSnapshot: request.data?.['baselineSnapshot'] as MonitoringTask['baselineSnapshot'],
            currentSnapshot: request.data?.['currentSnapshot'] as MonitoringTask['currentSnapshot'],
            context: request.description,
          },
        };
      default:
        return null;
    }
  }

  private async generateSummary(
    request: OrchestratorRequest,
    results: AgentResult[]
  ): Promise<string> {
    const prompt = `You are a concise executive summarizer for the Rasid analytics platform.
Summarize the combined results from multiple AI agents into a single coherent summary.

Original request: "${request.description}"

Agent results:
${results.map((r) => `Agent: ${r.agentType} (${r.taskType})\nInterpretation: ${r.interpretation}\nSuggestions: ${r.suggestions.length}\nRequires approval: ${r.requiresApproval}`).join('\n\n')}

Write a 2-3 sentence summary in Arabic (formal MSA) covering:
- What was analyzed
- Key findings
- Whether any actions require approval

Respond in JSON:
{ "summary": "the summary text" }`;

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
  }

  private generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = new Uint8Array(8);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(randomPart);
    } else {
      for (let i = 0; i < randomPart.length; i++) {
        randomPart[i] = (Date.now() * (i + 1)) & 0xff;
      }
    }
    const hex = Array.from(randomPart)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `orch-${timestamp}-${hex}`;
  }
}
