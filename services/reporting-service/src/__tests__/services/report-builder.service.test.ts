import { mockPrismaClient } from '../mocks/prisma';
import { mockCacheDel } from '../mocks/redis';
import '../mocks/logger';
import '../mocks/redis';

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
}));

import { ReportBuilderService } from '../../services/report-builder.service';

describe('ReportBuilderService', () => {
  let service: ReportBuilderService;

  beforeEach(() => {
    service = new ReportBuilderService();
    jest.clearAllMocks();
  });

  it('buildReport fetches persisted dataset rows from data_rows and renders table content', async () => {
    mockPrismaClient.reportDefinition.findUnique.mockResolvedValue({
      id: 'report-1',
      config: {
        dataSources: [{ datasetId: 'dataset-1' }],
        sections: [
          {
            id: 'section-1',
            type: 'table',
            position: 0,
            content: {
              title: 'Dataset preview',
              datasetId: 'dataset-1',
              columns: ['report_date', 'region', 'revenue'],
            },
          },
        ],
        metadata: { buildCount: 0 },
      },
    });
    mockPrismaClient.reportDefinition.update.mockResolvedValue({});
    mockPrismaClient.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'dataset-1', name: 'Analysis dataset' }])
      .mockResolvedValueOnce([
        { data: { report_date: '2026-01-01', region: 'Riyadh', revenue: 1200 } },
        { data: { report_date: '2026-01-02', region: 'Jeddah', revenue: 980 } },
      ]);
    mockPrismaClient.reportBuildOutput.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'build-1',
      ...data,
      createdAt: new Date('2026-03-09T07:00:00.000Z'),
    }));

    const result = await service.buildReport('report-1');

    expect(mockPrismaClient.$queryRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'SELECT id, name FROM datasets WHERE id = $1 LIMIT 1',
      'dataset-1',
    );
    expect(mockPrismaClient.$queryRawUnsafe).toHaveBeenNthCalledWith(
      2,
      'SELECT data FROM data_rows WHERE dataset_id = $1 ORDER BY row_index ASC',
      'dataset-1',
    );
    expect(mockPrismaClient.reportBuildOutput.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fetchedData: expect.objectContaining({
            'dataset-1': expect.arrayContaining([
              expect.objectContaining({ region: 'Riyadh', revenue: 1200 }),
            ]),
          }),
        }),
      }),
    );
    expect(result.sectionCount).toBe(1);
    expect(result.renderedSections[0]).toEqual(
      expect.objectContaining({
        type: 'table',
        renderedContent: expect.objectContaining({
          totalRows: 2,
          headers: ['report_date', 'region', 'revenue'],
        }),
      }),
    );
    expect(mockCacheDel).toHaveBeenCalled();
  });
});
