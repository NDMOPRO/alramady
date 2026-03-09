import '../__mocks__/redis';
import { prisma } from '../__mocks__/prisma';

import { TablesService } from '../../services/tables.service';
import { NotFoundError } from '../../middleware/errorHandler';

describe('TablesService', () => {
  let service: TablesService;

  beforeEach(() => {
    service = new TablesService();
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated table views', async () => {
      prisma.tableView.findMany.mockResolvedValue([{ id: '1', name: 'main' }]);
      prisma.tableView.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 10, sortOrder: 'desc' }) as any;
      expect(result.data).toHaveLength(1);
      expect(result.totalPages).toBe(1);
    });

    it('filters by viewType', async () => {
      prisma.tableView.findMany.mockResolvedValue([]);
      prisma.tableView.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 10, sortOrder: 'desc', viewType: 'pivot' });

      expect(prisma.tableView.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ viewType: 'pivot' }),
        })
      );
    });
  });

  describe('create', () => {
    it('creates a table view with pivot config', async () => {
      const input = {
        datasetId: 'ds-1',
        name: 'Sales Pivot',
        viewType: 'pivot',
        pivotConfig: { rows: ['region'], cols: ['year'], values: ['revenue'] },
      };
      prisma.tableView.create.mockResolvedValue({ id: 'new', ...input });

      const result = await service.create(input);
      expect(result.name).toBe('Sales Pivot');
    });
  });

  describe('update', () => {
    it('updates view configuration', async () => {
      prisma.tableView.findUnique.mockResolvedValue({ id: 'v1' });
      prisma.tableView.update.mockResolvedValue({ id: 'v1', isShared: true });

      const result = await service.update('v1', { isShared: true });
      expect(result.isShared).toBe(true);
    });
  });

  describe('getById', () => {
    it('throws NotFoundError for missing view', async () => {
      prisma.tableView.findUnique.mockResolvedValue(null);
      await expect(service.getById('x')).rejects.toThrow('not found');
    });
  });

  describe('delete', () => {
    it('deletes a view', async () => {
      prisma.tableView.findUnique.mockResolvedValue({ id: 'v1' });
      prisma.tableView.delete.mockResolvedValue({ id: 'v1' });

      const result = await service.delete('v1');
      expect(result.deleted).toBe(true);
    });
  });
});

describe('TablesService — no fake code', () => {
  it('source has no mock/placeholder patterns', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../../services/tables.service'), 'utf-8');
    expect(source).not.toMatch(/Math\.random\(\)|sampleData|mockData|TODO|FIXME/);
  });
});
