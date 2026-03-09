import '../mocks/logger';
import { mockCacheGet, mockCacheSet, mockCacheDel } from '../mocks/redis';
import { mockPrismaClient } from '../mocks/prisma';

import { ReportTemplateLibraryService } from '../../services/template-library.service';

describe('ReportTemplateLibraryService', () => {
  let service: ReportTemplateLibraryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportTemplateLibraryService();
  });

  // ---------------------------------------------------------------------------
  // list()
  // ---------------------------------------------------------------------------
  describe('list()', () => {
    const baseParams = { page: 1, limit: 10, sortOrder: 'desc' as const };

    it('should return paginated results', async () => {
      const mockData = [{ id: 'tpl-1', name: 'Financial' }];
      mockPrismaClient.reportTemplate.findMany.mockResolvedValue(mockData);
      mockPrismaClient.reportTemplate.count.mockResolvedValue(1);

      const result = await service.list(baseParams);

      expect(result).toEqual({
        data: mockData,
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should return cached results when available', async () => {
      const cached = { data: [], total: 0 };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await service.list(baseParams);

      expect(result).toEqual(cached);
      expect(mockPrismaClient.reportTemplate.findMany).not.toHaveBeenCalled();
    });

    it('should apply search filter across name, description, and category', async () => {
      mockPrismaClient.reportTemplate.findMany.mockResolvedValue([]);
      mockPrismaClient.reportTemplate.count.mockResolvedValue(0);

      await service.list({ ...baseParams, search: 'finance' });

      expect(mockPrismaClient.reportTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'finance', mode: 'insensitive' } },
              { description: { contains: 'finance', mode: 'insensitive' } },
              { category: { contains: 'finance', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should filter by category', async () => {
      mockPrismaClient.reportTemplate.findMany.mockResolvedValue([]);
      mockPrismaClient.reportTemplate.count.mockResolvedValue(0);

      await service.list({ ...baseParams, category: 'quarterly' });

      expect(mockPrismaClient.reportTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'quarterly' }),
        }),
      );
    });

    it('should filter by isPremium', async () => {
      mockPrismaClient.reportTemplate.findMany.mockResolvedValue([]);
      mockPrismaClient.reportTemplate.count.mockResolvedValue(0);

      await service.list({ ...baseParams, isPremium: false });

      expect(mockPrismaClient.reportTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isPremium: false }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getById()
  // ---------------------------------------------------------------------------
  describe('getById()', () => {
    it('should return template when found', async () => {
      const template = { id: 'tpl-1', name: 'Monthly Report', category: 'finance' };
      mockPrismaClient.reportTemplate.findUnique.mockResolvedValue(template);

      const result = await service.getById('tpl-1');

      expect(result).toEqual(template);
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should return cached template', async () => {
      const cached = { id: 'tpl-1', name: 'Cached' };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await service.getById('tpl-1');

      expect(result).toEqual(cached);
      expect(mockPrismaClient.reportTemplate.findUnique).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when template does not exist', async () => {
      mockPrismaClient.reportTemplate.findUnique.mockResolvedValue(null);

      await expect(service.getById('non-existent')).rejects.toThrow(
        "ReportTemplate with id 'non-existent' not found",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------
  describe('create()', () => {
    it('should create a template with tenantId and createdBy', async () => {
      const input = {
        name: 'New Template',
        category: 'hr',
        tenantId: 'tenant-1',
        userId: 'user-1',
      };
      const created = { id: 'tpl-new', ...input, createdBy: 'user-1' };
      mockPrismaClient.reportTemplate.create.mockResolvedValue(created);

      const result = await service.create(input);

      expect(result).toEqual(created);
      expect(mockPrismaClient.reportTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          createdBy: 'user-1',
        }),
      });
      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should use createdBy fallback when userId is not provided', async () => {
      const input = {
        name: 'Template',
        tenantId: 'tenant-1',
        createdBy: 'creator-1',
      };
      const created = { id: 'tpl-new', ...input };
      mockPrismaClient.reportTemplate.create.mockResolvedValue(created);

      await service.create(input);

      expect(mockPrismaClient.reportTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          createdBy: 'creator-1',
        }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // update()
  // ---------------------------------------------------------------------------
  describe('update()', () => {
    it('should update an existing template', async () => {
      const existing = { id: 'tpl-1', name: 'Old Name' };
      mockPrismaClient.reportTemplate.findUnique.mockResolvedValue(existing);
      const updated = { ...existing, name: 'New Name' };
      mockPrismaClient.reportTemplate.update.mockResolvedValue(updated);

      const result = await service.update('tpl-1', { name: 'New Name' });

      expect(result.name).toBe('New Name');
      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should throw NotFoundError when updating non-existent template', async () => {
      mockPrismaClient.reportTemplate.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', { name: 'X' })).rejects.toThrow('not found');
    });
  });

  // ---------------------------------------------------------------------------
  // remove()
  // ---------------------------------------------------------------------------
  describe('remove()', () => {
    it('should delete an existing template', async () => {
      const existing = { id: 'tpl-1' };
      mockPrismaClient.reportTemplate.findUnique.mockResolvedValue(existing);
      mockPrismaClient.reportTemplate.delete.mockResolvedValue(existing);

      const result = await service.remove('tpl-1');

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaClient.reportTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } });
    });

    it('should throw NotFoundError when removing non-existent template', async () => {
      mockPrismaClient.reportTemplate.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-id')).rejects.toThrow('not found');
    });
  });

  // ---------------------------------------------------------------------------
  // saveReportAsTemplate()
  // ---------------------------------------------------------------------------
  describe('saveReportAsTemplate()', () => {
    it('should create a template from an existing report', async () => {
      const report = {
        id: 'rpt-1',
        name: 'Quarterly Sales',
        html: '<h1>Sales</h1>',
        variables: { region: 'string' },
        config: { layout: 'portrait' },
        layoutData: { margin: 10 },
        dataBindings: { ds: 'dataset-1' },
      };
      mockPrismaClient.report.findUnique.mockResolvedValue(report);

      const templateRecord = {
        id: 'tpl-new',
        name: 'Sales Template',
        category: 'sales',
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      };
      mockPrismaClient.reportTemplate.create.mockResolvedValue(templateRecord);

      const result = await service.saveReportAsTemplate(
        'rpt-1',
        'Sales Template',
        'sales',
        'user-1',
        'tenant-1',
      );

      expect(result).toEqual(templateRecord);
      expect(mockPrismaClient.reportTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Sales Template',
          category: 'sales',
          tenantId: 'tenant-1',
          createdBy: 'user-1',
          updatedBy: 'user-1',
          html: '<h1>Sales</h1>',
          variables: { region: 'string' },
          templateConfig: { layout: 'portrait' },
          status: 'draft',
          version: 1,
          isPublic: false,
          isPremium: false,
          isSystem: false,
          supportedOutputFormats: ['pdf', 'html', 'docx'],
        }),
      });
    });

    it('should throw NotFoundError when source report does not exist', async () => {
      mockPrismaClient.report.findUnique.mockResolvedValue(null);

      await expect(
        service.saveReportAsTemplate('bad-id', 'Name', 'cat', 'user-1', 'tenant-1'),
      ).rejects.toThrow("Report with id 'bad-id' not found");
    });
  });

  // ---------------------------------------------------------------------------
  // getPreview()
  // ---------------------------------------------------------------------------
  describe('getPreview()', () => {
    it('should return rendered preview HTML with sample variable substitution', async () => {
      const template = {
        id: 'tpl-1',
        name: 'Sales Report',
        category: 'finance',
        html: '<h1>{{ title }}</h1><p>{{ subtitle }}</p>',
        variables: { title: 'string', subtitle: 'string' },
        layoutData: { margin: 10 },
        templateConfig: { orientation: 'portrait' },
        supportedOutputFormats: ['pdf', 'html'],
      };
      mockPrismaClient.reportTemplate.findUnique.mockResolvedValue(template);

      const result = await service.getPreview('tpl-1');

      expect(result.id).toBe('tpl-1');
      expect(result.name).toBe('Sales Report');
      expect(result.renderedHtml).toBe('<h1>[Sample title]</h1><p>[Sample subtitle]</p>');
      expect(result.sampleData).toEqual({ title: '[Sample title]', subtitle: '[Sample subtitle]' });
      expect(result.supportedOutputFormats).toEqual(['pdf', 'html']);
    });

    it('should handle templates with no variables', async () => {
      const template = {
        id: 'tpl-2',
        name: 'Static Template',
        category: 'general',
        html: '<p>No variables here</p>',
        variables: {},
        layoutData: {},
        templateConfig: {},
        supportedOutputFormats: ['pdf'],
      };
      mockPrismaClient.reportTemplate.findUnique.mockResolvedValue(template);

      const result = await service.getPreview('tpl-2');

      expect(result.renderedHtml).toBe('<p>No variables here</p>');
      expect(result.sampleData).toEqual({});
    });

    it('should throw NotFoundError when template does not exist', async () => {
      mockPrismaClient.reportTemplate.findUnique.mockResolvedValue(null);

      await expect(service.getPreview('bad-id')).rejects.toThrow('not found');
    });
  });
});
