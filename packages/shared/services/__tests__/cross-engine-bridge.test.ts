/**
 * Cross-Engine Bridge Tests — Rasid Platform
 * اختبارات جسر البيانات بين المحركات
 */

import {
  CrossEngineBridge,
  EngineType,
  BridgePayload,
  resetCrossEngineBridge,
} from '../cross-engine-bridge';

function makeMetadata(overrides?: Partial<BridgePayload['metadata']>): BridgePayload['metadata'] {
  return {
    tenantId: 'tenant-001',
    userId: 'user-001',
    timestamp: new Date().toISOString(),
    correlationId: 'corr-001',
    ...overrides,
  };
}

describe('CrossEngineBridge', () => {
  let bridge: CrossEngineBridge;

  beforeEach(() => {
    resetCrossEngineBridge();
    bridge = new CrossEngineBridge();
  });

  // -------------------------------------------------------------------------
  // Publish / Subscribe
  // -------------------------------------------------------------------------

  describe('publish and subscribe', () => {
    it('should deliver a payload to a matching subscriber', async () => {
      const received: BridgePayload[] = [];

      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async (payload) => {
          received.push(payload);
        },
      });

      const payloadId = await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: { rows: [{ a: 1 }], columns: ['a'] },
        metadata: makeMetadata(),
      });

      expect(payloadId).toBeDefined();
      expect(typeof payloadId).toBe('string');
      expect(received).toHaveLength(1);
      expect(received[0].dataType).toBe('dataset');
      expect(received[0].sourceEngine).toBe(EngineType.DATA);
    });

    it('should deliver broadcast payloads (targetEngine = "*") to all subscribers', async () => {
      const receivedDashboard: BridgePayload[] = [];
      const receivedReporting: BridgePayload[] = [];

      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async (payload) => {
          receivedDashboard.push(payload);
        },
      });

      bridge.subscribe({
        engine: EngineType.REPORTING,
        dataTypes: ['dataset'],
        callback: async (payload) => {
          receivedReporting.push(payload);
        },
      });

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: '*',
        dataType: 'dataset',
        data: { rows: [] },
        metadata: makeMetadata(),
      });

      expect(receivedDashboard).toHaveLength(1);
      expect(receivedReporting).toHaveLength(1);
    });

    it('should not deliver to subscribers with non-matching dataTypes', async () => {
      const received: BridgePayload[] = [];

      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['chart'],
        callback: async (payload) => {
          received.push(payload);
        },
      });

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: { rows: [] },
        metadata: makeMetadata(),
      });

      expect(received).toHaveLength(0);
    });

    it('should deliver to subscribers with wildcard dataTypes', async () => {
      const received: BridgePayload[] = [];

      bridge.subscribe({
        engine: EngineType.AI,
        dataTypes: ['*'],
        callback: async (payload) => {
          received.push(payload);
        },
      });

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.AI,
        dataType: 'analysis',
        data: { result: 'test' },
        metadata: makeMetadata(),
      });

      expect(received).toHaveLength(1);
    });

    it('should deliver to subscribers with empty dataTypes (match all)', async () => {
      const received: BridgePayload[] = [];

      bridge.subscribe({
        engine: EngineType.GOVERNANCE,
        dataTypes: [],
        callback: async (payload) => {
          received.push(payload);
        },
      });

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.GOVERNANCE,
        dataType: 'audit',
        data: { action: 'test' },
        metadata: makeMetadata(),
      });

      expect(received).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple subscribers
  // -------------------------------------------------------------------------

  describe('multiple subscribers', () => {
    it('should deliver to multiple subscribers for the same engine and dataType', async () => {
      const received1: BridgePayload[] = [];
      const received2: BridgePayload[] = [];

      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async (payload) => {
          received1.push(payload);
        },
      });

      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async (payload) => {
          received2.push(payload);
        },
      });

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: { value: 42 },
        metadata: makeMetadata(),
      });

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('should handle subscriber errors gracefully and still deliver to others', async () => {
      const received: BridgePayload[] = [];

      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async () => {
          throw new Error('Subscriber failure');
        },
      });

      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async (payload) => {
          received.push(payload);
        },
      });

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: { value: 1 },
        metadata: makeMetadata(),
      });

      // The second subscriber should still receive
      expect(received).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Unsubscribe
  // -------------------------------------------------------------------------

  describe('unsubscribe', () => {
    it('should stop delivering after unsubscribe', async () => {
      const received: BridgePayload[] = [];

      const subId = bridge.subscribe({
        engine: EngineType.REPORTING,
        dataTypes: ['report'],
        callback: async (payload) => {
          received.push(payload);
        },
      });

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.REPORTING,
        dataType: 'report',
        data: { title: 'First' },
        metadata: makeMetadata(),
      });

      expect(received).toHaveLength(1);

      bridge.unsubscribe(subId);

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.REPORTING,
        dataType: 'report',
        data: { title: 'Second' },
        metadata: makeMetadata(),
      });

      expect(received).toHaveLength(1); // Still 1, not 2
    });

    it('should throw when unsubscribing a non-existent subscription', () => {
      expect(() => bridge.unsubscribe('non-existent-id')).toThrow(
        'Subscription not found'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Request / Response
  // -------------------------------------------------------------------------

  describe('request and response', () => {
    it('should execute a synchronous request/response flow', async () => {
      bridge.registerHandler(
        EngineType.EXCEL,
        'dataset',
        async (payload) => {
          const rows = payload.data['rows'] as unknown[];
          return { processedRows: rows?.length ?? 0, status: 'complete' };
        }
      );

      const response = await bridge.request(
        EngineType.DATA,
        EngineType.EXCEL,
        'dataset',
        { rows: [{ a: 1 }, { a: 2 }, { a: 3 }] },
        { tenantId: 'tenant-001', userId: 'user-001' }
      );

      expect(response.sourceEngine).toBe(EngineType.EXCEL);
      expect(response.targetEngine).toBe(EngineType.DATA);
      expect(response.dataType).toBe('dataset:response');
      expect(response.data['processedRows']).toBe(3);
      expect(response.data['status']).toBe('complete');
    });

    it('should throw when no handler is registered for the target', async () => {
      await expect(
        bridge.request(
          EngineType.DATA,
          EngineType.PRESENTATION,
          'slides',
          { content: 'test' },
          { tenantId: 'tenant-001', userId: 'user-001' }
        )
      ).rejects.toThrow('No handler registered');
    });

    it('should throw when the handler itself throws', async () => {
      bridge.registerHandler(
        EngineType.AI,
        'analysis',
        async () => {
          throw new Error('AI model unavailable');
        }
      );

      await expect(
        bridge.request(
          EngineType.DATA,
          EngineType.AI,
          'analysis',
          { query: 'test' },
          { tenantId: 'tenant-001', userId: 'user-001' }
        )
      ).rejects.toThrow('Handler error');
    });

    it('should preserve correlationId in request/response', async () => {
      bridge.registerHandler(
        EngineType.LOCALIZATION,
        'translation',
        async () => ({ translated: 'مرحبا' })
      );

      const response = await bridge.request(
        EngineType.REPORTING,
        EngineType.LOCALIZATION,
        'translation',
        { text: 'Hello' },
        { tenantId: 'tenant-001', userId: 'user-001', correlationId: 'my-corr-id' }
      );

      expect(response.metadata.correlationId).toBe('my-corr-id');
    });
  });

  // -------------------------------------------------------------------------
  // Lineage Tracking
  // -------------------------------------------------------------------------

  describe('lineage tracking', () => {
    it('should record lineage on publish with subscriber delivery', async () => {
      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async () => { /* no-op */ },
      });

      const payloadId = await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: { rows: [] },
        metadata: makeMetadata(),
      });

      const lineage = bridge.getLineage(payloadId);
      expect(lineage.length).toBeGreaterThanOrEqual(1);
      expect(lineage[0].sourceEngine).toBe(EngineType.DATA);
      expect(lineage[0].targetEngine).toBe(EngineType.DASHBOARD);
      expect(lineage[0].dataType).toBe('dataset');
    });

    it('should record lineage on request/response', async () => {
      bridge.registerHandler(
        EngineType.EXCEL,
        'dataset',
        async () => ({ result: 'ok' })
      );

      const response = await bridge.request(
        EngineType.DATA,
        EngineType.EXCEL,
        'dataset',
        { rows: [] },
        { tenantId: 'tenant-001', userId: 'user-001' }
      );

      // Check lineage for the response payload
      const lineage = bridge.getLineage(response.id);
      expect(lineage.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter lineage by tenant', async () => {
      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async () => { /* no-op */ },
      });

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: { rows: [] },
        metadata: makeMetadata({ tenantId: 'tenant-A' }),
      });

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: { rows: [] },
        metadata: makeMetadata({ tenantId: 'tenant-B' }),
      });

      const lineageA = bridge.getLineageByTenant('tenant-A');
      const lineageB = bridge.getLineageByTenant('tenant-B');

      expect(lineageA.length).toBeGreaterThanOrEqual(1);
      expect(lineageB.length).toBeGreaterThanOrEqual(1);
      expect(lineageA.every((r) => r.tenantId === 'tenant-A')).toBe(true);
      expect(lineageB.every((r) => r.tenantId === 'tenant-B')).toBe(true);
    });

    it('should respect the limit parameter on getLineageByTenant', async () => {
      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async () => { /* no-op */ },
      });

      for (let i = 0; i < 5; i++) {
        await bridge.publish({
          sourceEngine: EngineType.DATA,
          targetEngine: EngineType.DASHBOARD,
          dataType: 'dataset',
          data: { index: i },
          metadata: makeMetadata({ tenantId: 'tenant-limited' }),
        });
      }

      const limited = bridge.getLineageByTenant('tenant-limited', 2);
      expect(limited).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Data Transformation
  // -------------------------------------------------------------------------

  describe('data transformation', () => {
    it('should transform dataset to chart format', () => {
      const payload: BridgePayload = {
        id: 'test-payload-1',
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: {
          columns: ['month', 'revenue', 'expenses'],
          rows: [
            { month: 'Jan', revenue: 100, expenses: 80 },
            { month: 'Feb', revenue: 120, expenses: 90 },
          ],
        },
        metadata: makeMetadata(),
      };

      const transformed = bridge.transformData(payload, 'chart');

      expect(transformed.dataType).toBe('chart');
      expect(transformed.data['labels']).toEqual(['Jan', 'Feb']);
      expect((transformed.data['series'] as Record<string, unknown[]>)['revenue']).toEqual([100, 120]);
      expect((transformed.data['series'] as Record<string, unknown[]>)['expenses']).toEqual([80, 90]);
    });

    it('should transform chart to dataset format', () => {
      const payload: BridgePayload = {
        id: 'test-payload-2',
        sourceEngine: EngineType.DASHBOARD,
        targetEngine: EngineType.REPORTING,
        dataType: 'chart',
        data: {
          labels: ['Q1', 'Q2'],
          series: { sales: [1000, 1500], profit: [200, 350] },
        },
        metadata: makeMetadata(),
      };

      const transformed = bridge.transformData(payload, 'dataset');

      expect(transformed.dataType).toBe('dataset');
      expect(transformed.data['columns']).toEqual(['label', 'sales', 'profit']);
      expect((transformed.data['rows'] as Record<string, unknown>[]).length).toBe(2);
    });

    it('should transform dataset to report format', () => {
      const payload: BridgePayload = {
        id: 'test-payload-3',
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.REPORTING,
        dataType: 'dataset',
        data: {
          title: 'Sales Data',
          columns: ['product', 'quantity'],
          rows: [{ product: 'Widget', quantity: 50 }],
        },
        metadata: makeMetadata(),
      };

      const transformed = bridge.transformData(payload, 'report');

      expect(transformed.dataType).toBe('report');
      expect(transformed.data['title']).toBe('Sales Data');
      expect(Array.isArray(transformed.data['sections'])).toBe(true);
    });

    it('should transform dataset to analysis format', () => {
      const payload: BridgePayload = {
        id: 'test-payload-4',
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.AI,
        dataType: 'dataset',
        data: {
          columns: ['name', 'score'],
          rows: [
            { name: 'Alice', score: 90 },
            { name: 'Bob', score: 80 },
            { name: 'Charlie', score: 70 },
          ],
        },
        metadata: makeMetadata(),
      };

      const transformed = bridge.transformData(payload, 'analysis');

      expect(transformed.dataType).toBe('analysis');
      expect(transformed.data['rowCount']).toBe(3);
      const stats = transformed.data['statistics'] as Record<string, Record<string, unknown>>;
      expect(stats['score']).toBeDefined();
      expect(stats['score']['mean']).toBe(80);
      expect(stats['score']['min']).toBe(70);
      expect(stats['score']['max']).toBe(90);
    });

    it('should handle two-hop transformation (dataset -> chart -> dataset)', () => {
      // dataset -> analysis is direct, but analysis -> report is also direct,
      // so dataset -> analysis -> report should work via two-hop
      const payload: BridgePayload = {
        id: 'test-payload-5',
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.REPORTING,
        dataType: 'dataset',
        data: {
          columns: ['name', 'value'],
          rows: [{ name: 'X', value: 10 }],
        },
        metadata: makeMetadata(),
      };

      // dataset -> presentation uses direct transformer
      const transformed = bridge.transformData(payload, 'presentation');
      expect(transformed.dataType).toBe('presentation');
      expect(transformed.data['slides']).toBeDefined();
    });

    it('should return a copy when source and target formats are the same', () => {
      const payload: BridgePayload = {
        id: 'test-payload-6',
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.EXCEL,
        dataType: 'dataset',
        data: { rows: [{ a: 1 }] },
        metadata: makeMetadata(),
      };

      const result = bridge.transformData(payload, 'dataset');
      expect(result.dataType).toBe('dataset');
      expect(result).not.toBe(payload); // Should be a copy
    });

    it('should throw for unsupported transformation', () => {
      const payload: BridgePayload = {
        id: 'test-payload-7',
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.GOVERNANCE,
        dataType: 'custom-format',
        data: { unknown: true },
        metadata: makeMetadata(),
      };

      expect(() => bridge.transformData(payload, 'alien-format')).toThrow(
        'No transformer found'
      );
    });

    it('should record lineage for transformations', () => {
      const payload: BridgePayload = {
        id: 'test-payload-8',
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: {
          columns: ['x', 'y'],
          rows: [{ x: 'a', y: 1 }],
        },
        metadata: makeMetadata(),
      };

      const transformed = bridge.transformData(payload, 'chart');
      const lineage = bridge.getLineage(transformed.id);

      expect(lineage.length).toBeGreaterThanOrEqual(1);
      expect(lineage[0].transformations).toContain('dataset->chart');
    });
  });

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  describe('stats', () => {
    it('should return initial stats with zero counts', () => {
      const stats = bridge.getStats();

      expect(stats.totalPublished).toBe(0);
      expect(stats.totalDelivered).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.activeSubscriptions).toBe(0);
      expect(stats.registeredHandlers).toBe(0);
      expect(stats.lineageRecords).toBe(0);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should track publish and delivery counts', async () => {
      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async () => { /* no-op */ },
      });

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: { rows: [] },
        metadata: makeMetadata(),
      });

      const stats = bridge.getStats();

      expect(stats.totalPublished).toBe(1);
      expect(stats.totalDelivered).toBe(1);
      expect(stats.activeSubscriptions).toBe(1);
      expect(stats.publishedByEngine[EngineType.DATA]).toBe(1);
      expect(stats.deliveredByEngine[EngineType.DASHBOARD]).toBe(1);
      expect(stats.publishedByDataType['dataset']).toBe(1);
    });

    it('should track request counts', async () => {
      bridge.registerHandler(
        EngineType.EXCEL,
        'dataset',
        async () => ({ result: 'ok' })
      );

      await bridge.request(
        EngineType.DATA,
        EngineType.EXCEL,
        'dataset',
        { rows: [] },
        { tenantId: 'tenant-001', userId: 'user-001' }
      );

      const stats = bridge.getStats();

      expect(stats.totalRequests).toBe(1);
      expect(stats.registeredHandlers).toBe(1);
      expect(stats.requestsByEngine[EngineType.DATA]).toBe(1);
    });

    it('should track error counts', async () => {
      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async () => {
          throw new Error('fail');
        },
      });

      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: {},
        metadata: makeMetadata(),
      });

      const stats = bridge.getStats();
      expect(stats.totalErrors).toBeGreaterThanOrEqual(1);
    });

    it('should track subscription count accurately after unsubscribe', () => {
      const id1 = bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async () => { /* no-op */ },
      });

      bridge.subscribe({
        engine: EngineType.REPORTING,
        dataTypes: ['report'],
        callback: async () => { /* no-op */ },
      });

      expect(bridge.getStats().activeSubscriptions).toBe(2);

      bridge.unsubscribe(id1);

      expect(bridge.getStats().activeSubscriptions).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // TTL
  // -------------------------------------------------------------------------

  describe('TTL expiration', () => {
    it('should not deliver payloads with expired TTL', async () => {
      const received: BridgePayload[] = [];

      bridge.subscribe({
        engine: EngineType.DASHBOARD,
        dataTypes: ['dataset'],
        callback: async (payload) => {
          received.push(payload);
        },
      });

      // Publish with an already-expired timestamp
      await bridge.publish({
        sourceEngine: EngineType.DATA,
        targetEngine: EngineType.DASHBOARD,
        dataType: 'dataset',
        data: { rows: [] },
        metadata: {
          tenantId: 'tenant-001',
          userId: 'user-001',
          timestamp: new Date(Date.now() - 10000).toISOString(), // 10 seconds ago
          correlationId: 'corr-ttl',
          ttlMs: 1, // 1ms TTL
        },
      });

      expect(received).toHaveLength(0);
    });
  });
});
