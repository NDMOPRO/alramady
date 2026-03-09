import '../mocks/logger';

import { AiNarrativeService } from '../../services/ai-narrative.service';
import type { ReportData } from '../../services/ai-narrative.service';

describe('AiNarrativeService', () => {
  let service: AiNarrativeService;

  beforeEach(() => {
    service = new AiNarrativeService();
  });

  // ── generateExecutiveSummary() ─────────────────────────────────────────

  describe('generateExecutiveSummary()', () => {
    it('should generate a summary with improving metrics', () => {
      const data: ReportData = {
        title: 'Q1 Report',
        period: 'Q1 2025',
        metrics: { revenue: 1200000, profit: 300000 },
        previousMetrics: { revenue: 1000000, profit: 250000 },
      };

      const result = service.generateExecutiveSummary(data);

      expect(result.headline).toBeDefined();
      expect(result.headline.length).toBeGreaterThan(0);
      expect(result.keyFindings.length).toBe(2);
      expect(result.performanceOverview).toContain('positive');
      expect(result.outlook).toContain('growth');
    });

    it('should generate a summary with declining metrics', () => {
      const data: ReportData = {
        period: 'Q2 2025',
        metrics: { revenue: 500000, profit: 50000 },
        previousMetrics: { revenue: 1000000, profit: 300000 },
      };

      const result = service.generateExecutiveSummary(data);

      expect(result.performanceOverview).toContain('attention');
      expect(result.outlook).toContain('declining');
    });

    it('should handle mixed performance (equal improving/declining)', () => {
      const data: ReportData = {
        period: 'Q3 2025',
        metrics: { revenue: 1200000, profit: 200000 },
        previousMetrics: { revenue: 1000000, profit: 300000 },
      };

      const result = service.generateExecutiveSummary(data);

      expect(result.performanceOverview).toContain('mixed');
    });

    it('should handle empty metrics', () => {
      const data: ReportData = { period: 'Q4 2025' };

      const result = service.generateExecutiveSummary(data);

      expect(result.headline).toContain('Report Summary');
      expect(result.keyFindings[0]).toContain('No measurable metrics');
      expect(result.performanceOverview).toContain('Insufficient data');
      expect(result.outlook).toContain('Additional data');
    });

    it('should report metrics without previous period as standalone values', () => {
      const data: ReportData = {
        period: 'Jan 2025',
        metrics: { revenue: 500000 },
      };

      const result = service.generateExecutiveSummary(data);

      expect(result.keyFindings[0]).toContain('stands at');
      expect(result.keyFindings[0]).toContain('500.0K');
    });

    it('should identify the top-changing metric in the headline', () => {
      const data: ReportData = {
        period: 'Q1 2025',
        metrics: { revenue: 1100, profit: 2000 },
        previousMetrics: { revenue: 1000, profit: 1000 },
      };

      const result = service.generateExecutiveSummary(data);

      // profit has 100% increase vs revenue 10% - so headline should mention profit
      expect(result.headline).toContain('profit');
      expect(result.headline).toContain('increased');
    });
  });

  // ── generateRecommendations() ─────────────────────────────────────────

  describe('generateRecommendations()', () => {
    it('should generate high-priority recommendation for > 20% decline', () => {
      const data: ReportData = {
        metrics: { revenue: 700 },
        previousMetrics: { revenue: 1000 },
      };

      const result = service.generateRecommendations(data, 'financial-summary');

      expect(result[0].priority).toBe('high');
      expect(result[0].area).toBe('revenue');
      expect(result[0].recommendation).toContain('significant decline');
    });

    it('should generate medium-priority recommendation for 5-20% decline', () => {
      const data: ReportData = {
        metrics: { revenue: 900 },
        previousMetrics: { revenue: 1000 },
      };

      const result = service.generateRecommendations(data, 'sales-performance');

      expect(result[0].priority).toBe('medium');
      expect(result[0].recommendation).toContain('Monitor');
    });

    it('should generate medium-priority recommendation for > 20% growth', () => {
      const data: ReportData = {
        metrics: { revenue: 1300 },
        previousMetrics: { revenue: 1000 },
      };

      const result = service.generateRecommendations(data, 'financial-summary');

      expect(result[0].priority).toBe('medium');
      expect(result[0].recommendation).toContain('Capitalise');
    });

    it('should generate low-priority recommendation for 5-20% growth', () => {
      const data: ReportData = {
        metrics: { revenue: 1100 },
        previousMetrics: { revenue: 1000 },
      };

      const result = service.generateRecommendations(data, 'financial-summary');

      expect(result[0].priority).toBe('low');
      expect(result[0].recommendation).toContain('Continue');
    });

    it('should return a general recommendation when no variances detected', () => {
      const data: ReportData = {
        metrics: { revenue: 1000 },
        previousMetrics: { revenue: 1000 },
      };

      const result = service.generateRecommendations(data, 'hr-headcount');

      expect(result).toHaveLength(1);
      expect(result[0].area).toBe('general');
      expect(result[0].recommendation).toContain('Continue monitoring');
    });

    it('should sort recommendations by priority (high first)', () => {
      const data: ReportData = {
        metrics: { revenue: 1100, profit: 500, cost: 800 },
        previousMetrics: { revenue: 1000, profit: 1000, cost: 1000 },
      };

      const result = service.generateRecommendations(data, 'financial-summary');

      const priorities = result.map((r) => r.priority);
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      for (let i = 0; i < priorities.length - 1; i++) {
        expect(order[priorities[i]]).toBeLessThanOrEqual(order[priorities[i + 1]]);
      }
    });
  });

  // ── generateTrendAnalysis() ───────────────────────────────────────────

  describe('generateTrendAnalysis()', () => {
    it('should detect upward trend', () => {
      const data = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];

      const result = service.generateTrendAnalysis(data, 'Revenue');

      expect(result.direction).toBe('up');
      expect(result.percentageChange).toBe(100);
      expect(result.slope).toBeGreaterThan(0);
      expect(result.summary).toContain('Revenue');
      expect(result.summary).toContain('upward');
    });

    it('should detect downward trend', () => {
      const data = [200, 180, 160, 140, 120, 100, 80, 60, 40, 20];

      const result = service.generateTrendAnalysis(data, 'Costs');

      expect(result.direction).toBe('down');
      expect(result.slope).toBeLessThan(0);
      expect(result.summary).toContain('downward');
    });

    it('should detect stable trend', () => {
      const data = [100, 100, 100, 100, 100];

      const result = service.generateTrendAnalysis(data, 'Headcount');

      expect(result.direction).toBe('stable');
      expect(result.percentageChange).toBe(0);
      expect(result.summary).toContain('stable');
    });

    it('should handle empty data', () => {
      const result = service.generateTrendAnalysis([], 'Empty');

      expect(result.direction).toBe('stable');
      expect(result.movingAverage).toEqual([]);
      expect(result.summary).toContain('No data');
    });

    it('should handle single data point', () => {
      const result = service.generateTrendAnalysis([42], 'Single');

      expect(result.direction).toBe('stable');
      expect(result.movingAverage).toEqual([42]);
      expect(result.summary).toContain('Only one data point');
    });

    it('should compute moving average with correct length', () => {
      const data = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      const result = service.generateTrendAnalysis(data, 'Sales');

      expect(result.movingAverage).toHaveLength(data.length);
    });

    it('should compute volatility', () => {
      const volatile = [10, 100, 20, 90, 30, 80, 40, 70];
      const stable = [100, 101, 100, 99, 100, 101, 100, 99];

      const volatileResult = service.generateTrendAnalysis(volatile, 'Volatile');
      const stableResult = service.generateTrendAnalysis(stable, 'Stable');

      expect(volatileResult.volatility).toBeGreaterThan(stableResult.volatility);
    });
  });

  // ── generateForecast() ────────────────────────────────────────────────

  describe('generateForecast()', () => {
    it('should project future values using linear regression', () => {
      const data = [100, 110, 120, 130, 140, 150];

      const result = service.generateForecast(data, 3);

      expect(result.projectedValues).toHaveLength(3);
      expect(result.slope).toBeCloseTo(10, 0);
      expect(result.rSquared).toBeCloseTo(1, 2);
      // Projected values should continue upward
      expect(result.projectedValues[0]).toBeGreaterThan(150);
    });

    it('should return low confidence with insufficient data', () => {
      const result = service.generateForecast([100], 3);

      expect(result.projectedValues).toEqual([]);
      expect(result.confidence).toBe('low');
      expect(result.summary).toContain('Insufficient');
    });

    it('should return high confidence with good fit and enough data', () => {
      // Perfect linear data with 10+ points
      const data = Array.from({ length: 12 }, (_, i) => 100 + i * 10);

      const result = service.generateForecast(data, 3);

      expect(result.confidence).toBe('high');
      expect(result.rSquared).toBeCloseTo(1, 2);
    });

    it('should return medium confidence with moderate fit', () => {
      // Semi-linear data with noise, 5+ points
      const data = [100, 115, 125, 118, 140, 155, 145];

      const result = service.generateForecast(data, 3);

      // rSquared should be moderate
      expect(result.rSquared).toBeGreaterThan(0.5);
      expect(['medium', 'low']).toContain(result.confidence);
    });

    it('should generate summary with trend description', () => {
      const data = [100, 110, 120, 130, 140];

      const result = service.generateForecast(data, 2);

      expect(result.summary).toContain('growth');
      expect(result.summary).toContain('linear regression');
      expect(result.summary).toContain('R²');
    });
  });

  // ── generateDataNarrative() ───────────────────────────────────────────

  describe('generateDataNarrative()', () => {
    it('should generate narrative for numeric data', () => {
      const data = [
        { name: 'Product A', revenue: 1000, units: 50 },
        { name: 'Product B', revenue: 2000, units: 30 },
        { name: 'Product C', revenue: 500, units: 80 },
      ];

      const result = service.generateDataNarrative(data, ['name', 'revenue', 'units']);

      expect(result.paragraphs.length).toBeGreaterThan(0);
      expect(result.paragraphs[0]).toContain('3 records');
      expect(result.paragraphs[0]).toContain('3 fields');
      expect(result.highlights.length).toBeGreaterThan(0);
    });

    it('should identify highest and lowest values', () => {
      const data = [
        { name: 'A', score: 10 },
        { name: 'B', score: 90 },
        { name: 'C', score: 50 },
      ];

      const result = service.generateDataNarrative(data, ['name', 'score']);

      const highlightText = result.highlights.join(' ');
      expect(highlightText).toContain('Highest score');
      expect(highlightText).toContain('Lowest score');
    });

    it('should handle categorical data', () => {
      const data = [
        { department: 'Engineering', status: 'active' },
        { department: 'Engineering', status: 'active' },
        { department: 'Sales', status: 'inactive' },
        { department: 'HR', status: 'active' },
      ];

      const result = service.generateDataNarrative(data, ['department', 'status']);

      const allText = result.paragraphs.join(' ');
      expect(allText).toContain('distinct value');
      expect(allText).toContain('Engineering');
    });

    it('should handle empty data', () => {
      const result = service.generateDataNarrative([], ['col1']);

      expect(result.paragraphs[0]).toContain('No data');
      expect(result.highlights).toEqual([]);
    });

    it('should handle empty columns', () => {
      const result = service.generateDataNarrative([{ a: 1 }], []);

      expect(result.paragraphs[0]).toContain('No data');
    });

    it('should detect correlation between numeric columns', () => {
      // Strong positive correlation
      const data = Array.from({ length: 20 }, (_, i) => ({
        x: i * 10,
        y: i * 10 + 5,
      }));

      const result = service.generateDataNarrative(data, ['x', 'y']);

      const allText = result.paragraphs.join(' ') + ' ' + result.highlights.join(' ');
      expect(allText).toContain('correlation');
    });
  });
});
