// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockPrismaCreate = jest.fn().mockResolvedValue({ id: 'mock-id' });
const mockPrismaFindFirst = jest.fn().mockResolvedValue(null);
const mockPrismaFindMany = jest.fn().mockResolvedValue([]);
const mockPrismaUpdate = jest.fn().mockResolvedValue({ id: 'mock-id' });
const mockPrismaCount = jest.fn().mockResolvedValue(0);
const mockPrismaFindUnique = jest.fn().mockResolvedValue(null);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    longTermMemory: {
      findFirst: mockPrismaFindFirst,
      findMany: mockPrismaFindMany,
      create: mockPrismaCreate,
      update: mockPrismaUpdate,
    },
    episodicMemory: {
      create: mockPrismaCreate,
      findMany: mockPrismaFindMany,
    },
    semanticMemory: {
      findFirst: mockPrismaFindFirst,
      findMany: mockPrismaFindMany,
      create: mockPrismaCreate,
      update: mockPrismaUpdate,
    },
    proactiveInsight: {
      create: mockPrismaCreate,
      findMany: mockPrismaFindMany,
      update: mockPrismaUpdate,
    },
    tenant: { findMany: mockPrismaFindMany },
    dataset: { count: mockPrismaCount, findMany: mockPrismaFindMany, findFirst: mockPrismaFindFirst },
    dashboard: { count: mockPrismaCount },
    report: { count: mockPrismaCount },
    activityLog: { count: mockPrismaCount },
    datasetMetric: { findMany: mockPrismaFindMany },
  })),
}));

const mockChatCreate = jest.fn();
const mockEmbeddingsCreate = jest.fn().mockResolvedValue({
  data: [{ embedding: new Array(1536).fill(0.1) }],
});

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
    embeddings: { create: mockEmbeddingsCreate },
  })),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ─── Import Under Test ──────────────────────────────────────────────────────

import { ContextMemoryService } from '../services/intelligence/context-memory.service';
import { IntentEngineService } from '../services/intelligence/intent-engine.service';
import { TaskDecompositionService } from '../services/intelligence/task-decomposition.service';
import { ToolSelectionService } from '../services/intelligence/tool-selection.service';
import { PrismaClient } from '@prisma/client';

// ─── Context Memory Tests ───────────────────────────────────────────────────

describe('Context Memory Service', () => {
  let service: ContextMemoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    const mockPrisma = new PrismaClient();
    service = new ContextMemoryService(mockPrisma);
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('Short-Term Memory', () => {
    it('should store and retrieve a value', () => {
      service.storeShortTerm('tenant-1', 'user-1', 'key-1', { data: 'test' });

      const result = service.getShortTerm('tenant-1', 'user-1', 'key-1');

      expect(result).toEqual({ data: 'test' });
    });

    it('should return null for non-existent key', () => {
      const result = service.getShortTerm('tenant-1', 'user-1', 'missing');

      expect(result).toBeNull();
    });

    it('should return null for expired entries', () => {
      service.storeShortTerm('tenant-1', 'user-1', 'key-expire', 'value', 1);

      // Wait for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const result = service.getShortTerm('tenant-1', 'user-1', 'key-expire');
          expect(result).toBeNull();
          resolve();
        }, 10);
      });
    });

    it('should isolate values between tenants and users', () => {
      service.storeShortTerm('tenant-1', 'user-1', 'shared-key', 'value-a');
      service.storeShortTerm('tenant-2', 'user-1', 'shared-key', 'value-b');
      service.storeShortTerm('tenant-1', 'user-2', 'shared-key', 'value-c');

      expect(service.getShortTerm('tenant-1', 'user-1', 'shared-key')).toBe('value-a');
      expect(service.getShortTerm('tenant-2', 'user-1', 'shared-key')).toBe('value-b');
      expect(service.getShortTerm('tenant-1', 'user-2', 'shared-key')).toBe('value-c');
    });

    it('should overwrite existing values', () => {
      service.storeShortTerm('tenant-1', 'user-1', 'key-1', 'old');
      service.storeShortTerm('tenant-1', 'user-1', 'key-1', 'new');

      expect(service.getShortTerm('tenant-1', 'user-1', 'key-1')).toBe('new');
    });
  });

  describe('Long-Term Memory', () => {
    it('should create a new long-term memory entry', async () => {
      mockPrismaFindFirst.mockResolvedValueOnce(null);

      await service.storeLongTerm('tenant-1', 'user-1', 'preferences', 'theme', 'dark');

      expect(mockPrismaCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            userId: 'user-1',
            category: 'preferences',
            key: 'theme',
            value: '"dark"',
          }),
        }),
      );
    });

    it('should update existing long-term memory entry', async () => {
      mockPrismaFindFirst.mockResolvedValueOnce({ id: 'existing-id', value: '"old"' });

      await service.storeLongTerm('tenant-1', 'user-1', 'preferences', 'theme', 'light');

      expect(mockPrismaUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing-id' },
          data: expect.objectContaining({
            value: '"light"',
          }),
        }),
      );
    });

    it('should retrieve a specific long-term memory value', async () => {
      mockPrismaFindFirst.mockResolvedValueOnce({
        id: 'mem-1',
        value: '"dark"',
      });

      const result = await service.getLongTerm('tenant-1', 'user-1', 'preferences', 'theme');

      expect(result).toBe('dark');
    });

    it('should retrieve all entries in a category', async () => {
      mockPrismaFindMany.mockResolvedValueOnce([
        { id: 'mem-1', key: 'theme', value: '"dark"' },
        { id: 'mem-2', key: 'language', value: '"ar"' },
      ]);

      const result = await service.getLongTerm('tenant-1', 'user-1', 'preferences');

      expect(result).toEqual({ theme: 'dark', language: 'ar' });
    });
  });

  describe('Episodic Memory', () => {
    it('should store an episode and return its ID', async () => {
      mockPrismaCreate.mockResolvedValueOnce({ id: 'ep-1' });

      const episodeId = await service.storeEpisode('tenant-1', 'user-1', {
        sessionId: 'sess-1',
        action: 'analyze_data',
        input: { file: 'report.csv' },
        output: { rows: 100 },
        outcome: 'success',
        duration_ms: 5000,
        engineUsed: 'data_files',
        tags: ['analysis', 'csv'],
      });

      expect(typeof episodeId).toBe('string');
      expect(episodeId.length).toBeGreaterThan(0);
      expect(mockPrismaCreate).toHaveBeenCalled();
      expect(mockEmbeddingsCreate).toHaveBeenCalled();
    });

    it('should retrieve recent episodes', async () => {
      mockPrismaFindMany.mockResolvedValueOnce([
        {
          id: 'ep-1',
          sessionId: 'sess-1',
          action: 'analyze',
          input: '{"file":"test.csv"}',
          output: '{"rows":10}',
          outcome: 'success',
          durationMs: 3000,
          engineUsed: 'data_files',
          tags: '["csv"]',
          timestamp: new Date(),
        },
      ]);

      const episodes = await service.getRecentEpisodes('tenant-1', 'user-1', 5);

      expect(episodes).toHaveLength(1);
      expect(episodes[0].action).toBe('analyze');
      expect(episodes[0].outcome).toBe('success');
    });

    it('should search episodes by query', async () => {
      mockPrismaFindMany.mockResolvedValueOnce([
        {
          id: 'ep-1',
          sessionId: 'sess-1',
          action: 'analyze csv data',
          input: '{}',
          output: '{}',
          outcome: 'success',
          durationMs: 3000,
          engineUsed: 'data_files',
          tags: '["csv","analysis"]',
          embedding: JSON.stringify(new Array(1536).fill(0.1)),
          timestamp: new Date(),
        },
        {
          id: 'ep-2',
          sessionId: 'sess-1',
          action: 'build dashboard',
          input: '{}',
          output: '{}',
          outcome: 'success',
          durationMs: 5000,
          engineUsed: 'dashboards',
          tags: '["dashboard"]',
          embedding: JSON.stringify(new Array(1536).fill(0.2)),
          timestamp: new Date(),
        },
      ]);

      const results = await service.searchEpisodes('tenant-1', 'user-1', 'csv analysis');

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Semantic Memory', () => {
    it('should store a new semantic fact', async () => {
      mockPrismaFindFirst.mockResolvedValueOnce(null);
      mockPrismaCreate.mockResolvedValueOnce({ id: 'fact-1' });

      const factId = await service.storeSemanticFact('tenant-1', {
        subject: 'sales_data',
        predicate: 'has_format',
        object: 'csv',
        confidence: 0.95,
        source: 'system',
        tags: ['format', 'data'],
      });

      expect(typeof factId).toBe('string');
      expect(mockPrismaCreate).toHaveBeenCalled();
    });

    it('should update existing semantic fact with higher confidence', async () => {
      mockPrismaFindFirst.mockResolvedValueOnce({
        id: 'existing-fact',
        confidence: 0.7,
        validFrom: new Date(),
        validUntil: null,
      });

      await service.storeSemanticFact('tenant-1', {
        subject: 'sales_data',
        predicate: 'has_format',
        object: 'csv',
        confidence: 0.95,
        source: 'system',
        tags: ['format'],
      });

      expect(mockPrismaUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing-fact' },
          data: expect.objectContaining({
            confidence: 0.95,
          }),
        }),
      );
    });

    it('should query semantic facts by text', async () => {
      mockPrismaFindMany.mockResolvedValueOnce([
        {
          id: 'fact-1',
          subject: 'sales',
          predicate: 'is_type',
          object: 'revenue',
          confidence: 0.9,
          source: 'system',
          validFrom: new Date(),
          validUntil: null,
          tags: '["finance"]',
          embedding: JSON.stringify(new Array(1536).fill(0.1)),
        },
      ]);

      const facts = await service.querySemanticFacts('tenant-1', 'sales revenue');

      expect(facts.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Working Memory', () => {
    it('should return a fresh working memory', () => {
      const wm = service.getWorkingMemory('tenant-1', 'user-1');

      expect(wm.currentTask).toBeNull();
      expect(wm.activeGoals).toEqual([]);
      expect(wm.pendingSteps).toEqual([]);
      expect(wm.completedSteps).toEqual([]);
    });

    it('should update working memory', () => {
      service.updateWorkingMemory('tenant-1', 'user-1', {
        currentTask: 'Analyze sales data',
        activeGoals: ['find trends'],
      });

      const wm = service.getWorkingMemory('tenant-1', 'user-1');

      expect(wm.currentTask).toBe('Analyze sales data');
      expect(wm.activeGoals).toEqual(['find trends']);
    });

    it('should merge scratchpad on update', () => {
      service.updateWorkingMemory('tenant-1', 'user-1', {
        scratchpad: { key1: 'value1' },
      });
      service.updateWorkingMemory('tenant-1', 'user-1', {
        scratchpad: { key2: 'value2' },
      });

      const wm = service.getWorkingMemory('tenant-1', 'user-1');

      expect(wm.scratchpad).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should clear working memory', () => {
      service.updateWorkingMemory('tenant-1', 'user-1', {
        currentTask: 'Some task',
      });

      service.clearWorkingMemory('tenant-1', 'user-1');

      const wm = service.getWorkingMemory('tenant-1', 'user-1');
      expect(wm.currentTask).toBeNull();
    });

    it('should enforce capacity limits on pending steps', () => {
      const manySteps = Array.from({ length: 30 }, (_, i) => ({
        id: `step-${i}`,
        description: `Step ${i}`,
        status: 'pending' as const,
      }));

      service.updateWorkingMemory('tenant-1', 'user-1', {
        pendingSteps: manySteps,
      });

      const wm = service.getWorkingMemory('tenant-1', 'user-1');
      expect(wm.pendingSteps.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Context Builder', () => {
    it('should build an intelligence context', async () => {
      mockPrismaFindMany.mockResolvedValue([]);

      const context = await service.buildContext('tenant-1', 'user-1', 'analyze my data');

      expect(context).toHaveProperty('recentEpisodes');
      expect(context).toHaveProperty('relevantFacts');
      expect(context).toHaveProperty('workingMemory');
      expect(context).toHaveProperty('shortTermData');
      expect(context).toHaveProperty('userPreferences');
      expect(context).toHaveProperty('sessionHistory');
      expect(context).toHaveProperty('contextRelevanceScore');
      expect(typeof context.contextRelevanceScore).toBe('number');
    });
  });
});

// ─── Intent Engine Tests ────────────────────────────────────────────────────

describe('Intent Engine Service', () => {
  let engine: IntentEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new IntentEngineService();
  });

  describe('Language Detection', () => {
    it('should detect Arabic text', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: 'analyze', confidence: 0.9, entities: [], alternativeIntents: [], normalizedCommand: 'analyze data' }) } }],
      });

      const result = await engine.parseIntent('حلل البيانات في الملف');

      expect(result.detectedLanguage).toBe('ar');
    });

    it('should detect English text', async () => {
      const result = await engine.parseIntent('analyze the sales data');

      expect(result.detectedLanguage).toBe('en');
    });

    it('should detect mixed language text', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: 'analyze', confidence: 0.9, entities: [], alternativeIntents: [], normalizedCommand: 'analyze' }) } }],
      });

      const result = await engine.parseIntent('حلل ال data في ملف sales.csv');

      expect(result.detectedLanguage).toBe('mixed');
    });
  });

  describe('Dialect Detection', () => {
    it('should detect Saudi dialect', async () => {
      const result = await engine.parseIntent('ابغى تحليل البيانات ذحين');

      expect(result.dialect).toBe('saudi');
    });

    it('should detect Egyptian dialect', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: 'query', confidence: 0.8, entities: [], alternativeIntents: [], normalizedCommand: 'query' }) } }],
      });

      const result = await engine.parseIntent('عايز اعرف البيانات دي ازاي');

      expect(result.dialect).toBe('egyptian');
    });

    it('should detect Levantine dialect', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: 'query', confidence: 0.8, entities: [], alternativeIntents: [], normalizedCommand: 'query' }) } }],
      });

      const result = await engine.parseIntent('بدي شوف البيانات هيك');

      expect(result.dialect).toBe('levantine');
    });
  });

  describe('Intent Detection', () => {
    it('should detect analyze intent', async () => {
      const result = await engine.parseIntent('analyze the quarterly sales data');

      expect(result.intent).toBe('analyze');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should detect dashboard intent in Arabic', async () => {
      const result = await engine.parseIntent('اعمل لوحة مؤشرات للمبيعات');

      expect(result.intent).toBe('build_dashboard');
    });

    it('should detect report generation intent', async () => {
      const result = await engine.parseIntent('generate a monthly report');

      expect(result.intent).toBe('generate_report');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should detect translate intent', async () => {
      const result = await engine.parseIntent('translate this document to Arabic');

      expect(result.intent).toBe('translate');
    });

    it('should return unknown for empty text', async () => {
      const result = await engine.parseIntent('');

      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.isAmbiguous).toBe(true);
    });

    it('should return target engines for detected intent', async () => {
      const result = await engine.parseIntent('build a dashboard for revenue metrics');

      expect(result.targetEngines).toContain('dashboards');
    });
  });

  describe('Entity Extraction', () => {
    it('should extract file names', async () => {
      const result = await engine.parseIntent('analyze the data in sales-2024.csv');

      const fileEntities = result.entities.filter((e) => e.type === 'file');
      expect(fileEntities.length).toBeGreaterThan(0);
      expect(fileEntities[0].value).toBe('sales-2024.csv');
    });

    it('should extract date patterns', async () => {
      const result = await engine.parseIntent('show data from 2024-01-15 to 2024-12-31');

      const dateEntities = result.entities.filter((e) => e.type === 'date_range');
      expect(dateEntities.length).toBeGreaterThan(0);
    });

    it('should extract percentage values', async () => {
      const result = await engine.parseIntent('filter rows where growth is above 15%');

      const percentEntities = result.entities.filter((e) => e.type === 'percentage');
      expect(percentEntities.length).toBeGreaterThan(0);
    });

    it('should extract format types', async () => {
      const result = await engine.parseIntent('export the data as json');

      const formatEntities = result.entities.filter((e) => e.type === 'format');
      expect(formatEntities.length).toBeGreaterThan(0);
      expect(formatEntities[0].normalizedValue).toBe('json');
    });
  });
});

// ─── Task Decomposition Tests ───────────────────────────────────────────────

describe('Task Decomposition Service', () => {
  let decomposer: TaskDecompositionService;

  beforeEach(() => {
    jest.clearAllMocks();
    decomposer = new TaskDecompositionService();
  });

  it('should decompose an analyze intent into steps', async () => {
    const intentResult = {
      id: 'test-id',
      originalText: 'analyze the sales data',
      detectedLanguage: 'en' as const,
      dialect: 'msa' as const,
      intent: 'analyze' as const,
      subIntent: null,
      confidence: 0.9,
      entities: [],
      alternativeIntents: [],
      isAmbiguous: false,
      disambiguationOptions: [],
      targetEngines: ['data_files', 'ai_intelligence'],
      normalizedCommand: 'analyze the sales data',
    };

    const result = await decomposer.decompose(intentResult);

    expect(result.plan).toBeDefined();
    expect(result.plan.steps.length).toBeGreaterThan(0);
    expect(result.dag.length).toBeGreaterThan(0);
    expect(result.plan.totalEstimatedTimeMs).toBeGreaterThan(0);
  });

  it('should create a DAG with proper dependencies', async () => {
    const intentResult = {
      id: 'test-id',
      originalText: 'build dashboard from data',
      detectedLanguage: 'en' as const,
      dialect: 'msa' as const,
      intent: 'build_dashboard' as const,
      subIntent: null,
      confidence: 0.85,
      entities: [],
      alternativeIntents: [],
      isAmbiguous: false,
      disambiguationOptions: [],
      targetEngines: ['dashboards'],
      normalizedCommand: 'build dashboard from data',
    };

    const result = await decomposer.decompose(intentResult);

    // First step should have no parents
    const rootNodes = result.dag.filter((n) => n.parents.length === 0);
    expect(rootNodes.length).toBeGreaterThan(0);

    // Steps with dependencies should reference valid step IDs
    for (const step of result.plan.steps) {
      for (const depId of step.dependencies) {
        const depExists = result.plan.steps.some((s) => s.id === depId);
        expect(depExists).toBe(true);
      }
    }
  });

  it('should support parallel execution order', async () => {
    const intentResult = {
      id: 'test-id',
      originalText: 'compare file-a.csv and file-b.csv',
      detectedLanguage: 'en' as const,
      dialect: 'msa' as const,
      intent: 'compare' as const,
      subIntent: null,
      confidence: 0.9,
      entities: [
        { type: 'file' as const, value: 'file-a.csv', normalizedValue: 'file-a.csv', confidence: 0.95, position: { start: 8, end: 18 } },
        { type: 'file' as const, value: 'file-b.csv', normalizedValue: 'file-b.csv', confidence: 0.95, position: { start: 23, end: 33 } },
      ],
      alternativeIntents: [],
      isAmbiguous: false,
      disambiguationOptions: [],
      targetEngines: ['data_files', 'literal_match'],
      normalizedCommand: 'compare file-a.csv and file-b.csv',
    };

    const result = await decomposer.decompose(intentResult);

    // Compare intent should have parallel loading steps
    expect(result.plan.executionOrder.length).toBeGreaterThan(0);
    // First level should have parallel steps (loading both files)
    const firstLevel = result.plan.executionOrder[0];
    expect(firstLevel.length).toBeGreaterThanOrEqual(2);
  });

  it('should include estimated time for the plan', async () => {
    const intentResult = {
      id: 'test-id',
      originalText: 'generate report',
      detectedLanguage: 'en' as const,
      dialect: 'msa' as const,
      intent: 'generate_report' as const,
      subIntent: null,
      confidence: 0.9,
      entities: [],
      alternativeIntents: [],
      isAmbiguous: false,
      disambiguationOptions: [],
      targetEngines: ['reports'],
      normalizedCommand: 'generate report',
    };

    const result = await decomposer.decompose(intentResult);

    expect(result.plan.totalEstimatedTimeMs).toBeGreaterThan(0);
    for (const step of result.plan.steps) {
      expect(step.estimatedTimeMs).toBeGreaterThan(0);
      expect(step.estimatedResources).toBeDefined();
      expect(step.retryPolicy).toBeDefined();
    }
  });
});

// ─── Tool Selection Tests ───────────────────────────────────────────────────

describe('Tool Selection Service', () => {
  let selector: ToolSelectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    selector = new ToolSelectionService();
  });

  it('should select tools for a set of steps', () => {
    const steps = [
      {
        id: 'step-1',
        name: 'Read File',
        description: 'Read data file',
        engine: 'data_files',
        action: 'read_file',
        inputSchema: {},
        expectedOutputSchema: {},
        dependencies: [],
        estimatedTimeMs: 2000,
        estimatedResources: { cpuIntensity: 'medium' as const, memoryMb: 256, requiresGpu: false, networkCalls: 0, dbQueries: 1 },
        priority: 1,
        isOptional: false,
        retryPolicy: { maxRetries: 3, retryDelayMs: 1000, backoffMultiplier: 2 },
        condition: null,
      },
      {
        id: 'step-2',
        name: 'Analyze',
        description: 'AI analysis',
        engine: 'ai_intelligence',
        action: 'analyze_data',
        inputSchema: {},
        expectedOutputSchema: {},
        dependencies: ['step-1'],
        estimatedTimeMs: 15000,
        estimatedResources: { cpuIntensity: 'high' as const, memoryMb: 512, requiresGpu: false, networkCalls: 3, dbQueries: 2 },
        priority: 2,
        isOptional: false,
        retryPolicy: { maxRetries: 3, retryDelayMs: 1000, backoffMultiplier: 2 },
        condition: null,
      },
    ];

    const plan = selector.selectToolsForPlan(steps);

    expect(plan.selections).toHaveLength(2);
    expect(plan.overallConfidence).toBeGreaterThan(0);

    // First step should select Data File Reader
    expect(plan.selections[0].primaryTool.toolName).toBe('Data File Reader');

    // Second step should select AI Analyzer
    expect(plan.selections[1].primaryTool.toolName).toBe('AI Analyzer');
  });

  it('should provide fallback tools', () => {
    const steps = [
      {
        id: 'step-1',
        name: 'Read File',
        description: 'Read data file',
        engine: 'data_files',
        action: 'read_file',
        inputSchema: {},
        expectedOutputSchema: {},
        dependencies: [],
        estimatedTimeMs: 2000,
        estimatedResources: { cpuIntensity: 'medium' as const, memoryMb: 256, requiresGpu: false, networkCalls: 0, dbQueries: 1 },
        priority: 1,
        isOptional: false,
        retryPolicy: { maxRetries: 3, retryDelayMs: 1000, backoffMultiplier: 2 },
        condition: null,
      },
    ];

    const plan = selector.selectToolsForPlan(steps);

    // Should have primary tool and possibly fallbacks
    expect(plan.selections[0].primaryTool).toBeDefined();
    expect(plan.selections[0].primaryTool.fitnessScore).toBeGreaterThan(0);
  });

  it('should check data flow compatibility', () => {
    const steps = [
      {
        id: 'step-1',
        name: 'Read File',
        description: 'Read file',
        engine: 'data_files',
        action: 'read_file',
        inputSchema: {},
        expectedOutputSchema: {},
        dependencies: [],
        estimatedTimeMs: 2000,
        estimatedResources: { cpuIntensity: 'medium' as const, memoryMb: 256, requiresGpu: false, networkCalls: 0, dbQueries: 1 },
        priority: 1,
        isOptional: false,
        retryPolicy: { maxRetries: 3, retryDelayMs: 1000, backoffMultiplier: 2 },
        condition: null,
      },
      {
        id: 'step-2',
        name: 'Create Dashboard',
        description: 'Dashboard creation',
        engine: 'dashboards',
        action: 'create_dashboard',
        inputSchema: {},
        expectedOutputSchema: {},
        dependencies: ['step-1'],
        estimatedTimeMs: 15000,
        estimatedResources: { cpuIntensity: 'high' as const, memoryMb: 512, requiresGpu: false, networkCalls: 1, dbQueries: 5 },
        priority: 2,
        isOptional: false,
        retryPolicy: { maxRetries: 3, retryDelayMs: 1000, backoffMultiplier: 2 },
        condition: null,
      },
    ];

    const plan = selector.selectToolsForPlan(steps);

    expect(plan.dataFlowCompatible).toBe(true);
  });

  it('should return tool capabilities', () => {
    const capabilities = selector.getToolCapabilities();

    expect(capabilities.length).toBeGreaterThan(0);
    expect(capabilities[0]).toHaveProperty('id');
    expect(capabilities[0]).toHaveProperty('name');
    expect(capabilities[0]).toHaveProperty('engine');
    expect(capabilities[0]).toHaveProperty('actions');
    expect(capabilities[0]).toHaveProperty('supportsArabic');
  });

  it('should find tools by engine', () => {
    const dataTools = selector.getToolByEngine('data_files');

    expect(dataTools.length).toBeGreaterThan(0);
    for (const tool of dataTools) {
      expect(tool.engine).toBe('data_files');
    }
  });

  it('should find tools by action', () => {
    const readTools = selector.getToolByAction('read_file');

    expect(readTools.length).toBeGreaterThan(0);
    for (const tool of readTools) {
      expect(tool.actions).toContain('read_file');
    }
  });

  it('should register and unregister tools', () => {
    const customTool = {
      id: 'tool-custom',
      name: 'Custom Tool',
      engine: 'custom',
      actions: ['custom_action'],
      inputFormats: ['json'],
      outputFormats: ['json'],
      maxInputSizeMb: 100,
      supportsStreaming: false,
      supportsArabic: true,
      supportsBatch: false,
      performanceProfile: { avgLatencyMs: 1000, throughputPerSecond: 10, reliabilityScore: 0.95 },
      tags: ['custom'],
    };

    selector.registerTool(customTool);

    const customTools = selector.getToolByEngine('custom');
    expect(customTools).toHaveLength(1);

    const removed = selector.unregisterTool('tool-custom');
    expect(removed).toBe(true);

    const afterRemoval = selector.getToolByEngine('custom');
    expect(afterRemoval).toHaveLength(0);
  });

  it('should handle steps with no matching tools gracefully', () => {
    const steps = [
      {
        id: 'step-1',
        name: 'Unknown Step',
        description: 'Unknown action',
        engine: 'nonexistent_engine',
        action: 'nonexistent_action',
        inputSchema: {},
        expectedOutputSchema: {},
        dependencies: [],
        estimatedTimeMs: 5000,
        estimatedResources: { cpuIntensity: 'medium' as const, memoryMb: 256, requiresGpu: false, networkCalls: 0, dbQueries: 0 },
        priority: 1,
        isOptional: false,
        retryPolicy: { maxRetries: 1, retryDelayMs: 1000, backoffMultiplier: 2 },
        condition: null,
      },
    ];

    const plan = selector.selectToolsForPlan(steps);

    expect(plan.selections).toHaveLength(1);
    expect(plan.selections[0].warnings.length).toBeGreaterThan(0);
    // Should use fallback
    expect(plan.selections[0].primaryTool.toolName).toContain('fallback');
  });
});
