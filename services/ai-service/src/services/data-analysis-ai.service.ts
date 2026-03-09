import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

interface DataRow {
  [key: string]: unknown;
}

interface EvidenceItem {
  description: string;
  data: string;
}

interface DatasetAnalysisResponse {
  answer?: string;
  evidence?: EvidenceItem[];
  confidence?: number;
}

interface PatternItem {
  type?: string;
  description?: string;
  strength?: number;
  columns?: string[];
}

interface PatternDetectionResponse {
  patterns?: PatternItem[];
}

interface TrendNarrativeResponse {
  narrative?: string;
}

interface VisualizationItem {
  chartType?: string;
  title?: string;
  columns?: string[];
  reason?: string;
  priority?: number;
}

interface VisualizationResponse {
  visualizations?: VisualizationItem[];
}

interface QueryFilter {
  column: string;
  operator: string;
  value: unknown;
}

interface QueryAggregation {
  column: string;
  function: string;
  alias: string;
}

interface QueryOrderBy {
  column: string;
  direction: string;
}

interface StructuredQuery {
  filters: QueryFilter[];
  aggregations: QueryAggregation[];
  groupBy: string[];
  orderBy: QueryOrderBy[];
  limit: number | null;
}

interface NlQueryResponse {
  query?: StructuredQuery;
  explanation?: string;
  sqlEquivalent?: string;
}

interface NumericColumnStats {
  type: 'numeric';
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
}

interface CategoricalColumnStats {
  type: 'categorical';
  count: number;
  unique: number;
  topValues: string[];
}

type ColumnStats = NumericColumnStats | CategoricalColumnStats;

interface NumericColumnProfile {
  type: 'numeric';
  count: number;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  nullRate: number;
}

interface CategoricalColumnProfile {
  type: 'categorical';
  count: number;
  unique: number;
  topValues: Array<{ value: string; count: number }>;
  nullRate: number;
}

type ColumnProfile = NumericColumnProfile | CategoricalColumnProfile;

interface ColumnInfo {
  type: string;
  sampleValues: unknown[];
}

interface DatasetRecord {
  name?: string;
  description?: string;
}

interface DatasetRowRecord {
  data?: DataRow;
  row_data?: DataRow;
}

const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-service', module: 'data-analysis-ai' },
  transports: [new winston.transports.Console()],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

export async function analyzeDataset(
  datasetId: string,
  question: string,
  tenantId: string,
  userId: string
): Promise<{ answer: string; evidence: EvidenceItem[]; queryId: string; confidence: number }> {
  const queryId = uuidv4();
  const startTime = Date.now();
  logger.info('Analyzing dataset', { queryId, datasetId, tenantId, userId, question: question.substring(0, 100) });

  const dataset = await prisma.dataset.findFirst({
    where: { id: datasetId, tenantId },
  });
  if (!dataset) {
    throw new Error(`Dataset ${datasetId} not found for tenant ${tenantId}`);
  }

  const rows = await prisma.datasetRow.findMany({
    where: { datasetId },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  const fetchedRows = rows.map((r: DatasetRowRecord) => r.data || r.row_data || {});
  const columns = fetchedRows.length > 0 ? Object.keys(fetchedRows[0] || {}) : [];

  const columnStats: Record<string, ColumnStats> = {};
  for (const col of columns) {
    const values = fetchedRows.map((row: DataRow) => row[col]).filter((v: unknown) => v !== null && v !== undefined);
    const numericValues = values.filter((v: unknown) => typeof v === 'number' || !isNaN(Number(v))).map(Number);
    if (numericValues.length > values.length * 0.5) {
      const sorted = numericValues.sort((a: number, b: number) => a - b);
      columnStats[col] = {
        type: 'numeric',
        count: numericValues.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean: parseFloat((numericValues.reduce((a: number, b: number) => a + b, 0) / numericValues.length).toFixed(4)),
        median: sorted[Math.floor(sorted.length / 2)],
      };
    } else {
      const uniqueValues = [...new Set(values.map(String))];
      columnStats[col] = {
        type: 'categorical',
        count: values.length,
        unique: uniqueValues.length,
        topValues: uniqueValues.slice(0, 10),
      };
    }
  }

  const systemPrompt = `You are a data analyst. Answer the user's question based on the provided dataset schema, statistics, and sample data.
Be specific, cite numbers, and provide a confidence level.
Return a JSON object:
{
  "answer": "<detailed answer>",
  "evidence": [{"description": "<evidence point>", "data": "<supporting data>"}],
  "confidence": <0-1>
}
Return ONLY valid JSON.`;

  const dataContext = `Dataset: ${(dataset as DatasetRecord).name || datasetId}
Columns: ${columns.join(', ')}
Row count (sample): ${fetchedRows.length}
Column statistics: ${JSON.stringify(columnStats, null, 2)}
Sample rows (first 10): ${JSON.stringify(fetchedRows.slice(0, 10), null, 2).substring(0, 4000)}`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${dataContext}\n\nQuestion: ${question}` },
    ],
    temperature: 0.2,
    max_tokens: 2500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for dataset analysis');
  }

  const parsed: DatasetAnalysisResponse = JSON.parse(content);
  const durationMs = Date.now() - startTime;

  await prisma.aiQuery.create({
    data: {
      id: queryId,
      tenantId: tenantId,
      userId: userId,
      queryType: 'dataset_analysis',
      inputText: question.substring(0, 2000),
      outputText: String(parsed.answer || '').substring(0, 5000),
      model: DEFAULT_MODEL,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
      durationMs: durationMs,
      metadata: JSON.stringify({ datasetId }),
      status: 'COMPLETED',
      createdAt: new Date(),
    },
  });

  logger.info('Dataset analysis complete', { queryId, durationMs });
  return {
    answer: String(parsed.answer || ''),
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
    queryId,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
  };
}

export async function detectPatterns(
  datasetId: string,
  tenantId: string,
  userId: string
): Promise<{ patterns: Array<{ type: string; description: string; strength: number; columns: string[] }>; queryId: string }> {
  const queryId = uuidv4();
  const startTime = Date.now();
  logger.info('Detecting patterns', { queryId, datasetId, tenantId, userId });

  const dataset = await prisma.dataset.findFirst({
    where: { id: datasetId, tenantId: tenantId },
  });
  if (!dataset) {
    throw new Error(`Dataset ${datasetId} not found for tenant ${tenantId}`);
  }

  const rows = await prisma.datasetRow.findMany({
    where: { datasetId: datasetId },
    take: 200,
    orderBy: { createdAt: 'desc' },
  });

  const fetchedRows = rows.map((r: DatasetRowRecord) => r.data || r.row_data || {});
  const columns = fetchedRows.length > 0 ? Object.keys(fetchedRows[0] || {}) : [];

  const columnProfiles: Record<string, ColumnProfile> = {};
  for (const col of columns) {
    const values = fetchedRows.map((row: DataRow) => row[col]).filter((v: unknown) => v !== null && v !== undefined);
    const numericVals = values.filter((v: unknown) => !isNaN(Number(v))).map(Number);
    const nullRate = 1 - (values.length / fetchedRows.length);

    if (numericVals.length > values.length * 0.5 && numericVals.length > 1) {
      const mean = numericVals.reduce((a: number, b: number) => a + b, 0) / numericVals.length;
      const variance = numericVals.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / numericVals.length;
      columnProfiles[col] = {
        type: 'numeric', count: numericVals.length,
        min: Math.min(...numericVals), max: Math.max(...numericVals),
        mean: parseFloat(mean.toFixed(4)), stdDev: parseFloat(Math.sqrt(variance).toFixed(4)),
        nullRate: parseFloat(nullRate.toFixed(4)),
      };
    } else {
      const freq: Record<string, number> = {};
      values.forEach((v: unknown) => { const s = String(v); freq[s] = (freq[s] || 0) + 1; });
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      columnProfiles[col] = {
        type: 'categorical', count: values.length, unique: Object.keys(freq).length,
        topValues: sorted.slice(0, 5).map(([val, cnt]) => ({ value: val, count: cnt })),
        nullRate: parseFloat(nullRate.toFixed(4)),
      };
    }
  }

  const systemPrompt = `You are a data scientist specializing in pattern detection. Analyze the dataset profiles to identify patterns, correlations, anomalies, and trends.
Return a JSON object:
{
  "patterns": [
    {
      "type": "<correlation|trend|anomaly|distribution|cluster|seasonality|outlier>",
      "description": "<detailed description of the pattern>",
      "strength": <0-1>,
      "columns": ["<involved column names>"]
    }
  ]
}
Find at least 3 patterns. Be specific about numbers and thresholds. Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Dataset: ${(dataset as DatasetRecord).name || datasetId}\nColumn profiles:\n${JSON.stringify(columnProfiles, null, 2)}\nSample rows (first 20):\n${JSON.stringify(fetchedRows.slice(0, 20), null, 2).substring(0, 4000)}` },
    ],
    temperature: 0.3,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for pattern detection');
  }

  const parsed: PatternDetectionResponse = JSON.parse(content);
  const durationMs = Date.now() - startTime;

  await prisma.aiQuery.create({
    data: {
      id: queryId, tenantId: tenantId, userId: userId,
      queryType: 'pattern_detection',
      inputText: `Dataset: ${datasetId}`,
      outputText: content.substring(0, 5000),
      model: DEFAULT_MODEL,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
      durationMs: durationMs, status: 'COMPLETED', createdAt: new Date(),
    },
  });

  const patterns = Array.isArray(parsed.patterns)
    ? parsed.patterns.map((p: PatternItem) => ({
        type: String(p.type || 'unknown'),
        description: String(p.description || ''),
        strength: typeof p.strength === 'number' ? Math.min(1, Math.max(0, p.strength)) : 0.5,
        columns: Array.isArray(p.columns) ? p.columns.map(String) : [],
      }))
    : [];

  logger.info('Pattern detection complete', { queryId, patternCount: patterns.length, durationMs });
  return { patterns, queryId };
}

export async function predictTrend(
  datasetId: string,
  column: string,
  periods: number
): Promise<{ predictions: Array<{ period: number; value: number }>; trend: string; slope: number; intercept: number; narrative: string }> {
  logger.info('Predicting trend', { datasetId, column, periods });

  const rows = await prisma.datasetRow.findMany({
    where: { datasetId: datasetId },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });

  const fetchedRows = rows.map((r: DatasetRowRecord) => r.data || r.row_data || {});
  const values = fetchedRows
    .map((row: DataRow) => Number(row[column]))
    .filter((v: number) => !isNaN(v));

  if (values.length < 3) {
    throw new Error(`Insufficient numeric data in column "${column}" for trend prediction (found ${values.length}, need at least 3)`);
  }

  const n = values.length;
  const xValues = Array.from({ length: n }, (_, i) => i);
  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a: number, b: number) => a + b, 0);
  const sumXY = xValues.reduce((s, x, i) => s + x * values[i], 0);
  const sumXX = xValues.reduce((s, x) => s + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const safePeriods = Math.min(Math.max(1, periods), 100);
  const predictions: Array<{ period: number; value: number }> = [];
  for (let p = 1; p <= safePeriods; p++) {
    const futureX = n - 1 + p;
    const predictedValue = parseFloat((slope * futureX + intercept).toFixed(4));
    predictions.push({ period: p, value: predictedValue });
  }

  const trendDirection = slope > 0.01 ? 'upward' : slope < -0.01 ? 'downward' : 'stable';

  const recentValues = values.slice(-20);
  const systemPrompt = `You are a data analyst. Provide a narrative interpretation of the trend prediction.
Return a JSON object:
{
  "narrative": "<2-3 paragraph narrative about the trend, its implications, and confidence>"
}
Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Column: ${column}\nTrend: ${trendDirection}\nSlope: ${slope.toFixed(6)}\nIntercept: ${intercept.toFixed(4)}\nRecent values: ${JSON.stringify(recentValues)}\nData points: ${n}\nPredicted next ${safePeriods} periods: ${JSON.stringify(predictions)}` },
    ],
    temperature: 0.4,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  const parsed: TrendNarrativeResponse = content ? JSON.parse(content) : { narrative: `The column "${column}" shows a ${trendDirection} trend with a slope of ${slope.toFixed(4)}.` };

  logger.info('Trend prediction complete', { column, trendDirection, slope: slope.toFixed(6), predictions: predictions.length });

  return {
    predictions,
    trend: trendDirection,
    slope: parseFloat(slope.toFixed(6)),
    intercept: parseFloat(intercept.toFixed(4)),
    narrative: String(parsed.narrative || ''),
  };
}

export async function suggestVisualizations(
  datasetId: string
): Promise<Array<{ chartType: string; title: string; columns: string[]; reason: string; priority: number }>> {
  logger.info('Suggesting visualizations', { datasetId });

  const dataset = await prisma.dataset.findFirst({ where: { id: datasetId } });
  if (!dataset) {
    throw new Error(`Dataset ${datasetId} not found`);
  }

  const rows = await prisma.datasetRow.findMany({
    where: { datasetId: datasetId },
    take: 50,
  });

  const fetchedRows = rows.map((r: DatasetRowRecord) => r.data || r.row_data || {});
  const columns = fetchedRows.length > 0 ? Object.keys(fetchedRows[0] || {}) : [];

  const columnTypes: Record<string, string> = {};
  for (const col of columns) {
    const values = fetchedRows.map((row: DataRow) => row[col]).filter((v: unknown) => v !== null && v !== undefined);
    const numericCount = values.filter((v: unknown) => !isNaN(Number(v))).length;
    const dateCount = values.filter((v: unknown) => !isNaN(Date.parse(String(v)))).length;

    if (dateCount > values.length * 0.7) columnTypes[col] = 'date';
    else if (numericCount > values.length * 0.7) columnTypes[col] = 'numeric';
    else {
      const unique = new Set(values.map(String)).size;
      columnTypes[col] = unique <= 20 ? 'categorical' : 'text';
    }
  }

  const systemPrompt = `You are a data visualization expert. Based on the dataset schema and column types, suggest the best visualizations.
Return a JSON object:
{
  "visualizations": [
    {
      "chartType": "<bar|line|scatter|pie|heatmap|histogram|box|area|treemap|bubble>",
      "title": "<descriptive chart title>",
      "columns": ["<column names to use>"],
      "reason": "<why this visualization is useful>",
      "priority": <1-10, higher is more important>
    }
  ]
}
Suggest 3-8 visualizations ordered by priority. Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Dataset: ${(dataset as DatasetRecord).name || datasetId}\nColumns and types: ${JSON.stringify(columnTypes, null, 2)}\nSample (3 rows): ${JSON.stringify(fetchedRows.slice(0, 3), null, 2)}` },
    ],
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for visualization suggestions');
  }

  const parsed: VisualizationResponse = JSON.parse(content);
  const visualizations = Array.isArray(parsed.visualizations)
    ? parsed.visualizations.map((v: VisualizationItem) => ({
        chartType: String(v.chartType || 'bar'),
        title: String(v.title || ''),
        columns: Array.isArray(v.columns) ? v.columns.map(String) : [],
        reason: String(v.reason || ''),
        priority: typeof v.priority === 'number' ? v.priority : 5,
      }))
    : [];

  logger.info('Visualization suggestions complete', { count: visualizations.length });
  return visualizations;
}

export async function naturalLanguageToQuery(
  nl: string,
  datasetId: string
): Promise<{ query: StructuredQuery; explanation: string; sqlEquivalent: string }> {
  logger.info('Converting NL to query', { datasetId, nl: nl.substring(0, 100) });

  const dataset = await prisma.dataset.findFirst({ where: { id: datasetId } });
  if (!dataset) {
    throw new Error(`Dataset ${datasetId} not found`);
  }

  const rows = await prisma.datasetRow.findMany({
    where: { datasetId: datasetId },
    take: 10,
  });

  const fetchedRows = rows.map((r: DatasetRowRecord) => r.data || r.row_data || {});
  const columns = fetchedRows.length > 0 ? Object.keys(fetchedRows[0] || {}) : [];

  const columnInfo: Record<string, ColumnInfo> = {};
  for (const col of columns) {
    const values = fetchedRows.map((row: DataRow) => row[col]).filter((v: unknown) => v !== null);
    const numericCount = values.filter((v: unknown) => !isNaN(Number(v))).length;
    columnInfo[col] = {
      type: numericCount > values.length * 0.7 ? 'numeric' : 'string',
      sampleValues: values.slice(0, 5),
    };
  }

  const systemPrompt = `You are a query translator. Convert the natural language query into a structured filter/aggregate query.
Available columns and their types: ${JSON.stringify(columnInfo, null, 2)}

Return a JSON object:
{
  "query": {
    "filters": [{"column": "<col>", "operator": "<eq|ne|gt|gte|lt|lte|contains|in|between>", "value": "<value or [values]>"}],
    "aggregations": [{"column": "<col>", "function": "<sum|avg|count|min|max|distinct>", "alias": "<name>"}],
    "groupBy": ["<column>"],
    "orderBy": [{"column": "<col>", "direction": "<asc|desc>"}],
    "limit": <number or null>
  },
  "explanation": "<human-readable explanation of the query>",
  "sqlEquivalent": "<SQL equivalent for reference>"
}
Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Natural language query: "${nl}"` },
    ],
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for NL to query conversion');
  }

  const parsed: NlQueryResponse = JSON.parse(content);

  logger.info('NL to query conversion complete', { filterCount: parsed.query?.filters?.length || 0 });

  return {
    query: parsed.query || { filters: [], aggregations: [], groupBy: [], orderBy: [], limit: null },
    explanation: String(parsed.explanation || ''),
    sqlEquivalent: String(parsed.sqlEquivalent || ''),
  };
}
