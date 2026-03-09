// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockComplianceCheckCreate = jest.fn().mockResolvedValue({ id: 'cc-1' });
const mockConsentRecordFindMany = jest.fn();
const mockConsentRecordCreate = jest.fn();
const mockConsentRecordUpdateMany = jest.fn();
const mockDatasetFindUnique = jest.fn();
const mockRetentionPolicyFindMany = jest.fn();
const mockRetentionPolicyCreate = jest.fn();
const mockRetentionPolicyUpdate = jest.fn();
const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(0);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    complianceCheck: { create: mockComplianceCheckCreate },
    consentRecord: {
      findMany: mockConsentRecordFindMany,
      create: mockConsentRecordCreate,
      updateMany: mockConsentRecordUpdateMany,
    },
    dataset: { findUnique: mockDatasetFindUnique },
    retentionPolicy: {
      findMany: mockRetentionPolicyFindMany,
      create: mockRetentionPolicyCreate,
      update: mockRetentionPolicyUpdate,
    },
    $executeRawUnsafe: mockExecuteRawUnsafe,
  })),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-uuid'),
}));

// ─── Import Under Test ──────────────────────────────────────────────────────

import ComplianceService from '../services/compliance.service';
import { PrismaClient } from '@prisma/client';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Engine 10.3 - Compliance Service', () => {
  let service;
  let mockPrisma;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new PrismaClient();
    service = new ComplianceService(mockPrisma);
  });

  describe('runComplianceCheck', () => {
    it('should run GDPR compliance check and return a report', async () => {
      // Mock consent found
      mockConsentRecordFindMany.mockResolvedValueOnce([
        { id: 'c1', granted: true, revokedAt: null, expiresAt: new Date(Date.now() + 86400000) },
      ]);
      // Mock dataset with PII columns
      mockDatasetFindUnique.mockResolvedValueOnce({
        id: 'ds-1',
        columns: [
          { name: 'email', encrypted: true },
          { name: 'phone_number', encrypted: false },
        ],
      });
      // Mock retention policies
      mockRetentionPolicyFindMany.mockResolvedValueOnce([{ id: 'rp-1', enabled: true }]);

      const result = await service.runComplianceCheck({
        datasetId: 'ds-1',
        resourceType: 'dataset',
        regulations: ['gdpr'],
        scope: 'full',
      });

      expect(result.status).toBeDefined();
      expect(result.regulations).toHaveLength(1);
      expect(result.regulations[0].regulation).toBe('GDPR');
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.id).toBeDefined();
    });

    it('should flag non-compliant when no consent records exist', async () => {
      mockConsentRecordFindMany.mockResolvedValueOnce([]); // no consents
      mockDatasetFindUnique.mockResolvedValueOnce({
        id: 'ds-2',
        columns: [{ name: 'name', encrypted: true }],
      });
      mockRetentionPolicyFindMany.mockResolvedValueOnce([]);

      const result = await service.runComplianceCheck({
        datasetId: 'ds-2',
        resourceType: 'dataset',
        regulations: ['gdpr'],
        scope: 'full',
      });

      expect(result.issues.length).toBeGreaterThan(0);
      const legalBasisIssue = result.issues.find(i => i.category === 'legal_basis');
      expect(legalBasisIssue).toBeDefined();
      expect(legalBasisIssue.severity).toBe('critical');
    });

    it('should detect unencrypted PII fields as GDPR violations', async () => {
      mockConsentRecordFindMany.mockResolvedValueOnce([
        { id: 'c1', granted: true, revokedAt: null, expiresAt: null },
      ]);
      mockDatasetFindUnique.mockResolvedValueOnce({
        id: 'ds-3',
        columns: [
          { name: 'email', encrypted: false },
          { name: 'credit_card_number', encrypted: false },
        ],
      });
      mockRetentionPolicyFindMany.mockResolvedValueOnce([{ id: 'rp-1', enabled: true }]);

      const result = await service.runComplianceCheck({
        datasetId: 'ds-3',
        resourceType: 'dataset',
        regulations: ['gdpr'],
        scope: 'full',
      });

      const dataProtectionIssues = result.issues.filter(i => i.category === 'data_protection');
      expect(dataProtectionIssues.length).toBeGreaterThan(0);
    });

    it('should run PDPL compliance check for Saudi data', async () => {
      mockConsentRecordFindMany.mockResolvedValue([]);
      mockDatasetFindUnique.mockResolvedValueOnce({
        id: 'ds-4',
        columns: [
          { name: 'national_id', encrypted: false },
        ],
      });
      mockRetentionPolicyFindMany.mockResolvedValue([]);

      const result = await service.runComplianceCheck({
        datasetId: 'ds-4',
        resourceType: 'dataset',
        regulations: ['pdpl'],
        scope: 'full',
      });

      expect(result.regulations[0].regulation).toBe('PDPL');
      const saudiIdIssue = result.issues.find(i =>
        i.description.includes('Saudi National ID'),
      );
      expect(saudiIdIssue).toBeDefined();
      expect(saudiIdIssue.severity).toBe('critical');
    });

    it('should run HIPAA compliance check', async () => {
      mockConsentRecordFindMany.mockResolvedValue([]);
      mockDatasetFindUnique.mockResolvedValue(null);
      mockRetentionPolicyFindMany.mockResolvedValue([]);

      const result = await service.runComplianceCheck({
        resourceType: 'dataset',
        regulations: ['hipaa'],
        scope: 'full',
      });

      expect(result.regulations[0].regulation).toBe('HIPAA');
      expect(result.regulations[0].compliant).toBe(true);
    });

    it('should run CCPA compliance check', async () => {
      mockConsentRecordFindMany.mockResolvedValue([]);
      mockDatasetFindUnique.mockResolvedValue(null);
      mockRetentionPolicyFindMany.mockResolvedValue([]);

      const result = await service.runComplianceCheck({
        resourceType: 'dataset',
        regulations: ['ccpa'],
        scope: 'full',
      });

      expect(result.regulations[0].regulation).toBe('CCPA');
      expect(result.regulations[0].score).toBe(100);
    });

    it('should generate recommendations for critical issues', async () => {
      mockConsentRecordFindMany.mockResolvedValueOnce([]);
      mockDatasetFindUnique.mockResolvedValueOnce({
        id: 'ds-5',
        columns: [{ name: 'email', encrypted: false }],
      });
      mockRetentionPolicyFindMany.mockResolvedValueOnce([]);

      const result = await service.runComplianceCheck({
        datasetId: 'ds-5',
        resourceType: 'dataset',
        regulations: ['gdpr'],
        scope: 'full',
      });

      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('createRetentionPolicy', () => {
    it('should create and store a retention policy', async () => {
      mockRetentionPolicyCreate.mockResolvedValueOnce({ id: 'rp-new' });

      const result = await service.createRetentionPolicy({
        name: 'Delete old data',
        description: 'Remove data older than 365 days',
        resourceType: 'user_data',
        retentionPeriodDays: 365,
        action: 'delete',
        conditions: [{ field: 'createdAt', operator: 'older_than', value: 365 }],
        enabled: true,
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Delete old data');
      expect(mockRetentionPolicyCreate).toHaveBeenCalled();
    });
  });

  describe('recordConsent', () => {
    it('should create a consent record', async () => {
      mockConsentRecordCreate.mockResolvedValueOnce({ id: 'consent-1' });

      const result = await service.recordConsent({
        userId: 'user-1',
        purpose: 'marketing',
        granted: true,
        grantedAt: new Date(),
        source: 'web',
        version: '1.0',
        metadata: { browser: 'Chrome' },
      });

      expect(result.id).toBeDefined();
      expect(result.purpose).toBe('marketing');
      expect(result.granted).toBe(true);
    });
  });

  describe('revokeConsent', () => {
    it('should revoke active consents for a user and purpose', async () => {
      mockConsentRecordUpdateMany.mockResolvedValueOnce({ count: 1 });

      await service.revokeConsent('user-1', 'marketing');

      expect(mockConsentRecordUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            purpose: 'marketing',
            granted: true,
            revokedAt: null,
          }),
        }),
      );
    });
  });

  describe('getUserConsents', () => {
    it('should return all consent records for a user', async () => {
      mockConsentRecordFindMany.mockResolvedValueOnce([
        {
          id: 'c1', userId: 'user-1', purpose: 'marketing', granted: true,
          grantedAt: new Date(), revokedAt: null, expiresAt: null,
          ipAddress: '127.0.0.1', source: 'web', version: '1.0',
          metadata: { browser: 'Chrome' }, createdAt: new Date(),
        },
      ]);

      const consents = await service.getUserConsents('user-1');

      expect(consents).toHaveLength(1);
      expect(consents[0].purpose).toBe('marketing');
    });
  });

  describe('executeRetentionPolicies', () => {
    it('should execute enabled retention policies and return affected counts', async () => {
      mockRetentionPolicyFindMany.mockResolvedValueOnce([
        {
          id: 'rp-1',
          resourceType: 'user_data',
          retentionPeriodDays: 30,
          action: 'delete',
          enabled: true,
        },
      ]);
      mockExecuteRawUnsafe.mockResolvedValueOnce(5);
      mockRetentionPolicyUpdate.mockResolvedValueOnce({});

      const results = await service.executeRetentionPolicies();

      expect(results).toHaveLength(1);
      expect(results[0].policyId).toBe('rp-1');
      expect(results[0].affectedRecords).toBe(5);
    });
  });
});
