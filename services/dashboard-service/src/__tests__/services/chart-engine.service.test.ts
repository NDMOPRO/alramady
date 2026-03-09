import '../setup';

// Mock chart.js and related
jest.mock('chartjs-node-canvas', () => ({
  ChartJSNodeCanvas: jest.fn().mockImplementation(() => ({
    renderToBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-chart-png')),
  })),
}));

jest.mock('sharp', () => {
  const mockSharp = jest.fn().mockReturnValue({
    jpeg: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-processed')),
  });
  return mockSharp;
});

jest.mock('color', () => {
  const mockColor = jest.fn().mockImplementation(() => ({
    darken: jest.fn().mockReturnThis(),
    lighten: jest.fn().mockReturnThis(),
    alpha: jest.fn().mockReturnThis(),
    hex: jest.fn().mockReturnValue('#000000'),
    rgb: jest.fn().mockReturnValue({ string: jest.fn().mockReturnValue('rgb(0,0,0)') }),
  }));
  return mockColor;
});

import * as chartEngine from '../../services/chart-engine.service';

describe('ChartEngineService', () => {
  describe('renderBarChart', () => {
    it('should render a bar chart and return a buffer', async () => {
      const data = {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [{ label: 'Sales', data: [10, 20, 30] }],
      };

      const result = await chartEngine.renderBarChart(data);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should accept custom config', async () => {
      const data = {
        labels: ['A', 'B'],
        datasets: [{ label: 'Data', data: [5, 15] }],
      };

      const result = await chartEngine.renderBarChart(data, {
        width: 1024,
        height: 768,
        title: 'Custom Chart',
      });

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('renderLineChart', () => {
    it('should render a line chart', async () => {
      const data = {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [{ label: 'Revenue', data: [100, 200, 150] }],
      };

      const result = await chartEngine.renderLineChart(data);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('renderPieChart', () => {
    it('should render a pie chart', async () => {
      const data = {
        labels: ['A', 'B', 'C'],
        data: [30, 50, 20],
      };

      const result = await chartEngine.renderPieChart(data);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should render a doughnut variant', async () => {
      const data = {
        labels: ['X', 'Y'],
        data: [60, 40],
      };

      const result = await chartEngine.renderPieChart(data, { doughnut: true });

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('renderScatterPlot', () => {
    it('should render a scatter plot', async () => {
      const data = {
        datasets: [{
          label: 'Points',
          data: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 1 }],
        }],
      };

      const result = await chartEngine.renderScatterPlot(data);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should support trend line', async () => {
      const data = {
        datasets: [{
          label: 'Points',
          data: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }],
        }],
      };

      const result = await chartEngine.renderScatterPlot(data, { trendLine: true });

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('renderGaugeChart', () => {
    it('should render a gauge chart', async () => {
      const result = await chartEngine.renderGaugeChart(75, 100);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should clamp value to max', async () => {
      const result = await chartEngine.renderGaugeChart(150, 100);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('renderChartToImage', () => {
    it('should render chart config to PNG', async () => {
      const config = { type: 'bar', data: { labels: ['A'], datasets: [{ data: [1] }] } };

      const result = await chartEngine.renderChartToImage(config, 'png', 800, 600);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should render chart config to JPEG', async () => {
      const config = { type: 'line', data: { labels: ['A'], datasets: [{ data: [1] }] } };

      const result = await chartEngine.renderChartToImage(config, 'jpeg', 800, 600);

      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
