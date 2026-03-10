import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Prisma
const mockDatasetFindFirst = jest.fn();
const mockDataRowFindMany = jest.fn();
const mockAuditLogCreate = jest.fn().mockResolvedValue({ id: 'log-1' } as never);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    dataset: { findFirst: mockDatasetFindFirst },
    dataRow: { findMany: mockDataRowFindMany },
    auditLog: { create: mockAuditLogCreate },
  })),
}));

import { KeyDetectionService } from '../../services/key-detection.service';

describe('KeyDetectionService', () => {
  let service: KeyDetectionService;

  const tenantId = 'tenant-1';

  function setupDataset(
    datasetId: string,
    columns: Array<{ name: string; dataType: string }>,
    rows: Array<Record<string, any>>
  ): void {
    mockDatasetFindFirst.mockImplementation((args: any) => {
      if (args.where.id === datasetId) {
        return Promise.resolve({
          id: datasetId,
          name: `dataset_${datasetId}`,
          tenantId,
          columns: columns.map((c, i) => ({ ...c, id: `col-${i}`, position: i, nullable: true })),
        });
      }
      return Promise.resolve(null);
    });

    mockDataRowFindMany.mockImplementation((args: any) => {
      if (args.where.datasetId === datasetId) {
        return Promise.resolve(
          rows.map((r, i) => ({ id: `row-${i}`, datasetId, rowIndex: i, data: r }))
        );
      }
      return Promise.resolve([]);
    });
  }

  function setupMultipleDatasets(
    datasets: Array<{
      id: string;
      name: string;
      columns: Array<{ name: string; dataType: string }>;
      rows: Array<Record<string, any>>;
    }>
  ): void {
    mockDatasetFindFirst.mockImplementation((args: any) => {
      const ds = datasets.find((d) => d.id === args.where.id);
      if (!ds) return Promise.resolve(null);
      return Promise.resolve({
        id: ds.id,
        name: ds.name,
        tenantId,
        columns: ds.columns.map((c, i) => ({ ...c, id: `col-${ds.id}-${i}`, position: i, nullable: true })),
        rowCount: ds.rows.length,
      });
    });

    mockDataRowFindMany.mockImplementation((args: any) => {
      const ds = datasets.find((d) => d.id === args.where.datasetId);
      if (!ds) return Promise.resolve([]);
      return Promise.resolve(
        ds.rows.map((r, i) => ({ id: `row-${ds.id}-${i}`, datasetId: ds.id, rowIndex: i, data: r }))
      );
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KeyDetectionService();
  });

  describe('detectPrimaryKeys', () => {
    it('should detect a unique integer column as PK candidate', async () => {
      setupDataset(
        'ds-1',
        [
          { name: 'id', dataType: 'integer' },
          { name: 'name', dataType: 'varchar' },
        ],
        [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Charlie' },
        ]
      );

      const candidates = await service.detectPrimaryKeys('ds-1', tenantId);

      expect(candidates.length).toBeGreaterThan(0);
      const idCandidate = candidates.find((c) => !c.isComposite && c.column === 'id');
      expect(idCandidate).toBeDefined();
      expect(idCandidate!.uniquenessRatio).toBe(1.0);
    });

    it('should assign high name pattern score to id-like columns', async () => {
      setupDataset(
        'ds-1',
        [
          { name: 'user_id', dataType: 'integer' },
          { name: 'description', dataType: 'varchar' },
        ],
        [
          { user_id: 1, description: 'one' },
          { user_id: 2, description: 'two' },
        ]
      );

      const candidates = await service.detectPrimaryKeys('ds-1', tenantId);
      const uidCandidate = candidates.find(
        (c): c is Extract<(typeof candidates)[number], { isComposite: false }> =>
          !c.isComposite && c.column === 'user_id'
      );
      expect(uidCandidate).toBeDefined();
      expect(uidCandidate?.namePatternScore).toBe(1.0);
    });

    it('should reject columns with null values', async () => {
      setupDataset(
        'ds-1',
        [
          { name: 'id', dataType: 'integer' },
          { name: 'email', dataType: 'varchar' },
        ],
        [
          { id: 1, email: 'a@b.com' },
          { id: 2, email: null },
          { id: 3, email: 'c@d.com' },
        ]
      );

      const candidates = await service.detectPrimaryKeys('ds-1', tenantId);
      const emailCandidate = candidates.find((c) => !c.isComposite && c.column === 'email');
      expect(emailCandidate).toBeUndefined();
    });

    it('should detect composite keys when no single unique column exists', async () => {
      setupDataset(
        'ds-1',
        [
          { name: 'dept', dataType: 'varchar' },
          { name: 'emp_no', dataType: 'integer' },
        ],
        [
          { dept: 'HR', emp_no: 1 },
          { dept: 'HR', emp_no: 2 },
          { dept: 'IT', emp_no: 1 },
          { dept: 'IT', emp_no: 2 },
        ]
      );

      const candidates = await service.detectPrimaryKeys('ds-1', tenantId);
      const singlePerfect = candidates.filter((c) => !c.isComposite && c.uniquenessRatio >= 1.0);
      expect(singlePerfect.length).toBe(0);

      const composites = candidates.filter((c) => c.isComposite);
      expect(composites.length).toBeGreaterThan(0);
      const deptEmp = composites.find(
        (c) => c.isComposite && c.columns.includes('dept') && c.columns.includes('emp_no')
      );
      expect(deptEmp).toBeDefined();
      expect(deptEmp!.uniquenessRatio).toBe(1.0);
    });

    it('should return empty for empty dataset', async () => {
      setupDataset('ds-1', [{ name: 'id', dataType: 'integer' }], []);
      const candidates = await service.detectPrimaryKeys('ds-1', tenantId);
      expect(candidates).toEqual([]);
    });

    it('should throw for non-existent dataset', async () => {
      mockDatasetFindFirst.mockResolvedValue(null as never);
      await expect(service.detectPrimaryKeys('bad-id', tenantId)).rejects.toThrow('not found');
    });
  });

  describe('detectForeignKeys', () => {
    it('should detect FK when source column values overlap with target PK', async () => {
      setupMultipleDatasets([
        {
          id: 'orders',
          name: 'orders',
          columns: [
            { name: 'order_id', dataType: 'integer' },
            { name: 'customer_id', dataType: 'integer' },
          ],
          rows: [
            { order_id: 1, customer_id: 101 },
            { order_id: 2, customer_id: 102 },
            { order_id: 3, customer_id: 101 },
          ],
        },
        {
          id: 'customers',
          name: 'customers',
          columns: [
            { name: 'customer_id', dataType: 'integer' },
            { name: 'name', dataType: 'varchar' },
          ],
          rows: [
            { customer_id: 101, name: 'Alice' },
            { customer_id: 102, name: 'Bob' },
            { customer_id: 103, name: 'Charlie' },
          ],
        },
      ]);

      const fks = await service.detectForeignKeys('orders', ['customers'], tenantId);

      expect(fks.length).toBeGreaterThan(0);
      const customerFK = fks.find(
        (fk) => fk.sourceColumn === 'customer_id' && fk.targetColumn === 'customer_id'
      );
      expect(customerFK).toBeDefined();
      expect(customerFK!.overlapRatio).toBeGreaterThan(0.5);
      expect(customerFK!.typeCompatible).toBe(true);
    });

    it('should return empty when there is no value overlap', async () => {
      setupMultipleDatasets([
        {
          id: 'ds-a',
          name: 'ds_a',
          columns: [{ name: 'x', dataType: 'integer' }],
          rows: [{ x: 1 }, { x: 2 }, { x: 3 }],
        },
        {
          id: 'ds-b',
          name: 'ds_b',
          columns: [{ name: 'y', dataType: 'integer' }],
          rows: [{ y: 100 }, { y: 200 }, { y: 300 }],
        },
      ]);

      const fks = await service.detectForeignKeys('ds-a', ['ds-b'], tenantId);
      expect(fks.length).toBe(0);
    });

    it('should throw for non-existent source dataset', async () => {
      mockDatasetFindFirst.mockResolvedValue(null as never);
      await expect(service.detectForeignKeys('bad-id', ['other'], tenantId)).rejects.toThrow(
        'not found'
      );
    });

    it('should return empty for source dataset with no rows', async () => {
      setupMultipleDatasets([
        {
          id: 'empty',
          name: 'empty',
          columns: [{ name: 'id', dataType: 'integer' }],
          rows: [],
        },
        {
          id: 'target',
          name: 'target',
          columns: [{ name: 'id', dataType: 'integer' }],
          rows: [{ id: 1 }],
        },
      ]);

      const fks = await service.detectForeignKeys('empty', ['target'], tenantId);
      expect(fks).toEqual([]);
    });

    it('should skip non-existent target datasets gracefully', async () => {
      setupMultipleDatasets([
        {
          id: 'source',
          name: 'source',
          columns: [{ name: 'ref_id', dataType: 'integer' }],
          rows: [{ ref_id: 1 }],
        },
      ]);

      // 'nonexistent' will return null from mockDatasetFindFirst
      const fks = await service.detectForeignKeys('source', ['nonexistent'], tenantId);
      expect(fks).toEqual([]);
    });
  });

  describe('buildRelationshipMap', () => {
    it('should build graph with correct nodes and edges', async () => {
      setupMultipleDatasets([
        {
          id: 'products',
          name: 'products',
          columns: [
            { name: 'product_id', dataType: 'integer' },
            { name: 'name', dataType: 'varchar' },
          ],
          rows: [
            { product_id: 1, name: 'Widget' },
            { product_id: 2, name: 'Gadget' },
            { product_id: 3, name: 'Doohickey' },
          ],
        },
        {
          id: 'sales',
          name: 'sales',
          columns: [
            { name: 'sale_id', dataType: 'integer' },
            { name: 'product_id', dataType: 'integer' },
          ],
          rows: [
            { sale_id: 1, product_id: 1 },
            { sale_id: 2, product_id: 2 },
            { sale_id: 3, product_id: 1 },
          ],
        },
      ]);

      const graph = await service.buildRelationshipMap(['products', 'sales'], tenantId);

      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes.map((n) => n.datasetId).sort()).toEqual(['products', 'sales']);
    });

    it('should handle single dataset with no edges', async () => {
      setupMultipleDatasets([
        {
          id: 'solo',
          name: 'solo',
          columns: [{ name: 'id', dataType: 'integer' }],
          rows: [{ id: 1 }, { id: 2 }],
        },
      ]);

      const graph = await service.buildRelationshipMap(['solo'], tenantId);
      expect(graph.nodes).toHaveLength(1);
      expect(graph.edges).toHaveLength(0);
    });
  });
});

describe('KeyDetectionService — no fake code', () => {
  it('service source has no mock/placeholder patterns', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require.resolve('../../services/key-detection.service'),
      'utf-8'
    );
    expect(source).not.toMatch(/Math\.random\(\)/);
    expect(source).not.toMatch(/sampleData/);
    expect(source).not.toMatch(/mockData/);
    expect(source).not.toMatch(/TODO/);
    expect(source).not.toMatch(/FIXME/);
    expect(source).not.toMatch(/placeholder/i);
  });
});
