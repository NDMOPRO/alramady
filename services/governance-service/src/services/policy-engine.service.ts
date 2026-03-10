/**
 * Policy Engine — Rasid Platform
 * محرك السياسات مع عزل المستأجرين (Tenant Isolation) وإنفاذ السياسات
 * يغطي: F-04286, F-04289
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';

type PolicyAction = 'allow' | 'deny' | 'require_approval' | 'log_only';

interface PolicyRule {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
  conditions: PolicyCondition[];
  effect: PolicyAction;
  priority: number;
  enabled: boolean;
}

interface PolicyCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in' | 'not_in' | 'exists' | 'regex';
  value: unknown;
}

interface PolicyEvaluationResult {
  allowed: boolean;
  action: PolicyAction;
  matchedPolicy: string | null;
  reason: string;
  requiresApproval: boolean;
  approvalWorkflowId?: string;
  tenantId: string;
}

interface TenantPolicy {
  tenantId: string;
  maxUsers: number;
  maxStorage: number;
  allowedEngines: string[];
  dataRetentionDays: number;
  ipWhitelist: string[];
  mfaRequired: boolean;
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    maxAgeDays: number;
    historyCount: number;
  };
  apiRateLimit: number;
  exportAllowed: boolean;
  sharingAllowed: boolean;
}

export class PolicyEngineService {
  private readonly CACHE_PREFIX = 'policy-engine';
  private readonly CACHE_TTL = 300;

  /**
   * تقييم سياسة لعملية معينة
   */
  async evaluate(
    tenantId: string,
    userId: string,
    resource: string,
    action: string,
    context: Record<string, unknown> = {}
  ): Promise<PolicyEvaluationResult> {
    // 1. Enforce tenant isolation first
    const tenantValid = await this.validateTenantAccess(tenantId, userId);
    if (!tenantValid) {
      return {
        allowed: false,
        action: 'deny',
        matchedPolicy: 'tenant_isolation',
        reason: 'المستخدم لا ينتمي لهذا المستأجر',
        requiresApproval: false,
        tenantId,
      };
    }

    // 2. Check tenant-level policies
    const tenantPolicy = await this.getTenantPolicy(tenantId);
    const tenantCheck = this.checkTenantLimits(tenantPolicy, resource, action, context);
    if (!tenantCheck.allowed) {
      return { ...tenantCheck, tenantId };
    }

    // 3. Evaluate resource-level policies
    const policies = await this.getActivePolicies(tenantId, resource, action);

    // Sort by priority (highest first)
    policies.sort((a, b) => b.priority - a.priority);

    for (const policy of policies) {
      const matches = this.evaluateConditions(policy.conditions, context);
      if (matches) {
        logger.info('Policy matched', {
          policyId: policy.id,
          policyName: policy.name,
          effect: policy.effect,
          tenantId,
          userId,
          resource,
          action,
        });

        if (policy.effect === 'deny') {
          return {
            allowed: false,
            action: 'deny',
            matchedPolicy: policy.id,
            reason: policy.description,
            requiresApproval: false,
            tenantId,
          };
        }

        if (policy.effect === 'require_approval') {
          const workflow = await this.findApprovalWorkflow(tenantId, resource, action);
          return {
            allowed: false,
            action: 'require_approval',
            matchedPolicy: policy.id,
            reason: `تتطلب موافقة: ${policy.description}`,
            requiresApproval: true,
            approvalWorkflowId: workflow?.id,
            tenantId,
          };
        }

        if (policy.effect === 'log_only') {
          await this.logPolicyAction(tenantId, userId, resource, action, policy.id, context);
          // Continue to next policy
          continue;
        }

        // Effect is 'allow'
        return {
          allowed: true,
          action: 'allow',
          matchedPolicy: policy.id,
          reason: policy.description,
          requiresApproval: false,
          tenantId,
        };
      }
    }

    // Default: allow if no explicit deny policy matched
    return {
      allowed: true,
      action: 'allow',
      matchedPolicy: null,
      reason: 'لا توجد سياسة رفض مطبقة',
      requiresApproval: false,
      tenantId,
    };
  }

  /**
   * إنشاء سياسة جديدة
   */
  async createPolicy(
    tenantId: string,
    policy: Omit<PolicyRule, 'id'>
  ): Promise<PolicyRule> {
    const record = await prisma.policy.create({
      data: {
        tenantId,
        name: policy.name,
        description: policy.description,
        resource: policy.resource,
        action: policy.action,
        conditions: JSON.parse(JSON.stringify(policy.conditions)) as Prisma.InputJsonValue,
        effect: policy.effect,
        priority: policy.priority,
        enabled: policy.enabled,
      },
    });

    await cacheDel(`${this.CACHE_PREFIX}:${tenantId}:*`);

    logger.info('Policy created', { policyId: record.id, tenantId });

    return {
      id: record.id,
      name: record.name,
      description: record.description,
      resource: record.resource,
      action: record.action,
      conditions: record.conditions as unknown as PolicyCondition[],
      effect: record.effect as PolicyAction,
      priority: record.priority,
      enabled: record.enabled,
    };
  }

  /**
   * الحصول على سياسات المستأجر
   */
  async getTenantPolicy(tenantId: string): Promise<TenantPolicy> {
    const cacheKey = `${this.CACHE_PREFIX}:tenant:${tenantId}`;
    const cached = await cacheGet<TenantPolicy>(cacheKey);
    if (cached) return cached;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        maxUsers: true,
        maxStorage: true,
        settings: true,
        plan: true,
      },
    });

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const settings = (tenant.settings ?? {}) as Record<string, unknown>;

    const policy: TenantPolicy = {
      tenantId,
      maxUsers: tenant.maxUsers,
      maxStorage: Number(tenant.maxStorage),
      allowedEngines: (settings.allowedEngines as string[]) ?? [
        'data', 'excel', 'dashboard', 'reports', 'presentations',
        'matching', 'localization', 'conversion', 'ai', 'governance',
      ],
      dataRetentionDays: (settings.dataRetentionDays as number) ?? 365,
      ipWhitelist: (settings.ipWhitelist as string[]) ?? [],
      mfaRequired: (settings.mfaRequired as boolean) ?? false,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialChars: false,
        maxAgeDays: 90,
        historyCount: 5,
        ...(settings.passwordPolicy as Record<string, unknown> ?? {}),
      },
      apiRateLimit: (settings.apiRateLimit as number) ?? 1000,
      exportAllowed: (settings.exportAllowed as boolean) ?? true,
      sharingAllowed: (settings.sharingAllowed as boolean) ?? true,
    };

    await cacheSet(cacheKey, policy, this.CACHE_TTL);
    return policy;
  }

  /**
   * تحديث سياسات المستأجر
   */
  async updateTenantPolicy(
    tenantId: string,
    updates: Partial<TenantPolicy>
  ): Promise<TenantPolicy> {
    const current = await this.getTenantPolicy(tenantId);
    const merged = { ...current, ...updates };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        maxUsers: merged.maxUsers,
        maxStorage: BigInt(merged.maxStorage),
        settings: {
          allowedEngines: merged.allowedEngines,
          dataRetentionDays: merged.dataRetentionDays,
          ipWhitelist: merged.ipWhitelist,
          mfaRequired: merged.mfaRequired,
          passwordPolicy: merged.passwordPolicy,
          apiRateLimit: merged.apiRateLimit,
          exportAllowed: merged.exportAllowed,
          sharingAllowed: merged.sharingAllowed,
        },
      },
    });

    await cacheDel(`${this.CACHE_PREFIX}:tenant:${tenantId}`);
    logger.info('Tenant policy updated', { tenantId });

    return merged;
  }

  /**
   * التحقق من عزل المستأجر
   */
  async validateTenantAccess(tenantId: string, userId: string): Promise<boolean> {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });
    return !!user;
  }

  /**
   * إنفاذ عزل المستأجر على الاستعلامات
   */
  enforceTenantIsolation(
    tenantId: string,
    where: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      ...where,
      tenantId,
    };
  }

  // ─── Private methods ─────────────────────────────────────

  private async getActivePolicies(
    tenantId: string,
    resource: string,
    action: string
  ): Promise<PolicyRule[]> {
    const cacheKey = `${this.CACHE_PREFIX}:${tenantId}:${resource}:${action}`;
    const cached = await cacheGet<PolicyRule[]>(cacheKey);
    if (cached) return cached;

    const records = await prisma.policy.findMany({
      where: {
        tenantId,
        enabled: true,
        OR: [
          { resource, action },
          { resource: '*', action },
          { resource, action: '*' },
          { resource: '*', action: '*' },
        ],
      },
      orderBy: { priority: 'desc' },
    });

    const policies: PolicyRule[] = records.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      resource: r.resource,
      action: r.action,
      conditions: (r.conditions as unknown as PolicyCondition[]) ?? [],
      effect: r.effect as PolicyAction,
      priority: r.priority,
      enabled: r.enabled,
    }));

    await cacheSet(cacheKey, policies, this.CACHE_TTL);
    return policies;
  }

  private evaluateConditions(
    conditions: PolicyCondition[],
    context: Record<string, unknown>
  ): boolean {
    if (conditions.length === 0) return true;

    return conditions.every((cond) => {
      const value = this.getNestedValue(context, cond.field);

      switch (cond.operator) {
        case 'eq':
          return value === cond.value;
        case 'neq':
          return value !== cond.value;
        case 'gt':
          return typeof value === 'number' && value > (cond.value as number);
        case 'lt':
          return typeof value === 'number' && value < (cond.value as number);
        case 'gte':
          return typeof value === 'number' && value >= (cond.value as number);
        case 'lte':
          return typeof value === 'number' && value <= (cond.value as number);
        case 'contains':
          return typeof value === 'string' && value.includes(String(cond.value));
        case 'in':
          return Array.isArray(cond.value) && cond.value.includes(value);
        case 'not_in':
          return Array.isArray(cond.value) && !cond.value.includes(value);
        case 'exists':
          return value !== undefined && value !== null;
        case 'regex':
          return typeof value === 'string' && new RegExp(String(cond.value)).test(value);
        default:
          return false;
      }
    });
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((acc: unknown, key) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  private checkTenantLimits(
    policy: TenantPolicy,
    resource: string,
    action: string,
    context: Record<string, unknown>
  ): PolicyEvaluationResult {
    // Check engine access
    if (resource.startsWith('engine:')) {
      const engineName = resource.replace('engine:', '');
      if (!policy.allowedEngines.includes(engineName)) {
        return {
          allowed: false,
          action: 'deny',
          matchedPolicy: 'tenant_engine_limit',
          reason: `المحرك "${engineName}" غير مفعّل في خطة المستأجر`,
          requiresApproval: false,
          tenantId: policy.tenantId,
        };
      }
    }

    // Check export permission
    if (action === 'export' && !policy.exportAllowed) {
      return {
        allowed: false,
        action: 'deny',
        matchedPolicy: 'tenant_export_disabled',
        reason: 'التصدير معطّل في سياسة المستأجر',
        requiresApproval: false,
        tenantId: policy.tenantId,
      };
    }

    // Check sharing permission
    if (action === 'share' && !policy.sharingAllowed) {
      return {
        allowed: false,
        action: 'deny',
        matchedPolicy: 'tenant_sharing_disabled',
        reason: 'المشاركة معطّلة في سياسة المستأجر',
        requiresApproval: false,
        tenantId: policy.tenantId,
      };
    }

    // Check IP whitelist
    if (policy.ipWhitelist.length > 0) {
      const clientIp = context.ipAddress as string;
      if (clientIp && !policy.ipWhitelist.includes(clientIp)) {
        return {
          allowed: false,
          action: 'deny',
          matchedPolicy: 'ip_whitelist',
          reason: `عنوان IP ${clientIp} غير مسموح`,
          requiresApproval: false,
          tenantId: policy.tenantId,
        };
      }
    }

    return {
      allowed: true,
      action: 'allow',
      matchedPolicy: null,
      reason: '',
      requiresApproval: false,
      tenantId: policy.tenantId,
    };
  }

  private async findApprovalWorkflow(
    tenantId: string,
    resource: string,
    action: string
  ): Promise<{ id: string } | null> {
    const workflow = await prisma.workflowDefinition.findFirst({
      where: {
        tenantId,
        triggerResource: resource,
        triggerAction: action,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return workflow;
  }

  private async logPolicyAction(
    tenantId: string,
    userId: string,
    resource: string,
    action: string,
    policyId: string,
    context: Record<string, unknown>
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: `policy_evaluation:${action}`,
        entityType: resource,
        entityId: policyId,
        changes: JSON.parse(JSON.stringify(context)) as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });
  }
}

export const policyEngineService = new PolicyEngineService();
