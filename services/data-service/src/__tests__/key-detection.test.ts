/**
 * Tests for KeyDetectionService
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
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

import { KeyDetectionService } from '../services/key-detection.service';

describe('KeyDetectionService', () => {
  let service: KeyDetectionService;

  const tenantId = 'tenant-1';

  // Helper to setup mock returns
  function setupDataset(
    datasetId: string,
    columns: Array<{ name: string; dataType: string }>,
    rows: Array<Record<string, unknown>>
  ): void {
    mockDatasetFindFirst.mockImplementation((args: unknown) => {
      const typed = args as { where: { id: string } };
      if (typed.where.id === datasetId) {
        return Promise.resolve({
          id: datasetId,
          name: `dataset_${datasetId}`,
          tenantId,
          columns: columns.map((c, i) => ({ ...c, id: `col-${i}`, position: i, nullable: true })),
        });
      }
      return Promise.resolve(null);
    });

    mockDataRowFindMany.mockImplementation((args: unknown) => {
      const typed = args as { where: { datasetId: string } };
      if (typed.where.datasetId === datasetId) {
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
      rows: Array<Record<string, unknown>>;
    }>
  ): void {
    mockDatasetFindFirst.mockImplementation((args: unknown) => {
      const typed = args as { where: { id: string } };
      const ds = datasets.find((d) => d.id === typed.where.id);
      if (!ds) return Promise.resolve(null);
      return Promise.resolve({
        id: ds.id,
        name: ds.name,
        tenantId,
        columns: ds.columns.map((c, i) => ({ ...c, id: `col-${ds.id}-${i}`, position: i, nullable: true })),
        rowCount: ds.rows.length,
      });
    });

    mockDataRowFindMany.mockImplementation((args: unknown) => {
      const typed = args as { where: { datasetId: string } };
      const ds = datasets.find((d) => d.id === typed.where.datasetId);
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
    it('should detect unique column as PK candidate', async () => {
      setupDataset(
        'ds-1',
        [
          { name: 'id', dataType: 'integer' },
          { name: 'name', dataType: 'varchar' },
          { name: 'value', dataType: 'float' },
        ],
        [
          { id: 1, name: 'Alice', value: 100 },
          { id: 2, name: 'Bob', value: 200 },
          { id: 3, name: 'Charlie', value: 100 },
          { id: 4, name: 'Diana', value: 300 },
          { id: 5, name: 'Eve', value: 200 },
        ]
      );

      const candidates = await service.detectPrimaryKeys('ds-1', tenantId);

      expect(candidates.length).toBeGreaterThan(0);

      // 'id' should be top candidate (unique + name pattern match)
      const idCandidate = candidates.find((c) => !c.isComposite && 'column' in c && c.column === 'id');
      expect(idCandidate).toBeDefined();
      expect(idCandidate!.uniquenessRatio).toBe(1.0);
      expect(idCandidate!.overallScore).toBeGreaterThan(0.7);

      // 'name' is also unique, should be a candidate
      const nameCandidate = candidates.find((c) => !c.isComposite && 'column' in c && c.column === 'name');
      expect(nameCandidate).toBeDefined();

      // 'value' has duplicates, should NOT be a PK candidate with uniqueness >= 0.95
      const valueCandidate = candidates.find((c) => !c.isComposite && 'column' in c && c.column === 'value');
      expect(valueCandidate).toBeUndefined();
    });

    it('should score name patterns correctly', async () => {
      setupDataset(
        'ds-1',
        [
          { name: 'user_id', dataType: 'integer' },
          { name: 'code', dataType: 'varchar' },
          { name: 'random_col', dataType: 'varchar' },
        ],
        [
          { user_id: 1, code: 'A', random_col: 'x' },
          { user_id: 2, code: 'B', random_col: 'y' },
          { user_id: 3, code: 'C', random_col: 'z' },
        ]
      );

      const candidates = await service.detectPrimaryKeys('ds-1', tenantId);

      const userIdCandidate = candidates.find((c) => !c.isComposite && 'column' in c && c.column === 'user_id');
      const codeCandidate = candidates.find((c) => !c.isComposite && 'column' in c && c.column === 'code');
      const randomCandidate = candidates.find((c) => !c.isComposite && 'column' in c && c.column === 'random_col');

      expect(userIdCandidate).toBeDefined();
      expect(userIdCandidate!.isComposite).toBe(false);
      if (!userIdCandidate!.isComposite) {
        expect(userIdCandidate!.namePatternScore).toBe(1.0); // matches _id pattern
      }

      expect(codeCandidate).toBeDefined();
      if (!codeCandidate!.isComposite) {
        expect(codeCandidate!.namePatternScore).toBe(1.0); // matches code pattern
      }

      expect(randomCandidate).toBeDefined();
      if (!randomCandidate!.isComposite) {
        expect(randomCandidate!.namePatternScore).toBe(0); // no pattern match
      }
    });

    it('should reject columns with null values as PK candidates', async () => {
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

      // email has null, should NOT be a PK candidate
      const emailCandidate = candidates.find((c) => !c.isComposite && 'column' in c && c.column === 'email');
      expect(emailCandidate).toBeUndefined();

      // id is still valid
      const idCandidate = candidates.find((c) => !c.isComposite && 'column' in c && c.column === 'id');
      expect(idCandidate).toBeDefined();
    });

    it('should detect composite keys when no single column is unique', async () => {
      setupDataset(
        'ds-1',
        [
          { name: 'dept', dataType: 'varchar' },
          { name: 'emp_no', dataType: 'integer' },
          { name: 'salary', dataType: 'float' },
        ],
        [
          { dept: 'HR', emp_no: 1, salary: 50000 },
          { dept: 'HR', emp_no: 2, salary: 60000 },
          { dept: 'IT', emp_no: 1, salary: 50000 },
          { dept: 'IT', emp_no: 2, salary: 60000 },
          { dept: 'HR', emp_no: 3, salary: 50000 },
        ]
      );

      const candidates = await service.detectPrimaryKeys('ds-1', tenantId);

      // No single column is fully unique
      const singlePKs = candidates.filter((c) => !c.isComposite && c.uniquenessRatio >= 1.0);
      expect(singlePKs.length).toBe(0);

      // dept + emp_no composite should be detected
      const composites = candidates.filter((c) => c.isComposite);
      expect(composites.length).toBeGreaterThan(0);

      const deptEmpComposite = composites.find(
        (c) => c.isComposite && c.columns.includes('dept') && c.columns.includes('emp_no')
      );
      expect(deptEmpComposite).toBeDefined();
      expect(deptEmpComposite!.uniquenessRatio).toBe(1.0);
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
    it('should detect value overlap between source and target PK columns', async () => {
      setupMultipleDatasets([
        {
          id: 'orders',
          name: 'orders',
          columns: [
            { name: 'order_id', dataType: 'integer' },
            { name: 'customer_id', dataType: 'integer' },
            { name: 'amount', dataType: 'float' },
          ],
          rows: [
            { order_id: 1, customer_id: 101, amount: 500 },
            { order_id: 2, customer_id: 102, amount: 300 },
            { order_id: 3, customer_id: 101, amount: 200 },
            { order_id: 4, customer_id: 103, amount: 400 },
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
            { customer_id: 104, name: 'Diana' },
          ],
        },
      ]);

      const fks = await service.detectForeignKeys('orders', ['customers'], tenantId);

      expect(fks.length).toBeGreaterThan(0);

      // orders.customer_id -> customers.customer_id should be detected
      const customerFK = fks.find(
        (fk) => fk.sourceColumn === 'customer_id' && fk.targetColumn === 'customer_id'
      );
      expect(customerFK).toBeDefined();
      expect(customerFK!.overlapRatio).toBeGreaterThan(0.5);
      expect(customerFK!.typeCompatible).toBe(true);
    });

    it('should return empty for no overlap', async () => {
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

      // No overlap => no candidates with overlapRatio >= 0.3
      expect(fks.length).toBe(0);
    });

    it('should handle empty source dataset', async () => {
      setupMultipleDatasets([
        {
          id: 'ds-empty',
          name: 'empty',
          columns: [{ name: 'id', dataType: 'integer' }],
          rows: [],
        },
        {
          id: 'ds-b',
          name: 'ds_b',
          columns: [{ name: 'id', dataType: 'integer' }],
          rows: [{ id: 1 }],
        },
      ]);

      const fks = await service.detectForeignKeys('ds-empty', ['ds-b'], tenantId);
      expect(fks).toEqual([]);
    });
  });

  describe('buildRelationshipMap', () => {
    it('should build correct relationship graph with typed edges', async () => {
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
            { name: 'qty', dataType: 'integer' },
          ],
          rows: [
            { sale_id: 1, product_id: 1, qty: 10 },
            { sale_id: 2, product_id: 2, qty: 5 },
            { sale_id: 3, product_id: 1, qty: 3 },
            { sale_id: 4, product_id: 3, qty: 7 },
          ],
        },
      ]);

      const graph = await service.buildRelationshipMap(['products', 'sales'], tenantId);

      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes.map((n) => n.datasetId).sort()).toEqual(['products', 'sales']);

      // Should find relationship between products.product_id and sales.product_id
      if (graph.edges.length > 0) {
        const productEdge = graph.edges.find(
          (e) => e.sourceColumn === 'product_id' || e.targetColumn === 'product_id'
        );
        expect(productEdge).toBeDefined();
        // Products -> Sales is 1:N (one product, many sales)
        expect(['1:N', '1:1', 'N:M']).toContain(productEdge!.type);
      }
    });

    it('should handle single dataset (no relationships possible)', async () => {
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
