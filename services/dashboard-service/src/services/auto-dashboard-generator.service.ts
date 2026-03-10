import { v4 as uuidv4 } from 'uuid';
import * as d3 from 'd3';
import { z } from 'zod';
import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '../utils/prisma';
import { getRedisClient, cacheSet } from '../utils/redis';
import { logger } from '../utils/logger';

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const ColumnProfileSchema = z.object({
  name: z.string(),
  type: z.enum(['numeric', 'categorical', 'date', 'text', 'boolean']),
  uniqueCount: z.number(),
  nullCount: z.number(),
  totalCount: z.number(),
  sample: z.array(z.unknown()),
  stats: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    mean: z.number().optional(),
    median: z.number().optional(),
    stddev: z.number().optional(),
    sum: z.number().optional(),
  }).optional(),
});

const DataProfileSchema = z.object({
  rowCount: z.number(),
  columnCount: z.number(),
  columns: z.array(ColumnProfileSchema),
  numericColumns: z.array(z.string()),
  categoricalColumns: z.array(z.string()),
  dateColumns: z.array(z.string()),
  textColumns: z.array(z.string()),
});

const AutoGenerateInputSchema = z.object({
  datasetId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  dashboardName: z.string().min(1).max(255).optional(),
  preferredChartTypes: z.array(z.string()).optional(),
  maxWidgets: z.number().min(1).max(30).optional(),
});

const ExcelUploadInputSchema = z.object({
  fileBuffer: z.instanceof(Buffer),
  fileName: z.string().min(1),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  dashboardName: z.string().min(1).max(255).optional(),
});

// ─── Types ──────────────────────────────────────────────────────────────────

interface ColumnProfile {
  name: string;
  type: 'numeric' | 'categorical' | 'date' | 'text' | 'boolean';
  uniqueCount: number;
  nullCount: number;
  totalCount: number;
  sample: unknown[];
  stats?: {
    min?: number;
    max?: number;
    mean?: number;
    median?: number;
    stddev?: number;
    sum?: number;
  };
}

interface DataProfile {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  numericColumns: string[];
  categoricalColumns: string[];
  dateColumns: string[];
  textColumns: string[];
}

interface ChartRecommendation {
  widgetType: string;
  title: string;
  titleAr: string;
  xColumn: string | null;
  yColumn: string | null;
  labelColumn: string | null;
  config: Record<string, unknown>;
  score: number;
  reason: string;
}

interface KPIRecommendation {
  name: string;
  nameAr: string;
  column: string;
  formula: string;
  icon: string;
  format: string;
}

interface GeneratedWidget {
  id: string;
  type: string;
  title: string;
  titleAr: string;
  config: Record<string, unknown>;
  datasetId: string;
  position: { x: number; y: number; w: number; h: number };
}

interface AutoDashboardResult {
  dashboardId: string;
  dashboardName: string;
  widgets: GeneratedWidget[];
  kpis: KPIRecommendation[];
  dataProfile: DataProfile;
  generatedAt: Date;
}

// ─── BullMQ Queue ───────────────────────────────────────────────────────────

const QUEUE_NAME = 'dashboard-auto-generate';

function getAutoDashboardQueue(): Queue {
  const connection = getRedisClient() as unknown as import('bullmq').ConnectionOptions;
  return new Queue(QUEUE_NAME, { connection });
}

// ─── Service ────────────────────────────────────────────────────────────────

export class AutoDashboardGeneratorService {

  /**
   * Feature #1: Easy mode - one-click dashboard from uploaded file.
   * User uploads a file and gets a complete dashboard automatically.
   */
  async generateFromDataset(input: z.infer<typeof AutoGenerateInputSchema>): Promise<AutoDashboardResult> {
    const validated = AutoGenerateInputSchema.parse(input);
    const { datasetId, tenantId, userId, maxWidgets } = validated;

    logger.info('Auto-generating dashboard from dataset', { datasetId, tenantId, userId });

    // 1. Fetch dataset metadata and rows
    const datasets: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(
      `SELECT id, name, columns, row_count, column_count FROM datasets WHERE id = $1`,
      datasetId
    );

    if (!datasets || datasets.length === 0) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    const dataset = datasets[0];
    const datasetName = String(dataset.name ?? 'Dataset');
    const columnsMeta = typeof dataset.columns === 'string'
      ? JSON.parse(dataset.columns as string)
      : (dataset.columns ?? []);

    // 2. Fetch sample data rows for profiling
    const sampleRows: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(
      `SELECT data FROM dataset_rows WHERE dataset_id = $1 ORDER BY row_index ASC LIMIT 2000`,
      datasetId
    );

    const rows: Array<Record<string, unknown>> = sampleRows.map((r: Record<string, unknown>) => {
      const data = r.data;
      return typeof data === 'string' ? JSON.parse(data) : (data as Record<string, unknown>) ?? {};
    });

    if (rows.length === 0) {
      throw new Error(`Dataset ${datasetId} has no data rows`);
    }

    // 3. Profile the data
    const dataProfile = this.profileData(rows, columnsMeta);

    // 4. Auto-detect KPIs (Feature #3)
    const kpis = this.detectKPIs(dataProfile);

    // 5. Auto-select best chart types (Feature #2)
    const chartRecommendations = this.recommendCharts(dataProfile, validated.preferredChartTypes);

    // 6. Build the dashboard layout
    const widgetLimit = maxWidgets ?? 12;
    const dashboardName = validated.dashboardName ?? `${datasetName} - لوحة تلقائية`;

    const dashboardId = uuidv4();
    const now = new Date();

    const layout = {
      columns: 12,
      rowHeight: 80,
      gap: 10,
      breakpoints: { lg: 1200, md: 996, sm: 768, xs: 480 },
      compactType: 'vertical',
      preventCollision: false,
      maxRows: 100,
    };

    const config = {
      theme: 'light',
      refreshInterval: 0,
      autoSave: true,
      isPublic: false,
      tags: ['auto-generated'],
      description: `لوحة مؤشرات تم إنشاؤها تلقائياً من ${datasetName}`,
      autoGenerated: true,
      sourceDatasetId: datasetId,
    };

    // Insert dashboard
    await prisma.$queryRawUnsafe(
      `INSERT INTO dashboards (id, name, layout, config, tenant_id, user_id, created_at, updated_at, version, status)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10)`,
      dashboardId,
      dashboardName,
      JSON.stringify(layout),
      JSON.stringify(config),
      tenantId,
      userId,
      now,
      now,
      1,
      'active'
    );

    // 7. Create KPI widgets (top row)
    const widgets: GeneratedWidget[] = [];
    const kpiCount = Math.min(kpis.length, 4);

    for (let i = 0; i < kpiCount; i++) {
      const kpi = kpis[i];
      const values = rows
        .map((r: Record<string, unknown>) => parseFloat(String(r[kpi.column] ?? '')))
        .filter((v: number) => !isNaN(v) && isFinite(v));

      let computedValue = 0;
      if (kpi.formula === 'SUM') computedValue = d3.sum(values);
      else if (kpi.formula === 'AVG') computedValue = d3.mean(values) ?? 0;
      else if (kpi.formula === 'COUNT') computedValue = values.length;
      else if (kpi.formula === 'MAX') computedValue = d3.max(values) ?? 0;
      else if (kpi.formula === 'MIN') computedValue = d3.min(values) ?? 0;

      const widgetId = uuidv4();
      const kpiWidth = Math.floor(12 / kpiCount);

      const widgetConfig = {
        formula: kpi.formula,
        column: kpi.column,
        value: Math.round(computedValue * 100) / 100,
        icon: kpi.icon,
        format: kpi.format,
        colors: ['#4e79a7'],
        animation: true,
        legend: { show: false, position: 'bottom' },
        tooltip: { enabled: true },
        responsive: true,
      };

      await prisma.$queryRawUnsafe(
        `INSERT INTO dashboard_widgets (id, dashboard_id, type, title, config, dataset_id, position_x, position_y, position_w, position_h, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        widgetId,
        dashboardId,
        'kpi',
        kpi.nameAr,
        JSON.stringify(widgetConfig),
        datasetId,
        i * kpiWidth,
        0,
        kpiWidth,
        2,
        widgets.length + 1,
        now,
        now
      );

      widgets.push({
        id: widgetId,
        type: 'kpi',
        title: kpi.name,
        titleAr: kpi.nameAr,
        config: widgetConfig,
        datasetId,
        position: { x: i * kpiWidth, y: 0, w: kpiWidth, h: 2 },
      });
    }

    // 8. Create chart widgets
    const remainingSlots = widgetLimit - kpiCount;
    const selectedCharts = chartRecommendations
      .sort((a: ChartRecommendation, b: ChartRecommendation) => b.score - a.score)
      .slice(0, remainingSlots);

    let currentY = 2; // start below KPIs
    let currentX = 0;

    for (let i = 0; i < selectedCharts.length; i++) {
      const chart = selectedCharts[i];
      const widgetId = uuidv4();

      const chartWidth = chart.widgetType === 'pie_chart' || chart.widgetType === 'gauge' ? 4 : 6;
      const chartHeight = 4;

      if (currentX + chartWidth > 12) {
        currentX = 0;
        currentY += chartHeight;
      }

      const chartConfig: Record<string, unknown> = {
        ...chart.config,
        xColumn: chart.xColumn,
        yColumn: chart.yColumn,
        labelColumn: chart.labelColumn,
        datasetMapping: {
          xColumn: chart.xColumn,
          yColumn: chart.yColumn,
          labelColumn: chart.labelColumn,
        },
        colors: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc949'],
        animation: true,
        legend: { show: true, position: 'bottom' },
        tooltip: { enabled: true },
        responsive: true,
      };

      await prisma.$queryRawUnsafe(
        `INSERT INTO dashboard_widgets (id, dashboard_id, type, title, config, dataset_id, position_x, position_y, position_w, position_h, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        widgetId,
        dashboardId,
        chart.widgetType,
        chart.titleAr,
        JSON.stringify(chartConfig),
        datasetId,
        currentX,
        currentY,
        chartWidth,
        chartHeight,
        widgets.length + 1,
        now,
        now
      );

      widgets.push({
        id: widgetId,
        type: chart.widgetType,
        title: chart.title,
        titleAr: chart.titleAr,
        config: chartConfig,
        datasetId,
        position: { x: currentX, y: currentY, w: chartWidth, h: chartHeight },
      });

      currentX += chartWidth;
    }

    // Update dashboard timestamp
    await prisma.$queryRawUnsafe(
      `UPDATE dashboards SET updated_at = $1 WHERE id = $2`,
      now,
      dashboardId
    );

    const result: AutoDashboardResult = {
      dashboardId,
      dashboardName,
      widgets,
      kpis,
      dataProfile,
      generatedAt: now,
    };

    // Cache the result
    await cacheSet(`dashboard:auto-generated:${dashboardId}`, result, 3600);

    logger.info('Auto-dashboard generated successfully', {
      dashboardId,
      widgetCount: widgets.length,
      kpiCount: kpis.length,
      chartCount: selectedCharts.length,
      rowsAnalyzed: rows.length,
    });

    return result;
  }

  /**
   * Feature #6: Excel file upload -> auto dashboard.
   * Enqueues heavy processing via BullMQ, parses the Excel,
   * stores it as a dataset, then auto-generates the dashboard.
   */
  async generateFromExcelUpload(input: z.infer<typeof ExcelUploadInputSchema>): Promise<{ jobId: string; status: string }> {
    const validated = ExcelUploadInputSchema.parse(input);

    logger.info('Enqueueing Excel-to-dashboard job', {
      fileName: validated.fileName,
      fileSize: validated.fileBuffer.length,
      tenantId: validated.tenantId,
    });

    const jobId = uuidv4();

    const queue = getAutoDashboardQueue();
    await queue.add('excel-to-dashboard', {
      jobId,
      fileName: validated.fileName,
      fileBase64: validated.fileBuffer.toString('base64'),
      tenantId: validated.tenantId,
      userId: validated.userId,
      dashboardName: validated.dashboardName,
    }, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    });

    // Store initial job status
    await cacheSet(`dashboard:job:${jobId}`, {
      jobId,
      status: 'queued',
      fileName: validated.fileName,
      tenantId: validated.tenantId,
      createdAt: new Date().toISOString(),
    }, 86400);

    return { jobId, status: 'queued' };
  }

  /**
   * Check the status of an enqueued auto-dashboard job.
   */
  async getJobStatus(jobId: string): Promise<{
    jobId: string;
    status: string;
    dashboardId?: string;
    error?: string;
    progress?: number;
  }> {
    const queue = getAutoDashboardQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    const returnValue = job.returnvalue as Record<string, unknown> | null;

    return {
      jobId,
      status: state,
      dashboardId: returnValue?.dashboardId as string | undefined,
      error: job.failedReason ?? undefined,
      progress: typeof job.progress === 'number' ? job.progress : undefined,
    };
  }

  // ─── Feature #3: Auto-detect KPIs from data ────────────────────────────────

  detectKPIs(profile: DataProfile): KPIRecommendation[] {
    const kpis: KPIRecommendation[] = [];

    for (const col of profile.columns) {
      if (col.type !== 'numeric') continue;
      if (!col.stats) continue;
      if (col.nullCount / col.totalCount > 0.5) continue; // Skip mostly-null columns

      const uniqueRatio = col.uniqueCount / col.totalCount;

      // High-cardinality numeric columns are good SUM/AVG KPI candidates
      if (uniqueRatio > 0.3 && col.stats.sum !== undefined && col.stats.sum !== 0) {
        kpis.push({
          name: `Total ${col.name}`,
          nameAr: `إجمالي ${col.name}`,
          column: col.name,
          formula: 'SUM',
          icon: 'sigma',
          format: col.stats.max !== undefined && col.stats.max > 10000 ? 'compact' : 'number',
        });
      }

      if (uniqueRatio > 0.1 && col.stats.mean !== undefined) {
        kpis.push({
          name: `Average ${col.name}`,
          nameAr: `متوسط ${col.name}`,
          column: col.name,
          formula: 'AVG',
          icon: 'trending-up',
          format: 'decimal',
        });
      }

      // If there's a clear max, add it
      if (col.stats.max !== undefined && col.stats.max !== col.stats.min) {
        kpis.push({
          name: `Max ${col.name}`,
          nameAr: `أعلى ${col.name}`,
          column: col.name,
          formula: 'MAX',
          icon: 'arrow-up',
          format: 'number',
        });
      }
    }

    // Add count KPI if there's data
    if (profile.rowCount > 0 && profile.numericColumns.length > 0) {
      kpis.push({
        name: 'Record Count',
        nameAr: 'عدد السجلات',
        column: profile.numericColumns[0],
        formula: 'COUNT',
        icon: 'hash',
        format: 'integer',
      });
    }

    // Score and sort: prioritize SUM > AVG > MAX > COUNT
    const formulaPriority: Record<string, number> = { SUM: 4, AVG: 3, MAX: 2, MIN: 1, COUNT: 0 };
    kpis.sort((a: KPIRecommendation, b: KPIRecommendation) =>
      (formulaPriority[b.formula] ?? 0) - (formulaPriority[a.formula] ?? 0)
    );

    // Deduplicate by column+formula
    const seen = new Set<string>();
    const deduped: KPIRecommendation[] = [];
    for (const kpi of kpis) {
      const key = `${kpi.column}:${kpi.formula}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(kpi);
      }
    }

    return deduped.slice(0, 8); // max 8 KPI recommendations
  }

  // ─── Feature #2: Auto-select best chart types ──────────────────────────────

  recommendCharts(profile: DataProfile, preferred?: string[]): ChartRecommendation[] {
    const recommendations: ChartRecommendation[] = [];
    const { numericColumns, categoricalColumns, dateColumns } = profile;

    // Rule 1: Date + Numeric -> Line Chart (time series)
    for (const dateCol of dateColumns) {
      for (const numCol of numericColumns.slice(0, 3)) {
        recommendations.push({
          widgetType: 'line_chart',
          title: `${numCol} over ${dateCol}`,
          titleAr: `تطور ${numCol} عبر ${dateCol}`,
          xColumn: dateCol,
          yColumn: numCol,
          labelColumn: null,
          config: { tension: 0.3, fill: false },
          score: 90,
          reason: 'Time series data: date column paired with numeric column',
        });
      }
    }

    // Rule 2: Categorical (low cardinality) + Numeric -> Bar Chart
    for (const catCol of categoricalColumns) {
      const colProfile = profile.columns.find((c: ColumnProfile) => c.name === catCol);
      if (!colProfile) continue;

      if (colProfile.uniqueCount <= 15) {
        for (const numCol of numericColumns.slice(0, 2)) {
          recommendations.push({
            widgetType: 'bar_chart',
            title: `${numCol} by ${catCol}`,
            titleAr: `${numCol} حسب ${catCol}`,
            xColumn: catCol,
            yColumn: numCol,
            labelColumn: catCol,
            config: { stacked: false },
            score: 85,
            reason: 'Categorical + numeric: bar chart for comparison',
          });
        }
      }

      // Rule 3: Categorical with 2-8 unique values -> Pie/Donut Chart
      if (colProfile.uniqueCount >= 2 && colProfile.uniqueCount <= 8 && numericColumns.length > 0) {
        recommendations.push({
          widgetType: 'pie_chart',
          title: `${numericColumns[0]} distribution by ${catCol}`,
          titleAr: `توزيع ${numericColumns[0]} حسب ${catCol}`,
          xColumn: catCol,
          yColumn: numericColumns[0],
          labelColumn: catCol,
          config: { doughnut: colProfile.uniqueCount > 5 },
          score: 75,
          reason: 'Low-cardinality categorical: pie/donut for proportions',
        });
      }
    }

    // Rule 4: Two numeric columns -> Scatter Plot
    if (numericColumns.length >= 2) {
      recommendations.push({
        widgetType: 'scatter_plot',
        title: `${numericColumns[0]} vs ${numericColumns[1]}`,
        titleAr: `العلاقة بين ${numericColumns[0]} و ${numericColumns[1]}`,
        xColumn: numericColumns[0],
        yColumn: numericColumns[1],
        labelColumn: null,
        config: { trendLine: true },
        score: 70,
        reason: 'Two numeric columns: scatter plot for correlation',
      });
    }

    // Rule 5: Date + Numeric -> Area Chart (alternative to line)
    if (dateColumns.length > 0 && numericColumns.length > 0) {
      recommendations.push({
        widgetType: 'area_chart',
        title: `${numericColumns[0]} trend`,
        titleAr: `اتجاه ${numericColumns[0]}`,
        xColumn: dateColumns[0],
        yColumn: numericColumns[0],
        labelColumn: null,
        config: { stacked: false, fill: true },
        score: 65,
        reason: 'Time series alternative: area chart for cumulative view',
      });
    }

    // Rule 6: Categorical with many values -> Table Widget
    for (const catCol of categoricalColumns) {
      const colProfile = profile.columns.find((c: ColumnProfile) => c.name === catCol);
      if (colProfile && colProfile.uniqueCount > 15) {
        recommendations.push({
          widgetType: 'table',
          title: `${catCol} details`,
          titleAr: `تفاصيل ${catCol}`,
          xColumn: catCol,
          yColumn: numericColumns[0] ?? null,
          labelColumn: catCol,
          config: { pagination: true, pageSize: 10, sortable: true },
          score: 50,
          reason: 'High-cardinality categorical: table for detailed view',
        });
        break; // Only one table
      }
    }

    // Rule 7: Multiple categorical + numeric -> Radar Chart
    if (categoricalColumns.length >= 3 && numericColumns.length >= 1) {
      const catProfile = profile.columns.find((c: ColumnProfile) => c.name === categoricalColumns[0]);
      if (catProfile && catProfile.uniqueCount >= 3 && catProfile.uniqueCount <= 10) {
        recommendations.push({
          widgetType: 'radar_chart',
          title: `${numericColumns[0]} radar view`,
          titleAr: `عرض رادار ${numericColumns[0]}`,
          xColumn: categoricalColumns[0],
          yColumn: numericColumns[0],
          labelColumn: categoricalColumns[0],
          config: {},
          score: 55,
          reason: 'Multi-dimensional comparison: radar chart',
        });
      }
    }

    // Rule 8: Single numeric with bounded range -> Gauge
    for (const numCol of numericColumns) {
      const colProfile = profile.columns.find((c: ColumnProfile) => c.name === numCol);
      if (colProfile && colProfile.stats) {
        const range = (colProfile.stats.max ?? 0) - (colProfile.stats.min ?? 0);
        if (range > 0 && (colProfile.stats.max ?? 0) <= 100 && (colProfile.stats.min ?? 0) >= 0) {
          recommendations.push({
            widgetType: 'gauge',
            title: `${numCol} gauge`,
            titleAr: `مقياس ${numCol}`,
            xColumn: null,
            yColumn: numCol,
            labelColumn: null,
            config: { max: 100, thresholds: { warning: 60, critical: 85 } },
            score: 60,
            reason: 'Bounded 0-100 numeric: gauge for progress/status',
          });
          break; // Only one gauge
        }
      }
    }

    // Boost preferred chart types
    if (preferred && preferred.length > 0) {
      for (const rec of recommendations) {
        if (preferred.includes(rec.widgetType)) {
          rec.score += 15;
        }
      }
    }

    // Sort by score descending
    recommendations.sort((a: ChartRecommendation, b: ChartRecommendation) => b.score - a.score);

    // Deduplicate by widgetType (keep highest scoring)
    const seenTypes = new Set<string>();
    const deduped: ChartRecommendation[] = [];
    for (const rec of recommendations) {
      // Allow up to 2 of the same type
      const typeCount = deduped.filter((d: ChartRecommendation) => d.widgetType === rec.widgetType).length;
      if (typeCount < 2) {
        deduped.push(rec);
      }
    }

    return deduped;
  }

  // ─── Data Profiling ────────────────────────────────────────────────────────

  profileData(rows: Array<Record<string, unknown>>, columnsMeta: unknown[]): DataProfile {
    if (rows.length === 0) {
      return {
        rowCount: 0,
        columnCount: 0,
        columns: [],
        numericColumns: [],
        categoricalColumns: [],
        dateColumns: [],
        textColumns: [],
      };
    }

    const allKeys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        allKeys.add(key);
      }
    }

    const columnNames = Array.from(allKeys);
    const columns: ColumnProfile[] = [];
    const schemaTypeByName = new Map<string, ColumnProfile['type']>();

    if (Array.isArray(columnsMeta)) {
      for (const column of columnsMeta) {
        if (!column || typeof column !== 'object') continue;
        const columnRecord = column as Record<string, unknown>;
        const columnName = String(columnRecord.name ?? '').trim();
        if (!columnName) continue;
        schemaTypeByName.set(columnName, this.normalizeColumnType(columnRecord.dataType ?? columnRecord.type));
      }
    }

    for (const colName of columnNames) {
      const values = rows.map((r: Record<string, unknown>) => r[colName]);
      const nonNullValues = values.filter((v: unknown) => v !== null && v !== undefined && v !== '');
      const nullCount = values.length - nonNullValues.length;

      const type = schemaTypeByName.get(colName) ?? this.inferColumnType(nonNullValues);
      const uniqueValues = new Set(nonNullValues.map((v: unknown) => String(v)));

      const profile: ColumnProfile = {
        name: colName,
        type,
        uniqueCount: uniqueValues.size,
        nullCount,
        totalCount: values.length,
        sample: nonNullValues.slice(0, 5),
      };

      if (type === 'numeric') {
        const numericValues = nonNullValues
          .map((v: unknown) => parseFloat(String(v)))
          .filter((v: number) => !isNaN(v) && isFinite(v));

        if (numericValues.length > 0) {
          profile.stats = {
            min: d3.min(numericValues) ?? 0,
            max: d3.max(numericValues) ?? 0,
            mean: Math.round((d3.mean(numericValues) ?? 0) * 100) / 100,
            median: Math.round((d3.median(numericValues) ?? 0) * 100) / 100,
            stddev: Math.round((d3.deviation(numericValues) ?? 0) * 100) / 100,
            sum: Math.round(d3.sum(numericValues) * 100) / 100,
          };
        }
      }

      columns.push(profile);
    }

    const numericColumns = columns.filter((c: ColumnProfile) => c.type === 'numeric').map((c: ColumnProfile) => c.name);
    const categoricalColumns = columns.filter((c: ColumnProfile) => c.type === 'categorical').map((c: ColumnProfile) => c.name);
    const dateColumns = columns.filter((c: ColumnProfile) => c.type === 'date').map((c: ColumnProfile) => c.name);
    const textColumns = columns.filter((c: ColumnProfile) => c.type === 'text').map((c: ColumnProfile) => c.name);

    return {
      rowCount: rows.length,
      columnCount: columnNames.length,
      columns,
      numericColumns,
      categoricalColumns,
      dateColumns,
      textColumns,
    };
  }

  private inferColumnType(values: unknown[]): 'numeric' | 'categorical' | 'date' | 'text' | 'boolean' {
    if (values.length === 0) return 'text';

    const sampleSize = Math.min(values.length, 100);
    const sample = values.slice(0, sampleSize);

    // Check boolean
    const boolCount = sample.filter((v: unknown) => {
      const s = String(v).toLowerCase();
      return s === 'true' || s === 'false' || s === '0' || s === '1' || s === 'yes' || s === 'no';
    }).length;
    if (boolCount / sampleSize > 0.9) return 'boolean';

    // Check date
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}/,
      /^\d{2}\/\d{2}\/\d{4}/,
      /^\d{2}-\d{2}-\d{4}/,
      /^\d{4}\/\d{2}\/\d{2}/,
    ];
    const dateCount = sample.filter((v: unknown) => {
      const s = String(v);
      if (datePatterns.some((p: RegExp) => p.test(s))) {
        const d = new Date(s);
        return !isNaN(d.getTime());
      }
      return false;
    }).length;
    if (dateCount / sampleSize > 0.7) return 'date';

    // Check numeric
    const numericPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
    const numericCount = sample.filter((v: unknown) => {
      const stringValue = String(v).trim();
      if (!numericPattern.test(stringValue)) return false;
      const n = Number(stringValue);
      return !isNaN(n) && isFinite(n);
    }).length;
    if (numericCount / sampleSize > 0.8) return 'numeric';

    // Check categorical vs text
    const uniqueRatio = new Set(sample.map((v: unknown) => String(v))).size / sampleSize;
    const avgLength = (sample.reduce((sum: number, v: unknown) => sum + String(v).length, 0) as number) / sampleSize;

    if (uniqueRatio < 0.5 && avgLength < 50) return 'categorical';
    if (avgLength > 100) return 'text';

    return 'categorical';
  }

  private normalizeColumnType(value: unknown): ColumnProfile['type'] {
    const normalized = String(value ?? '').toLowerCase();

    if (['integer', 'int', 'float', 'double', 'decimal', 'number', 'numeric', 'bigint'].includes(normalized)) {
      return 'numeric';
    }

    if (['date', 'datetime', 'timestamp', 'timestamptz', 'time'].includes(normalized)) {
      return 'date';
    }

    if (['boolean', 'bool'].includes(normalized)) {
      return 'boolean';
    }

    if (['text', 'string', 'varchar', 'char', 'uuid', 'json', 'jsonb'].includes(normalized)) {
      return 'categorical';
    }

    return 'text';
  }
}

// ─── BullMQ Worker ──────────────────────────────────────────────────────────

export function startAutoDashboardWorker(): Worker {
  const connection = getRedisClient() as unknown as import('bullmq').ConnectionOptions;

  const worker = new Worker(QUEUE_NAME, async (job: Job) => {
    const { jobId, fileName, fileBase64, tenantId, userId, dashboardName } = job.data;

    logger.info('Processing Excel-to-dashboard job', { jobId, fileName });

    try {
      await job.updateProgress(10);

      // 1. Decode the file buffer
      const fileBuffer = Buffer.from(fileBase64, 'base64');

      await job.updateProgress(20);

      // 2. Parse Excel data using dataset ingestion
      // We store the file as a dataset first
      const datasetId = uuidv4();
      const now = new Date();

      // Detect file type
      const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
      const isCsv = fileName.endsWith('.csv');

      let parsedRows: Array<Record<string, unknown>> = [];
      let columnNames: string[] = [];

      if (isCsv) {
        // Parse CSV manually
        const csvText = fileBuffer.toString('utf-8');
        const lines = csvText.split('\n').filter((line: string) => line.trim().length > 0);

        if (lines.length > 0) {
          // Parse header
          columnNames = lines[0].split(',').map((h: string) => h.trim().replace(/^["']|["']$/g, ''));

          // Parse data rows
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map((v: string) => v.trim().replace(/^["']|["']$/g, ''));
            const row: Record<string, unknown> = {};
            for (let j = 0; j < columnNames.length; j++) {
              row[columnNames[j]] = values[j] ?? null;
            }
            parsedRows.push(row);
          }
        }
      } else if (isXlsx) {
        // For Excel files, we store the raw buffer and let the data-service parse it
        // Insert as a dataset with raw_file reference and attempt dynamic import of xlsx
        try {
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
          parsedRows = jsonData as Array<Record<string, unknown>>;

          if (parsedRows.length > 0) {
            columnNames = Object.keys(parsedRows[0]);
          }
        } catch (xlsxErr) {
          logger.warn('xlsx module not available, storing raw file for later processing', {
            error: (xlsxErr as Error).message,
          });
          // Fallback: store the raw file and create a minimal dataset
          throw new Error(`Excel parsing requires the xlsx module. File: ${fileName}`);
        }
      } else {
        throw new Error(`Unsupported file format: ${fileName}. Supported: .xlsx, .xls, .csv`);
      }

      await job.updateProgress(50);

      if (parsedRows.length === 0) {
        throw new Error(`No data rows found in file: ${fileName}`);
      }

      // 3. Store as dataset
      const columns = columnNames.map((name: string) => ({
        name,
        type: 'text',
      }));

      await prisma.$queryRawUnsafe(
        `INSERT INTO datasets (id, name, tenant_id, user_id, columns, row_count, column_count, source_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        datasetId,
        fileName.replace(/\.(xlsx|xls|csv)$/i, ''),
        tenantId,
        userId,
        JSON.stringify(columns),
        parsedRows.length,
        columnNames.length,
        isXlsx ? 'excel' : 'csv',
        now,
        now
      );

      // Insert data rows in batches
      const batchSize = 200;
      for (let i = 0; i < parsedRows.length; i += batchSize) {
        const batch = parsedRows.slice(i, i + batchSize);
        const insertValues: string[] = [];
        const insertParams: unknown[] = [];
        let paramIdx = 1;

        for (let j = 0; j < batch.length; j++) {
          const rowId = uuidv4();
          insertValues.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3})`);
          insertParams.push(rowId, datasetId, i + j, JSON.stringify(batch[j]));
          paramIdx += 4;
        }

        if (insertValues.length > 0) {
          await prisma.$queryRawUnsafe(
            `INSERT INTO dataset_rows (id, dataset_id, row_index, data) VALUES ${insertValues.join(', ')}`,
            ...insertParams
          );
        }

        const progress = 50 + Math.round((i / parsedRows.length) * 30);
        await job.updateProgress(progress);
      }

      await job.updateProgress(80);

      // 4. Generate dashboard from the dataset
      const generator = new AutoDashboardGeneratorService();
      const result = await generator.generateFromDataset({
        datasetId,
        tenantId,
        userId,
        dashboardName: dashboardName ?? `${fileName} - لوحة مؤشرات`,
      });

      await job.updateProgress(100);

      // Update job status cache
      await cacheSet(`dashboard:job:${jobId}`, {
        jobId,
        status: 'completed',
        dashboardId: result.dashboardId,
        widgetCount: result.widgets.length,
        completedAt: new Date().toISOString(),
      }, 86400);

      logger.info('Excel-to-dashboard job completed', {
        jobId,
        dashboardId: result.dashboardId,
        datasetId,
        widgetCount: result.widgets.length,
      });

      return {
        dashboardId: result.dashboardId,
        datasetId,
        widgetCount: result.widgets.length,
      };

    } catch (err) {
      const errorMessage = (err as Error).message;
      logger.error('Excel-to-dashboard job failed', { jobId, error: errorMessage });

      await cacheSet(`dashboard:job:${jobId}`, {
        jobId,
        status: 'failed',
        error: errorMessage,
        failedAt: new Date().toISOString(),
      }, 86400);

      throw err;
    }
  }, {
    connection,
    concurrency: 3,
    limiter: { max: 10, duration: 60000 },
  });

  worker.on('completed', (job: Job) => {
    logger.info('Auto-dashboard job completed', { jobId: job.id });
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error('Auto-dashboard job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Auto-dashboard worker started', { queue: QUEUE_NAME });

  return worker;
}

export const autoDashboardGeneratorService = new AutoDashboardGeneratorService();
