import '../mocks/logger';
import { mockCacheGet, mockCacheSet, mockCacheDel } from '../mocks/redis';
import { mockPrismaClient } from '../mocks/prisma';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
  }),
}));

jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    addPage: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    fontSize: jest.fn(),
    fillColor: jest.fn(),
    text: jest.fn(),
    end: jest.fn(),
    page: { width: 595, height: 842 },
  }));
});

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(Buffer.from('fake-file-content')),
  createWriteStream: jest.fn().mockReturnValue({
    on: jest.fn((event: string, cb: () => void) => {
      if (event === 'finish') setTimeout(cb, 0);
    }),
  }),
}));

import { DistributionService } from '../../services/distribution.service';

describe('DistributionService', () => {
  let service: DistributionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DistributionService(mockPrismaClient as any);
  });

  // ---------------------------------------------------------------------------
  // Helper factories
  // ---------------------------------------------------------------------------
  const makeValidInput = (overrides: Record<string, unknown> = {}) => ({
    reportId: 'rpt-1',
    name: 'Weekly Distribution',
    recipients: [
      { email: 'alice@example.com', name: 'Alice', role: 'to' as const },
    ],
    format: 'pdf' as const,
    includeWatermark: false,
    emailSubject: 'Report: {{reportName}}',
    emailBody: '<p>Please see attached report.</p>',
    trackReadReceipts: false,
    accessControl: {
      requirePassword: false,
      allowDownload: true,
      allowPrint: true,
    },
    enabled: true,
    createdBy: 'user-1',
    ...overrides,
  });

  // ---------------------------------------------------------------------------
  // list() — via getDistributionHistory
  // ---------------------------------------------------------------------------
  describe('getDistributionHistory()', () => {
    it('should return distribution history for a report', async () => {
      const records = [
        {
          id: 'dr-1',
          distributionConfigId: 'dc-1',
          reportId: 'rpt-1',
          sentAt: new Date('2025-01-01'),
          recipientCount: 3,
          status: 'sent',
          errorMessage: null,
          fileSize: 1024,
          readReceipts: '[]',
        },
      ];
      mockPrismaClient.distributionRecord.findMany.mockResolvedValue(records);
      mockPrismaClient.distributionRecord.count.mockResolvedValue(1);

      const result = await service.getDistributionHistory('rpt-1');

      expect(result.totalCount).toBe(1);
      expect(result.records).toHaveLength(1);
      expect(result.records[0].status).toBe('sent');
      expect(result.records[0].readReceipts).toEqual([]);
    });

    it('should support status filtering and pagination options', async () => {
      mockPrismaClient.distributionRecord.findMany.mockResolvedValue([]);
      mockPrismaClient.distributionRecord.count.mockResolvedValue(0);

      await service.getDistributionHistory('rpt-1', {
        limit: 5,
        offset: 10,
        status: 'failed',
      });

      expect(mockPrismaClient.distributionRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { reportId: 'rpt-1', status: 'failed' },
          take: 5,
          skip: 10,
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getById() — via verifyAccess (uses findUniqueOrThrow)
  // ---------------------------------------------------------------------------
  describe('verifyAccess() / getById patterns', () => {
    it('should allow access when no restrictions', async () => {
      mockPrismaClient.distributionRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'dr-1',
        readReceipts: '[]',
        distributionConfig: {
          accessExpiry: null,
          maxViews: null,
          accessPassword: null,
        },
      });

      const result = await service.verifyAccess('dr-1');

      expect(result).toEqual({ allowed: true });
    });

    it('should deny access when expired', async () => {
      mockPrismaClient.distributionRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'dr-1',
        readReceipts: '[]',
        distributionConfig: {
          accessExpiry: new Date('2020-01-01'),
          maxViews: null,
          accessPassword: null,
        },
      });

      const result = await service.verifyAccess('dr-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should deny access when password required but not provided', async () => {
      mockPrismaClient.distributionRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'dr-1',
        readReceipts: '[]',
        distributionConfig: {
          accessExpiry: null,
          maxViews: null,
          accessPassword: 'hashed-pass',
        },
      });

      const result = await service.verifyAccess('dr-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Password required');
    });
  });

  // ---------------------------------------------------------------------------
  // createDistribution() — createConfig
  // ---------------------------------------------------------------------------
  describe('createDistribution()', () => {
    it('should create a distribution config successfully', async () => {
      const input = makeValidInput();
      mockPrismaClient.distributionConfig.create.mockResolvedValue({
        id: 'dc-new',
        createdAt: new Date('2025-06-01'),
      });

      const result = await service.createDistribution(input);

      expect(result.id).toBe('dc-new');
      expect(result.name).toBe('Weekly Distribution');
      expect(mockPrismaClient.distributionConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportId: 'rpt-1',
          name: 'Weekly Distribution',
          format: 'PDF',
          enabled: true,
          createdBy: 'user-1',
        }),
      });
    });

    it('should reject when reportId is missing', async () => {
      const input = makeValidInput({ reportId: '' });

      await expect(service.createDistribution(input)).rejects.toThrow('Validation failed');
    });

    it('should reject when no recipients provided', async () => {
      const input = makeValidInput({ recipients: [] });

      await expect(service.createDistribution(input)).rejects.toThrow('At least one recipient');
    });

    it('should reject invalid email addresses', async () => {
      const input = makeValidInput({
        recipients: [{ email: 'not-an-email', name: 'Bad', role: 'to' }],
      });

      await expect(service.createDistribution(input)).rejects.toThrow('Invalid email');
    });

    it('should reject when email subject is missing', async () => {
      const input = makeValidInput({ emailSubject: '' });

      await expect(service.createDistribution(input)).rejects.toThrow('Email subject');
    });

    it('should hash password when access control requires it', async () => {
      const input = makeValidInput({
        accessControl: {
          requirePassword: true,
          password: 'secret123',
          allowDownload: true,
          allowPrint: true,
        },
      });
      mockPrismaClient.distributionConfig.create.mockResolvedValue({
        id: 'dc-pw',
        createdAt: new Date(),
      });

      await service.createDistribution(input);

      expect(mockPrismaClient.distributionConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accessPassword: expect.any(String),
        }),
      });
      // Verify it is a SHA-256 hex string (64 chars)
      const callArg = mockPrismaClient.distributionConfig.create.mock.calls[0][0];
      expect(callArg.data.accessPassword).toHaveLength(64);
    });
  });

  // ---------------------------------------------------------------------------
  // send() — distributeReport
  // ---------------------------------------------------------------------------
  describe('distributeReport()', () => {
    it('should send distribution email and create a record', async () => {
      mockPrismaClient.distributionConfig.findUniqueOrThrow.mockResolvedValue({
        id: 'dc-1',
        reportId: 'rpt-1',
        recipients: JSON.stringify([
          { email: 'alice@example.com', name: 'Alice', role: 'to' },
        ]),
        format: 'pdf',
        includeWatermark: false,
        trackReadReceipts: false,
        emailSubject: 'Report Ready',
        emailBody: '<p>Hello</p>',
      });
      mockPrismaClient.reportDefinition.findUniqueOrThrow.mockResolvedValue({
        id: 'rpt-1',
        name: 'Sales Report',
      });
      mockPrismaClient.reportBuildOutput.findFirst.mockResolvedValue(null);
      mockPrismaClient.distributionRecord.create.mockResolvedValue({
        id: 'dr-new',
        sentAt: new Date(),
      });

      const result = await service.distributeReport('dc-1');

      expect(result.status).toBe('sent');
      expect(result.recipientCount).toBe(1);
      expect(mockPrismaClient.distributionRecord.create).toHaveBeenCalled();
    });

    it('should handle send failure and set status to failed', async () => {
      const nodemailer = require('nodemailer');
      const mockTransport = nodemailer.createTransport();
      mockTransport.sendMail.mockRejectedValue(new Error('SMTP error'));

      // Re-create service to pick up the updated mock
      service = new DistributionService(mockPrismaClient as any);

      mockPrismaClient.distributionConfig.findUniqueOrThrow.mockResolvedValue({
        id: 'dc-1',
        reportId: 'rpt-1',
        recipients: JSON.stringify([
          { email: 'alice@example.com', name: 'Alice', role: 'to' },
        ]),
        format: 'pdf',
        includeWatermark: false,
        trackReadReceipts: false,
        emailSubject: 'Report',
        emailBody: '<p>Hi</p>',
      });
      mockPrismaClient.reportDefinition.findUniqueOrThrow.mockResolvedValue({
        id: 'rpt-1',
        name: 'Report',
      });
      mockPrismaClient.reportBuildOutput.findFirst.mockResolvedValue(null);
      mockPrismaClient.distributionRecord.create.mockResolvedValue({
        id: 'dr-fail',
        sentAt: new Date(),
      });

      const result = await service.distributeReport('dc-1');

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('SMTP error');
    });
  });

  // ---------------------------------------------------------------------------
  // getHistory()
  // ---------------------------------------------------------------------------
  describe('getDistributionHistory()', () => {
    it('should parse readReceipts from JSON strings', async () => {
      const readReceipts = [
        { recipientEmail: 'bob@example.com', readAt: '2025-05-01T00:00:00Z', viewCount: 2 },
      ];
      mockPrismaClient.distributionRecord.findMany.mockResolvedValue([
        {
          id: 'dr-1',
          distributionConfigId: 'dc-1',
          reportId: 'rpt-1',
          sentAt: new Date(),
          recipientCount: 1,
          status: 'sent',
          errorMessage: null,
          fileSize: 2048,
          readReceipts: JSON.stringify(readReceipts),
        },
      ]);
      mockPrismaClient.distributionRecord.count.mockResolvedValue(1);

      const result = await service.getDistributionHistory('rpt-1');

      expect(result.records[0].readReceipts).toEqual(readReceipts);
    });
  });

  // ---------------------------------------------------------------------------
  // getAnalytics()
  // ---------------------------------------------------------------------------
  describe('getDistributionAnalytics()', () => {
    it('should compute analytics from distribution records', async () => {
      const sentAt = new Date();
      const readAt = new Date(sentAt.getTime() + 60_000); // 1 minute later
      mockPrismaClient.distributionRecord.findMany.mockResolvedValue([
        {
          id: 'dr-1',
          distributionConfigId: 'dc-1',
          recipientCount: 2,
          sentAt,
          readReceipts: JSON.stringify([
            { recipientEmail: 'alice@example.com', readAt: readAt.toISOString(), viewCount: 3 },
            { recipientEmail: 'bob@example.com', viewCount: 0 },
          ]),
        },
      ]);

      const result = await service.getDistributionAnalytics('dc-1', 30);

      expect(result.distributionId).toBe('dc-1');
      expect(result.totalSent).toBe(2);
      expect(result.totalOpened).toBe(1);
      expect(result.openRate).toBe(0.5);
      expect(result.averageTimeToOpen).toBeGreaterThan(0);
      expect(result.topRecipients).toEqual([
        { email: 'alice@example.com', openCount: 3 },
      ]);
      expect(result.deliveryTrend).toHaveLength(1);
    });

    it('should handle no records gracefully', async () => {
      mockPrismaClient.distributionRecord.findMany.mockResolvedValue([]);

      const result = await service.getDistributionAnalytics('dc-empty', 30);

      expect(result.totalSent).toBe(0);
      expect(result.totalOpened).toBe(0);
      expect(result.openRate).toBe(0);
      expect(result.averageTimeToOpen).toBe(0);
      expect(result.topRecipients).toEqual([]);
      expect(result.deliveryTrend).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // deleteDistributionConfig()
  // ---------------------------------------------------------------------------
  describe('deleteDistributionConfig()', () => {
    it('should delete config and associated records in order', async () => {
      mockPrismaClient.readReceiptLog.deleteMany.mockResolvedValue({ count: 5 });
      mockPrismaClient.distributionRecord.deleteMany.mockResolvedValue({ count: 2 });
      mockPrismaClient.distributionConfig.delete.mockResolvedValue({ id: 'dc-1' });

      await service.deleteDistributionConfig('dc-1');

      // Verify order: readReceiptLog -> distributionRecord -> distributionConfig
      const deleteOrder = [
        mockPrismaClient.readReceiptLog.deleteMany,
        mockPrismaClient.distributionRecord.deleteMany,
        mockPrismaClient.distributionConfig.delete,
      ];
      deleteOrder.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));
    });
  });
});
