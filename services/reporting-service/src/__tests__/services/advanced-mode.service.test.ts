import { mockPrismaClient } from '../mocks/prisma';
import { mockCacheGet, mockCacheSet, mockCacheDel } from '../mocks/redis';
import '../mocks/logger';

jest.mock('../../services/report-builder.service', () => ({
  reportBuilderService: {
    buildReport: jest.fn().mockResolvedValue({
      buildId: 'build-adv-1',
      sectionCount: 5,
      renderedSections: [],
    }),
  },
}));

jest.mock('../../services/template-engine.service', () => ({
  templateEngineService: {
    exportToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    exportToWord: jest.fn().mockResolvedValue(Buffer.from('docx')),
    exportToHTML: jest.fn().mockResolvedValue('<html></html>'),
    exportToExcel: jest.fn().mockResolvedValue(Buffer.from('xlsx')),
  },
}));

import { ReportAdvancedModeService } from '../../services/advanced-mode.service';
import { NotFoundError, BadRequestError } from '../../middleware/errorHandler';

describe('ReportAdvancedModeService', () => {
  let service: ReportAdvancedModeService;

  beforeEach(() => {
    service = new ReportAdvancedModeService();
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // ── list() ──────────────────────────────────────────────────────────────

  describe('list()', () => {
    const baseParams = { page: 1, limit: 10, sortOrder: 'desc' as const };

    it('should return cached result on cache hit', async () => {
      const cached = { data: [{ id: 'a1' }], total: 1 };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await service.list(baseParams);

      expect(result).toEqual(cached);
      expect(mockPrismaClient.reportDefinition.findMany).not.toHaveBeenCalled();
    });

    it('should query DB on cache miss with mode=ADVANCED filter', async () => {
      mockPrismaClient.reportDefinition.findMany.mockResolvedValue([{ id: 'a1' }]);
      mockPrismaClient.reportDefinition.count.mockResolvedValue(1);

      const result = await service.list(baseParams);

      expect(result.data).toHaveLength(1);
      const callArgs = mockPrismaClient.reportDefinition.findMany.mock.calls[0][0];
      expect(callArgs.where.mode).toBe('ADVANCED');
      expect(callArgs.where.deletedAt).toBeNull();
    });

    it('should apply search filter with OR condition', async () => {
      mockPrismaClient.reportDefinition.findMany.mockResolvedValue([]);
      mockPrismaClient.reportDefinition.count.mockResolvedValue(0);

      await service.list({ ...baseParams, search: 'query' });

      const callArgs = mockPrismaClient.reportDefinition.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toHaveLength(2);
    });
  });

  // ── getById() ───────────────────────────────────────────────────────────

  describe('getById()', () => {
    it('should return the record when found and mode is ADVANCED', async () => {
      const record = { id: 'a1', mode: 'ADVANCED', buildOutputs: [] };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(record);

      const result = await service.getById('a1');

      expect(result).toEqual(record);
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should throw NotFoundError when record not found', async () => {
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toThrow(/not found/i);
    });

    it('should throw NotFoundError when mode is not ADVANCED', async () => {
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue({
        id: 'a1', mode: 'EASY',
      });

      await expect(service.getById('a1')).rejects.toThrow(/not found/i);
    });
  });

  // ── create() ────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should throw BadRequestError when queryConfig is missing', async () => {
      await expect(service.create({
        name: 'Test',
        dataSources: [{ datasetId: 'ds-1' }],
      })).rejects.toThrow();
    });

    it('should throw BadRequestError when dataSources is empty', async () => {
      await expect(service.create({
        name: 'Test',
        queryConfig: { sql: 'SELECT 1' },
        dataSources: [],
      })).rejects.toThrow();
    });

    it('should throw BadRequestError when dataSources is missing', async () => {
      await expect(service.create({
        name: 'Test',
        queryConfig: { sql: 'SELECT 1' },
      })).rejects.toThrow();
    });

    it('should create an ADVANCED mode report with valid data', async () => {
      const created = { id: 'a-new', mode: 'ADVANCED', status: 'DRAFT' };
      mockPrismaClient.reportDefinition.create.mockResolvedValue(created);

      const result = await service.create({
        name: 'Advanced Report',
        queryConfig: { sql: 'SELECT *' },
        dataSources: [{ datasetId: 'ds-1' }],
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      expect(result).toEqual(created);
      const createCall = mockPrismaClient.reportDefinition.create.mock.calls[0][0];
      expect(createCall.data.mode).toBe('ADVANCED');
      expect(createCall.data.status).toBe('DRAFT');
      expect(createCall.data.reportType).toBe('advanced-custom');
      expect(createCall.data.createdBy).toBe('user-1');
    });
  });

  // ── update() ────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should merge config fields with existing config', async () => {
      const existing = {
        id: 'a1', mode: 'ADVANCED',
        config: { queryConfig: { sql: 'SELECT 1' }, cacheStrategy: 'none' },
        buildOutputs: [],
      };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(existing);
      mockPrismaClient.reportDefinition.update.mockResolvedValue({ id: 'a1' });

      await service.update('a1', { queryConfig: { sql: 'SELECT 2' } });

      const updateCall = mockPrismaClient.reportDefinition.update.mock.calls[0][0];
      expect(updateCall.data.config.queryConfig).toEqual({ sql: 'SELECT 2' });
      expect(updateCall.data.config.cacheStrategy).toBe('none');
    });

    it('should update dataSources directly on the record', async () => {
      const existing = { id: 'a1', mode: 'ADVANCED', config: {}, buildOutputs: [] };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(existing);
      mockPrismaClient.reportDefinition.update.mockResolvedValue({ id: 'a1' });

      await service.update('a1', { dataSources: [{ datasetId: 'ds-2' }] });

      const updateCall = mockPrismaClient.reportDefinition.update.mock.calls[0][0];
      expect(updateCall.data.dataSources).toEqual([{ datasetId: 'ds-2' }]);
    });

    it('should invalidate caches after update', async () => {
      const existing = { id: 'a1', mode: 'ADVANCED', config: {}, buildOutputs: [] };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(existing);
      mockPrismaClient.reportDefinition.update.mockResolvedValue({ id: 'a1' });

      await service.update('a1', { name: 'Updated' });

      expect(mockCacheDel).toHaveBeenCalledWith('reporting:advanced-mode:a1');
      expect(mockCacheDel).toHaveBeenCalledWith('reporting:advanced-mode:list:*');
    });
  });

  // ── remove() ────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('should soft-delete by setting deletedAt', async () => {
      const existing = { id: 'a1', mode: 'ADVANCED', buildOutputs: [] };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(existing);
      mockPrismaClient.reportDefinition.update.mockResolvedValue({ ...existing, deletedAt: new Date() });

      const result = await service.remove('a1');

      expect(result).toEqual({ deleted: true });
      const updateCall = mockPrismaClient.reportDefinition.update.mock.calls[0][0];
      expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  // ── executeQuery() ─────────────────────────────────────────────────────

  describe('executeQuery()', () => {
    const report = {
      id: 'a1', mode: 'ADVANCED',
      config: { queryConfig: {} },
      dataSources: [{ datasetId: 'ds-1' }, { datasetId: 'ds-2' }],
      buildOutputs: [],
    };

    beforeEach(() => {
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(report);
    });

    it('should fetch data from all configured data sources', async () => {
      mockPrismaClient.dataset.findUnique
        .mockResolvedValueOnce({ id: 'ds-1', data: [{ name: 'A', value: 10 }] })
        .mockResolvedValueOnce({ id: 'ds-2', data: [{ name: 'B', value: 20 }] });

      const result = await service.executeQuery('a1', {});

      expect(result.reportId).toBe('a1');
      expect(result.status).toBe('executed');
      expect(result.dataSources).toBe(2);
      expect(result.totalRows).toBe(2);
    });

    it('should apply filters to query results', async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue({
        id: 'ds-1',
        data: [
          { name: 'A', status: 'active', value: 10 },
          { name: 'B', status: 'inactive', value: 20 },
          { name: 'C', status: 'active', value: 30 },
        ],
      });
      // Only first dataset is used since report has two dataSources
      mockPrismaClient.dataset.findUnique
        .mockResolvedValueOnce({
          id: 'ds-1',
          data: [
            { name: 'A', status: 'active', value: 10 },
            { name: 'B', status: 'inactive', value: 20 },
            { name: 'C', status: 'active', value: 30 },
          ],
        })
        .mockResolvedValueOnce(null);

      const result = await service.executeQuery('a1', {
        filters: { status: 'active' },
      });

      expect(result.data['ds-1']).toHaveLength(2);
      expect(result.data['ds-1'].every((r: any) => r.status === 'active')).toBe(true);
    });

    it('should apply sorting to query results', async () => {
      mockPrismaClient.dataset.findUnique
        .mockResolvedValueOnce({
          id: 'ds-1',
          data: [
            { name: 'C', value: 30 },
            { name: 'A', value: 10 },
            { name: 'B', value: 20 },
          ],
        })
        .mockResolvedValueOnce(null);

      const result = await service.executeQuery('a1', {
        sortBy: 'value', sortOrder: 'asc',
      });

      expect(result.data['ds-1'][0].value).toBe(10);
      expect(result.data['ds-1'][2].value).toBe(30);
    });

    it('should apply limit to query results', async () => {
      mockPrismaClient.dataset.findUnique
        .mockResolvedValueOnce({
          id: 'ds-1',
          data: [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }],
        })
        .mockResolvedValueOnce(null);

      const result = await service.executeQuery('a1', { limit: 2 });

      expect(result.data['ds-1']).toHaveLength(2);
    });
  });

  // ── generate() ──────────────────────────────────────────────────────────

  describe('generate()', () => {
    beforeEach(() => {
      const report = {
        id: 'a1', mode: 'ADVANCED',
        config: { outputFormats: ['pdf', 'html'] },
        buildOutputs: [],
      };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(report);
      mockPrismaClient.reportDefinition.update.mockResolvedValue({ id: 'a1', status: 'COMPLETED' });
    });

    it('should generate in all configured formats', async () => {
      const result = await service.generate('a1');

      expect(result.reportId).toBe('a1');
      expect(result.buildId).toBe('build-adv-1');
      expect(result.formats).toHaveLength(2);
      expect(result.formats[0]).toEqual({ format: 'pdf', status: 'completed' });
      expect(result.formats[1]).toEqual({ format: 'html', status: 'completed' });
    });

    it('should accept explicit format override', async () => {
      const result = await service.generate('a1', ['docx', 'xlsx']);

      expect(result.formats).toHaveLength(2);
      expect(result.formats[0].format).toBe('docx');
      expect(result.formats[1].format).toBe('xlsx');
    });

    it('should mark unsupported formats', async () => {
      const result = await service.generate('a1', ['csv']);

      expect(result.formats[0]).toEqual({ format: 'csv', status: 'unsupported' });
    });

    it('should update status to COMPLETED', async () => {
      await service.generate('a1');

      expect(mockPrismaClient.reportDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a1' },
          data: { status: 'COMPLETED' },
        }),
      );
    });
  });
});
