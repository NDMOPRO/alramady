import '../__mocks__/redis';
import { prisma } from '../__mocks__/prisma';

import { VisualProcessingService } from '../../services/visual-processing.service';
import { NotFoundError } from '../../middleware/errorHandler';

describe('VisualProcessingService', () => {
  let service: VisualProcessingService;

  beforeEach(() => {
    service = new VisualProcessingService();
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated processing jobs', async () => {
      prisma.visualProcessing.findMany.mockResolvedValue([{ id: '1', status: 'pending' }]);
      prisma.visualProcessing.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 10, sortOrder: 'desc' });
      expect(result.data).toHaveLength(1);
    });

    it('filters by status and processingType', async () => {
      prisma.visualProcessing.findMany.mockResolvedValue([]);
      prisma.visualProcessing.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 10, sortOrder: 'desc', status: 'completed', processingType: 'chart' });

      expect(prisma.visualProcessing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'completed', processingType: 'chart' }),
        })
      );
    });
  });

  describe('create', () => {
    it('creates a processing job with pending status', async () => {
      prisma.visualProcessing.create.mockResolvedValue({
        id: 'new', status: 'pending', processingType: 'chart',
      });

      const result = await service.create({
        datasetId: 'ds-1',
        processingType: 'chart',
        chartType: 'bar',
      });

      expect(result.status).toBe('pending');
      expect(prisma.visualProcessing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'pending' }),
        })
      );
    });
  });

  describe('update', () => {
    it('sets startedAt when status changes to processing', async () => {
      prisma.visualProcessing.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.visualProcessing.update.mockResolvedValue({ id: 'p1', status: 'processing' });

      await service.update('p1', { status: 'processing' });

      expect(prisma.visualProcessing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'processing',
            startedAt: expect.any(Date),
          }),
        })
      );
    });

    it('sets completedAt when status changes to completed', async () => {
      prisma.visualProcessing.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.visualProcessing.update.mockResolvedValue({ id: 'p1', status: 'completed' });

      await service.update('p1', { status: 'completed' });

      expect(prisma.visualProcessing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'completed',
            completedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('getById', () => {
    it('throws NotFoundError for missing job', async () => {
      prisma.visualProcessing.findUnique.mockResolvedValue(null);
      await expect(service.getById('x')).rejects.toThrow('not found');
    });
  });
});

describe('VisualProcessingService — no fake code', () => {
  it('source has no mock/placeholder patterns', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../../services/visual-processing.service'), 'utf-8');
    expect(source).not.toMatch(/Math\.random\(\)|sampleData|mockData|TODO|FIXME/);
  });
});
