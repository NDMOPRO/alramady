import crypto from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

// ─── Interfaces ──────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

interface ApprovalRequest {
  id: string;
  action: string;
  requestedBy: string;
  tenantId: string;
  parameters: Record<string, unknown>;
  riskLevel: RiskLevel;
  status: ApprovalStatus;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  createdAt: Date;
  expiresAt: Date;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RISK_EXPIRY_MS: Record<RiskLevel, number> = {
  critical: 1 * 60 * 60 * 1000,      // 1 hour
  high: 24 * 60 * 60 * 1000,          // 24 hours
  medium: 72 * 60 * 60 * 1000,        // 72 hours
  low: 7 * 24 * 60 * 60 * 1000,       // 7 days
};

const CRITICAL_ACTIONS = [
  'DELETE', 'DROP', 'TRUNCATE', 'DESTROY', 'PURGE',
  'delete_tenant', 'drop_database', 'remove_all', 'factory_reset',
];

const HIGH_RISK_ACTIONS = [
  'UPDATE', 'MODIFY', 'ALTER', 'CHANGE', 'OVERRIDE',
  'update_permissions', 'modify_schema', 'change_config',
  'bulk_update', 'role_change', 'admin_grant',
];

const MEDIUM_RISK_ACTIONS = [
  'EXPORT', 'SHARE', 'PUBLISH', 'SEND', 'TRANSFER',
  'export_data', 'share_external', 'publish_report',
  'transfer_ownership', 'invite_external',
];

// ─── Service ─────────────────────────────────────────────────────────────────

export class SensitiveActionApprovalService {
  constructor(private prisma: PrismaClient) {}

  async requestApproval(
    action: string,
    requestedBy: string,
    tenantId: string,
    params: Record<string, unknown>,
  ): Promise<ApprovalRequest> {
    if (!action || !action.trim()) {
      throw new Error('Action name is required');
    }
    if (!requestedBy || !requestedBy.trim()) {
      throw new Error('Requester user ID is required');
    }
    if (!tenantId || !tenantId.trim()) {
      throw new Error('Tenant ID is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: requestedBy },
      select: { id: true, name: true, tenantId: true },
    });

    if (!user) {
      throw new Error(`User '${requestedBy}' not found`);
    }

    const riskLevel = this.classifyRiskLevel(action);
    const requestId = crypto.randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + RISK_EXPIRY_MS[riskLevel]);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: requestedBy,
        action: 'approval.requested',
        entityType: 'approval_request',
        entityId: requestId,
        detailsJson: {
          requestId,
          action: action.trim(),
          requestedBy,
          tenantId,
          parameters: params,
          riskLevel,
          status: 'pending' as ApprovalStatus,
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    // Notify appropriate approvers based on risk level
    await this.notifyApprovers(requestId, action, riskLevel, tenantId, requestedBy);

    logger.info('Approval request created', {
      requestId,
      action: action.trim(),
      requestedBy,
      riskLevel,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      id: requestId,
      action: action.trim(),
      requestedBy,
      tenantId,
      parameters: params,
      riskLevel,
      status: 'pending',
      createdAt,
      expiresAt,
    };
  }

  async approve(requestId: string, approverId: string): Promise<void> {
    if (!requestId || !approverId) {
      throw new Error('Request ID and approver ID are required');
    }

    const request = await this.getApprovalRecord(requestId);

    if (request.status !== 'pending') {
      throw new Error(`Cannot approve: request is already '${request.status}'`);
    }

    // Verify approver authority
    const approver = await this.prisma.user.findUnique({
      where: { id: approverId },
      select: { id: true, role: true, tenantId: true },
    });

    if (!approver) {
      throw new Error(`Approver '${approverId}' not found`);
    }

    this.validateApproverAuthority(approver.role || '', request.riskLevel);

    if (request.requestedBy === approverId) {
      throw new Error('Self-approval is not permitted');
    }

    const now = new Date();

    await this.prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        userId: approverId,
        action: 'approval.approved',
        entityType: 'approval_request',
        entityId: requestId,
        detailsJson: {
          requestId,
          action: request.action,
          requestedBy: request.requestedBy,
          tenantId: request.tenantId,
          parameters: request.parameters,
          riskLevel: request.riskLevel,
          status: 'approved' as ApprovalStatus,
          approvedBy: approverId,
          approvedAt: now.toISOString(),
          createdAt: request.createdAt.toISOString(),
          expiresAt: request.expiresAt.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    logger.info('Approval request approved', {
      requestId,
      approvedBy: approverId,
      action: request.action,
      riskLevel: request.riskLevel,
    });
  }

  async reject(requestId: string, approverId: string, reason: string): Promise<void> {
    if (!requestId || !approverId) {
      throw new Error('Request ID and approver ID are required');
    }
    if (!reason || !reason.trim()) {
      throw new Error('Rejection reason is required');
    }

    const request = await this.getApprovalRecord(requestId);

    if (request.status !== 'pending') {
      throw new Error(`Cannot reject: request is already '${request.status}'`);
    }

    const approver = await this.prisma.user.findUnique({
      where: { id: approverId },
      select: { id: true, role: true, tenantId: true },
    });

    if (!approver) {
      throw new Error(`Approver '${approverId}' not found`);
    }

    this.validateApproverAuthority(approver.role || '', request.riskLevel);

    const now = new Date();

    await this.prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        userId: approverId,
        action: 'approval.rejected',
        entityType: 'approval_request',
        entityId: requestId,
        detailsJson: {
          requestId,
          action: request.action,
          requestedBy: request.requestedBy,
          tenantId: request.tenantId,
          parameters: request.parameters,
          riskLevel: request.riskLevel,
          status: 'rejected' as ApprovalStatus,
          rejectedBy: approverId,
          rejectionReason: reason.trim(),
          rejectedAt: now.toISOString(),
          createdAt: request.createdAt.toISOString(),
          expiresAt: request.expiresAt.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    logger.info('Approval request rejected', {
      requestId,
      rejectedBy: approverId,
      reason: reason.trim(),
      action: request.action,
    });
  }

  async checkApproval(requestId: string): Promise<ApprovalRequest> {
    if (!requestId) {
      throw new Error('Request ID is required');
    }

    const request = await this.getApprovalRecord(requestId);

    // Auto-expire if past deadline and still pending
    if (request.status === 'pending' && new Date() > request.expiresAt) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          userId: 'system',
          action: 'approval.expired',
          entityType: 'approval_request',
          entityId: requestId,
          detailsJson: {
            requestId,
            action: request.action,
            requestedBy: request.requestedBy,
            tenantId: request.tenantId,
            parameters: request.parameters,
            riskLevel: request.riskLevel,
            status: 'expired' as ApprovalStatus,
            expiredAt: new Date().toISOString(),
            createdAt: request.createdAt.toISOString(),
            expiresAt: request.expiresAt.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      logger.info('Approval request auto-expired', { requestId, action: request.action });

      return { ...request, status: 'expired' };
    }

    return request;
  }

  classifyRiskLevel(action: string): RiskLevel {
    const upperAction = action.toUpperCase().trim();

    for (const pattern of CRITICAL_ACTIONS) {
      if (upperAction.includes(pattern.toUpperCase())) {
        return 'critical';
      }
    }

    for (const pattern of HIGH_RISK_ACTIONS) {
      if (upperAction.includes(pattern.toUpperCase())) {
        return 'high';
      }
    }

    for (const pattern of MEDIUM_RISK_ACTIONS) {
      if (upperAction.includes(pattern.toUpperCase())) {
        return 'medium';
      }
    }

    return 'low';
  }

  private async getApprovalRecord(requestId: string): Promise<ApprovalRequest> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        entityId: requestId,
        entityType: 'approval_request',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (logs.length === 0) {
      throw new Error(`Approval request '${requestId}' not found`);
    }

    const data = logs[0].detailsJson as Record<string, unknown>;

    return {
      id: data.requestId as string,
      action: data.action as string,
      requestedBy: data.requestedBy as string,
      tenantId: data.tenantId as string,
      parameters: (data.parameters as Record<string, unknown>) ?? {},
      riskLevel: data.riskLevel as RiskLevel,
      status: data.status as ApprovalStatus,
      approvedBy: data.approvedBy as string | undefined,
      rejectedBy: data.rejectedBy as string | undefined,
      rejectionReason: data.rejectionReason as string | undefined,
      createdAt: new Date(data.createdAt as string),
      expiresAt: new Date(data.expiresAt as string),
    };
  }

  private validateApproverAuthority(role: string, riskLevel: RiskLevel): void {
    const requiredRoles: Record<RiskLevel, string[]> = {
      critical: ['admin', 'super_admin'],
      high: ['admin', 'super_admin', 'manager'],
      medium: ['admin', 'super_admin', 'manager', 'team_lead'],
      low: ['admin', 'super_admin', 'manager', 'team_lead', 'reviewer'],
    };

    const allowedRoles = requiredRoles[riskLevel];
    if (!allowedRoles.includes(role)) {
      throw new Error(
        `Role '${role}' does not have authority to approve '${riskLevel}' risk actions. Required roles: ${allowedRoles.join(', ')}`,
      );
    }
  }

  private async notifyApprovers(
    requestId: string,
    action: string,
    riskLevel: RiskLevel,
    tenantId: string,
    requestedBy: string,
  ): Promise<void> {
    const approverRoles: Record<RiskLevel, string[]> = {
      critical: ['admin', 'super_admin'],
      high: ['admin', 'super_admin', 'manager'],
      medium: ['admin', 'super_admin', 'manager', 'team_lead'],
      low: ['admin', 'super_admin', 'manager', 'team_lead', 'reviewer'],
    };

    const roles = approverRoles[riskLevel];

    const approvers = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: roles },
        status: 'ACTIVE',
        id: { not: requestedBy },
      },
      select: { id: true, name: true, email: true },
    });

    for (const approver of approvers) {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: approver.id,
          action: 'notification.created',
          entityType: 'notification',
          entityId: crypto.randomUUID(),
          detailsJson: {
            notificationId: crypto.randomUUID(),
            type: 'approval',
            title: `Approval Required: ${action}`,
            body: `A ${riskLevel}-risk action "${action}" requires your approval. Request ID: ${requestId}`,
            data: { requestId, riskLevel, action },
            read: false,
            readAt: null,
            createdAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    }

    logger.info('Approvers notified', {
      requestId,
      riskLevel,
      notifiedCount: approvers.length,
    });
  }
}
