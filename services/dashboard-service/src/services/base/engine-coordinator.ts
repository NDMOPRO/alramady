import { logger } from '../../utils/logger';
import * as chartEngine from '../chart-engine.service';
import * as filterEngine from '../filter-engine.service';
import * as dashboardBuilder from '../dashboard-builder.service';
import * as kpiEngine from '../kpi-engine.service';
type ChartType =
  | 'bar' | 'line' | 'pie' | 'doughnut' | 'area' | 'radar'
  | 'scatter' | 'gauge' | 'waterfall' | 'combined'
  | 'heatmap' | 'treemap' | 'bubble' | 'polarArea';

/**
 * Engine Coordinator
 *
 * Unified facade for accessing the 7 dashboard engines.
 * Section services use this instead of importing engines directly.
 */
export class EngineCoordinator {

  // ─── Chart Engine ─────────────────────────────────────────────────

  async renderChart(
    type: ChartType,
    data: Record<string, unknown>,
    config?: { width?: number; height?: number; title?: string; [key: string]: unknown },
  ): Promise<Buffer> {
    logger.info('EngineCoordinator: renderChart', { type });

    switch (type) {
      case 'bar':
        return chartEngine.renderBarChart(data as any, config);
      case 'line':
        return chartEngine.renderLineChart(data as any, config);
      case 'pie':
        return chartEngine.renderPieChart(data as any, config);
      case 'doughnut':
        return chartEngine.renderPieChart(data as any, { ...config, doughnut: true });
      case 'scatter':
        return chartEngine.renderScatterPlot(data as any, config);
      case 'area':
        return chartEngine.renderAreaChart(data as any, config);
      case 'radar':
        return chartEngine.renderRadarChart(data as any, config);
      case 'gauge':
        return chartEngine.renderGaugeChart(data.value as any, data.max as any, config);
      case 'waterfall':
        return chartEngine.renderWaterfallChart(data as any, config);
      case 'combined':
        return chartEngine.renderCombinedChart(data as any, config);
      default:
        return chartEngine.renderBarChart(data as any, config);
    }
  }

  async renderChartToImage(
    chartConfig: Record<string, unknown>,
    format: 'png' | 'jpeg',
    width: number,
    height: number,
  ): Promise<Buffer> {
    return chartEngine.renderChartToImage(chartConfig as any, format, width, height);
  }

  // ─── Filter Engine ────────────────────────────────────────────────

  async createFilter(
    dashboardId: string,
    config: {
      type: 'date_range' | 'dropdown' | 'slider' | 'text';
      label: string;
      column: string;
      options?: string[];
    },
  ): Promise<Record<string, unknown>> {
    logger.info('EngineCoordinator: createFilter', { dashboardId, type: config.type });
    return filterEngine.createFilter(dashboardId, config);
  }

  async applyFilter(dashboardId: string, filterId: string, value: unknown): Promise<Record<string, unknown>> {
    logger.info('EngineCoordinator: applyFilter', { dashboardId, filterId });
    return filterEngine.applyFilter(dashboardId, filterId, value);
  }

  async bindDataset(
    widgetId: string,
    datasetId: string,
    mapping: { xColumn?: string; yColumn?: string; labelColumn?: string },
  ): Promise<Record<string, unknown>> {
    return filterEngine.bindDataset(widgetId, datasetId, mapping);
  }

  // ─── KPI Engine ───────────────────────────────────────────────────

  async createKpi(
    name: string,
    dataSource: Record<string, unknown>,
    formula: string,
    target: number,
    thresholds: { warning: number; critical: number },
    tenantId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    logger.info('EngineCoordinator: createKPI', { name, formula });
    return kpiEngine.createKPI(name, dataSource, formula, target, thresholds, tenantId, userId);
  }

  async calculateKpi(kpiId: string): Promise<Record<string, unknown>> {
    logger.info('EngineCoordinator: calculateKPI', { kpiId });
    return kpiEngine.calculateKPI(kpiId);
  }

  async getKpiHistory(kpiId: string, dateRange: { start: Date; end: Date }): Promise<Record<string, unknown>> {
    return kpiEngine.getKPIHistory(kpiId, dateRange);
  }

  async setKpiAlert(kpiId: string, condition: string, recipients: string[]): Promise<Record<string, unknown>> {
    return kpiEngine.setKPIAlert(kpiId, condition, recipients);
  }

  async compareKpis(kpiIds: string[], dateRange: { start: Date; end: Date }): Promise<Record<string, unknown>> {
    return kpiEngine.compareKPIs(kpiIds, dateRange);
  }

  // ─── Dashboard Builder ────────────────────────────────────────────

  async createDashboard(
    name: string,
    layout: Record<string, unknown>,
    config: Record<string, unknown>,
    tenantId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    logger.info('EngineCoordinator: createDashboard', { name });
    return dashboardBuilder.createDashboard(name, layout, config, tenantId, userId);
  }

  async addWidget(dashboardId: string, widget: Record<string, unknown>): Promise<Record<string, unknown>> {
    return dashboardBuilder.addWidget(dashboardId, widget as any);
  }

  async removeWidget(dashboardId: string, widgetId: string): Promise<Record<string, unknown>> {
    return dashboardBuilder.removeWidget(dashboardId, widgetId);
  }

  async updateWidget(dashboardId: string, widgetId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    return dashboardBuilder.updateWidget(dashboardId, widgetId, config);
  }

  async reorderWidgets(dashboardId: string, positions: Record<string, unknown>[]): Promise<Record<string, unknown>> {
    return dashboardBuilder.reorderWidgets(dashboardId, positions as any);
  }

  async duplicateDashboard(dashboardId: string, userId: string): Promise<Record<string, unknown>> {
    return dashboardBuilder.duplicateDashboard(dashboardId, userId);
  }

  async getDashboard(dashboardId: string): Promise<Record<string, unknown>> {
    return dashboardBuilder.getDashboard(dashboardId);
  }

  async listDashboards(tenantId: string, filters: Record<string, unknown>, pagination: { page: number; limit: number }): Promise<Record<string, unknown>> {
    return dashboardBuilder.listDashboards(tenantId, filters, pagination);
  }

  // ─── Export Engine (via filter-engine for now) ─────────────────────

  async exportToPDF(dashboardId: string, options?: { width?: number; height?: number }): Promise<Buffer> {
    logger.info('EngineCoordinator: exportToPDF', { dashboardId });
    return filterEngine.exportToPDF(dashboardId, options);
  }

  async exportToImage(dashboardId: string, format: 'png' | 'jpeg', resolution?: number): Promise<Buffer> {
    logger.info('EngineCoordinator: exportToImage', { dashboardId, format });
    return filterEngine.exportToImage(dashboardId, format, resolution);
  }
}

export const engineCoordinator = new EngineCoordinator();
