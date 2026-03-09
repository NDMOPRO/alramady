import '../__mocks__/redis';
import { prisma } from '../__mocks__/prisma';

import { ReadingService } from '../../services/reading.service';
import { NotFoundError } from '../../middleware/errorHandler';

describe('ReadingService', () => {
  let service: ReadingService;

  beforeEach(() => {
    service = new ReadingService();
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated sessions', async () => {
      prisma.readingSession.findMany.mockResolvedValue([{ id: '1' }]);
      prisma.readingSession.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 10, sortOrder: 'desc' });
      expect(result.total).toBe(1);
    });

    it('filters by datasetId and isActive', async () => {
      prisma.readingSession.findMany.mockResolvedValue([]);
      prisma.readingSession.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 10, sortOrder: 'desc', datasetId: 'ds-1', isActive: true });

      expect(prisma.readingSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ datasetId: 'ds-1', isActive: true }),
        })
      );
    });
  });

  describe('getById', () => {
    it('throws NotFoundError when session not found', async () => {
      prisma.readingSession.findUnique.mockResolvedValue(null);
      await expect(service.getById('x')).rejects.toThrow('not found');
    });
  });

  describe('create', () => {
    it('creates a reading session with defaults', async () => {
      const mockSession = { id: 'new', isActive: true, currentPage: 1, pageSize: 50 };
      prisma.readingSession.create.mockResolvedValue(mockSession);

      const result = await service.create({ datasetId: 'ds-1', sessionType: 'browse' });
      expect(result.isActive).toBe(true);
      expect(result.currentPage).toBe(1);
    });
  });

  describe('update', () => {
    it('updates session filters and page', async () => {
      prisma.readingSession.findUnique.mockResolvedValue({ id: 'test' });
      prisma.readingSession.update.mockResolvedValue({ id: 'test', currentPage: 5, filters: { col: 'A' } });

      const result = await service.update('test', { currentPage: 5, filters: { col: 'A' } });
      expect(result.currentPage).toBe(5);
    });
  });

  describe('delete', () => {
    it('deletes a session', async () => {
      prisma.readingSession.findUnique.mockResolvedValue({ id: 'test' });
      prisma.readingSession.delete.mockResolvedValue({ id: 'test' });

      const result = await service.delete('test');
      expect(result.deleted).toBe(true);
    });
  });
});

describe('ReadingService — no fake code', () => {
  it('source has no mock/placeholder patterns', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../../services/reading.service'), 'utf-8');
    expect(source).not.toMatch(/Math\.random\(\)|sampleData|mockData|TODO|FIXME|placeholder/i);
  });
});
