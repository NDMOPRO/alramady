import '../setup';

// Mock all engine modules
jest.mock('../../services/chart-engine.service', () => ({
  renderBarChart: jest.fn().mockResolvedValue(Buffer.from('bar-chart')),
  renderLineChart: jest.fn().mockResolvedValue(Buffer.from('line-chart')),
  renderPieChart: jest.fn().mockResolvedValue(Buffer.from('pie-chart')),
  renderScatterPlot: jest.fn().mockResolvedValue(Buffer.from('scatter')),
  renderAreaChart: jest.fn().mockResolvedValue(Buffer.from('area-chart')),
  renderRadarChart: jest.fn().mockResolvedValue(Buffer.from('radar-chart')),
  renderGaugeChart: jest.fn().mockResolvedValue(Buffer.from('gauge')),
  renderWaterfallChart: jest.fn().mockResolvedValue(Buffer.from('waterfall')),
  renderCombinedChart: jest.fn().mockResolvedValue(Buffer.from('combined')),
  renderChartToImage: jest.fn().mockResolvedValue(Buffer.from('custom')),
}));

jest.mock('../../services/filter-engine.service', () => ({
  createFilter: jest.fn().mockResolvedValue({ id: 'filter-1' }),
  applyFilter: jest.fn().mockResolvedValue({ filterId: 'filter-1', appliedValue: 'test' }),
  bindDataset: jest.fn().mockResolvedValue({ widgetId: 'w-1', datasetId: 'd-1' }),
  exportToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  exportToImage: jest.fn().mockResolvedValue(Buffer.from('image')),
}));

jest.mock('../../services/kpi-engine.service', () => ({
  createKPI: jest.fn().mockResolvedValue({ id: 'kpi-1', name: 'Test KPI' }),
  calculateKPI: jest.fn().mockResolvedValue({ kpiId: 'kpi-1', currentValue: 42 }),
  getKPIHistory: jest.fn().mockResolvedValue({ history: [] }),
  setKPIAlert: jest.fn().mockResolvedValue({ id: 'alert-1' }),
  compareKPIs: jest.fn().mockResolvedValue({ kpis: [] }),
}));

jest.mock('../../services/dashboard-builder.service', () => ({
  createDashboard: jest.fn().mockResolvedValue({ id: 'dash-1' }),
  addWidget: jest.fn().mockResolvedValue({ id: 'widget-1' }),
  removeWidget: jest.fn().mockResolvedValue({ removed: 'widget-1' }),
  updateWidget: jest.fn().mockResolvedValue({ id: 'widget-1' }),
  reorderWidgets: jest.fn().mockResolvedValue({ widgets: [] }),
  duplicateDashboard: jest.fn().mockResolvedValue({ id: 'dash-2' }),
  getDashboard: jest.fn().mockResolvedValue({ id: 'dash-1', widgets: [] }),
  listDashboards: jest.fn().mockResolvedValue({ items: [], pagination: {} }),
}));

import { EngineCoordinator } from '../../services/base/engine-coordinator';
import * as chartEngine from '../../services/chart-engine.service';
import * as filterEngine from '../../services/filter-engine.service';
import * as kpiEngine from '../../services/kpi-engine.service';
import * as dashboardBuilder from '../../services/dashboard-builder.service';

describe('EngineCoordinator', () => {
  let coordinator: EngineCoordinator;

  beforeEach(() => {
    coordinator = new EngineCoordinator();
  });

  describe('renderChart', () => {
    it('should delegate bar chart to chart engine', async () => {
      const data = { labels: ['A'], datasets: [{ label: 'X', data: [1] }] };
      const result = await coordinator.renderChart('bar', data);

      expect(result).toBeInstanceOf(Buffer);
      expect(chartEngine.renderBarChart).toHaveBeenCalledWith(data, undefined);
    });

    it('should delegate line chart to chart engine', async () => {
      const data = { labels: ['A'], datasets: [{ label: 'X', data: [1] }] };
      await coordinator.renderChart('line', data);

      expect(chartEngine.renderLineChart).toHaveBeenCalled();
    });

    it('should delegate pie chart to chart engine', async () => {
      const data = { labels: ['A'], data: [1] };
      await coordinator.renderChart('pie', data);

      expect(chartEngine.renderPieChart).toHaveBeenCalled();
    });

    it('should delegate gauge chart with value/max', async () => {
      await coordinator.renderChart('gauge', { value: 75, max: 100 });

      expect(chartEngine.renderGaugeChart).toHaveBeenCalledWith(75, 100, undefined);
    });

    it('should default to bar chart for unknown type', async () => {
      const data = { labels: ['A'], datasets: [{ label: 'X', data: [1] }] };
      await coordinator.renderChart('unknown' as any, data);

      expect(chartEngine.renderBarChart).toHaveBeenCalled();
    });
  });

  describe('createFilter', () => {
    it('should delegate to filter engine', async () => {
      const config = { type: 'dropdown' as const, label: 'Category', column: 'cat' };
      const result = await coordinator.createFilter('dash-1', config);

      expect(result.id).toBe('filter-1');
      expect(filterEngine.createFilter).toHaveBeenCalledWith('dash-1', config);
    });
  });

  describe('applyFilter', () => {
    it('should delegate to filter engine', async () => {
      const result = await coordinator.applyFilter('dash-1', 'filter-1', 'value');

      expect(result.filterId).toBe('filter-1');
    });
  });

  describe('createKpi', () => {
    it('should delegate to kpi engine', async () => {
      const result = await coordinator.createKpi(
        'Test KPI', { table: 'metrics' }, 'SUM', 100,
        { warning: 70, critical: 50 }, 'tenant-1', 'user-1',
      );

      expect(result.name).toBe('Test KPI');
      expect(kpiEngine.createKPI).toHaveBeenCalled();
    });
  });

  describe('calculateKpi', () => {
    it('should delegate to kpi engine', async () => {
      const result = await coordinator.calculateKpi('kpi-1');

      expect(result.currentValue).toBe(42);
    });
  });

  describe('createDashboard', () => {
    it('should delegate to dashboard builder', async () => {
      const result = await coordinator.createDashboard(
        'My Dashboard', { columns: 12 }, {}, 'tenant-1', 'user-1',
      );

      expect(result.id).toBe('dash-1');
      expect(dashboardBuilder.createDashboard).toHaveBeenCalled();
    });
  });

  describe('addWidget', () => {
    it('should delegate to dashboard builder', async () => {
      const result = await coordinator.addWidget('dash-1', {
        type: 'bar_chart',
        title: 'Widget',
        config: {},
        position: { x: 0, y: 0, w: 4, h: 3 },
      });

      expect(result.id).toBe('widget-1');
    });
  });

  describe('exportToPDF', () => {
    it('should delegate to filter engine export', async () => {
      const result = await coordinator.exportToPDF('dash-1');

      expect(result).toBeInstanceOf(Buffer);
      expect(filterEngine.exportToPDF).toHaveBeenCalledWith('dash-1', undefined);
    });
  });
});
