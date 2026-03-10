import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });
const prisma = new PrismaClient();

export interface AgentResult {
  agentType: string;
  taskType: string;
  suggestions: Array<{ action: string; description: string; confidence: number }>;
  interpretation: string;
  requiresApproval: boolean;
  executedAt: Date;
}

export interface ReportWriterTask {
  type: 'generate_narrative' | 'executive_summary' | 'translate_formal';
  reportId: string;
  data?: Array<Record<string, number | string | null>>;
  dataSummary?: Record<string, unknown>;
  sourceText?: string;
  targetLanguage?: 'ar' | 'en';
  sections?: Array<{ title: string; content: string; chartDescription?: string }>;
  audienceLevel?: 'executive' | 'manager' | 'analyst' | 'technical';
  context?: string;
}

export class ReportWriterAgent {
  private readonly agentType = 'report-writer';

  async execute(task: ReportWriterTask): Promise<AgentResult> {
    switch (task.type) {
      case 'generate_narrative':
        return this.generateNarrative(task);
      case 'executive_summary':
        return this.executiveSummary(task);
      case 'translate_formal':
        return this.translateFormal(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private async generateNarrative(task: ReportWriterTask): Promise<AgentResult> {
    const audience = task.audienceLevel ?? 'manager';
    const sections = task.sections ?? [];

    const prompt = `You are a professional Arabic report writer for a Saudi analytics platform.
Generate a formal Arabic narrative report based on the data and sections provided.

Report ID: "${task.reportId}"
Audience: ${audience}

${sections.length > 0 ? `Sections:\n${sections.map((s) => `### ${s.title}\n${s.content}\n${s.chartDescription ? `Chart: ${s.chartDescription}` : ''}`).join('\n\n')}` : ''}

${task.dataSummary ? `Data summary:\n${JSON.stringify(task.dataSummary, null, 2)}` : ''}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "narrative_section", "description": "the generated Arabic narrative text for this section", "confidence": 0.9 }
  ],
  "interpretation": "summary of the narrative structure and key points covered"
}

Requirements:
- Write in formal Modern Standard Arabic (MSA)
- Use professional business terminology
- Reference specific numbers and trends from the data
- Structure with clear headings and logical flow
- Appropriate for ${audience}-level audience
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for generate_narrative task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'report_writer_narrative',
        entityType: 'report',
        entityId: task.reportId,
        details: JSON.stringify({ sectionsCount: sections.length, audience }),
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

  private async executiveSummary(task: ReportWriterTask): Promise<AgentResult> {
    const sections = task.sections ?? [];

    const prompt = `You are an executive communications specialist writing for Saudi C-level executives.
Create a concise executive summary in formal Arabic.

Report ID: "${task.reportId}"

${sections.length > 0 ? `Full report sections:\n${sections.map((s) => `### ${s.title}\n${s.content}`).join('\n\n')}` : ''}

${task.dataSummary ? `Key metrics:\n${JSON.stringify(task.dataSummary, null, 2)}` : ''}

${task.context ? `Strategic context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "executive_summary_text", "description": "the executive summary paragraph in formal Arabic", "confidence": 0.92 },
    { "action": "key_finding", "description": "a key finding or insight for executive attention", "confidence": 0.88 },
    { "action": "recommended_action", "description": "a recommended executive action", "confidence": 0.85 }
  ],
  "interpretation": "meta-description of what the summary covers and its strategic relevance"
}

Requirements:
- Maximum 300 words for the summary
- Lead with the most impactful finding
- Include 3-5 key metrics with context
- End with clear recommended actions
- Use formal Arabic appropriate for board presentations
- Align insights with Saudi Vision 2030 where relevant
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for executive_summary task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'report_writer_executive_summary',
        entityType: 'report',
        entityId: task.reportId,
        details: JSON.stringify({ sectionsProcessed: sections.length }),
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

  private async translateFormal(task: ReportWriterTask): Promise<AgentResult> {
    const sourceText = task.sourceText;
    if (!sourceText) {
      throw new Error('sourceText is required for translate_formal task');
    }

    const targetLang = task.targetLanguage ?? 'ar';
    const targetLabel = targetLang === 'ar' ? 'Arabic (formal MSA)' : 'English (formal business)';

    const prompt = `You are a professional translator specializing in formal business and government documents for the Saudi market.
Translate the following text to ${targetLabel}.

Source text:
"""
${sourceText}
"""

${task.context ? `Translation context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "translation", "description": "the complete translated text", "confidence": 0.93 },
    { "action": "terminology_note", "description": "notes on specific terminology choices", "confidence": 0.85 }
  ],
  "interpretation": "assessment of translation quality, register, and any cultural adaptations made"
}

Requirements:
- Use formal register appropriate for official Saudi documents
- Preserve technical terminology accurately
- For Arabic: use Modern Standard Arabic, not colloquial
- For English: use British English conventions (common in Saudi business)
- Maintain paragraph structure and formatting
- Adapt cultural references appropriately
- Handle numbers, dates, and currencies according to target locale
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for translate_formal task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'report_writer_translate',
        entityType: 'report',
        entityId: task.reportId,
        details: JSON.stringify({ targetLanguage: targetLang, sourceLength: sourceText.length }),
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
