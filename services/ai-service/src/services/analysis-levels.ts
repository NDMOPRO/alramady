import OpenAI from 'openai';
import { z } from 'zod';
import { Queue } from 'bullmq';
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

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  level: z.enum(['descriptive', 'diagnostic', 'predictive', 'prescriptive']),
  datasetId: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
});

const RunAnalysisSchema = z.object({
  datasetId: z.string().uuid(),
  level: z.enum(['descriptive', 'diagnostic', 'predictive', 'prescriptive']),
  columns: z.array(z.string()).optional(),
  question: z.string().optional(),
  periods: z.number().int().min(1).max(100).optional().default(12),
});

// ─── Interfaces ───────────────────────────────────────────────────────

interface AnalysisLevel {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  capabilities: string[];
  requiredDataPoints: number;
}

interface DescriptiveResult {
  summary: string;
  statistics: Record<string, ColumnStatistics>;
  distributions: Record<string, DistributionInfo>;
  topInsights: string[];
}

interface DiagnosticResult {
  rootCauses: Array<{ cause: string; evidence: string; confidence: number }>;
  correlations: Array<{ column1: string; column2: string; coefficient: number; interpretation: string }>;
  anomalies: Array<{ column: string; value: string; reason: string; severity: string }>;
  deviationAnalysis: string;
}

interface PredictiveResult {
  predictions: Array<{ column: string; period: number; value: number; lowerBound: number; upperBound: number }>;
  trend: string;
  seasonality: string;
  confidence: number;
  narrative: string;
}

interface PrescriptiveResult {
  recommendations: Array<{ title: string; description: string; priority: string; impact: string; effort: string }>;
  scenarios: Array<{ name: string; description: string; outcome: string; probability: number }>;
  actionPlan: string;
  riskAssessment: string;
}

interface ColumnStatistics {
  count: number;
  nullCount: number;
  type: string;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  uniqueCount: number;
  topValues: Array<{ value: string; count: number }>;
}

interface DistributionInfo {
  type: string;
  skewness: string;
  bins: Array<{ range: string; count: number }>;
}

// ─── OpenAI Client ────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ─── BullMQ Queue for Heavy Analysis ─────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const analysisQueue = new Queue('analysis-levels', {
  connection: { url: REDIS_URL },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  },
});

// ─── CRUD Functions ───────────────────────────────────────────────────

export async function list(params: Record<string, unknown>) {
  const validated = ListParamsSchema.parse(params);
  const skip = (validated.page - 1) * validated.limit;

  const where: Record<string, unknown> = {};
  if (validated.search) {
    where.OR = [
      { name: { contains: validated.search, mode: 'insensitive' } },
      { level: { contains: validated.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.analysisResult.findMany({
      where,
      skip,
      take: validated.limit,
      orderBy: { [validated.sortBy]: validated.sortOrder },
    }),
    prisma.analysisResult.count({ where }),
  ]);

  return { data, total, page: validated.page, limit: validated.limit };
}

export async function getById(id: string) {
  const validId = z.string().uuid().parse(id);

  const cached = await cacheGet<Record<string, unknown>>(`analysis-result:${validId}`);
  if (cached) return cached;

  const record = await prisma.analysisResult.findUniqueOrThrow({ where: { id: validId } });
  await cacheSet(`analysis-result:${validId}`, record, 600);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const validated = CreateSchema.parse(data);
  const id = uuidv4();

  const record = await prisma.analysisResult.create({
    data: {
      id,
      name: validated.name,
      level: validated.level,
      datasetId: validated.datasetId || null,
      status: 'pending',
      result: undefined,
      createdBy: validated.createdBy || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const validId = z.string().uuid().parse(id);
  const validated = UpdateSchema.parse(data);

  const record = await prisma.analysisResult.update({
    where: { id: validId },
    data: { ...validated, updatedAt: new Date() },
  });

  await cacheDel(`analysis-result:${validId}`);
  return record;
}

export async function remove(id: string) {
  const validId = z.string().uuid().parse(id);
  await prisma.analysisResult.delete({ where: { id: validId } });
  await cacheDel(`analysis-result:${validId}`);
  return { deleted: true, id: validId };
}

// ─── Get Analysis Levels ──────────────────────────────────────────────

export async function getLevels(): Promise<AnalysisLevel[]> {
  const cached = await cacheGet<AnalysisLevel[]>('analysis-levels:definitions');
  if (cached) return cached;

  const levels: AnalysisLevel[] = [
    {
      id: 'descriptive',
      nameAr: 'تحليل وصفي',
      nameEn: 'Descriptive Analysis',
      descriptionAr: 'ماذا حدث؟ - ملخص شامل للبيانات مع إحصائيات رئيسية وتوزيعات وأنماط مرئية',
      descriptionEn: 'What happened? - Comprehensive data summary with key statistics, distributions, and visual patterns',
      capabilities: ['summary_statistics', 'distributions', 'data_profiling', 'pattern_detection', 'visualization_suggestions'],
      requiredDataPoints: 10,
    },
    {
      id: 'diagnostic',
      nameAr: 'تحليل تشخيصي',
      nameEn: 'Diagnostic Analysis',
      descriptionAr: 'لماذا حدث؟ - كشف الأسباب الجذرية والعلاقات والشذوذات وتحليل الانحرافات',
      descriptionEn: 'Why did it happen? - Root cause discovery, correlations, anomalies, and deviation analysis',
      capabilities: ['root_cause_analysis', 'correlation_detection', 'anomaly_detection', 'deviation_analysis', 'comparative_analysis'],
      requiredDataPoints: 30,
    },
    {
      id: 'predictive',
      nameAr: 'تحليل تنبؤي',
      nameEn: 'Predictive Analysis',
      descriptionAr: 'ماذا سيحدث؟ - تنبؤات مستقبلية واتجاهات وموسمية بناءً على البيانات التاريخية',
      descriptionEn: 'What will happen? - Future predictions, trends, and seasonality based on historical data',
      capabilities: ['trend_prediction', 'time_series_forecast', 'seasonality_detection', 'confidence_intervals', 'what_if_scenarios'],
      requiredDataPoints: 50,
    },
    {
      id: 'prescriptive',
      nameAr: 'تحليل توجيهي',
      nameEn: 'Prescriptive Analysis',
      descriptionAr: 'ماذا يجب أن نفعل؟ - توصيات استراتيجية وسيناريوهات وخطط عمل مبنية على التحليل',
      descriptionEn: 'What should we do? - Strategic recommendations, scenarios, and action plans based on analysis',
      capabilities: ['recommendations', 'scenario_modeling', 'action_planning', 'risk_assessment', 'optimization_suggestions'],
      requiredDataPoints: 50,
    },
  ];

  await cacheSet('analysis-levels:definitions', levels, 3600);
  return levels;
}

// ─── Run Analysis ─────────────────────────────────────────────────────

export async function runAnalysis(
  body: Record<string, unknown>,
  userId: string | undefined,
): Promise<{ id: string; level: string; status: string; result?: unknown }> {
  const validated = RunAnalysisSchema.parse(body);
  const analysisId = uuidv4();
  const safeUserId = userId || '';

  logger.info('Running analysis', { analysisId, level: validated.level, datasetId: validated.datasetId });

  // Fetch dataset
  const dataset = await prisma.dataset.findFirst({ where: { id: validated.datasetId } });
  if (!dataset) {
    throw new Error(`Dataset ${validated.datasetId} not found`);
  }

  const rows = await prisma.datasetRow.findMany({
    where: { datasetId: validated.datasetId },
    take: 500,
    orderBy: { createdAt: 'asc' },
  });

  const fetchedRows = rows.map((r: { data: unknown }) => r.data as Record<string, unknown>);
  if (fetchedRows.length < 3) {
    throw new Error('Insufficient data for analysis. At least 3 rows required.');
  }

  const columns = Object.keys(fetchedRows[0] || {});
  const targetColumns = validated.columns && validated.columns.length > 0
    ? validated.columns.filter((c) => columns.includes(c))
    : columns;

  // For predictive/prescriptive, use BullMQ (heavy ops > 2s)
  if (validated.level === 'predictive' || validated.level === 'prescriptive') {
    await prisma.analysisResult.create({
      data: {
        id: analysisId,
        name: `${validated.level} analysis`,
        level: validated.level,
        datasetId: validated.datasetId,
        status: 'processing',
        result: undefined,
        createdBy: safeUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await analysisQueue.add(`run-${validated.level}`, {
      analysisId,
      datasetId: validated.datasetId,
      level: validated.level,
      columns: targetColumns,
      periods: validated.periods,
      question: validated.question,
      userId: safeUserId,
      fetchedRows: fetchedRows.slice(0, 200),
    });

    logger.info('Analysis queued', { analysisId, level: validated.level });
    return { id: analysisId, level: validated.level, status: 'processing' };
  }

  // For descriptive/diagnostic, run inline
  let result: unknown;
  if (validated.level === 'descriptive') {
    result = await runDescriptiveAnalysis(fetchedRows, targetColumns, validated.question);
  } else {
    result = await runDiagnosticAnalysis(fetchedRows, targetColumns, validated.question);
  }

  await prisma.analysisResult.create({
    data: {
      id: analysisId,
      name: `${validated.level} analysis`,
      level: validated.level,
      datasetId: validated.datasetId,
      status: 'completed',
      result: JSON.stringify(result),
      createdBy: safeUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info('Analysis completed inline', { analysisId, level: validated.level });
  return { id: analysisId, level: validated.level, status: 'completed', result };
}

// ─── Get Results ──────────────────────────────────────────────────────

export async function getResults(id: string) {
  const validId = z.string().uuid().parse(id);

  const record = await prisma.analysisResult.findUniqueOrThrow({ where: { id: validId } });
  const typed = record as Record<string, unknown>;

  let parsedResult: unknown = null;
  if (typed.result && typeof typed.result === 'string') {
    try {
      parsedResult = JSON.parse(typed.result as string);
    } catch {
      parsedResult = typed.result;
    }
  } else {
    parsedResult = typed.result;
  }

  return {
    id: typed.id,
    name: typed.name,
    level: typed.level,
    datasetId: typed.datasetId,
    status: typed.status,
    result: parsedResult,
    createdAt: typed.createdAt,
    updatedAt: typed.updatedAt,
  };
}

// ─── Descriptive Analysis ─────────────────────────────────────────────

async function runDescriptiveAnalysis(
  rows: Record<string, unknown>[],
  columns: string[],
  question?: string,
): Promise<DescriptiveResult> {
  const startTime = Date.now();

  // Compute real statistics locally
  const statistics: Record<string, ColumnStatistics> = {};
  for (const col of columns) {
    const values = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
    const numericValues = values.filter((v) => !isNaN(Number(v))).map(Number);
    const stringValues = values.map(String);
    const uniqueValues = [...new Set(stringValues)];

    const freq: Record<string, number> = {};
    for (const sv of stringValues) {
      freq[sv] = (freq[sv] || 0) + 1;
    }
    const topValues = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({ value, count }));

    const isNumeric = numericValues.length > values.length * 0.5;
    let min: number | null = null;
    let max: number | null = null;
    let mean: number | null = null;
    let median: number | null = null;
    let stdDev: number | null = null;

    if (isNumeric && numericValues.length > 0) {
      const sorted = [...numericValues].sort((a, b) => a - b);
      min = sorted[0];
      max = sorted[sorted.length - 1];
      mean = parseFloat((numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(4));
      median = sorted[Math.floor(sorted.length / 2)];
      const variance = numericValues.reduce((s, v) => s + (v - mean!) ** 2, 0) / numericValues.length;
      stdDev = parseFloat(Math.sqrt(variance).toFixed(4));
    }

    statistics[col] = {
      count: values.length,
      nullCount: rows.length - values.length,
      type: isNumeric ? 'numeric' : 'categorical',
      min,
      max,
      mean,
      median,
      stdDev,
      uniqueCount: uniqueValues.length,
      topValues,
    };
  }

  // Use AI for summary and insights
  const statsPreview = JSON.stringify(statistics, null, 2).substring(0, 4000);
  const sampleData = JSON.stringify(rows.slice(0, 10), null, 2).substring(0, 3000);

  const systemPrompt = `You are a data analyst performing descriptive analysis. Based on the statistics and sample data, provide:
1. A comprehensive summary (2-4 paragraphs) describing the data
2. Distribution characteristics for each column
3. Top insights discovered

Return a JSON object:
{
  "summary": "<comprehensive descriptive summary>",
  "distributions": {
    "<column>": { "type": "<normal|skewed_left|skewed_right|uniform|bimodal|categorical>", "skewness": "<description>", "bins": [{"range": "<range>", "count": <n>}] }
  },
  "topInsights": ["<insight1>", "<insight2>", ...]
}
Return ONLY valid JSON.`;

  const userContent = question
    ? `Statistics:\n${statsPreview}\n\nSample data:\n${sampleData}\n\nSpecific focus: ${question}`
    : `Statistics:\n${statsPreview}\n\nSample data:\n${sampleData}`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned empty response for descriptive analysis');

  const parsed = JSON.parse(raw);
  const durationMs = Date.now() - startTime;

  logger.info('Descriptive analysis complete', { durationMs, columnCount: columns.length });

  return {
    summary: String(parsed.summary || ''),
    statistics,
    distributions: parsed.distributions || {},
    topInsights: Array.isArray(parsed.topInsights) ? parsed.topInsights.map(String) : [],
  };
}

// ─── Diagnostic Analysis ──────────────────────────────────────────────

async function runDiagnosticAnalysis(
  rows: Record<string, unknown>[],
  columns: string[],
  question?: string,
): Promise<DiagnosticResult> {
  const startTime = Date.now();

  // Compute correlations locally for numeric columns
  const numericColumns = columns.filter((col) => {
    const values = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
    const numericCount = values.filter((v) => !isNaN(Number(v))).length;
    return numericCount > values.length * 0.5;
  });

  const localCorrelations: Array<{ column1: string; column2: string; coefficient: number }> = [];
  for (let i = 0; i < numericColumns.length; i++) {
    for (let j = i + 1; j < numericColumns.length; j++) {
      const col1 = numericColumns[i];
      const col2 = numericColumns[j];
      const pairs = rows
        .map((r) => [Number(r[col1]), Number(r[col2])])
        .filter(([a, b]) => !isNaN(a) && !isNaN(b));

      if (pairs.length < 5) continue;

      const n = pairs.length;
      const sumX = pairs.reduce((s, [x]) => s + x, 0);
      const sumY = pairs.reduce((s, [, y]) => s + y, 0);
      const sumXY = pairs.reduce((s, [x, y]) => s + x * y, 0);
      const sumX2 = pairs.reduce((s, [x]) => s + x * x, 0);
      const sumY2 = pairs.reduce((s, [, y]) => s + y * y, 0);

      const numerator = n * sumXY - sumX * sumY;
      const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
      const correlation = denominator === 0 ? 0 : numerator / denominator;

      if (Math.abs(correlation) > 0.3) {
        localCorrelations.push({
          column1: col1,
          column2: col2,
          coefficient: parseFloat(correlation.toFixed(4)),
        });
      }
    }
  }

  const statsPreview = JSON.stringify(
    Object.fromEntries(
      columns.map((col) => {
        const values = rows.map((r) => r[col]).filter((v) => v !== null);
        return [col, { count: values.length, sample: values.slice(0, 5) }];
      }),
    ),
  ).substring(0, 3000);

  const correlationsPreview = JSON.stringify(localCorrelations).substring(0, 2000);
  const sampleData = JSON.stringify(rows.slice(0, 15), null, 2).substring(0, 3000);

  const systemPrompt = `You are a data diagnostician. Analyze the data to identify root causes, correlations, anomalies, and deviations.

Return a JSON object:
{
  "rootCauses": [
    { "cause": "<description>", "evidence": "<supporting data>", "confidence": <0-1> }
  ],
  "correlations": [
    { "column1": "<col>", "column2": "<col>", "coefficient": <-1 to 1>, "interpretation": "<what this means>" }
  ],
  "anomalies": [
    { "column": "<col>", "value": "<anomalous value>", "reason": "<why anomalous>", "severity": "<high|medium|low>" }
  ],
  "deviationAnalysis": "<paragraph analyzing key deviations from expected patterns>"
}
Return ONLY valid JSON.`;

  const userContent = question
    ? `Column stats:\n${statsPreview}\n\nComputed correlations:\n${correlationsPreview}\n\nSample:\n${sampleData}\n\nFocus: ${question}`
    : `Column stats:\n${statsPreview}\n\nComputed correlations:\n${correlationsPreview}\n\nSample:\n${sampleData}`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned empty response for diagnostic analysis');

  const parsed = JSON.parse(raw);
  const durationMs = Date.now() - startTime;

  logger.info('Diagnostic analysis complete', { durationMs });

  return {
    rootCauses: Array.isArray(parsed.rootCauses)
      ? parsed.rootCauses.map((r: Record<string, unknown>) => ({
          cause: String(r.cause || ''),
          evidence: String(r.evidence || ''),
          confidence: typeof r.confidence === 'number' ? r.confidence : 0.5,
        }))
      : [],
    correlations: Array.isArray(parsed.correlations)
      ? parsed.correlations.map((c: Record<string, unknown>) => ({
          column1: String(c.column1 || ''),
          column2: String(c.column2 || ''),
          coefficient: typeof c.coefficient === 'number' ? c.coefficient : 0,
          interpretation: String(c.interpretation || ''),
        }))
      : [],
    anomalies: Array.isArray(parsed.anomalies)
      ? parsed.anomalies.map((a: Record<string, unknown>) => ({
          column: String(a.column || ''),
          value: String(a.value || ''),
          reason: String(a.reason || ''),
          severity: String(a.severity || 'medium'),
        }))
      : [],
    deviationAnalysis: String(parsed.deviationAnalysis || ''),
  };
}

// ─── Predictive Analysis (called from BullMQ worker) ──────────────────

export async function runPredictiveAnalysis(
  rows: Record<string, unknown>[],
  columns: string[],
  periods: number,
  question?: string,
): Promise<PredictiveResult> {
  const startTime = Date.now();

  // Local linear regression for each numeric column
  const numericColumns = columns.filter((col) => {
    const values = rows.map((r) => r[col]).filter((v) => !isNaN(Number(v)));
    return values.length > 5;
  });

  const localPredictions: Array<{ column: string; period: number; value: number; lowerBound: number; upperBound: number }> = [];

  for (const col of numericColumns.slice(0, 5)) {
    const values = rows.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    const n = values.length;
    const xValues = Array.from({ length: n }, (_, i) => i);
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((s, x, i) => s + x * values[i], 0);
    const sumXX = xValues.reduce((s, x) => s + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const residuals = values.map((v, i) => v - (slope * i + intercept));
    const residualStd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);

    for (let p = 1; p <= Math.min(periods, 24); p++) {
      const futureX = n - 1 + p;
      const predicted = parseFloat((slope * futureX + intercept).toFixed(4));
      const margin = parseFloat((1.96 * residualStd * Math.sqrt(1 + 1 / n)).toFixed(4));

      localPredictions.push({
        column: col,
        period: p,
        value: predicted,
        lowerBound: parseFloat((predicted - margin).toFixed(4)),
        upperBound: parseFloat((predicted + margin).toFixed(4)),
      });
    }
  }

  // AI interpretation
  const predPreview = JSON.stringify(localPredictions.slice(0, 30)).substring(0, 3000);
  const recentData = JSON.stringify(rows.slice(-20), null, 2).substring(0, 3000);

  const systemPrompt = `You are a predictive analytics expert. Interpret the trend predictions and provide narrative analysis.

Return a JSON object:
{
  "trend": "<overall trend description>",
  "seasonality": "<seasonality description or 'none detected'>",
  "confidence": <0-1>,
  "narrative": "<2-3 paragraph narrative about what the predictions mean, their implications, and caveats>"
}
Return ONLY valid JSON.`;

  const userContent = question
    ? `Predictions:\n${predPreview}\n\nRecent data:\n${recentData}\n\nFocus: ${question}`
    : `Predictions:\n${predPreview}\n\nRecent data:\n${recentData}`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned empty response for predictive analysis');

  const parsed = JSON.parse(raw);
  const durationMs = Date.now() - startTime;
  logger.info('Predictive analysis complete', { durationMs, predictionCount: localPredictions.length });

  return {
    predictions: localPredictions,
    trend: String(parsed.trend || ''),
    seasonality: String(parsed.seasonality || 'none detected'),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
    narrative: String(parsed.narrative || ''),
  };
}

// ─── Prescriptive Analysis (called from BullMQ worker) ────────────────

export async function runPrescriptiveAnalysis(
  rows: Record<string, unknown>[],
  columns: string[],
  question?: string,
): Promise<PrescriptiveResult> {
  const startTime = Date.now();

  const statsPreview = JSON.stringify(
    Object.fromEntries(
      columns.slice(0, 20).map((col) => {
        const values = rows.map((r) => r[col]).filter((v) => v !== null);
        const numericValues = values.filter((v) => !isNaN(Number(v))).map(Number);
        if (numericValues.length > values.length * 0.5) {
          const sorted = [...numericValues].sort((a, b) => a - b);
          return [col, {
            type: 'numeric',
            min: sorted[0],
            max: sorted[sorted.length - 1],
            mean: parseFloat((numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(2)),
          }];
        }
        return [col, { type: 'categorical', unique: new Set(values.map(String)).size, sample: values.slice(0, 3) }];
      }),
    ),
  ).substring(0, 4000);

  const sampleData = JSON.stringify(rows.slice(0, 20), null, 2).substring(0, 4000);

  const systemPrompt = `You are a strategic business advisor. Based on the data analysis, provide actionable prescriptive recommendations.

Return a JSON object:
{
  "recommendations": [
    { "title": "<brief title>", "description": "<detailed recommendation with specific actions>", "priority": "<critical|high|medium|low>", "impact": "<high|medium|low>", "effort": "<high|medium|low>" }
  ],
  "scenarios": [
    { "name": "<scenario name>", "description": "<what-if description>", "outcome": "<expected outcome>", "probability": <0-1> }
  ],
  "actionPlan": "<structured action plan with timeline>",
  "riskAssessment": "<key risks and mitigation strategies>"
}
Provide at least 3 recommendations and 2 scenarios. Return ONLY valid JSON.`;

  const userContent = question
    ? `Data profile:\n${statsPreview}\n\nSample:\n${sampleData}\n\nBusiness question: ${question}`
    : `Data profile:\n${statsPreview}\n\nSample:\n${sampleData}`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.4,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned empty response for prescriptive analysis');

  const parsed = JSON.parse(raw);
  const durationMs = Date.now() - startTime;
  logger.info('Prescriptive analysis complete', { durationMs });

  return {
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((r: Record<string, unknown>) => ({
          title: String(r.title || ''),
          description: String(r.description || ''),
          priority: String(r.priority || 'medium'),
          impact: String(r.impact || 'medium'),
          effort: String(r.effort || 'medium'),
        }))
      : [],
    scenarios: Array.isArray(parsed.scenarios)
      ? parsed.scenarios.map((s: Record<string, unknown>) => ({
          name: String(s.name || ''),
          description: String(s.description || ''),
          outcome: String(s.outcome || ''),
          probability: typeof s.probability === 'number' ? s.probability : 0.5,
        }))
      : [],
    actionPlan: String(parsed.actionPlan || ''),
    riskAssessment: String(parsed.riskAssessment || ''),
  };
}
