import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { v4 as uuidv4 } from 'uuid';

// ─── Schemas ──────────────────────────────────────────────────────────

const ListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().optional(),
});

const AskSchema = z.object({
  question: z.string().min(1).max(5000),
  datasetIds: z.array(z.string().uuid()).optional().default([]),
  fileIds: z.array(z.string().uuid()).optional().default([]),
  sessionId: z.string().uuid().optional(),
  language: z.enum(['ar', 'en']).optional(),
  includeChart: z.boolean().optional().default(false),
});

const ConversationSchema = z.object({
  sessionId: z.string().uuid(),
  question: z.string().min(1).max(5000),
  datasetIds: z.array(z.string().uuid()).optional().default([]),
  fileIds: z.array(z.string().uuid()).optional().default([]),
});

const CreateSchema = z.object({
  question: z.string().min(1),
  answer: z.string().optional().default(''),
  sessionId: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
});

const UpdateSchema = z.object({
  answer: z.string().optional(),
  rating: z.number().min(1).max(5).optional(),
  feedback: z.string().optional(),
});

// ─── Interfaces ───────────────────────────────────────────────────────

interface QuerySource {
  type: 'dataset' | 'file';
  id: string;
  name: string;
  snippet: string;
}

interface ChartSuggestion {
  chartType: string;
  title: string;
  data: Record<string, unknown>[];
  xAxis: string;
  yAxis: string;
  reason: string;
}

interface FreeQueryResult {
  id: string;
  question: string;
  answer: string;
  sources: QuerySource[];
  chart: ChartSuggestion | null;
  confidence: number;
  processingMs: number;
  sessionId: string;
  suggestedQuestions: string[];
}

// ─── OpenAI Client ────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ─── Language Detection ───────────────────────────────────────────────

function detectLanguage(text: string): 'ar' | 'en' {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return arabicChars > latinChars ? 'ar' : 'en';
}

// ─── System Prompts ───────────────────────────────────────────────────

const SYSTEM_PROMPT_AR = `أنت راصد، مساعد تحليل بيانات متقدم. تجيب على أسئلة المستخدم بناءً على سياق البيانات المقدم فقط.
القواعد:
- إذا لم تحتوِ البيانات على معلومات كافية، وضّح ذلك بوضوح.
- استشهد دائمًا بمجموعة البيانات أو الملف الذي استندت إليه.
- قدّم إجابات دقيقة ومنظمة بالعربية.
- إذا كانت الإجابة تتضمن أرقامًا، اقترح رسمًا بيانيًا مناسبًا.`;

const SYSTEM_PROMPT_EN = `You are RASID, an advanced data analysis assistant. Answer user questions based strictly on the provided data context.
Rules:
- If the data does not contain enough information, say so clearly.
- Always cite which dataset or file your answer is drawn from.
- Provide precise, well-structured answers.
- If the answer involves numerical data, suggest an appropriate chart.`;

// ─── CRUD Functions ───────────────────────────────────────────────────

export async function list(params: Record<string, unknown>) {
  const validated = ListParamsSchema.parse(params);
  const skip = (validated.page - 1) * validated.limit;

  const where: Record<string, unknown> = {};
  if (validated.search) {
    where.OR = [
      { question: { contains: validated.search, mode: 'insensitive' } },
      { answer: { contains: validated.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.freeQuery.findMany({
      where,
      skip,
      take: validated.limit,
      orderBy: { [validated.sortBy]: validated.sortOrder },
    }),
    prisma.freeQuery.count({ where }),
  ]);

  return { data, total, page: validated.page, limit: validated.limit };
}

export async function getById(id: string) {
  const validId = z.string().uuid().parse(id);
  const record = await prisma.freeQuery.findUniqueOrThrow({ where: { id: validId } });
  return record;
}

export async function create(data: Record<string, unknown>) {
  const validated = CreateSchema.parse(data);
  const id = uuidv4();

  const record = await prisma.freeQuery.create({
    data: {
      id,
      question: validated.question,
      answer: validated.answer,
      sessionId: validated.sessionId || uuidv4(),
      userId: validated.createdBy || '',
      sources: [],
      confidence: 0,
      processingMs: 0,
      tokensUsed: 0,
      language: detectLanguage(validated.question),
      datasetIds: [],
      fileIds: [],
      createdAt: new Date(),
    },
  });

  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const validId = z.string().uuid().parse(id);
  const validated = UpdateSchema.parse(data);

  const record = await prisma.freeQuery.update({
    where: { id: validId },
    data: {
      ...validated,
    },
  });

  return record;
}

export async function remove(id: string) {
  const validId = z.string().uuid().parse(id);
  await prisma.freeQuery.delete({ where: { id: validId } });
  logger.info('Free query deleted', { id: validId });
  return { deleted: true, id: validId };
}

// ─── Core Ask with Chart Support ──────────────────────────────────────

export async function ask(body: Record<string, unknown>, userId: string | undefined): Promise<FreeQueryResult> {
  const validated = AskSchema.parse(body);
  const startTime = Date.now();
  const queryId = uuidv4();
  const sessionId = validated.sessionId || uuidv4();
  const language = validated.language || detectLanguage(validated.question);
  const safeUserId = userId || '';

  logger.info('Processing free query', { queryId, sessionId, language, includeChart: validated.includeChart });

  // Gather data sources
  const sources: QuerySource[] = [];

  if (validated.datasetIds.length > 0) {
    for (const datasetId of validated.datasetIds) {
      const dataset = await prisma.dataset.findFirst({ where: { id: datasetId } });
      if (!dataset) continue;

      const rows = await prisma.datasetRow.findMany({
        where: { datasetId },
        take: 50,
        orderBy: { createdAt: 'desc' },
      });

      if (rows.length > 0) {
        const snippet = rows.map((r: { data: unknown }) => JSON.stringify(r.data)).join('\n');
        sources.push({
          type: 'dataset',
          id: datasetId,
          name: (dataset as { name?: string }).name || datasetId,
          snippet: snippet.substring(0, 3000),
        });
      }
    }
  }

  if (validated.fileIds.length > 0) {
    for (const fileId of validated.fileIds) {
      const file = await prisma.file.findFirst({ where: { id: fileId } });
      if (!file) continue;

      const chunks = await prisma.fileChunk.findMany({
        where: { fileId },
        take: 20,
        orderBy: { chunkIndex: 'asc' },
      });

      if (chunks.length > 0) {
        const snippet = chunks.map((c: { content: string }) => c.content).join('\n');
        sources.push({
          type: 'file',
          id: fileId,
          name: (file as { name?: string }).name || fileId,
          snippet: snippet.substring(0, 3000),
        });
      }
    }
  }

  // Fetch conversation history
  const previousQueries = await prisma.freeQuery.findMany({
    where: { sessionId, userId: safeUserId },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const prev of previousQueries) {
    historyMessages.push({ role: 'user', content: (prev as { question: string }).question });
    historyMessages.push({ role: 'assistant', content: (prev as { answer: string }).answer });
  }

  // Build context
  const contextBlock = sources.length > 0
    ? sources.map((s, i) => `[Source ${i + 1} - ${s.type}:${s.name}]\n${s.snippet}`).join('\n\n')
    : language === 'ar' ? 'لا يوجد سياق بيانات متاح.' : 'No data context available.';

  const systemPrompt = language === 'ar' ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_EN;

  const chartInstruction = validated.includeChart
    ? `\n\nIMPORTANT: If the answer involves numerical data, include a "chart" field in your JSON response:
{
  "answer": "<your answer>",
  "chart": {
    "chartType": "<bar|line|scatter|pie|area|heatmap>",
    "title": "<chart title>",
    "data": [{"label": "<x>", "value": <y>}, ...],
    "xAxis": "<x axis label>",
    "yAxis": "<y axis label>",
    "reason": "<why this chart type>"
  },
  "suggestedQuestions": ["<q1>", "<q2>", "<q3>"]
}
If no chart is appropriate, set "chart" to null.
Return ONLY valid JSON.`
    : `\n\nReturn a JSON object:
{
  "answer": "<your detailed answer>",
  "chart": null,
  "suggestedQuestions": ["<q1>", "<q2>", "<q3>"]
}
The suggestedQuestions should be follow-up questions the user might want to ask based on the data and current question.
Return ONLY valid JSON.`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: `${systemPrompt}\n\n--- DATA CONTEXT ---\n${contextBlock}${chartInstruction}` },
    ...historyMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: validated.question },
  ];

  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.05,
    max_tokens: 3000,
    messages,
    response_format: { type: 'json_object' },
  });

  const rawContent = completion.choices[0]?.message?.content || '{}';
  const totalTokens = completion.usage?.total_tokens || 0;
  const finishReason = completion.choices[0]?.finish_reason;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    parsed = { answer: rawContent, chart: null, suggestedQuestions: [] };
  }

  const answer = String(parsed.answer || rawContent);

  // Parse chart
  let chart: ChartSuggestion | null = null;
  if (parsed.chart && typeof parsed.chart === 'object') {
    const c = parsed.chart as Record<string, unknown>;
    chart = {
      chartType: String(c.chartType || 'bar'),
      title: String(c.title || ''),
      data: Array.isArray(c.data) ? c.data as Record<string, unknown>[] : [],
      xAxis: String(c.xAxis || ''),
      yAxis: String(c.yAxis || ''),
      reason: String(c.reason || ''),
    };
  }

  // Parse suggested questions
  const suggestedQuestions = Array.isArray(parsed.suggestedQuestions)
    ? (parsed.suggestedQuestions as string[]).map(String).slice(0, 5)
    : [];

  // Calculate confidence
  let confidence = 0.85;
  if (finishReason === 'stop' && sources.length > 0) confidence = 0.95;
  else if (finishReason === 'stop' && sources.length === 0) confidence = 0.6;
  else if (finishReason === 'length') confidence = 0.5;

  const processingMs = Date.now() - startTime;

  // Persist
  await prisma.freeQuery.create({
    data: {
      id: queryId,
      userId: safeUserId,
      sessionId,
      question: validated.question,
      answer,
      sources: sources as unknown as Prisma.InputJsonValue,
      confidence,
      processingMs,
      tokensUsed: totalTokens,
      language,
      datasetIds: validated.datasetIds,
      fileIds: validated.fileIds,
      createdAt: new Date(),
    },
  });

  logger.info('Free query completed', { queryId, processingMs, totalTokens, confidence, hasChart: chart !== null });

  return {
    id: queryId,
    question: validated.question,
    answer,
    sources,
    chart,
    confidence,
    processingMs,
    sessionId,
    suggestedQuestions,
  };
}

// ─── Conversation (multi-turn) ────────────────────────────────────────

export async function conversation(body: Record<string, unknown>, userId: string | undefined): Promise<FreeQueryResult> {
  const validated = ConversationSchema.parse(body);

  return ask(
    {
      question: validated.question,
      datasetIds: validated.datasetIds,
      fileIds: validated.fileIds,
      sessionId: validated.sessionId,
      includeChart: true,
    },
    userId,
  );
}

// ─── Conversation History ─────────────────────────────────────────────

export async function getHistory(conversationId: string) {
  const validId = z.string().uuid().parse(conversationId);

  const queries = await prisma.freeQuery.findMany({
    where: { sessionId: validId },
    orderBy: { createdAt: 'asc' },
  });

  const messages = queries.map((q: Record<string, unknown>) => ({
    id: q.id,
    question: q.question,
    answer: q.answer,
    sources: q.sources,
    confidence: q.confidence,
    processingMs: q.processingMs,
    createdAt: q.createdAt,
  }));

  return {
    sessionId: validId,
    messageCount: messages.length,
    messages,
  };
}
