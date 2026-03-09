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
const mockAuditLogCreate = jest.fn().mockResolvedValue({ id: 'audit-1' } as never);
const mockSavedQueryCreate = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: 'sq-1', ...data, createdAt: new Date(), lastRunAt: null, runCount: 0 } as never)
);
const mockSavedQueryFindMany = jest.fn().mockResolvedValue([] as never);

const mockPrisma = {
  dataset: { findFirst: mockDatasetFindFirst },
  dataRow: { findMany: mockDataRowFindMany },
  datasetRow: { findMany: mockDataRowFindMany },
  auditLog: { create: mockAuditLogCreate },
  savedQuery: { create: mockSavedQueryCreate, findMany: mockSavedQueryFindMany },
  $queryRaw: jest.fn().mockResolvedValue([] as never),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

import { SqlQueryEngineService } from '../../services/sql-query-engine.service';
import { PrismaClient } from '@prisma/client';

describe('SqlQueryEngineService', () => {
  let service: SqlQueryEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SqlQueryEngineService(new PrismaClient());
  });

  describe('validateQuery', () => {
    it('should accept a valid SELECT statement', () => {
      const result = service.validateQuery('SELECT name, age FROM users');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty queries', () => {
      const result = service.validateQuery('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SQL query is empty');
    });

    it('should reject whitespace-only queries', () => {
      const result = service.validateQuery('   ');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SQL query is empty');
    });

    it('should reject non-SELECT statements', () => {
      const result = service.validateQuery('INSERT INTO users VALUES (1, "test")');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Only SELECT'))).toBe(true);
    });

    it('should reject queries with DROP keyword', () => {
      const result = service.validateQuery('SELECT * FROM users; DROP TABLE users');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('DROP') || e.includes(';'))).toBe(true);
    });

    it('should reject queries with DELETE keyword', () => {
      const result = service.validateQuery('SELECT * FROM users WHERE DELETE = 1');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('DELETE'))).toBe(true);
    });

    it('should reject queries with semicolons', () => {
      const result = service.validateQuery('SELECT * FROM users;');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes(';'))).toBe(true);
    });

    it('should accept SELECT with WHERE clause', () => {
      const result = service.validateQuery('SELECT name FROM users WHERE age > 18');
      expect(result.valid).toBe(true);
    });

    it('should accept SELECT with GROUP BY and ORDER BY', () => {
      const result = service.validateQuery(
        'SELECT dept, COUNT(*) FROM employees GROUP BY dept ORDER BY dept ASC'
      );
      expect(result.valid).toBe(true);
    });

    it('should accept SELECT with LIMIT and OFFSET', () => {
      const result = service.validateQuery('SELECT * FROM data LIMIT 10 OFFSET 5');
      expect(result.valid).toBe(true);
    });
  });

  describe('executeQuery', () => {
    it('should throw on invalid SQL', async () => {
      await expect(
        service.executeQuery('', 'tenant-1')
      ).rejects.toThrow('SQL validation failed');
    });

    it('should throw on dangerous SQL', async () => {
      await expect(
        service.executeQuery('SELECT * FROM users; DROP TABLE users', 'tenant-1')
      ).rejects.toThrow('SQL validation failed');
    });

    it('should execute a valid query against dataset rows', async () => {
      mockDatasetFindFirst.mockResolvedValue({
        id: 'ds-1',
        name: 'users',
        tenantId: 'tenant-1',
        columns: [
          { name: 'name', dataType: 'varchar' },
          { name: 'age', dataType: 'integer' },
        ],
      } as never);

      mockDataRowFindMany.mockResolvedValue([
        { id: 'r1', data: { name: 'Alice', age: 30 }, rowIndex: 0 },
        { id: 'r2', data: { name: 'Bob', age: 25 }, rowIndex: 1 },
      ] as never);

      const result = await service.executeQuery('SELECT * FROM users', 'tenant-1');

      expect(result.sql).toBe('SELECT * FROM users');
      expect(result.rowCount).toBeGreaterThanOrEqual(0);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(mockAuditLogCreate).toHaveBeenCalled();
    });
  });

  describe('explainQuery', () => {
    it('should throw on invalid SQL', async () => {
      await expect(
        service.explainQuery('', 'tenant-1')
      ).rejects.toThrow('Cannot explain invalid query');
    });

    it('should return explain result for valid query', async () => {
      const result = await service.explainQuery('SELECT name FROM users WHERE age > 18', 'tenant-1');

      expect(result).toHaveProperty('operations');
      expect(result).toHaveProperty('estimatedRowCount');
      expect(result).toHaveProperty('referencedTables');
      expect(result).toHaveProperty('referencedColumns');
      expect(result).toHaveProperty('hasAggregation');
      expect(result.referencedTables).toContain('users');
    });

    it('should detect aggregation in explain', async () => {
      const result = await service.explainQuery(
        'SELECT dept, COUNT(*) FROM employees GROUP BY dept',
        'tenant-1'
      );

      expect(result.hasAggregation).toBe(true);
    });
  });
});

describe('SqlQueryEngineService — no fake code', () => {
  it('service source has no mock/placeholder patterns', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require.resolve('../../services/sql-query-engine.service'),
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
