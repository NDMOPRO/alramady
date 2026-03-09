import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new PrismaClient();

interface ProactiveAlert {
  id: string;
  tenantId: string;
  type: 'anomaly' | 'threshold_breach' | 'trend_change' | 'data_quality' | 'stale_data';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  suggestedAction: string;
  relatedEntityId: string;
  relatedEntityType: string;
  isDismissed: boolean;
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

interface AutomatedInsight {
  id: string;
  tenantId: string;
  category: 'trend' | 'outlier' | 'correlation' | 'pattern' | 'summary';
  title: string;
  description: string;
  dataPoints: Record<string, unknown>;
  confidence: number;
  generatedAt: Date;
}

interface ForecastResult {
  datasetId: string;
  column: string;
  historicalValues: number[];
  forecastedValues: number[];
  periods: number;
  smoothingFactor: number;
  mape: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  generatedAt: Date;
}

interface DashboardSuggestion {
  id: string;
  title: string;
  description: string;
  suggestedWidgets: WidgetSuggestion[];
  basedOnDatasets: string[];
  confidence: number;
}

interface WidgetSuggestion {
  type: 'line_chart' | 'bar_chart' | 'pie_chart' | 'kpi_card' | 'table' | 'heatmap' | 'gauge';
  title: string;
  datasetId: string;
  columns: string[];
  aggregation: string;
  reason: string;
}

interface ReportSuggestion {
  id: string;
  title: string;
  description: string;
  suggestedSections: ReportSection[];
  basedOnDatasets: string[];
  confidence: number;
}

interface ReportSection {
  title: string;
  type: 'executive_summary' | 'data_analysis' | 'trend_analysis' | 'comparison' | 'recommendations';
  datasetId: string;
  columns: string[];
  description: string;
}

interface ThresholdConfig {
  anomalyZScoreThreshold: number;
  staleDataDays: number;
  qualityScoreMin: number;
  trendChangePercent: number;
  enabledAlertTypes: string[];
}

const ThresholdConfigSchema = z.object({
  anomalyZScoreThreshold: z.number().min(1).max(5).default(2.5),
  staleDataDays: z.number().int().min(1).max(365).default(30),
  qualityScoreMin: z.number().min(0).max(1).default(0.7),
  trendChangePercent: z.number().min(1).max(100).default(15),
  enabledAlertTypes: z
    .array(z.enum(['anomaly', 'threshold_breach', 'trend_change', 'data_quality', 'stale_data']))
    .default(['anomaly', 'threshold_breach', 'trend_change', 'data_quality', 'stale_data']),
});

export class ProactiveAIService {
  async startProactiveMonitoring(tenantId: string): Promise<{
    status: string;
    alertsGenerated: number;
    insightsGenerated: number;
  }> {
    const alerts = await this.checkForAnomalies(tenantId);
    const insights = await this.generateAutomatedInsights(tenantId);

    await prisma.auditLog.create({
      data: {
        action: 'proactive_monitoring_started',
        entityType: 'proactive',
        entityId: tenantId,
        details: JSON.stringify({
          alertsGenerated: alerts.length,
          insightsGenerated: insights.length,
        }),
        performedAt: new Date(),
      },
    });

    return {
      status: 'monitoring_active',
      alertsGenerated: alerts.length,
      insightsGenerated: insights.length,
    };
  }

  async checkForAnomalies(tenantId: string): Promise<ProactiveAlert[]> {
    const config = await this.getThresholdConfig(tenantId);
    const alerts: ProactiveAlert[] = [];

    const datasets = await prisma.dataset.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        rowCount: true,
        columnCount: true,
        columns: true,
        updatedAt: true,
      },
    });

    const now = new Date();
    const staleCutoff = new Date(
      now.getTime() - config.staleDataDays * 24 * 60 * 60 * 1000
    );

    for (const dataset of datasets) {
      if (
        config.enabledAlertTypes.includes('stale_data') &&
        dataset.updatedAt < staleCutoff
      ) {
        const daysSinceUpdate = Math.floor(
          (now.getTime() - dataset.updatedAt.getTime()) / (24 * 60 * 60 * 1000)
        );

        alerts.push(
          this.createAlert(tenantId, {
            type: 'stale_data',
            severity: daysSinceUpdate > config.staleDataDays * 2 ? 'high' : 'medium',
            title: `بيانات قديمة: "${dataset.name}"`,
            description: `لم يتم تحديث مجموعة البيانات منذ ${daysSinceUpdate} يوم. آخر تحديث: ${dataset.updatedAt.toISOString().split('T')[0]}.`,
            suggestedAction: `قم بتحديث مجموعة البيانات "${dataset.name}" أو قم بإعداد التحديث التلقائي.`,
            relatedEntityId: dataset.id,
            relatedEntityType: 'dataset',
            confidence: 0.95,
            metadata: { daysSinceUpdate, lastUpdated: dataset.updatedAt.toISOString() },
          })
        );
      }

      if (config.enabledAlertTypes.includes('data_quality')) {
        const dataRows = await this.fetchDatasetRows(dataset.id, 1000);
        const columns = this.parseColumns(dataset.columns);

        for (const col of columns) {
          const values = dataRows
            .map((row) => row[col])
            .filter((v): v is number => typeof v === 'number' && !isNaN(v));

          if (values.length < 10) {
            continue;
          }

          const nullCount = dataRows.filter(
            (row) => row[col] === null || row[col] === undefined
          ).length;
          const nullRatio = nullCount / dataRows.length;

          if (nullRatio > 0.3) {
            alerts.push(
              this.createAlert(tenantId, {
                type: 'data_quality',
                severity: nullRatio > 0.5 ? 'high' : 'medium',
                title: `جودة بيانات منخفضة: العمود "${col}" في "${dataset.name}"`,
                description: `نسبة القيم الفارغة ${(nullRatio * 100).toFixed(1)}% في العمود "${col}".`,
                suggestedAction: `قم بمراجعة وتنظيف العمود "${col}" في مجموعة البيانات "${dataset.name}".`,
                relatedEntityId: dataset.id,
                relatedEntityType: 'dataset',
                confidence: 0.9,
                metadata: { column: col, nullRatio, nullCount, totalRows: dataRows.length },
              })
            );
          }

          if (
            config.enabledAlertTypes.includes('anomaly') &&
            values.length >= 20
          ) {
            const { mean, stddev } = this.computeStats(values);

            if (stddev > 0) {
              const anomalies = values.filter(
                (v) =>
                  Math.abs((v - mean) / stddev) >
                  config.anomalyZScoreThreshold
              );

              if (anomalies.length > 0) {
                alerts.push(
                  this.createAlert(tenantId, {
                    type: 'anomaly',
                    severity: anomalies.length > 5 ? 'high' : 'medium',
                    title: `قيم شاذة في العمود "${col}" من "${dataset.name}"`,
                    description: `تم اكتشاف ${anomalies.length} قيمة شاذة (z-score > ${config.anomalyZScoreThreshold}). المتوسط: ${mean.toFixed(2)}, الانحراف المعياري: ${stddev.toFixed(2)}.`,
                    suggestedAction: `تحقق من القيم الشاذة في العمود "${col}" وقرر ما إذا كانت أخطاء أو بيانات حقيقية.`,
                    relatedEntityId: dataset.id,
                    relatedEntityType: 'dataset',
                    confidence: 0.85,
                    metadata: {
                      column: col,
                      anomalyCount: anomalies.length,
                      mean,
                      stddev,
                      threshold: config.anomalyZScoreThreshold,
                      sampleAnomalies: anomalies.slice(0, 5),
                    },
                  })
                );
              }
            }
          }

          if (
            config.enabledAlertTypes.includes('trend_change') &&
            values.length >= 10
          ) {
            const halfPoint = Math.floor(values.length / 2);
            const firstHalf = values.slice(0, halfPoint);
            const secondHalf = values.slice(halfPoint);

            const firstMean = this.computeStats(firstHalf).mean;
            const secondMean = this.computeStats(secondHalf).mean;

            if (firstMean !== 0) {
              const changePercent =
                ((secondMean - firstMean) / Math.abs(firstMean)) * 100;

              if (Math.abs(changePercent) > config.trendChangePercent) {
                const direction = changePercent > 0 ? 'ارتفاع' : 'انخفاض';
                alerts.push(
                  this.createAlert(tenantId, {
                    type: 'trend_change',
                    severity: Math.abs(changePercent) > config.trendChangePercent * 2 ? 'high' : 'medium',
                    title: `تغيير في اتجاه العمود "${col}" من "${dataset.name}"`,
                    description: `تم اكتشاف ${direction} بنسبة ${Math.abs(changePercent).toFixed(1)}% بين النصف الأول والثاني من البيانات.`,
                    suggestedAction: `تحقق من سبب ${direction} البيانات في العمود "${col}".`,
                    relatedEntityId: dataset.id,
                    relatedEntityType: 'dataset',
                    confidence: 0.8,
                    metadata: {
                      column: col,
                      changePercent,
                      firstHalfMean: firstMean,
                      secondHalfMean: secondMean,
                    },
                  })
                );
              }
            }
          }
        }
      }
    }

    for (const alert of alerts) {
      await prisma.auditLog.create({
        data: {
          action: 'proactive_alert_created',
          entityType: 'proactiveAlert',
          entityId: alert.id,
          details: JSON.stringify({
            tenantId,
            type: alert.type,
            severity: alert.severity,
            title: alert.title,
            relatedEntityId: alert.relatedEntityId,
          }),
          performedAt: new Date(),
        },
      });
    }

    return alerts;
  }

  async generateAutomatedInsights(
    tenantId: string
  ): Promise<AutomatedInsight[]> {
    const datasets = await prisma.dataset.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        rowCount: true,
        columnCount: true,
        columns: true,
        updatedAt: true,
      },
      take: 20,
    });

    const insights: AutomatedInsight[] = [];

    for (const dataset of datasets) {
      const rows = await this.fetchDatasetRows(dataset.id, 500);
      const columns = this.parseColumns(dataset.columns);

      const numericColumns: string[] = [];
      const columnStats: Record<
        string,
        { mean: number; stddev: number; min: number; max: number; count: number }
      > = {};

      for (const col of columns) {
        const values = rows
          .map((r) => r[col])
          .filter((v): v is number => typeof v === 'number' && !isNaN(v));

        if (values.length >= 5) {
          numericColumns.push(col);
          const { mean, stddev } = this.computeStats(values);
          columnStats[col] = {
            mean,
            stddev,
            min: Math.min(...values),
            max: Math.max(...values),
            count: values.length,
          };
        }
      }

      if (numericColumns.length === 0) {
        continue;
      }

      for (const col of numericColumns) {
        const stats = columnStats[col];
        insights.push({
          id: randomUUID(),
          tenantId,
          category: 'summary',
          title: `ملخص إحصائي: "${col}" في "${dataset.name}"`,
          description: `المتوسط: ${stats.mean.toFixed(2)}, الانحراف المعياري: ${stats.stddev.toFixed(2)}, الحد الأدنى: ${stats.min.toFixed(2)}, الحد الأقصى: ${stats.max.toFixed(2)}, عدد القيم: ${stats.count}.`,
          dataPoints: { column: col, datasetId: dataset.id, ...stats },
          confidence: 0.95,
          generatedAt: new Date(),
        });
      }

      for (let i = 0; i < numericColumns.length; i++) {
        for (let j = i + 1; j < numericColumns.length; j++) {
          const colA = numericColumns[i];
          const colB = numericColumns[j];

          const pairedValues: Array<{ a: number; b: number }> = [];
          for (const row of rows) {
            const a = row[colA];
            const b = row[colB];
            if (
              typeof a === 'number' &&
              !isNaN(a) &&
              typeof b === 'number' &&
              !isNaN(b)
            ) {
              pairedValues.push({ a, b });
            }
          }

          if (pairedValues.length < 10) {
            continue;
          }

          const correlation = this.computeCorrelation(
            pairedValues.map((p) => p.a),
            pairedValues.map((p) => p.b)
          );

          if (Math.abs(correlation) > 0.7) {
            const direction =
              correlation > 0 ? 'ارتباط طردي' : 'ارتباط عكسي';
            insights.push({
              id: randomUUID(),
              tenantId,
              category: 'correlation',
              title: `${direction} بين "${colA}" و "${colB}" في "${dataset.name}"`,
              description: `معامل الارتباط: ${correlation.toFixed(3)}. هذا يشير إلى ${direction} قوي بين العمودين.`,
              dataPoints: {
                columnA: colA,
                columnB: colB,
                correlation,
                datasetId: dataset.id,
                pairCount: pairedValues.length,
              },
              confidence: Math.min(0.95, 0.6 + Math.abs(correlation) * 0.35),
              generatedAt: new Date(),
            });
          }
        }
      }

      for (const col of numericColumns) {
        const values = rows
          .map((r) => r[col])
          .filter((v): v is number => typeof v === 'number' && !isNaN(v));

        if (values.length >= 20) {
          const trend = this.detectTrend(values);
          if (trend.direction !== 'stable') {
            insights.push({
              id: randomUUID(),
              tenantId,
              category: 'trend',
              title: `اتجاه ${trend.direction === 'increasing' ? 'تصاعدي' : 'تنازلي'}: "${col}" في "${dataset.name}"`,
              description: `تم اكتشاف اتجاه ${trend.direction === 'increasing' ? 'تصاعدي' : 'تنازلي'} بميل ${trend.slope.toFixed(4)} لكل صف.`,
              dataPoints: {
                column: col,
                datasetId: dataset.id,
                slope: trend.slope,
                direction: trend.direction,
                rSquared: trend.rSquared,
              },
              confidence: Math.min(0.95, 0.5 + trend.rSquared * 0.5),
              generatedAt: new Date(),
            });
          }
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        action: 'automated_insights_generated',
        entityType: 'proactive',
        entityId: tenantId,
        details: JSON.stringify({
          insightCount: insights.length,
          datasetCount: datasets.length,
        }),
        performedAt: new Date(),
      },
    });

    return insights;
  }

  async predictForecast(
    datasetId: string,
    column: string,
    periods: number
  ): Promise<ForecastResult> {
    const rows = await this.fetchDatasetRows(datasetId, 5000);

    const values = rows
      .map((r) => r[column])
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));

    if (values.length < 5) {
      throw new Error(
        `Insufficient numeric data in column "${column}": found ${values.length} values, need at least 5`
      );
    }

    const alpha = this.optimizeSmoothing(values);
    const forecasted = this.exponentialSmoothing(values, alpha, periods);
    const mape = this.computeMAPE(values, alpha);
    const trend = this.detectTrend(values);

    await prisma.auditLog.create({
      data: {
        action: 'forecast_generated',
        entityType: 'forecast',
        entityId: datasetId,
        details: JSON.stringify({
          column,
          periods,
          historicalCount: values.length,
          smoothingFactor: alpha,
          mape,
          trend: trend.direction,
        }),
        performedAt: new Date(),
      },
    });

    return {
      datasetId,
      column,
      historicalValues: values,
      forecastedValues: forecasted,
      periods,
      smoothingFactor: alpha,
      mape,
      trend: trend.direction,
      generatedAt: new Date(),
    };
  }

  async suggestDashboards(
    tenantId: string
  ): Promise<DashboardSuggestion[]> {
    const datasets = await prisma.dataset.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        rowCount: true,
        columnCount: true,
        columns: true,
      },
      take: 20,
    });

    if (datasets.length === 0) {
      return [];
    }

    const datasetSummaries = datasets.map((ds) => {
      const columns = this.parseColumns(ds.columns);
      return {
        id: ds.id,
        name: ds.name,
        rowCount: ds.rowCount,
        columnCount: ds.columnCount,
        columns,
      };
    });

    const prompt = `You are a dashboard design expert for the Rasid analytics platform.
Based on the available datasets, suggest optimal dashboard configurations.

Available datasets:
${datasetSummaries.map((ds) => `- "${ds.name}" (${ds.rowCount} rows, columns: ${ds.columns.join(', ')})`).join('\n')}

Suggest 1-3 dashboards in JSON:
{
  "dashboards": [
    {
      "title": "Dashboard title in Arabic",
      "description": "Dashboard purpose in Arabic",
      "suggestedWidgets": [
        {
          "type": "line_chart|bar_chart|pie_chart|kpi_card|table|heatmap|gauge",
          "title": "Widget title in Arabic",
          "datasetId": "dataset-uuid",
          "columns": ["column1", "column2"],
          "aggregation": "sum|avg|count|max|min",
          "reason": "Why this widget is useful"
        }
      ],
      "basedOnDatasets": ["dataset-uuid"],
      "confidence": 0.85
    }
  ]
}

Rules:
- Use actual dataset IDs and column names from the provided data
- Each dashboard should serve a clear business purpose
- Include 3-6 widgets per dashboard
- Write titles/descriptions in Arabic (formal MSA)`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for dashboard suggestions');
    }

    const parsed: { dashboards: DashboardSuggestion[] } = JSON.parse(content);

    return parsed.dashboards.slice(0, 3).map((d) => ({
      id: randomUUID(),
      title: d.title,
      description: d.description,
      suggestedWidgets: (d.suggestedWidgets ?? []).slice(0, 6).map((w) => ({
        type: w.type,
        title: w.title,
        datasetId: w.datasetId,
        columns: w.columns ?? [],
        aggregation: w.aggregation ?? 'count',
        reason: w.reason ?? '',
      })),
      basedOnDatasets: d.basedOnDatasets ?? [],
      confidence: typeof d.confidence === 'number' ? d.confidence : 0.7,
    }));
  }

  async suggestReports(tenantId: string): Promise<ReportSuggestion[]> {
    const datasets = await prisma.dataset.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        rowCount: true,
        columnCount: true,
        columns: true,
      },
      take: 20,
    });

    if (datasets.length === 0) {
      return [];
    }

    const datasetSummaries = datasets.map((ds) => {
      const columns = this.parseColumns(ds.columns);
      return {
        id: ds.id,
        name: ds.name,
        rowCount: ds.rowCount,
        columnCount: ds.columnCount,
        columns,
      };
    });

    const prompt = `You are a report design expert for the Rasid analytics platform.
Based on the available datasets, suggest professional reports.

Available datasets:
${datasetSummaries.map((ds) => `- "${ds.name}" (${ds.rowCount} rows, columns: ${ds.columns.join(', ')})`).join('\n')}

Suggest 1-3 reports in JSON:
{
  "reports": [
    {
      "title": "Report title in Arabic",
      "description": "Report purpose in Arabic",
      "suggestedSections": [
        {
          "title": "Section title in Arabic",
          "type": "executive_summary|data_analysis|trend_analysis|comparison|recommendations",
          "datasetId": "dataset-uuid",
          "columns": ["column1", "column2"],
          "description": "What this section covers"
        }
      ],
      "basedOnDatasets": ["dataset-uuid"],
      "confidence": 0.85
    }
  ]
}

Rules:
- Use actual dataset IDs and column names
- Each report should serve a distinct analytical purpose
- Include 3-5 sections per report
- Write in Arabic (formal MSA)`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for report suggestions');
    }

    const parsed: { reports: ReportSuggestion[] } = JSON.parse(content);

    return parsed.reports.slice(0, 3).map((r) => ({
      id: randomUUID(),
      title: r.title,
      description: r.description,
      suggestedSections: (r.suggestedSections ?? []).slice(0, 5).map((s) => ({
        title: s.title,
        type: s.type,
        datasetId: s.datasetId,
        columns: s.columns ?? [],
        description: s.description ?? '',
      })),
      basedOnDatasets: r.basedOnDatasets ?? [],
      confidence: typeof r.confidence === 'number' ? r.confidence : 0.7,
    }));
  }

  async getAlerts(tenantId: string): Promise<ProactiveAlert[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: 'proactiveAlert',
        action: 'proactive_alert_created',
        details: {
          path: ['tenantId'],
          equals: tenantId,
        },
      },
      orderBy: { performedAt: 'desc' },
      take: 100,
    });

    const dismissedIds = new Set<string>();
    const dismissLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'proactiveAlert',
        action: 'proactive_alert_dismissed',
      },
      select: { entityId: true },
    });
    for (const log of dismissLogs) {
      dismissedIds.add(log.entityId);
    }

    return logs
      .filter((log) => !dismissedIds.has(log.entityId))
      .map((log) => {
        const details =
          typeof log.details === 'string'
            ? (JSON.parse(log.details) as Record<string, unknown>)
            : (log.details as Record<string, unknown>) ?? {};

        return {
          id: log.entityId,
          tenantId,
          type: (details['type'] as ProactiveAlert['type']) ?? 'anomaly',
          severity: (details['severity'] as ProactiveAlert['severity']) ?? 'medium',
          title: (details['title'] as string) ?? '',
          description: (details['description'] as string) ?? '',
          suggestedAction: (details['suggestedAction'] as string) ?? '',
          relatedEntityId: (details['relatedEntityId'] as string) ?? '',
          relatedEntityType: (details['relatedEntityType'] as string) ?? '',
          isDismissed: false,
          confidence: (details['confidence'] as number) ?? 0.5,
          metadata: (details['metadata'] as Record<string, unknown>) ?? {},
          createdAt: log.performedAt,
        };
      });
  }

  async dismissAlert(alertId: string): Promise<{ dismissed: boolean }> {
    await prisma.auditLog.create({
      data: {
        action: 'proactive_alert_dismissed',
        entityType: 'proactiveAlert',
        entityId: alertId,
        details: JSON.stringify({ dismissedAt: new Date().toISOString() }),
        performedAt: new Date(),
      },
    });

    return { dismissed: true };
  }

  async configureThresholds(
    tenantId: string,
    config: ThresholdConfig
  ): Promise<{ saved: boolean; config: ThresholdConfig }> {
    const validated = ThresholdConfigSchema.parse(config);

    await prisma.auditLog.create({
      data: {
        action: 'proactive_thresholds_configured',
        entityType: 'proactiveConfig',
        entityId: tenantId,
        details: JSON.stringify(validated),
        performedAt: new Date(),
      },
    });

    return { saved: true, config: validated };
  }

  private async getThresholdConfig(
    tenantId: string
  ): Promise<ThresholdConfig> {
    const log = await prisma.auditLog.findFirst({
      where: {
        entityType: 'proactiveConfig',
        entityId: tenantId,
        action: 'proactive_thresholds_configured',
      },
      orderBy: { performedAt: 'desc' },
    });

    if (!log) {
      return {
        anomalyZScoreThreshold: 2.5,
        staleDataDays: 30,
        qualityScoreMin: 0.7,
        trendChangePercent: 15,
        enabledAlertTypes: [
          'anomaly',
          'threshold_breach',
          'trend_change',
          'data_quality',
          'stale_data',
        ],
      };
    }

    const details =
      typeof log.details === 'string'
        ? (JSON.parse(log.details) as Record<string, unknown>)
        : (log.details as Record<string, unknown>) ?? {};

    return ThresholdConfigSchema.parse(details);
  }

  private createAlert(
    tenantId: string,
    params: Omit<ProactiveAlert, 'id' | 'tenantId' | 'isDismissed' | 'createdAt'>
  ): ProactiveAlert {
    return {
      id: randomUUID(),
      tenantId,
      type: params.type,
      severity: params.severity,
      title: params.title,
      description: params.description,
      suggestedAction: params.suggestedAction,
      relatedEntityId: params.relatedEntityId,
      relatedEntityType: params.relatedEntityType,
      isDismissed: false,
      confidence: params.confidence,
      metadata: params.metadata,
      createdAt: new Date(),
    };
  }

  private async fetchDatasetRows(
    datasetId: string,
    limit: number
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => {
      if (typeof row.data === 'string') {
        return JSON.parse(row.data) as Record<string, unknown>;
      }
      return (row.data as Record<string, unknown>) ?? {};
    });
  }

  private parseColumns(columns: unknown): string[] {
    if (Array.isArray(columns)) {
      return columns.filter(
        (c): c is string => typeof c === 'string'
      );
    }
    if (typeof columns === 'string') {
      try {
        const parsed: unknown = JSON.parse(columns);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (c): c is string => typeof c === 'string'
          );
        }
      } catch {
        return [];
      }
    }
    return [];
  }

  private computeStats(values: number[]): { mean: number; stddev: number } {
    const n = values.length;
    if (n === 0) {
      return { mean: 0, stddev: 0 };
    }

    const mean = values.reduce((sum, v) => sum + v, 0) / n;

    const variance =
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
    const stddev = Math.sqrt(variance);

    return { mean, stddev };
  }

  private computeCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 3) {
      return 0;
    }

    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);

    const xMean = xSlice.reduce((s, v) => s + v, 0) / n;
    const yMean = ySlice.reduce((s, v) => s + v, 0) / n;

    let numerator = 0;
    let xDenominator = 0;
    let yDenominator = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = xSlice[i] - xMean;
      const yDiff = ySlice[i] - yMean;
      numerator += xDiff * yDiff;
      xDenominator += xDiff ** 2;
      yDenominator += yDiff ** 2;
    }

    const denominator = Math.sqrt(xDenominator * yDenominator);
    if (denominator === 0) {
      return 0;
    }

    return numerator / denominator;
  }

  private detectTrend(
    values: number[]
  ): { direction: 'increasing' | 'decreasing' | 'stable'; slope: number; rSquared: number } {
    const n = values.length;
    if (n < 5) {
      return { direction: 'stable', slope: 0, rSquared: 0 };
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
      sumY2 += values[i] * values[i];
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return { direction: 'stable', slope: 0, rSquared: 0 };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;

    const ssRes = values.reduce((sum, v, i) => {
      const predicted = (sumY / n) + slope * (i - sumX / n);
      return sum + (v - predicted) ** 2;
    }, 0);

    const yMean = sumY / n;
    const ssTot = values.reduce(
      (sum, v) => sum + (v - yMean) ** 2,
      0
    );

    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    let direction: 'increasing' | 'decreasing' | 'stable';
    if (rSquared < 0.1) {
      direction = 'stable';
    } else if (slope > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    return { direction, slope, rSquared: Math.max(0, rSquared) };
  }

  private exponentialSmoothing(
    values: number[],
    alpha: number,
    periods: number
  ): number[] {
    if (values.length === 0) {
      return [];
    }

    let smoothed = values[0];
    for (let i = 1; i < values.length; i++) {
      smoothed = alpha * values[i] + (1 - alpha) * smoothed;
    }

    const trend = this.detectTrend(values);
    const forecasted: number[] = [];

    for (let i = 1; i <= periods; i++) {
      const forecastValue = smoothed + trend.slope * i;
      forecasted.push(parseFloat(forecastValue.toFixed(4)));
    }

    return forecasted;
  }

  private optimizeSmoothing(values: number[]): number {
    let bestAlpha = 0.3;
    let bestError = Infinity;

    for (let alpha = 0.05; alpha <= 0.95; alpha += 0.05) {
      const error = this.computeMAPE(values, alpha);
      if (error < bestError) {
        bestError = error;
        bestAlpha = alpha;
      }
    }

    return parseFloat(bestAlpha.toFixed(2));
  }

  private computeMAPE(values: number[], alpha: number): number {
    if (values.length < 3) {
      return 0;
    }

    let smoothed = values[0];
    let totalError = 0;
    let count = 0;

    for (let i = 1; i < values.length; i++) {
      const predicted = smoothed;
      const actual = values[i];

      if (actual !== 0) {
        totalError += Math.abs((actual - predicted) / actual);
        count++;
      }

      smoothed = alpha * actual + (1 - alpha) * smoothed;
    }

    return count > 0 ? (totalError / count) * 100 : 0;
  }
}
