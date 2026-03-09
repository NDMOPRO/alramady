import { PrismaClient, Prisma } from '@prisma/client';
import { createHash } from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface RLSAccessCheck {
  userId: string;
  tenantId: string;
  resource: string;
  resourceId?: string;
  action: 'read' | 'write' | 'delete' | 'admin';
}

export interface RLSAccessResult {
  allowed: boolean;
  filters?: RLSFilter[];
  reason: string;
}

export interface RLSFilter {
  field: string;
  operator: 'eq' | 'in' | 'gte' | 'lte';
  value: unknown;
}

export interface RLSPolicyConfig {
  resourceType: string;
  actions: string[];
  conditions: RLSFilter[];
  expiresAt?: Date;
  description?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class RLSService {
  constructor(private prisma: PrismaClient) {}

  async checkAccess(params: RLSAccessCheck): Promise<RLSAccessResult> {
    const { userId, tenantId, resource, resourceId, action } = params;

    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId, tenantId, deletedAt: null },
    });

    if (!membership) {
      const result: RLSAccessResult = {
        allowed: false,
        reason: `User ${userId} is not a member of tenant ${tenantId}`,
      };
      await this.logAccess(params, result.allowed, result.reason);
      return result;
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId, tenantId, deletedAt: null },
      include: { role: true },
    });

    const isAdmin = userRoles.some(
      (ur) => ur.role.name === 'admin' || ur.role.name === 'super_admin',
    );

    if (isAdmin) {
      const result: RLSAccessResult = {
        allowed: true,
        reason: 'Admin bypass: user has admin role',
      };
      await this.logAccess(params, result.allowed, result.reason);
      return result;
    }

    const policies = await this.prisma.rlsPolicy.findMany({
      where: {
        tenantId,
        resourceType: resource,
        active: true,
        deletedAt: null,
      },
      orderBy: { priority: 'asc' },
    });

    if (policies.length === 0) {
      const result: RLSAccessResult = {
        allowed: true,
        reason: 'No RLS policies defined for this resource; default allow',
      };
      await this.logAccess(params, result.allowed, result.reason);
      return result;
    }

    const collectedFilters: RLSFilter[] = [];

    for (const policy of policies) {
      if (policy.expiresAt && new Date(policy.expiresAt) < new Date()) {
        continue;
      }

      const config = policy.config as unknown as {
        actions: string[];
        conditions: RLSFilter[];
        roleRestrictions?: string[];
      };

      if (!config.actions.includes(action) && !config.actions.includes('*')) {
        continue;
      }

      if (config.roleRestrictions && config.roleRestrictions.length > 0) {
        const userRoleNames = userRoles.map((ur) => ur.role.name);
        const hasRequiredRole = config.roleRestrictions.some((r) =>
          userRoleNames.includes(r),
        );
        if (!hasRequiredRole) {
          const result: RLSAccessResult = {
            allowed: false,
            reason: `Policy "${policy.name}" requires roles: ${config.roleRestrictions.join(', ')}`,
          };
          await this.logAccess(params, result.allowed, result.reason);
          return result;
        }
      }

      if (config.conditions && config.conditions.length > 0) {
        collectedFilters.push(...config.conditions);
      }
    }

    const result: RLSAccessResult = {
      allowed: true,
      filters: collectedFilters.length > 0 ? collectedFilters : undefined,
      reason:
        collectedFilters.length > 0
          ? `Access granted with ${collectedFilters.length} filter(s) applied`
          : 'Access granted; all policy conditions met',
    };

    await this.logAccess(params, result.allowed, result.reason);
    return result;
  }

  async logAccess(
    params: RLSAccessCheck,
    allowed: boolean,
    reason: string,
  ): Promise<void> {
    const checksum = createHash('sha256')
      .update(
        JSON.stringify({
          ...params,
          allowed,
          reason,
          timestamp: Date.now(),
        }),
      )
      .digest('hex');

    await this.prisma.rlsAudit.create({
      data: {
        userId: params.userId,
        tenantId: params.tenantId,
        resource: params.resource,
        resourceId: params.resourceId || null,
        action: params.action,
        allowed,
        reason,
        checksum,
        createdAt: new Date(),
      },
    });
  }

  applyRowFilters<T extends Record<string, unknown>>(
    data: T[],
    filters: RLSFilter[],
  ): T[] {
    return data.filter((record) => {
      return filters.every((filter) => {
        const fieldValue = record[filter.field];

        switch (filter.operator) {
          case 'eq':
            return fieldValue === filter.value;

          case 'in': {
            const allowedValues = filter.value as unknown[];
            return allowedValues.includes(fieldValue);
          }

          case 'gte': {
            const numVal = Number(fieldValue);
            const threshold = Number(filter.value);
            if (Number.isNaN(numVal) || Number.isNaN(threshold)) return false;
            return numVal >= threshold;
          }

          case 'lte': {
            const numVal = Number(fieldValue);
            const threshold = Number(filter.value);
            if (Number.isNaN(numVal) || Number.isNaN(threshold)) return false;
            return numVal <= threshold;
          }

          default:
            return true;
        }
      });
    });
  }

  async createPolicy(
    tenantId: string,
    resourceType: string,
    config: RLSPolicyConfig,
  ): Promise<{ id: string; name: string }> {
    const name = `${resourceType}_policy_${Date.now()}`;

    const existingCount = await this.prisma.rlsPolicy.count({
      where: { tenantId, resourceType, active: true, deletedAt: null },
    });

    const policy = await this.prisma.rlsPolicy.create({
      data: {
        tenantId,
        resourceType,
        name,
        description: config.description || `RLS policy for ${resourceType}`,
        config: {
          actions: config.actions,
          conditions: config.conditions as Record<string, unknown>,
        } as Record<string, unknown>,
        priority: existingCount + 1,
        active: true,
        expiresAt: config.expiresAt || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return { id: policy.id, name: policy.name };
  }

  async listPolicies(
    tenantId: string,
  ): Promise<
    {
      id: string;
      name: string;
      resourceType: string;
      active: boolean;
      priority: number;
      expiresAt: Date | null;
      createdAt: Date;
    }[]
  > {
    const policies = await this.prisma.rlsPolicy.findMany({
      where: { tenantId, active: true, deletedAt: null },
      orderBy: [{ resourceType: 'asc' }, { priority: 'asc' }],
      select: {
        id: true,
        name: true,
        resourceType: true,
        active: true,
        priority: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return policies;
  }

  async deletePolicy(policyId: string): Promise<void> {
    const policy = await this.prisma.rlsPolicy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      throw new Error(`RLS policy ${policyId} not found`);
    }

    if (policy.deletedAt) {
      throw new Error(`RLS policy ${policyId} is already deleted`);
    }

    await this.prisma.rlsPolicy.update({
      where: { id: policyId },
      data: {
        active: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}
