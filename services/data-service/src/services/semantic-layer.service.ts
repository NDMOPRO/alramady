import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { z } from 'zod';

const prisma = new PrismaClient();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const DimensionSchema = z.object({
  name: z.string(),
  datasetId: z.string().uuid(),
  column: z.string(),
  type: z.enum(['string', 'number', 'date', 'boolean']),
  label: z.string(),
});

const MeasureSchema = z.object({
  name: z.string(),
  expression: z.string(),
  aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max', 'count_distinct']),
  label: z.string(),
});

const SemanticModelSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  dimensions: z.array(DimensionSchema),
  measures: z.array(MeasureSchema),
});

// ─── Service ─────────────────────────────────────────────────────────────────

export class SemanticLayerService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  async createModel(input: z.infer<typeof SemanticModelSchema>): Promise<unknown> {
    const validated = SemanticModelSchema.parse(input);

    return prisma.knowledgeBase.create({
      data: {
        tenantId: validated.tenantId,
        name: validated.name,
        description: validated.description || `Semantic model: ${validated.name}`,
        status: 'ACTIVE',
        language: 'EN',
        settings: {
          type: 'SEMANTIC_MODEL',
          dimensions: validated.dimensions,
          measures: validated.measures,
        },
      },
    });
  }

  async getModel(modelId: string, tenantId: string): Promise<unknown> {
    const model = await prisma.knowledgeBase.findFirst({
      where: { id: modelId, tenantId },
    });
    if (!model) throw new Error('Semantic model not found');

    const settings = model.settings as Record<string, unknown> | null;
    if (settings?.type !== 'SEMANTIC_MODEL') throw new Error('Not a semantic model');

    return model;
  }

  async listModels(tenantId: string): Promise<unknown[]> {
    const all = await prisma.knowledgeBase.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return all.filter((kb) => {
      const settings = kb.settings as Record<string, unknown> | null;
      return settings?.type === 'SEMANTIC_MODEL';
    });
  }

  async resolveNaturalLanguageQuery(
    tenantId: string,
    query: string,
    modelId: string,
  ): Promise<{ sql: string; modelId: string; originalQuery: string }> {
    const model = await this.getModel(modelId, tenantId);
    const settings = (model as { settings: Record<string, unknown> }).settings;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Convert natural language to SQL using this semantic model:\n${JSON.stringify(settings)}\nReturn only the SQL query, nothing else.`,
        },
        { role: 'user', content: query },
      ],
      max_tokens: 500,
      temperature: 0,
    });

    const sql = response.choices[0].message.content?.trim() || '';
    return { sql, modelId, originalQuery: query };
  }

  async deleteModel(modelId: string, tenantId: string): Promise<void> {
    const model = await this.getModel(modelId, tenantId);
    if (!model) throw new Error('Model not found');

    await prisma.knowledgeBase.update({
      where: { id: modelId },
      data: { deletedAt: new Date() },
    });
  }
}
