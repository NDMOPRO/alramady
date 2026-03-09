import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Service ─────────────────────────────────────────────────────────────────

export class ObservabilityService {
  async getSystemHealth(tenantId: string): Promise<{
    status: string;
    metrics: {
      activeJobs: number;
      recentErrors: number;
      apiCalls: number;
      errorRate: string;
    };
    timestamp: string;
  }> {
    const oneDayAgo = new Date(Date.now() - 86400000);

    const [recentAuditLogs] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          tenantId,
          createdAt: { gte: oneDayAgo },
        },
        select: { action: true },
      }),
    ]);

    const activeJobs = 0; // Jobs tracked via BullMQ, not DB
    const apiCalls = recentAuditLogs.length;
    const recentErrors = recentAuditLogs.filter(
      (log: { action: string }) => log.action === 'DELETE',
    ).length;

    const errorRate = apiCalls > 0 ? (recentErrors / apiCalls) * 100 : 0;
    const status = errorRate < 1 ? 'healthy' : errorRate < 5 ? 'degraded' : 'critical';

    return {
      status,
      metrics: {
        activeJobs,
        recentErrors,
        apiCalls,
        errorRate: errorRate.toFixed(2) + '%',
      },
      timestamp: new Date().toISOString(),
    };
  }

  async getResourceUsage(tenantId: string): Promise<{
    datasets: number;
    dashboards: number;
    reports: number;
    presentations: number;
    workbooks: number;
    totalStorage: number;
  }> {
    const [datasets, dashboards, reports] = await Promise.all([
      prisma.dataset.count({ where: { tenantId } }),
      prisma.dashboard.count({ where: { tenantId } }),
      prisma.report.count({ where: { tenantId } }),
    ]);

    return {
      datasets,
      dashboards,
      reports,
      presentations: 0,
      workbooks: 0,
      totalStorage: datasets + dashboards + reports,
    };
  }

  async getActivityTimeline(tenantId: string, hours = 24): Promise<{
    timeline: Array<{ hour: string; count: number }>;
    totalActions: number;
  }> {
    const since = new Date(Date.now() - hours * 3600000);

    const logs = await prisma.auditLog.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const hourBuckets = new Map<string, number>();
    for (const log of logs) {
      const hourKey = log.createdAt.toISOString().substring(0, 13);
      hourBuckets.set(hourKey, (hourBuckets.get(hourKey) || 0) + 1);
    }

    const timeline = Array.from(hourBuckets.entries()).map(([hour, count]) => ({
      hour,
      count,
    }));

    return { timeline, totalActions: logs.length };
  }
}
