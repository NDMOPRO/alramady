import { mockPrismaClient } from '../mocks/prisma';
import { mockCacheGet, mockCacheSet, mockCacheDel } from '../mocks/redis';
import '../mocks/logger';

// Mock dependent services before importing the service under test
jest.mock('../../services/report-builder.service', () => ({
  reportBuilderService: {
    buildReport: jest.fn().mockResolvedValue({
      buildId: 'build-1',
      sectionCount: 3,
      renderedSections: [{ id: 's1', html: '<p>test</p>' }],
    }),
  },
}));

jest.mock('../../services/template-engine.service', () => ({
  templateEngineService: {
    exportToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf-data')),
    exportToWord: jest.fn().mockResolvedValue(Buffer.from('docx-data')),
    exportToHTML: jest.fn().mockResolvedValue('<html>report</html>'),
    exportToExcel: jest.fn().mockResolvedValue(Buffer.from('xlsx-data')),
  },
}));

import { ReportEasyModeService } from '../../services/easy-mode.service';
import { NotFoundError } from '../../middleware/errorHandler';

describe('ReportEasyModeService', () => {
  let service: ReportEasyModeService;

  beforeEach(() => {
    service = new ReportEasyModeService();
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // ── list() ──────────────────────────────────────────────────────────────

  describe('list()', () => {
    const baseParams = { page: 1, limit: 10, sortOrder: 'desc' as const };

    it('should return cached result when cache hit', async () => {
      const cachedResult = { data: [{ id: '1' }], total: 1, page: 1, limit: 10, totalPages: 1 };
      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await service.list(baseParams);

      expect(result).toEqual(cachedResult);
      expect(mockPrismaClient.reportDefinition.findMany).not.toHaveBeenCalled();
    });

    it('should query DB on cache miss and cache the result', async () => {
      const records = [{ id: '1', name: 'Report A', mode: 'EASY' }];
      mockPrismaClient.reportDefinition.findMany.mockResolvedValue(records);
      mockPrismaClient.reportDefinition.count.mockResolvedValue(1);

      const result = await service.list(baseParams);

      expect(result.data).toEqual(records);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('reporting:easy-mode:list:'),
        expect.objectContaining({ data: records, total: 1 }),
        300,
      );
    });

    it('should apply search filter', async () => {
      mockPrismaClient.reportDefinition.findMany.mockResolvedValue([]);
      mockPrismaClient.reportDefinition.count.mockResolvedValue(0);

      await service.list({ ...baseParams, search: 'revenue' });

      const callArgs = mockPrismaClient.reportDefinition.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR).toHaveLength(2);
    });

    it('should apply reportType and outputFormat filters', async () => {
      mockPrismaClient.reportDefinition.findMany.mockResolvedValue([]);
      mockPrismaClient.reportDefinition.count.mockResolvedValue(0);

      await service.list({ ...baseParams, reportType: 'financial-summary', outputFormat: 'PDF' });

      const callArgs = mockPrismaClient.reportDefinition.findMany.mock.calls[0][0];
      expect(callArgs.where.reportType).toBe('financial-summary');
      expect(callArgs.where.outputFormat).toBe('PDF');
    });

    it('should calculate pagination correctly', async () => {
      mockPrismaClient.reportDefinition.findMany.mockResolvedValue([]);
      mockPrismaClient.reportDefinition.count.mockResolvedValue(25);

      const result = await service.list({ page: 2, limit: 10, sortOrder: 'asc' });

      expect(result.totalPages).toBe(3);
      expect(result.page).toBe(2);
      const callArgs = mockPrismaClient.reportDefinition.findMany.mock.calls[0][0];
      expect(callArgs.skip).toBe(10);
      expect(callArgs.take).toBe(10);
    });
  });

  // ── getById() ───────────────────────────────────────────────────────────

  describe('getById()', () => {
    it('should return cached record on cache hit', async () => {
      const cached = { id: 'r1', name: 'Cached', mode: 'EASY' };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await service.getById('r1');

      expect(result).toEqual(cached);
      expect(mockPrismaClient.reportDefinition.findUnique).not.toHaveBeenCalled();
    });

    it('should query DB on cache miss and cache result', async () => {
      const record = { id: 'r1', name: 'Report', mode: 'EASY', buildOutputs: [] };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(record);

      const result = await service.getById('r1');

      expect(result).toEqual(record);
      expect(mockCacheSet).toHaveBeenCalledWith('reporting:easy-mode:r1', record, 300);
    });

    it('should throw NotFoundError when record does not exist', async () => {
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toThrow(/not found/i);
    });

    it('should throw NotFoundError when record is not EASY mode', async () => {
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue({
        id: 'r1', mode: 'ADVANCED',
      });

      await expect(service.getById('r1')).rejects.toThrow(/not found/i);
    });
  });

  // ── create() ────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create a new EASY mode report with defaults', async () => {
      const created = { id: 'new-1', name: 'New Report', mode: 'EASY', status: 'DRAFT' };
      mockPrismaClient.reportDefinition.create.mockResolvedValue(created);

      const result = await service.create({
        name: 'New Report',
        reportType: 'financial-summary',
      });

      expect(result).toEqual(created);
      const createCall = mockPrismaClient.reportDefinition.create.mock.calls[0][0];
      expect(createCall.data.mode).toBe('EASY');
      expect(createCall.data.status).toBe('DRAFT');
      expect(createCall.data.outputFormat).toBe('PDF');
      expect(createCall.data.tenantId).toBe('default');
      expect(createCall.data.createdBy).toBe('system');
      expect(mockCacheDel).toHaveBeenCalledWith('reporting:easy-mode:list:*');
    });

    it('should use provided userId, tenantId, and outputFormat', async () => {
      mockPrismaClient.reportDefinition.create.mockResolvedValue({ id: 'new-2' });

      await service.create({
        name: 'Custom',
        userId: 'user-1',
        tenantId: 'tenant-1',
        outputFormat: 'html',
      });

      const createCall = mockPrismaClient.reportDefinition.create.mock.calls[0][0];
      expect(createCall.data.createdBy).toBe('user-1');
      expect(createCall.data.tenantId).toBe('tenant-1');
      expect(createCall.data.outputFormat).toBe('HTML');
    });
  });

  // ── update() ────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should merge config fields with existing config', async () => {
      const existing = {
        id: 'r1', name: 'Old', mode: 'EASY',
        config: { dataSourceId: 'ds-1', layoutConfig: { columns: 2 } },
        buildOutputs: [],
      };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(existing);
      mockPrismaClient.reportDefinition.update.mockResolvedValue({ id: 'r1', name: 'Updated' });

      await service.update('r1', { name: 'Updated', layoutConfig: { columns: 3 } });

      const updateCall = mockPrismaClient.reportDefinition.update.mock.calls[0][0];
      expect(updateCall.data.name).toBe('Updated');
      expect(updateCall.data.config.dataSourceId).toBe('ds-1');
      expect(updateCall.data.config.layoutConfig).toEqual({ columns: 3 });
    });

    it('should invalidate both item and list caches', async () => {
      const existing = { id: 'r1', mode: 'EASY', config: {}, buildOutputs: [] };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(existing);
      mockPrismaClient.reportDefinition.update.mockResolvedValue(existing);

      await service.update('r1', { name: 'X' });

      expect(mockCacheDel).toHaveBeenCalledWith('reporting:easy-mode:r1');
      expect(mockCacheDel).toHaveBeenCalledWith('reporting:easy-mode:list:*');
    });
  });

  // ── remove() ────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('should soft-delete by setting deletedAt', async () => {
      const existing = { id: 'r1', mode: 'EASY', buildOutputs: [] };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(existing);
      mockPrismaClient.reportDefinition.update.mockResolvedValue({ ...existing, deletedAt: new Date() });

      const result = await service.remove('r1');

      expect(result).toEqual({ deleted: true });
      const updateCall = mockPrismaClient.reportDefinition.update.mock.calls[0][0];
      expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
      expect(mockCacheDel).toHaveBeenCalledWith('reporting:easy-mode:r1');
    });

    it('should throw NotFoundError if report does not exist', async () => {
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(/not found/i);
    });
  });

  // ── duplicate() ─────────────────────────────────────────────────────────

  describe('duplicate()', () => {
    it('should create a copy with "(Copy)" suffix', async () => {
      const source = {
        id: 'r1', name: 'Original', description: 'Desc', mode: 'EASY',
        reportType: 'financial-summary', outputFormat: 'PDF',
        tenantId: 'default', createdBy: 'user-1',
        config: { foo: 'bar' }, settings: {}, metadata: {},
        buildOutputs: [],
      };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(source);
      mockPrismaClient.reportDefinition.create.mockResolvedValue({ id: 'r2', name: 'Original (Copy)' });

      const result = await service.duplicate('r1');

      expect(result.name).toBe('Original (Copy)');
      const createCall = mockPrismaClient.reportDefinition.create.mock.calls[0][0];
      expect(createCall.data.name).toBe('Original (Copy)');
      expect(createCall.data.mode).toBe('EASY');
      expect(createCall.data.status).toBe('DRAFT');
      expect(createCall.data.config).toEqual(source.config);
    });
  });

  // ── generate() ──────────────────────────────────────────────────────────

  describe('generate()', () => {
    beforeEach(() => {
      const report = {
        id: 'r1', mode: 'EASY', outputFormat: 'PDF', config: {},
        buildOutputs: [],
      };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(report);
      mockPrismaClient.reportDefinition.update.mockResolvedValue({ ...report, status: 'COMPLETED' });
    });

    it('should generate PDF by default', async () => {
      const result = await service.generate('r1');

      expect(result.format).toBe('pdf');
      expect((result as any).contentType).toBe('application/pdf');
      expect(result.reportId).toBe('r1');
      expect(result.status).toBe('completed');
    });

    it('should generate HTML when requested', async () => {
      const result = await service.generate('r1', 'html');

      expect(result.format).toBe('html');
      expect((result as any).contentType).toBe('text/html');
    });

    it('should generate Word when requested', async () => {
      const result = await service.generate('r1', 'docx');

      expect(result.format).toBe('docx');
      expect((result as any).contentType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should generate Excel when requested', async () => {
      const result = await service.generate('r1', 'xlsx');

      expect(result.format).toBe('xlsx');
      expect((result as any).contentType).toBe('application/vnd.ms-excel');
    });

    it('should update report status to COMPLETED', async () => {
      await service.generate('r1');

      expect(mockPrismaClient.reportDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: { status: 'COMPLETED' },
        }),
      );
    });
  });

  // ── autoCompose() ───────────────────────────────────────────────────────

  describe('autoCompose()', () => {
    it('should build and export in the default format, then mark as COMPLETED', async () => {
      const report = {
        id: 'r1', mode: 'EASY', outputFormat: 'PDF', config: {},
        buildOutputs: [],
      };
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue(report);
      mockPrismaClient.reportDefinition.update.mockResolvedValue({ ...report, status: 'COMPLETED' });

      const result = await service.autoCompose('r1');

      expect(result.reportId).toBe('r1');
      expect(result.status).toBe('completed');
      expect(result.format).toBe('pdf');
      expect(result.buildId).toBe('build-1');
      expect(result.sectionCount).toBe(3);
    });
  });

  // ── getReportTypes() ───────────────────────────────────────────────────

  describe('getReportTypes()', () => {
    it('should return report types from the registry', async () => {
      const types = await service.getReportTypes();

      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
      expect(types[0]).toHaveProperty('id');
      expect(types[0]).toHaveProperty('name');
      expect(types[0]).toHaveProperty('category');
    });
  });
});
