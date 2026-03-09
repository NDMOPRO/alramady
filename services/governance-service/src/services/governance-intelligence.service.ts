import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Service ─────────────────────────────────────────────────────────────────

export class GovernanceIntelligenceService {
  async analyzeDataPolicyGraph(tenantId: string): Promise<{
    nodes: Array<{ id: string; type: string; label: string }>;
    edges: Array<{ source: string; target: string; type: string }>;
    metrics: { totalPolicies: number; totalUsers: number; totalPermissions: number };
  }> {
    const [policies, roles, users] = await Promise.all([
      prisma.policy.findMany({ where: { tenantId } }),
      prisma.role.findMany({
        where: { tenantId },
        include: { permissions: true },
      }),
      prisma.user.findMany({
        where: { tenantId },
        select: { id: true, email: true },
      }),
    ]);

    const nodes: Array<{ id: string; type: string; label: string }> = [
      ...policies.map((p) => ({ id: p.id, type: 'policy', label: p.name })),
      ...roles.map((r) => ({ id: r.id, type: 'role', label: r.name })),
      ...users.map((u) => ({ id: u.id, type: 'user', label: u.email })),
    ];

    const edges: Array<{ source: string; target: string; type: string }> = [];

    for (const role of roles) {
      for (const perm of role.permissions) {
        edges.push({
          source: role.id,
          target: perm.id,
          type: perm.action,
        });
      }
    }

    const totalPermissions = roles.reduce((sum, r) => sum + r.permissions.length, 0);

    return {
      nodes,
      edges,
      metrics: {
        totalPolicies: policies.length,
        totalUsers: users.length,
        totalPermissions,
      },
    };
  }

  async detectPolicyViolations(tenantId: string, lookbackDays = 7): Promise<{
    violations: unknown[];
    totalViolations: number;
    period: number;
  }> {
    const since = new Date(Date.now() - lookbackDays * 86400000);

    const violations = await prisma.auditLog.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
        action: { in: ['DELETE', 'EXPORT'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return {
      violations,
      totalViolations: violations.length,
      period: lookbackDays,
    };
  }

  async generateComplianceReport(tenantId: string): Promise<{
    tenantId: string;
    complianceScore: number;
    policyGraph: unknown;
    violations: unknown;
    generatedAt: string;
  }> {
    const [graph, violations] = await Promise.all([
      this.analyzeDataPolicyGraph(tenantId),
      this.detectPolicyViolations(tenantId, 30),
    ]);

    const complianceScore = Math.max(0, 100 - violations.totalViolations * 2);

    return {
      tenantId,
      complianceScore,
      policyGraph: graph,
      violations,
      generatedAt: new Date().toISOString(),
    };
  }

  async getPolicyRecommendations(tenantId: string): Promise<{
    recommendations: Array<{ severity: string; message: string; action: string }>;
  }> {
    const graph = await this.analyzeDataPolicyGraph(tenantId);
    const recommendations: Array<{ severity: string; message: string; action: string }> = [];

    if (graph.metrics.totalPolicies === 0) {
      recommendations.push({
        severity: 'high',
        message: 'No policies defined for this tenant',
        action: 'Create at least one data access policy',
      });
    }

    if (graph.metrics.totalPermissions > graph.metrics.totalUsers * 10) {
      recommendations.push({
        severity: 'medium',
        message: 'High permission-to-user ratio detected',
        action: 'Review and consolidate permissions',
      });
    }

    return { recommendations };
  }
}
