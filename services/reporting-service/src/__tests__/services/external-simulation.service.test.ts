import '../mocks/logger';
import { mockCacheGet, mockCacheSet, mockCacheDel } from '../mocks/redis';
import { mockPrismaClient } from '../mocks/prisma';

import { ReportExternalSimulationService } from '../../services/external-simulation.service';

describe('ReportExternalSimulationService', () => {
  let service: ReportExternalSimulationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportExternalSimulationService();
  });

  // ---------------------------------------------------------------------------
  // list()
  // ---------------------------------------------------------------------------
  describe('list()', () => {
    const baseParams = { page: 1, limit: 10, sortOrder: 'desc' as const };

    it('should return paginated results', async () => {
      const mockData = [{ id: 'sim-1', name: 'Sim A' }];
      mockPrismaClient.reportExternalSimulation.findMany.mockResolvedValue(mockData);
      mockPrismaClient.reportExternalSimulation.count.mockResolvedValue(1);

      const result = await service.list(baseParams);

      expect(result).toEqual({
        data: mockData,
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should return cached results when available', async () => {
      const cached = { data: [], total: 0 };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await service.list(baseParams);

      expect(result).toEqual(cached);
      expect(mockPrismaClient.reportExternalSimulation.findMany).not.toHaveBeenCalled();
    });

    it('should apply search, reportId, simulationType, and status filters', async () => {
      mockPrismaClient.reportExternalSimulation.findMany.mockResolvedValue([]);
      mockPrismaClient.reportExternalSimulation.count.mockResolvedValue(0);

      await service.list({
        ...baseParams,
        search: 'quarterly',
        reportId: 'rpt-1',
        simulationType: 'analysis',
        status: 'completed',
      });

      expect(mockPrismaClient.reportExternalSimulation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reportId: 'rpt-1',
            simulationType: 'analysis',
            status: 'completed',
            OR: expect.arrayContaining([
              { name: { contains: 'quarterly', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getById()
  // ---------------------------------------------------------------------------
  describe('getById()', () => {
    it('should return simulation when found', async () => {
      const record = { id: 'sim-1', name: 'Sim A', status: 'pending' };
      mockPrismaClient.reportExternalSimulation.findUnique.mockResolvedValue(record);

      const result = await service.getById('sim-1');

      expect(result).toEqual(record);
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should return cached simulation', async () => {
      const cached = { id: 'sim-1', name: 'Cached' };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await service.getById('sim-1');

      expect(result).toEqual(cached);
      expect(mockPrismaClient.reportExternalSimulation.findUnique).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when simulation does not exist', async () => {
      mockPrismaClient.reportExternalSimulation.findUnique.mockResolvedValue(null);

      await expect(service.getById('non-existent')).rejects.toThrow(
        "ReportExternalSimulation with id 'non-existent' not found",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------
  describe('create()', () => {
    it('should create a simulation with status pending', async () => {
      const input = {
        name: 'New Simulation',
        simulationType: 'comparison',
        userId: 'user-1',
      };
      const created = { id: 'sim-new', ...input, status: 'pending', createdBy: 'user-1' };
      mockPrismaClient.reportExternalSimulation.create.mockResolvedValue(created);

      const result = await service.create(input);

      expect(result).toEqual(created);
      expect(mockPrismaClient.reportExternalSimulation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'pending',
          createdBy: 'user-1',
        }),
      });
      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // update()
  // ---------------------------------------------------------------------------
  describe('update()', () => {
    it('should update an existing simulation', async () => {
      const existing = { id: 'sim-1', name: 'Old' };
      mockPrismaClient.reportExternalSimulation.findUnique.mockResolvedValue(existing);
      const updated = { ...existing, name: 'Updated' };
      mockPrismaClient.reportExternalSimulation.update.mockResolvedValue(updated);

      const result = await service.update('sim-1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should throw NotFoundError when updating non-existent simulation', async () => {
      mockPrismaClient.reportExternalSimulation.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', {})).rejects.toThrow('not found');
    });
  });

  // ---------------------------------------------------------------------------
  // remove()
  // ---------------------------------------------------------------------------
  describe('remove()', () => {
    it('should delete an existing simulation', async () => {
      const existing = { id: 'sim-1' };
      mockPrismaClient.reportExternalSimulation.findUnique.mockResolvedValue(existing);
      mockPrismaClient.reportExternalSimulation.delete.mockResolvedValue(existing);

      const result = await service.remove('sim-1');

      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundError when removing non-existent simulation', async () => {
      mockPrismaClient.reportExternalSimulation.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-id')).rejects.toThrow('not found');
    });
  });

  // ---------------------------------------------------------------------------
  // analyzeExternalReport()
  // ---------------------------------------------------------------------------
  describe('analyzeExternalReport()', () => {
    it('should parse external content and create a record with analyzed status', async () => {
      const input = {
        sourceUrl: 'https://example.com/report.pdf',
        name: 'External Q4 Report',
        description: 'Quarterly report analysis',
        simulationType: 'structure_extraction',
        createdBy: 'user-1',
        metadata: { source: 'competitor' },
      };
      const created = {
        id: 'sim-new',
        name: input.name,
        status: 'analyzed',
        resultData: {
          sourceUrl: input.sourceUrl,
          analyzedAt: expect.any(String),
          sections: [],
          detectedFormat: 'pdf',
          extractionStatus: 'completed',
        },
      };
      mockPrismaClient.reportExternalSimulation.create.mockResolvedValue(created);

      const result = await service.analyzeExternalReport(input);

      expect(result).toEqual(created);
      expect(mockPrismaClient.reportExternalSimulation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'External Q4 Report',
          status: 'analyzed',
          simulationType: 'structure_extraction',
          createdBy: 'user-1',
          externalSourceUrl: 'https://example.com/report.pdf',
        }),
      });
    });

    it('should detect HTML format for non-pdf URLs', async () => {
      const input = {
        sourceUrl: 'https://example.com/report.html',
        name: 'HTML Report',
        simulationType: 'analysis',
        createdBy: 'user-1',
      };
      mockPrismaClient.reportExternalSimulation.create.mockResolvedValue({ id: 'sim-new' });

      await service.analyzeExternalReport(input);

      expect(mockPrismaClient.reportExternalSimulation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resultData: expect.objectContaining({
            detectedFormat: 'html',
          }),
        }),
      });
    });

    it('should set sourceType to internal when no sourceUrl is provided', async () => {
      const input = {
        reportId: 'rpt-1',
        name: 'Internal Sim',
        simulationType: 'comparison',
        createdBy: 'user-1',
      };
      mockPrismaClient.reportExternalSimulation.create.mockResolvedValue({ id: 'sim-new' });

      await service.analyzeExternalReport(input);

      expect(mockPrismaClient.reportExternalSimulation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scenarioConfig: expect.objectContaining({
            sourceType: 'internal',
          }),
        }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // reproduceReport()
  // ---------------------------------------------------------------------------
  describe('reproduceReport()', () => {
    it('should reproduce a report from analysis and update status', async () => {
      const simulation = {
        id: 'sim-1',
        name: 'External Report',
        status: 'analyzed',
        externalSourceUrl: 'https://example.com/report.pdf',
        resultData: { sections: ['intro'] },
        inputParameters: { format: 'pdf' },
      };
      mockPrismaClient.reportExternalSimulation.findUnique.mockResolvedValue(simulation);

      // First update sets status to 'reproducing'
      mockPrismaClient.reportExternalSimulation.update
        .mockResolvedValueOnce({ ...simulation, status: 'reproducing' })
        // Second update sets status to 'reproduced' with comparison result
        .mockResolvedValueOnce({
          ...simulation,
          status: 'reproduced',
          comparisonResult: expect.any(Object),
        });

      const result = await service.reproduceReport('sim-1');

      expect(mockPrismaClient.reportExternalSimulation.update).toHaveBeenCalledTimes(2);

      // First call: set status to reproducing
      expect(mockPrismaClient.reportExternalSimulation.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'sim-1' },
        data: { status: 'reproducing' },
      });

      // Second call: set status to reproduced with comparisonResult
      expect(mockPrismaClient.reportExternalSimulation.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'sim-1' },
        data: expect.objectContaining({
          status: 'reproduced',
          comparisonResult: expect.objectContaining({
            originalSource: 'https://example.com/report.pdf',
            matchScore: expect.any(Number),
            status: 'completed',
          }),
        }),
      });

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should throw NotFoundError when simulation does not exist', async () => {
      mockPrismaClient.reportExternalSimulation.findUnique.mockResolvedValue(null);

      await expect(service.reproduceReport('bad-id')).rejects.toThrow('not found');
    });
  });
});
