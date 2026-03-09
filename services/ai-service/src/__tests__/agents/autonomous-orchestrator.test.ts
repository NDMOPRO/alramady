/**
 * Tests for AutonomousOrchestratorService
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock OpenAI
jest.mock('openai', () => {
  const mockCreate = jest.fn();
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
    _mockCreate: mockCreate,
  };
});

// Mock Prisma
const mockPrismaAuditLogCreate = jest.fn().mockResolvedValue({ id: 'log-1' } as never);
const mockPrismaDatasetFindMany = jest.fn().mockResolvedValue([] as never);
const mockPrismaDashboardFindMany = jest.fn().mockResolvedValue([] as never);
const mockPrismaReportFindMany = jest.fn().mockResolvedValue([] as never);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    auditLog: { create: mockPrismaAuditLogCreate },
    dataset: { findMany: mockPrismaDatasetFindMany, findFirst: jest.fn(), findUnique: jest.fn() },
    dashboard: { findMany: mockPrismaDashboardFindMany },
    report: { findMany: mockPrismaReportFindMany },
    dataRow: { findMany: jest.fn().mockResolvedValue([] as never) },
  })),
}));

// Mock sub-agents
jest.mock('../../services/agents/agent-orchestrator.service.js', () => ({
  AgentOrchestratorService: jest.fn().mockImplementation(() => ({
    orchestrate: jest.fn().mockResolvedValue({
      results: [{
        agentType: 'analyst',
        taskType: 'find_anomalies',
        interpretation: 'Mock analysis complete',
        suggestions: [{ action: 'review', description: 'Review data', confidence: 0.9 }],
        requiresApproval: false,
        executedAt: new Date(),
      }],
    } as never),
  })),
}));

jest.mock('../../services/agents/data-intelligence.agent.js', () => ({
  DataIntelligenceAgent: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({
      agentType: 'data-intelligence',
      taskType: 'auto_analyze_dataset',
      interpretation: 'Analysis done',
      suggestions: [{ action: 'insight', description: 'Found pattern', confidence: 0.85 }],
      requiresApproval: false,
      executedAt: new Date(),
    } as never),
  })),
}));

jest.mock('../../services/agents/analytics.agent.js', () => ({
  AnalyticsAgent: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({
      agentType: 'analytics',
      taskType: 'run_regression',
      interpretation: 'Regression done',
      suggestions: [{ action: 'result', description: 'y=2x+1', confidence: 0.9 }],
      requiresApproval: false,
      executedAt: new Date(),
    } as never),
  })),
}));

jest.mock('../../services/agents/dashboard-builder.agent.js', () => ({
  DashboardBuilderAgent: jest.fn().mockImplementation(() => ({ execute: jest.fn() })),
}));
jest.mock('../../services/agents/data-cleaning.agent.js', () => ({
  DataCleaningAgent: jest.fn().mockImplementation(() => ({ execute: jest.fn() })),
}));
jest.mock('../../services/agents/compliance-governance.agent.js', () => ({
  ComplianceGovernanceAgent: jest.fn().mockImplementation(() => ({ execute: jest.fn() })),
}));
jest.mock('../../services/agents/automation-workflow.agent.js', () => ({
  AutomationWorkflowAgent: jest.fn().mockImplementation(() => ({ execute: jest.fn() })),
}));
jest.mock('../../services/agents/research.agent.js', () => ({
  ResearchAgent: jest.fn().mockImplementation(() => ({ execute: jest.fn() })),
}));
jest.mock('../../services/agents/knowledge-graph.agent.js', () => ({
  KnowledgeGraphAgent: jest.fn().mockImplementation(() => ({ execute: jest.fn() })),
}));
jest.mock('../../services/agents/admin-copilot.agent.js', () => ({
  AdminCopilotAgent: jest.fn().mockImplementation(() => ({ execute: jest.fn() })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const openaiModule = require('openai');
const mockCreate = openaiModule._mockCreate as jest.Mock;

import { AutonomousOrchestratorService } from '../../services/agents/autonomous-orchestrator.service.js';

describe('AutonomousOrchestratorService', () => {
  let service: AutonomousOrchestratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AutonomousOrchestratorService();
  });

  describe('decomposeTask', () => {
    it('should produce valid decomposed steps from OpenAI response', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              steps: [
                {
                  agentType: 'analyst',
                  taskType: 'find_anomalies',
                  dependsOn: [],
                  priority: 1,
                  params: { datasetId: 'ds-1' },
                  reason: 'Analyze data for anomalies',
                },
                {
                  agentType: 'report-writer',
                  taskType: 'generate_narrative',
                  dependsOn: [0],
                  priority: 2,
                  params: {},
                  reason: 'Summarize findings',
                },
              ],
            }),
          },
        }],
      });

      const steps = await service.decomposeTask('Find anomalies and generate report');

      expect(steps).toHaveLength(2);
      expect(steps[0].agentType).toBe('analyst');
      expect(steps[0].taskType).toBe('find_anomalies');
      expect(steps[0].dependsOn).toEqual([]);
      expect(steps[0].priority).toBe(1);
      expect(steps[1].dependsOn).toEqual([0]);
    });

    it('should limit steps to 8 maximum', async () => {
      const manySteps = Array.from({ length: 15 }, (_, i) => ({
        agentType: 'analyst',
        taskType: 'find_anomalies',
        dependsOn: [],
        priority: i + 1,
        params: {},
        reason: `Step ${i}`,
      }));

      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ steps: manySteps }) } }],
      });

      const steps = await service.decomposeTask('Complex task');
      expect(steps.length).toBeLessThanOrEqual(8);
    });

    it('should handle malformed dependsOn gracefully', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              steps: [{
                agentType: 'analyst',
                taskType: 'find_anomalies',
                dependsOn: 'not-an-array',
                priority: 'invalid',
                params: null,
                reason: undefined,
              }],
            }),
          },
        }],
      });

      const steps = await service.decomposeTask('Task');
      expect(steps).toHaveLength(1);
      expect(steps[0].dependsOn).toEqual([]);
      expect(steps[0].priority).toBe(3); // default
      expect(steps[0].params).toEqual({});
    });

    it('should throw on empty OpenAI response', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
      });

      await expect(service.decomposeTask('Task')).rejects.toThrow(
        'Empty response from OpenAI for task decomposition'
      );
    });
  });

  describe('generateExecutionPlan', () => {
    it('should create valid plan with step IDs and dependencies', () => {
      const steps = [
        { agentType: 'analyst', taskType: 'find_anomalies', dependsOn: [] as string[], priority: 1, params: {}, reason: '' },
        { agentType: 'report-writer', taskType: 'generate_narrative', dependsOn: [0] as (string | number)[], priority: 2, params: {}, reason: '' },
      ];

      const request = {
        description: 'Test',
        tenantId: 'tenant-1',
        userId: 'user-1',
        data: { datasetId: 'ds-1' },
      };

      const plan = service.generateExecutionPlan(steps, request);

      expect(plan.requestId).toMatch(/^auto-/);
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].stepId).toBe('step-0');
      expect(plan.steps[1].stepId).toBe('step-1');
      expect(plan.steps[1].dependsOn).toEqual(['step-0']);
      expect(plan.requiredAgents).toContain('analyst');
      expect(plan.requiredAgents).toContain('report-writer');
      expect(plan.estimatedDurationMs).toBe(6000);
    });

    it('should deduplicate required agents', () => {
      const steps = [
        { agentType: 'analyst', taskType: 'find_anomalies', dependsOn: [] as string[], priority: 1, params: {}, reason: '' },
        { agentType: 'analyst', taskType: 'root_cause', dependsOn: [] as string[], priority: 2, params: {}, reason: '' },
      ];

      const plan = service.generateExecutionPlan(steps, {
        description: 'Test',
        tenantId: 't1',
        userId: 'u1',
      });

      expect(plan.requiredAgents).toEqual(['analyst']);
    });

    it('should merge request data into step params', () => {
      const steps = [
        { agentType: 'analyst', taskType: 'find_anomalies', dependsOn: [] as string[], priority: 1, params: { custom: true }, reason: '' },
      ];

      const plan = service.generateExecutionPlan(steps, {
        description: 'Test',
        tenantId: 't1',
        userId: 'u1',
        data: { datasetId: 'ds-1' },
      });

      expect(plan.steps[0].params).toEqual({ custom: true, datasetId: 'ds-1' });
    });
  });

  describe('validateResult', () => {
    it('should return true when result meets quality threshold', () => {
      const result = {
        agentType: 'analyst',
        taskType: 'find_anomalies',
        interpretation: 'Analysis complete with significant findings',
        suggestions: [
          { action: 'review', description: 'Review data', confidence: 0.9 },
          { action: 'fix', description: 'Fix issue', confidence: 0.8 },
        ],
        requiresApproval: false,
        executedAt: new Date(),
      };

      expect(service.validateResult(result, 0.7)).toBe(true);
    });

    it('should return false when interpretation is empty', () => {
      const result = {
        agentType: 'analyst',
        taskType: 'find_anomalies',
        interpretation: '',
        suggestions: [{ action: 'x', description: 'y', confidence: 0.9 }],
        requiresApproval: false,
        executedAt: new Date(),
      };

      expect(service.validateResult(result, 0.7)).toBe(false);
    });

    it('should return false when suggestions are empty', () => {
      const result = {
        agentType: 'analyst',
        taskType: 'find_anomalies',
        interpretation: 'Some interpretation',
        suggestions: [] as Array<{ action: string; description: string; confidence: number }>,
        requiresApproval: false,
        executedAt: new Date(),
      };

      expect(service.validateResult(result, 0.7)).toBe(false);
    });

    it('should return false when average confidence is below threshold', () => {
      const result = {
        agentType: 'analyst',
        taskType: 'find_anomalies',
        interpretation: 'Some interpretation',
        suggestions: [
          { action: 'a', description: 'b', confidence: 0.3 },
          { action: 'c', description: 'd', confidence: 0.2 },
        ],
        requiresApproval: false,
        executedAt: new Date(),
      };

      expect(service.validateResult(result, 0.7)).toBe(false);
    });

    it('should handle single suggestion exactly at threshold', () => {
      const result = {
        agentType: 'analyst',
        taskType: 'test',
        interpretation: 'Valid',
        suggestions: [{ action: 'a', description: 'b', confidence: 0.7 }],
        requiresApproval: false,
        executedAt: new Date(),
      };

      expect(service.validateResult(result, 0.7)).toBe(true);
    });
  });

  describe('computeOverallQuality (via orchestrate)', () => {
    it('should return 0 for empty results', async () => {
      // Test via the plan-only path (autoExecute: false)
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({ steps: [{ agentType: 'analyst', taskType: 'find_anomalies', dependsOn: [], priority: 1, params: {}, reason: '' }] }),
          },
        }],
      });

      const result = await service.orchestrate({
        description: 'Test',
        tenantId: 'tenant-1',
        userId: 'user-1',
        autoExecute: false,
      });

      expect(result.qualityScore).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should compute correct quality for a well-formed result', () => {
      // Access private method via bracket notation for testing
      const computeQuality = (service as unknown as Record<string, (results: Array<{
        interpretation: string;
        suggestions: Array<{ confidence: number }>;
      }>) => number>)['computeOverallQuality'].bind(service);

      const results = [
        {
          interpretation: 'Valid interpretation',
          suggestions: [
            { confidence: 0.9 },
            { confidence: 0.8 },
          ],
        },
      ];

      const score = computeQuality(results);
      // 0.4 (has interpretation) + 0.6 * avg(0.9, 0.8) = 0.4 + 0.6 * 0.85 = 0.4 + 0.51 = 0.91
      expect(score).toBeCloseTo(0.91, 2);
    });

    it('should compute correct quality for multiple results', () => {
      const computeQuality = (service as unknown as Record<string, (results: Array<{
        interpretation: string;
        suggestions: Array<{ confidence: number }>;
      }>) => number>)['computeOverallQuality'].bind(service);

      const results = [
        { interpretation: 'Good', suggestions: [{ confidence: 1.0 }] },
        { interpretation: '', suggestions: [{ confidence: 0.5 }] },
      ];

      const score = computeQuality(results);
      // Result 1: 0.4 + 0.6 * 1.0 = 1.0
      // Result 2: 0.0 + 0.6 * 0.5 = 0.3
      // Average: (1.0 + 0.3) / 2 = 0.65
      expect(score).toBeCloseTo(0.65, 2);
    });

    it('should return 0 for empty results array', () => {
      const computeQuality = (service as unknown as Record<string, (results: Array<{
        interpretation: string;
        suggestions: Array<{ confidence: number }>;
      }>) => number>)['computeOverallQuality'].bind(service);

      expect(computeQuality([])).toBe(0);
    });
  });

  describe('groupStepsByDependencyLevel', () => {
    it('should group independent steps at the same level', () => {
      const groupSteps = (service as unknown as Record<string, (steps: Array<{
        stepId: string;
        dependsOn: string[];
      }>) => Array<Array<{ stepId: string }>>>)['groupStepsByDependencyLevel'].bind(service);

      const steps = [
        { stepId: 'step-0', agentType: 'a', taskType: 't', dependsOn: [] as string[], priority: 1, params: {} },
        { stepId: 'step-1', agentType: 'b', taskType: 't', dependsOn: [] as string[], priority: 1, params: {} },
        { stepId: 'step-2', agentType: 'c', taskType: 't', dependsOn: ['step-0', 'step-1'], priority: 2, params: {} },
      ];

      const levels = groupSteps(steps);

      expect(levels).toHaveLength(2);
      expect(levels[0].map((s: { stepId: string }) => s.stepId)).toEqual(['step-0', 'step-1']);
      expect(levels[1].map((s: { stepId: string }) => s.stepId)).toEqual(['step-2']);
    });

    it('should handle linear dependency chain', () => {
      const groupSteps = (service as unknown as Record<string, (steps: Array<{
        stepId: string;
        dependsOn: string[];
      }>) => Array<Array<{ stepId: string }>>>)['groupStepsByDependencyLevel'].bind(service);

      const steps = [
        { stepId: 'step-0', agentType: 'a', taskType: 't', dependsOn: [] as string[], priority: 1, params: {} },
        { stepId: 'step-1', agentType: 'b', taskType: 't', dependsOn: ['step-0'], priority: 2, params: {} },
        { stepId: 'step-2', agentType: 'c', taskType: 't', dependsOn: ['step-1'], priority: 3, params: {} },
      ];

      const levels = groupSteps(steps);

      expect(levels).toHaveLength(3);
      expect(levels[0]).toHaveLength(1);
      expect(levels[1]).toHaveLength(1);
      expect(levels[2]).toHaveLength(1);
    });

    it('should handle steps with missing dependencies by pushing to last level', () => {
      const groupSteps = (service as unknown as Record<string, (steps: Array<{
        stepId: string;
        dependsOn: string[];
      }>) => Array<Array<{ stepId: string }>>>)['groupStepsByDependencyLevel'].bind(service);

      const steps = [
        { stepId: 'step-0', agentType: 'a', taskType: 't', dependsOn: ['non-existent'], priority: 1, params: {} },
      ];

      const levels = groupSteps(steps);
      expect(levels).toHaveLength(1);
      expect(levels[0]).toHaveLength(1);
    });
  });

  describe('orchestrate (plan only)', () => {
    it('should return plan without execution when autoExecute is false', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              steps: [{
                agentType: 'data-intelligence',
                taskType: 'auto_analyze_dataset',
                dependsOn: [],
                priority: 1,
                params: {},
                reason: 'Analyze',
              }],
            }),
          },
        }],
      });

      const result = await service.orchestrate({
        description: 'Analyze my data',
        tenantId: 'tenant-1',
        userId: 'user-1',
        autoExecute: false,
      });

      expect(result.requestId).toMatch(/^auto-/);
      expect(result.plan.steps).toHaveLength(1);
      expect(result.results).toHaveLength(0);
      expect(result.orchestrationSummary).toContain('autoExecute=true');
      expect(mockPrismaAuditLogCreate).toHaveBeenCalled();
    });
  });
});
