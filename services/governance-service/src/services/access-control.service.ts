import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface AccessPolicy {
  id: string;
  name: string;
  description: string;
  resourceType: string;
  resourceId: string;
  rules: AccessRule[];
  priority: number;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccessRule {
  id: string;
  effect: 'allow' | 'deny';
  principals: string[];
  actions: string[];
  fields?: string[];
  conditions?: AccessCondition[];
}

export interface AccessCondition {
  type: 'time_range' | 'ip_range' | 'attribute' | 'environment';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'between' | 'matches';
  field: string;
  value: unknown;
}

export interface AccessRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  resourceType: string;
  resourceId: string;
  requestedActions: string[];
  requestedFields?: string[];
  justification: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  reviewedBy?: string;
  reviewNote?: string;
  expiresAt?: Date;
  createdAt: Date;
}

export interface PermissionDelegation {
  id: string;
  delegatorId: string;
  delegateeId: string;
  resourceType: string;
  resourceId: string;
  delegatedActions: string[];
  delegatedFields?: string[];
  expiresAt: Date;
  revocable: boolean;
  createdAt: Date;
}

export interface AccessEvaluation {
  allowed: boolean;
  matchedRules: string[];
  deniedReasons: string[];
  fieldRestrictions: string[];
  evaluationTimeMs: number;
}

export interface IpAccessRule {
  id: string;
  name: string;
  allowedCidrs: string[];
  blockedCidrs: string[];
  appliesToResources: string[];
  enabled: boolean;
}

export interface AccessAnalytics {
  resourceId: string;
  totalRequests: number;
  uniqueUsers: number;
  deniedRequests: number;
  topActions: { action: string; count: number }[];
  topUsers: { userId: string; count: number }[];
  accessTrend: { date: string; allowed: number; denied: number }[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AccessControlService {
  private readonly CACHE_TTL = 300;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
  ) {}

  async createPolicy(input: Omit<AccessPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<AccessPolicy> {
    const validationErrors = this.validatePolicy(input);
    if (validationErrors.length > 0) {
      throw new Error(`Policy validation failed: ${validationErrors.join(', ')}`);
    }

    const existingPolicies = await this.prisma.accessPolicy.findMany({
      where: { resourceType: input.resourceType, resourceId: input.resourceId },
    });

    for (const existing of existingPolicies) {
      const existingRules: AccessRule[] = JSON.parse(existing.rules as string);
      for (const newRule of input.rules) {
        for (const existingRule of existingRules) {
          if (this.rulesConflict(newRule, existingRule)) {
            if (input.priority <= existing.priority) {
              throw new Error(
                `New rule conflicts with existing policy "${existing.name}" (ID: ${existing.id}). Increase priority to override.`,
              );
            }
          }
        }
      }
    }

    const policy = await this.prisma.accessPolicy.create({
      data: {
        name: input.name,
        description: input.description,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        rules: JSON.stringify(input.rules),
        priority: input.priority,
        enabled: input.enabled,
        createdBy: input.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await this.invalidatePolicyCache(input.resourceType, input.resourceId);

    return {
      ...input,
      id: policy.id,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }

  private validatePolicy(input: Omit<AccessPolicy, 'id' | 'createdAt' | 'updatedAt'>): string[] {
    const errors: string[] = [];
    if (!input.name || input.name.trim().length === 0) errors.push('Policy name is required');
    if (!input.resourceType) errors.push('Resource type is required');
    if (!input.rules || input.rules.length === 0) errors.push('At least one rule is required');

    for (const rule of input.rules) {
      if (!rule.effect) errors.push(`Rule ${rule.id}: effect is required`);
      if (!rule.principals || rule.principals.length === 0) errors.push(`Rule ${rule.id}: at least one principal required`);
      if (!rule.actions || rule.actions.length === 0) errors.push(`Rule ${rule.id}: at least one action required`);

      if (rule.conditions) {
        for (const cond of rule.conditions) {
          if (!cond.type) errors.push(`Rule ${rule.id}: condition type required`);
          if (!cond.field) errors.push(`Rule ${rule.id}: condition field required`);
          if (cond.value === undefined) errors.push(`Rule ${rule.id}: condition value required`);
        }
      }
    }

    return errors;
  }

  private rulesConflict(rule1: AccessRule, rule2: AccessRule): boolean {
    if (rule1.effect === rule2.effect) return false;

    const sharedPrincipals = rule1.principals.some(p =>
      rule2.principals.includes(p) || p === '*' || rule2.principals.includes('*'),
    );
    if (!sharedPrincipals) return false;

    const sharedActions = rule1.actions.some(a =>
      rule2.actions.includes(a) || a === '*' || rule2.actions.includes('*'),
    );
    return sharedActions;
  }

  async evaluateAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    action: string,
    context?: { ip?: string; fields?: string[]; attributes?: Record<string, unknown> },
  ): Promise<AccessEvaluation> {
    const startTime = Date.now();
    const cacheKey = `access:${userId}:${resourceType}:${resourceId}:${action}`;

    const cached = await this.redis.get(cacheKey);
    if (cached && !context?.fields) {
      const cachedResult: AccessEvaluation = JSON.parse(cached);
      cachedResult.evaluationTimeMs = Date.now() - startTime;
      return cachedResult;
    }

    const policies = await this.getApplicablePolicies(resourceType, resourceId);
    const userRoles = await this.getUserRoles(userId);
    const delegations = await this.getActiveDelegations(userId, resourceType, resourceId);
    const allPrincipals = [userId, ...userRoles, ...delegations.map(d => `delegation:${d.id}`)];

    const matchedAllowRules: string[] = [];
    const matchedDenyRules: string[] = [];
    const fieldRestrictions = new Set<string>();
    let explicitAllow = false;
    let explicitDeny = false;

    for (const policy of policies) {
      if (!policy.enabled) continue;

      const rules: AccessRule[] = JSON.parse(policy.rules as string);
      for (const rule of rules) {
        const principalMatch = rule.principals.some(p =>
          p === '*' || allPrincipals.includes(p),
        );
        if (!principalMatch) continue;

        const actionMatch = rule.actions.some(a => a === '*' || a === action);
        if (!actionMatch) continue;

        if (rule.conditions) {
          const conditionsMet = this.evaluateConditions(rule.conditions, context || {});
          if (!conditionsMet) continue;
        }

        if (rule.effect === 'allow') {
          explicitAllow = true;
          matchedAllowRules.push(`${policy.name}:${rule.id}`);

          if (rule.fields && context?.fields) {
            for (const requestedField of context.fields) {
              if (!rule.fields.includes(requestedField) && !rule.fields.includes('*')) {
                fieldRestrictions.add(requestedField);
              }
            }
          }
        } else {
          explicitDeny = true;
          matchedDenyRules.push(`${policy.name}:${rule.id}`);
        }
      }
    }

    const allowed = explicitAllow && !explicitDeny;
    const deniedReasons: string[] = [];

    if (!explicitAllow) {
      deniedReasons.push('No matching allow rule found');
    }
    if (explicitDeny) {
      deniedReasons.push(`Denied by rules: ${matchedDenyRules.join(', ')}`);
    }

    const evaluation: AccessEvaluation = {
      allowed,
      matchedRules: [...matchedAllowRules, ...matchedDenyRules],
      deniedReasons,
      fieldRestrictions: Array.from(fieldRestrictions),
      evaluationTimeMs: Date.now() - startTime,
    };

    if (!context?.fields) {
      await this.redis.set(cacheKey, JSON.stringify(evaluation), 'EX', this.CACHE_TTL);
    }

    await this.logAccessEvaluation(userId, resourceType, resourceId, action, evaluation);

    return evaluation;
  }

  private evaluateConditions(conditions: AccessCondition[], context: Record<string, unknown>): boolean {
    for (const condition of conditions) {
      let met = false;

      if (condition.type === 'time_range') {
        const now = new Date();
        const timeRange = condition.value as { start: string; end: string };
        const startHour = parseInt(timeRange.start.split(':')[0], 10);
        const endHour = parseInt(timeRange.end.split(':')[0], 10);
        const currentHour = now.getHours();
        met = currentHour >= startHour && currentHour < endHour;
      } else if (condition.type === 'ip_range') {
        const clientIp = context.ip as string;
        if (!clientIp) { met = false; continue; }
        const allowedCidrs = condition.value as string[];
        met = allowedCidrs.some(cidr => this.ipMatchesCidr(clientIp, cidr));
      } else if (condition.type === 'attribute') {
        const attributes = context.attributes as Record<string, unknown> || {};
        const attrValue = attributes[condition.field];
        switch (condition.operator) {
          case 'equals': met = attrValue === condition.value; break;
          case 'not_equals': met = attrValue !== condition.value; break;
          case 'in': met = Array.isArray(condition.value) && (condition.value as unknown[]).includes(attrValue); break;
          case 'not_in': met = Array.isArray(condition.value) && !(condition.value as unknown[]).includes(attrValue); break;
          case 'matches': met = new RegExp(String(condition.value)).test(String(attrValue)); break;
          default: met = false;
        }
      }

      if (!met) return false;
    }

    return true;
  }

  private ipMatchesCidr(ip: string, cidr: string): boolean {
    const [cidrIp, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr || '32', 10);
    const ipNum = this.ipToNumber(ip);
    const cidrNum = this.ipToNumber(cidrIp);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (cidrNum & mask);
  }

  private ipToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  async createAccessRequest(
    input: Omit<AccessRequest, 'id' | 'status' | 'createdAt'>,
  ): Promise<AccessRequest> {
    const existingRequest = await this.prisma.accessRequest.findFirst({
      where: {
        requesterId: input.requesterId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        status: 'pending',
      },
    });

    if (existingRequest) {
      throw new Error('A pending request already exists for this resource');
    }

    const request = await this.prisma.accessRequest.create({
      data: {
        requesterId: input.requesterId,
        requesterName: input.requesterName,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        requestedActions: JSON.stringify(input.requestedActions),
        requestedFields: input.requestedFields ? JSON.stringify(input.requestedFields) : null,
        justification: input.justification,
        status: 'pending',
        expiresAt: input.expiresAt || null,
        createdAt: new Date(),
      },
    });

    return {
      ...input,
      id: request.id,
      status: 'pending',
      createdAt: request.createdAt,
    };
  }

  async reviewAccessRequest(
    requestId: string,
    reviewerId: string,
    decision: 'approved' | 'denied',
    note?: string,
  ): Promise<AccessRequest> {
    const request = await this.prisma.accessRequest.findUniqueOrThrow({
      where: { id: requestId },
    });

    if (request.status !== 'pending') {
      throw new Error(`Request is already ${request.status}`);
    }

    await this.prisma.accessRequest.update({
      where: { id: requestId },
      data: {
        status: decision,
        reviewedBy: reviewerId,
        reviewNote: note || null,
        reviewedAt: new Date(),
      },
    });

    if (decision === 'approved') {
      const requestedActions: string[] = JSON.parse(request.requestedActions as string);
      const requestedFields: string[] | undefined = request.requestedFields
        ? JSON.parse(request.requestedFields as string) : undefined;

      await this.createPolicy({
        name: `Auto-grant for ${request.requesterName}`,
        description: `Granted via access request ${requestId}`,
        resourceType: request.resourceType,
        resourceId: request.resourceId || '',
        rules: [{
          id: `rule_${Date.now()}`,
          effect: 'allow',
          principals: [request.requesterId],
          actions: requestedActions,
          fields: requestedFields,
        }],
        priority: 50,
        enabled: true,
        createdBy: reviewerId,
      });

      await this.invalidatePolicyCache(request.resourceType, request.resourceId || '');
    }

    return {
      id: request.id,
      requesterId: request.requesterId,
      requesterName: request.requesterName || '',
      resourceType: request.resourceType,
      resourceId: request.resourceId || '',
      requestedActions: JSON.parse(request.requestedActions as string),
      requestedFields: request.requestedFields ? JSON.parse(request.requestedFields as string) : undefined,
      justification: request.justification || '',
      status: decision,
      reviewedBy: reviewerId,
      reviewNote: note,
      expiresAt: request.expiresAt || undefined,
      createdAt: request.createdAt,
    };
  }

  async delegatePermission(
    input: Omit<PermissionDelegation, 'id' | 'createdAt'>,
  ): Promise<PermissionDelegation> {
    const delegatorAccess = await this.evaluateAccess(
      input.delegatorId,
      input.resourceType,
      input.resourceId,
      input.delegatedActions[0],
    );

    if (!delegatorAccess.allowed) {
      throw new Error('Delegator does not have the permissions being delegated');
    }

    if (input.expiresAt <= new Date()) {
      throw new Error('Delegation expiry must be in the future');
    }

    const existingDelegation = await this.prisma.permissionDelegation.findFirst({
      where: {
        delegatorId: input.delegatorId,
        delegateeId: input.delegateeId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingDelegation) {
      throw new Error('An active delegation already exists for this delegatee and resource');
    }

    const delegation = await this.prisma.permissionDelegation.create({
      data: {
        delegatorId: input.delegatorId,
        delegateeId: input.delegateeId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        delegatedActions: JSON.stringify(input.delegatedActions),
        delegatedFields: input.delegatedFields ? JSON.stringify(input.delegatedFields) : null,
        expiresAt: input.expiresAt,
        revocable: input.revocable,
        createdAt: new Date(),
      },
    });

    await this.invalidatePolicyCache(input.resourceType, input.resourceId);

    return { ...input, id: delegation.id, createdAt: delegation.createdAt };
  }

  async getAccessAnalytics(resourceId: string, days: number = 30): Promise<AccessAnalytics> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await this.prisma.accessLog.findMany({
      where: { resourceId, evaluatedAt: { gte: since } },
    });

    const totalRequests = logs.length;
    const uniqueUsers = new Set(logs.map(l => l.userId)).size;
    const deniedRequests = logs.filter(l => !l.allowed).length;

    const actionCounts = new Map<string, number>();
    const userCounts = new Map<string, number>();
    const dailyStats = new Map<string, { allowed: number; denied: number }>();

    for (const log of logs) {
      actionCounts.set(log.action, (actionCounts.get(log.action) || 0) + 1);
      userCounts.set(log.userId, (userCounts.get(log.userId) || 0) + 1);

      const dateKey = log.evaluatedAt.toISOString().split('T')[0];
      const dayStats = dailyStats.get(dateKey) || { allowed: 0, denied: 0 };
      if (log.allowed) dayStats.allowed += 1;
      else dayStats.denied += 1;
      dailyStats.set(dateKey, dayStats);
    }

    return {
      resourceId,
      totalRequests,
      uniqueUsers,
      deniedRequests,
      topActions: Array.from(actionCounts.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topUsers: Array.from(userCounts.entries())
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      accessTrend: Array.from(dailyStats.entries())
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  private async getApplicablePolicies(resourceType: string, resourceId: string): Promise<unknown[]> {
    const cacheKey = `policies:${resourceType}:${resourceId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const policies = await this.prisma.accessPolicy.findMany({
      where: {
        OR: [
          { resourceType, resourceId },
          { resourceType, resourceId: '*' },
        ],
        enabled: true,
      },
      orderBy: { priority: 'desc' },
    });

    await this.redis.set(cacheKey, JSON.stringify(policies), 'EX', this.CACHE_TTL);
    return policies;
  }

  private async getUserRoles(userId: string): Promise<string[]> {
    const cacheKey = `user-roles:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: true },
    });

    const roles = userRoles.map(r => `role:${r.role}`);
    await this.redis.set(cacheKey, JSON.stringify(roles), 'EX', this.CACHE_TTL);
    return roles;
  }

  private async getActiveDelegations(userId: string, resourceType: string, resourceId: string): Promise<PermissionDelegation[]> {
    const delegations = await this.prisma.permissionDelegation.findMany({
      where: {
        delegateeId: userId,
        resourceType,
        resourceId,
        expiresAt: { gt: new Date() },
      },
    });

    return delegations.map(d => ({
      id: d.id,
      delegatorId: d.delegatorId,
      delegateeId: d.delegateeId,
      resourceType: d.resourceType,
      resourceId: d.resourceId || '',
      delegatedActions: JSON.parse(d.delegatedActions as string),
      delegatedFields: d.delegatedFields ? JSON.parse(d.delegatedFields as string) : undefined,
      expiresAt: d.expiresAt || new Date(),
      revocable: d.revocable,
      createdAt: d.createdAt,
    }));
  }

  private async invalidatePolicyCache(resourceType: string, resourceId: string): Promise<void> {
    await this.redis.del(`policies:${resourceType}:${resourceId}`);
    await this.redis.del(`policies:${resourceType}:*`);
  }

  private async logAccessEvaluation(
    userId: string,
    resourceType: string,
    resourceId: string,
    action: string,
    evaluation: AccessEvaluation,
  ): Promise<void> {
    await this.prisma.accessLog.create({
      data: {
        userId,
        resourceType,
        resourceId,
        action,
        allowed: evaluation.allowed,
        matchedRules: JSON.stringify(evaluation.matchedRules),
        deniedReasons: JSON.stringify(evaluation.deniedReasons),
        evaluationTimeMs: evaluation.evaluationTimeMs,
        evaluatedAt: new Date(),
      },
    });
  }
}
