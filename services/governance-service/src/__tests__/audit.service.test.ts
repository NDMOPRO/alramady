// @ts-nocheck

const mockAuditLogCreate = jest.fn();
const mockAuditLogFindMany = jest.fn();
const mockAuditLogCount = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    auditLog: {
      create: mockAuditLogCreate,
      findMany: mockAuditLogFindMany,
      count: mockAuditLogCount,
    },
  })),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { auditService } from '../services/audit.service';

describe('Engine 10.1 - Audit Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return paginated audit logs with normalized user fields', async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([
      {
        id: 'audit-1',
        userId: 'user-1',
        action: 'login',
        entityType: 'auth',
        entityId: 'session-1',
        detailsJson: { browser: 'chrome' },
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-03-09T08:30:00Z'),
        user: {
          id: 'user-1',
          name: 'Surface Admin',
          email: 'admin@rasid.local',
          role: 'admin',
        },
      },
    ]);
    mockAuditLogCount.mockResolvedValueOnce(1);

    const result = await auditService.getAuditLog({}, { page: 1, limit: 10 }, 'tenant-1');

    expect(result.pagination.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: 'audit-1',
      userName: 'Surface Admin',
      action: 'login',
      entityType: 'auth',
      entityId: 'session-1',
      ipAddress: '127.0.0.1',
    });
  });

  it('should export CSV audit logs with tenant-scoped rows', async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([
      {
        id: 'audit-1',
        userId: 'user-1',
        action: 'export',
        entityType: 'report',
        entityId: 'report-77',
        detailsJson: { format: 'csv' },
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-03-09T08:35:00Z'),
        user: {
          id: 'user-1',
          name: 'Surface Admin',
          email: 'admin@rasid.local',
        },
      },
    ]);

    const buffer = await auditService.exportAuditLog({}, 'csv', 'tenant-1');
    const csv = buffer.toString('utf8');

    expect(csv).toContain('User Name');
    expect(csv).toContain('Surface Admin');
    expect(csv).toContain('report-77');
  });
});
