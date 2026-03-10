import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

let esClient: { index: (opts: Record<string, unknown>) => Promise<unknown> } | null = null;
try {
  const { Client: ElasticsearchClient } = require('@elastic/elasticsearch');
  esClient = new ElasticsearchClient({
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  });
  logger.info('Elasticsearch client initialized for audit indexing');
} catch {
  logger.info('Elasticsearch client not available, audit logs will use database only');
}

const ES_INDEX = 'rasid-audit-logs';

export class AuditService {

  async logAction(
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    details: Record<string, unknown>,
    ip: string,
    tenantId: string
  ): Promise<Record<string, unknown>> {
    const timestamp = new Date();
    const logId = crypto.randomUUID();

    const auditEntry = await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        entityType: resource,
        entityId: resourceId,
        detailsJson: {
          ...details,
          ip,
          logId,
          recordedAt: timestamp.toISOString(),
        },
        ipAddress: ip,
      },
    });

    if (esClient) {
      try {
        await esClient.index({
          index: ES_INDEX,
          id: auditEntry.id,
          body: {
            tenantId,
            userId,
            action,
            resource,
            resourceId,
            details,
            ipAddress: ip,
            timestamp: timestamp.toISOString(),
            logId,
          },
        });
        logger.debug('Audit log indexed in Elasticsearch', { logId: auditEntry.id });
      } catch (esError: unknown) {
        logger.warn('Failed to index audit log in Elasticsearch', {
          logId: auditEntry.id,
          error: esError instanceof Error ? esError.message : String(esError),
        });
      }
    }

    logger.info('Audit action logged', {
      logId: auditEntry.id,
      userId,
      action,
      resource,
      resourceId,
      tenantId,
    });

    return {
      id: auditEntry.id,
      tenantId,
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress: ip,
      createdAt: auditEntry.createdAt,
    };
  }

  async getAuditLog(
    filters: {
      userId?: string;
      action?: string;
      resource?: string;
      dateRange?: { start: Date; end: Date };
    },
    pagination: { page: number; limit: number },
    tenantId: string
  ): Promise<Record<string, unknown>> {
    const page = Math.max(1, pagination.page);
    const limit = Math.min(Math.max(1, pagination.limit), 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };

    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.action) {
      where.action = { contains: filters.action };
    }
    if (filters.resource) {
      where.entityType = filters.resource;
    }
    if (filters.dateRange) {
      const dateFilter: Record<string, Date> = {};
      if (filters.dateRange.start) {
        dateFilter.gte = new Date(filters.dateRange.start);
      }
      if (filters.dateRange.end) {
        dateFilter.lte = new Date(filters.dateRange.end);
      }
      where.createdAt = dateFilter;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const formattedLogs = logs.map(log => ({
      id: log.id,
      userId: log.userId,
      userName: log.user?.name || 'Unknown',
      userEmail: log.user?.email || 'Unknown',
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      details: log.detailsJson,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    }));

    logger.debug('Audit log query executed', {
      tenantId,
      filtersApplied: Object.keys(filters).filter(k => (filters as Record<string, unknown>)[k] !== undefined).length,
      totalResults: total,
      page,
      limit,
    });

    return {
      data: formattedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async getAuditTrail(
    resourceId: string,
    tenantId: string
  ): Promise<Record<string, unknown>> {
    const logs = await prisma.auditLog.findMany({
      where: {
        entityId: resourceId,
        tenantId,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const timeline = logs.map((log, index) => ({
      sequence: index + 1,
      id: log.id,
      action: log.action,
      user: {
        id: log.user?.id || log.userId,
        name: log.user?.name || 'System',
        email: log.user?.email || '',
      },
      details: log.detailsJson,
      ipAddress: log.ipAddress,
      timestamp: log.createdAt,
      timeSincePrevious: index > 0
        ? log.createdAt.getTime() - logs[index - 1].createdAt.getTime()
        : 0,
    }));

    const actionSummary: Record<string, number> = {};
    logs.forEach(log => {
      actionSummary[log.action] = (actionSummary[log.action] || 0) + 1;
    });

    logger.debug('Audit trail retrieved', { resourceId, tenantId, entryCount: logs.length });

    return {
      resourceId,
      tenantId,
      totalEntries: logs.length,
      firstEntry: logs.length > 0 ? logs[0].createdAt : null,
      lastEntry: logs.length > 0 ? logs[logs.length - 1].createdAt : null,
      actionSummary,
      timeline,
    };
  }

  async getUserActivity(
    userId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<Record<string, unknown>> {
    const where: Record<string, unknown> = { userId };
    if (dateRange) {
      where.createdAt = {
        gte: new Date(dateRange.start),
        lte: new Date(dateRange.end),
      };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const actionCounts: Record<string, number> = {};
    const resourceCounts: Record<string, number> = {};
    const dailyActivity: Record<string, number> = {};
    const hourlyActivity: Record<number, number> = {};

    for (const log of logs) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;

      const entityType = log.entityType || 'unknown';
      resourceCounts[entityType] = (resourceCounts[entityType] || 0) + 1;

      const dayKey = log.createdAt.toISOString().split('T')[0];
      dailyActivity[dayKey] = (dailyActivity[dayKey] || 0) + 1;

      const hour = log.createdAt.getHours();
      hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
    }

    const sortedActions = Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1]);

    const peakHour = Object.entries(hourlyActivity)
      .sort((a, b) => b[1] - a[1])[0];

    const recentActions = logs.slice(0, 25).map(log => ({
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      timestamp: log.createdAt,
      ipAddress: log.ipAddress,
    }));

    logger.debug('User activity report generated', {
      userId,
      totalActions: logs.length,
      dateRange,
    });

    return {
      userId,
      dateRange: {
        start: dateRange.start,
        end: dateRange.end,
      },
      totalActions: logs.length,
      actionBreakdown: Object.fromEntries(sortedActions),
      resourceBreakdown: resourceCounts,
      dailyActivity,
      hourlyDistribution: hourlyActivity,
      peakActivityHour: peakHour ? { hour: parseInt(peakHour[0]), count: peakHour[1] } : null,
      recentActions,
    };
  }

  async exportAuditLog(
    filters: Record<string, unknown>,
    format: 'csv' | 'pdf',
    tenantId: string
  ): Promise<Buffer> {
    const where: Record<string, unknown> = { tenantId };

    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.action) {
      where.action = { contains: filters.action };
    }
    if (filters.resource) {
      where.entityType = filters.resource;
    }
    if (filters.startDate) {
      const dateFilter = (where.createdAt || {}) as Record<string, Date>;
      dateFilter.gte = new Date(filters.startDate as string);
      where.createdAt = dateFilter;
    }
    if (filters.endDate) {
      const dateFilter = (where.createdAt || {}) as Record<string, Date>;
      dateFilter.lte = new Date(filters.endDate as string);
      where.createdAt = dateFilter;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (format === 'csv') {
      const csvHeaders = [
        'ID',
        'Timestamp',
        'User ID',
        'User Name',
        'User Email',
        'Action',
        'Entity Type',
        'Entity ID',
        'IP Address',
        'Details',
      ].join(',');

      const csvRows = logs.map(log => {
        const escapeCsv = (val: string | null | undefined): string => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        return [
          escapeCsv(log.id),
          escapeCsv(log.createdAt.toISOString()),
          escapeCsv(log.userId),
          escapeCsv(log.user?.name),
          escapeCsv(log.user?.email),
          escapeCsv(log.action),
          escapeCsv(log.entityType),
          escapeCsv(log.entityId),
          escapeCsv(log.ipAddress),
          escapeCsv(JSON.stringify(log.detailsJson)),
        ].join(',');
      });

      const csvContent = [csvHeaders, ...csvRows].join('\n');
      const csvBuffer = Buffer.from(csvContent, 'utf-8');

      logger.info('Audit log exported as CSV', {
        tenantId,
        recordCount: logs.length,
        sizeBytes: csvBuffer.length,
      });

      return csvBuffer;
    }

    const pdfLines: string[] = [];
    pdfLines.push('%PDF-1.4');
    pdfLines.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
    pdfLines.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');

    const contentLines: string[] = [];
    contentLines.push('RASID Governance - Audit Log Export');
    contentLines.push(`Generated: ${new Date().toISOString()}`);
    contentLines.push(`Tenant: ${tenantId}`);
    contentLines.push(`Total Records: ${logs.length}`);
    contentLines.push('---');

    for (const log of logs.slice(0, 100)) {
      contentLines.push(
        `[${log.createdAt.toISOString()}] ${log.action} | User: ${log.user?.name || log.userId} | Entity: ${log.entityType}:${log.entityId || 'N/A'} | IP: ${log.ipAddress || 'N/A'}`
      );
    }

    if (logs.length > 100) {
      contentLines.push(`... and ${logs.length - 100} more records`);
    }

    const textContent = contentLines.join('\\n');
    const streamContent = `BT /F1 10 Tf 50 750 Td (${textContent.replace(/[()\\]/g, '\\$&')}) Tj ET`;
    const streamLength = Buffer.byteLength(streamContent);

    pdfLines.push(`3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj`);
    pdfLines.push(`4 0 obj << /Length ${streamLength} >> stream`);
    pdfLines.push(streamContent);
    pdfLines.push('endstream endobj');
    pdfLines.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
    pdfLines.push('xref');
    pdfLines.push('0 6');
    pdfLines.push('trailer << /Size 6 /Root 1 0 R >>');
    pdfLines.push('startxref');
    pdfLines.push('0');
    pdfLines.push('%%EOF');

    const pdfContent = pdfLines.join('\n');
    const pdfBuffer = Buffer.from(pdfContent, 'utf-8');

    logger.info('Audit log exported as PDF', {
      tenantId,
      recordCount: logs.length,
      sizeBytes: pdfBuffer.length,
    });

    return pdfBuffer;
  }
}

export const auditService = new AuditService();
