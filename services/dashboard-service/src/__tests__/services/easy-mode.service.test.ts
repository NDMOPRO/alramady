import '../setup';
import { EasyModeService } from '../../services/easy-mode.service';
import { mockPrisma } from '../helpers/mock-prisma';
import { buildEasyMode, buildListParams } from '../helpers/factories';
import { NotFoundError } from '../../middleware/errorHandler';

describe('EasyModeService', () => {
  let service: EasyModeService;

  beforeEach(() => {
    service = new EasyModeService();
  });

  describe('list', () => {
    it('should list easy-mode dashboards with pagination', async () => {
      const dashboards = [buildEasyMode(), buildEasyMode()];
      mockPrisma.dashboardEasyMode.findMany.mockResolvedValue(dashboards);
      mockPrisma.dashboardEasyMode.count.mockResolvedValue(2);

      const result = await service.list(buildListParams());

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by dashboardType', async () => {
      mockPrisma.dashboardEasyMode.findMany.mockResolvedValue([]);
      mockPrisma.dashboardEasyMode.count.mockResolvedValue(0);

      await service.list(buildListParams({ dashboardType: 'analytics' }));

      expect(mockPrisma.dashboardEasyMode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ dashboardType: 'analytics' }),
        }),
      );
    });

    it('should apply search across name and description', async () => {
      mockPrisma.dashboardEasyMode.findMany.mockResolvedValue([]);
      mockPrisma.dashboardEasyMode.count.mockResolvedValue(0);

      await service.list(buildListParams({ search: 'revenue' }));

      expect(mockPrisma.dashboardEasyMode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'revenue', mode: 'insensitive' } },
              { description: { contains: 'revenue', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });
  });

  describe('getById', () => {
    it('should return dashboard by id', async () => {
      const dashboard = buildEasyMode({ id: 'abc-123' });
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(dashboard);

      const result = await service.getById('abc-123');

      expect(result).toEqual(dashboard);
    });

    it('should throw NotFoundError for missing id', async () => {
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toThrow(
        "DashboardEasyMode with id 'missing' not found"
      );
    });
  });

  describe('create', () => {
    it('should create a new dashboard', async () => {
      const input = { name: 'Sales Dashboard', dashboardType: 'standard' };
      const created = buildEasyMode(input);
      mockPrisma.dashboardEasyMode.create.mockResolvedValue(created);

      const result = await service.create(input);

      expect(result.name).toBe('Sales Dashboard');
    });
  });

  describe('update', () => {
    it('should update an existing dashboard', async () => {
      const existing = buildEasyMode({ id: 'abc-123' });
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(existing);
      mockPrisma.dashboardEasyMode.update.mockResolvedValue({ ...existing, name: 'Updated' });

      const result = await service.update('abc-123', { name: 'Updated' }) as any;

      expect(result.name).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should delete dashboard and return confirmation', async () => {
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(buildEasyMode({ id: '1' }));
      mockPrisma.dashboardEasyMode.delete.mockResolvedValue({ id: '1' });

      const result = await service.remove('1');

      expect(result.deleted).toBe(true);
    });
  });

  describe('duplicate', () => {
    it('should create a copy with (Copy) suffix', async () => {
      const source = buildEasyMode({ id: '1', name: 'Original' });
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(source);
      mockPrisma.dashboardEasyMode.create.mockImplementation((args: any) =>
        Promise.resolve({ id: '2', ...args.data }),
      );

      const result = await service.duplicate('1') as any;

      expect(result.name).toBe('Original (Copy)');
    });
  });

  describe('publish', () => {
    it('should set isPublic to true', async () => {
      const updated = buildEasyMode({ id: '1', isPublic: true });
      mockPrisma.dashboardEasyMode.update.mockResolvedValue(updated);

      const result = await service.publish('1') as any;

      expect(result.isPublic).toBe(true);
      expect(mockPrisma.dashboardEasyMode.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isPublic: true },
      });
    });
  });
});
