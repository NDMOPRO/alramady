import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock winston logger
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return {
    createLogger: jest.fn().mockReturnValue(mockLogger),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      json: jest.fn(),
      colorize: jest.fn(),
      simple: jest.fn(),
    },
    transports: {
      Console: jest.fn(),
    },
  };
});

// Mock Prisma
const mockDatasetFindFirst = jest.fn();
const mockDatasetRowFindMany = jest.fn();
const mockAuditLogCreate = jest.fn().mockResolvedValue({ id: 'audit-1' } as never);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    dataset: { findFirst: mockDatasetFindFirst },
    datasetRow: { findMany: mockDatasetRowFindMany },
    auditLog: { create: mockAuditLogCreate },
  })),
}));

import { DistributedQueryService } from '../../services/distributed-query.service';

describe('DistributedQueryService', () => {
  let service: DistributedQueryService;

  const tenantId = 'tenant-1';
  const datasetId = 'ds-1';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DistributedQueryService();
  });

  describe('partition calculation', () => {
    it('should create a single partition for small datasets', async () => {
      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId,
        name: 'small_dataset',
        rowCount: 5000,
        columnCount: 5,
      } as never);
      mockDatasetRowFindMany.mockResolvedValue([] as never);

      const result = await service.executeDistributedQuery(datasetId, tenantId, {});

      // 5000 rows -> partitionSize = max(10000, ceil(5000/8)) = 10000 -> 1 partition
      expect(result.partitions).toBe(1);
    });

    it('should create multiple partitions for large datasets', async () => {
      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId,
        name: 'large_dataset',
        rowCount: 200000,
        columnCount: 10,
      } as never);
      mockDatasetRowFindMany.mockResolvedValue([] as never);

      const result = await service.executeDistributedQuery(datasetId, tenantId, {});

      // 200000 rows -> partitionSize = min(50000, max(10000, ceil(200000/8))) = min(50000, 25000) = 25000
      // numPartitions = ceil(200000 / 25000) = 8
      expect(result.partitions).toBe(8);
    });

    it('should handle zero-row datasets', async () => {
      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId,
        name: 'empty_dataset',
        rowCount: 0,
        columnCount: 5,
      } as never);

      const result = await service.executeDistributedQuery(datasetId, tenantId, {});

      expect(result.totalRows).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  describe('filter application', () => {
    const sampleRows = [
      { data: { name: 'Alice', age: 30, city: 'Riyadh' } },
      { data: { name: 'Bob', age: 25, city: 'Jeddah' } },
      { data: { name: 'Charlie', age: 35, city: 'Riyadh' } },
      { data: { name: 'Diana', age: 28, city: 'Dammam' } },
    ];

    function setupWithRows(): void {
      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId,
        name: 'test_dataset',
        rowCount: sampleRows.length,
        columnCount: 3,
      } as never);
      mockDatasetRowFindMany.mockResolvedValue(sampleRows as never);
    }

    it('should filter with eq operator', async () => {
      setupWithRows();

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        where: { city: { eq: 'Riyadh' } },
      });

      expect(result.data.every((r) => r.city === 'Riyadh')).toBe(true);
      expect(result.totalRows).toBe(2);
    });

    it('should filter with neq operator', async () => {
      setupWithRows();

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        where: { city: { neq: 'Riyadh' } },
      });

      expect(result.data.every((r) => r.city !== 'Riyadh')).toBe(true);
      expect(result.totalRows).toBe(2);
    });

    it('should filter with gt operator', async () => {
      setupWithRows();

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        where: { age: { gt: 28 } },
      });

      expect(result.data.every((r) => (r.age as number) > 28)).toBe(true);
      expect(result.totalRows).toBe(2);
    });

    it('should filter with lt operator', async () => {
      setupWithRows();

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        where: { age: { lt: 30 } },
      });

      expect(result.data.every((r) => (r.age as number) < 30)).toBe(true);
      expect(result.totalRows).toBe(2);
    });

    it('should filter with contains operator', async () => {
      setupWithRows();

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        where: { name: { contains: 'li' } },
      });

      expect(result.data.every((r) => (r.name as string).includes('li'))).toBe(true);
      expect(result.totalRows).toBe(2); // Alice, Charlie
    });

    it('should filter with in operator', async () => {
      setupWithRows();

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        where: { city: { in: ['Riyadh', 'Dammam'] } },
      });

      expect(result.data.every((r) => ['Riyadh', 'Dammam'].includes(r.city as string))).toBe(true);
      expect(result.totalRows).toBe(3);
    });

    it('should filter with direct value equality', async () => {
      setupWithRows();

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        where: { name: 'Alice' },
      });

      expect(result.totalRows).toBe(1);
      expect(result.data[0].name).toBe('Alice');
    });
  });

  describe('aggregate computation', () => {
    const numericRows = [
      { data: { product: 'A', sales: 100, qty: 10 } },
      { data: { product: 'B', sales: 200, qty: 20 } },
      { data: { product: 'A', sales: 150, qty: 15 } },
      { data: { product: 'C', sales: 300, qty: 5 } },
    ];

    function setupNumeric(): void {
      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId,
        name: 'numeric_dataset',
        rowCount: numericRows.length,
        columnCount: 3,
      } as never);
      mockDatasetRowFindMany.mockResolvedValue(numericRows as never);
    }

    it('should compute sum aggregate', async () => {
      setupNumeric();

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        aggregates: [{ function: 'sum', column: 'sales' }],
      });

      expect(result.aggregates).toBeDefined();
      const salesAgg = result.aggregates!.find((a) => a.column === 'sales');
      expect(salesAgg!.sum).toBe(750);
    });

    it('should compute avg, min, max, count aggregates', async () => {
      setupNumeric();

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        aggregates: [{ function: 'avg', column: 'qty' }],
      });

      expect(result.aggregates).toBeDefined();
      const qtyAgg = result.aggregates!.find((a) => a.column === 'qty');
      expect(qtyAgg!.avg).toBe(12.5);
      expect(qtyAgg!.min).toBe(5);
      expect(qtyAgg!.max).toBe(20);
      expect(qtyAgg!.count).toBe(4);
    });

    it('should return zeros for aggregate on non-numeric column', async () => {
      setupNumeric();

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        aggregates: [{ function: 'sum', column: 'product' }],
      });

      const productAgg = result.aggregates!.find((a) => a.column === 'product');
      expect(productAgg!.sum).toBe(0);
      expect(productAgg!.count).toBe(0);
    });
  });

  describe('group-by functionality', () => {
    it('should group rows by specified column', async () => {
      const rows = [
        { data: { dept: 'HR', salary: 50000 } },
        { data: { dept: 'IT', salary: 70000 } },
        { data: { dept: 'HR', salary: 60000 } },
        { data: { dept: 'IT', salary: 80000 } },
      ];

      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId, name: 'grouped', rowCount: rows.length, columnCount: 2,
      } as never);
      mockDatasetRowFindMany.mockResolvedValue(rows as never);

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        groupBy: ['dept'],
        aggregates: [{ function: 'sum', column: 'salary' }],
      });

      expect(result.data.length).toBe(2);
      const hrGroup = result.data.find((r) => r.dept === 'HR');
      const itGroup = result.data.find((r) => r.dept === 'IT');
      expect(hrGroup).toBeDefined();
      expect(itGroup).toBeDefined();
      expect(hrGroup!._count).toBe(2);
      expect(hrGroup!.sum_salary).toBe(110000);
      expect(itGroup!.sum_salary).toBe(150000);
    });
  });

  describe('order-by', () => {
    it('should sort rows ascending', async () => {
      const rows = [
        { data: { name: 'Charlie', value: 3 } },
        { data: { name: 'Alice', value: 1 } },
        { data: { name: 'Bob', value: 2 } },
      ];

      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId, name: 'sortable', rowCount: rows.length, columnCount: 2,
      } as never);
      mockDatasetRowFindMany.mockResolvedValue(rows as never);

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        orderBy: [{ column: 'value', direction: 'asc' }],
      });

      expect(result.data[0].value).toBe(1);
      expect(result.data[1].value).toBe(2);
      expect(result.data[2].value).toBe(3);
    });

    it('should sort rows descending', async () => {
      const rows = [
        { data: { name: 'Alice', value: 1 } },
        { data: { name: 'Bob', value: 2 } },
        { data: { name: 'Charlie', value: 3 } },
      ];

      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId, name: 'sortable', rowCount: rows.length, columnCount: 2,
      } as never);
      mockDatasetRowFindMany.mockResolvedValue(rows as never);

      const result = await service.executeDistributedQuery(datasetId, tenantId, {
        orderBy: [{ column: 'value', direction: 'desc' }],
      });

      expect(result.data[0].value).toBe(3);
      expect(result.data[1].value).toBe(2);
      expect(result.data[2].value).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should throw when dataset is not found', async () => {
      mockDatasetFindFirst.mockResolvedValue(null as never);

      await expect(
        service.executeDistributedQuery('nonexistent', tenantId, {})
      ).rejects.toThrow('Dataset not found');
    });

    it('should throw when estimating cost for non-existent dataset', async () => {
      mockDatasetFindFirst.mockResolvedValue(null as never);

      await expect(
        service.estimateQueryCost('nonexistent', tenantId)
      ).rejects.toThrow('Dataset not found');
    });
  });

  describe('estimateQueryCost', () => {
    it('should return cost estimates', async () => {
      mockDatasetFindFirst.mockResolvedValue({
        id: datasetId,
        rowCount: 100000,
        columnCount: 20,
      } as never);

      const estimate = await service.estimateQueryCost(datasetId, tenantId);

      expect(estimate.estimatedRows).toBe(100000);
      expect(estimate.estimatedPartitions).toBe(2); // ceil(100000/50000)
      expect(estimate.estimatedTimeMs).toBeGreaterThan(0);
      expect(estimate.estimatedMemoryMb).toBeGreaterThanOrEqual(10);
    });
  });
});

describe('DistributedQueryService — no fake code', () => {
  it('service source has no mock/placeholder patterns', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require.resolve('../../services/distributed-query.service'),
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
