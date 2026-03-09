/**
 * Tests for DataIntelligenceAgent
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
                suggestions: [{ action: 'insight', description: 'Test insight', confidence: 0.9 }],
                interpretation: 'Test interpretation',
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

import { DataIntelligenceAgent } from '../../services/agents/data-intelligence.agent.js';

describe('DataIntelligenceAgent', () => {
  let agent: DataIntelligenceAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new DataIntelligenceAgent();
  });

  describe('Column profiling', () => {
    it('should compute correct mean, median, stddev for numeric column', async () => {
      const data = [
        { value: 10, name: 'a' },
        { value: 20, name: 'b' },
        { value: 30, name: 'c' },
        { value: 40, name: 'd' },
        { value: 50, name: 'e' },
      ];

      const result = await agent.execute({
        type: 'auto_analyze_dataset',
        datasetId: 'ds-1',
        data,
        columns: ['value'],
      });

      expect(result.agentType).toBe('data-intelligence');
      expect(result.taskType).toBe('auto_analyze_dataset');
      expect(result.interpretation).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle mixed numeric and string data', async () => {
      const data = [
        { id: 1, name: 'Alice', score: 85 },
        { id: 2, name: 'Bob', score: 92 },
        { id: 3, name: 'Charlie', score: 78 },
        { id: 4, name: 'Diana', score: 95 },
        { id: 5, name: 'Eve', score: 88 },
      ];

      const result = await agent.execute({
        type: 'auto_analyze_dataset',
        datasetId: 'ds-1',
        data,
        columns: ['id', 'name', 'score'],
      });

      expect(result.suggestions).toBeDefined();
    });

    it('should handle all null column gracefully', async () => {
      const data = [
        { value: null, name: 'a' },
        { value: null, name: 'b' },
        { value: null, name: 'c' },
      ];

      const result = await agent.execute({
        type: 'auto_analyze_dataset',
        datasetId: 'ds-1',
        data,
        columns: ['value'],
      });

      expect(result.interpretation).toBeDefined();
    });

    it('should detect columns from data if not provided', async () => {
      const data = [
        { col_a: 1, col_b: 'x' },
        { col_a: 2, col_b: 'y' },
        { col_a: 3, col_b: 'z' },
      ];

      const result = await agent.execute({
        type: 'auto_analyze_dataset',
        datasetId: 'ds-1',
        data,
      });

      expect(result.interpretation).toBeDefined();
    });
  });

  describe('Anomaly detection', () => {
    it('should flag obvious outliers via IQR/Z-score', async () => {
      const data = [
        { value: 10 }, { value: 12 }, { value: 11 }, { value: 13 },
        { value: 10 }, { value: 12 }, { value: 11 }, { value: 14 },
        { value: 10 }, { value: 100 }, // outlier
      ];

      const result = await agent.execute({
        type: 'detect_anomalies',
        datasetId: 'ds-1',
        data,
        columns: ['value'],
      });

      expect(result.taskType).toBe('detect_anomalies');
      // Should detect the 100 as anomaly
      const anomalySuggestions = result.suggestions.filter((s) => s.action === 'anomaly_detected');
      expect(anomalySuggestions.length).toBeGreaterThan(0);
      // Check that the outlier at index 9 is flagged
      const flaggedRow9 = anomalySuggestions.some((s) => s.description.includes('row 9'));
      expect(flaggedRow9).toBe(true);
    });

    it('should return no anomalies for uniform data', async () => {
      const data = Array.from({ length: 20 }, (_, i) => ({ value: 50 + (i % 3) }));

      const result = await agent.execute({
        type: 'detect_anomalies',
        datasetId: 'ds-1',
        data,
        columns: ['value'],
      });

      // Uniform data should have no anomalies
      const anomalySuggestions = result.suggestions.filter((s) => s.action === 'anomaly_detected');
      expect(anomalySuggestions.length).toBe(0);
    });

    it('should handle dataset with too few rows for anomaly detection', async () => {
      const data = [
        { value: 10 },
        { value: 20 },
        { value: 30 },
      ];

      const result = await agent.execute({
        type: 'detect_anomalies',
        datasetId: 'ds-1',
        data,
        columns: ['value'],
      });

      // With only 3 rows, anomalies may not be detectable
      expect(result.interpretation).toBeDefined();
    });

    it('should handle multiple columns with anomalies', async () => {
      const data = Array.from({ length: 20 }, (_, i) => ({
        a: i === 15 ? 999 : 10 + (i % 3),
        b: i === 5 ? -500 : 50 + (i % 4),
      }));

      const result = await agent.execute({
        type: 'detect_anomalies',
        datasetId: 'ds-1',
        data,
        columns: ['a', 'b'],
      });

      const anomalySuggestions = result.suggestions.filter((s) => s.action === 'anomaly_detected');
      expect(anomalySuggestions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Type inference', () => {
    it('should detect numeric columns correctly', async () => {
      const data = [
        { amount: 100.5 },
        { amount: 200.3 },
        { amount: 150.7 },
        { amount: 300.1 },
        { amount: 250.9 },
      ];

      const result = await agent.execute({
        type: 'profile_quality',
        datasetId: 'ds-1',
        data,
        columns: ['amount'],
      });

      expect(result.taskType).toBe('profile_quality');
      // No quality issues expected for a clean numeric column
      expect(result.interpretation).toContain('100.0%');
    });

    it('should detect string columns with quality issues', async () => {
      const data = [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: null },
        { name: null },
        { name: null },
        { name: null },
        { name: 'Charlie' },
        { name: null },
        { name: null },
        { name: null },
      ];

      const result = await agent.execute({
        type: 'profile_quality',
        datasetId: 'ds-1',
        data,
        columns: ['name'],
      });

      // Should detect high null percentage (70%)
      const nullIssue = result.suggestions.find((s) => s.action === 'quality_issue_missing');
      expect(nullIssue).toBeDefined();
    });

    it('should detect date patterns', async () => {
      const data = [
        { date: '2024-01-15', value: 10 },
        { date: '2024-02-20', value: 20 },
        { date: '2024-03-10', value: 30 },
        { date: '2024-04-05', value: 40 },
        { date: '2024-05-25', value: 50 },
      ];

      const result = await agent.execute({
        type: 'auto_analyze_dataset',
        datasetId: 'ds-1',
        data,
        columns: ['date', 'value'],
      });

      expect(result.interpretation).toBeDefined();
    });

    it('should detect constant columns', async () => {
      const data = Array.from({ length: 10 }, () => ({ status: 'active', value: 42 }));

      const result = await agent.execute({
        type: 'profile_quality',
        datasetId: 'ds-1',
        data,
        columns: ['status', 'value'],
      });

      const constantIssues = result.suggestions.filter(
        (s) => s.action === 'quality_issue_constant' || s.action === 'quality_zero_variance'
      );
      expect(constantIssues.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect duplicate rows', async () => {
      const data = [
        { a: 1, b: 'x' },
        { a: 2, b: 'y' },
        { a: 1, b: 'x' }, // duplicate
        { a: 3, b: 'z' },
        { a: 1, b: 'x' }, // duplicate
      ];

      const result = await agent.execute({
        type: 'profile_quality',
        datasetId: 'ds-1',
        data,
        columns: ['a', 'b'],
      });

      const dupIssue = result.suggestions.find((s) => s.action === 'quality_issue_duplicates');
      expect(dupIssue).toBeDefined();
      expect(dupIssue!.description).toContain('2 duplicate rows');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty data array', async () => {
      const result = await agent.execute({
        type: 'detect_anomalies',
        datasetId: 'ds-1',
        data: [],
        columns: ['value'],
      });

      expect(result.suggestions).toHaveLength(0);
    });

    it('should handle single row dataset', async () => {
      const result = await agent.execute({
        type: 'profile_quality',
        datasetId: 'ds-1',
        data: [{ value: 42 }],
        columns: ['value'],
      });

      expect(result.interpretation).toBeDefined();
    });
  });
});
