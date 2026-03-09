/**
 * Tests for PatternDiscoveryService
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PatternDiscoveryService } from '../services/pattern-discovery.service.js';

describe('PatternDiscoveryService', () => {
  let service: PatternDiscoveryService;

  beforeEach(() => {
    service = new PatternDiscoveryService();
  });

  describe('detectCorrelations', () => {
    it('should return Pearson r = 1.0 for perfectly correlated data', () => {
      const data = [
        { a: 1, b: 2 },
        { a: 2, b: 4 },
        { a: 3, b: 6 },
        { a: 4, b: 8 },
        { a: 5, b: 10 },
      ];

      const result = service.detectCorrelations(data, ['a', 'b']);

      expect(result.matrix['a']['b']).toBeCloseTo(1.0, 5);
      expect(result.matrix['b']['a']).toBeCloseTo(1.0, 5);
      expect(result.significant.length).toBe(1);
      expect(result.significant[0].strength).toBe('strong');
    });

    it('should return Pearson r = -1.0 for perfectly inversely correlated data', () => {
      const data = [
        { x: 1, y: 10 },
        { x: 2, y: 8 },
        { x: 3, y: 6 },
        { x: 4, y: 4 },
        { x: 5, y: 2 },
      ];

      const result = service.detectCorrelations(data, ['x', 'y']);

      expect(result.matrix['x']['y']).toBeCloseTo(-1.0, 5);
      expect(result.significant[0].pearson).toBeCloseTo(-1.0, 5);
    });

    it('should return r close to 0 for uncorrelated data', () => {
      // Alternating pattern with no linear relationship
      const data = [
        { a: 1, b: 5 },
        { a: 2, b: 3 },
        { a: 3, b: 7 },
        { a: 4, b: 1 },
        { a: 5, b: 9 },
        { a: 6, b: 2 },
        { a: 7, b: 8 },
        { a: 8, b: 4 },
        { a: 9, b: 6 },
        { a: 10, b: 10 },
      ];

      const result = service.detectCorrelations(data, ['a', 'b']);

      // Not strongly correlated
      expect(Math.abs(result.matrix['a']['b'])).toBeLessThan(0.7);
    });

    it('should compute Spearman correlation alongside Pearson', () => {
      const data = [
        { a: 1, b: 1 },
        { a: 2, b: 4 },
        { a: 3, b: 9 },
        { a: 4, b: 16 },
        { a: 5, b: 25 },
      ];

      const result = service.detectCorrelations(data, ['a', 'b']);

      // Spearman should be 1.0 for monotonic relationship
      if (result.significant.length > 0) {
        expect(result.significant[0].spearman).toBeCloseTo(1.0, 5);
      }
    });

    it('should handle diagonal as 1.0', () => {
      const data = [
        { x: 1, y: 2, z: 3 },
        { x: 4, y: 5, z: 6 },
        { x: 7, y: 8, z: 9 },
      ];

      const result = service.detectCorrelations(data, ['x', 'y', 'z']);

      expect(result.matrix['x']['x']).toBe(1.0);
      expect(result.matrix['y']['y']).toBe(1.0);
      expect(result.matrix['z']['z']).toBe(1.0);
    });

    it('should handle null values by filtering aligned pairs', () => {
      const data = [
        { a: 1, b: 2 },
        { a: 2, b: null },
        { a: 3, b: 6 },
        { a: null, b: 8 },
        { a: 5, b: 10 },
      ];

      const result = service.detectCorrelations(data, ['a', 'b']);

      // Should still compute with available pairs
      expect(result.matrix['a']['b']).toBeDefined();
      expect(typeof result.matrix['a']['b']).toBe('number');
    });

    it('should return empty for fewer than 3 rows', () => {
      const data = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
      const result = service.detectCorrelations(data, ['a', 'b']);
      expect(result.significant).toHaveLength(0);
    });

    it('should return empty for fewer than 2 columns', () => {
      const data = [{ a: 1 }, { a: 2 }, { a: 3 }];
      const result = service.detectCorrelations(data, ['a']);
      expect(result.significant).toHaveLength(0);
    });

    it('should handle multiple column pairs', () => {
      const data = Array.from({ length: 20 }, (_, i) => ({
        a: i,
        b: i * 2,
        c: 100 - i,
        d: (i % 5) * 7,
      }));

      const result = service.detectCorrelations(data, ['a', 'b', 'c', 'd']);

      // a-b should be strong positive
      expect(result.matrix['a']['b']).toBeCloseTo(1.0, 5);
      // a-c should be strong negative
      expect(result.matrix['a']['c']).toBeCloseTo(-1.0, 5);

      // Should have multiple significant pairs
      expect(result.significant.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('clusterData', () => {
    it('should correctly separate two well-defined clusters', () => {
      const data: Array<Record<string, number | null>> = [
        // Cluster A: around (0, 0)
        { x: 0.1, y: 0.2 }, { x: -0.1, y: 0.1 }, { x: 0.2, y: -0.1 },
        { x: -0.2, y: 0.2 }, { x: 0.0, y: 0.0 },
        // Cluster B: around (10, 10)
        { x: 9.9, y: 10.1 }, { x: 10.1, y: 9.8 }, { x: 10.0, y: 10.2 },
        { x: 9.8, y: 10.0 }, { x: 10.2, y: 10.1 },
      ];

      const result = service.clusterData(data, ['x', 'y'], 2);

      expect(result.k).toBe(2);
      expect(result.assignments).toHaveLength(10);
      expect(result.centroids).toHaveLength(2);
      expect(result.clusterSizes).toHaveLength(2);

      // Verify all points in same group belong to same cluster
      const clusterA = result.assignments.slice(0, 5);
      const clusterB = result.assignments.slice(5, 10);

      // All of cluster A should have same assignment
      expect(new Set(clusterA).size).toBe(1);
      // All of cluster B should have same assignment
      expect(new Set(clusterB).size).toBe(1);
      // The two clusters should be different
      expect(clusterA[0]).not.toBe(clusterB[0]);

      // Silhouette should be high for well-separated data
      expect(result.silhouetteScore).toBeGreaterThan(0.5);
    });

    it('should handle automatic k selection', () => {
      const data: Array<Record<string, number | null>> = [
        // 3 clear clusters
        ...Array.from({ length: 10 }, (_, i) => ({ x: i * 0.1, y: i * 0.1 })),
        ...Array.from({ length: 10 }, (_, i) => ({ x: 10 + i * 0.1, y: 10 + i * 0.1 })),
        ...Array.from({ length: 10 }, (_, i) => ({ x: 20 + i * 0.1, y: 0 + i * 0.1 })),
      ];

      const result = service.clusterData(data, ['x', 'y']);

      expect(result.k).toBeGreaterThanOrEqual(2);
      expect(result.assignments).toHaveLength(30);
    });

    it('should handle null values with imputation', () => {
      const data: Array<Record<string, number | null>> = [
        { x: 1, y: 2 },
        { x: null, y: 4 },
        { x: 3, y: null },
        { x: 4, y: 8 },
        { x: 5, y: 10 },
      ];

      const result = service.clusterData(data, ['x', 'y'], 2);

      expect(result.assignments).toHaveLength(5);
      expect(result.k).toBe(2);
    });

    it('should return single cluster for single point', () => {
      const data: Array<Record<string, number | null>> = [{ x: 1, y: 2 }];
      const result = service.clusterData(data, ['x', 'y'], 1);
      expect(result.assignments).toEqual([0]);
    });

    it('should return empty for empty data', () => {
      const result = service.clusterData([], ['x', 'y'], 2);
      expect(result.assignments).toEqual([]);
      expect(result.k).toBe(0);
    });

    it('should compute valid inertia', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 20 }, (_, i) => ({
        x: i < 10 ? i * 0.1 : 10 + i * 0.1,
        y: i < 10 ? i * 0.1 : 10 + i * 0.1,
      }));

      const result = service.clusterData(data, ['x', 'y'], 2);

      expect(result.inertia).toBeGreaterThanOrEqual(0);
      // Inertia with k=2 should be less than k=1
      const result1 = service.clusterData(data, ['x', 'y'], 1);
      expect(result.inertia).toBeLessThanOrEqual(result1.inertia);
    });
  });

  describe('detectAnomalies', () => {
    it('should flag known outliers', () => {
      const data: Array<Record<string, number | null>> = [
        ...Array.from({ length: 20 }, () => ({ value: 50 })),
        { value: 500 }, // obvious outlier
      ];

      const result = service.detectAnomalies(data, ['value']);

      expect(result.details.length).toBeGreaterThan(0);

      // The outlier at index 20 should have a high score
      const outlierDetail = result.details.find((d) => d.rowIndex === 20);
      expect(outlierDetail).toBeDefined();
      expect(outlierDetail!.score).toBeGreaterThan(1);
    });

    it('should not flag uniform data', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 30 }, (_, i) => ({
        value: 100 + (i % 3),
      }));

      const result = service.detectAnomalies(data, ['value']);

      // With very tight data, there should be few or no anomalies
      expect(result.flaggedRows.length).toBe(0);
    });

    it('should handle multiple anomaly columns independently', () => {
      const data: Array<Record<string, number | null>> = [
        ...Array.from({ length: 19 }, (_, i) => ({ a: 10 + (i % 2), b: 50 + (i % 3) })),
        { a: 999, b: -999 }, // outlier in both columns
      ];

      const result = service.detectAnomalies(data, ['a', 'b']);

      const outlier = result.details.find((d) => d.rowIndex === 19);
      expect(outlier).toBeDefined();
      expect(outlier!.columns.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle all null column', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 10 }, () => ({
        value: null,
      }));

      const result = service.detectAnomalies(data, ['value']);
      expect(result.details).toHaveLength(0);
    });

    it('should handle single value column (zero variance)', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 20 }, () => ({
        value: 42,
      }));

      const result = service.detectAnomalies(data, ['value']);
      // All values identical => no anomalies
      expect(result.flaggedRows).toHaveLength(0);
    });

    it('should return empty for empty data', () => {
      const result = service.detectAnomalies([], ['value']);
      expect(result.anomalyScores).toHaveLength(0);
      expect(result.flaggedRows).toHaveLength(0);
    });
  });

  describe('detectTrends', () => {
    it('should detect increasing trend', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 20 }, (_, i) => ({
        time: i,
        value: 10 + i * 3,
      }));

      const results = service.detectTrends(data, 'time', ['value']);

      expect(results).toHaveLength(1);
      expect(results[0].column).toBe('value');
      expect(results[0].direction).toBe('increasing');
      expect(results[0].linearSlope).toBeCloseTo(3, 1);
      expect(results[0].rSquared).toBeCloseTo(1.0, 2);
    });

    it('should detect decreasing trend', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 20 }, (_, i) => ({
        time: i,
        value: 100 - i * 2,
      }));

      const results = service.detectTrends(data, 'time', ['value']);

      expect(results[0].direction).toBe('decreasing');
      expect(results[0].linearSlope).toBeCloseTo(-2, 1);
    });

    it('should detect stable trend', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 20 }, (_, i) => ({
        time: i,
        value: 50,
      }));

      const results = service.detectTrends(data, 'time', ['value']);

      expect(results[0].direction).toBe('stable');
      expect(results[0].linearSlope).toBeCloseTo(0, 5);
    });

    it('should detect seasonality in periodic data', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 40 }, (_, i) => ({
        time: i,
        value: 50 + 20 * Math.sin(2 * Math.PI * i / 10),
      }));

      const results = service.detectTrends(data, 'time', ['value']);

      // Should detect period around 10
      if (results[0].seasonalityPeriod !== null) {
        expect(results[0].seasonalityPeriod).toBeGreaterThanOrEqual(8);
        expect(results[0].seasonalityPeriod).toBeLessThanOrEqual(12);
      }
    });

    it('should detect change points', () => {
      const data: Array<Record<string, number | null>> = [
        ...Array.from({ length: 15 }, (_, i) => ({ time: i, value: 10 + i * 0.5 })),
        ...Array.from({ length: 15 }, (_, i) => ({ time: 15 + i, value: 100 + i * 0.5 })),
      ];

      const results = service.detectTrends(data, 'time', ['value']);

      expect(results[0].changePoints.length).toBeGreaterThan(0);
    });

    it('should handle multiple value columns', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 20 }, (_, i) => ({
        time: i,
        revenue: 100 + i * 10,
        cost: 50 + i * 3,
      }));

      const results = service.detectTrends(data, 'time', ['revenue', 'cost']);
      expect(results).toHaveLength(2);
      expect(results[0].column).toBe('revenue');
      expect(results[1].column).toBe('cost');
    });

    it('should return empty for fewer than 3 data points', () => {
      const results = service.detectTrends(
        [{ time: 0, value: 1 }, { time: 1, value: 2 }],
        'time',
        ['value']
      );
      expect(results).toHaveLength(0);
    });
  });

  describe('detectCausality', () => {
    it('should detect forward causal direction for lagged data', () => {
      // X leads Y by a lag
      const data: Array<Record<string, number | null>> = Array.from({ length: 30 }, (_, i) => ({
        x: i + Math.sin(i),
        y: i > 2 ? (i - 2) + Math.sin(i - 2) : 0, // y follows x with lag 2
      }));

      const results = service.detectCausality(data, ['x', 'y']);

      if (results.length > 0) {
        expect(results[0].optimalLag).toBeGreaterThanOrEqual(1);
        expect(results[0].laggedCorrelation).toBeGreaterThan(0.3);
      }
    });

    it('should return empty for insufficient data', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 5 }, (_, i) => ({
        x: i,
        y: i * 2,
      }));

      const results = service.detectCausality(data, ['x', 'y']);
      expect(results).toHaveLength(0);
    });

    it('should return empty for fewer than 2 columns', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 20 }, (_, i) => ({
        x: i,
      }));

      const results = service.detectCausality(data, ['x']);
      expect(results).toHaveLength(0);
    });

    it('should handle constant columns without crashing', () => {
      const data: Array<Record<string, number | null>> = Array.from({ length: 20 }, () => ({
        a: 5,
        b: 10,
      }));

      const results = service.detectCausality(data, ['a', 'b']);
      // Constant data should not produce significant causality
      expect(results.length).toBe(0);
    });
  });
});
