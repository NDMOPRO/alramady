import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

// ─── Interfaces ──────────────────────────────────────────────────────

export interface FreeQueryRequest {
  question: string;
  datasetIds?: string[];
  fileIds?: string[];
  sessionId?: string;
  language?: 'ar' | 'en' | string;
}

export interface FreeQueryResult {
  id: string;
  question: string;
  answer: string;
  sources: QuerySource[];
  confidence: number;
  processingMs: number;
  sessionId: string;
}

interface QuerySource {
  type: 'dataset' | 'file';
  id: string;
  name: string;
  snippet: string;
}

interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'free-query' },
  transports: [
    new winston.transports.Console(),
  ],
});

// ─── Clients ─────────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });
const prisma = new PrismaClient();

// ─── System Prompts ──────────────────────────────────────────────────

const SYSTEM_PROMPT_EN = `You are RASID, an advanced data analysis assistant. You answer user questions based strictly on the provided data context. If the data does not contain enough information to answer, say so clearly. Always cite which dataset or file your answer is drawn from. Provide precise, well-structured answers.`;

const SYSTEM_PROMPT_AR = `أنت رصيد، مساعد تحليل بيانات متقدم. تجيب على أسئلة المستخدم بناءً على سياق البيانات المقدم فقط. إذا لم تحتوِ البيانات على معلومات كافية للإجابة، وضّح ذلك بوضوح. استشهد دائمًا بمجموعة البيانات أو الملف الذي استندت إليه إجابتك. قدّم إجابات دقيقة ومنظمة.`;

// ─── Helpers ─────────────────────────────────────────────────────────

function detectLanguage(text: string): 'ar' | 'en' {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return arabicChars > latinChars ? 'ar' : 'en';
}

function buildContextBlock(sources: QuerySource[]): string {
  if (sources.length === 0) return 'No data context available.';
  return sources
    .map((s, i) => `[Source ${i + 1} - ${s.type}:${s.name}]\n${s.snippet}`)
    .join('\n\n');
}

// ─── Service Functions ───────────────────────────────────────────────

export async function ask(body: FreeQueryRequest, userId: string): Promise<FreeQueryResult> {
  const startTime = Date.now();
  const queryId = uuidv4();
  const sessionId = body.sessionId || uuidv4();
  const language = body.language || detectLanguage(body.question);

  logger.info('Processing free query', { queryId, userId, sessionId, language });

  // Fetch dataset rows as context
  const sources: QuerySource[] = [];

  if (body.datasetIds && body.datasetIds.length > 0) {
    for (const datasetId of body.datasetIds) {
      const dataset = await prisma.dataset.findFirst({
        where: { id: datasetId, userId },
      });
      if (!dataset) continue;

      const rows = await prisma.datasetRow.findMany({
        where: { datasetId },
        take: 50,
        orderBy: { createdAt: 'desc' },
      });

      if (rows.length > 0) {
        const snippet = rows
          .map((r: { data: unknown }) => JSON.stringify(r.data))
          .join('\n');
        sources.push({
          type: 'dataset',
          id: datasetId,
          name: (dataset as { name?: string }).name || datasetId,
          snippet: snippet.substring(0, 3000),
        });
      }
    }
  }

  // Fetch file chunks as context
  if (body.fileIds && body.fileIds.length > 0) {
    for (const fileId of body.fileIds) {
      const file = await prisma.file.findFirst({
        where: { id: fileId, userId },
      });
      if (!file) continue;

      const chunks = await prisma.fileChunk.findMany({
        where: { fileId },
        take: 20,
        orderBy: { chunkIndex: 'asc' },
      });

      if (chunks.length > 0) {
        const snippet = chunks
          .map((c: { content: string }) => c.content)
          .join('\n');
        sources.push({
          type: 'file',
          id: fileId,
          name: (file as { name?: string }).name || fileId,
          snippet: snippet.substring(0, 3000),
        });
      }
    }
  }

  // Fetch session history for conversation continuity
  const historyMessages: SessionMessage[] = [];
  const previousQueries = await prisma.freeQuery.findMany({
    where: { sessionId, userId },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  for (const prev of previousQueries) {
    historyMessages.push({ role: 'user', content: (prev as { question: string }).question });
    historyMessages.push({ role: 'assistant', content: (prev as { answer: string }).answer });
  }

  // Build messages for OpenAI
  const systemPrompt = language === 'ar' ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_EN;
  const contextBlock = buildContextBlock(sources);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: `${systemPrompt}\n\n--- DATA CONTEXT ---\n${contextBlock}` },
    ...historyMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: body.question },
  ];

  // Call OpenAI
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.05,
    max_tokens: 2048,
    messages,
  });

  const answer = completion.choices[0]?.message?.content || '';
  const tokensUsed = completion.usage?.total_tokens || 0;

  // Estimate confidence from finish reason and token usage
  const finishReason = completion.choices[0]?.finish_reason;
  let confidence = 0.85;
  if (finishReason === 'stop' && sources.length > 0) confidence = 0.95;
  else if (finishReason === 'stop' && sources.length === 0) confidence = 0.6;
  else if (finishReason === 'length') confidence = 0.5;

  const processingMs = Date.now() - startTime;

  // Save to database
  await prisma.freeQuery.create({
    data: {
      id: queryId,
      userId,
      sessionId,
      question: body.question,
      answer,
      sources: JSON.parse(JSON.stringify(sources)),
      confidence,
      processingMs,
      tokensUsed,
      language,
      datasetIds: body.datasetIds || [],
      fileIds: body.fileIds || [],
      createdAt: new Date(),
    },
  });

  logger.info('Free query completed', { queryId, processingMs, tokensUsed, confidence });

  return {
    id: queryId,
    question: body.question,
    answer,
    sources,
    confidence,
    processingMs,
    sessionId,
  };
}

export async function list(params: {
  userId: string;
  page?: number;
  limit?: number;
  search?: string;
  sessionId?: string;
}): Promise<{ data: FreeQueryResult[]; total: number; page: number; limit: number }> {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { userId: params.userId };

  if (params.search) {
    where.OR = [
      { question: { contains: params.search, mode: 'insensitive' } },
      { answer: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  if (params.sessionId) {
    where.sessionId = params.sessionId;
  }

  const [data, total] = await Promise.all([
    prisma.freeQuery.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.freeQuery.count({ where }),
  ]);

  const results: FreeQueryResult[] = data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    question: row.question as string,
    answer: row.answer as string,
    sources: row.sources as QuerySource[],
    confidence: row.confidence as number,
    processingMs: row.processingMs as number,
    sessionId: row.sessionId as string,
  }));

  return { data: results, total, page, limit };
}

export async function getById(id: string, userId: string): Promise<FreeQueryResult | null> {
  const row = await prisma.freeQuery.findFirst({
    where: { id, userId },
  });

  if (!row) return null;

  const typed = row as Record<string, unknown>;
  return {
    id: typed.id as string,
    question: typed.question as string,
    answer: typed.answer as string,
    sources: typed.sources as QuerySource[],
    confidence: typed.confidence as number,
    processingMs: typed.processingMs as number,
    sessionId: typed.sessionId as string,
  };
}

export async function remove(id: string, userId: string): Promise<boolean> {
  const existing = await prisma.freeQuery.findFirst({
    where: { id, userId },
  });

  if (!existing) return false;

  await prisma.freeQuery.delete({ where: { id } });

  logger.info('Free query deleted', { id, userId });
  return true;
}
