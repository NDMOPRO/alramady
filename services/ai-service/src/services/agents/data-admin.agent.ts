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

export interface DataAdminTask {
  type: 'unify_columns' | 'adjust_types' | 'kpi_policy';
  datasetId: string;
  columns?: Array<{ name: string; currentType: string; sampleValues: string[] }>;
  targetSchema?: Record<string, string>;
  kpiDefinitions?: Array<{ name: string; formula: string; threshold: number }>;
  context?: string;
}

export class DataAdminAgent {
  private readonly agentType = 'data-admin';

  async execute(task: DataAdminTask): Promise<AgentResult> {
    switch (task.type) {
      case 'unify_columns':
        return this.unifyColumns(task);
      case 'adjust_types':
        return this.adjustTypes(task);
      case 'kpi_policy':
        return this.kpiPolicy(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private async unifyColumns(task: DataAdminTask): Promise<AgentResult> {
    const columns = task.columns ?? [];
    const prompt = `You are a data administration expert for a Saudi-market platform (Arabic-first).
Analyze the following columns from dataset "${task.datasetId}" and suggest unified naming conventions.

Columns:
${columns.map((c) => `- Name: "${c.name}", Type: ${c.currentType}, Samples: ${c.sampleValues.join(', ')}`).join('\n')}

${task.targetSchema ? `Target schema: ${JSON.stringify(task.targetSchema)}` : ''}

Respond in JSON with this exact structure:
{
  "suggestions": [
    { "action": "rename_column", "description": "description of the change", "confidence": 0.95 }
  ],
  "interpretation": "overall summary of recommended unification"
}

Rules:
- Preserve Arabic column names where appropriate
- Suggest standardized naming (snake_case for technical, Arabic for display)
- Flag duplicate or redundant columns
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for unify_columns task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'data_admin_unify_columns',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ suggestionsCount: parsed.suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async adjustTypes(task: DataAdminTask): Promise<AgentResult> {
    const columns = task.columns ?? [];
    const prompt = `You are a data type specialist for a Saudi-market analytics platform.
Analyze these columns and recommend type adjustments for optimal storage and querying.

Columns:
${columns.map((c) => `- Name: "${c.name}", Current Type: ${c.currentType}, Samples: [${c.sampleValues.join(', ')}]`).join('\n')}

${task.context ? `Additional context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "change_type", "description": "description including from/to types and reason", "confidence": 0.9 }
  ],
  "interpretation": "overall type adjustment summary"
}

Consider:
- Hijri date fields (detect and recommend proper date handling)
- Saudi phone numbers, national IDs (string, not numeric)
- Currency fields (SAR) should use decimal with proper precision
- Arabic text fields need proper collation notes
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for adjust_types task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'data_admin_adjust_types',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ suggestionsCount: parsed.suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async kpiPolicy(task: DataAdminTask): Promise<AgentResult> {
    const kpis = task.kpiDefinitions ?? [];
    const prompt = `You are a KPI governance specialist for a Saudi-market analytics platform.
Review these KPI definitions and suggest policy improvements.

KPIs:
${kpis.map((k) => `- Name: "${k.name}", Formula: ${k.formula}, Threshold: ${k.threshold}`).join('\n')}

${task.context ? `Business context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "policy_update", "description": "specific KPI policy recommendation", "confidence": 0.85 }
  ],
  "interpretation": "overall KPI governance assessment"
}

Consider:
- Saudi Vision 2030 alignment where applicable
- Industry-standard thresholds
- Data freshness requirements
- Aggregation method correctness
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for kpi_policy task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'data_admin_kpi_policy',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ kpiCount: kpis.length, suggestionsCount: parsed.suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }
}
