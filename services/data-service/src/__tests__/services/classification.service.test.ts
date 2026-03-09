import '../__mocks__/redis';
import { prisma } from '../__mocks__/prisma';

import { ClassificationService } from '../../services/classification.service';
import { NotFoundError } from '../../middleware/errorHandler';

describe('ClassificationService', () => {
  let service: ClassificationService;

  beforeEach(() => {
    service = new ClassificationService();
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated results', async () => {
      const mockData = [{ id: '1', fileName: 'test.xlsx', classifiedType: 'financial' }];
      prisma.fileClassification.findMany.mockResolvedValue(mockData);
      prisma.fileClassification.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 10, sortOrder: 'desc' });
      expect(result.data).toEqual(mockData);
      expect(result.total).toBe(1);
    });

    it('filters by fileType and classifiedType', async () => {
      prisma.fileClassification.findMany.mockResolvedValue([]);
      prisma.fileClassification.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 10, sortOrder: 'desc', fileType: 'xlsx', classifiedType: 'sales' });

      expect(prisma.fileClassification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ fileType: 'xlsx', classifiedType: 'sales' }),
        })
      );
    });

    it('supports text search across fileName and classifiedType', async () => {
      prisma.fileClassification.findMany.mockResolvedValue([]);
      prisma.fileClassification.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 10, sortOrder: 'desc', search: 'report' });

      expect(prisma.fileClassification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ fileName: expect.objectContaining({ contains: 'report' }) }),
            ]),
          }),
        })
      );
    });
  });

  describe('getById', () => {
    it('throws NotFoundError when not found', async () => {
      prisma.fileClassification.findUnique.mockResolvedValue(null);
      await expect(service.getById('x')).rejects.toThrow('not found');
    });
  });

  describe('create', () => {
    it('creates a file classification record', async () => {
      const input = {
        fileName: 'sales_2024.xlsx',
        fileType: 'xlsx',
        fileSize: 524288,
        classifiedType: 'sales',
        confidence: 0.95,
      };
      prisma.fileClassification.create.mockResolvedValue({ id: 'new', ...input, fileSize: BigInt(524288) });

      const result = await service.create(input);
      expect(result.fileName).toBe('sales_2024.xlsx');
      expect(prisma.fileClassification.create).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes a classification', async () => {
      prisma.fileClassification.findUnique.mockResolvedValue({ id: 'test' });
      prisma.fileClassification.delete.mockResolvedValue({ id: 'test' });

      const result = await service.delete('test');
      expect(result.deleted).toBe(true);
    });
  });
});

describe('ClassificationService — no fake code', () => {
  it('source has no mock/placeholder patterns', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../../services/classification.service'), 'utf-8');
    expect(source).not.toMatch(/Math\.random\(\)/);
    expect(source).not.toMatch(/sampleData|mockData|TODO|FIXME/);
  });
});
