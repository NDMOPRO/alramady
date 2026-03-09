import { v4 as uuidv4 } from 'uuid';
import * as d3 from 'd3';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

interface KPIDataSource {
  table?: string;
  column?: string;
  filterColumn?: string | null;
  filterValue?: string | null;
  dateColumn?: string;
  aggregation?: string;
}

interface KPIRow {
  id: string;
  name: string;
  data_source: string | KPIDataSource;
  formula: string;
  target: number;
  thresholds: string | { warning: number; critical: number };
  tenant_id: string;
  user_id: string;
  status: string;
  current_value: number;
  created_at: Date;
  updated_at: Date;
}

interface KPIHistoryRow {
  id: string;
  value: number;
  computed_at: Date;
  data_points: number;
  status: string;
  metadata: string | Record<string, unknown>;
}

interface KPIValueRow {
  val: string;
}

interface KPIComparisonResult {
  kpiId: string;
  name: string;
  formula: string;
  target: number;
  currentValue: number;
  statistics: { mean: number; min: number; max: number; stddev: number; dataPoints: number };
  growth: number;
  trend: string;
  percentOfTarget: number;
  history: Array<{ value: number; computedAt: Date; status: string }>;
}

function evaluateFormula(formula: string, values: number[]): number {
  const safeFormula = formula
    .replace(/SUM/gi, '__sum__')
    .replace(/AVG/gi, '__avg__')
    .replace(/COUNT/gi, '__count__')
    .replace(/MIN/gi, '__min__')
    .replace(/MAX/gi, '__max__')
    .replace(/MEDIAN/gi, '__median__')
    .replace(/STDDEV/gi, '__stddev__')
    .replace(/PERCENTILE_(\d+)/gi, '__percentile_$1__')
    .replace(/GROWTH/gi, '__growth__');

  if (safeFormula.includes('__sum__')) {
    return d3.sum(values);
  }
  if (safeFormula.includes('__avg__')) {
    return d3.mean(values) ?? 0;
  }
  if (safeFormula.includes('__count__')) {
    return values.length;
  }
  if (safeFormula.includes('__min__')) {
    return d3.min(values) ?? 0;
  }
  if (safeFormula.includes('__max__')) {
    return d3.max(values) ?? 0;
  }
  if (safeFormula.includes('__median__')) {
    return d3.median(values) ?? 0;
  }
  if (safeFormula.includes('__stddev__')) {
    return d3.deviation(values) ?? 0;
  }
  const percentileMatch = safeFormula.match(/__percentile_(\d+)__/);
  if (percentileMatch) {
    const p = parseInt(percentileMatch[1], 10) / 100;
    const sorted = [...values].sort((a, b) => a - b);
    return d3.quantile(sorted, p) ?? 0;
  }
  if (safeFormula.includes('__growth__')) {
    if (values.length < 2) return 0;
    const first = values[0];
    const last = values[values.length - 1];
    if (first === 0) return last > 0 ? 100 : 0;
    return ((last - first) / Math.abs(first)) * 100;
  }

  return d3.sum(values);
}

function determineStatus(
  value: number,
  target: number,
  thresholds: { warning: number; critical: number }
): string {
  const percentOfTarget = (value / target) * 100;
  if (percentOfTarget >= 100) {
    return 'on_target';
  }
  if (percentOfTarget >= thresholds.warning) {
    return 'warning';
  }
  if (percentOfTarget >= thresholds.critical) {
    return 'critical';
  }
  return 'below_critical';
}

export async function createKPI(
  name: string,
  dataSource: KPIDataSource | undefined,
  formula: string,
  target: number,
  thresholds: { warning: number; critical: number },
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const kpiId = uuidv4();
  const now = new Date();

  logger.info('Creating KPI', { kpiId, name, formula, target, tenantId });

  const normalizedDataSource = {
    table: dataSource?.table ?? 'metrics',
    column: dataSource?.column ?? 'value',
    filterColumn: dataSource?.filterColumn ?? null,
    filterValue: dataSource?.filterValue ?? null,
    dateColumn: dataSource?.dateColumn ?? 'created_at',
    aggregation: dataSource?.aggregation ?? 'none',
  };

  const normalizedThresholds = {
    warning: Math.max(0, Math.min(thresholds.warning, 100)),
    critical: Math.max(0, Math.min(thresholds.critical, thresholds.warning)),
  };

  const validFormulas = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'MEDIAN', 'STDDEV', 'GROWTH'];
  const formulaUpper = formula.toUpperCase().trim();
  const isValid = validFormulas.some((f) => formulaUpper.includes(f));
  const sanitizedFormula = isValid ? formula.trim() : 'SUM';

  const kpi = await prisma.$queryRawUnsafe(
    `INSERT INTO kpis (id, name, data_source, formula, target, thresholds, tenant_id, user_id, status, current_value, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    kpiId,
    name.trim(),
    JSON.stringify(normalizedDataSource),
    sanitizedFormula,
    target,
    JSON.stringify(normalizedThresholds),
    tenantId,
    userId,
    'active',
    0,
    now,
    now
  );

  const row = Array.isArray(kpi) ? kpi[0] : kpi;

  logger.info('KPI created successfully', { kpiId, name: name.trim(), formula: sanitizedFormula });

  return {
    id: row.id ?? kpiId,
    name: row.name ?? name.trim(),
    dataSource: normalizedDataSource,
    formula: sanitizedFormula,
    target: target,
    thresholds: normalizedThresholds,
    tenantId: tenantId,
    userId: userId,
    status: 'active',
    currentValue: 0,
    createdAt: row.created_at ?? now,
    updatedAt: row.updated_at ?? now,
  };
}

export async function calculateKPI(kpiId: string): Promise<Record<string, unknown>> {
  const now = new Date();

  logger.info('Calculating KPI', { kpiId });

  const kpis: KPIRow[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM kpis WHERE id = $1`,
    kpiId
  );

  if (!kpis || kpis.length === 0) {
    throw new Error(`KPI ${kpiId} not found`);
  }

  const kpi = kpis[0];
  const dataSource: KPIDataSource = typeof kpi.data_source === 'string' ? JSON.parse(kpi.data_source) : kpi.data_source;
  const formula = kpi.formula;
  const target = kpi.target;
  const thresholds: { warning: number; critical: number } = typeof kpi.thresholds === 'string' ? JSON.parse(kpi.thresholds) : kpi.thresholds;

  let queryStr = `SELECT "${dataSource.column}"::float as val FROM "${dataSource.table}"`;
  const queryParams: (string | Date)[] = [];
  const conditions: string[] = [];
  let paramIdx = 1;

  if (dataSource.filterColumn && dataSource.filterValue) {
    conditions.push(`"${dataSource.filterColumn}" = $${paramIdx}`);
    queryParams.push(dataSource.filterValue);
    paramIdx++;
  }

  if (dataSource.dateColumn) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    conditions.push(`"${dataSource.dateColumn}" >= $${paramIdx}`);
    queryParams.push(thirtyDaysAgo);
    paramIdx++;
  }

  if (conditions.length > 0) {
    queryStr += ` WHERE ${conditions.join(' AND ')}`;
  }

  queryStr += ` ORDER BY "${dataSource.dateColumn}" ASC LIMIT 10000`;

  let values: number[] = [];
  try {
    const rawData: KPIValueRow[] = await prisma.$queryRawUnsafe(queryStr, ...queryParams);
    values = rawData
      .map((row: KPIValueRow) => parseFloat(row.val))
      .filter((v: number) => !isNaN(v) && isFinite(v));
  } catch (queryErr) {
    logger.warn('Failed to query data source, using fallback', {
      kpiId,
      error: (queryErr as Error).message,
    });
    values = [0];
  }

  const computedValue = evaluateFormula(formula, values);
  const roundedValue = Math.round(computedValue * 100) / 100;
  const status = determineStatus(roundedValue, target, thresholds);

  const previousValue = kpi.current_value ?? 0;
  const change = previousValue !== 0
    ? Math.round(((roundedValue - previousValue) / Math.abs(previousValue)) * 10000) / 100
    : 0;

  const trend = roundedValue > previousValue ? 'up' : roundedValue < previousValue ? 'down' : 'stable';

  const historyId = uuidv4();
  await prisma.$queryRawUnsafe(
    `INSERT INTO kpi_history (id, kpi_id, value, computed_at, data_points, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    historyId,
    kpiId,
    roundedValue,
    now,
    values.length,
    status,
    JSON.stringify({ formula, target, change, trend, previousValue })
  );

  await prisma.$queryRawUnsafe(
    `UPDATE kpis SET current_value = $1, status = $2, updated_at = $3 WHERE id = $4`,
    roundedValue,
    status,
    now,
    kpiId
  );

  logger.info('KPI calculated', {
    kpiId,
    value: roundedValue,
    status,
    dataPoints: values.length,
    change,
    trend,
  });

  return {
    kpiId: kpiId,
    name: kpi.name,
    currentValue: roundedValue,
    previousValue: previousValue,
    change: change,
    trend: trend,
    target: target,
    percentOfTarget: Math.round((roundedValue / target) * 10000) / 100,
    status: status,
    dataPoints: values.length,
    formula: formula,
    calculatedAt: now,
    historyId: historyId,
  };
}

export async function getKPIHistory(
  kpiId: string,
  dateRange: { start: Date; end: Date }
): Promise<Record<string, unknown>> {
  logger.info('Fetching KPI history', { kpiId, start: dateRange.start, end: dateRange.end });

  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);

  if (startDate >= endDate) {
    throw new Error('Start date must be before end date');
  }

  const kpis: KPIRow[] = await prisma.$queryRawUnsafe(
    `SELECT id, name, target, formula, thresholds FROM kpis WHERE id = $1`,
    kpiId
  );

  if (!kpis || kpis.length === 0) {
    throw new Error(`KPI ${kpiId} not found`);
  }

  const kpi = kpis[0];

  const history: KPIHistoryRow[] = await prisma.$queryRawUnsafe(
    `SELECT id, value, computed_at, data_points, status, metadata
     FROM kpi_history
     WHERE kpi_id = $1 AND computed_at >= $2 AND computed_at <= $3
     ORDER BY computed_at ASC`,
    kpiId,
    startDate,
    endDate
  );

  const historyValues = history.map((h: KPIHistoryRow) => h.value ?? 0);
  const stats = {
    min: historyValues.length > 0 ? d3.min(historyValues) ?? 0 : 0,
    max: historyValues.length > 0 ? d3.max(historyValues) ?? 0 : 0,
    mean: historyValues.length > 0 ? Math.round((d3.mean(historyValues) ?? 0) * 100) / 100 : 0,
    median: historyValues.length > 0 ? Math.round((d3.median(historyValues) ?? 0) * 100) / 100 : 0,
    stddev: historyValues.length > 0 ? Math.round((d3.deviation(historyValues) ?? 0) * 100) / 100 : 0,
    count: historyValues.length,
  };

  const items = history.map((h: KPIHistoryRow) => ({
    id: h.id,
    value: h.value,
    computedAt: h.computed_at,
    dataPoints: h.data_points,
    status: h.status,
    metadata: typeof h.metadata === 'string' ? JSON.parse(h.metadata) : h.metadata,
  }));

  logger.info('KPI history fetched', { kpiId, count: items.length });

  return {
    kpiId: kpiId,
    kpiName: kpi.name,
    target: kpi.target,
    formula: kpi.formula,
    dateRange: { start: startDate, end: endDate },
    history: items,
    statistics: stats,
  };
}

export async function setKPIAlert(
  kpiId: string,
  condition: string,
  recipients: string[]
): Promise<Record<string, unknown>> {
  const alertId = uuidv4();
  const now = new Date();

  logger.info('Setting KPI alert', { kpiId, condition, recipientCount: recipients.length });

  const kpis: KPIRow[] = await prisma.$queryRawUnsafe(
    `SELECT id, name FROM kpis WHERE id = $1`,
    kpiId
  );

  if (!kpis || kpis.length === 0) {
    throw new Error(`KPI ${kpiId} not found`);
  }

  const validConditions = ['above_target', 'below_target', 'critical', 'warning', 'any_change', 'threshold_breach'];
  const sanitizedCondition = validConditions.includes(condition) ? condition : 'threshold_breach';

  const validRecipients = recipients.filter((r: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(r);
  });

  if (validRecipients.length === 0) {
    throw new Error('At least one valid email recipient is required');
  }

  const alert = await prisma.$queryRawUnsafe(
    `INSERT INTO kpi_alerts (id, kpi_id, condition, recipients, enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    alertId,
    kpiId,
    sanitizedCondition,
    JSON.stringify(validRecipients),
    true,
    now,
    now
  );

  const row = Array.isArray(alert) ? alert[0] : alert;

  logger.info('KPI alert set', { alertId, kpiId, condition: sanitizedCondition });

  return {
    id: row.id ?? alertId,
    kpiId: kpiId,
    kpiName: kpis[0].name,
    condition: sanitizedCondition,
    recipients: validRecipients,
    enabled: true,
    createdAt: row.created_at ?? now,
    updatedAt: row.updated_at ?? now,
  };
}

export async function compareKPIs(
  kpiIds: string[],
  dateRange: { start: Date; end: Date }
): Promise<Record<string, unknown>> {
  logger.info('Comparing KPIs', { kpiIds, start: dateRange.start, end: dateRange.end });

  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);

  if (kpiIds.length < 2) {
    throw new Error('At least 2 KPI IDs are required for comparison');
  }

  const paramSlots = kpiIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
  const kpis: KPIRow[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM kpis WHERE id IN (${paramSlots})`,
    ...kpiIds
  );

  if (kpis.length === 0) {
    throw new Error('No KPIs found for provided IDs');
  }

  const comparisonResults: KPIComparisonResult[] = [];

  for (const kpi of kpis) {
    const history: KPIHistoryRow[] = await prisma.$queryRawUnsafe(
      `SELECT value, computed_at, status FROM kpi_history
       WHERE kpi_id = $1 AND computed_at >= $2 AND computed_at <= $3
       ORDER BY computed_at ASC`,
      kpi.id,
      startDate,
      endDate
    );

    const values = history.map((h: KPIHistoryRow) => h.value ?? 0);
    const mean = values.length > 0 ? d3.mean(values) ?? 0 : 0;
    const minVal = values.length > 0 ? d3.min(values) ?? 0 : 0;
    const maxVal = values.length > 0 ? d3.max(values) ?? 0 : 0;
    const stddev = values.length > 0 ? d3.deviation(values) ?? 0 : 0;
    const firstValue = values.length > 0 ? values[0] : 0;
    const lastValue = values.length > 0 ? values[values.length - 1] : 0;
    const growth = firstValue !== 0
      ? Math.round(((lastValue - firstValue) / Math.abs(firstValue)) * 10000) / 100
      : 0;

    const trend = lastValue > firstValue ? 'up' : lastValue < firstValue ? 'down' : 'stable';

    comparisonResults.push({
      kpiId: kpi.id,
      name: kpi.name,
      formula: kpi.formula,
      target: kpi.target,
      currentValue: kpi.current_value,
      statistics: {
        mean: Math.round(mean * 100) / 100,
        min: Math.round(minVal * 100) / 100,
        max: Math.round(maxVal * 100) / 100,
        stddev: Math.round(stddev * 100) / 100,
        dataPoints: values.length,
      },
      growth: growth,
      trend: trend,
      percentOfTarget: kpi.target > 0
        ? Math.round((kpi.current_value / kpi.target) * 10000) / 100
        : 0,
      history: history.map((h: KPIHistoryRow) => ({
        value: h.value,
        computedAt: h.computed_at,
        status: h.status,
      })),
    });
  }

  const bestPerformer = comparisonResults.reduce((best: KPIComparisonResult, current: KPIComparisonResult) =>
    current.percentOfTarget > best.percentOfTarget ? current : best
  );

  const worstPerformer = comparisonResults.reduce((worst: KPIComparisonResult, current: KPIComparisonResult) =>
    current.percentOfTarget < worst.percentOfTarget ? current : worst
  );

  logger.info('KPI comparison complete', {
    kpiCount: comparisonResults.length,
    bestPerformer: bestPerformer.name,
  });

  return {
    dateRange: { start: startDate, end: endDate },
    kpis: comparisonResults,
    summary: {
      totalKPIs: comparisonResults.length,
      bestPerformer: { id: bestPerformer.kpiId, name: bestPerformer.name, percentOfTarget: bestPerformer.percentOfTarget },
      worstPerformer: { id: worstPerformer.kpiId, name: worstPerformer.name, percentOfTarget: worstPerformer.percentOfTarget },
      averagePerformance: Math.round(
        (d3.mean(comparisonResults.map((r: KPIComparisonResult) => r.percentOfTarget)) ?? 0) * 100
      ) / 100,
    },
  };
}
