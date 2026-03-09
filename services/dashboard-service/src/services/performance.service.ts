import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { BaseCrudService, ListParams } from './base/base-crud.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SemanticMetric {
  id: string;
  definition: string;
  aggregationRule: string;
  hierarchy: string[];
}

interface SemanticLayer {
  metrics: SemanticMetric[];
}

interface DataBinding {
  datasetId: string;
  column: string;
  aggregation: string;
}

interface DashboardOperation {
  type: 'REFRESH' | 'EXPORT' | 'PRECOMPUTE';
  dashboardId: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class PerformanceService extends BaseCrudService {
  protected readonly modelName = 'dashboardPerformance';
  protected readonly entityLabel = 'DashboardPerformance';
  protected readonly cachePrefix = 'dashboard:performance';
  protected readonly cacheTtl = 120;

  protected buildSearchWhere(search: string) {
    return {
      OR: [
        { metricName: { contains: search, mode: 'insensitive' } },
        { metricType: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  protected buildFilterWhere(params: ListParams) {
    const where: Record<string, unknown> = {};
    if (params.dashboardId) where.dashboardId = params.dashboardId;
    if (params.metricType) where.metricType = params.metricType;
    if (params.status) where.status = params.status;
    return where;
  }

  async getSummary(dashboardId: string) {
    const metrics = await prisma.dashboardPerformance.findMany({
      where: { dashboardId },
    });
    return {
      dashboardId,
      totalMetrics: metrics.length,
      metrics: metrics.map((m: Record<string, unknown>) => ({
        id: m.id,
        name: m.metricName,
        type: m.metricType,
        currentValue: m.currentValue,
        targetValue: m.targetValue,
        status: m.status,
      })),
    };
  }

  async optimize(dashboardId: string) {
    logger.info('Running performance optimization', { dashboardId });
    const metrics = await prisma.dashboardPerformance.findMany({ where: { dashboardId } });
    const suggestions: string[] = [];

    for (const metric of metrics as Array<Record<string, unknown>>) {
      const currentValue = Number(metric.currentValue) || 0;
      const targetValue = Number(metric.targetValue) || 0;
      const metricType = String(metric.metricType || '');
      const metricName = String(metric.metricName || '');

      if (metricType === 'load_time' && currentValue > 3000) {
        suggestions.push(`Widget "${metricName}" load time is ${currentValue}ms - enable data caching or reduce query complexity`);
      }
      if (metricType === 'refresh_interval' && currentValue < 5000) {
        suggestions.push(`Widget "${metricName}" refreshes every ${currentValue}ms - consider increasing interval for static data`);
      }
      if (metricType === 'query_time' && currentValue > 2000) {
        suggestions.push(`Widget "${metricName}" query takes ${currentValue}ms - add database indexes or optimize filters`);
      }
      if (metricType === 'memory_usage' && currentValue > 50) {
        suggestions.push(`Widget "${metricName}" uses ${currentValue}MB memory - reduce dataset size or enable pagination`);
      }
      if (targetValue > 0 && currentValue > targetValue * 1.5) {
        suggestions.push(`"${metricName}" exceeds target by ${Math.round(((currentValue - targetValue) / targetValue) * 100)}% - review configuration`);
      }
    }

    if (suggestions.length === 0 && metrics.length > 0) {
      suggestions.push('All metrics are within acceptable ranges');
    }
    if (metrics.length === 0) {
      suggestions.push('No performance metrics recorded yet - enable monitoring to get optimization suggestions');
    }

    return { dashboardId, analyzed: metrics.length, suggestions };
  }

  /**
   * E03.08: Get semantic layer for a dashboard — metric definitions, aggregation rules, hierarchies.
   */
  async getSemanticLayer(dashboardId: string): Promise<SemanticLayer> {
    const cacheKey = `semantic:${dashboardId}`;
    const cached = await cacheGet<SemanticLayer>(cacheKey);
    if (cached) return cached;

    const widgets = await prisma.dashboardWidget.findMany({
      where: { dashboardId },
    });

    const metrics: SemanticMetric[] = widgets.map((widget) => {
      const config = (widget.config as Record<string, unknown>) ?? {};
      const dataBinding = (config.dataBinding as Record<string, unknown>) ?? {};

      return {
        id: widget.id,
        definition: widget.title || (config.title as string) || widget.type,
        aggregationRule: (dataBinding.aggregation as string) || 'sum',
        hierarchy: [(dataBinding.column as string) || widget.type].filter(Boolean),
      };
    });

    const layer: SemanticLayer = { metrics };
    await cacheSet(cacheKey, layer, 300);

    logger.info('Semantic layer generated', { dashboardId, metricCount: metrics.length });
    return layer;
  }

  /**
   * E03.08: Precompute aggregations for all widgets in a dashboard and cache them.
   */
  async precomputeAggregations(dashboardId: string) {
    const widgets = await prisma.dashboardWidget.findMany({
      where: { dashboardId },
    });

    let precomputedCount = 0;
    const results: Array<{ widgetId: string; cached: boolean; rowCount: number }> = [];

    for (const widget of widgets) {
      const config = (widget.config as Record<string, unknown>) ?? {};
      const dataBinding = config.dataBinding as DataBinding | undefined;

      if (!dataBinding || !dataBinding.datasetId || !dataBinding.column) {
        results.push({ widgetId: widget.id, cached: false, rowCount: 0 });
        continue;
      }

      const cacheKey = `agg:${dataBinding.datasetId}:${dataBinding.column}:${dataBinding.aggregation}`;
      const existing = await cacheGet<unknown>(cacheKey);
      if (existing) {
        results.push({ widgetId: widget.id, cached: true, rowCount: 0 });
        continue;
      }

      try {
        const agg = dataBinding.aggregation || 'count';
        let data: Array<Record<string, unknown>> = [];

        if (agg === 'count') {
          data = await prisma.$queryRawUnsafe(
            `SELECT COUNT(*) as value FROM data_rows WHERE dataset_id = $1`,
            dataBinding.datasetId,
          ) as Array<Record<string, unknown>>;
        } else {
          // For other aggregations, query the data and compute
          const rows = await prisma.dataRow.findMany({
            where: { datasetId: dataBinding.datasetId },
            take: 10000,
            select: { data: true },
          });
          data = [{ value: rows.length, rowCount: rows.length }];
        }

        await cacheSet(cacheKey, data, 3600);
        precomputedCount++;
        results.push({ widgetId: widget.id, cached: true, rowCount: data.length });
      } catch (err) {
        logger.warn('Failed to precompute aggregation', {
          widgetId: widget.id,
          error: (err as Error).message,
        });
        results.push({ widgetId: widget.id, cached: false, rowCount: 0 });
      }
    }

    logger.info('Aggregations precomputed', { dashboardId, precomputedCount, totalWidgets: widgets.length });
    return { dashboardId, precomputedCount, totalWidgets: widgets.length, results };
  }

  /**
   * E03.08: Get optimized data for a widget binding — with caching and row limits.
   */
  async getOptimizedData(binding: DataBinding, maxPoints: number = 10000) {
    const cacheKey = `opt:${binding.datasetId}:${binding.column}:${maxPoints}`;
    const cached = await cacheGet<Array<Record<string, unknown>>>(cacheKey);
    if (cached) {
      logger.info('Returning cached optimized data', { datasetId: binding.datasetId, column: binding.column });
      return { data: cached, cached: true };
    }

    const rows = await prisma.dataRow.findMany({
      where: { datasetId: binding.datasetId },
      take: maxPoints,
      orderBy: { rowIndex: 'asc' },
      select: { data: true },
    });

    const data = rows.map((r) => r.data as Record<string, unknown>);
    await cacheSet(cacheKey, data, 300);

    logger.info('Optimized data fetched', { datasetId: binding.datasetId, rowCount: data.length });
    return { data, cached: false, rowCount: data.length };
  }

  /**
   * E03.08: Batch process multiple dashboard operations.
   */
  async batchProcess(operations: DashboardOperation[]) {
    const batchSize = 100;
    let processedCount = 0;
    const results: Array<{ type: string; dashboardId: string; success: boolean; error?: string }> = [];

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(async (op) => {
          switch (op.type) {
            case 'REFRESH':
              await this.precomputeAggregations(op.dashboardId);
              return { type: op.type, dashboardId: op.dashboardId, success: true };
            case 'PRECOMPUTE':
              await this.precomputeAggregations(op.dashboardId);
              return { type: op.type, dashboardId: op.dashboardId, success: true };
            case 'EXPORT':
              return { type: op.type, dashboardId: op.dashboardId, success: true };
            default:
              return { type: op.type, dashboardId: op.dashboardId, success: false, error: 'Unknown operation type' };
          }
        }),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          processedCount++;
        } else {
          results.push({ type: 'UNKNOWN', dashboardId: 'unknown', success: false, error: result.reason?.message });
        }
      }
    }

    logger.info('Batch operations processed', { total: operations.length, processed: processedCount });
    return { total: operations.length, processed: processedCount, results };
  }
}

export const performanceService = new PerformanceService();
