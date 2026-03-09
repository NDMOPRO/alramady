import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface KPIChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ApprovalRequest {
  id: string;
  kpiId: string;
  tenantId: string;
  changes: KPIChange[];
  submittedBy: string;
  status: string;
  requiredApprovers: string[];
  impactAnalysis: ImpactAnalysis;
  expiresAt: Date;
  createdAt: Date;
}

export interface ApprovalVote {
  approverId: string;
  decision: 'approve' | 'reject';
  reason?: string;
  votedAt: Date;
}

export interface ImpactAnalysis {
  affectedReports: { id: string; name: string }[];
  affectedDashboards: { id: string; name: string }[];
  totalAffectedUsers: number;
}

export interface ApprovalRequestDetails extends ApprovalRequest {
  votes: ApprovalVote[];
}

export interface ApprovalListResult {
  requests: ApprovalRequest[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class KPIApprovalService {
  private static readonly PAGE_SIZE = 20;
  private static readonly EXPIRY_DAYS = 7;

  constructor(private prisma: PrismaClient) {}

  async submitChange(
    kpiId: string,
    changes: KPIChange[],
    submittedBy: string,
    tenantId: string,
  ): Promise<ApprovalRequest> {
    const kpi = await this.prisma.kpi.findUnique({
      where: { id: kpiId },
    });

    if (!kpi) {
      throw new Error(`KPI ${kpiId} not found`);
    }

    const [affectedReports, affectedDashboards] = await Promise.all([
      this.prisma.report.findMany({
        where: {
          kpiIds: { has: kpiId },
          tenantId,
          deletedAt: null,
        },
        select: { id: true, name: true },
      }),
      this.prisma.dashboard.findMany({
        where: {
          kpiIds: { has: kpiId },
          tenantId,
          deletedAt: null,
        },
        select: { id: true, name: true },
      }),
    ]);

    const affectedUserIds = new Set<string>();

    for (const report of affectedReports) {
      const viewers = await this.prisma.reportAccess.findMany({
        where: { reportId: report.id, deletedAt: null },
        select: { userId: true },
      });
      for (const v of viewers) {
        affectedUserIds.add(v.userId);
      }
    }

    for (const dashboard of affectedDashboards) {
      const viewers = await this.prisma.dashboardAccess.findMany({
        where: { dashboardId: dashboard.id, deletedAt: null },
        select: { userId: true },
      });
      for (const v of viewers) {
        affectedUserIds.add(v.userId);
      }
    }

    const impactAnalysis: ImpactAnalysis = {
      affectedReports: affectedReports.map((r) => ({ id: r.id, name: r.name })),
      affectedDashboards: affectedDashboards.map((d) => ({
        id: d.id,
        name: d.name,
      })),
      totalAffectedUsers: affectedUserIds.size,
    };

    const approverRoles = await this.prisma.userRole.findMany({
      where: {
        tenantId,
        deletedAt: null,
        role: {
          name: { in: ['ADMIN', 'DATA_STEWARD'] },
        },
      },
      include: { role: true },
      distinct: ['userId'],
    });

    const requiredApprovers = approverRoles
      .map((ar) => ar.userId)
      .filter((id) => id !== submittedBy);

    if (requiredApprovers.length === 0) {
      throw new Error(
        'No eligible approvers found. At least one admin or data_steward is required.',
      );
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + KPIApprovalService.EXPIRY_DAYS);

    const requestHash = createHash('sha256')
      .update(JSON.stringify({ kpiId, changes, submittedBy, tenantId }))
      .digest('hex')
      .substring(0, 16);

    const request = await this.prisma.kpiApprovalRequest.create({
      data: {
        kpiId,
        tenantId,
        changes: JSON.stringify(changes),
        submittedBy,
        status: 'pending',
        requiredApprovers: JSON.stringify(requiredApprovers),
        impactAnalysis: JSON.stringify(impactAnalysis),
        requestHash,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return {
      id: request.id,
      kpiId,
      tenantId,
      changes,
      submittedBy,
      status: 'pending',
      requiredApprovers,
      impactAnalysis,
      expiresAt,
      createdAt: request.createdAt,
    };
  }

  async approve(
    requestId: string,
    approverId: string,
  ): Promise<{ status: string; applied: boolean }> {
    const request = await this.prisma.kpiApprovalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== 'pending') {
      throw new Error(
        `Request ${requestId} is not pending (status: ${request.status})`,
      );
    }

    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      await this.prisma.kpiApprovalRequest.update({
        where: { id: requestId },
        data: { status: 'expired', updatedAt: new Date() },
      });
      throw new Error(`Request ${requestId} has expired`);
    }

    const requiredApprovers: string[] = JSON.parse(
      request.requiredApprovers as string,
    );

    if (!requiredApprovers.includes(approverId)) {
      throw new Error(
        `User ${approverId} is not in the required approvers list`,
      );
    }

    const existingVote = await this.prisma.kpiApprovalVote.findFirst({
      where: { requestId, approverId },
    });

    if (existingVote) {
      throw new Error(`User ${approverId} has already voted on this request`);
    }

    await this.prisma.kpiApprovalVote.create({
      data: {
        requestId,
        approverId,
        decision: 'approve',
        votedAt: new Date(),
      },
    });

    const allVotes = await this.prisma.kpiApprovalVote.findMany({
      where: { requestId },
    });

    const approveVotes = allVotes.filter((v) => v.decision === 'approve');
    const allApproved = requiredApprovers.every((approver) =>
      approveVotes.some((v) => v.approverId === approver),
    );

    if (allApproved) {
      const changes: KPIChange[] = JSON.parse(request.changes as string);

      const updateData: Record<string, unknown> = {};
      for (const change of changes) {
        updateData[change.field] = change.newValue;
      }
      updateData['updatedAt'] = new Date();

      await this.prisma.kpi.update({
        where: { id: request.kpiId },
        data: updateData,
      });

      await this.prisma.kpiApprovalRequest.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          resolvedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return { status: 'approved', applied: true };
    }

    return {
      status: 'pending',
      applied: false,
    };
  }

  async reject(
    requestId: string,
    rejectorId: string,
    reason: string,
  ): Promise<void> {
    const request = await this.prisma.kpiApprovalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== 'pending') {
      throw new Error(
        `Request ${requestId} is not pending (status: ${request.status})`,
      );
    }

    await this.prisma.kpiApprovalVote.create({
      data: {
        requestId,
        approverId: rejectorId,
        decision: 'reject',
        reason,
        votedAt: new Date(),
      },
    });

    await this.prisma.kpiApprovalRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        rejectedBy: rejectorId,
        rejectionReason: reason,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async listRequests(
    tenantId: string,
    status?: string,
    page: number = 1,
  ): Promise<ApprovalListResult> {
    const where: Record<string, unknown> = { tenantId };
    if (status) {
      where.status = status;
    }

    const [requests, total] = await Promise.all([
      this.prisma.kpiApprovalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * KPIApprovalService.PAGE_SIZE,
        take: KPIApprovalService.PAGE_SIZE,
      }),
      this.prisma.kpiApprovalRequest.count({ where }),
    ]);

    return {
      requests: requests.map((r) => ({
        id: r.id,
        kpiId: r.kpiId,
        tenantId: r.tenantId,
        changes: JSON.parse(r.changes as string),
        submittedBy: r.submittedBy,
        status: r.status,
        requiredApprovers: JSON.parse(r.requiredApprovers as string),
        impactAnalysis: JSON.parse(r.impactAnalysis as string),
        expiresAt: r.expiresAt || new Date(),
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize: KPIApprovalService.PAGE_SIZE,
    };
  }

  async previewImpact(
    kpiId: string,
    proposedFormula: string,
    tenantId: string,
  ): Promise<{
    oldValues: number[];
    newValues: number[];
    percentageChange: number;
    affectedDashboards: { id: string; name: string }[];
  }> {
    const kpi = await this.prisma.kpi.findUnique({ where: { id: kpiId } });
    if (!kpi) throw new Error(`KPI ${kpiId} not found`);

    const affectedDashboards = await this.prisma.dashboard.findMany({
      where: { kpiIds: { has: kpiId }, tenantId, deletedAt: null },
      select: { id: true, name: true },
    });

    // Fetch last 12 months of KPI values
    const kpiValues = await this.prisma.kpiValue.findMany({
      where: { kpiId },
      orderBy: { periodDate: 'desc' },
      take: 12,
    });

    const oldValues = kpiValues.map((v) => Number(v.value)).reverse();

    // Simulate new values by evaluating the proposed formula
    // The formula references are resolved against historical data
    const newValues = oldValues.map((oldVal) => {
      try {
        const formulaFn = new Function('value', `return ${proposedFormula.replace(/\bvalue\b/g, 'value')}`);
        return Number(formulaFn(oldVal)) || oldVal;
      } catch {
        return oldVal;
      }
    });

    const avgOld = oldValues.length > 0 ? oldValues.reduce((a, b) => a + b, 0) / oldValues.length : 0;
    const avgNew = newValues.length > 0 ? newValues.reduce((a, b) => a + b, 0) / newValues.length : 0;
    const percentageChange = avgOld !== 0 ? ((avgNew - avgOld) / avgOld) * 100 : 0;

    return {
      oldValues,
      newValues,
      percentageChange,
      affectedDashboards: affectedDashboards.map((d) => ({ id: d.id, name: d.name })),
    };
  }

  async classifySensitivity(
    kpiId: string,
    level: 'public' | 'internal' | 'confidential' | 'restricted',
    classifiedBy: string,
  ): Promise<void> {
    const kpi = await this.prisma.kpi.findUnique({ where: { id: kpiId } });
    if (!kpi) throw new Error(`KPI ${kpiId} not found`);

    await this.prisma.kpi.update({
      where: { id: kpiId },
      data: {
        sensitivityLevel: level,
        updatedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'kpi_sensitivity_classified',
        entityType: 'kpi',
        entityId: kpiId,
        userId: classifiedBy,
        tenantId: kpi.tenantId,
        details: JSON.stringify({ level }),
        createdAt: new Date(),
      },
    });
  }

  async getRequestDetails(
    requestId: string,
  ): Promise<ApprovalRequestDetails> {
    const request = await this.prisma.kpiApprovalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    const votes = await this.prisma.kpiApprovalVote.findMany({
      where: { requestId },
      orderBy: { votedAt: 'asc' },
    });

    return {
      id: request.id,
      kpiId: request.kpiId,
      tenantId: request.tenantId,
      changes: JSON.parse(request.changes as string),
      submittedBy: request.submittedBy,
      status: request.status,
      requiredApprovers: JSON.parse(request.requiredApprovers as string),
      impactAnalysis: JSON.parse(request.impactAnalysis as string),
      expiresAt: request.expiresAt || new Date(),
      createdAt: request.createdAt,
      votes: votes.map((v) => ({
        approverId: v.approverId,
        decision: v.decision as 'approve' | 'reject',
        reason: v.reason || undefined,
        votedAt: v.votedAt,
      })),
    };
  }
}
