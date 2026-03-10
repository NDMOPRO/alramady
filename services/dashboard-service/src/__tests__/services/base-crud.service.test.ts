import '../setup';
import { BaseCrudService, ListParams } from '../../services/base/base-crud.service';
import { mockPrisma } from '../helpers/mock-prisma';
import { cacheGet, cacheSet, cacheDel } from '../../utils/redis';
import { NotFoundError } from '../../middleware/errorHandler';

// Concrete implementation for testing
class TestService extends BaseCrudService {
  protected readonly modelName = 'dashboardEasyMode';
  protected readonly entityLabel = 'TestEntity';
  protected readonly cachePrefix = 'test:entity';
  protected readonly cacheTtl = 300;

  protected buildSearchWhere(search: string) {
    return {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  protected buildFilterWhere(params: ListParams) {
    const where: Record<string, unknown> = {};
    if (params.category) where.category = params.category;
    return where;
  }
}

describe('BaseCrudService', () => {
  let service: TestService;

  beforeEach(() => {
    service = new TestService();
  });

  describe('list', () => {
    it('should return paginated results', async () => {
      const mockData = [{ id: '1', name: 'Test' }];
      mockPrisma.dashboardEasyMode.findMany.mockResolvedValue(mockData);
      mockPrisma.dashboardEasyMode.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 20, sortOrder: 'desc' });

      expect(result.data).toEqual(mockData);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should return cached results if available', async () => {
      const cachedResult = { data: [{ id: '1' }], total: 1, page: 1, limit: 20, totalPages: 1 };
      (cacheGet as jest.Mock).mockResolvedValueOnce(cachedResult);

      const result = await service.list({ page: 1, limit: 20, sortOrder: 'desc' });

      expect(result).toEqual(cachedResult);
      expect(mockPrisma.dashboardEasyMode.findMany).not.toHaveBeenCalled();
    });

    it('should apply search filter', async () => {
      mockPrisma.dashboardEasyMode.findMany.mockResolvedValue([]);
      mockPrisma.dashboardEasyMode.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 20, sortOrder: 'desc', search: 'test' });

      expect(mockPrisma.dashboardEasyMode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ name: { contains: 'test', mode: 'insensitive' } }],
          }),
        }),
      );
    });

    it('should apply custom filter', async () => {
      mockPrisma.dashboardEasyMode.findMany.mockResolvedValue([]);
      mockPrisma.dashboardEasyMode.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 20, sortOrder: 'desc', category: 'analytics' });

      expect(mockPrisma.dashboardEasyMode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'analytics' }),
        }),
      );
    });

    it('should calculate correct pagination', async () => {
      mockPrisma.dashboardEasyMode.findMany.mockResolvedValue([]);
      mockPrisma.dashboardEasyMode.count.mockResolvedValue(55);

      const result = await service.list({ page: 2, limit: 20, sortOrder: 'desc' });

      expect(result.totalPages).toBe(3);
      expect(mockPrisma.dashboardEasyMode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
    });
  });

  describe('getById', () => {
    it('should return record by id', async () => {
      const mockRecord = { id: '1', name: 'Test' };
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(mockRecord);

      const result = await service.getById('1');

      expect(result).toEqual(mockRecord);
      expect(cacheSet).toHaveBeenCalledWith('test:entity:1', mockRecord, 300);
    });

    it('should throw NotFoundError when record not found', async () => {
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(null);

      await expect(service.getById('nonexistent')).rejects.toThrow(
        "TestEntity with id 'nonexistent' not found"
      );
    });

    it('should return cached result if available', async () => {
      const cached = { id: '1', name: 'Cached' };
      (cacheGet as jest.Mock).mockResolvedValueOnce(cached);

      const result = await service.getById('1');

      expect(result).toEqual(cached);
      expect(mockPrisma.dashboardEasyMode.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create record and invalidate list cache', async () => {
      const input = { name: 'New Record' };
      const created = { id: '1', ...input, createdAt: new Date(), updatedAt: new Date() };
      mockPrisma.dashboardEasyMode.create.mockResolvedValue(created);

      const result = await service.create(input);

      expect(result).toEqual(created);
      expect(cacheDel).toHaveBeenCalledWith('test:entity:list:*');
    });
  });

  describe('update', () => {
    it('should update existing record', async () => {
      const existing = { id: '1', name: 'Old' };
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(existing);
      mockPrisma.dashboardEasyMode.update.mockResolvedValue({ ...existing, name: 'Updated' });

      const result = await service.update('1', { name: 'Updated' });

      expect((result as any).name).toBe('Updated');
      expect(cacheDel).toHaveBeenCalledWith('test:entity:1');
      expect(cacheDel).toHaveBeenCalledWith('test:entity:list:*');
    });

    it('should throw NotFoundError for non-existent record', async () => {
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow(
        "TestEntity with id 'nonexistent' not found"
      );
    });
  });

  describe('remove', () => {
    it('should delete record and return confirmation', async () => {
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue({ id: '1' });
      mockPrisma.dashboardEasyMode.delete.mockResolvedValue({ id: '1' });

      const result = await service.remove('1');

      expect(result).toEqual({ deleted: true });
    });
  });

  describe('duplicate', () => {
    it('should create copy with modified name', async () => {
      const source = { id: '1', name: 'Original', description: 'desc', createdAt: new Date(), updatedAt: new Date() };
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(source);
      mockPrisma.dashboardEasyMode.create.mockImplementation((args: any) => Promise.resolve({ id: '2', ...args.data }));

      const result = await service.duplicate('1') as any;

      expect(result.name).toBe('Original (Copy)');
      expect(mockPrisma.dashboardEasyMode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Original (Copy)' }),
        }),
      );
    });
  });
});
