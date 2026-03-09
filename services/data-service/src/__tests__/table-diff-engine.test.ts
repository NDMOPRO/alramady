/**
 * Tests for DataVersioningService - table diff / compareVersions
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createHash } from 'crypto';

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Helper to create snapshot payload
function makeSnapshot(
  schema: Array<{ name: string; dataType: string; position: number; nullable: boolean }>,
  rows: Array<{ rowIndex: number; data: Record<string, unknown> }>
): string {
  const rowHashes = rows.map((r) =>
    createHash('md5').update(JSON.stringify(r.data)).digest('hex')
  );
  return JSON.stringify({
    schema,
    schemaHash: createHash('sha256').update(JSON.stringify(schema)).digest('hex'),
    dataHash: createHash('sha256').update(rowHashes.join('|')).digest('hex'),
    rowCount: rows.length,
    rowHashes,
    rows,
  });
}

const baseSchema = [
  { name: 'id', dataType: 'integer', position: 0, nullable: false },
  { name: 'name', dataType: 'varchar', position: 1, nullable: true },
  { name: 'value', dataType: 'float', position: 2, nullable: true },
];

const baseRows = [
  { rowIndex: 0, data: { id: 1, name: 'Alice', value: 100 } },
  { rowIndex: 1, data: { id: 2, name: 'Bob', value: 200 } },
  { rowIndex: 2, data: { id: 3, name: 'Charlie', value: 300 } },
];

// Mock Prisma
const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
const mockCreate = jest.fn();
const mockDeleteMany = jest.fn();
const mockCreateMany = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    datasetVersion: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      create: mockCreate,
    },
    dataset: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'ds-1',
        name: 'Test Dataset',
        columns: baseSchema.map((s, i) => ({ ...s, id: `col-${i}` })),
      } as never),
      update: mockUpdate,
    },
    dataRow: {
      findMany: jest.fn().mockResolvedValue([] as never),
      deleteMany: mockDeleteMany,
      createMany: mockCreateMany,
    },
    datasetColumn: {
      deleteMany: mockDeleteMany,
      create: jest.fn().mockResolvedValue({} as never),
    },
    $transaction: jest.fn().mockImplementation((fn: unknown) => (fn as (tx: unknown) => Promise<void>)({
      dataRow: { deleteMany: mockDeleteMany, createMany: mockCreateMany },
      datasetColumn: { deleteMany: mockDeleteMany, create: jest.fn() },
      dataset: { update: mockUpdate },
    })),
  })),
}));

import { DataVersioningService } from '../services/data-versioning.service';

describe('DataVersioningService - Table Diff (compareVersions)', () => {
  let service: DataVersioningService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DataVersioningService();
  });

  describe('Schema changes', () => {
    it('should detect added columns', async () => {
      const schema2 = [
        ...baseSchema,
        { name: 'email', dataType: 'varchar', position: 3, nullable: true },
      ];

      mockFindUnique
        .mockResolvedValueOnce({
          id: 'v1', version: 1, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, baseRows),
        } as never)
        .mockResolvedValueOnce({
          id: 'v2', version: 2, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(schema2, baseRows),
        } as never);

      const result = await service.compareVersions('v1', 'v2');

      expect(result.schemaChanges.added).toEqual(['email']);
      expect(result.schemaChanges.removed).toEqual([]);
      expect(result.summary).toContain('1 columns added');
    });

    it('should detect removed columns', async () => {
      const schema2 = baseSchema.filter((s) => s.name !== 'value');

      mockFindUnique
        .mockResolvedValueOnce({
          id: 'v1', version: 1, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, baseRows),
        } as never)
        .mockResolvedValueOnce({
          id: 'v2', version: 2, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(schema2, baseRows),
        } as never);

      const result = await service.compareVersions('v1', 'v2');

      expect(result.schemaChanges.removed).toEqual(['value']);
      expect(result.summary).toContain('1 columns removed');
    });

    it('should detect column type changes', async () => {
      const schema2 = baseSchema.map((s) =>
        s.name === 'value' ? { ...s, dataType: 'integer' } : s
      );

      mockFindUnique
        .mockResolvedValueOnce({
          id: 'v1', version: 1, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, baseRows),
        } as never)
        .mockResolvedValueOnce({
          id: 'v2', version: 2, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(schema2, baseRows),
        } as never);

      const result = await service.compareVersions('v1', 'v2');

      expect(result.schemaChanges.typeChanged).toEqual([
        { column: 'value', from: 'float', to: 'integer' },
      ]);
      expect(result.summary).toContain('1 column types changed');
    });

    it('should detect simultaneous add, remove, and type change', async () => {
      const schema2 = [
        { name: 'id', dataType: 'bigint', position: 0, nullable: false },
        // 'name' removed
        { name: 'value', dataType: 'float', position: 1, nullable: true },
        { name: 'status', dataType: 'varchar', position: 2, nullable: true },
      ];

      mockFindUnique
        .mockResolvedValueOnce({
          id: 'v1', version: 1, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, baseRows),
        } as never)
        .mockResolvedValueOnce({
          id: 'v2', version: 2, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(schema2, baseRows),
        } as never);

      const result = await service.compareVersions('v1', 'v2');

      expect(result.schemaChanges.added).toEqual(['status']);
      expect(result.schemaChanges.removed).toEqual(['name']);
      expect(result.schemaChanges.typeChanged).toEqual([
        { column: 'id', from: 'integer', to: 'bigint' },
      ]);
    });
  });

  describe('Row changes', () => {
    it('should detect changed values in rows', async () => {
      const modifiedRows = [
        { rowIndex: 0, data: { id: 1, name: 'Alice', value: 100 } },   // same
        { rowIndex: 1, data: { id: 2, name: 'Bobby', value: 250 } },   // changed
        { rowIndex: 2, data: { id: 3, name: 'Charlie', value: 300 } }, // same
      ];

      mockFindUnique
        .mockResolvedValueOnce({
          id: 'v1', version: 1, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, baseRows),
        } as never)
        .mockResolvedValueOnce({
          id: 'v2', version: 2, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, modifiedRows),
        } as never);

      const result = await service.compareVersions('v1', 'v2');

      expect(result.rowChanges.modified).toBe(1);
      expect(result.rowChanges.unchanged).toBe(2);
      expect(result.rowChanges.added).toBe(0);
      expect(result.rowChanges.removed).toBe(0);
      expect(result.summary).toContain('1 rows modified');
    });

    it('should detect added rows', async () => {
      const expandedRows = [
        ...baseRows,
        { rowIndex: 3, data: { id: 4, name: 'Diana', value: 400 } },
        { rowIndex: 4, data: { id: 5, name: 'Eve', value: 500 } },
      ];

      mockFindUnique
        .mockResolvedValueOnce({
          id: 'v1', version: 1, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, baseRows),
        } as never)
        .mockResolvedValueOnce({
          id: 'v2', version: 2, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, expandedRows),
        } as never);

      const result = await service.compareVersions('v1', 'v2');

      expect(result.rowChanges.added).toBe(2);
      expect(result.rowChanges.unchanged).toBe(3);
    });

    it('should detect removed rows', async () => {
      const reducedRows = baseRows.slice(0, 1);

      mockFindUnique
        .mockResolvedValueOnce({
          id: 'v1', version: 1, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, baseRows),
        } as never)
        .mockResolvedValueOnce({
          id: 'v2', version: 2, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, reducedRows),
        } as never);

      const result = await service.compareVersions('v1', 'v2');

      expect(result.rowChanges.removed).toBe(2);
      expect(result.rowChanges.unchanged).toBe(1);
    });

    it('should detect no differences for identical versions', async () => {
      const snap = makeSnapshot(baseSchema, baseRows);

      mockFindUnique
        .mockResolvedValueOnce({
          id: 'v1', version: 1, datasetId: 'ds-1', snapshotPath: snap,
        } as never)
        .mockResolvedValueOnce({
          id: 'v2', version: 2, datasetId: 'ds-1', snapshotPath: snap,
        } as never);

      const result = await service.compareVersions('v1', 'v2');

      expect(result.schemaChanges.added).toEqual([]);
      expect(result.schemaChanges.removed).toEqual([]);
      expect(result.schemaChanges.typeChanged).toEqual([]);
      expect(result.rowChanges.added).toBe(0);
      expect(result.rowChanges.removed).toBe(0);
      expect(result.rowChanges.modified).toBe(0);
      expect(result.rowChanges.unchanged).toBe(3);
      expect(result.summary).toContain('No differences detected');
    });
  });

  describe('Statistics diff', () => {
    it('should report correct version numbers in diff', async () => {
      mockFindUnique
        .mockResolvedValueOnce({
          id: 'v1', version: 3, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, baseRows),
        } as never)
        .mockResolvedValueOnce({
          id: 'v2', version: 7, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, baseRows),
        } as never);

      const result = await service.compareVersions('v1', 'v2');

      expect(result.version1).toBe(3);
      expect(result.version2).toBe(7);
      expect(result.summary).toContain('Version 3 vs 7');
    });
  });

  describe('Error handling', () => {
    it('should throw for non-existent version', async () => {
      mockFindUnique.mockResolvedValueOnce(null as never).mockResolvedValueOnce({} as never);

      await expect(service.compareVersions('bad-id', 'v2')).rejects.toThrow('not found');
    });

    it('should throw for corrupted snapshot data', async () => {
      mockFindUnique
        .mockResolvedValueOnce({
          id: 'v1', version: 1, datasetId: 'ds-1', snapshotPath: 'NOT JSON',
        } as never)
        .mockResolvedValueOnce({
          id: 'v2', version: 2, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, baseRows),
        } as never);

      await expect(service.compareVersions('v1', 'v2')).rejects.toThrow('corrupted');
    });

    it('should handle empty schemas gracefully', async () => {
      mockFindUnique
        .mockResolvedValueOnce({
          id: 'v1', version: 1, datasetId: 'ds-1',
          snapshotPath: JSON.stringify({ schema: [], rowHashes: [], rowCount: 0 }),
        } as never)
        .mockResolvedValueOnce({
          id: 'v2', version: 2, datasetId: 'ds-1',
          snapshotPath: makeSnapshot(baseSchema, baseRows),
        } as never);

      const result = await service.compareVersions('v1', 'v2');

      expect(result.schemaChanges.added).toEqual(['id', 'name', 'value']);
      expect(result.rowChanges.added).toBe(3);
    });
  });
});
