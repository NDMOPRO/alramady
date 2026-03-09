// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockPrismaInstance = {
  template: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../utils/prisma', () => ({
  prisma: mockPrismaInstance,
}));

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockCacheDel = jest.fn();

jest.mock('../utils/redis', () => ({
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
  cacheDel: mockCacheDel,
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../middleware/errorHandler', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(resource, id) {
      super(id ? `${resource} with id '${id}' not found` : `${resource} not found`);
      this.name = 'NotFoundError';
    }
  },
}));

import { list, getById, create, update, remove } from '../services/templates-themes';

describe('templates-themes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
  });

  // ── list ──────────────────────────────────────────────────────────
  describe('list', () => {
    it('should return cached result when available', async () => {
      const cached = { data: [{ id: '1' }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } };
      mockCacheGet.mockResolvedValue(cached);

      const result = await list({ page: 1, limit: 20 });
      expect(result).toEqual(cached);
      expect(mockPrismaInstance.template.findMany).not.toHaveBeenCalled();
    });

    it('should query DB and cache on cache miss', async () => {
      mockPrismaInstance.template.findMany.mockResolvedValue([{ id: 't1', name: 'T1' }]);
      mockPrismaInstance.template.count.mockResolvedValue(1);

      const result = await list({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should apply search filter', async () => {
      mockPrismaInstance.template.findMany.mockResolvedValue([]);
      mockPrismaInstance.template.count.mockResolvedValue(0);

      await list({ page: 1, limit: 10, search: 'invoice' });
      const where = mockPrismaInstance.template.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeDefined();
      expect(where.OR).toHaveLength(3);
    });

    it('should apply category filter', async () => {
      mockPrismaInstance.template.findMany.mockResolvedValue([]);
      mockPrismaInstance.template.count.mockResolvedValue(0);

      await list({ page: 1, limit: 10, category: 'finance' });
      const where = mockPrismaInstance.template.findMany.mock.calls[0][0].where;
      expect(where.category).toBe('finance');
    });

    it('should apply type and industry filters', async () => {
      mockPrismaInstance.template.findMany.mockResolvedValue([]);
      mockPrismaInstance.template.count.mockResolvedValue(0);

      await list({ page: 1, limit: 10, type: 'report', industry: 'tech' });
      const where = mockPrismaInstance.template.findMany.mock.calls[0][0].where;
      expect(where.type).toBe('report');
      expect(where.industry).toBe('tech');
    });

    it('should apply isPremium and isPublished filters', async () => {
      mockPrismaInstance.template.findMany.mockResolvedValue([]);
      mockPrismaInstance.template.count.mockResolvedValue(0);

      await list({ page: 1, limit: 10, isPremium: true, isPublished: false });
      const where = mockPrismaInstance.template.findMany.mock.calls[0][0].where;
      expect(where.isPremium).toBe(true);
      expect(where.isPublished).toBe(false);
    });

    it('should calculate pagination correctly', async () => {
      mockPrismaInstance.template.findMany.mockResolvedValue([]);
      mockPrismaInstance.template.count.mockResolvedValue(45);

      const result = await list({ page: 2, limit: 10 });
      expect(result.pagination.totalPages).toBe(5);
      expect(result.pagination.page).toBe(2);
      expect(mockPrismaInstance.template.findMany.mock.calls[0][0].skip).toBe(10);
    });
  });

  // ── getById ───────────────────────────────────────────────────────
  describe('getById', () => {
    it('should return cached record', async () => {
      const cachedRecord = { id: 't1', name: 'Template' };
      mockCacheGet.mockResolvedValue(cachedRecord);

      const result = await getById('t1');
      expect(result).toEqual(cachedRecord);
      expect(mockPrismaInstance.template.findUnique).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when not found', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue(null);
      await expect(getById('bad')).rejects.toThrow('not found');
    });

    it('should fetch from DB and cache on miss', async () => {
      const record = { id: 't1', name: 'Found' };
      mockPrismaInstance.template.findUnique.mockResolvedValue(record);

      const result = await getById('t1');
      expect(result).toEqual(record);
      expect(mockCacheSet).toHaveBeenCalled();
    });
  });

  // ── create ────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create record and invalidate cache', async () => {
      const newRecord = { id: 't1', name: 'New', category: 'cat' };
      mockPrismaInstance.template.create.mockResolvedValue(newRecord);

      const result = await create({ name: 'New', category: 'cat' });
      expect(result).toEqual(newRecord);
      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // ── update ────────────────────────────────────────────────────────
  describe('update', () => {
    it('should update record and invalidate cache', async () => {
      const updated = { id: 't1', name: 'Updated' };
      mockPrismaInstance.template.update.mockResolvedValue(updated);

      const result = await update('t1', { name: 'Updated' });
      expect(result).toEqual(updated);
      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should set updatedAt on update', async () => {
      mockPrismaInstance.template.update.mockResolvedValue({ id: 't1' });

      await update('t1', { name: 'Changed' });
      const callData = mockPrismaInstance.template.update.mock.calls[0][0].data;
      expect(callData.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ── remove ────────────────────────────────────────────────────────
  describe('remove', () => {
    it('should delete record and return success', async () => {
      mockPrismaInstance.template.delete.mockResolvedValue({});

      const result = await remove('t1');
      expect(result.success).toBe(true);
      expect(mockPrismaInstance.template.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });

    it('should invalidate cache on delete', async () => {
      mockPrismaInstance.template.delete.mockResolvedValue({});

      await remove('t1');
      expect(mockCacheDel).toHaveBeenCalled();
    });
  });
});
