import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });

interface SystemHealthResult {
  status: 'healthy' | 'degraded' | 'critical';
  components: ComponentHealth[];
  overallScore: number;
  timestamp: string;
  recommendations: string[];
}

interface ComponentHealth {
  name: string;
  status: 'up' | 'degraded' | 'down';
  latencyMs: number;
  errorRate: number;
  details: Record<string, unknown>;
}

interface UsageAnalyticsResult {
  tenantId: string;
  period: string;
  activeUsers: number;
  totalActions: number;
  topFeatures: Array<{ feature: string; count: number }>;
  storageUsedBytes: number;
  aiCallsCount: number;
  peakHour: number;
  growthRate: number;
}

interface SecurityAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  title: string;
  description: string;
  affectedUsers: string[];
  suggestedAction: string;
  detectedAt: string;
  resolved: boolean;
}

interface NLQueryResult {
  query: string;
  interpretation: string;
  result: unknown;
  sqlGenerated?: string;
  confidence: number;
  executedAt: string;
}

export class AdminCopilotEnhancedService {
  constructor(private prisma: PrismaClient) {}

  async processQuery(tenantId: string, query: string, userId: string): Promise<NLQueryResult> {
    const systemPrompt = `You are the Admin Copilot for the Rasid platform - a Saudi-market data analytics platform.
You help administrators manage the platform using natural language.

Available entities and their key fields:
- Users: id, email, name, status (active/suspended/deleted), role, lastLoginAt
- Datasets: id, name, status, format, rowCount, createdAt
- Dashboards: id, title, visibility, widgetCount, createdAt
- Reports: id, title, status, format, createdAt
- AuditLogs: id, action, entityType, entityId, userId, createdAt
- Permissions: id, userId, resource, action, roleId

When the admin asks a question, determine what data to query and respond with a JSON object:
{
  "interpretation": "what you understood",
  "queryType": "users|datasets|dashboards|reports|audit|permissions|stats",
  "filters": { "field": "value" },
  "aggregation": "count|list|sum|avg|max|min|none",
  "limit": 20,
  "orderBy": "field",
  "orderDir": "asc|desc"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from AI');

    const plan: {
      interpretation: string;
      queryType: string;
      filters: Record<string, unknown>;
      aggregation: string;
      limit: number;
      orderBy?: string;
      orderDir?: string;
    } = JSON.parse(content);

    let result: unknown;
    const limit = Math.min(plan.limit || 20, 100);

    switch (plan.queryType) {
      case 'users': {
        const where: Record<string, unknown> = { tenantId };
        if (plan.filters.status) where.status = plan.filters.status;
        if (plan.filters.role) where.role = plan.filters.role;
        if (plan.aggregation === 'count') {
          result = await this.prisma.user.count({ where });
        } else {
          result = await this.prisma.user.findMany({
            where,
            take: limit,
            orderBy: plan.orderBy ? { [plan.orderBy]: plan.orderDir || 'desc' } : { createdAt: 'desc' },
            select: { id: true, email: true, name: true, status: true, createdAt: true, lastLoginAt: true },
          });
        }
        break;
      }
      case 'audit': {
        const where: Record<string, unknown> = { tenantId };
        if (plan.filters.action) where.action = plan.filters.action;
        if (plan.filters.userId) where.userId = plan.filters.userId;
        if (plan.filters.entityType) where.entityType = plan.filters.entityType;
        if (plan.aggregation === 'count') {
          result = await this.prisma.auditLog.count({ where });
        } else {
          result = await this.prisma.auditLog.findMany({
            where,
            take: limit,
            orderBy: { createdAt: 'desc' },
          });
        }
        break;
      }
      case 'stats': {
        const [userCount, activeUsers, totalLogs] = await Promise.all([
          this.prisma.user.count({ where: { tenantId } }),
          this.prisma.user.count({ where: { tenantId, status: 'ACTIVE' } }),
          this.prisma.auditLog.count({ where: { tenantId } }),
        ]);
        result = { userCount, activeUsers, totalAuditLogs: totalLogs };
        break;
      }
      default: {
        const where: Record<string, unknown> = { tenantId };
        result = await this.prisma.auditLog.findMany({
          where,
          take: limit,
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'admin_copilot_query',
        entityType: 'system',
        entityId: tenantId,
        userId,
        tenantId,
        details: JSON.stringify({ query, interpretation: plan.interpretation }),
        createdAt: new Date(),
      },
    });

    return {
      query,
      interpretation: plan.interpretation,
      result,
      confidence: 0.85,
      executedAt: new Date().toISOString(),
    };
  }

  async getSystemHealth(tenantId: string): Promise<SystemHealthResult> {
    const now = Date.now();
    const components: ComponentHealth[] = [];

    const dbStart = Date.now();
    const userCount = await this.prisma.user.count({ where: { tenantId } });
    const dbLatency = Date.now() - dbStart;
    components.push({
      name: 'database',
      status: dbLatency < 200 ? 'up' : dbLatency < 1000 ? 'degraded' : 'down',
      latencyMs: dbLatency,
      errorRate: 0,
      details: { userCount, queryTimeMs: dbLatency },
    });

    const recentErrors = await this.prisma.auditLog.count({
      where: {
        tenantId,
        action: { contains: 'error' },
        createdAt: { gte: new Date(now - 3600000) },
      },
    });

    const totalActions = await this.prisma.auditLog.count({
      where: {
        tenantId,
        createdAt: { gte: new Date(now - 3600000) },
      },
    });

    const errorRate = totalActions > 0 ? recentErrors / totalActions : 0;
    components.push({
      name: 'application',
      status: errorRate < 0.01 ? 'up' : errorRate < 0.05 ? 'degraded' : 'down',
      latencyMs: 0,
      errorRate,
      details: { recentErrors, totalActions, errorRate },
    });

    const overallScore = components.reduce((sum, c) => {
      const score = c.status === 'up' ? 1 : c.status === 'degraded' ? 0.5 : 0;
      return sum + score;
    }, 0) / components.length;

    const recommendations: string[] = [];
    if (dbLatency > 200) recommendations.push('Database response time is elevated. Consider optimizing queries or scaling resources.');
    if (errorRate > 0.01) recommendations.push(`Error rate is ${(errorRate * 100).toFixed(2)}%. Investigate recent error logs.`);
    if (userCount === 0) recommendations.push('No users found for this tenant. Verify tenant configuration.');

    const status = overallScore >= 0.8 ? 'healthy' : overallScore >= 0.5 ? 'degraded' : 'critical';

    return {
      status,
      components,
      overallScore,
      timestamp: new Date().toISOString(),
      recommendations,
    };
  }

  async getUsageAnalytics(tenantId: string, days: number = 30): Promise<UsageAnalyticsResult> {
    const since = new Date(Date.now() - days * 86400000);

    const [activeUsers, totalActions, recentLogs] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.auditLog.count({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.auditLog.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { action: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10000,
      }),
    ]);

    const featureCounts = new Map<string, number>();
    const hourCounts = new Array(24).fill(0);

    for (const log of recentLogs) {
      const feature = log.action.split('_')[0] || log.action;
      featureCounts.set(feature, (featureCounts.get(feature) || 0) + 1);
      const hour = new Date(log.createdAt).getHours();
      hourCounts[hour]++;
    }

    const topFeatures = Array.from(featureCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([feature, count]) => ({ feature, count }));

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    const previousPeriodActions = await this.prisma.auditLog.count({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(since.getTime() - days * 86400000),
          lt: since,
        },
      },
    });

    const growthRate = previousPeriodActions > 0
      ? (totalActions - previousPeriodActions) / previousPeriodActions
      : totalActions > 0 ? 1 : 0;

    return {
      tenantId,
      period: `${days}d`,
      activeUsers,
      totalActions,
      topFeatures,
      storageUsedBytes: 0,
      aiCallsCount: recentLogs.filter((l) => l.action.includes('ai') || l.action.includes('agent')).length,
      peakHour,
      growthRate,
    };
  }

  async getSecurityAlerts(tenantId: string): Promise<SecurityAlert[]> {
    const now = Date.now();
    const alerts: SecurityAlert[] = [];

    const failedLogins = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        action: 'login_failed',
        createdAt: { gte: new Date(now - 3600000) },
      },
      select: { userId: true, createdAt: true },
    });

    const failedByUser = new Map<string, number>();
    for (const f of failedLogins) {
      if (f.userId) {
        failedByUser.set(f.userId, (failedByUser.get(f.userId) || 0) + 1);
      }
    }

    for (const [userId, count] of failedByUser.entries()) {
      if (count >= 5) {
        alerts.push({
          id: randomUUID(),
          severity: count >= 10 ? 'critical' : 'high',
          type: 'brute_force_attempt',
          title: 'Multiple Failed Login Attempts',
          description: `User ${userId} has ${count} failed login attempts in the last hour`,
          affectedUsers: [userId],
          suggestedAction: 'Consider temporarily locking the account and notifying the user',
          detectedAt: new Date().toISOString(),
          resolved: false,
        });
      }
    }

    const suspiciousActions = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        action: { in: ['permission_escalation', 'bulk_delete', 'export_all', 'admin_override'] },
        createdAt: { gte: new Date(now - 86400000) },
      },
      select: { userId: true, action: true, createdAt: true, entityType: true },
    });

    for (const action of suspiciousActions) {
      alerts.push({
        id: randomUUID(),
        severity: action.action === 'permission_escalation' ? 'critical' : 'high',
        type: 'suspicious_activity',
        title: `Suspicious Action: ${action.action}`,
        description: `User ${action.userId} performed ${action.action} on ${action.entityType}`,
        affectedUsers: action.userId ? [action.userId] : [],
        suggestedAction: 'Review the action in audit logs and verify with the user',
        detectedAt: action.createdAt.toISOString(),
        resolved: false,
      });
    }

    const inactiveAdmins = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: 'admin',
        lastLoginAt: { lt: new Date(now - 90 * 86400000) },
        status: 'ACTIVE',
      },
      select: { id: true, name: true, lastLoginAt: true },
    });

    for (const admin of inactiveAdmins) {
      alerts.push({
        id: randomUUID(),
        severity: 'medium',
        type: 'inactive_admin',
        title: 'Inactive Admin Account',
        description: `Admin ${admin.name} has not logged in since ${admin.lastLoginAt?.toISOString() || 'never'}`,
        affectedUsers: [admin.id],
        suggestedAction: 'Consider revoking admin privileges or deactivating the account',
        detectedAt: new Date().toISOString(),
        resolved: false,
      });
    }

    return alerts.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }
}
