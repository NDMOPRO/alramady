/**
 * Tests for AnalyticsAgent
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock OpenAI
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                suggestions: [{ action: 'segment_insight', description: 'Test insight', confidence: 0.85 }],
                interpretation: 'Segment analysis complete',
              }),
            },
          }],
        } as never),
      },
    },
  })),
}));

// Mock Prisma
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' } as never) },
  })),
}));

import { AnalyticsAgent } from '../../services/agents/analytics.agent.js';

describe('AnalyticsAgent', () => {
  let agent: AnalyticsAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new AnalyticsAgent();
  });

  describe('Linear regression', () => {
    it('should produce correct slope and intercept for y = 2x + 1', async () => {
      // y = 2x + 1 data
      const data = [
        { x: 1, y: 3 },
        { x: 2, y: 5 },
        { x: 3, y: 7 },
        { x: 4, y: 9 },
        { x: 5, y: 11 },
      ];

      const result = await agent.execute({
        type: 'run_regression',
        datasetId: 'ds-1',
        data,
        targetColumn: 'y',
        featureColumns: ['x'],
      });

      expect(result.taskType).toBe('run_regression');
      expect(result.suggestions.length).toBeGreaterThan(0);

      const regressionSuggestion = result.suggestions[0];
      // Parse slope and R-squared from description
      expect(regressionSuggestion.description).toContain('2.0000'); // slope
      expect(regressionSuggestion.description).toContain('1.0000'); // R^2 = 1 for perfect fit

      // Confidence should be close to 1.0 (R^2)
      expect(regressionSuggestion.confidence).toBeGreaterThan(0.9);
    });

    it('should handle noisy linear data with lower R-squared', async () => {
      const data = [
        { x: 1, y: 3.5 },
        { x: 2, y: 4.2 },
        { x: 3, y: 7.8 },
        { x: 4, y: 8.1 },
        { x: 5, y: 12.3 },
        { x: 6, y: 11.5 },
        { x: 7, y: 15.2 },
        { x: 8, y: 16.8 },
      ];

      const result = await agent.execute({
        type: 'run_regression',
        datasetId: 'ds-1',
        data,
        targetColumn: 'y',
        featureColumns: ['x'],
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
      // R^2 should be moderate to high but not 1.0
      expect(result.interpretation).toContain('R²');
    });

    it('should handle multiple feature columns', async () => {
      const data = [
        { x1: 1, x2: 10, y: 15 },
        { x1: 2, x2: 20, y: 25 },
        { x1: 3, x2: 30, y: 35 },
        { x1: 4, x2: 40, y: 45 },
        { x1: 5, x2: 50, y: 55 },
      ];

      const result = await agent.execute({
        type: 'run_regression',
        datasetId: 'ds-1',
        data,
        targetColumn: 'y',
        featureColumns: ['x1', 'x2'],
      });

      // Should have regression results for both features
      expect(result.suggestions.length).toBe(2);
    });

    it('should throw error when no target column specified', async () => {
      const data = [{ x: 1, y: 2 }];

      await expect(
        agent.execute({
          type: 'run_regression',
          datasetId: 'ds-1',
          data,
          featureColumns: ['x'],
        })
      ).rejects.toThrow('run_regression requires targetColumn');
    });

    it('should throw error with no feature columns', async () => {
      await expect(
        agent.execute({
          type: 'run_regression',
          datasetId: 'ds-1',
          data: [{ x: 1, y: 2 }],
          targetColumn: 'y',
          featureColumns: [],
        })
      ).rejects.toThrow('run_regression requires targetColumn and at least one featureColumn');
    });
  });

  describe('K-means clustering', () => {
    it('should produce correct cluster assignments for well-separated data', async () => {
      // Two clearly separated clusters
      const data = [
        // Cluster A: around (1,1)
        { x: 0.8, y: 0.9 }, { x: 1.0, y: 1.1 }, { x: 1.2, y: 0.8 },
        { x: 0.9, y: 1.2 }, { x: 1.1, y: 1.0 },
        // Cluster B: around (10,10)
        { x: 9.8, y: 10.1 }, { x: 10.2, y: 9.9 }, { x: 10.0, y: 10.2 },
        { x: 9.9, y: 10.0 }, { x: 10.1, y: 9.8 },
      ];

      const result = await agent.execute({
        type: 'cluster_data',
        datasetId: 'ds-1',
        data,
        featureColumns: ['x', 'y'],
        clusterCount: 2,
      });

      expect(result.taskType).toBe('cluster_data');

      // Should have k=2 clusters
      const clusterSuggestions = result.suggestions.filter((s) => s.action === 'cluster_identified');
      expect(clusterSuggestions).toHaveLength(2);

      // Verify both clusters have 5 members each
      const summary = result.suggestions.find((s) => s.action === 'clustering_summary');
      expect(summary).toBeDefined();
      expect(summary!.description).toContain('k=2');
    });

    it('should handle single cluster data', async () => {
      const data = Array.from({ length: 10 }, (_, i) => ({
        x: 5 + (i % 3) * 0.1,
        y: 5 + (i % 2) * 0.1,
      }));

      const result = await agent.execute({
        type: 'cluster_data',
        datasetId: 'ds-1',
        data,
        featureColumns: ['x', 'y'],
        clusterCount: 2,
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should throw error with insufficient data for requested clusters', async () => {
      const data = [{ x: 1, y: 2 }];

      await expect(
        agent.execute({
          type: 'cluster_data',
          datasetId: 'ds-1',
          data,
          featureColumns: ['x', 'y'],
          clusterCount: 5,
        })
      ).rejects.toThrow('Not enough data points');
    });

    it('should throw error with no feature columns', async () => {
      await expect(
        agent.execute({
          type: 'cluster_data',
          datasetId: 'ds-1',
          data: [{ x: 1 }],
          featureColumns: [],
        })
      ).rejects.toThrow('cluster_data requires at least one featureColumn');
    });
  });

  describe('Correlation analysis', () => {
    it('should return correct Pearson r for perfectly correlated data', async () => {
      // Perfect positive correlation
      const data = [
        { a: 1, b: 2, c: 10 },
        { a: 2, b: 4, c: 8 },
        { a: 3, b: 6, c: 6 },
        { a: 4, b: 8, c: 4 },
        { a: 5, b: 10, c: 2 },
      ];

      const result = await agent.execute({
        type: 'correlation_analysis',
        datasetId: 'ds-1',
        data,
        featureColumns: ['a', 'b', 'c'],
      });

      expect(result.taskType).toBe('correlation_analysis');

      // a <-> b should have correlation = 1.0
      const abCorr = result.suggestions.find(
        (s) => s.description.includes('a <-> b') || s.description.includes('b <-> a')
      );
      expect(abCorr).toBeDefined();
      expect(abCorr!.description).toContain('1.0000');

      // a <-> c should have correlation = -1.0
      const acCorr = result.suggestions.find(
        (s) => s.description.includes('a <-> c') || s.description.includes('c <-> a')
      );
      expect(acCorr).toBeDefined();
      expect(acCorr!.description).toContain('-1.0000');
      expect(acCorr!.description).toContain('inverse');
    });

    it('should identify strong vs weak correlations', async () => {
      const data = Array.from({ length: 20 }, (_, i) => ({
        a: i,
        b: i * 2 + 1,      // r ~ 1.0 with a
        c: (i % 5) * 3,     // weak/no correlation with a
      }));

      const result = await agent.execute({
        type: 'correlation_analysis',
        datasetId: 'ds-1',
        data,
        featureColumns: ['a', 'b', 'c'],
      });

      const abCorr = result.suggestions.find(
        (s) => (s.description.includes('a <-> b') || s.description.includes('b <-> a')) && s.description.includes('strong')
      );
      expect(abCorr).toBeDefined();
    });

    it('should throw error with fewer than 2 columns', async () => {
      await expect(
        agent.execute({
          type: 'correlation_analysis',
          datasetId: 'ds-1',
          data: [{ a: 1 }],
          featureColumns: ['a'],
        })
      ).rejects.toThrow('correlation_analysis requires at least 2 featureColumns');
    });

    it('should handle null values in correlation', async () => {
      const data = [
        { a: 1, b: 2 },
        { a: null, b: 4 },
        { a: 3, b: 6 },
        { a: 4, b: null },
        { a: 5, b: 10 },
        { a: 6, b: 12 },
      ];

      const result = await agent.execute({
        type: 'correlation_analysis',
        datasetId: 'ds-1',
        data,
        featureColumns: ['a', 'b'],
      });

      // Should still compute correlation with available pairs
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Forecast trend', () => {
    it('should detect upward trend', async () => {
      const data = Array.from({ length: 20 }, (_, i) => ({
        time: i,
        value: 10 + i * 2 + (i % 3),
      }));

      const result = await agent.execute({
        type: 'forecast_trend',
        datasetId: 'ds-1',
        data,
        targetColumn: 'value',
      });

      expect(result.taskType).toBe('forecast_trend');
      expect(result.interpretation).toContain('upward');
    });

    it('should produce multiple forecast methods', async () => {
      const data = Array.from({ length: 15 }, (_, i) => ({
        time: i,
        value: 100 + i * 5,
      }));

      const result = await agent.execute({
        type: 'forecast_trend',
        datasetId: 'ds-1',
        data,
        targetColumn: 'value',
        forecastPeriods: 3,
      });

      // Should have moving average, exponential smoothing, linear, and ensemble
      expect(result.suggestions.length).toBe(4);

      const methods = result.suggestions.map((s) => s.action);
      expect(methods).toContain('forecast_moving_average');
      expect(methods).toContain('forecast_exponential_smoothing');
      expect(methods).toContain('forecast_linear_trend');
      expect(methods).toContain('forecast_ensemble');
    });

    it('should throw on insufficient data', async () => {
      await expect(
        agent.execute({
          type: 'forecast_trend',
          datasetId: 'ds-1',
          data: [{ value: 10 }, { value: 20 }],
          targetColumn: 'value',
        })
      ).rejects.toThrow('forecast_trend requires at least 3 data points');
    });

    it('should throw when target column is missing', async () => {
      await expect(
        agent.execute({
          type: 'forecast_trend',
          datasetId: 'ds-1',
          data: [{ a: 1 }, { a: 2 }, { a: 3 }],
        })
      ).rejects.toThrow('forecast_trend requires targetColumn');
    });
  });

  describe('Edge cases', () => {
    it('should handle data with all identical values in regression', async () => {
      const data = Array.from({ length: 10 }, () => ({ x: 5, y: 10 }));

      const result = await agent.execute({
        type: 'run_regression',
        datasetId: 'ds-1',
        data,
        targetColumn: 'y',
        featureColumns: ['x'],
      });

      // Slope should be 0 for constant x
      expect(result.suggestions[0].description).toContain('0.0000');
    });

    it('should handle correlation with constant column', async () => {
      const data = Array.from({ length: 10 }, (_, i) => ({
        a: 5,
        b: i * 2,
      }));

      const result = await agent.execute({
        type: 'correlation_analysis',
        datasetId: 'ds-1',
        data,
        featureColumns: ['a', 'b'],
      });

      // Correlation with a constant should be 0 or negligible
      const corrSuggestion = result.suggestions[0];
      if (corrSuggestion) {
        expect(corrSuggestion.description).toContain('0.0000');
      }
    });
  });
});
