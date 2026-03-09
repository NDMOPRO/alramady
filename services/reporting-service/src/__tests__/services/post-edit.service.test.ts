import '../mocks/logger';
import { mockCacheGet, mockCacheSet, mockCacheDel } from '../mocks/redis';
import { mockPrismaClient } from '../mocks/prisma';

import { ReportPostEditService } from '../../services/post-edit.service';

describe('ReportPostEditService', () => {
  let service: ReportPostEditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportPostEditService();
  });

  // ---------------------------------------------------------------------------
  // list()
  // ---------------------------------------------------------------------------
  describe('list()', () => {
    const baseParams = { page: 1, limit: 10, sortOrder: 'desc' as const };

    it('should return paginated results', async () => {
      const mockData = [{ id: 'pe-1' }, { id: 'pe-2' }];
      mockPrismaClient.reportPostEdit.findMany.mockResolvedValue(mockData);
      mockPrismaClient.reportPostEdit.count.mockResolvedValue(2);

      const result = await service.list(baseParams);

      expect(result).toEqual({
        data: mockData,
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(mockPrismaClient.reportPostEdit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('should return cached results when available', async () => {
      const cached = { data: [{ id: 'cached' }], total: 1 };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await service.list(baseParams);

      expect(result).toEqual(cached);
      expect(mockPrismaClient.reportPostEdit.findMany).not.toHaveBeenCalled();
    });

    it('should apply search filter', async () => {
      mockPrismaClient.reportPostEdit.findMany.mockResolvedValue([]);
      mockPrismaClient.reportPostEdit.count.mockResolvedValue(0);

      await service.list({ ...baseParams, search: 'header' });

      expect(mockPrismaClient.reportPostEdit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { editType: { contains: 'header', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('should filter by reportId', async () => {
      mockPrismaClient.reportPostEdit.findMany.mockResolvedValue([]);
      mockPrismaClient.reportPostEdit.count.mockResolvedValue(0);

      await service.list({ ...baseParams, reportId: 'rpt-1' });

      expect(mockPrismaClient.reportPostEdit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ reportId: 'rpt-1' }),
        }),
      );
    });

    it('should calculate correct skip for page > 1', async () => {
      mockPrismaClient.reportPostEdit.findMany.mockResolvedValue([]);
      mockPrismaClient.reportPostEdit.count.mockResolvedValue(25);

      const result = await service.list({ ...baseParams, page: 3 });

      expect(mockPrismaClient.reportPostEdit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.totalPages).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // getById()
  // ---------------------------------------------------------------------------
  describe('getById()', () => {
    it('should return record when found', async () => {
      const record = { id: 'pe-1', reportId: 'rpt-1', editType: 'section_edit' };
      mockPrismaClient.reportPostEdit.findUnique.mockResolvedValue(record);

      const result = await service.getById('pe-1');

      expect(result).toEqual(record);
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should return cached record', async () => {
      const cached = { id: 'pe-1', reportId: 'rpt-1' };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await service.getById('pe-1');

      expect(result).toEqual(cached);
      expect(mockPrismaClient.reportPostEdit.findUnique).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when record does not exist', async () => {
      mockPrismaClient.reportPostEdit.findUnique.mockResolvedValue(null);

      await expect(service.getById('non-existent')).rejects.toThrow(
        "ReportPostEdit with id 'non-existent' not found",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------
  describe('create()', () => {
    it('should create a post-edit record with reportId, editType, editData', async () => {
      const input = {
        reportId: 'rpt-1',
        editType: 'section_edit',
        editData: { title: 'New Title' },
        userId: 'user-1',
      };
      const created = { id: 'pe-new', ...input, createdBy: 'user-1' };
      mockPrismaClient.reportPostEdit.create.mockResolvedValue(created);

      const result = await service.create(input);

      expect(result).toEqual(created);
      expect(mockPrismaClient.reportPostEdit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportId: 'rpt-1',
          editType: 'section_edit',
          createdBy: 'user-1',
        }),
      });
      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // update()
  // ---------------------------------------------------------------------------
  describe('update()', () => {
    it('should update an existing post-edit record', async () => {
      const existing = { id: 'pe-1', reportId: 'rpt-1', editType: 'section_edit' };
      mockPrismaClient.reportPostEdit.findUnique.mockResolvedValue(existing);
      const updated = { ...existing, editType: 'watermark' };
      mockPrismaClient.reportPostEdit.update.mockResolvedValue(updated);

      const result = await service.update('pe-1', { editType: 'watermark' });

      expect(result).toEqual(updated);
      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should throw NotFoundError when updating non-existent record', async () => {
      mockPrismaClient.reportPostEdit.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', {})).rejects.toThrow('not found');
    });
  });

  // ---------------------------------------------------------------------------
  // remove()
  // ---------------------------------------------------------------------------
  describe('remove()', () => {
    it('should delete an existing post-edit record', async () => {
      const existing = { id: 'pe-1' };
      mockPrismaClient.reportPostEdit.findUnique.mockResolvedValue(existing);
      mockPrismaClient.reportPostEdit.delete.mockResolvedValue(existing);

      const result = await service.remove('pe-1');

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaClient.reportPostEdit.delete).toHaveBeenCalledWith({ where: { id: 'pe-1' } });
    });

    it('should throw NotFoundError when removing non-existent record', async () => {
      mockPrismaClient.reportPostEdit.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-id')).rejects.toThrow('not found');
    });
  });

  // ---------------------------------------------------------------------------
  // applySectionEdit()
  // ---------------------------------------------------------------------------
  describe('applySectionEdit()', () => {
    it('should create an edit record with section data and version 1 when no previous edits', async () => {
      mockPrismaClient.reportPostEdit.findFirst.mockResolvedValue(null);
      const created = {
        id: 'pe-new',
        reportId: 'rpt-1',
        editType: 'section_edit',
        targetSectionId: 'sec-1',
        changes: { title: 'Updated' },
        version: 1,
        isPublished: false,
        createdBy: 'user-1',
      };
      mockPrismaClient.reportPostEdit.create.mockResolvedValue(created);

      const result = await service.applySectionEdit('rpt-1', 'sec-1', { title: 'Updated' }, 'user-1');

      expect(result).toEqual(created);
      expect(mockPrismaClient.reportPostEdit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportId: 'rpt-1',
          editType: 'section_edit',
          targetSectionId: 'sec-1',
          version: 1,
          isPublished: false,
          createdBy: 'user-1',
        }),
      });
    });

    it('should increment version when previous edits exist', async () => {
      mockPrismaClient.reportPostEdit.findFirst.mockResolvedValue({ version: 3 });
      const created = { id: 'pe-new', version: 4 };
      mockPrismaClient.reportPostEdit.create.mockResolvedValue(created);

      const result = await service.applySectionEdit('rpt-1', 'sec-1', { color: 'red' }, 'user-1');

      expect(mockPrismaClient.reportPostEdit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ version: 4 }),
      });
      expect(result.version).toBe(4);
    });
  });

  // ---------------------------------------------------------------------------
  // getVersionDiff()
  // ---------------------------------------------------------------------------
  describe('getVersionDiff()', () => {
    it('should return diff between current and previous version', async () => {
      const current = {
        id: 'pe-2',
        reportId: 'rpt-1',
        targetSectionId: 'sec-1',
        version: 2,
        changes: { title: 'Updated', color: 'blue' },
      };
      const previous = {
        id: 'pe-1',
        reportId: 'rpt-1',
        targetSectionId: 'sec-1',
        version: 1,
        changes: { title: 'Original', color: 'blue' },
      };

      mockPrismaClient.reportPostEdit.findUnique.mockResolvedValue(current);
      mockPrismaClient.reportPostEdit.findFirst.mockResolvedValue(previous);

      const result = await service.getVersionDiff('pe-2');

      expect(result.id).toBe('pe-2');
      expect(result.currentVersion).toBe(2);
      expect(result.previousVersion).toBe(1);
      expect(result.hasPrevious).toBe(true);
      expect(result.diff).toEqual({
        title: { previous: 'Original', current: 'Updated' },
      });
      // color is the same so should not be in diff
      expect(result.diff).not.toHaveProperty('color');
    });

    it('should handle no previous version', async () => {
      const current = {
        id: 'pe-1',
        reportId: 'rpt-1',
        targetSectionId: 'sec-1',
        version: 1,
        changes: { title: 'First' },
      };

      mockPrismaClient.reportPostEdit.findUnique.mockResolvedValue(current);
      mockPrismaClient.reportPostEdit.findFirst.mockResolvedValue(null);

      const result = await service.getVersionDiff('pe-1');

      expect(result.hasPrevious).toBe(false);
      expect(result.previousVersion).toBeNull();
      expect(result.diff).toEqual({
        title: { previous: null, current: 'First' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // reexport()
  // ---------------------------------------------------------------------------
  describe('reexport()', () => {
    it('should re-generate export with merged published edits', async () => {
      const record = {
        id: 'pe-1',
        reportId: 'rpt-1',
        headerFooterConfig: { header: 'H' },
        watermarkConfig: { text: 'DRAFT' },
        formatOverrides: { fontSize: 14 },
      };
      mockPrismaClient.reportPostEdit.findUnique.mockResolvedValue(record);

      const publishedEdits = [
        { id: 'pe-a', changes: { title: 'T1' }, version: 1 },
        { id: 'pe-b', changes: { title: 'T2', subtitle: 'S1' }, version: 2 },
      ];
      mockPrismaClient.reportPostEdit.findMany.mockResolvedValue(publishedEdits);

      const result = await service.reexport('pe-1', 'pdf');

      expect(result.reportId).toBe('rpt-1');
      expect(result.format).toBe('pdf');
      expect(result.appliedEdits).toBe(2);
      expect(result.mergedChanges).toEqual({ title: 'T2', subtitle: 'S1' });
      expect(result.status).toBe('completed');
      expect(result.headerFooterConfig).toEqual({ header: 'H' });
      expect(result.watermarkConfig).toEqual({ text: 'DRAFT' });
    });

    it('should handle no published edits', async () => {
      const record = { id: 'pe-1', reportId: 'rpt-1' };
      mockPrismaClient.reportPostEdit.findUnique.mockResolvedValue(record);
      mockPrismaClient.reportPostEdit.findMany.mockResolvedValue([]);

      const result = await service.reexport('pe-1', 'html');

      expect(result.appliedEdits).toBe(0);
      expect(result.mergedChanges).toEqual({});
    });

    it('should throw NotFoundError for non-existent record', async () => {
      mockPrismaClient.reportPostEdit.findUnique.mockResolvedValue(null);

      await expect(service.reexport('bad-id', 'pdf')).rejects.toThrow('not found');
    });
  });
});
