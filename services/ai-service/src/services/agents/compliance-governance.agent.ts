import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const prisma = new PrismaClient();

export interface AgentResult {
  agentType: string;
  taskType: string;
  suggestions: Array<{ action: string; description: string; confidence: number }>;
  interpretation: string;
  requiresApproval: boolean;
  executedAt: Date;
}

export interface ComplianceGovernanceTask {
  type: 'audit_access' | 'check_compliance' | 'detect_pii' | 'enforce_retention' | 'review_permissions';
  datasetId: string;
  data?: Array<Record<string, number | string | null>>;
  columns?: string[];
  accessLogs?: Array<{ userId: string; action: string; resource: string; timestamp: string; ip?: string }>;
  retentionPolicy?: { maxAgeDays: number; classification: string; region: string };
  permissions?: Array<{ userId: string; role: string; resources: string[]; grantedAt: string }>;
  context?: string;
}

interface PiiMatch {
  column: string;
  type: string;
  count: number;
  sampleIndices: number[];
  confidence: number;
}

export class ComplianceGovernanceAgent {
  private readonly agentType = 'compliance-governance';

  // Saudi National ID: starts with 1 or 2, 10 digits
  private readonly saudiIdPattern = /\b[12]\d{9}\b/;
  // Saudi phone: +966 or 05
  private readonly saudiPhonePattern = /\b(?:\+966|00966|05)\d{8,9}\b/;
  // Email
  private readonly emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  // Saudi IBAN: SA followed by 22 digits
  private readonly ibanPattern = /\bSA\d{22}\b/;
  // Credit card (basic): 16 digits with optional dashes/spaces
  private readonly creditCardPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/;
  // Passport number
  private readonly passportPattern = /\b[A-Z]\d{8}\b/;
  // IP address
  private readonly ipPattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;

  async execute(task: ComplianceGovernanceTask): Promise<AgentResult> {
    switch (task.type) {
      case 'audit_access':
        return this.auditAccess(task);
      case 'check_compliance':
        return this.checkCompliance(task);
      case 'detect_pii':
        return this.detectPii(task);
      case 'enforce_retention':
        return this.enforceRetention(task);
      case 'review_permissions':
        return this.reviewPermissions(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private async auditAccess(task: ComplianceGovernanceTask): Promise<AgentResult> {
    const logs = task.accessLogs ?? [];

    if (logs.length === 0) {
      // Query from audit log table
      const dbLogs = await prisma.auditLog.findMany({
        where: { entityId: task.datasetId },
        orderBy: { performedAt: 'desc' },
        take: 1000,
      });

      const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

      if (dbLogs.length === 0) {
        suggestions.push({
          action: 'no_audit_data',
          description: `No audit logs found for dataset "${task.datasetId}". Ensure audit logging is enabled.`,
          confidence: 1.0,
        });
      } else {
        // Analyze action frequency
        const actionCounts = new Map<string, number>();
        dbLogs.forEach((log) => {
          actionCounts.set(log.action, (actionCounts.get(log.action) ?? 0) + 1);
        });

        const sortedActions = Array.from(actionCounts.entries()).sort((a, b) => b[1] - a[1]);
        sortedActions.forEach(([action, count]) => {
          suggestions.push({
            action: 'access_pattern',
            description: `Action "${action}": ${count} occurrences in audit log`,
            confidence: 0.9,
          });
        });

        // Detect unusual timing
        const hourCounts = new Map<number, number>();
        dbLogs.forEach((log) => {
          const hour = new Date(log.performedAt).getHours();
          hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
        });

        const offHoursAccess = Array.from(hourCounts.entries())
          .filter(([hour]) => hour < 6 || hour > 22)
          .reduce((s, [, count]) => s + count, 0);

        if (offHoursAccess > 0) {
          suggestions.push({
            action: 'off_hours_access',
            description: `${offHoursAccess} access events outside business hours (before 6AM or after 10PM). Review for unauthorized access.`,
            confidence: 0.8,
          });
        }
      }

      const interpretation = `Access audit for dataset "${task.datasetId}": ${dbLogs.length} audit log entries analyzed. ${suggestions.length} findings reported.`;

      await prisma.auditLog.create({
        data: {
          action: 'compliance_audit_access',
          entityType: 'dataset',
          entityId: task.datasetId,
          details: JSON.stringify({ logCount: dbLogs.length, findingsCount: suggestions.length }),
          performedAt: new Date(),
        },
      });

      return {
        agentType: this.agentType,
        taskType: task.type,
        suggestions,
        interpretation,
        requiresApproval: false,
        executedAt: new Date(),
      };
    }

    // Analyze provided access logs
    const userAccessCounts = new Map<string, number>();
    const resourceAccessCounts = new Map<string, number>();
    const actionCounts = new Map<string, number>();
    const userActions = new Map<string, Set<string>>();

    logs.forEach((log) => {
      userAccessCounts.set(log.userId, (userAccessCounts.get(log.userId) ?? 0) + 1);
      resourceAccessCounts.set(log.resource, (resourceAccessCounts.get(log.resource) ?? 0) + 1);
      actionCounts.set(log.action, (actionCounts.get(log.action) ?? 0) + 1);
      if (!userActions.has(log.userId)) userActions.set(log.userId, new Set());
      userActions.get(log.userId)!.add(log.action);
    });

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    // Detect high-frequency users
    const avgAccess = logs.length / (userAccessCounts.size || 1);
    userAccessCounts.forEach((count, userId) => {
      if (count > avgAccess * 3) {
        suggestions.push({
          action: 'high_frequency_user',
          description: `User "${userId}" has ${count} access events (${(count / avgAccess).toFixed(1)}x average). Investigate for potential abuse.`,
          confidence: 0.85,
        });
      }
    });

    // Detect users with excessive action variety
    userActions.forEach((actions, userId) => {
      if (actions.size > 5) {
        suggestions.push({
          action: 'excessive_action_variety',
          description: `User "${userId}" performed ${actions.size} different action types: ${Array.from(actions).join(', ')}. May indicate over-permissioning.`,
          confidence: 0.75,
        });
      }
    });

    // Detect unusual IPs
    if (logs.some((l) => l.ip)) {
      const ipCounts = new Map<string, Set<string>>();
      logs.forEach((log) => {
        if (log.ip) {
          if (!ipCounts.has(log.userId)) ipCounts.set(log.userId, new Set());
          ipCounts.get(log.userId)!.add(log.ip);
        }
      });

      ipCounts.forEach((ips, userId) => {
        if (ips.size > 5) {
          suggestions.push({
            action: 'multiple_ips',
            description: `User "${userId}" accessed from ${ips.size} different IPs. May indicate shared credentials or VPN usage.`,
            confidence: 0.7,
          });
        }
      });
    }

    const interpretation = `Access audit: ${logs.length} log entries from ${userAccessCounts.size} users across ${resourceAccessCounts.size} resources. ${suggestions.length} potential issues identified.`;

    await prisma.auditLog.create({
      data: {
        action: 'compliance_audit_access',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ logCount: logs.length, users: userAccessCounts.size, findings: suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async checkCompliance(task: ComplianceGovernanceTask): Promise<AgentResult> {
    const data = task.data ?? [];
    const columns = task.columns ?? (data.length > 0 ? Object.keys(data[0]) : []);
    const sampleRows = data.slice(0, 20);

    // Run PII detection first
    const piiMatches = this.scanForPii(data, columns);

    const prompt = `You are a data compliance specialist for a Saudi-market analytics platform.
Assess this dataset for compliance with Saudi data protection regulations (PDPL - Personal Data Protection Law) and general data governance standards.

Dataset "${task.datasetId}":
Columns: ${JSON.stringify(columns)}
Row count: ${data.length}
Sample data: ${JSON.stringify(sampleRows.slice(0, 5), null, 2)}

PII Detection Results:
${piiMatches.length > 0 ? JSON.stringify(piiMatches.map((p) => ({ column: p.column, type: p.type, count: p.count, confidence: p.confidence }))) : 'No PII detected'}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "compliance_finding", "description": "specific compliance finding and recommendation", "confidence": 0.9 }
  ],
  "interpretation": "compliance assessment summary in Arabic (formal MSA)"
}

Consider Saudi PDPL requirements:
- Personal data must have lawful basis for processing
- Data subjects must be informed of data collection
- Cross-border data transfer restrictions
- Data retention limits
- Right to deletion
- Breach notification requirements
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for check_compliance');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    // Add PII-based suggestions
    const piiSuggestions = piiMatches.map((p) => ({
      action: 'pii_compliance_risk',
      description: `Column "${p.column}" contains ${p.type} data (${p.count} instances). Requires PDPL-compliant handling: encryption, access control, and retention policy.`,
      confidence: p.confidence,
    }));

    await prisma.auditLog.create({
      data: {
        action: 'compliance_check',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ piiFound: piiMatches.length, complianceFindings: parsed.suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: [...piiSuggestions, ...parsed.suggestions],
      interpretation: parsed.interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async detectPii(task: ComplianceGovernanceTask): Promise<AgentResult> {
    const data = task.data ?? [];
    const columns = task.columns ?? (data.length > 0 ? Object.keys(data[0]) : []);

    const piiMatches = this.scanForPii(data, columns);

    const suggestions = piiMatches.map((p) => ({
      action: `pii_detected_${p.type}`,
      description: `Column "${p.column}": ${p.count} ${p.type} instances detected (confidence: ${(p.confidence * 100).toFixed(0)}%). Sample rows: [${p.sampleIndices.slice(0, 3).join(', ')}]. Action required: mask, encrypt, or remove.`,
      confidence: p.confidence,
    }));

    if (piiMatches.length === 0) {
      suggestions.push({
        action: 'no_pii_detected',
        description: `No PII patterns detected in ${columns.length} columns across ${data.length} rows.`,
        confidence: 0.85,
      });
    }

    const totalPiiCells = piiMatches.reduce((s, p) => s + p.count, 0);
    const piiTypes = [...new Set(piiMatches.map((p) => p.type))];
    const interpretation = `PII detection scan: ${totalPiiCells} PII instances found across ${piiMatches.length} columns. Types detected: ${piiTypes.length > 0 ? piiTypes.join(', ') : 'none'}. ${piiMatches.filter((p) => p.type === 'saudi_national_id' || p.type === 'iban').length > 0 ? 'HIGH RISK: Saudi National ID or IBAN data found - immediate action required.' : ''}`;

    await prisma.auditLog.create({
      data: {
        action: 'compliance_detect_pii',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ piiTypes, totalPiiCells, columnsWithPii: piiMatches.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async enforceRetention(task: ComplianceGovernanceTask): Promise<AgentResult> {
    const policy = task.retentionPolicy ?? { maxAgeDays: 365, classification: 'general', region: 'SA' };
    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    // Query audit logs for data age
    const oldestLogs = await prisma.auditLog.findMany({
      where: { entityId: task.datasetId },
      orderBy: { performedAt: 'asc' },
      take: 1,
    });

    const newestLogs = await prisma.auditLog.findMany({
      where: { entityId: task.datasetId },
      orderBy: { performedAt: 'desc' },
      take: 1,
    });

    const now = new Date();

    if (oldestLogs.length > 0) {
      const oldestDate = new Date(oldestLogs[0].performedAt);
      const ageDays = Math.floor((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24));

      if (ageDays > policy.maxAgeDays) {
        suggestions.push({
          action: 'retention_violation',
          description: `Dataset "${task.datasetId}" has data ${ageDays} days old, exceeding retention policy of ${policy.maxAgeDays} days. Oldest record: ${oldestDate.toISOString()}.`,
          confidence: 0.95,
        });
      } else {
        const daysRemaining = policy.maxAgeDays - ageDays;
        suggestions.push({
          action: 'retention_status',
          description: `Dataset "${task.datasetId}" is ${ageDays} days old. ${daysRemaining} days remaining before retention limit (${policy.maxAgeDays} days).`,
          confidence: 0.9,
        });
      }
    }

    if (newestLogs.length > 0) {
      const lastAccess = new Date(newestLogs[0].performedAt);
      const daysSinceAccess = Math.floor((now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceAccess > 90) {
        suggestions.push({
          action: 'stale_data_warning',
          description: `Dataset "${task.datasetId}" has not been accessed in ${daysSinceAccess} days. Consider archiving or deleting per retention policy.`,
          confidence: 0.8,
        });
      }
    }

    // Classification-specific rules
    if (policy.classification === 'sensitive' || policy.classification === 'confidential') {
      suggestions.push({
        action: 'classification_requirement',
        description: `Dataset classified as "${policy.classification}" in region "${policy.region}". Requires: encryption at rest, access logging, no cross-border transfer without approval.`,
        confidence: 0.95,
      });
    }

    if (policy.region === 'SA') {
      suggestions.push({
        action: 'saudi_data_residency',
        description: `Data located in Saudi Arabia region. Per PDPL: personal data must remain within KSA unless specific transfer conditions are met. Verify data residency compliance.`,
        confidence: 0.9,
      });
    }

    const interpretation = `Retention policy enforcement for "${task.datasetId}": classification="${policy.classification}", maxAge=${policy.maxAgeDays} days, region="${policy.region}". ${suggestions.length} findings.`;

    await prisma.auditLog.create({
      data: {
        action: 'compliance_enforce_retention',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ policy, findingsCount: suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async reviewPermissions(task: ComplianceGovernanceTask): Promise<AgentResult> {
    const permissions = task.permissions ?? [];
    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    if (permissions.length === 0) {
      suggestions.push({
        action: 'no_permissions_data',
        description: 'No permission data provided for review. Ensure permission data is passed for comprehensive review.',
        confidence: 1.0,
      });

      await prisma.auditLog.create({
        data: {
          action: 'compliance_review_permissions',
          entityType: 'dataset',
          entityId: task.datasetId,
          details: JSON.stringify({ permissionsReviewed: 0 }),
          performedAt: new Date(),
        },
      });

      return {
        agentType: this.agentType,
        taskType: task.type,
        suggestions,
        interpretation: 'No permission data available for review.',
        requiresApproval: false,
        executedAt: new Date(),
      };
    }

    // Analyze permission distribution
    const roleCounts = new Map<string, number>();
    const resourceAccess = new Map<string, string[]>();

    permissions.forEach((p) => {
      roleCounts.set(p.role, (roleCounts.get(p.role) ?? 0) + 1);
      p.resources.forEach((r) => {
        if (!resourceAccess.has(r)) resourceAccess.set(r, []);
        resourceAccess.get(r)!.push(p.userId);
      });
    });

    // Check for admin overuse
    const adminCount = (roleCounts.get('admin') ?? 0) + (roleCounts.get('superadmin') ?? 0);
    if (adminCount > permissions.length * 0.2) {
      suggestions.push({
        action: 'excessive_admin_roles',
        description: `${adminCount} out of ${permissions.length} users (${((adminCount / permissions.length) * 100).toFixed(0)}%) have admin/superadmin roles. Best practice: < 10%.`,
        confidence: 0.9,
      });
    }

    // Check for overly broad resource access
    permissions.forEach((p) => {
      if (p.resources.includes('*') || p.resources.length > 20) {
        suggestions.push({
          action: 'broad_access_warning',
          description: `User "${p.userId}" (${p.role}) has access to ${p.resources.includes('*') ? 'ALL resources (wildcard)' : `${p.resources.length} resources`}. Apply principle of least privilege.`,
          confidence: 0.85,
        });
      }
    });

    // Check for stale permissions
    const now = new Date();
    permissions.forEach((p) => {
      const grantedDate = new Date(p.grantedAt);
      const daysSinceGrant = Math.floor((now.getTime() - grantedDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceGrant > 180) {
        suggestions.push({
          action: 'stale_permission',
          description: `User "${p.userId}" (${p.role}) permission granted ${daysSinceGrant} days ago. Recommend periodic access review (> 180 days).`,
          confidence: 0.75,
        });
      }
    });

    // Check for resources with too many users
    resourceAccess.forEach((users, resource) => {
      if (users.length > 10) {
        suggestions.push({
          action: 'high_access_resource',
          description: `Resource "${resource}" is accessible by ${users.length} users. Review if all access is necessary.`,
          confidence: 0.7,
        });
      }
    });

    const interpretation = `Permission review: ${permissions.length} permissions across ${roleCounts.size} roles and ${resourceAccess.size} resources. ${suggestions.length} findings including ${adminCount} admin-level users.`;

    await prisma.auditLog.create({
      data: {
        action: 'compliance_review_permissions',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ permissionsReviewed: permissions.length, roles: Object.fromEntries(roleCounts), findings: suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private scanForPii(data: Array<Record<string, number | string | null>>, columns: string[]): PiiMatch[] {
    const matches: PiiMatch[] = [];

    const patterns: Array<{ name: string; regex: RegExp; confidence: number }> = [
      { name: 'saudi_national_id', regex: this.saudiIdPattern, confidence: 0.9 },
      { name: 'saudi_phone', regex: this.saudiPhonePattern, confidence: 0.85 },
      { name: 'email', regex: this.emailPattern, confidence: 0.95 },
      { name: 'iban', regex: this.ibanPattern, confidence: 0.95 },
      { name: 'credit_card', regex: this.creditCardPattern, confidence: 0.8 },
      { name: 'passport', regex: this.passportPattern, confidence: 0.7 },
      { name: 'ip_address', regex: this.ipPattern, confidence: 0.75 },
    ];

    for (const col of columns) {
      for (const pattern of patterns) {
        let count = 0;
        const sampleIndices: number[] = [];

        for (let i = 0; i < data.length; i++) {
          const value = data[i][col];
          if (value === null || value === undefined) continue;
          const strVal = String(value);
          if (pattern.regex.test(strVal)) {
            count++;
            if (sampleIndices.length < 5) sampleIndices.push(i);
          }
        }

        if (count > 0) {
          matches.push({
            column: col,
            type: pattern.name,
            count,
            sampleIndices,
            confidence: pattern.confidence,
          });
        }
      }

      // Column name heuristic for PII
      const colLower = col.toLowerCase();
      const piiNamePatterns: Array<{ keywords: string[]; type: string }> = [
        { keywords: ['name', 'اسم', 'first_name', 'last_name', 'full_name'], type: 'personal_name' },
        { keywords: ['address', 'عنوان', 'street', 'شارع'], type: 'address' },
        { keywords: ['salary', 'راتب', 'income', 'دخل'], type: 'financial' },
        { keywords: ['dob', 'birth', 'تاريخ_الميلاد', 'birth_date'], type: 'date_of_birth' },
      ];

      for (const namePattern of piiNamePatterns) {
        if (namePattern.keywords.some((kw) => colLower.includes(kw))) {
          const nonNullCount = data.filter((row) => row[col] !== null && row[col] !== undefined).length;
          if (nonNullCount > 0) {
            matches.push({
              column: col,
              type: namePattern.type,
              count: nonNullCount,
              sampleIndices: [0],
              confidence: 0.7,
            });
          }
        }
      }
    }

    return matches;
  }
}
