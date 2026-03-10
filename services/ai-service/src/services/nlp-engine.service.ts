import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

interface RawEntityItem {
  text?: string;
  type?: string;
  startIndex?: number;
  endIndex?: number;
  confidence?: number;
}

interface RawSentimentAspect {
  aspect?: string;
  sentiment?: string;
  score?: number;
}

interface RawKeywordItem {
  keyword?: string;
  relevance?: number;
  frequency?: number;
  category?: string;
}

interface RawClassificationItem {
  category?: string;
  confidence?: number;
  explanation?: string;
}

interface RawLanguageAlternate {
  code?: string;
  name?: string;
  confidence?: number;
}

const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-service', module: 'nlp-engine' },
  transports: [new winston.transports.Console()],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
});

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

export interface NlpAnalysisResult {
  sentiment: { score: number; label: string; explanation: string };
  entities: Array<{ text: string; type: string; confidence: number }>;
  keywords: Array<{ word: string; relevance: number }>;
  summary: string;
  language: { code: string; name: string; confidence: number };
  topics: Array<{ topic: string; relevance: number }>;
}

export interface EntityResult {
  text: string;
  type: 'person' | 'organization' | 'location' | 'date' | 'amount' | 'other';
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface SentimentResult {
  score: number;
  label: 'positive' | 'negative' | 'neutral' | 'mixed';
  explanation: string;
  aspects: Array<{ aspect: string; sentiment: string; score: number }>;
}

export interface KeywordResult {
  keyword: string;
  relevance: number;
  frequency: number;
  category: string;
}

export async function analyzeText(
  text: string,
  tenantId: string,
  userId: string
): Promise<NlpAnalysisResult> {
  const queryId = uuidv4();
  const startTime = Date.now();
  logger.info('Starting full NLP analysis', { queryId, tenantId, userId, textLength: text.length });

  const truncatedText = text.length > 12000 ? text.substring(0, 12000) + '...[truncated]' : text;

  const systemPrompt = `You are an advanced NLP analysis engine. Analyze the given text and return a JSON object with the following structure:
{
  "sentiment": { "score": <number -1 to 1>, "label": "<positive|negative|neutral|mixed>", "explanation": "<string>" },
  "entities": [{ "text": "<string>", "type": "<person|organization|location|date|amount|other>", "confidence": <0-1> }],
  "keywords": [{ "word": "<string>", "relevance": <0-1> }],
  "summary": "<concise summary in 2-3 sentences>",
  "language": { "code": "<ISO 639-1>", "name": "<full language name>", "confidence": <0-1> },
  "topics": [{ "topic": "<string>", "relevance": <0-1> }]
}
Return ONLY valid JSON, no markdown fences.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyze the following text:\n\n${truncatedText}` },
    ],
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for NLP analysis');
  }

  const result: NlpAnalysisResult = JSON.parse(content);
  const durationMs = Date.now() - startTime;
  const tokensUsed = response.usage?.total_tokens || 0;
  const promptTokens = response.usage?.prompt_tokens || 0;
  const completionTokens = response.usage?.completion_tokens || 0;

  logger.info('NLP analysis complete', { queryId, durationMs, tokensUsed });

  await prisma.aiQuery.create({
    data: {
      id: queryId,
      tenantId: tenantId,
      userId: userId,
      queryType: 'nlp_analysis',
      inputText: truncatedText.substring(0, 2000),
      outputText: content.substring(0, 5000),
      model: DEFAULT_MODEL,
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      totalTokens: tokensUsed,
      durationMs: durationMs,
      status: 'COMPLETED',
      createdAt: new Date(),
    },
  });

  return result;
}

export async function extractEntities(text: string): Promise<EntityResult[]> {
  logger.info('Extracting entities', { textLength: text.length });

  const truncatedText = text.length > 10000 ? text.substring(0, 10000) + '...[truncated]' : text;

  const systemPrompt = `You are a Named Entity Recognition (NER) engine. Extract all entities from the text.
Return a JSON object with key "entities" containing an array of objects:
{
  "entities": [
    { "text": "<entity text>", "type": "<person|organization|location|date|amount|other>", "startIndex": <number>, "endIndex": <number>, "confidence": <0-1> }
  ]
}
Types: person (people names), organization (companies, institutions), location (places, addresses), date (dates, times, periods), amount (monetary values, quantities, percentages).
Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: truncatedText },
    ],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for entity extraction');
  }

  const parsed = JSON.parse(content);
  const entities: EntityResult[] = Array.isArray(parsed.entities)
    ? parsed.entities.map((e: RawEntityItem) => ({
        text: String(e.text || ''),
        type: ['person', 'organization', 'location', 'date', 'amount'].includes(e.type)
          ? e.type
          : 'other',
        startIndex: typeof e.startIndex === 'number' ? e.startIndex : 0,
        endIndex: typeof e.endIndex === 'number' ? e.endIndex : 0,
        confidence: typeof e.confidence === 'number' ? Math.min(1, Math.max(0, e.confidence)) : 0.5,
      }))
    : [];

  logger.info('Entity extraction complete', { entityCount: entities.length });
  return entities;
}

export async function analyzeSentiment(text: string): Promise<SentimentResult> {
  logger.info('Analyzing sentiment', { textLength: text.length });

  const truncatedText = text.length > 8000 ? text.substring(0, 8000) + '...[truncated]' : text;

  const systemPrompt = `You are a sentiment analysis engine. Analyze the sentiment of the given text.
Return a JSON object:
{
  "score": <number from -1 (very negative) to 1 (very positive)>,
  "label": "<positive|negative|neutral|mixed>",
  "explanation": "<why this sentiment was detected>",
  "aspects": [{ "aspect": "<topic/aspect>", "sentiment": "<positive|negative|neutral>", "score": <-1 to 1> }]
}
Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: truncatedText },
    ],
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for sentiment analysis');
  }

  const parsed = JSON.parse(content);
  const result: SentimentResult = {
    score: typeof parsed.score === 'number' ? Math.min(1, Math.max(-1, parsed.score)) : 0,
    label: ['positive', 'negative', 'neutral', 'mixed'].includes(parsed.label) ? parsed.label : 'neutral',
    explanation: String(parsed.explanation || 'No explanation provided'),
    aspects: Array.isArray(parsed.aspects)
      ? parsed.aspects.map((a: RawSentimentAspect) => ({
          aspect: String(a.aspect || ''),
          sentiment: String(a.sentiment || 'neutral'),
          score: typeof a.score === 'number' ? Math.min(1, Math.max(-1, a.score)) : 0,
        }))
      : [],
  };

  logger.info('Sentiment analysis complete', { label: result.label, score: result.score });
  return result;
}

export async function extractKeywords(text: string, count: number = 10): Promise<KeywordResult[]> {
  logger.info('Extracting keywords', { textLength: text.length, count });

  const truncatedText = text.length > 10000 ? text.substring(0, 10000) + '...[truncated]' : text;
  const safeCount = Math.min(Math.max(1, count), 50);

  const systemPrompt = `You are a keyword extraction engine. Extract the top ${safeCount} keywords from the text.
Return a JSON object:
{
  "keywords": [
    { "keyword": "<word or phrase>", "relevance": <0-1>, "frequency": <estimated count in text>, "category": "<noun|verb|adjective|phrase|technical|other>" }
  ]
}
Order by relevance descending. Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: truncatedText },
    ],
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for keyword extraction');
  }

  const parsed = JSON.parse(content);
  const keywords: KeywordResult[] = Array.isArray(parsed.keywords)
    ? parsed.keywords.slice(0, safeCount).map((k: RawKeywordItem) => ({
        keyword: String(k.keyword || ''),
        relevance: typeof k.relevance === 'number' ? Math.min(1, Math.max(0, k.relevance)) : 0.5,
        frequency: typeof k.frequency === 'number' ? k.frequency : 1,
        category: String(k.category || 'other'),
      }))
    : [];

  logger.info('Keyword extraction complete', { keywordCount: keywords.length });
  return keywords;
}

export async function summarizeText(
  text: string,
  maxLength: number = 500,
  style: 'extractive' | 'abstractive' = 'abstractive'
): Promise<{ summary: string; originalLength: number; summaryLength: number; compressionRatio: number }> {
  logger.info('Summarizing text', { textLength: text.length, maxLength, style });

  const truncatedText = text.length > 15000 ? text.substring(0, 15000) + '...[truncated]' : text;
  const safeMaxLength = Math.min(Math.max(50, maxLength), 5000);

  const styleInstruction = style === 'extractive'
    ? 'Use an EXTRACTIVE approach: select and combine the most important sentences directly from the text. Preserve original wording as much as possible.'
    : 'Use an ABSTRACTIVE approach: rephrase and condense the content in your own words while preserving all key information and meaning.';

  const systemPrompt = `You are a text summarization engine.
${styleInstruction}
The summary MUST be at most ${safeMaxLength} characters long.
Return a JSON object:
{
  "summary": "<the summary text>"
}
Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Summarize the following text:\n\n${truncatedText}` },
    ],
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for summarization');
  }

  const parsed = JSON.parse(content);
  const summary = String(parsed.summary || '').substring(0, safeMaxLength);
  const compressionRatio = text.length > 0 ? parseFloat((summary.length / text.length).toFixed(4)) : 0;

  logger.info('Summarization complete', {
    originalLength: text.length,
    summaryLength: summary.length,
    compressionRatio,
  });

  return {
    summary,
    originalLength: text.length,
    summaryLength: summary.length,
    compressionRatio,
  };
}

export async function classifyText(
  text: string,
  categories: string[]
): Promise<Array<{ category: string; confidence: number; explanation: string }>> {
  logger.info('Classifying text', { textLength: text.length, categoryCount: categories.length });

  if (!categories || categories.length === 0) {
    throw new Error('At least one category must be provided for classification');
  }

  const truncatedText = text.length > 8000 ? text.substring(0, 8000) + '...[truncated]' : text;
  const categoryList = categories.slice(0, 50).map((c) => c.trim()).filter(Boolean);

  const systemPrompt = `You are a text classification engine. Classify the given text into the provided categories.
Categories: ${JSON.stringify(categoryList)}
Return a JSON object:
{
  "classifications": [
    { "category": "<category name>", "confidence": <0-1>, "explanation": "<brief reason>" }
  ]
}
Include ALL provided categories with their confidence scores. Scores should sum approximately to 1.
Order by confidence descending. Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: truncatedText },
    ],
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for classification');
  }

  const parsed = JSON.parse(content);
  const classifications = Array.isArray(parsed.classifications)
    ? parsed.classifications.map((c: RawClassificationItem) => ({
        category: String(c.category || 'unknown'),
        confidence: typeof c.confidence === 'number' ? Math.min(1, Math.max(0, c.confidence)) : 0,
        explanation: String(c.explanation || ''),
      }))
    : categoryList.map((cat) => ({ category: cat, confidence: 0, explanation: 'Classification failed' }));

  logger.info('Classification complete', { topCategory: classifications[0]?.category });
  return classifications;
}

export async function detectLanguage(
  text: string
): Promise<{ code: string; name: string; confidence: number; alternates: Array<{ code: string; name: string; confidence: number }> }> {
  logger.info('Detecting language', { textLength: text.length });

  const sampleText = text.substring(0, 3000);

  const systemPrompt = `You are a language detection engine. Detect the language of the given text.
Return a JSON object:
{
  "code": "<ISO 639-1 two-letter code>",
  "name": "<full language name in English>",
  "confidence": <0-1>,
  "alternates": [{ "code": "<ISO 639-1>", "name": "<language name>", "confidence": <0-1> }]
}
Include up to 3 alternate language possibilities if the text is ambiguous.
Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: sampleText },
    ],
    temperature: 0.0,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for language detection');
  }

  const parsed = JSON.parse(content);
  const result = {
    code: String(parsed.code || 'en'),
    name: String(parsed.name || 'English'),
    confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
    alternates: Array.isArray(parsed.alternates)
      ? parsed.alternates.map((a: RawLanguageAlternate) => ({
          code: String(a.code || ''),
          name: String(a.name || ''),
          confidence: typeof a.confidence === 'number' ? Math.min(1, Math.max(0, a.confidence)) : 0,
        }))
      : [],
  };

  logger.info('Language detection complete', { language: result.name, code: result.code });
  return result;
}
