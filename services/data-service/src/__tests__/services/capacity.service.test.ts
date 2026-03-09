import '../__mocks__/redis';
import { prisma } from '../__mocks__/prisma';

import { CapacityService } from '../../services/capacity.service';
import { NotFoundError } from '../../middleware/errorHandler';

describe('CapacityService', () => {
  let service: CapacityService;

  beforeEach(() => {
    service = new CapacityService();
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated results', async () => {
      const mockData = [
        { id: '1', totalBytes: BigInt(1000), tier: 'standard' },
      ];
      prisma.storageQuota.findMany.mockResolvedValue(mockData);
      prisma.storageQuota.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 10, sortOrder: 'desc' }) as any;

      expect(result.data).toEqual(mockData);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('filters by tier when provided', async () => {
      prisma.storageQuota.findMany.mockResolvedValue([]);
      prisma.storageQuota.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 10, sortOrder: 'asc', tier: 'premium' });

      expect(prisma.storageQuota.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tier: 'premium' }),
        })
      );
    });
  });

  describe('getById', () => {
    it('returns quota when found', async () => {
      const mockQuota = { id: 'test-id', totalBytes: BigInt(5000) };
      prisma.storageQuota.findUnique.mockResolvedValue(mockQuota);

      const result = await service.getById('test-id');
      expect(result).toEqual(mockQuota);
    });

    it('throws NotFoundError when not found', async () => {
      prisma.storageQuota.findUnique.mockResolvedValue(null);

      await expect(service.getById('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('create', () => {
    it('creates a new storage quota', async () => {
      const input = {
        organizationId: 'org-123',
        totalBytes: 1000000,
        maxDatasets: 100,
      };
      const mockCreated = { id: 'new-id', ...input, totalBytes: BigInt(1000000) };
      prisma.storageQuota.create.mockResolvedValue(mockCreated);

      const result = await service.create(input);
      expect(result).toEqual(mockCreated);
      expect(prisma.storageQuota.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organization: { connect: { id: 'org-123' } },
            totalBytes: BigInt(1000000),
            maxDatasets: 100,
          }),
        })
      );
    });
  });

  describe('update', () => {
    it('updates an existing quota', async () => {
      prisma.storageQuota.findUnique.mockResolvedValue({ id: 'test-id' });
      prisma.storageQuota.update.mockResolvedValue({ id: 'test-id', tier: 'premium' });

      const result = await service.update('test-id', { tier: 'premium' });
      expect(result.tier).toBe('premium');
    });
  });

  describe('delete', () => {
    it('deletes a quota', async () => {
      prisma.storageQuota.findUnique.mockResolvedValue({ id: 'test-id' });
      prisma.storageQuota.delete.mockResolvedValue({ id: 'test-id' });

      const result = await service.delete('test-id');
      expect(result.deleted).toBe(true);
    });
  });
});

describe('CapacityService — no fake code', () => {
  it('service source has no mock/placeholder patterns', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require.resolve('../../services/capacity.service'),
      'utf-8'
    );
    expect(source).not.toMatch(/Math\.random\(\)/);
    expect(source).not.toMatch(/sampleData/);
    expect(source).not.toMatch(/mockData/);
    expect(source).not.toMatch(/TODO/);
    expect(source).not.toMatch(/FIXME/);
    expect(source).not.toMatch(/placeholder/i);
  });
});
