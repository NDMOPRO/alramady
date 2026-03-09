import { v4 as uuidv4 } from 'uuid';
import { Prisma, WidgetType } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet } from '../utils/redis';
import { logger } from '../utils/logger';
import { BaseCrudService, ListParams } from './base/base-crud.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DesignTokens {
  colors: string[];
  font: string;
  themeId: string;
  borderRadius: number;
  shadowLevel: string;
}

interface SimulationResult {
  datasetId: string;
  totalRows: number;
  estimatedTimeMs: number;
  canRender: boolean;
  recommendation: string;
  processingTime: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class ExternalSimulationService extends BaseCrudService {
  protected readonly modelName = 'dashboardExternalSimulation';
  protected readonly entityLabel = 'DashboardExternalSimulation';
  protected readonly cachePrefix = 'dashboard:external-simulation';
  protected readonly cacheTtl = 300;

  protected buildSearchWhere(search: string) {
    return {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  protected buildFilterWhere(params: ListParams) {
    const where: Record<string, unknown> = {};
    if (params.dashboardId) where.dashboardId = params.dashboardId;
    if (params.simulationType) where.simulationType = params.simulationType;
    if (params.status) where.status = params.status;
    return where;
  }

  async create(data: Record<string, unknown>) {
    return super.create({ ...data, status: 'pending' });
  }

  async execute(id: string) {
    const simulation = await this.getById(id) as Record<string, unknown>;
    await prisma.dashboardExternalSimulation.update({
      where: { id },
      data: { status: 'running' },
    });
    logger.info('External simulation started', { id });

    const inputParams = (simulation.inputParameters ?? simulation.config as Record<string, unknown>) ?? {};
    const scenarioConfig = (simulation.scenarioConfig ?? {}) as Record<string, unknown>;
    const simulationType = simulation.simulationType as string;

    const resultData: Record<string, unknown> = {
      executedAt: new Date().toISOString(),
      simulationType,
      iterations: 0,
      metrics: {} as Record<string, unknown>,
    };

    if (simulationType === 'monte_carlo' || simulationType === 'what_if') {
      const iterations = ((inputParams as Record<string, unknown>).iterations as number) || 1000;
      const variables = ((inputParams as Record<string, unknown>).variables as Array<{ name: string; min: number; max: number; distribution?: string }>) ?? [];
      const results: Array<Record<string, number>> = [];

      for (let i = 0; i < iterations; i++) {
        const row: Record<string, number> = {};
        for (const v of variables) {
          const dist = v.distribution || 'uniform';
          if (dist === 'normal') {
            const u1 = (i * 2654435761 + 1) % 4294967296 / 4294967296;
            const u2 = ((i + 1) * 2654435761 + 1) % 4294967296 / 4294967296;
            const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
            const mean = (v.min + v.max) / 2;
            const stddev = (v.max - v.min) / 6;
            row[v.name] = Math.max(v.min, Math.min(v.max, mean + z * stddev));
          } else {
            const t = ((i * 2654435761 + 1) % 4294967296) / 4294967296;
            row[v.name] = v.min + t * (v.max - v.min);
          }
        }
        results.push(row);
      }

      const metrics: Record<string, { mean: number; median: number; min: number; max: number; stddev: number; p5: number; p95: number }> = {};
      for (const v of variables) {
        const values = results.map((r) => r[v.name]).sort((a, b) => a - b);
        const mean = values.reduce((s, x) => s + x, 0) / values.length;
        const variance = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
        metrics[v.name] = {
          mean,
          median: values[Math.floor(values.length / 2)],
          min: values[0],
          max: values[values.length - 1],
          stddev: Math.sqrt(variance),
          p5: values[Math.floor(values.length * 0.05)],
          p95: values[Math.floor(values.length * 0.95)],
        };
      }

      resultData.iterations = iterations;
      resultData.metrics = metrics;
      resultData.sampleResults = results.slice(0, 100);
    } else if (simulationType === 'sensitivity') {
      const baseValues = ((inputParams as Record<string, unknown>).baseValues as Record<string, number>) ?? {};
      const sensitivities: Record<string, { impact: number; elasticity: number }> = {};

      for (const [key, baseVal] of Object.entries(baseValues)) {
        const perturbedUp = { ...baseValues, [key]: baseVal * 1.1 };
        const perturbedDown = { ...baseValues, [key]: baseVal * 0.9 };
        const baseResult = Object.values(baseValues).reduce((s, v) => s + v, 0);
        const upResult = Object.values(perturbedUp).reduce((s, v) => s + v, 0);
        const downResult = Object.values(perturbedDown).reduce((s, v) => s + v, 0);
        const impact = (upResult - downResult) / (2 * baseVal * 0.1);
        sensitivities[key] = {
          impact,
          elasticity: baseVal !== 0 ? (impact * baseVal) / baseResult : 0,
        };
      }

      resultData.metrics = sensitivities;
      resultData.baseResult = Object.values(baseValues).reduce((s, v) => s + v, 0);
    } else {
      const dataPoints = ((inputParams as Record<string, unknown>).dataPoints as Array<Record<string, number>>) ?? [];
      resultData.metrics = {
        rowCount: dataPoints.length,
        summary: 'Scenario simulation completed',
      };
      resultData.processedRows = dataPoints.length;
    }

    const completed = await prisma.dashboardExternalSimulation.update({
      where: { id },
      data: {
        status: 'completed',
        resultData: JSON.parse(JSON.stringify(resultData)) as Prisma.InputJsonValue,
      },
    });

    logger.info('External simulation completed', { id, simulationType });
    await this.invalidateCache(id);
    return completed;
  }

  async cancel(id: string) {
    const updated = await prisma.dashboardExternalSimulation.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    logger.info('External simulation cancelled', { id });
    await this.invalidateCache(id);
    return updated;
  }

  async getResults(id: string) {
    const record = await this.getById(id) as Record<string, unknown>;
    return { id, status: record.status, resultData: record.resultData };
  }

  /**
   * E03.07: Simulate dashboard from image — analyze layout and create matching dashboard.
   */
  async simulateFromImage(params: {
    tenantId: string;
    userId: string;
    imageAnalysis: Record<string, unknown>;
    datasetId: string;
  }) {
    const analysis = params.imageAnalysis;
    const elements = (analysis.elements as Array<Record<string, unknown>>) ?? [];
    const detectedTheme = (analysis.theme as string) || 'professional';

    // Build dashboard from analysis
    const dashboardId = uuidv4();
    const now = new Date();

    const dashboard = await prisma.dashboard.create({
      data: {
        tenantId: params.tenantId,
        createdById: params.userId,
        name: 'محاكاة تصميم خارجي',
        slug: `simulated-${Date.now()}`,
        layout: {
          columns: 12,
          rowHeight: 60,
          source: 'image_simulation',
        } as Prisma.InputJsonValue,
        filters: [] as Prisma.InputJsonValue,
        theme: { mode: detectedTheme } as Prisma.InputJsonValue,
      },
    });

    // Create widgets from detected elements
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const position = (el.position as Record<string, number>) ?? { x: 0, y: i * 4 };

      await prisma.dashboardWidget.create({
        data: {
          dashboardId: dashboard.id,
          type: this.mapElementType((el.type as string) || 'bar'),
          title: (el.title as string) || `عنصر ${i + 1}`,
          config: {
            rtl: true,
            font: 'Tajawal',
            sourceType: 'image_simulation',
            originalConfig: el.config || {},
            dataBinding: {
              datasetId: params.datasetId,
              column: 'auto',
              aggregation: 'sum',
            },
          } as Prisma.InputJsonValue,
          position: position as Prisma.InputJsonValue,
          size: {
            w: (position.w as number) || 6,
            h: (position.h as number) || 4,
          } as Prisma.InputJsonValue,
          datasetId: params.datasetId,
          sortOrder: i,
        },
      });
    }

    logger.info('Dashboard simulated from image', {
      dashboardId: dashboard.id,
      elementCount: elements.length,
    });

    return {
      id: dashboard.id,
      name: dashboard.name,
      elementCount: elements.length,
      theme: detectedTheme,
    };
  }

  /**
   * E03.07: Generate chart specification from a text prompt.
   */
  async generateChartFromPrompt(params: {
    prompt: string;
    datasetId: string;
  }) {
    const prompt = params.prompt.toLowerCase();

    // Rule-based chart type inference from prompt
    let chartType = 'BAR_CHART';
    let aggregation = 'sum';

    if (prompt.includes('خط') || prompt.includes('line') || prompt.includes('trend') || prompt.includes('اتجاه')) {
      chartType = 'LINE_CHART';
    } else if (prompt.includes('دائري') || prompt.includes('pie') || prompt.includes('توزيع')) {
      chartType = 'PIE_CHART';
    } else if (prompt.includes('مساحة') || prompt.includes('area')) {
      chartType = 'AREA_CHART';
    } else if (prompt.includes('جدول') || prompt.includes('table')) {
      chartType = 'TABLE';
    } else if (prompt.includes('مقياس') || prompt.includes('gauge') || prompt.includes('مؤشر')) {
      chartType = 'GAUGE';
    } else if (prompt.includes('kpi') || prompt.includes('بطاقة')) {
      chartType = 'KPI_CARD';
    } else if (prompt.includes('scatter') || prompt.includes('نقطي') || prompt.includes('علاقة')) {
      chartType = 'SCATTER_PLOT';
    } else if (prompt.includes('خريطة') || prompt.includes('heatmap') || prompt.includes('حرارية')) {
      chartType = 'HEATMAP';
    } else if (prompt.includes('رادار') || prompt.includes('radar')) {
      chartType = 'SCATTER_PLOT';
    }

    if (prompt.includes('متوسط') || prompt.includes('average') || prompt.includes('avg')) {
      aggregation = 'avg';
    } else if (prompt.includes('عدد') || prompt.includes('count')) {
      aggregation = 'count';
    } else if (prompt.includes('أعلى') || prompt.includes('max')) {
      aggregation = 'max';
    } else if (prompt.includes('أدنى') || prompt.includes('min')) {
      aggregation = 'min';
    }

    const spec = {
      type: chartType,
      config: {
        title: params.prompt.substring(0, 100),
        titleAr: params.prompt.substring(0, 100),
        rtl: true,
        font: 'Tajawal',
        colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'],
        showLegend: chartType !== 'KPI_CARD',
        showGrid: true,
        animation: true,
        dataBinding: {
          datasetId: params.datasetId,
          column: 'auto',
          aggregation,
        },
      },
      aggregation,
    };

    logger.info('Chart generated from prompt', { prompt: params.prompt, chartType, aggregation });
    return spec;
  }

  /**
   * E03.07: Simulate performance for large dataset conversion.
   */
  async simulateLargeDatasetPerformance(datasetId: string): Promise<SimulationResult> {
    const startTime = Date.now();

    const countResult = await prisma.$queryRawUnsafe<Array<{ total: string }>>(
      `SELECT COUNT(*) as total FROM data_rows WHERE dataset_id = $1`,
      datasetId,
    );

    const totalRows = Number(countResult[0]?.total || 0);
    const chunkSize = 1_000_000;
    const estimatedTimeMs = (totalRows / chunkSize) * 850;

    return {
      datasetId,
      totalRows,
      estimatedTimeMs: Math.round(estimatedTimeMs),
      canRender: estimatedTimeMs < 30_000,
      recommendation: estimatedTimeMs > 30_000 ? 'استخدم Pre-aggregation' : 'يمكن العرض المباشر',
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * E03.07: Extract dominant colors from image data for design tokens.
   */
  extractDesignTokens(imageAnalysis: Record<string, unknown>): DesignTokens {
    const colors = (imageAnalysis.colors as string[]) ?? [
      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4',
    ];

    return {
      colors: colors.slice(0, 6),
      font: (imageAnalysis.font as string) || 'Tajawal',
      themeId: (imageAnalysis.themeId as string) || 'professional',
      borderRadius: (imageAnalysis.borderRadius as number) || 8,
      shadowLevel: (imageAnalysis.shadowLevel as string) || 'medium',
    };
  }

  private mapElementType(type: string): WidgetType {
    const typeMap: Record<string, WidgetType> = {
      bar: WidgetType.BAR_CHART,
      line: WidgetType.LINE_CHART,
      pie: WidgetType.PIE_CHART,
      scatter: WidgetType.SCATTER_PLOT,
      area: WidgetType.AREA_CHART,
      kpi: WidgetType.KPI_CARD,
      table: WidgetType.TABLE,
      gauge: WidgetType.GAUGE,
      heatmap: WidgetType.HEATMAP,
      donut: WidgetType.DONUT_CHART,
      funnel: WidgetType.FUNNEL,
      treemap: WidgetType.TREEMAP,
      map: WidgetType.MAP,
      text: WidgetType.TEXT,
      image: WidgetType.IMAGE,
    };
    return typeMap[type.toLowerCase()] || WidgetType.BAR_CHART;
  }
}

export const externalSimulationService = new ExternalSimulationService();
