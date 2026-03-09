import { mockPrismaClient } from '../mocks/prisma';
import { mockCacheDel } from '../mocks/redis';
import '../mocks/logger';
import '../mocks/redis';

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
}));

const cronTask = {
  start: jest.fn(),
  stop: jest.fn(),
};

jest.mock('node-cron', () => ({
  __esModule: true,
  default: {
    validate: jest.fn(() => true),
    schedule: jest.fn(() => cronTask),
  },
  validate: jest.fn(() => true),
  schedule: jest.fn(() => cronTask),
}));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({
      sendMail: jest.fn(),
      close: jest.fn(),
    })),
  },
}));

import { ScheduledReportsService } from '../../services/scheduled-reports.service';

describe('ScheduledReportsService', () => {
  let service: ScheduledReportsService;

  beforeEach(() => {
    service = new ScheduledReportsService();
    jest.clearAllMocks();
  });

  it('scheduleReport creates a runtime report row before persisting the schedule', async () => {
    mockPrismaClient.reportDefinition.findUnique.mockResolvedValue({
      id: 'report-1',
      name: 'Operations Weekly Report',
      description: 'Weekly report',
      config: {
        dataSources: [{ datasetId: 'dataset-1' }],
      },
    });
    mockPrismaClient.report.findUnique.mockResolvedValue(null);
    mockPrismaClient.report.create.mockResolvedValue({ id: 'report-1' });
    mockPrismaClient.reportSchedule.create.mockResolvedValue({
      id: 'schedule-1',
      reportId: 'report-1',
      cronExpression: '0 8 * * 1',
      recipients: ['ops@example.com'],
      format: 'PDF',
      status: 'active',
      createdBy: 'user-1',
      createdAt: new Date('2026-03-09T07:05:00.000Z'),
      nextRunAt: new Date('2026-03-10T08:00:00.000Z'),
    });

    const result = await service.scheduleReport(
      'report-1',
      '0 8 * * 1',
      ['ops@example.com'],
      'pdf',
      'tenant-1',
      'user-1',
    );

    expect(mockPrismaClient.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'report-1',
          tenantId: 'tenant-1',
          name: 'Operations Weekly Report',
        }),
      }),
    );
    expect(mockPrismaClient.reportSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: 'report-1',
          cronExpression: '0 8 * * 1',
        }),
      }),
    );
    expect(result.id).toBe('schedule-1');
    expect(result.reportId).toBe('report-1');
    expect(mockCacheDel).toHaveBeenCalled();
  });
});
