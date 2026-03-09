/**
 * Specialized Reports Service — Rasid Platform
 * تقارير متخصصة: الامتثال، الأداء، التحقق، التدقيق، الديناميكي
 * يغطي: F-02124, F-02125, F-02126, F-02127, F-02132
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { reportBuilderService } from './report-builder.service';
import { templateEngineService } from './template-engine.service';
import { chartRendererService } from './chart-renderer.service';

interface ComplianceRule {
  id: string;
  name: string;
  framework: string;
  requirement: string;
  status: 'compliant' | 'non_compliant' | 'partial' | 'not_applicable';
  evidence?: string;
  lastChecked: Date;
  assignee?: string;
  dueDate?: Date;
}

interface PerformanceMetric {
  id: string;
  name: string;
  category: string;
  currentValue: number;
  targetValue: number;
  previousValue?: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  status: 'on_track' | 'at_risk' | 'behind';
}

interface ValidationCheck {
  id: string;
  name: string;
  category: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  details: string;
  checkedAt: Date;
  duration: number;
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  timestamp: Date;
  changes: Record<string, { old: unknown; new: unknown }>;
  ipAddress?: string;
}

export class SpecializedReportsService {
  /**
   * إنشاء تقرير الامتثال (Compliance Report)
   */
  async generateComplianceReport(
    tenantId: string,
    options: {
      framework?: string;
      dateFrom?: Date;
      dateTo?: Date;
      outputFormat?: 'pdf' | 'docx' | 'html';
    } = {}
  ): Promise<{ reportId: string; content: Buffer; format: string }> {
    const { framework, dateFrom, dateTo, outputFormat = 'pdf' } = options;

    // Fetch compliance data from governance
    const policies = await prisma.compliancePolicy.findMany({
      where: {
        tenantId,
        ...(framework ? { framework } : {}),
      },
      include: {
        checks: {
          where: {
            ...(dateFrom || dateTo
              ? {
                  checkedAt: {
                    ...(dateFrom ? { gte: dateFrom } : {}),
                    ...(dateTo ? { lte: dateTo } : {}),
                  },
                }
              : {}),
          },
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
      },
    });

    const rules: ComplianceRule[] = policies.map((p) => ({
      id: p.id,
      name: p.name,
      framework: p.framework,
      requirement: p.description,
      status: this.determineComplianceStatus(p),
      evidence: p.evidence ?? undefined,
      lastChecked: p.checks[0]?.checkedAt ?? p.updatedAt,
      assignee: p.assignee ?? undefined,
      dueDate: p.dueDate ?? undefined,
    }));

    const compliant = rules.filter((r) => r.status === 'compliant').length;
    const nonCompliant = rules.filter((r) => r.status === 'non_compliant').length;
    const partial = rules.filter((r) => r.status === 'partial').length;
    const complianceRate = rules.length > 0 ? (compliant / rules.length) * 100 : 0;

    // Generate chart
    const chartBuffer = await chartRendererService.renderChart({
      chartType: 'pie',
      title: 'الامتثال',
      labels: ['ملتزم', 'غير ملتزم', 'جزئي', 'غير منطبق'],
      datasets: [
        {
          label: 'الامتثال',
          data: [
            compliant,
            nonCompliant,
            partial,
            rules.filter((r) => r.status === 'not_applicable').length,
          ],
          backgroundColor: ['#10B981', '#EF4444', '#F59E0B', '#6B7280'],
        },
      ],
      width: 600,
      height: 400,
    });

    // Build report
    const reportData = {
      title: `تقرير الامتثال${framework ? ` — ${framework}` : ''}`,
      date: new Date().toISOString(),
      summary: {
        totalRules: rules.length,
        compliant,
        nonCompliant,
        partial,
        complianceRate: Math.round(complianceRate * 100) / 100,
      },
      rules,
      charts: [{ name: 'compliance-overview', buffer: chartBuffer }],
    };

    const content = await templateEngineService.renderReport(
      'compliance',
      reportData,
      outputFormat
    );

    // Save report record
    const report = await prisma.report.create({
      data: {
        tenantId,
        name: reportData.title,
        type: 'compliance',
        format: outputFormat.toUpperCase() as 'PDF' | 'DOCX' | 'HTML',
        status: 'COMPLETED',
        metadata: {
          framework,
          complianceRate,
          totalRules: rules.length,
        },
        generatedAt: new Date(),
      },
    });

    logger.info('Compliance report generated', {
      reportId: report.id,
      complianceRate,
      totalRules: rules.length,
    });

    return { reportId: report.id, content, format: outputFormat };
  }

  /**
   * إنشاء تقرير الأداء والحالة (Performance & Status Report)
   */
  async generatePerformanceReport(
    tenantId: string,
    options: {
      period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
      categories?: string[];
      outputFormat?: 'pdf' | 'docx' | 'html';
    } = {}
  ): Promise<{ reportId: string; content: Buffer; format: string }> {
    const { period = 'monthly', categories, outputFormat = 'pdf' } = options;

    const dateRange = this.getDateRange(period);

    // Fetch KPIs
    const kpis = await prisma.kpi.findMany({
      where: {
        tenantId,
        ...(categories ? { category: { in: categories } } : {}),
      },
      include: {
        values: {
          where: { recordedAt: { gte: dateRange.start, lte: dateRange.end } },
          orderBy: { recordedAt: 'desc' },
        },
      },
    });

    const metrics: PerformanceMetric[] = kpis.map((kpi) => {
      const current = kpi.values[0]?.value ?? 0;
      const previous = kpi.values[1]?.value ?? 0;
      const target = kpi.target ?? 100;

      return {
        id: kpi.id,
        name: kpi.name,
        category: kpi.category ?? '',
        currentValue: Number(current),
        targetValue: Number(target),
        previousValue: Number(previous),
        unit: kpi.unit ?? '',
        trend: current > previous ? 'up' : current < previous ? 'down' : 'stable',
        status: current >= target ? 'on_track' : current >= target * 0.8 ? 'at_risk' : 'behind',
      };
    });

    const onTrack = metrics.filter((m) => m.status === 'on_track').length;
    const atRisk = metrics.filter((m) => m.status === 'at_risk').length;
    const behind = metrics.filter((m) => m.status === 'behind').length;

    // Generate performance chart
    const chartBuffer = await chartRendererService.renderChart({
      chartType: 'bar',
      title: 'الأداء',
      labels: metrics.slice(0, 10).map((m) => m.name),
      datasets: [
        {
          label: 'القيمة الحالية',
          data: metrics.slice(0, 10).map((m) => m.currentValue),
          backgroundColor: '#3B82F6',
        },
        {
          label: 'المستهدف',
          data: metrics.slice(0, 10).map((m) => m.targetValue),
          backgroundColor: '#10B981',
        },
      ],
      width: 800,
      height: 400,
    });

    const reportData = {
      title: `تقرير الأداء — ${this.getPeriodLabel(period)}`,
      date: new Date().toISOString(),
      period: { ...dateRange, label: this.getPeriodLabel(period) },
      summary: {
        totalMetrics: metrics.length,
        onTrack,
        atRisk,
        behind,
        overallHealth: Math.round((onTrack / Math.max(metrics.length, 1)) * 100),
      },
      metrics,
      charts: [{ name: 'performance-overview', buffer: chartBuffer }],
    };

    const content = await templateEngineService.renderReport(
      'performance',
      reportData,
      outputFormat
    );

    const report = await prisma.report.create({
      data: {
        tenantId,
        name: reportData.title,
        type: 'performance',
        format: outputFormat.toUpperCase() as 'PDF' | 'DOCX' | 'HTML',
        status: 'COMPLETED',
        metadata: {
          period,
          totalMetrics: metrics.length,
          overallHealth: reportData.summary.overallHealth,
        },
        generatedAt: new Date(),
      },
    });

    logger.info('Performance report generated', { reportId: report.id });
    return { reportId: report.id, content, format: outputFormat };
  }

  /**
   * إنشاء تقرير التحقق (Validation Report)
   */
  async generateValidationReport(
    tenantId: string,
    options: {
      datasetId?: string;
      checks?: string[];
      outputFormat?: 'pdf' | 'docx' | 'html';
    } = {}
  ): Promise<{ reportId: string; content: Buffer; format: string }> {
    const { datasetId, outputFormat = 'pdf' } = options;

    const datasets = datasetId
      ? [await prisma.dataset.findFirst({ where: { id: datasetId, tenantId } })]
      : await prisma.dataset.findMany({
          where: { tenantId, status: 'ACTIVE' },
          take: 20,
          orderBy: { updatedAt: 'desc' },
        });

    const validationChecks: ValidationCheck[] = [];

    for (const ds of datasets.filter(Boolean)) {
      if (!ds) continue;
      const columns = await prisma.datasetColumn.findMany({ where: { datasetId: ds.id } });
      const rowCount = await prisma.dataRow.count({ where: { datasetId: ds.id } });

      // Data completeness check
      const nullableCols = columns.filter((c: { nullable: boolean | null }) => c.nullable);
      validationChecks.push({
        id: `completeness-${ds.id}`,
        name: `اكتمال البيانات: ${ds.name}`,
        category: 'completeness',
        status: nullableCols.length < columns.length * 0.5 ? 'passed' : 'warning',
        details: `${columns.length} عمود، ${nullableCols.length} يقبل القيم الفارغة`,
        checkedAt: new Date(),
        duration: 0,
      });

      // Row count validation
      validationChecks.push({
        id: `rowcount-${ds.id}`,
        name: `عدد الصفوف: ${ds.name}`,
        category: 'integrity',
        status: rowCount > 0 ? 'passed' : 'failed',
        details: `${rowCount} صف في قاعدة البيانات`,
        checkedAt: new Date(),
        duration: 0,
      });

      // Type consistency check
      for (const col of columns) {
        validationChecks.push({
          id: `type-${ds.id}-${col.id}`,
          name: `نوع البيانات: ${ds.name}.${col.name}`,
          category: 'type_consistency',
          status: col.dataType ? 'passed' : 'warning',
          details: `النوع المتوقع: ${col.dataType ?? 'غير محدد'}`,
          checkedAt: new Date(),
          duration: 0,
        });
      }
    }

    const passed = validationChecks.filter((c) => c.status === 'passed').length;
    const failed = validationChecks.filter((c) => c.status === 'failed').length;
    const warnings = validationChecks.filter((c) => c.status === 'warning').length;

    const reportData = {
      title: 'تقرير التحقق من البيانات',
      date: new Date().toISOString(),
      summary: {
        totalChecks: validationChecks.length,
        passed,
        failed,
        warnings,
        passRate: Math.round((passed / Math.max(validationChecks.length, 1)) * 100),
      },
      checks: validationChecks,
    };

    const content = await templateEngineService.renderReport(
      'validation',
      reportData,
      outputFormat
    );

    const report = await prisma.report.create({
      data: {
        tenantId,
        name: reportData.title,
        type: 'validation',
        format: outputFormat.toUpperCase() as 'PDF' | 'DOCX' | 'HTML',
        status: 'COMPLETED',
        metadata: {
          totalChecks: validationChecks.length,
          passRate: reportData.summary.passRate,
        },
        generatedAt: new Date(),
      },
    });

    logger.info('Validation report generated', { reportId: report.id });
    return { reportId: report.id, content, format: outputFormat };
  }

  /**
   * إنشاء تقرير التدقيق والتتبع (Audit & Tracking Report)
   */
  async generateAuditReport(
    tenantId: string,
    options: {
      dateFrom?: Date;
      dateTo?: Date;
      userId?: string;
      entityType?: string;
      outputFormat?: 'pdf' | 'docx' | 'html';
    } = {}
  ): Promise<{ reportId: string; content: Buffer; format: string }> {
    const { dateFrom, dateTo, userId, entityType, outputFormat = 'pdf' } = options;

    const where: Record<string, unknown> = { tenantId };
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }
    if (userId) where.userId = userId;
    if (entityType) where.entityType = entityType;

    const auditLogs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    const entries: AuditEntry[] = auditLogs.map((log) => ({
      id: log.id,
      action: log.action as string,
      entityType: log.entityType ?? '',
      entityId: log.entityId ?? '',
      userId: log.userId ?? '',
      userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Unknown',
      timestamp: log.createdAt,
      changes: (log.changes ?? {}) as Record<string, { old: unknown; new: unknown }>,
      ipAddress: log.ipAddress ?? undefined,
    }));

    // Aggregate by action type
    const actionCounts: Record<string, number> = {};
    for (const entry of entries) {
      actionCounts[entry.action] = (actionCounts[entry.action] ?? 0) + 1;
    }

    // Aggregate by user
    const userCounts: Record<string, number> = {};
    for (const entry of entries) {
      userCounts[entry.userName] = (userCounts[entry.userName] ?? 0) + 1;
    }

    const chartBuffer = await chartRendererService.renderChart({
      chartType: 'bar',
      title: 'العمليات',
      labels: Object.keys(actionCounts).slice(0, 10),
      datasets: [
        {
          label: 'عدد العمليات',
          data: Object.values(actionCounts).slice(0, 10),
          backgroundColor: '#6366F1',
        },
      ],
      width: 800,
      height: 400,
    });

    const reportData = {
      title: 'تقرير التدقيق والتتبع',
      date: new Date().toISOString(),
      dateRange: { from: dateFrom?.toISOString(), to: dateTo?.toISOString() },
      summary: {
        totalEntries: entries.length,
        uniqueUsers: Object.keys(userCounts).length,
        uniqueActions: Object.keys(actionCounts).length,
        topAction: Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-',
      },
      actionBreakdown: actionCounts,
      userBreakdown: userCounts,
      entries: entries.slice(0, 200),
      charts: [{ name: 'audit-actions', buffer: chartBuffer }],
    };

    const content = await templateEngineService.renderReport(
      'audit',
      reportData,
      outputFormat
    );

    const report = await prisma.report.create({
      data: {
        tenantId,
        name: reportData.title,
        type: 'audit',
        format: outputFormat.toUpperCase() as 'PDF' | 'DOCX' | 'HTML',
        status: 'COMPLETED',
        metadata: {
          totalEntries: entries.length,
          dateRange: reportData.dateRange,
        },
        generatedAt: new Date(),
      },
    });

    logger.info('Audit report generated', { reportId: report.id });
    return { reportId: report.id, content, format: outputFormat };
  }

  /**
   * محرك التقارير الديناميكي — يبني تقرير من أي بيانات مع أقسام مخصصة
   */
  async generateDynamicReport(
    tenantId: string,
    config: {
      title: string;
      description?: string;
      sections: Array<{
        title: string;
        type: 'text' | 'table' | 'chart' | 'kpi' | 'summary';
        dataSource: string;
        query?: string;
        chartType?: string;
        columns?: string[];
      }>;
      outputFormat?: 'pdf' | 'docx' | 'html';
      branding?: { logo?: string; primaryColor?: string; fontFamily?: string };
    }
  ): Promise<{ reportId: string; content: Buffer; format: string }> {
    const { title, description, sections, outputFormat = 'pdf', branding } = config;

    const resolvedSections: Array<Record<string, unknown>> = [];

    for (const section of sections) {
      const sectionData: Record<string, unknown> = {
        title: section.title,
        type: section.type,
      };

      // Resolve data source
      if (section.dataSource.startsWith('dataset:')) {
        const datasetId = section.dataSource.replace('dataset:', '');
        const dataset = await prisma.dataset.findFirst({
          where: { id: datasetId, tenantId },
          include: { columns: true },
        });

        if (dataset) {
          const rows = await prisma.dataRow.findMany({
            where: { datasetId },
            orderBy: { rowIndex: 'asc' },
            take: 500,
          });

          sectionData.data = rows.map((r) => r.data);
          sectionData.columns = section.columns ?? dataset.columns.map((c) => c.name);
        }
      } else if (section.dataSource.startsWith('kpi:')) {
        const category = section.dataSource.replace('kpi:', '');
        const kpis = await prisma.kpi.findMany({
          where: { tenantId, category },
          include: { values: { orderBy: { recordedAt: 'desc' }, take: 1 } },
        });

        sectionData.data = kpis.map((k) => ({
          name: k.name,
          value: k.values[0]?.value ?? 0,
          unit: (k as Record<string, unknown>).unit,
        }));
      }

      // Generate chart if needed
      if (section.type === 'chart' && sectionData.data) {
        const data = sectionData.data as Array<Record<string, unknown>>;
        const cols = (sectionData.columns as string[]) ?? Object.keys(data[0] ?? {});

        sectionData.chartBuffer = await chartRendererService.renderChart({
          chartType: (section.chartType as 'bar' | 'line' | 'pie') ?? 'bar',
          title: (section.title as string) ?? '',
          labels: data.slice(0, 20).map((d) => String(d[cols[0]] ?? '')),
          datasets: cols.slice(1).map((col, i) => ({
            label: col,
            data: data.slice(0, 20).map((d) => Number(d[col] ?? 0)),
            backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'][i % 4],
          })),
          width: 800,
          height: 400,
        });
      }

      resolvedSections.push(sectionData);
    }

    const reportData = {
      title,
      description,
      date: new Date().toISOString(),
      sections: resolvedSections,
      branding,
    };

    const content = await templateEngineService.renderReport(
      'dynamic',
      reportData,
      outputFormat
    );

    const report = await prisma.report.create({
      data: {
        tenantId,
        name: title,
        type: 'dynamic',
        format: outputFormat.toUpperCase() as 'PDF' | 'DOCX' | 'HTML',
        status: 'COMPLETED',
        metadata: {
          sectionCount: sections.length,
          description,
        },
        generatedAt: new Date(),
      },
    });

    logger.info('Dynamic report generated', { reportId: report.id, sections: sections.length });
    return { reportId: report.id, content, format: outputFormat };
  }

  // ─── Helpers ─────────────────────────────────────────

  private determineComplianceStatus(
    policy: Record<string, unknown>
  ): ComplianceRule['status'] {
    const status = String(policy.status ?? '').toLowerCase();
    if (status === 'compliant' || status === 'active') return 'compliant';
    if (status === 'non_compliant' || status === 'failed') return 'non_compliant';
    if (status === 'partial' || status === 'in_progress') return 'partial';
    return 'not_applicable';
  }

  private getDateRange(period: string): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();

    switch (period) {
      case 'daily':
        start.setDate(start.getDate() - 1);
        break;
      case 'weekly':
        start.setDate(start.getDate() - 7);
        break;
      case 'monthly':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'quarterly':
        start.setMonth(start.getMonth() - 3);
        break;
      case 'yearly':
        start.setFullYear(start.getFullYear() - 1);
        break;
    }

    return { start, end };
  }

  private getPeriodLabel(period: string): string {
    const labels: Record<string, string> = {
      daily: 'يومي',
      weekly: 'أسبوعي',
      monthly: 'شهري',
      quarterly: 'ربع سنوي',
      yearly: 'سنوي',
    };
    return labels[period] ?? period;
  }
}

export const specializedReportsService = new SpecializedReportsService();
