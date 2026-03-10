import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

interface ReportResponse {
  report?: string;
  sections?: string[];
}

interface InsightItem {
  title?: string;
  description?: string;
  severity?: string;
  category?: string;
}

interface InsightResponse {
  insights?: InsightItem[];
}

interface RecommendationItem {
  title?: string;
  description?: string;
  priority?: string;
  impact?: string;
  effort?: string;
}

interface RecommendationResponse {
  recommendations?: RecommendationItem[];
}

interface DatasetRecord {
  name?: string;
  description?: string;
}

interface DatasetRowRecord {
  data?: Record<string, unknown>;
  row_data?: Record<string, unknown>;
}

interface ChatOptions {
  sessionId?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-service', module: 'generative-ai' },
  transports: [new winston.transports.Console()],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

export interface GenerateTextOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface GenerateTextResult {
  text: string;
  model: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  finishReason: string;
  queryId: string;
}

export async function generateText(
  prompt: string,
  options: GenerateTextOptions,
  tenantId: string,
  userId: string
): Promise<GenerateTextResult> {
  const queryId = uuidv4();
  const startTime = Date.now();
  logger.info('Generating text', { queryId, tenantId, userId, promptLength: prompt.length });

  const temperature = typeof options.temperature === 'number'
    ? Math.min(2, Math.max(0, options.temperature))
    : 0.7;
  const maxTokens = typeof options.maxTokens === 'number'
    ? Math.min(4096, Math.max(50, options.maxTokens))
    : 2048;

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  const content = response.choices[0]?.message?.content || '';
  const finishReason = response.choices[0]?.finish_reason || 'unknown';
  const durationMs = Date.now() - startTime;
  const promptTokens = response.usage?.prompt_tokens || 0;
  const completionTokens = response.usage?.completion_tokens || 0;
  const totalTokens = response.usage?.total_tokens || 0;

  logger.info('Text generation complete', { queryId, durationMs, totalTokens, finishReason });

  await prisma.aiQuery.create({
    data: {
      id: queryId,
      tenantId: tenantId,
      userId: userId,
      queryType: 'text_generation',
      inputText: prompt.substring(0, 2000),
      outputText: content.substring(0, 5000),
      model: DEFAULT_MODEL,
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      totalTokens: totalTokens,
      durationMs: durationMs,
      status: 'COMPLETED',
      createdAt: new Date(),
    },
  });

  return {
    text: content,
    model: DEFAULT_MODEL,
    tokensUsed: { prompt: promptTokens, completion: completionTokens, total: totalTokens },
    finishReason,
    queryId,
  };
}

export async function generateReport(
  data: string | Record<string, unknown>,
  instructions: string,
  tenantId: string,
  userId: string
): Promise<{ report: string; sections: string[]; queryId: string; tokensUsed: number }> {
  const queryId = uuidv4();
  const startTime = Date.now();
  logger.info('Generating report', { queryId, tenantId, userId });

  let dataSummary: string;
  if (typeof data === 'string') {
    dataSummary = data.substring(0, 8000);
  } else {
    const jsonStr = JSON.stringify(data, null, 2);
    dataSummary = jsonStr.substring(0, 8000);
  }

  const systemPrompt = `You are a professional report writer. Generate a comprehensive, well-structured report based on the provided data.
The report should include:
- Executive Summary
- Key Findings
- Detailed Analysis
- Conclusions and Recommendations

Format the report with clear section headers using markdown. Be data-driven, cite specific numbers from the data.
Return a JSON object:
{
  "report": "<full report text in markdown>",
  "sections": ["<section title 1>", "<section title 2>", ...]
}`;

  const userMessage = `Data:\n${dataSummary}\n\nInstructions: ${instructions}`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.4,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for report generation');
  }

  const parsed: ReportResponse = JSON.parse(content);
  const durationMs = Date.now() - startTime;
  const totalTokens = response.usage?.total_tokens || 0;

  logger.info('Report generation complete', { queryId, durationMs, totalTokens });

  await prisma.aiQuery.create({
    data: {
      id: queryId,
      tenantId: tenantId,
      userId: userId,
      queryType: 'report_generation',
      inputText: instructions.substring(0, 2000),
      outputText: String(parsed.report || '').substring(0, 5000),
      model: DEFAULT_MODEL,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: totalTokens,
      durationMs: durationMs,
      status: 'COMPLETED',
      createdAt: new Date(),
    },
  });

  return {
    report: String(parsed.report || ''),
    sections: Array.isArray(parsed.sections) ? parsed.sections.map(String) : [],
    queryId,
    tokensUsed: totalTokens,
  };
}

export async function generateInsights(
  datasetId: string,
  tenantId: string,
  userId: string
): Promise<{ insights: Array<{ title: string; description: string; severity: string; category: string }>; queryId: string }> {
  const queryId = uuidv4();
  const startTime = Date.now();
  logger.info('Generating insights', { queryId, datasetId, tenantId, userId });

  const dataset = await prisma.dataset.findFirst({
    where: { id: datasetId, tenantId: tenantId },
  });

  if (!dataset) {
    throw new Error(`Dataset ${datasetId} not found for tenant ${tenantId}`);
  }

  const dataRecords = await prisma.datasetRow.findMany({
    where: { datasetId: datasetId },
    take: 200,
    orderBy: { createdAt: 'desc' },
  });

  const fetchedRows = dataRecords.map((r: DatasetRowRecord) => r.data || r.row_data).slice(0, 50);
  const dataPreview = JSON.stringify(fetchedRows, null, 2).substring(0, 6000);

  const systemPrompt = `You are a data analytics expert. Analyze the dataset metadata and sample rows to generate actionable insights.
Look for: patterns, trends, anomalies, outliers, correlations, data quality issues, and opportunities.
Return a JSON object:
{
  "insights": [
    {
      "title": "<brief insight title>",
      "description": "<detailed explanation with specific data references>",
      "severity": "<high|medium|low>",
      "category": "<pattern|anomaly|trend|correlation|quality|opportunity>"
    }
  ]
}
Generate at least 3 and up to 10 insights. Return ONLY valid JSON.`;

  const userContent = `Dataset: ${(dataset as DatasetRecord).name || datasetId}
Description: ${(dataset as DatasetRecord).description || 'N/A'}
Total rows: ${dataRecords.length}+
Sample data (first 50 rows):
${dataPreview}`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.4,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for insight generation');
  }

  const parsed: InsightResponse = JSON.parse(content);
  const durationMs = Date.now() - startTime;
  const totalTokens = response.usage?.total_tokens || 0;

  logger.info('Insight generation complete', { queryId, durationMs, insightCount: parsed.insights?.length });

  await prisma.aiQuery.create({
    data: {
      id: queryId,
      tenantId: tenantId,
      userId: userId,
      queryType: 'insight_generation',
      inputText: `Dataset: ${datasetId}`,
      outputText: content.substring(0, 5000),
      model: DEFAULT_MODEL,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: totalTokens,
      durationMs: durationMs,
      status: 'COMPLETED',
      createdAt: new Date(),
    },
  });

  const insights = Array.isArray(parsed.insights)
    ? parsed.insights.map((i: InsightItem) => ({
        title: String(i.title || ''),
        description: String(i.description || ''),
        severity: ['high', 'medium', 'low'].includes(i.severity) ? i.severity : 'medium',
        category: String(i.category || 'pattern'),
      }))
    : [];

  return { insights, queryId };
}

export async function generateRecommendations(
  context: string | Record<string, unknown>,
  tenantId: string,
  userId: string
): Promise<{ recommendations: Array<{ title: string; description: string; priority: string; impact: string; effort: string }>; queryId: string }> {
  const queryId = uuidv4();
  const startTime = Date.now();
  logger.info('Generating recommendations', { queryId, tenantId, userId });

  const contextStr = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
  const truncatedContext = contextStr.substring(0, 8000);

  const systemPrompt = `You are a strategic advisor. Based on the provided context, generate actionable recommendations.
Each recommendation should be specific, measurable, and achievable.
Return a JSON object:
{
  "recommendations": [
    {
      "title": "<brief recommendation title>",
      "description": "<detailed recommendation with specific action steps>",
      "priority": "<critical|high|medium|low>",
      "impact": "<high|medium|low>",
      "effort": "<high|medium|low>"
    }
  ]
}
Generate 3-8 recommendations ordered by priority. Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Context:\n${truncatedContext}` },
    ],
    temperature: 0.5,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for recommendations');
  }

  const parsed: RecommendationResponse = JSON.parse(content);
  const durationMs = Date.now() - startTime;
  const totalTokens = response.usage?.total_tokens || 0;

  await prisma.aiQuery.create({
    data: {
      id: queryId,
      tenantId: tenantId,
      userId: userId,
      queryType: 'recommendation_generation',
      inputText: truncatedContext.substring(0, 2000),
      outputText: content.substring(0, 5000),
      model: DEFAULT_MODEL,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: totalTokens,
      durationMs: durationMs,
      status: 'COMPLETED',
      createdAt: new Date(),
    },
  });

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.map((r: RecommendationItem) => ({
        title: String(r.title || ''),
        description: String(r.description || ''),
        priority: ['critical', 'high', 'medium', 'low'].includes(r.priority) ? r.priority : 'medium',
        impact: ['high', 'medium', 'low'].includes(r.impact) ? r.impact : 'medium',
        effort: ['high', 'medium', 'low'].includes(r.effort) ? r.effort : 'medium',
      }))
    : [];

  logger.info('Recommendations generated', { queryId, count: recommendations.length });
  return { recommendations, queryId };
}

export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  options: ChatOptions,
  tenantId: string,
  userId: string
): Promise<{ reply: string; sessionId: string; queryId: string; tokensUsed: number }> {
  const queryId = uuidv4();
  const startTime = Date.now();
  const sessionId = options?.sessionId || uuidv4();
  logger.info('Chat completion', { queryId, sessionId, tenantId, userId, messageCount: messages.length });

  const temperature = typeof options?.temperature === 'number'
    ? Math.min(2, Math.max(0, options.temperature))
    : 0.7;
  const maxTokens = typeof options?.maxTokens === 'number'
    ? Math.min(4096, Math.max(50, options.maxTokens))
    : 2048;

  const systemMessage = options?.systemPrompt
    ? { role: 'system' as const, content: options.systemPrompt }
    : { role: 'system' as const, content: 'You are a helpful AI assistant for the RASID platform. Provide accurate, detailed, and well-structured responses.' };

  const formattedMessages = [
    systemMessage,
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
  ];

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: formattedMessages,
    temperature,
    max_tokens: maxTokens,
  });

  const reply = response.choices[0]?.message?.content || '';
  const durationMs = Date.now() - startTime;
  const totalTokens = response.usage?.total_tokens || 0;

  logger.info('Chat completion done', { queryId, durationMs, totalTokens });

  await prisma.aiQuery.create({
    data: {
      id: queryId,
      tenantId: tenantId,
      userId: userId,
      queryType: 'chat_completion',
      inputText: messages[messages.length - 1]?.content?.substring(0, 2000) || '',
      outputText: reply.substring(0, 5000),
      model: DEFAULT_MODEL,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: totalTokens,
      durationMs: durationMs,
      metadata: JSON.stringify({ sessionId }),
      status: 'COMPLETED',
      createdAt: new Date(),
    },
  });

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO ai_sessions (
        id,
        tenant_id,
        user_id,
        session_type,
        status,
        metadata,
        title,
        message_count,
        total_tokens,
        last_activity,
        created_at,
        updated_at
      ) VALUES (
        $1::uuid,
        $2,
        $3::uuid,
        'chat',
        'active',
        $4::jsonb,
        $5,
        $6,
        $7,
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        tenant_id = COALESCE(EXCLUDED.tenant_id, ai_sessions.tenant_id),
        user_id = EXCLUDED.user_id,
        session_type = ai_sessions.session_type,
        status = 'active',
        metadata = COALESCE(ai_sessions.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        title = COALESCE(ai_sessions.title, EXCLUDED.title),
        message_count = COALESCE(ai_sessions.message_count, 0) + 2,
        total_tokens = COALESCE(ai_sessions.total_tokens, 0) + EXCLUDED.total_tokens,
        last_activity = NOW(),
        updated_at = NOW()
    `,
    sessionId,
    tenantId || null,
    userId,
    JSON.stringify({ source: 'rasid-surface-assistant', queryId }),
    messages[0]?.content?.substring(0, 100) || 'جلسة راصد',
    messages.length + 1,
    totalTokens
  );

  return { reply, sessionId, queryId, tokensUsed: totalTokens };
}

export async function* streamCompletion(
  messages: Array<{ role: string; content: string }>,
  options: StreamOptions
): AsyncGenerator<string, void, unknown> {
  logger.info('Starting stream completion', { messageCount: messages.length });

  const temperature = typeof options?.temperature === 'number'
    ? Math.min(2, Math.max(0, options.temperature))
    : 0.7;
  const maxTokens = typeof options?.maxTokens === 'number'
    ? Math.min(4096, Math.max(50, options.maxTokens))
    : 2048;

  const systemMessage = options?.systemPrompt
    ? { role: 'system' as const, content: options.systemPrompt }
    : { role: 'system' as const, content: 'You are a helpful AI assistant for the RASID platform.' };

  const formattedMessages = [
    systemMessage,
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
  ];

  const stream = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: formattedMessages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  });

  let totalContent = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      totalContent += delta;
      yield delta;
    }
    if (chunk.choices[0]?.finish_reason) {
      logger.info('Stream completion finished', {
        finishReason: chunk.choices[0].finish_reason,
        totalLength: totalContent.length,
      });
    }
  }
}
