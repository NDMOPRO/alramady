import { PrismaClient, Prisma } from '@prisma/client';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface FlagEvaluationResult {
  flagKey: string;
  enabled: boolean;
  reason: string;
}

export interface FlagRuleConditions {
  userIds?: string[];
  roleIds?: string[];
  percentage?: number;
}

export interface FlagRecord {
  id: string;
  key: string;
  tenantId: string;
  defaultValue: boolean;
  description: string | null;
  enabled: boolean;
  createdAt: Date;
}

export interface FlagRuleRecord {
  id: string;
  flagId: string;
  conditions: FlagRuleConditions;
  resultValue: boolean;
  priority: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class FeatureFlagsService {
  constructor(private prisma: PrismaClient) {}

  async evaluate(
    flagKey: string,
    userId: string,
    tenantId: string,
  ): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findFirst({
      where: { key: flagKey, tenantId, deletedAt: null },
      include: {
        rules: {
          where: { deletedAt: null },
          orderBy: { priority: 'asc' },
        },
      },
    });

    if (!flag) {
      return false;
    }

    if (!flag.enabled) {
      return flag.defaultValue;
    }

    if (!flag.rules || flag.rules.length === 0) {
      return flag.defaultValue;
    }

    for (const rule of flag.rules) {
      const conditions = rule.conditions as FlagRuleConditions;
      const matched = await this.evaluateRule(conditions, userId, tenantId);

      if (matched) {
        return rule.resultValue;
      }
    }

    return flag.defaultValue;
  }

  async evaluateRule(
    rule: FlagRuleConditions,
    userId: string,
    tenantId: string,
  ): Promise<boolean> {
    if (rule.userIds && rule.userIds.length > 0) {
      if (!rule.userIds.includes(userId)) {
        return false;
      }
    }

    if (rule.roleIds && rule.roleIds.length > 0) {
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId, tenantId, deletedAt: null },
        select: { roleId: true },
      });

      const userRoleIds = userRoles.map((ur) => ur.roleId);
      const hasMatchingRole = rule.roleIds.some((roleId) =>
        userRoleIds.includes(roleId),
      );

      if (!hasMatchingRole) {
        return false;
      }
    }

    if (rule.percentage !== undefined && rule.percentage !== null) {
      const hashInput = `${userId}:${tenantId}`;
      const hashValue = this.consistentHash(hashInput);

      if (hashValue >= rule.percentage) {
        return false;
      }
    }

    return true;
  }

  consistentHash(input: string): number {
    // FNV-1a hash algorithm
    let hash = 0x811c9dc5; // FNV offset basis (32-bit)

    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      // FNV prime for 32-bit: 0x01000193
      // Multiply using bit operations to stay in 32-bit integer range
      hash = (hash * 0x01000193) >>> 0;
    }

    // Map to 0-99 range
    return hash % 100;
  }

  async createFlag(
    key: string,
    tenantId: string,
    defaultValue: boolean,
    description: string,
  ): Promise<FlagRecord> {
    const existing = await this.prisma.featureFlag.findFirst({
      where: { key, tenantId, deletedAt: null },
    });

    if (existing) {
      throw new Error(
        `Feature flag with key "${key}" already exists in tenant ${tenantId}`,
      );
    }

    const flag = await this.prisma.featureFlag.create({
      data: {
        key,
        tenantId,
        defaultValue,
        description,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return {
      id: flag.id,
      key: flag.key,
      tenantId: flag.tenantId,
      defaultValue: flag.defaultValue,
      description: flag.description || '',
      enabled: flag.enabled,
      createdAt: flag.createdAt,
    };
  }

  async updateFlag(
    flagId: string,
    updates: Partial<{
      defaultValue: boolean;
      description: string;
      enabled: boolean;
    }>,
  ): Promise<FlagRecord> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    });

    if (!flag || flag.deletedAt) {
      throw new Error(`Feature flag ${flagId} not found`);
    }

    const updated = await this.prisma.featureFlag.update({
      where: { id: flagId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });

    return {
      id: updated.id,
      key: updated.key,
      tenantId: updated.tenantId,
      defaultValue: updated.defaultValue,
      description: updated.description || '',
      enabled: updated.enabled,
      createdAt: updated.createdAt,
    };
  }

  async addRule(
    flagId: string,
    conditions: FlagRuleConditions,
    resultValue: boolean,
    priority: number,
  ): Promise<FlagRuleRecord> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    });

    if (!flag || flag.deletedAt) {
      throw new Error(`Feature flag ${flagId} not found`);
    }

    const rule = await this.prisma.featureFlagRule.create({
      data: {
        flagId,
        conditions: conditions as Prisma.InputJsonValue,
        resultValue,
        priority,
        createdAt: new Date(),
      },
    });

    return {
      id: rule.id,
      flagId: rule.flagId,
      conditions: rule.conditions as FlagRuleConditions,
      resultValue: rule.resultValue,
      priority: rule.priority,
    };
  }

  async listFlags(tenantId: string): Promise<FlagRecord[]> {
    const flags = await this.prisma.featureFlag.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { key: 'asc' },
    });

    return flags.map((f) => ({
      id: f.id,
      key: f.key,
      tenantId: f.tenantId,
      defaultValue: f.defaultValue,
      description: f.description || '',
      enabled: f.enabled,
      createdAt: f.createdAt,
    }));
  }
}
