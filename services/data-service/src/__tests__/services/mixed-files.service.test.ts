import '../__mocks__/redis';
import { prisma } from '../__mocks__/prisma';

import { MixedFilesService } from '../../services/mixed-files.service';
import { NotFoundError } from '../../middleware/errorHandler';

describe('MixedFilesService', () => {
  let service: MixedFilesService;

  beforeEach(() => {
    service = new MixedFilesService();
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated file entries', async () => {
      prisma.mixedFileEntry.findMany.mockResolvedValue([
        { id: '1', fileName: 'test.xlsx', fileType: 'xlsx' },
      ]);
      prisma.mixedFileEntry.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 10, sortOrder: 'desc' });
      expect(result.data).toHaveLength(1);
    });

    it('filters by datasetId, fileType, and status', async () => {
      prisma.mixedFileEntry.findMany.mockResolvedValue([]);
      prisma.mixedFileEntry.count.mockResolvedValue(0);

      await service.list({
        page: 1, limit: 10, sortOrder: 'desc',
        datasetId: 'ds-1', fileType: 'pdf', status: 'pending',
      });

      expect(prisma.mixedFileEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            datasetId: 'ds-1', fileType: 'pdf', status: 'pending',
          }),
        })
      );
    });

    it('supports text search', async () => {
      prisma.mixedFileEntry.findMany.mockResolvedValue([]);
      prisma.mixedFileEntry.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 10, sortOrder: 'desc', search: 'invoice' });

      expect(prisma.mixedFileEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ fileName: expect.objectContaining({ contains: 'invoice' }) }),
            ]),
          }),
        })
      );
    });
  });

  describe('create', () => {
    it('creates a file entry with pending status', async () => {
      const input = {
        datasetId: 'ds-1',
        fileName: 'report.pdf',
        fileType: 'pdf',
        fileSize: 1048576,
        filePath: '/uploads/report.pdf',
      };
      prisma.mixedFileEntry.create.mockResolvedValue({
        id: 'new', ...input, fileSize: BigInt(1048576), status: 'pending',
      });

      const result = await service.create(input);
      expect(result.status).toBe('pending');
    });
  });

  describe('getById', () => {
    it('throws NotFoundError for missing entry', async () => {
      prisma.mixedFileEntry.findUnique.mockResolvedValue(null);
      await expect(service.getById('x')).rejects.toThrow('not found');
    });
  });

  describe('delete', () => {
    it('deletes a file entry', async () => {
      prisma.mixedFileEntry.findUnique.mockResolvedValue({ id: 'f1' });
      prisma.mixedFileEntry.delete.mockResolvedValue({ id: 'f1' });

      const result = await service.delete('f1');
      expect(result.deleted).toBe(true);
    });
  });
});

describe('MixedFilesService — no fake code', () => {
  it('source has no mock/placeholder patterns', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../../services/mixed-files.service'), 'utf-8');
    expect(source).not.toMatch(/Math\.random\(\)|sampleData|mockData|TODO|FIXME/);
  });
});
