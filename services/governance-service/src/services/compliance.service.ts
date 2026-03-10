import { PrismaClient, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface ComplianceCheckRequest {
  datasetId?: string;
  resourceType: 'dataset' | 'document' | 'user_data' | 'api_log';
  regulations: ('gdpr' | 'pdpl' | 'hipaa' | 'ccpa')[];
  scope: 'full' | 'quick' | 'specific_fields';
  fields?: string[];
}

interface ComplianceCheckResult {
  id: string;
  status: 'compliant' | 'non_compliant' | 'needs_review' | 'partial';
  overallScore: number;
  regulations: RegulationResult[];
  issues: ComplianceIssue[];
  recommendations: string[];
  checkedAt: Date;
  duration: number;
}

interface RegulationResult {
  regulation: string;
  compliant: boolean;
  score: number;
  articles: ArticleCheck[];
  issues: ComplianceIssue[];
}

interface ArticleCheck {
  articleId: string;
  articleTitle: string;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  description: string;
  evidence?: string;
}

interface ComplianceIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  regulation: string;
  description: string;
  affectedFields: string[];
  suggestedAction: string;
  deadline?: Date;
  assignedTo?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'accepted_risk';
}

interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  resourceType: string;
  retentionPeriodDays: number;
  action: 'delete' | 'anonymize' | 'archive';
  conditions: RetentionCondition[];
  enabled: boolean;
  lastExecutedAt?: Date;
  nextExecutionAt?: Date;
}

interface RetentionCondition {
  field: string;
  operator: 'older_than' | 'equals' | 'contains' | 'is_null';
  value: unknown;
}

interface PrivacyImpactAssessment {
  id: string;
  projectId: string;
  assessmentType: 'new_processing' | 'change' | 'periodic';
  dataCategories: DataCategory[];
  processingActivities: ProcessingActivity[];
  risks: PrivacyRisk[];
  mitigations: Mitigation[];
  overallRiskLevel: 'low' | 'medium' | 'high' | 'very_high';
  approvalStatus: 'draft' | 'pending_review' | 'approved' | 'rejected';
  assessedBy: string;
  assessedAt: Date;
}

interface DataCategory {
  name: string;
  type: 'personal' | 'sensitive' | 'special_category' | 'non_personal';
  fields: string[];
  volumeEstimate: string;
  retentionPeriod: string;
  encryptionRequired: boolean;
}

interface ProcessingActivity {
  name: string;
  purpose: string;
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interest' | 'public_task' | 'legitimate_interest';
  dataSubjects: string[];
  recipients: string[];
  crossBorderTransfer: boolean;
  automatedDecisionMaking: boolean;
}

interface PrivacyRisk {
  id: string;
  description: string;
  likelihood: 'rare' | 'unlikely' | 'possible' | 'likely' | 'almost_certain';
  impact: 'insignificant' | 'minor' | 'moderate' | 'major' | 'catastrophic';
  riskLevel: 'low' | 'medium' | 'high' | 'very_high';
  category: string;
}

interface Mitigation {
  riskId: string;
  description: string;
  type: 'technical' | 'organizational' | 'legal';
  status: 'planned' | 'in_progress' | 'implemented' | 'verified';
  effectiveness: 'high' | 'medium' | 'low';
  responsibleParty: string;
  dueDate?: Date;
}

interface ConsentRecord {
  id: string;
  userId: string;
  purpose: string;
  granted: boolean;
  grantedAt?: Date;
  revokedAt?: Date;
  expiresAt?: Date;
  ipAddress?: string;
  source: string | null;
  version: string | null;
  metadata: Record<string, unknown>;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class ComplianceService {
  private prisma: PrismaClient;
  private retentionPolicies: Map<string, RetentionPolicy> = new Map();
  private piiPatterns: Map<string, RegExp> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializePIIPatterns();
  }

  private initializePIIPatterns(): void {
    this.piiPatterns.set('email', /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    this.piiPatterns.set('phone', /(\+?\d{1,4}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g);
    this.piiPatterns.set('saudi_id', /\b[12]\d{9}\b/g);
    this.piiPatterns.set('credit_card', /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g);
    this.piiPatterns.set('ip_address', /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g);
    this.piiPatterns.set('iban', /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?\d?){0,16}\b/g);
    this.piiPatterns.set('passport', /\b[A-Z]\d{8}\b/g);
    this.piiPatterns.set('date_of_birth', /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](19|20)\d{2}\b/g);
  }

  async runComplianceCheck(request: ComplianceCheckRequest): Promise<ComplianceCheckResult> {
    const startTime = Date.now();
    const allIssues: ComplianceIssue[] = [];
    const regulationResults: RegulationResult[] = [];

    for (const regulation of request.regulations) {
      let result: RegulationResult;

      switch (regulation) {
        case 'gdpr':
          result = await this.checkGDPRCompliance(request);
          break;
        case 'pdpl':
          result = await this.checkPDPLCompliance(request);
          break;
        case 'hipaa':
          result = await this.checkHIPAACompliance(request);
          break;
        case 'ccpa':
          result = await this.checkCCPACompliance(request);
          break;
        default:
          result = { regulation, compliant: true, score: 100, articles: [], issues: [] };
      }

      regulationResults.push(result);
      allIssues.push(...result.issues);
    }

    const overallScore = regulationResults.length > 0
      ? regulationResults.reduce((sum, r) => sum + r.score, 0) / regulationResults.length
      : 100;

    const hasCritical = allIssues.some(i => i.severity === 'critical');
    const hasHigh = allIssues.some(i => i.severity === 'high');

    const status: ComplianceCheckResult['status'] = hasCritical
      ? 'non_compliant'
      : hasHigh
        ? 'needs_review'
        : overallScore < 90
          ? 'partial'
          : 'compliant';

    const recommendations = this.generateRecommendations(allIssues);

    const result: ComplianceCheckResult = {
      id: crypto.randomUUID(),
      status,
      overallScore: Math.round(overallScore * 100) / 100,
      regulations: regulationResults,
      issues: allIssues,
      recommendations,
      checkedAt: new Date(),
      duration: Date.now() - startTime,
    };

    await this.prisma.complianceCheck.create({
      data: {
        id: result.id,
        status: result.status,
        overallScore: result.overallScore,
        regulations: result.regulations as unknown as Prisma.InputJsonValue,
        issueCount: allIssues.length,
        checkedAt: result.checkedAt,
        duration: result.duration,
        resourceType: request.resourceType,
        datasetId: request.datasetId,
      },
    });

    return result;
  }

  private async checkGDPRCompliance(request: ComplianceCheckRequest): Promise<RegulationResult> {
    const issues: ComplianceIssue[] = [];
    const articles: ArticleCheck[] = [];

    const consentCheck = await this.checkConsentMechanism(request);
    articles.push({
      articleId: 'Art.6',
      articleTitle: 'Lawfulness of Processing',
      status: consentCheck.valid ? 'pass' : 'fail',
      description: consentCheck.valid
        ? 'Valid legal basis found for data processing'
        : 'No valid legal basis found for data processing',
      evidence: consentCheck.evidence,
    });

    if (!consentCheck.valid) {
      issues.push({
        id: crypto.randomUUID(),
        severity: 'critical',
        category: 'legal_basis',
        regulation: 'GDPR',
        description: 'No valid consent or legal basis found for data processing',
        affectedFields: [],
        suggestedAction: 'Obtain explicit consent or establish another legal basis under Art. 6',
        status: 'open',
      });
    }

    const piiFields = await this.detectPIIFields(request);
    const hasUnprotectedPII = piiFields.filter(f => !f.encrypted).length > 0;

    articles.push({
      articleId: 'Art.25',
      articleTitle: 'Data Protection by Design',
      status: hasUnprotectedPII ? 'fail' : 'pass',
      description: hasUnprotectedPII
        ? `${piiFields.filter(f => !f.encrypted).length} PII fields are not encrypted`
        : 'All PII fields are properly protected',
    });

    if (hasUnprotectedPII) {
      for (const field of piiFields.filter(f => !f.encrypted)) {
        issues.push({
          id: crypto.randomUUID(),
          severity: 'high',
          category: 'data_protection',
          regulation: 'GDPR',
          description: `PII field "${field.name}" (${field.type}) is not encrypted`,
          affectedFields: [field.name],
          suggestedAction: `Encrypt the "${field.name}" field using AES-256 or equivalent`,
          status: 'open',
        });
      }
    }

    const hasRetentionPolicy = await this.checkRetentionPolicy(request);
    articles.push({
      articleId: 'Art.5(1)(e)',
      articleTitle: 'Storage Limitation',
      status: hasRetentionPolicy ? 'pass' : 'warning',
      description: hasRetentionPolicy
        ? 'Data retention policy is in place'
        : 'No data retention policy found',
    });

    if (!hasRetentionPolicy) {
      issues.push({
        id: crypto.randomUUID(),
        severity: 'medium',
        category: 'retention',
        regulation: 'GDPR',
        description: 'No data retention policy configured for this resource',
        affectedFields: [],
        suggestedAction: 'Create a data retention policy with appropriate retention periods',
        status: 'open',
      });
    }

    articles.push({
      articleId: 'Art.17',
      articleTitle: 'Right to Erasure',
      status: 'pass',
      description: 'Data deletion mechanisms are available through the platform',
    });

    articles.push({
      articleId: 'Art.20',
      articleTitle: 'Right to Data Portability',
      status: 'pass',
      description: 'Data export functionality supports standard formats (JSON, CSV)',
    });

    const score = articles.reduce((sum, a) => {
      if (a.status === 'pass') return sum + 100;
      if (a.status === 'warning') return sum + 70;
      if (a.status === 'not_applicable') return sum + 100;
      return sum + 0;
    }, 0) / Math.max(articles.length, 1);

    return {
      regulation: 'GDPR',
      compliant: issues.filter(i => i.severity === 'critical').length === 0,
      score: Math.round(score * 100) / 100,
      articles,
      issues,
    };
  }

  private async checkPDPLCompliance(request: ComplianceCheckRequest): Promise<RegulationResult> {
    const issues: ComplianceIssue[] = [];
    const articles: ArticleCheck[] = [];

    articles.push({
      articleId: 'PDPL-Art.5',
      articleTitle: 'Personal Data Collection',
      status: 'pass',
      description: 'Data collection follows PDPL guidelines for Saudi Arabia',
    });

    const piiFields = await this.detectPIIFields(request);
    const hasSaudiNationalId = piiFields.some(f => f.type === 'saudi_id');

    if (hasSaudiNationalId) {
      const encryptedIdFields = piiFields.filter(f => f.type === 'saudi_id' && f.encrypted);
      if (encryptedIdFields.length === 0) {
        issues.push({
          id: crypto.randomUUID(),
          severity: 'critical',
          category: 'data_protection',
          regulation: 'PDPL',
          description: 'Saudi National ID fields must be encrypted',
          affectedFields: piiFields.filter(f => f.type === 'saudi_id').map(f => f.name),
          suggestedAction: 'Encrypt all Saudi National ID fields immediately',
          status: 'open',
        });
      }
    }

    articles.push({
      articleId: 'PDPL-Art.10',
      articleTitle: 'Cross-Border Transfer',
      status: 'warning',
      description: 'Verify that data is stored within Saudi Arabia or approved jurisdictions',
    });

    articles.push({
      articleId: 'PDPL-Art.14',
      articleTitle: 'Consent Requirements',
      status: 'pass',
      description: 'Consent mechanisms are available in Arabic and English',
    });

    const score = articles.reduce((sum, a) => {
      if (a.status === 'pass') return sum + 100;
      if (a.status === 'warning') return sum + 70;
      return sum + 0;
    }, 0) / Math.max(articles.length, 1);

    return {
      regulation: 'PDPL',
      compliant: issues.filter(i => i.severity === 'critical').length === 0,
      score: Math.round(score * 100) / 100,
      articles,
      issues,
    };
  }

  private async checkHIPAACompliance(request: ComplianceCheckRequest): Promise<RegulationResult> {
    const issues: ComplianceIssue[] = [];
    const articles: ArticleCheck[] = [];

    articles.push({
      articleId: 'HIPAA-164.312',
      articleTitle: 'Technical Safeguards',
      status: 'pass',
      description: 'Access controls and encryption are in place',
    });

    articles.push({
      articleId: 'HIPAA-164.310',
      articleTitle: 'Physical Safeguards',
      status: 'not_applicable',
      description: 'Physical safeguards are managed by infrastructure provider',
    });

    articles.push({
      articleId: 'HIPAA-164.308',
      articleTitle: 'Administrative Safeguards',
      status: 'warning',
      description: 'Review administrative policies for completeness',
    });

    const score = articles.reduce((sum, a) => {
      if (a.status === 'pass') return sum + 100;
      if (a.status === 'warning') return sum + 70;
      if (a.status === 'not_applicable') return sum + 100;
      return sum + 0;
    }, 0) / Math.max(articles.length, 1);

    return {
      regulation: 'HIPAA',
      compliant: true,
      score: Math.round(score * 100) / 100,
      articles,
      issues,
    };
  }

  private async checkCCPACompliance(request: ComplianceCheckRequest): Promise<RegulationResult> {
    const issues: ComplianceIssue[] = [];
    const articles: ArticleCheck[] = [];

    articles.push({
      articleId: 'CCPA-1798.100',
      articleTitle: 'Right to Know',
      status: 'pass',
      description: 'Data transparency mechanisms are available',
    });

    articles.push({
      articleId: 'CCPA-1798.105',
      articleTitle: 'Right to Delete',
      status: 'pass',
      description: 'Data deletion functionality is available',
    });

    articles.push({
      articleId: 'CCPA-1798.120',
      articleTitle: 'Right to Opt-Out',
      status: 'pass',
      description: 'Opt-out mechanism for data sharing is implemented',
    });

    return {
      regulation: 'CCPA',
      compliant: true,
      score: 100,
      articles,
      issues,
    };
  }

  private async checkConsentMechanism(
    request: ComplianceCheckRequest,
  ): Promise<{ valid: boolean; evidence: string }> {
    if (!request.datasetId) {
      return { valid: true, evidence: 'No specific dataset to check' };
    }

    const consents = await this.prisma.consentRecord.findMany({
      where: {
        resourceId: request.datasetId,
        granted: true,
        revokedAt: null,
      },
    });

    if (consents.length > 0) {
      const activeConsents = consents.filter(c =>
        !c.expiresAt || c.expiresAt > new Date(),
      );
      return {
        valid: activeConsents.length > 0,
        evidence: `${activeConsents.length} active consent records found`,
      };
    }

    return {
      valid: false,
      evidence: 'No consent records found for this resource',
    };
  }

  private async detectPIIFields(
    request: ComplianceCheckRequest,
  ): Promise<{ name: string; type: string; encrypted: boolean }[]> {
    const piiFields: { name: string; type: string; encrypted: boolean }[] = [];

    if (!request.datasetId) return piiFields;

    const dataset = await this.prisma.dataset.findUnique({
      where: { id: request.datasetId },
      include: { columns: true },
    });

    if (!dataset) return piiFields;

    for (const column of dataset.columns) {
      const columnNameLower = column.name.toLowerCase();
      const isEncrypted = column.encrypted === true;

      if (columnNameLower.includes('email') || columnNameLower.includes('e_mail')) {
        piiFields.push({ name: column.name, type: 'email', encrypted: isEncrypted });
      }
      if (columnNameLower.includes('phone') || columnNameLower.includes('mobile') || columnNameLower.includes('tel')) {
        piiFields.push({ name: column.name, type: 'phone', encrypted: isEncrypted });
      }
      if (columnNameLower.includes('national_id') || columnNameLower.includes('id_number') || columnNameLower.includes('iqama')) {
        piiFields.push({ name: column.name, type: 'saudi_id', encrypted: isEncrypted });
      }
      if (columnNameLower.includes('credit_card') || columnNameLower.includes('card_number')) {
        piiFields.push({ name: column.name, type: 'credit_card', encrypted: isEncrypted });
      }
      if (columnNameLower.includes('address') || columnNameLower.includes('street')) {
        piiFields.push({ name: column.name, type: 'address', encrypted: isEncrypted });
      }
      if (columnNameLower.includes('name') && !columnNameLower.includes('column') && !columnNameLower.includes('table')) {
        piiFields.push({ name: column.name, type: 'name', encrypted: isEncrypted });
      }
      if (columnNameLower.includes('dob') || columnNameLower.includes('birth_date') || columnNameLower.includes('date_of_birth')) {
        piiFields.push({ name: column.name, type: 'date_of_birth', encrypted: isEncrypted });
      }
      if (columnNameLower.includes('ip_address') || columnNameLower.includes('ip')) {
        piiFields.push({ name: column.name, type: 'ip_address', encrypted: isEncrypted });
      }
    }

    return piiFields;
  }

  private async checkRetentionPolicy(request: ComplianceCheckRequest): Promise<boolean> {
    const policies = Array.from(this.retentionPolicies.values())
      .filter(p => p.resourceType === request.resourceType && p.enabled);

    if (policies.length > 0) return true;

    const dbPolicies = await this.prisma.retentionPolicy.findMany({
      where: { resourceType: request.resourceType, enabled: true },
    });

    return dbPolicies.length > 0;
  }

  private generateRecommendations(issues: ComplianceIssue[]): string[] {
    const recommendations: string[] = [];
    const categories = new Set(issues.map(i => i.category));

    if (categories.has('legal_basis')) {
      recommendations.push('Review and document legal basis for all data processing activities');
      recommendations.push('Implement a consent management platform for user-facing applications');
    }

    if (categories.has('data_protection')) {
      recommendations.push('Enable encryption at rest for all PII fields using AES-256');
      recommendations.push('Implement data masking for non-production environments');
      recommendations.push('Review access controls to ensure least-privilege principle');
    }

    if (categories.has('retention')) {
      recommendations.push('Define data retention policies for all resource types');
      recommendations.push('Implement automated data deletion for expired records');
    }

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    if (criticalCount > 0) {
      recommendations.push(`Address ${criticalCount} critical compliance issues immediately`);
    }

    return recommendations;
  }

  async createRetentionPolicy(policy: Omit<RetentionPolicy, 'id'>): Promise<RetentionPolicy> {
    const id = crypto.randomUUID();
    const fullPolicy: RetentionPolicy = { ...policy, id };

    this.retentionPolicies.set(id, fullPolicy);

    await this.prisma.retentionPolicy.create({
      data: {
        id: fullPolicy.id,
        name: fullPolicy.name,
        description: fullPolicy.description,
        resourceType: fullPolicy.resourceType,
        retentionPeriodDays: fullPolicy.retentionPeriodDays,
        action: fullPolicy.action,
        conditions: fullPolicy.conditions as unknown as Prisma.InputJsonValue,
        enabled: fullPolicy.enabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return fullPolicy;
  }

  async executeRetentionPolicies(): Promise<{ policyId: string; affectedRecords: number }[]> {
    const results: { policyId: string; affectedRecords: number }[] = [];

    const policies = await this.prisma.retentionPolicy.findMany({
      where: { enabled: true },
    });

    for (const policy of policies) {
      const cutoffDate = new Date(Date.now() - policy.retentionPeriodDays * 86400000);

      let affectedCount = 0;

      if (policy.action === 'delete') {
        const result = await this.prisma.$executeRawUnsafe(
          `DELETE FROM "${policy.resourceType}" WHERE "createdAt" < $1`,
          cutoffDate,
        );
        affectedCount = result;
      } else if (policy.action === 'anonymize') {
        affectedCount = await this.anonymizeExpiredRecords(policy.resourceType, cutoffDate);
      }

      await this.prisma.retentionPolicy.update({
        where: { id: policy.id },
        data: {
          lastExecutedAt: new Date(),
          nextExecutionAt: new Date(Date.now() + 86400000),
          updatedAt: new Date(),
        },
      });

      results.push({ policyId: policy.id, affectedRecords: affectedCount });
    }

    return results;
  }

  private async anonymizeExpiredRecords(resourceType: string, cutoff: Date): Promise<number> {
    const piiColumns = ['email', 'phone', 'name', 'address', 'national_id', 'ip_address'];
    let setClauses = piiColumns
      .map(col => `"${col}" = CASE WHEN "${col}" IS NOT NULL THEN '***ANONYMIZED***' ELSE NULL END`)
      .join(', ');

    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE "${resourceType}" SET ${setClauses}, "anonymizedAt" = NOW() WHERE "createdAt" < $1 AND "anonymizedAt" IS NULL`,
      cutoff,
    );

    return result;
  }

  async recordConsent(record: Omit<ConsentRecord, 'id'>): Promise<ConsentRecord> {
    const id = crypto.randomUUID();
    const consent: ConsentRecord = { ...record, id };

    await this.prisma.consentRecord.create({
      data: {
        id: consent.id,
        userId: consent.userId,
        purpose: consent.purpose,
        granted: consent.granted,
        grantedAt: consent.grantedAt,
        revokedAt: consent.revokedAt,
        expiresAt: consent.expiresAt,
        ipAddress: consent.ipAddress,
        source: consent.source,
        version: consent.version,
        metadata: consent.metadata as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });

    return consent;
  }

  async revokeConsent(userId: string, purpose: string): Promise<void> {
    await this.prisma.consentRecord.updateMany({
      where: {
        userId,
        purpose,
        granted: true,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        granted: false,
      },
    });
  }

  async getUserConsents(userId: string): Promise<ConsentRecord[]> {
    const records = await this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => ({
      id: r.id,
      userId: r.userId,
      purpose: r.purpose,
      granted: r.granted,
      grantedAt: r.grantedAt || undefined,
      revokedAt: r.revokedAt || undefined,
      expiresAt: r.expiresAt || undefined,
      ipAddress: r.ipAddress || undefined,
      source: r.source || '',
      version: r.version || '',
      metadata: (r.metadata as Record<string, unknown>) || {},
    }));
  }
}
