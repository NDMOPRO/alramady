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

const CreateSchema = z.object({
  name: z.string().min(1).max(300),
  kpiKey: z.string().min(1).max(100),
  formula: z.string().optional().default(''),
  unit: z.string().optional().default(''),
  target: z.number().optional(),
  datasetId: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  formula: z.string().optional(),
  unit: z.string().optional(),
  target: z.number().optional(),
});

const CalculateSchema = z.object({
  datasetId: z.string().uuid(),
  kpiKeys: z.array(z.string()).optional(),
  columns: z.record(z.string()).optional(),
});

const BenchmarkSchema = z.object({
  datasetId: z.string().uuid(),
  kpiKey: z.string().min(1),
  industryBenchmark: z.number().optional(),
});

const TrendsSchema = z.object({
  kpiId: z.string().uuid().optional(),
  period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional().default('monthly'),
  limit: z.coerce.number().int().min(1).max(365).optional().default(12),
});

// ─── Interfaces ───────────────────────────────────────────────────────

interface KpiDefinition {
  key: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  category: string;
  formula: string;
  unit: string;
  direction: 'higher_is_better' | 'lower_is_better' | 'target_based';
  requiredColumns: string[];
}

interface KpiCalculationResult {
  kpiKey: string;
  name: string;
  value: number;
  formattedValue: string;
  unit: string;
  target: number | null;
  status: 'above_target' | 'on_target' | 'below_target' | 'no_target';
  trend: string;
  interpretation: string;
}

// ─── OpenAI Client ────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ─── Built-in KPI Definitions ─────────────────────────────────────────

const BUILT_IN_KPIS: KpiDefinition[] = [
  {
    key: 'revenue_growth',
    nameAr: 'نمو الإيرادات',
    nameEn: 'Revenue Growth Rate',
    descriptionAr: 'نسبة التغير في الإيرادات مقارنة بالفترة السابقة',
    descriptionEn: 'Percentage change in revenue compared to previous period',
    category: 'financial',
    formula: '((current_revenue - previous_revenue) / previous_revenue) * 100',
    unit: '%',
    direction: 'higher_is_better',
    requiredColumns: ['revenue', 'period'],
  },
  {
    key: 'profit_margin',
    nameAr: 'هامش الربح',
    nameEn: 'Profit Margin',
    descriptionAr: 'نسبة صافي الربح إلى الإيرادات',
    descriptionEn: 'Net profit as a percentage of revenue',
    category: 'financial',
    formula: '(net_profit / revenue) * 100',
    unit: '%',
    direction: 'higher_is_better',
    requiredColumns: ['net_profit', 'revenue'],
  },
  {
    key: 'employee_turnover',
    nameAr: 'معدل دوران الموظفين',
    nameEn: 'Employee Turnover Rate',
    descriptionAr: 'نسبة الموظفين المغادرين إلى إجمالي الموظفين',
    descriptionEn: 'Percentage of employees who left compared to total workforce',
    category: 'hr',
    formula: '(departures / average_headcount) * 100',
    unit: '%',
    direction: 'lower_is_better',
    requiredColumns: ['departures', 'headcount'],
  },
  {
    key: 'customer_satisfaction',
    nameAr: 'رضا العملاء',
    nameEn: 'Customer Satisfaction Score',
    descriptionAr: 'متوسط تقييم رضا العملاء',
    descriptionEn: 'Average customer satisfaction rating',
    category: 'customer',
    formula: 'average(satisfaction_score)',
    unit: 'score',
    direction: 'higher_is_better',
    requiredColumns: ['satisfaction_score'],
  },
  {
    key: 'conversion_rate',
    nameAr: 'معدل التحويل',
    nameEn: 'Conversion Rate',
    descriptionAr: 'نسبة العملاء المحتملين الذين تحولوا إلى عملاء فعليين',
    descriptionEn: 'Percentage of leads that converted to customers',
    category: 'sales',
    formula: '(conversions / total_leads) * 100',
    unit: '%',
    direction: 'higher_is_better',
    requiredColumns: ['conversions', 'leads'],
  },
  {
    key: 'operating_efficiency',
    nameAr: 'كفاءة التشغيل',
    nameEn: 'Operating Efficiency',
    descriptionAr: 'نسبة المصروفات التشغيلية إلى الإيرادات',
    descriptionEn: 'Operating expenses as a percentage of revenue',
    category: 'operations',
    formula: '(operating_expenses / revenue) * 100',
    unit: '%',
    direction: 'lower_is_better',
    requiredColumns: ['operating_expenses', 'revenue'],
  },
  {
    key: 'productivity_index',
    nameAr: 'مؤشر الإنتاجية',
    nameEn: 'Productivity Index',
    descriptionAr: 'الإيرادات لكل موظف',
    descriptionEn: 'Revenue per employee',
    category: 'operations',
    formula: 'revenue / headcount',
    unit: 'SAR/employee',
    direction: 'higher_is_better',
    requiredColumns: ['revenue', 'headcount'],
  },
];

// ─── CRUD Functions ───────────────────────────────────────────────────

export async function list(params: Record<string, unknown>) {
  const validated = ListParamsSchema.parse(params);
  const skip = (validated.page - 1) * validated.limit;

  const where: Record<string, unknown> = {};
  if (validated.search) {
    where.OR = [
      { name: { contains: validated.search, mode: 'insensitive' } },
      { kpiKey: { contains: validated.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.kpiRecord.findMany({
      where,
      skip,
      take: validated.limit,
      orderBy: { [validated.sortBy]: validated.sortOrder },
    }),
    prisma.kpiRecord.count({ where }),
  ]);

  return { data, total, page: validated.page, limit: validated.limit };
}

export async function getById(id: string) {
  const validId = z.string().uuid().parse(id);

  const cached = await cacheGet<Record<string, unknown>>(`kpi-record:${validId}`);
  if (cached) return cached;

  const record = await prisma.kpiRecord.findUniqueOrThrow({ where: { id: validId } });
  await cacheSet(`kpi-record:${validId}`, record, 300);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const validated = CreateSchema.parse(data);
  const id = uuidv4();

  const record = await prisma.kpiRecord.create({
    data: {
      id,
      name: validated.name,
      kpiKey: validated.kpiKey,
      formula: validated.formula,
      unit: validated.unit,
      target: validated.target || null,
      datasetId: validated.datasetId || null,
      createdBy: validated.createdBy || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info('KPI record created', { id, kpiKey: validated.kpiKey });
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const validId = z.string().uuid().parse(id);
  const validated = UpdateSchema.parse(data);

  const record = await prisma.kpiRecord.update({
    where: { id: validId },
    data: { ...validated, updatedAt: new Date() },
  });

  await cacheDel(`kpi-record:${validId}`);
  return record;
}

export async function remove(id: string) {
  const validId = z.string().uuid().parse(id);
  await prisma.kpiRecord.delete({ where: { id: validId } });
  await cacheDel(`kpi-record:${validId}`);
  return { deleted: true, id: validId };
}

// ─── Get KPI Definitions ─────────────────────────────────────────────

export async function getDefinitions(): Promise<KpiDefinition[]> {
  const cached = await cacheGet<KpiDefinition[]>('kpi:definitions');
  if (cached) return cached;

  await cacheSet('kpi:definitions', BUILT_IN_KPIS, 3600);
  return BUILT_IN_KPIS;
}

// ─── Calculate KPIs ──────────────────────────────────────────────────

export async function calculate(
  body: Record<string, unknown>,
  userId: string | undefined,
): Promise<{ results: KpiCalculationResult[]; suggestions: string[] }> {
  const validated = CalculateSchema.parse(body);
  const startTime = Date.now();

  logger.info('Calculating KPIs', { datasetId: validated.datasetId });

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
  if (fetchedRows.length === 0) {
    throw new Error('No data rows found for KPI calculation');
  }

  const availableColumns = Object.keys(fetchedRows[0] || {});
  const columnMapping = validated.columns || {};

  // Ask AI to suggest KPIs and calculate them
  const sampleData = JSON.stringify(fetchedRows.slice(0, 20), null, 2).substring(0, 4000);
  const kpiDefs = validated.kpiKeys && validated.kpiKeys.length > 0
    ? BUILT_IN_KPIS.filter((k) => validated.kpiKeys!.includes(k.key))
    : BUILT_IN_KPIS;

  const systemPrompt = `You are a KPI calculation expert for the RASID platform. Analyze the dataset and calculate relevant KPIs.

Available columns: ${availableColumns.join(', ')}
Column mapping overrides: ${JSON.stringify(columnMapping)}
Available KPI definitions: ${JSON.stringify(kpiDefs.map((k) => ({ key: k.key, name: k.nameEn, formula: k.formula, requiredColumns: k.requiredColumns })))}

Return a JSON object:
{
  "results": [
    {
      "kpiKey": "<key>",
      "name": "<display name>",
      "value": <calculated numeric value>,
      "formattedValue": "<human readable value with unit>",
      "unit": "<unit>",
      "target": <target value or null>,
      "status": "<above_target|on_target|below_target|no_target>",
      "trend": "<improving|stable|declining|insufficient_data>",
      "interpretation": "<1-2 sentence interpretation>"
    }
  ],
  "suggestions": ["<additional KPI or analysis suggestion>", ...]
}
Calculate ONLY KPIs where the required data is available. Use actual column values from the data.
Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Dataset: ${(dataset as { name?: string }).name || validated.datasetId}\nRow count: ${fetchedRows.length}\nSample data:\n${sampleData}` },
    ],
    temperature: 0.1,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenAI returned empty response for KPI calculation');
  }

  const parsed = JSON.parse(raw);
  const durationMs = Date.now() - startTime;

  const results: KpiCalculationResult[] = Array.isArray(parsed.results)
    ? parsed.results.map((r: Record<string, unknown>) => ({
        kpiKey: String(r.kpiKey || ''),
        name: String(r.name || ''),
        value: typeof r.value === 'number' ? r.value : 0,
        formattedValue: String(r.formattedValue || ''),
        unit: String(r.unit || ''),
        target: typeof r.target === 'number' ? r.target : null,
        status: String(r.status || 'no_target'),
        trend: String(r.trend || 'insufficient_data'),
        interpretation: String(r.interpretation || ''),
      }))
    : [];

  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [];

  logger.info('KPI calculation complete', { durationMs, kpiCount: results.length });
  return { results, suggestions };
}

// ─── Benchmark ────────────────────────────────────────────────────────

export async function benchmark(
  body: Record<string, unknown>,
  userId: string | undefined,
): Promise<{
  kpiKey: string;
  currentValue: number;
  benchmarkValue: number;
  gap: number;
  percentile: string;
  recommendation: string;
}> {
  const validated = BenchmarkSchema.parse(body);

  logger.info('Benchmarking KPI', { datasetId: validated.datasetId, kpiKey: validated.kpiKey });

  const dataset = await prisma.dataset.findFirst({ where: { id: validated.datasetId } });
  if (!dataset) {
    throw new Error(`Dataset ${validated.datasetId} not found`);
  }

  const rows = await prisma.datasetRow.findMany({
    where: { datasetId: validated.datasetId },
    take: 200,
  });

  const fetchedRows = rows.map((r: { data: unknown }) => r.data as Record<string, unknown>);
  const sampleData = JSON.stringify(fetchedRows.slice(0, 10), null, 2).substring(0, 2000);

  const systemPrompt = `You are a KPI benchmarking expert. Compute the requested KPI from the data and compare it against the industry benchmark (if provided) or general industry standards.

Return a JSON object:
{
  "currentValue": <calculated value>,
  "benchmarkValue": <industry benchmark>,
  "gap": <difference>,
  "percentile": "<estimated percentile range, e.g. 'top 25%' or 'bottom 50%'>",
  "recommendation": "<actionable recommendation to improve>"
}
Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `KPI: ${validated.kpiKey}\nIndustry benchmark: ${validated.industryBenchmark ?? 'not provided'}\nData sample:\n${sampleData}` },
    ],
    temperature: 0.2,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned empty response for KPI benchmark');

  const parsed = JSON.parse(raw);

  return {
    kpiKey: validated.kpiKey,
    currentValue: typeof parsed.currentValue === 'number' ? parsed.currentValue : 0,
    benchmarkValue: typeof parsed.benchmarkValue === 'number' ? parsed.benchmarkValue : 0,
    gap: typeof parsed.gap === 'number' ? parsed.gap : 0,
    percentile: String(parsed.percentile || 'unknown'),
    recommendation: String(parsed.recommendation || ''),
  };
}

// ─── KPI Trends ───────────────────────────────────────────────────────

export async function getTrends(params: Record<string, unknown>) {
  const validated = TrendsSchema.parse(params);

  logger.info('Fetching KPI trends', { kpiId: validated.kpiId, period: validated.period });

  const where: Record<string, unknown> = {};
  if (validated.kpiId) {
    where.kpiId = validated.kpiId;
  }

  const trendData = await prisma.kpiTrend.findMany({
    where,
    take: validated.limit,
    orderBy: { recordedAt: 'desc' },
  });

  return {
    period: validated.period,
    dataPoints: trendData,
    count: trendData.length,
  };
}
