import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const prisma = new PrismaClient();

export interface AgentResult {
  agentType: string;
  taskType: string;
  suggestions: Array<{ action: string; description: string; confidence: number }>;
  interpretation: string;
  requiresApproval: boolean;
  executedAt: Date;
}

export interface AdminCopilotTask {
  type: 'system_health' | 'usage_analytics' | 'security_alerts' | 'optimize_resources' | 'natural_language_admin';
  query?: string;
  timeRange?: { start: string; end: string };
  resourceType?: string;
  thresholds?: Record<string, number>;
  context?: string;
}

interface HealthMetric {
  component: string;
  status: 'healthy' | 'warning' | 'critical';
  value: number;
  threshold: number;
  unit: string;
  detail: string;
}

export class AdminCopilotAgent {
  private readonly agentType = 'admin-copilot';

  async execute(task: AdminCopilotTask): Promise<AgentResult> {
    switch (task.type) {
      case 'system_health':
        return this.systemHealth(task);
      case 'usage_analytics':
        return this.usageAnalytics(task);
      case 'security_alerts':
        return this.securityAlerts(task);
      case 'optimize_resources':
        return this.optimizeResources(task);
      case 'natural_language_admin':
        return this.naturalLanguageAdmin(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private async systemHealth(task: AdminCopilotTask): Promise<AgentResult> {
    const thresholds = task.thresholds ?? {
      maxAuditLogAge: 30,
      maxErrorRate: 5,
      minActivityPerDay: 10,
    };

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentLogs = await prisma.auditLog.findMany({
      where: { performedAt: { gte: oneDayAgo } },
      orderBy: { performedAt: 'desc' },
    });

    const weeklyLogs = await prisma.auditLog.findMany({
      where: { performedAt: { gte: oneWeekAgo } },
      orderBy: { performedAt: 'desc' },
    });

    const totalLogs = await prisma.auditLog.count();

    const healthMetrics: HealthMetric[] = [];

    // Activity rate
    const dailyActivity = recentLogs.length;
    healthMetrics.push({
      component: 'Daily Activity',
      status: dailyActivity >= thresholds['minActivityPerDay'] ? 'healthy' : dailyActivity > 0 ? 'warning' : 'critical',
      value: dailyActivity,
      threshold: thresholds['minActivityPerDay'],
      unit: 'actions/day',
      detail: `${dailyActivity} actions in last 24 hours`,
    });

    // Weekly trend
    const weeklyDailyAvg = weeklyLogs.length / 7;
    healthMetrics.push({
      component: 'Weekly Activity Avg',
      status: weeklyDailyAvg >= thresholds['minActivityPerDay'] * 0.5 ? 'healthy' : 'warning',
      value: Number(weeklyDailyAvg.toFixed(1)),
      threshold: thresholds['minActivityPerDay'],
      unit: 'avg actions/day',
      detail: `${weeklyLogs.length} actions in last 7 days (avg ${weeklyDailyAvg.toFixed(1)}/day)`,
    });

    // Error rate
    const errorLogs = recentLogs.filter((log) => {
      const details = log.details ?? '';
      return details.includes('error') || details.includes('fail') || log.action.includes('error');
    });
    const errorRate = recentLogs.length > 0 ? (errorLogs.length / recentLogs.length) * 100 : 0;
    healthMetrics.push({
      component: 'Error Rate',
      status: errorRate <= thresholds['maxErrorRate'] ? 'healthy' : errorRate <= thresholds['maxErrorRate'] * 2 ? 'warning' : 'critical',
      value: Number(errorRate.toFixed(2)),
      threshold: thresholds['maxErrorRate'],
      unit: '%',
      detail: `${errorLogs.length} errors out of ${recentLogs.length} actions (${errorRate.toFixed(2)}%)`,
    });

    // Audit log storage
    healthMetrics.push({
      component: 'Audit Log Size',
      status: totalLogs < 100000 ? 'healthy' : totalLogs < 500000 ? 'warning' : 'critical',
      value: totalLogs,
      threshold: 100000,
      unit: 'records',
      detail: `${totalLogs} total audit log records`,
    });

    // Agent activity
    const agentActions = weeklyLogs.filter((l) => l.action.includes('agent') || l.entityType === 'agent');
    healthMetrics.push({
      component: 'Agent Activity',
      status: agentActions.length > 0 ? 'healthy' : 'warning',
      value: agentActions.length,
      threshold: 1,
      unit: 'agent executions/week',
      detail: `${agentActions.length} agent executions in last 7 days`,
    });

    const overallStatus = healthMetrics.some((m) => m.status === 'critical')
      ? 'critical'
      : healthMetrics.some((m) => m.status === 'warning')
        ? 'warning'
        : 'healthy';

    const suggestions = healthMetrics.map((m) => ({
      action: `health_${m.status}`,
      description: `[${m.status.toUpperCase()}] ${m.component}: ${m.value} ${m.unit} (threshold: ${m.threshold}). ${m.detail}`,
      confidence: 0.9,
    }));

    suggestions.push({
      action: 'overall_health',
      description: `System overall status: ${overallStatus.toUpperCase()}. ${healthMetrics.filter((m) => m.status === 'healthy').length}/${healthMetrics.length} components healthy.`,
      confidence: 0.95,
    });

    const interpretation = `System health check: ${overallStatus}. ${healthMetrics.length} components monitored. ${healthMetrics.filter((m) => m.status !== 'healthy').length} need attention.`;

    await prisma.auditLog.create({
      data: {
        action: 'admin_copilot_system_health',
        entityType: 'system',
        entityId: 'health-check',
        details: JSON.stringify({
          overallStatus,
          components: healthMetrics.map((m) => ({ component: m.component, status: m.status })),
        }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async usageAnalytics(task: AdminCopilotTask): Promise<AgentResult> {
    const now = new Date();
    const startDate = task.timeRange?.start ? new Date(task.timeRange.start) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endDate = task.timeRange?.end ? new Date(task.timeRange.end) : now;

    const logs = await prisma.auditLog.findMany({
      where: { performedAt: { gte: startDate, lte: endDate } },
      orderBy: { performedAt: 'asc' },
    });

    // Action distribution
    const actionCounts = new Map<string, number>();
    logs.forEach((log) => actionCounts.set(log.action, (actionCounts.get(log.action) ?? 0) + 1));

    // Entity type distribution
    const entityTypeCounts = new Map<string, number>();
    logs.forEach((log) => {
      const et = log.entityType ?? 'unknown';
      entityTypeCounts.set(et, (entityTypeCounts.get(et) ?? 0) + 1);
    });

    // Daily usage
    const dailyCounts = new Map<string, number>();
    logs.forEach((log) => {
      const day = log.performedAt.toISOString().split('T')[0];
      dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
    });

    // Hourly distribution
    const hourlyCounts = new Map<number, number>();
    logs.forEach((log) => {
      const hour = new Date(log.performedAt).getHours();
      hourlyCounts.set(hour, (hourlyCounts.get(hour) ?? 0) + 1);
    });

    const peakHour = Array.from(hourlyCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const quietHour = Array.from(hourlyCounts.entries()).sort((a, b) => a[1] - b[1])[0];

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    // Top actions
    Array.from(actionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([action, count]) => {
        suggestions.push({
          action: 'usage_top_action',
          description: `Action "${action}": ${count} occurrences (${((count / logs.length) * 100).toFixed(1)}%)`,
          confidence: 0.9,
        });
      });

    // Entity types
    suggestions.push({
      action: 'usage_entity_types',
      description: `Entity types: ${Array.from(entityTypeCounts.entries()).map(([t, c]) => `${t}:${c}`).join(', ')}`,
      confidence: 0.9,
    });

    // Peak usage
    if (peakHour) {
      suggestions.push({
        action: 'usage_peak_hour',
        description: `Peak hour: ${peakHour[0]}:00 (${peakHour[1]} actions). Quietest: ${quietHour?.[0] ?? 'N/A'}:00 (${quietHour?.[1] ?? 0} actions).`,
        confidence: 0.85,
      });
    }

    // Daily stats
    const dailyValues = Array.from(dailyCounts.values());
    const avgDaily = dailyValues.length > 0 ? dailyValues.reduce((s, v) => s + v, 0) / dailyValues.length : 0;
    const maxDaily = dailyValues.length > 0 ? Math.max(...dailyValues) : 0;
    const minDaily = dailyValues.length > 0 ? Math.min(...dailyValues) : 0;

    suggestions.push({
      action: 'usage_daily_stats',
      description: `Daily usage: avg ${avgDaily.toFixed(1)}, max ${maxDaily}, min ${minDaily} over ${dailyCounts.size} days.`,
      confidence: 0.9,
    });

    // Growth trend
    if (dailyValues.length >= 7) {
      const firstWeekAvg = dailyValues.slice(0, 7).reduce((s, v) => s + v, 0) / 7;
      const lastWeekAvg = dailyValues.slice(-7).reduce((s, v) => s + v, 0) / 7;
      const growthPct = firstWeekAvg > 0 ? ((lastWeekAvg - firstWeekAvg) / firstWeekAvg) * 100 : 0;

      suggestions.push({
        action: 'usage_growth',
        description: `Usage trend: ${growthPct > 0 ? '+' : ''}${growthPct.toFixed(1)}% (first week: ${firstWeekAvg.toFixed(1)}/day, last week: ${lastWeekAvg.toFixed(1)}/day)`,
        confidence: 0.8,
      });
    }

    const daysInRange = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const interpretation = `Usage analytics for ${daysInRange} days: ${logs.length} actions, ${actionCounts.size} types, avg ${avgDaily.toFixed(1)}/day.`;

    await prisma.auditLog.create({
      data: {
        action: 'admin_copilot_usage_analytics',
        entityType: 'system',
        entityId: 'usage-report',
        details: JSON.stringify({ totalActions: logs.length, uniqueActions: actionCounts.size, daysInRange }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async securityAlerts(task: AdminCopilotTask): Promise<AgentResult> {
    const now = new Date();
    const startDate = task.timeRange?.start ? new Date(task.timeRange.start) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const logs = await prisma.auditLog.findMany({
      where: { performedAt: { gte: startDate } },
      orderBy: { performedAt: 'desc' },
      take: 5000,
    });

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    // Burst activity detection
    const actionTimestamps = new Map<string, Date[]>();
    logs.forEach((log) => {
      if (!actionTimestamps.has(log.action)) actionTimestamps.set(log.action, []);
      actionTimestamps.get(log.action)!.push(log.performedAt);
    });

    for (const [action, timestamps] of actionTimestamps) {
      if (timestamps.length < 10) continue;
      const sorted = timestamps.sort((a, b) => a.getTime() - b.getTime());
      for (let i = 0; i < sorted.length - 9; i++) {
        const windowMs = sorted[i + 9].getTime() - sorted[i].getTime();
        if (windowMs < 60000) {
          suggestions.push({
            action: 'security_burst_activity',
            description: `Burst: 10+ "${action}" actions within 1 minute at ${sorted[i].toISOString()}. Possible automated access.`,
            confidence: 0.85,
          });
          break;
        }
      }
    }

    // Sensitive operations
    const sensitivePatterns = ['delete', 'remove', 'drop', 'export', 'download', 'permission', 'role', 'admin'];
    const sensitiveOps = logs.filter((log) =>
      sensitivePatterns.some((p) => log.action.toLowerCase().includes(p))
    );

    if (sensitiveOps.length > 0) {
      const sensitiveByAction = new Map<string, number>();
      sensitiveOps.forEach((log) => sensitiveByAction.set(log.action, (sensitiveByAction.get(log.action) ?? 0) + 1));

      Array.from(sensitiveByAction.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([action, count]) => {
          suggestions.push({
            action: 'security_sensitive_operation',
            description: `Sensitive operation "${action}": ${count} occurrences. Review authorization.`,
            confidence: 0.8,
          });
        });
    }

    // After-hours activity
    const afterHoursLogs = logs.filter((log) => {
      const hour = new Date(log.performedAt).getHours();
      return hour < 5 || hour > 23;
    });

    if (afterHoursLogs.length > 0) {
      suggestions.push({
        action: 'security_after_hours',
        description: `${afterHoursLogs.length} after-hours activities (before 5AM or after 11PM).`,
        confidence: 0.75,
      });
    }

    // Hot entities
    const entityAccessCounts = new Map<string, number>();
    logs.forEach((log) => {
      if (log.entityId) {
        entityAccessCounts.set(log.entityId, (entityAccessCounts.get(log.entityId) ?? 0) + 1);
      }
    });

    const avgAccess = Array.from(entityAccessCounts.values()).reduce((s, v) => s + v, 0) / (entityAccessCounts.size || 1);
    Array.from(entityAccessCounts.entries())
      .filter(([, count]) => count > avgAccess * 5)
      .forEach(([entityId, count]) => {
        suggestions.push({
          action: 'security_hot_entity',
          description: `Entity "${entityId}": ${count} operations (${(count / avgAccess).toFixed(1)}x average). Investigate.`,
          confidence: 0.7,
        });
      });

    if (suggestions.length === 0) {
      suggestions.push({
        action: 'security_all_clear',
        description: `No security alerts from ${logs.length} audit entries.`,
        confidence: 0.9,
      });
    }

    const alertCount = suggestions.filter((s) => s.action !== 'security_all_clear').length;
    const interpretation = `Security scan: ${logs.length} entries, ${alertCount} alerts. ${sensitiveOps.length} sensitive ops, ${afterHoursLogs.length} after-hours activities.`;

    await prisma.auditLog.create({
      data: {
        action: 'admin_copilot_security_alerts',
        entityType: 'system',
        entityId: 'security-scan',
        details: JSON.stringify({ logsAnalyzed: logs.length, alertsGenerated: alertCount }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: alertCount > 0,
      executedAt: new Date(),
    };
  }

  private async optimizeResources(task: AdminCopilotTask): Promise<AgentResult> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const logs = await prisma.auditLog.findMany({
      where: { performedAt: { gte: thirtyDaysAgo } },
      orderBy: { performedAt: 'desc' },
    });

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    // Slow operations
    const actionDurations = new Map<string, number[]>();
    logs.forEach((log) => {
      try {
        const details = JSON.parse(log.details ?? '{}');
        const duration = details.durationMs ?? details.duration ?? details.executionTime;
        if (typeof duration === 'number' && duration > 0) {
          if (!actionDurations.has(log.action)) actionDurations.set(log.action, []);
          actionDurations.get(log.action)!.push(duration);
        }
      } catch {
        // Skip
      }
    });

    for (const [action, durations] of actionDurations) {
      const avgDuration = durations.reduce((s, v) => s + v, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      if (avgDuration > 5000) {
        suggestions.push({
          action: 'optimize_slow_operation',
          description: `"${action}": avg ${(avgDuration / 1000).toFixed(1)}s, max ${(maxDuration / 1000).toFixed(1)}s (${durations.length} runs). Consider caching or BullMQ.`,
          confidence: 0.85,
        });
      }
    }

    // Underutilized entities
    const entityActivity = new Map<string, number>();
    logs.forEach((log) => {
      if (log.entityId) {
        entityActivity.set(log.entityId, (entityActivity.get(log.entityId) ?? 0) + 1);
      }
    });

    const underutilized = Array.from(entityActivity.entries()).filter(([, count]) => count < 3).length;
    if (underutilized > 0) {
      suggestions.push({
        action: 'optimize_underutilized',
        description: `${underutilized} entities accessed <3 times in 30 days. Consider archiving.`,
        confidence: 0.7,
      });
    }

    // Redundant operations
    const sortedLogs = [...logs].sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime());
    let redundantCount = 0;

    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const current = sortedLogs[i];
      const next = sortedLogs[i + 1];
      if (
        current.action === next.action &&
        current.entityId === next.entityId &&
        next.performedAt.getTime() - current.performedAt.getTime() < 5000
      ) {
        redundantCount++;
      }
    }

    if (redundantCount > 0) {
      suggestions.push({
        action: 'optimize_redundant_ops',
        description: `${redundantCount} potentially redundant operations (same action + entity within 5s). Add debouncing.`,
        confidence: 0.75,
      });
    }

    // Load distribution
    const hourlyCounts = new Map<number, number>();
    logs.forEach((log) => {
      const hour = new Date(log.performedAt).getHours();
      hourlyCounts.set(hour, (hourlyCounts.get(hour) ?? 0) + 1);
    });

    const avgHourly = logs.length / 24;
    const peakHours = Array.from(hourlyCounts.entries())
      .filter(([, count]) => count > avgHourly * 2)
      .map(([hour]) => hour);

    if (peakHours.length > 0) {
      suggestions.push({
        action: 'optimize_load_distribution',
        description: `Peak hours: ${peakHours.join(', ')}:00. Schedule batch work during 1-4 AM AST.`,
        confidence: 0.8,
      });
    }

    const interpretation = `Resource optimization: ${logs.length} operations over 30 days. ${suggestions.length} optimizations found. ${underutilized} underutilized entities.`;

    await prisma.auditLog.create({
      data: {
        action: 'admin_copilot_optimize_resources',
        entityType: 'system',
        entityId: 'optimization-report',
        details: JSON.stringify({ logsAnalyzed: logs.length, optimizations: suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async naturalLanguageAdmin(task: AdminCopilotTask): Promise<AgentResult> {
    const query = task.query;
    if (!query) {
      throw new Error('natural_language_admin requires a query');
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentLogs = await prisma.auditLog.findMany({
      where: { performedAt: { gte: oneDayAgo } },
      orderBy: { performedAt: 'desc' },
      take: 100,
    });

    const totalLogs = await prisma.auditLog.count();

    const actionSummary = new Map<string, number>();
    recentLogs.forEach((log) => actionSummary.set(log.action, (actionSummary.get(log.action) ?? 0) + 1));

    const entitySummary = new Map<string, number>();
    recentLogs.forEach((log) => {
      const et = log.entityType ?? 'unknown';
      entitySummary.set(et, (entitySummary.get(et) ?? 0) + 1);
    });

    const prompt = `You are an AI admin copilot for the Rasid analytics platform (Saudi market, Arabic-first).
Answer the admin's query using available system data.

Admin query: "${query}"

System context:
- Total audit records: ${totalLogs}
- Recent actions (24h): ${recentLogs.length}
- Action distribution: ${JSON.stringify(Object.fromEntries(actionSummary))}
- Entity types: ${JSON.stringify(Object.fromEntries(entitySummary))}
- Recent logs sample:
${JSON.stringify(recentLogs.slice(0, 10).map((l) => ({
  action: l.action,
  entityType: l.entityType,
  entityId: l.entityId,
  time: l.performedAt.toISOString(),
})), null, 2)}

${task.context ? `Additional context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "admin_answer", "description": "direct answer with data references", "confidence": 0.9 },
    { "action": "admin_recommendation", "description": "actionable recommendation", "confidence": 0.8 }
  ],
  "interpretation": "comprehensive answer in Arabic (formal MSA)"
}

Rules:
- Data-backed answers when possible
- State clearly if information is missing
- Include specific numbers and timestamps
- Suggest follow-up actions
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for natural_language_admin');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'admin_copilot_nl_query',
        entityType: 'system',
        entityId: 'nl-admin',
        details: JSON.stringify({ query: query.slice(0, 200), suggestionsCount: parsed.suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }
}
