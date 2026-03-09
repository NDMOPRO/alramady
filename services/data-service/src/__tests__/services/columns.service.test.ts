import '../__mocks__/redis';
import { prisma } from '../__mocks__/prisma';

import { ColumnsService } from '../../services/columns.service';
import { NotFoundError } from '../../middleware/errorHandler';

describe('ColumnsService', () => {
  let service: ColumnsService;

  beforeEach(() => {
    service = new ColumnsService();
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated columns', async () => {
      prisma.datasetColumn.findMany.mockResolvedValue([{ id: '1', name: 'col_a' }]);
      prisma.datasetColumn.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 20, sortOrder: 'asc' });
      expect(result.data).toHaveLength(1);
    });

    it('filters by datasetId and dataType', async () => {
      prisma.datasetColumn.findMany.mockResolvedValue([]);
      prisma.datasetColumn.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 10, sortOrder: 'asc', datasetId: 'ds-1', dataType: 'number' });

      expect(prisma.datasetColumn.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ datasetId: 'ds-1', dataType: 'number' }),
        })
      );
    });
  });

  describe('create', () => {
    it('creates a column with all metadata fields', async () => {
      const input = {
        datasetId: 'ds-1',
        name: 'revenue',
        dataType: 'number',
        inferredType: 'currency',
        displayOrder: 3,
        isVisible: true,
        isRequired: true,
        isPrimaryKey: false,
        format: '#,##0.00',
      };
      prisma.datasetColumn.create.mockResolvedValue({ id: 'new', ...input });

      const result = await service.create(input);
      expect(result.name).toBe('revenue');
      expect(prisma.datasetColumn.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dataset: { connect: { id: 'ds-1' } },
            name: 'revenue',
            dataType: 'number',
          }),
        })
      );
    });
  });

  describe('update', () => {
    it('updates column properties', async () => {
      prisma.datasetColumn.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.datasetColumn.update.mockResolvedValue({ id: 'c1', isVisible: false });

      const result = await service.update('c1', { isVisible: false });
      expect(result.isVisible).toBe(false);
    });
  });

  describe('getById', () => {
    it('throws NotFoundError for missing column', async () => {
      prisma.datasetColumn.findUnique.mockResolvedValue(null);
      await expect(service.getById('x')).rejects.toThrow('not found');
    });
  });
});

describe('ColumnsService — no fake code', () => {
  it('source has no mock/placeholder patterns', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../../services/columns.service'), 'utf-8');
    expect(source).not.toMatch(/Math\.random\(\)|sampleData|mockData|TODO|FIXME/);
  });
});
