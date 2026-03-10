import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import winston from 'winston';

const prisma = new PrismaClient();

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  count(args: Record<string, unknown>): Promise<number>;
}

const model = (prisma as unknown as Record<string, PrismaDelegate>)[MODEL];
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-service', module: 'ai-editing' },
  transports: [new winston.transports.Console()],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

const MODEL = 'aiEditingSuggestion';

interface ListParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
  search?: string;
}

export async function list(params: ListParams) {
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 20;
  const sortBy = params.sortBy || 'createdAt';
  const sortOrder = (params.sortOrder as 'asc' | 'desc') || 'desc';

  const where: Record<string, unknown> = {};
  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: 'insensitive' } },
      { content: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    model.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    model.count({ where }),
  ]);

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getById(id: string) {
  const record = await model.findUnique({ where: { id } });
  if (!record) throw new Error('AI editing suggestion not found');
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await model.create({ data });
  logger.info('AI editing suggestion created', { id: record.id });
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing) throw new Error('AI editing suggestion not found');
  const record = await model.update({ where: { id }, data });
  logger.info('AI editing suggestion updated', { id });
  return record;
}

export async function remove(id: string) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing) throw new Error('AI editing suggestion not found');
  await model.delete({ where: { id } });
  logger.info('AI editing suggestion deleted', { id });
  return { success: true };
}

export async function suggestEdit(
  body: { content: string; context?: string; language?: string; style?: string },
  userId?: string,
) {
  const { content, context, language = 'ar', style = 'formal' } = body;
  if (!content) throw new Error('content is required');

  const systemPrompt = language === 'ar'
    ? 'أنت محرر نصوص محترف. قم بتحليل النص واقتراح تعديلات لتحسين الجودة والوضوح والأسلوب.'
    : 'You are a professional text editor. Analyze the text and suggest edits to improve quality, clarity, and style.';

  const userPrompt = `${context ? `Context: ${context}\n\n` : ''}Style: ${style}\n\nText to edit:\n${content}\n\nProvide suggestions as JSON array with fields: type (grammar|style|clarity|structure), original (original text), suggested (suggested replacement), reason (explanation).`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);
  const suggestions = parsed.suggestions || parsed.edits || [];

  logger.info('Edit suggestions generated', { userId, suggestionCount: suggestions.length });
  return { suggestions, tokensUsed: response.usage?.total_tokens || 0 };
}

export async function applyEdit(
  body: { content: string; edits: Array<{ original: string; replacement: string }> },
  userId?: string,
) {
  const { content, edits } = body;
  if (!content || !edits) throw new Error('content and edits are required');

  let result = content;
  const applied: Array<{ original: string; replacement: string; applied: boolean }> = [];

  for (const edit of edits) {
    if (result.includes(edit.original)) {
      result = result.replace(edit.original, edit.replacement);
      applied.push({ ...edit, applied: true });
    } else {
      applied.push({ ...edit, applied: false });
    }
  }

  logger.info('Edits applied', { userId, totalEdits: edits.length, appliedCount: applied.filter(a => a.applied).length });
  return { editedContent: result, appliedEdits: applied };
}

export async function autoFix(
  body: { content: string; language?: string; fixTypes?: string[] },
  userId?: string,
) {
  const { content, language = 'ar', fixTypes = ['grammar', 'spelling', 'punctuation'] } = body;
  if (!content) throw new Error('content is required');

  const systemPrompt = language === 'ar'
    ? 'أنت مصحح لغوي متخصص. قم بإصلاح الأخطاء في النص وأرجع النص المصحح مع قائمة التصحيحات.'
    : 'You are a language proofreader. Fix errors in the text and return the corrected text with a list of corrections.';

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Fix the following types of errors: ${fixTypes.join(', ')}\n\nText:\n${content}\n\nReturn JSON with fields: correctedText (string), corrections (array of {original, corrected, type, position}).` },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);

  logger.info('Auto-fix completed', { userId, correctionCount: (parsed.corrections || []).length });
  return {
    correctedText: parsed.correctedText || content,
    corrections: parsed.corrections || [],
    tokensUsed: response.usage?.total_tokens || 0,
  };
}
