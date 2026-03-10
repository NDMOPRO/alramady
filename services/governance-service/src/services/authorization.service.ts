import Redis from 'ioredis';
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const PERMISSION_CACHE_TTL = 300;

export class AuthorizationService {

  async createRole(
    name: string,
    permissions: Array<{ resource: string; actions: string[] }>,
    tenantId: string
  ): Promise<Record<string, unknown>> {
    const normalizedName = name.trim().toLowerCase();

    const existingRole = await prisma.role.findFirst({
      where: { name: normalizedName, tenantId },
    });
    if (existingRole) {
      throw new Error(`Role '${normalizedName}' already exists in this tenant`);
    }

    if (!permissions || permissions.length === 0) {
      throw new Error('At least one permission must be provided when creating a role');
    }

    for (const perm of permissions) {
      if (!perm.resource || typeof perm.resource !== 'string') {
        throw new Error('Each permission must have a valid resource name');
      }
      if (!Array.isArray(perm.actions) || perm.actions.length === 0) {
        throw new Error(`Permission for resource '${perm.resource}' must have at least one action`);
      }
    }

    const role = await prisma.role.create({
      data: {
        name: normalizedName,
        tenantId,
        description: `Role: ${name}`,
      },
    });

    const permissionRecords: Array<Record<string, unknown>> = [];
    for (const perm of permissions) {
      for (const action of perm.actions) {
        const permRecord = await prisma.permission.create({
          data: {
            roleId: role.id,
            resourceType: perm.resource,
            action: action.trim().toLowerCase(),
          },
        });
        permissionRecords.push(permRecord);
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: 'system',
        action: 'role.created',
        entityType: 'role',
        entityId: role.id,
        detailsJson: {
          roleName: normalizedName,
          permissionCount: permissionRecords.length,
          permissions: permissions.map(p => ({
            resource: p.resource,
            actions: p.actions,
          })),
        },
      },
    });

    logger.info('Role created successfully', {
      roleId: role.id,
      name: normalizedName,
      tenantId,
      permissionCount: permissionRecords.length,
    });

    return {
      id: role.id,
      name: role.name,
      tenantId: role.tenantId,
      description: role.description,
      permissions: permissions.map(p => ({
        resource: p.resource,
        actions: p.actions,
      })),
      totalPermissions: permissionRecords.length,
      createdAt: role.createdAt,
    };
  }

  async assignRole(
    userId: string,
    roleId: string
  ): Promise<Record<string, unknown>> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error(`User with id '${userId}' not found`);
    }

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });
    if (!role) {
      throw new Error(`Role with id '${roleId}' not found`);
    }

    const existingAssignment = await prisma.userRole.findFirst({
      where: { userId, roleId },
    });
    if (existingAssignment) {
      throw new Error(`User '${userId}' is already assigned role '${role.name}'`);
    }

    const userRole = await prisma.userRole.create({
      data: {
        userId,
        roleId,
      },
    });

    await redis.del(`permissions:${userId}:*`);
    const cacheKeys = await redis.keys(`perm_check:${userId}:*`);
    if (cacheKeys.length > 0) {
      await redis.del(...cacheKeys);
    }

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: 'system',
        action: 'role.assigned',
        entityType: 'user_role',
        entityId: userRole.id,
        detailsJson: {
          targetUserId: userId,
          roleId,
          roleName: role.name,
          permissionsGranted: role.permissions.length,
          assignedAt: new Date().toISOString(),
        },
      },
    });

    logger.info('Role assigned to user', {
      userId,
      roleId,
      roleName: role.name,
    });

    return {
      id: userRole.id,
      userId,
      roleId,
      roleName: role.name,
      permissions: role.permissions.map(p => ({
        resource: p.resourceType,
        action: p.action,
      })),
      assignedAt: userRole.createdAt,
    };
  }

  async checkPermission(
    userId: string,
    resource: string,
    action: string
  ): Promise<{ allowed: boolean; matchingRole: string | null }> {
    const cacheKey = `perm_check:${userId}:${resource}:${action}`;
    const cachedResult = await redis.get(cacheKey);
    if (cachedResult) {
      const parsed = JSON.parse(cachedResult);
      logger.debug('Permission check cache hit', { userId, resource, action, allowed: parsed.allowed });
      return parsed;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      const denied = { allowed: false, matchingRole: null };
      await redis.set(cacheKey, JSON.stringify(denied), 'EX', PERMISSION_CACHE_TTL);
      return denied;
    }

    if (user.role === 'admin' || user.role === 'superadmin') {
      const adminResult = { allowed: true, matchingRole: 'admin' };
      await redis.set(cacheKey, JSON.stringify(adminResult), 'EX', PERMISSION_CACHE_TTL);
      logger.debug('Admin user granted access', { userId, resource, action });
      return adminResult;
    }

    for (const userRole of user.userRoles) {
      const rolePerms = userRole.role.permissions;
      for (const perm of rolePerms) {
        const resourceMatch =
          perm.resourceType === resource ||
          perm.resourceType === '*';
        const actionMatch =
          perm.action === action ||
          perm.action === '*' ||
          perm.action === 'admin';

        if (resourceMatch && actionMatch) {
          const granted = { allowed: true, matchingRole: userRole.role.name };
          await redis.set(cacheKey, JSON.stringify(granted), 'EX', PERMISSION_CACHE_TTL);
          logger.debug('Permission granted', {
            userId,
            resource,
            action,
            matchingRole: userRole.role.name,
          });
          return granted;
        }
      }
    }

    const denied = { allowed: false, matchingRole: null };
    await redis.set(cacheKey, JSON.stringify(denied), 'EX', PERMISSION_CACHE_TTL);
    logger.debug('Permission denied', { userId, resource, action });

    return denied;
  }

  async createPolicy(
    name: string,
    rules: Array<{ resource: string; action: string; condition: Record<string, unknown> }>,
    tenantId: string
  ): Promise<Record<string, unknown>> {
    const normalizedName = name.trim();

    if (!rules || rules.length === 0) {
      throw new Error('At least one rule must be provided for the policy');
    }

    for (const rule of rules) {
      if (!rule.resource || !rule.action) {
        throw new Error('Each rule must specify a resource and an action');
      }
    }

    const policy = await prisma.auditLog.create({
      data: {
        tenantId,
        userId: 'system',
        action: 'policy.created',
        entityType: 'policy',
        entityId: `policy_${Date.now()}`,
        detailsJson: {
          policyName: normalizedName,
          rules: rules.map(r => ({
            resource: r.resource,
            action: r.action,
            condition: r.condition,
          })),
          createdAt: new Date().toISOString(),
          type: 'ABAC',
        } as Prisma.InputJsonValue,
      },
    });

    const policyId = policy.entityId || policy.id;

    await redis.set(
      `policy:${tenantId}:${policyId}`,
      JSON.stringify({
        id: policyId,
        name: normalizedName,
        tenantId,
        rules,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      }),
      'EX',
      86400
    );

    logger.info('ABAC policy created', {
      policyId,
      name: normalizedName,
      tenantId,
      ruleCount: rules.length,
    });

    return {
      id: policyId,
      name: normalizedName,
      tenantId,
      rules,
      status: 'ACTIVE',
      ruleCount: rules.length,
      createdAt: new Date().toISOString(),
    };
  }

  async evaluatePolicy(
    userId: string,
    resource: string,
    action: string,
    context: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return { allowed: false, reason: 'User not found', evaluatedPolicies: 0 };
    }

    const policyKeys = await redis.keys(`policy:${user.tenantId}:*`);
    const evaluationResults: Array<Record<string, unknown>> = [];
    let finalDecision = false;
    let matchedPolicyName: string | null = null;

    for (const key of policyKeys) {
      const policyRaw = await redis.get(key);
      if (!policyRaw) continue;

      const policy = JSON.parse(policyRaw);
      if (policy.status !== 'ACTIVE') continue;

      for (const rule of policy.rules) {
        if (rule.resource !== resource && rule.resource !== '*') continue;
        if (rule.action !== action && rule.action !== '*') continue;

        let conditionMet = true;
        const conditionDetails: Record<string, unknown> = {};

        if (rule.condition) {
          if (rule.condition.timeRange) {
            const now = new Date();
            const currentHour = now.getHours();
            const { start, end } = rule.condition.timeRange;
            const inRange = currentHour >= start && currentHour <= end;
            conditionMet = conditionMet && inRange;
            conditionDetails.timeRange = {
              currentHour,
              requiredRange: `${start}-${end}`,
              met: inRange,
            };
          }

          if (rule.condition.ipWhitelist && context.ip) {
            const ipAllowed = rule.condition.ipWhitelist.includes(context.ip);
            conditionMet = conditionMet && ipAllowed;
            conditionDetails.ipWhitelist = {
              clientIp: context.ip,
              allowed: ipAllowed,
            };
          }

          if (rule.condition.dataClassification && context.classification) {
            const allowedClassifications = rule.condition.dataClassification;
            const classAllowed = allowedClassifications.includes(context.classification);
            conditionMet = conditionMet && classAllowed;
            conditionDetails.dataClassification = {
              dataClass: context.classification,
              allowed: classAllowed,
            };
          }

          if (rule.condition.requiredRole) {
            const hasRole = user.role === rule.condition.requiredRole;
            conditionMet = conditionMet && hasRole;
            conditionDetails.requiredRole = {
              required: rule.condition.requiredRole,
              userRole: user.role,
              met: hasRole,
            };
          }
        }

        evaluationResults.push({
          policyName: policy.name,
          rule: { resource: rule.resource, action: rule.action },
          conditionMet,
          conditionDetails,
        });

        if (conditionMet) {
          finalDecision = true;
          matchedPolicyName = policy.name;
        }
      }
    }

    logger.info('Policy evaluation completed', {
      userId,
      resource,
      action,
      allowed: finalDecision,
      policiesEvaluated: evaluationResults.length,
    });

    return {
      allowed: finalDecision,
      matchedPolicy: matchedPolicyName,
      evaluatedPolicies: evaluationResults.length,
      details: evaluationResults,
      context: {
        userId,
        resource,
        action,
        evaluatedAt: new Date().toISOString(),
      },
    };
  }
}

export const authorizationService = new AuthorizationService();
