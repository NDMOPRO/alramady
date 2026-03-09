import { mockPrismaClient } from '../mocks/prisma';
import { mockCacheGet, mockCacheSet, mockCacheDel } from '../mocks/redis';
import '../mocks/logger';

import { CompareScheduleService } from '../../services/compare-schedule.service';
import { NotFoundError } from '../../middleware/errorHandler';

describe('CompareScheduleService', () => {
  let service: CompareScheduleService;

  beforeEach(() => {
    service = new CompareScheduleService();
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // ── list() ──────────────────────────────────────────────────────────────

  describe('list()', () => {
    const baseParams = { page: 1, limit: 10, sortOrder: 'desc' as const };

    it('should return cached result on cache hit', async () => {
      const cached = { data: [{ id: 'cs1' }], total: 1 };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await service.list(baseParams);

      expect(result).toEqual(cached);
      expect(mockPrismaClient.reportCompareSchedule.findMany).not.toHaveBeenCalled();
    });

    it('should query DB and cache result on cache miss', async () => {
      const records = [{ id: 'cs1', name: 'Schedule A' }];
      mockPrismaClient.reportCompareSchedule.findMany.mockResolvedValue(records);
      mockPrismaClient.reportCompareSchedule.count.mockResolvedValue(1);

      const result = await service.list(baseParams);

      expect(result.data).toEqual(records);
      expect(result.total).toBe(1);
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should apply search, comparisonType, isActive, and status filters', async () => {
      mockPrismaClient.reportCompareSchedule.findMany.mockResolvedValue([]);
      mockPrismaClient.reportCompareSchedule.count.mockResolvedValue(0);

      await service.list({
        ...baseParams,
        search: 'quarterly',
        comparisonType: 'section',
        isActive: true,
        status: 'completed',
      });

      const callArgs = mockPrismaClient.reportCompareSchedule.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toHaveLength(2);
      expect(callArgs.where.comparisonType).toBe('section');
      expect(callArgs.where.isActive).toBe(true);
      expect(callArgs.where.status).toBe('completed');
    });
  });

  // ── getById() ───────────────────────────────────────────────────────────

  describe('getById()', () => {
    it('should return the record on success', async () => {
      const record = { id: 'cs1', name: 'Schedule A' };
      mockPrismaClient.reportCompareSchedule.findUnique.mockResolvedValue(record);

      const result = await service.getById('cs1');

      expect(result).toEqual(record);
      expect(mockCacheSet).toHaveBeenCalledWith('reporting:compare-schedule:cs1', record, 300);
    });

    it('should throw NotFoundError when record not found', async () => {
      mockPrismaClient.reportCompareSchedule.findUnique.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toThrow(/not found/i);
    });

    it('should return cached record on cache hit', async () => {
      const cached = { id: 'cs1', name: 'Cached' };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await service.getById('cs1');

      expect(result).toEqual(cached);
      expect(mockPrismaClient.reportCompareSchedule.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── create() ────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create a compare schedule with pending status', async () => {
      const created = { id: 'cs-new', status: 'pending' };
      mockPrismaClient.reportCompareSchedule.create.mockResolvedValue(created);

      const result = await service.create({
        name: 'Quarterly Compare',
        reportIdA: 'r1',
        reportIdB: 'r2',
        comparisonType: 'section',
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(result).toEqual(created);
      const createCall = mockPrismaClient.reportCompareSchedule.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('pending');
      expect(createCall.data.createdBy).toBe('user-1');
      expect(mockCacheDel).toHaveBeenCalledWith('reporting:compare-schedule:list:*');
    });
  });

  // ── update() ────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should update the record and invalidate caches', async () => {
      mockPrismaClient.reportCompareSchedule.findUnique.mockResolvedValue({ id: 'cs1' });
      mockPrismaClient.reportCompareSchedule.update.mockResolvedValue({ id: 'cs1', name: 'Updated' });

      const result = await service.update('cs1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
      expect(mockCacheDel).toHaveBeenCalledWith('reporting:compare-schedule:cs1');
      expect(mockCacheDel).toHaveBeenCalledWith('reporting:compare-schedule:list:*');
    });

    it('should throw NotFoundError if schedule not found', async () => {
      mockPrismaClient.reportCompareSchedule.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(/not found/i);
    });
  });

  // ── remove() ────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('should hard-delete the record', async () => {
      mockPrismaClient.reportCompareSchedule.findUnique.mockResolvedValue({ id: 'cs1' });
      mockPrismaClient.reportCompareSchedule.delete.mockResolvedValue({ id: 'cs1' });

      const result = await service.remove('cs1');

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaClient.reportCompareSchedule.delete).toHaveBeenCalledWith({ where: { id: 'cs1' } });
    });
  });

  // ── execute() ───────────────────────────────────────────────────────────

  describe('execute()', () => {
    const makeSchedule = (overrides: any = {}) => ({
      id: 'cs1',
      reportIdA: 'rA',
      reportIdB: 'rB',
      comparisonType: 'section',
      comparisonConfig: {},
      thresholds: {},
      ...overrides,
    });

    it('should detect identical sections', async () => {
      const section = { id: 's1', title: 'Summary', content: 'Same' };
      mockPrismaClient.reportCompareSchedule.findUnique.mockResolvedValue(makeSchedule());
      mockPrismaClient.reportDefinition.findUnique
        .mockResolvedValueOnce({ id: 'rA', config: { sections: [section] } })
        .mockResolvedValueOnce({ id: 'rB', config: { sections: [section] } });
      mockPrismaClient.reportCompareSchedule.update.mockResolvedValue({ id: 'cs1', status: 'completed' });

      await service.execute('cs1');

      // The second update call (index 1) has the final resultData
      const updateCalls = mockPrismaClient.reportCompareSchedule.update.mock.calls;
      const finalCall = updateCalls[updateCalls.length - 1][0];
      const rd = finalCall.data.resultData;
      expect(rd.summary.identical).toBe(1);
      expect(rd.summary.modified).toBe(0);
    });

    it('should detect modified sections', async () => {
      mockPrismaClient.reportCompareSchedule.findUnique.mockResolvedValue(makeSchedule());
      mockPrismaClient.reportDefinition.findUnique
        .mockResolvedValueOnce({
          id: 'rA', config: { sections: [{ id: 's1', title: 'A', content: 'v1' }] },
        })
        .mockResolvedValueOnce({
          id: 'rB', config: { sections: [{ id: 's1', title: 'A', content: 'v2' }] },
        });
      mockPrismaClient.reportCompareSchedule.update.mockResolvedValue({ id: 'cs1', status: 'completed' });

      await service.execute('cs1');

      const updateCalls = mockPrismaClient.reportCompareSchedule.update.mock.calls;
      const finalCall = updateCalls[updateCalls.length - 1][0];
      const rd = finalCall.data.resultData;
      expect(rd.summary.modified).toBe(1);
      expect(rd.sectionDiffs[0].status).toBe('modified');
    });

    it('should detect added and removed sections', async () => {
      mockPrismaClient.reportCompareSchedule.findUnique.mockResolvedValue(makeSchedule());
      mockPrismaClient.reportDefinition.findUnique
        .mockResolvedValueOnce({
          id: 'rA', config: { sections: [{ id: 's1', title: 'Only in A' }] },
        })
        .mockResolvedValueOnce({
          id: 'rB', config: { sections: [{ id: 's2', title: 'Only in B' }] },
        });
      mockPrismaClient.reportCompareSchedule.update.mockResolvedValue({ id: 'cs1' });

      await service.execute('cs1');

      const updateCalls = mockPrismaClient.reportCompareSchedule.update.mock.calls;
      const finalCall = updateCalls[updateCalls.length - 1][0];
      const rd = finalCall.data.resultData;
      expect(rd.summary.addedInB).toBe(1);
      expect(rd.summary.removedInB).toBe(1);
    });

    it('should set status to threshold_exceeded when match percentage is below threshold', async () => {
      mockPrismaClient.reportCompareSchedule.findUnique.mockResolvedValue(
        makeSchedule({ thresholds: { minMatchPercentage: 100 } }),
      );
      mockPrismaClient.reportDefinition.findUnique
        .mockResolvedValueOnce({
          id: 'rA', config: { sections: [{ id: 's1', content: 'A' }] },
        })
        .mockResolvedValueOnce({
          id: 'rB', config: { sections: [{ id: 's1', content: 'B' }] },
        });
      mockPrismaClient.reportCompareSchedule.update.mockResolvedValue({ id: 'cs1' });

      await service.execute('cs1');

      const updateCalls = mockPrismaClient.reportCompareSchedule.update.mock.calls;
      const finalCall = updateCalls[updateCalls.length - 1][0];
      expect(finalCall.data.status).toBe('threshold_exceeded');
    });

    it('should throw NotFoundError if report A not found', async () => {
      mockPrismaClient.reportCompareSchedule.findUnique.mockResolvedValue(makeSchedule());
      mockPrismaClient.reportDefinition.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'rB' });
      mockPrismaClient.reportCompareSchedule.update.mockResolvedValue({ id: 'cs1' });

      await expect(service.execute('cs1')).rejects.toThrow(/not found/i);
    });
  });

  // ── getResults() ────────────────────────────────────────────────────────

  describe('getResults()', () => {
    it('should return structured result data', async () => {
      const record = {
        id: 'cs1', name: 'Schedule',
        reportIdA: 'rA', reportIdB: 'rB',
        comparisonType: 'section', status: 'completed',
        resultData: { summary: { totalSections: 3 } },
        lastExecutedAt: new Date(),
      };
      mockPrismaClient.reportCompareSchedule.findUnique.mockResolvedValue(record);

      const result = await service.getResults('cs1');

      expect(result.id).toBe('cs1');
      expect(result.status).toBe('completed');
      expect(result.resultData).toBeDefined();
      expect(result.reportIdA).toBe('rA');
      expect(result.reportIdB).toBe('rB');
    });
  });

  // ── activate() / deactivate() ──────────────────────────────────────────

  describe('activate()', () => {
    it('should set isActive to true', async () => {
      mockPrismaClient.reportCompareSchedule.update.mockResolvedValue({ id: 'cs1', isActive: true });

      const result = await service.activate('cs1');

      expect(mockPrismaClient.reportCompareSchedule.update).toHaveBeenCalledWith({
        where: { id: 'cs1' },
        data: { isActive: true },
      });
      expect(result.isActive).toBe(true);
    });
  });

  describe('deactivate()', () => {
    it('should set isActive to false', async () => {
      mockPrismaClient.reportCompareSchedule.update.mockResolvedValue({ id: 'cs1', isActive: false });

      const result = await service.deactivate('cs1');

      expect(mockPrismaClient.reportCompareSchedule.update).toHaveBeenCalledWith({
        where: { id: 'cs1' },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });
  });
});
