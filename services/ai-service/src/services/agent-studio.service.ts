import OpenAI from 'openai';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  AutonomousOrchestratorService,
  AutonomousAgentType,
} from './agents/autonomous-orchestrator.service.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });
const prisma = new PrismaClient();

const CreateAgentConfigSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  agentType: z.nativeEnum(AutonomousAgentType),
  tools: z.array(z.string().min(1)).min(1),
  permissions: z.array(z.string().min(1)),
  knowledgeSources: z.array(z.string().min(1)),
  systemPrompt: z.string().min(1).max(10000),
  createdBy: z.string().min(1),
});

const UpdateAgentConfigSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  agentType: z.nativeEnum(AutonomousAgentType).optional(),
  tools: z.array(z.string().min(1)).min(1).optional(),
  permissions: z.array(z.string().min(1)).optional(),
  knowledgeSources: z.array(z.string().min(1)).optional(),
  systemPrompt: z.string().min(1).max(10000).optional(),
});

type CreateAgentConfigInput = z.infer<typeof CreateAgentConfigSchema>;
type UpdateAgentConfigInput = z.infer<typeof UpdateAgentConfigSchema>;

interface AgentConfigRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  agentType: string;
  tools: string[];
  permissions: string[];
  knowledgeSources: string[];
  systemPrompt: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TestResult {
  agentConfigId: string;
  agentName: string;
  testInput: string;
  output: {
    interpretation: string;
    suggestions: Array<{
      action: string;
      description: string;
      confidence: number;
    }>;
  };
  executionTimeMs: number;
  success: boolean;
  error?: string;
}

interface AvailableTool {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface KnowledgeSource {
  id: string;
  name: string;
  type: 'dataset' | 'document' | 'knowledge_base';
  recordCount: number;
  updatedAt: Date;
}

interface ExecutionHistoryEntry {
  id: string;
  agentConfigId: string;
  input: string;
  output: Record<string, unknown>;
  success: boolean;
  durationMs: number;
  executedAt: Date;
  executedBy: string;
}

const AVAILABLE_TOOLS: AvailableTool[] = [
  { id: 'data_read', name: 'Data Read', description: 'Read data from datasets and files', category: 'data' },
  { id: 'data_write', name: 'Data Write', description: 'Write and update dataset records', category: 'data' },
  { id: 'data_transform', name: 'Data Transform', description: 'Apply transformations to data columns', category: 'data' },
  { id: 'data_filter', name: 'Data Filter', description: 'Filter and query datasets', category: 'data' },
  { id: 'data_aggregate', name: 'Data Aggregate', description: 'Perform aggregations (sum, avg, count, etc.)', category: 'data' },
  { id: 'excel_read', name: 'Excel Read', description: 'Read and parse Excel files', category: 'excel' },
  { id: 'excel_write', name: 'Excel Write', description: 'Generate and write Excel files', category: 'excel' },
  { id: 'excel_formula', name: 'Excel Formula', description: 'Apply and evaluate Excel formulas', category: 'excel' },
  { id: 'chart_create', name: 'Chart Create', description: 'Create charts and visualizations', category: 'visualization' },
  { id: 'dashboard_create', name: 'Dashboard Create', description: 'Create and configure dashboards', category: 'visualization' },
  { id: 'report_generate', name: 'Report Generate', description: 'Generate professional reports', category: 'reporting' },
  { id: 'report_template', name: 'Report Template', description: 'Use and manage report templates', category: 'reporting' },
  { id: 'presentation_create', name: 'Presentation Create', description: 'Create presentation slides', category: 'presentation' },
  { id: 'nlp_analyze', name: 'NLP Analyze', description: 'Analyze text with NLP (entities, sentiment, etc.)', category: 'ai' },
  { id: 'ai_generate', name: 'AI Generate', description: 'Generate text using GPT-4o', category: 'ai' },
  { id: 'ai_summarize', name: 'AI Summarize', description: 'Summarize long texts', category: 'ai' },
  { id: 'rag_query', name: 'RAG Query', description: 'Query knowledge bases using RAG', category: 'ai' },
  { id: 'notification_send', name: 'Notification Send', description: 'Send notifications to users', category: 'communication' },
  { id: 'email_send', name: 'Email Send', description: 'Send email notifications', category: 'communication' },
  { id: 'audit_log', name: 'Audit Log', description: 'Write to audit trail', category: 'governance' },
  { id: 'permission_check', name: 'Permission Check', description: 'Check user permissions', category: 'governance' },
  { id: 'file_convert', name: 'File Convert', description: 'Convert between file formats', category: 'conversion' },
  { id: 'localization_translate', name: 'Localization Translate', description: 'Translate and localize content', category: 'localization' },
  { id: 'web_search', name: 'Web Search', description: 'Search the web for information', category: 'research' },
  { id: 'scheduler_create', name: 'Scheduler Create', description: 'Create scheduled tasks', category: 'automation' },
];

export class AgentStudioService {
  private readonly orchestrator = new AutonomousOrchestratorService();

  async createAgentConfig(
    input: CreateAgentConfigInput
  ): Promise<AgentConfigRecord> {
    const validated = CreateAgentConfigSchema.parse(input);

    const id = randomUUID();

    const record = await prisma.agentConfig.create({
      data: {
        id,
        tenantId: validated.tenantId,
        name: validated.name,
        description: validated.description,
        agentType: validated.agentType,
        tools: JSON.stringify(validated.tools),
        permissions: JSON.stringify(validated.permissions),
        knowledgeSources: JSON.stringify(validated.knowledgeSources),
        systemPrompt: validated.systemPrompt,
        isActive: false,
        createdBy: validated.createdBy,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'agent_config_created',
        entityType: 'agentConfig',
        entityId: id,
        details: JSON.stringify({
          tenantId: validated.tenantId,
          name: validated.name,
          agentType: validated.agentType,
          toolCount: validated.tools.length,
          createdBy: validated.createdBy,
        }),
        performedAt: new Date(),
      },
    });

    return this.mapToAgentConfig(record);
  }

  async updateAgentConfig(
    id: string,
    input: UpdateAgentConfigInput
  ): Promise<AgentConfigRecord> {
    const validated = UpdateAgentConfigSchema.parse(input);

    const existing = await prisma.agentConfig.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Agent config not found: ${id}`);
    }

    const updateData: Prisma.AgentConfigUpdateInput = {};

    if (validated.name !== undefined) {
      updateData.name = validated.name;
    }
    if (validated.description !== undefined) {
      updateData.description = validated.description;
    }
    if (validated.agentType !== undefined) {
      updateData.agentType = validated.agentType;
    }
    if (validated.tools !== undefined) {
      updateData.tools = JSON.stringify(validated.tools);
    }
    if (validated.permissions !== undefined) {
      updateData.permissions = JSON.stringify(validated.permissions);
    }
    if (validated.knowledgeSources !== undefined) {
      updateData.knowledgeSources = JSON.stringify(validated.knowledgeSources);
    }
    if (validated.systemPrompt !== undefined) {
      updateData.systemPrompt = validated.systemPrompt;
    }

    const record = await prisma.agentConfig.update({
      where: { id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        action: 'agent_config_updated',
        entityType: 'agentConfig',
        entityId: id,
        details: JSON.stringify({
          updatedFields: Object.keys(validated).filter(
            (k) => validated[k as keyof UpdateAgentConfigInput] !== undefined
          ),
        }),
        performedAt: new Date(),
      },
    });

    return this.mapToAgentConfig(record);
  }

  async deleteAgentConfig(id: string): Promise<{ deleted: boolean }> {
    const existing = await prisma.agentConfig.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Agent config not found: ${id}`);
    }

    await prisma.agentConfig.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: 'agent_config_deleted',
        entityType: 'agentConfig',
        entityId: id,
        details: JSON.stringify({
          name: existing.name,
          tenantId: existing.tenantId,
        }),
        performedAt: new Date(),
      },
    });

    return { deleted: true };
  }

  async listAgentConfigs(tenantId: string): Promise<AgentConfigRecord[]> {
    const records = await prisma.agentConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.mapToAgentConfig(r));
  }

  async getAgentConfig(id: string): Promise<AgentConfigRecord> {
    const record = await prisma.agentConfig.findUnique({ where: { id } });
    if (!record) {
      throw new Error(`Agent config not found: ${id}`);
    }

    return this.mapToAgentConfig(record);
  }

  async testAgent(id: string, testInput: string): Promise<TestResult> {
    const config = await this.getAgentConfig(id);
    const startTime = Date.now();

    try {
      const prompt = `${config.systemPrompt}

You have access to these tools: ${config.tools.join(', ')}
Knowledge sources: ${config.knowledgeSources.join(', ')}

User input: "${testInput}"

Analyze and respond in JSON:
{
  "interpretation": "Your analysis",
  "suggestions": [
    { "action": "action_id", "description": "What to do", "confidence": 0.85 }
  ]
}

Rules:
- Maximum 5 suggestions
- Be specific and actionable
- Confidence between 0.0 and 1.0`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI during agent test');
      }

      const parsed: {
        interpretation: string;
        suggestions: Array<{
          action: string;
          description: string;
          confidence: number;
        }>;
      } = JSON.parse(content);

      const executionTimeMs = Date.now() - startTime;

      await prisma.auditLog.create({
        data: {
          action: 'agent_config_tested',
          entityType: 'agentConfig',
          entityId: id,
          details: JSON.stringify({
            testInput,
            success: true,
            executionTimeMs,
            suggestionsCount: parsed.suggestions.length,
          }),
          performedAt: new Date(),
        },
      });

      return {
        agentConfigId: id,
        agentName: config.name,
        testInput,
        output: {
          interpretation: parsed.interpretation,
          suggestions: parsed.suggestions.slice(0, 5),
        },
        executionTimeMs,
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const executionTimeMs = Date.now() - startTime;

      await prisma.auditLog.create({
        data: {
          action: 'agent_config_test_failed',
          entityType: 'agentConfig',
          entityId: id,
          details: JSON.stringify({
            testInput,
            error: errorMessage,
            executionTimeMs,
          }),
          performedAt: new Date(),
        },
      });

      return {
        agentConfigId: id,
        agentName: config.name,
        testInput,
        output: { interpretation: '', suggestions: [] },
        executionTimeMs,
        success: false,
        error: errorMessage,
      };
    }
  }

  getAvailableTools(): AvailableTool[] {
    return AVAILABLE_TOOLS;
  }

  async getAvailableKnowledgeSources(
    tenantId: string
  ): Promise<KnowledgeSource[]> {
    const sources: KnowledgeSource[] = [];

    const datasets = await prisma.dataset.findMany({
      where: { tenantId },
      select: { id: true, name: true, rowCount: true, updatedAt: true },
    });

    for (const ds of datasets) {
      sources.push({
        id: ds.id,
        name: ds.name,
        type: 'dataset',
        recordCount: ds.rowCount ?? 0,
        updatedAt: ds.updatedAt,
      });
    }

    const documents = await prisma.document.findMany({
      where: { tenantId },
      select: { id: true, name: true, updatedAt: true },
    });

    for (const doc of documents) {
      sources.push({
        id: doc.id,
        name: doc.name,
        type: 'document',
        recordCount: 1,
        updatedAt: doc.updatedAt,
      });
    }

    const knowledgeBases = await prisma.knowledgeBase.findMany({
      where: { tenantId },
      select: { id: true, name: true, documentCount: true, updatedAt: true },
    });

    for (const kb of knowledgeBases) {
      sources.push({
        id: kb.id,
        name: kb.name,
        type: 'knowledge_base',
        recordCount: kb.documentCount ?? 0,
        updatedAt: kb.updatedAt,
      });
    }

    return sources;
  }

  async deployAgent(id: string): Promise<AgentConfigRecord> {
    const existing = await prisma.agentConfig.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Agent config not found: ${id}`);
    }

    const tools = this.parseJsonArray(existing.tools);
    if (tools.length === 0) {
      throw new Error('Cannot deploy agent with no tools configured');
    }

    const systemPrompt =
      typeof existing.systemPrompt === 'string' ? existing.systemPrompt : '';
    if (systemPrompt.trim().length === 0) {
      throw new Error('Cannot deploy agent with empty system prompt');
    }

    const record = await prisma.agentConfig.update({
      where: { id },
      data: { isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        action: 'agent_config_deployed',
        entityType: 'agentConfig',
        entityId: id,
        details: JSON.stringify({
          name: existing.name,
          tenantId: existing.tenantId,
          agentType: existing.agentType,
        }),
        performedAt: new Date(),
      },
    });

    return this.mapToAgentConfig(record);
  }

  async getAgentExecutionHistory(
    id: string
  ): Promise<ExecutionHistoryEntry[]> {
    const existing = await prisma.agentConfig.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Agent config not found: ${id}`);
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: 'agentConfig',
        entityId: id,
        action: {
          in: [
            'agent_config_tested',
            'agent_config_test_failed',
            'agent_config_executed',
          ],
        },
      },
      orderBy: { performedAt: 'desc' },
      take: 100,
    });

    return logs.map((log) => {
      const details = typeof log.details === 'string'
        ? JSON.parse(log.details) as Record<string, unknown>
        : (log.details as Record<string, unknown>) ?? {};

      return {
        id: log.id,
        agentConfigId: id,
        input: typeof details['testInput'] === 'string'
          ? details['testInput']
          : '',
        output: details as Record<string, unknown>,
        success: log.action !== 'agent_config_test_failed',
        durationMs: typeof details['executionTimeMs'] === 'number'
          ? details['executionTimeMs']
          : 0,
        executedAt: log.performedAt,
        executedBy: typeof details['userId'] === 'string'
          ? details['userId']
          : 'system',
      };
    });
  }

  private mapToAgentConfig(
    record: Record<string, unknown>
  ): AgentConfigRecord {
    return {
      id: record['id'] as string,
      tenantId: record['tenantId'] as string,
      name: record['name'] as string,
      description: (record['description'] as string) ?? '',
      agentType: record['agentType'] as string,
      tools: this.parseJsonArray(record['tools']),
      permissions: this.parseJsonArray(record['permissions']),
      knowledgeSources: this.parseJsonArray(record['knowledgeSources']),
      systemPrompt: (record['systemPrompt'] as string) ?? '',
      isActive: (record['isActive'] as boolean) ?? false,
      createdBy: (record['createdBy'] as string) ?? '',
      createdAt: record['createdAt'] as Date,
      updatedAt: record['updatedAt'] as Date,
    };
  }

  private parseJsonArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string => typeof item === 'string'
      );
    }
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item): item is string => typeof item === 'string'
          );
        }
      } catch {
        return [];
      }
    }
    return [];
  }
}
