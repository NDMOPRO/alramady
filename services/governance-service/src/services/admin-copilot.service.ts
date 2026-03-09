import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PermissionSuggestion {
  id: string;
  tenantId: string;
  userId: string;
  action: 'add' | 'remove';
  permission: string;
  resource: string;
  reason: string;
  confidence: number;
  status: string;
  createdAt: Date;
}

export interface SuggestionListResult {
  suggestions: PermissionSuggestion[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AdminCopilotService {
  private openai: OpenAI;
  private static readonly PAGE_SIZE = 20;
  private static readonly AUDIT_LOG_LIMIT = 200;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async suggestPermissions(
    userId: string,
    tenantId: string,
  ): Promise<PermissionSuggestion[]> {
    const [auditLogs, currentPermissions, userRoles] = await Promise.all([
      this.prisma.rlsAudit.findMany({
        where: { userId, tenantId },
        orderBy: { createdAt: 'desc' },
        take: AdminCopilotService.AUDIT_LOG_LIMIT,
      }),
      this.prisma.permission.findMany({
        where: { userId, tenantId, deletedAt: null },
      }),
      this.prisma.userRole.findMany({
        where: { userId, tenantId, deletedAt: null },
        include: { role: true },
      }),
    ]);

    const allowedAccesses = auditLogs.filter((log) => log.allowed);
    const deniedAccesses = auditLogs.filter((log) => !log.allowed);

    const deniedResourceCounts = new Map<string, number>();
    for (const denied of deniedAccesses) {
      const key = `${denied.resource}:${denied.action}`;
      deniedResourceCounts.set(key, (deniedResourceCounts.get(key) || 0) + 1);
    }

    const allowedResourceCounts = new Map<string, number>();
    for (const allowed of allowedAccesses) {
      const key = `${allowed.resource}:${allowed.action}`;
      allowedResourceCounts.set(
        key,
        (allowedResourceCounts.get(key) || 0) + 1,
      );
    }

    const prompt = `You are an enterprise permission management AI assistant. Analyze the following user activity data and current permissions, then suggest permission changes.

User ID: ${userId}
Tenant ID: ${tenantId}

Current Roles: ${userRoles.map((ur) => ur.role.name).join(', ') || 'none'}

Current Permissions:
${currentPermissions.map((p) => `- ${p.resource}:${p.action} (granted: ${p.createdAt.toISOString()})`).join('\n') || 'No permissions assigned'}

Access Denied Events (resource:action -> count):
${Array.from(deniedResourceCounts.entries()).map(([key, count]) => `- ${key}: ${count} times`).join('\n') || 'No denied access events'}

Access Allowed Events (resource:action -> count):
${Array.from(allowedResourceCounts.entries()).map(([key, count]) => `- ${key}: ${count} times`).join('\n') || 'No allowed access events'}

Respond with a JSON array of permission change suggestions. Each suggestion must have:
- action: "add" or "remove"
- permission: the permission name
- resource: the resource type
- reason: brief explanation
- confidence: number between 0 and 1

Only suggest changes that are clearly justified by the data. Respond with ONLY the JSON array, no other text.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(responseText);
    const suggestionsArray: Array<{
      action: 'add' | 'remove';
      permission: string;
      resource: string;
      reason: string;
      confidence: number;
    }> = Array.isArray(parsed) ? parsed : parsed.suggestions || [];

    const savedSuggestions: PermissionSuggestion[] = [];

    for (const suggestion of suggestionsArray) {
      const record = await this.prisma.permissionSuggestion.create({
        data: {
          tenantId,
          userId,
          action: suggestion.action,
          permission: suggestion.permission,
          resource: suggestion.resource,
          reason: suggestion.reason,
          confidence: suggestion.confidence,
          status: 'pending_review',
          modelUsed: 'gpt-4o',
          promptHash: Buffer.from(prompt)
            .toString('base64')
            .substring(0, 64),
          createdAt: new Date(),
        },
      });

      savedSuggestions.push({
        id: record.id,
        tenantId,
        userId,
        action: suggestion.action,
        permission: suggestion.permission,
        resource: suggestion.resource,
        reason: suggestion.reason,
        confidence: suggestion.confidence,
        status: 'pending_review',
        createdAt: record.createdAt,
      });
    }

    return savedSuggestions;
  }

  async applyApprovedSuggestion(
    suggestionId: string,
    approvedBy: string,
  ): Promise<void> {
    const suggestion = await this.prisma.permissionSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    if (suggestion.status !== 'approved') {
      throw new Error(
        `Suggestion ${suggestionId} is not approved (current status: ${suggestion.status})`,
      );
    }

    if (suggestion.action === 'add') {
      // Find a default role for the user to satisfy the required roleId field
      const userRole = await this.prisma.userRole.findFirst({
        where: { userId: suggestion.userId, tenantId: suggestion.tenantId, deletedAt: null },
      });
      if (!userRole) {
        throw new Error(`No role found for user ${suggestion.userId} in tenant ${suggestion.tenantId}`);
      }
      await this.prisma.permission.create({
        data: {
          roleId: userRole.roleId,
          userId: suggestion.userId,
          tenantId: suggestion.tenantId,
          resource: suggestion.resource,
          action: suggestion.permission,
          grantedBy: approvedBy,
          source: 'copilot_suggestion',
          suggestionId: suggestion.id,
          createdAt: new Date(),
        },
      });
    } else if (suggestion.action === 'remove') {
      await this.prisma.permission.updateMany({
        where: {
          userId: suggestion.userId,
          tenantId: suggestion.tenantId,
          resource: suggestion.resource,
          action: suggestion.permission,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
          revokedBy: approvedBy,
          revokeReason: `Copilot suggestion: ${suggestion.reason}`,
        },
      });
    }

    await this.prisma.permissionSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'applied',
        appliedBy: approvedBy,
        appliedAt: new Date(),
      },
    });
  }

  async listSuggestions(
    tenantId: string,
    status?: string,
    page: number = 1,
  ): Promise<SuggestionListResult> {
    const where: Record<string, unknown> = { tenantId };
    if (status) {
      where.status = status;
    }

    const [suggestions, total] = await Promise.all([
      this.prisma.permissionSuggestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * AdminCopilotService.PAGE_SIZE,
        take: AdminCopilotService.PAGE_SIZE,
      }),
      this.prisma.permissionSuggestion.count({ where }),
    ]);

    return {
      suggestions: suggestions.map((s) => ({
        id: s.id,
        tenantId: s.tenantId,
        userId: s.userId,
        action: s.action as 'add' | 'remove',
        permission: s.permission,
        resource: s.resource,
        reason: s.reason || '',
        confidence: s.confidence,
        status: s.status,
        createdAt: s.createdAt,
      })),
      total,
      page,
      pageSize: AdminCopilotService.PAGE_SIZE,
    };
  }

  async reviewSuggestion(
    suggestionId: string,
    reviewerId: string,
    decision: 'approve' | 'reject',
  ): Promise<void> {
    const suggestion = await this.prisma.permissionSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    if (suggestion.status !== 'pending_review') {
      throw new Error(
        `Suggestion ${suggestionId} has already been reviewed (status: ${suggestion.status})`,
      );
    }

    const newStatus = decision === 'approve' ? 'approved' : 'rejected';

    await this.prisma.permissionSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: newStatus,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
    });
  }
}
