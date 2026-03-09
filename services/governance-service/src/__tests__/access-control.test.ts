// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockPolicyCreate = jest.fn();
const mockPolicyFindMany = jest.fn();
const mockAccessRequestCreate = jest.fn();
const mockAccessRequestFindFirst = jest.fn();
const mockAccessRequestFindUniqueOrThrow = jest.fn();
const mockAccessRequestUpdate = jest.fn();
const mockUserRoleFindMany = jest.fn();
const mockDelegationCreate = jest.fn();
const mockDelegationFindFirst = jest.fn();
const mockDelegationFindMany = jest.fn();
const mockAccessLogCreate = jest.fn();
const mockAccessLogFindMany = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    accessPolicy: {
      create: mockPolicyCreate,
      findMany: mockPolicyFindMany,
    },
    accessRequest: {
      create: mockAccessRequestCreate,
      findFirst: mockAccessRequestFindFirst,
      findUniqueOrThrow: mockAccessRequestFindUniqueOrThrow,
      update: mockAccessRequestUpdate,
    },
    userRole: {
      findMany: mockUserRoleFindMany,
    },
    permissionDelegation: {
      create: mockDelegationCreate,
      findFirst: mockDelegationFindFirst,
      findMany: mockDelegationFindMany,
    },
    accessLog: {
      create: mockAccessLogCreate,
      findMany: mockAccessLogFindMany,
    },
  })),
}));

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  })),
}));

// ─── Import Under Test ──────────────────────────────────────────────────────

import { AccessControlService } from '../services/access-control.service';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Engine 10.1 - Access Control Service (RBAC)', () => {
  let service;
  let mockPrisma;
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new PrismaClient();
    mockRedis = new Redis();
    service = new AccessControlService(mockPrisma, mockRedis);
  });

  describe('createPolicy', () => {
    it('should create a valid access policy', async () => {
      mockPolicyFindMany.mockResolvedValueOnce([]); // no existing policies
      mockPolicyCreate.mockResolvedValueOnce({
        id: 'policy-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockRedisDel.mockResolvedValue(1);

      const policy = await service.createPolicy({
        name: 'Admin Access',
        description: 'Full admin access',
        resourceType: 'document',
        resourceId: 'doc-1',
        rules: [{
          id: 'rule-1',
          effect: 'allow',
          principals: ['user-1'],
          actions: ['read', 'write'],
        }],
        priority: 100,
        enabled: true,
        createdBy: 'admin-1',
      });

      expect(policy.id).toBe('policy-1');
      expect(policy.name).toBe('Admin Access');
    });

    it('should throw when policy name is empty', async () => {
      await expect(service.createPolicy({
        name: '',
        description: '',
        resourceType: 'document',
        resourceId: 'doc-1',
        rules: [{ id: 'r1', effect: 'allow', principals: ['u1'], actions: ['read'] }],
        priority: 1,
        enabled: true,
        createdBy: 'admin',
      })).rejects.toThrow('Policy validation failed');
    });

    it('should throw when rules array is empty', async () => {
      await expect(service.createPolicy({
        name: 'Empty rules',
        description: '',
        resourceType: 'document',
        resourceId: 'doc-1',
        rules: [],
        priority: 1,
        enabled: true,
        createdBy: 'admin',
      })).rejects.toThrow('Policy validation failed');
    });

    it('should throw when conflicting rules exist with lower priority', async () => {
      mockPolicyFindMany.mockResolvedValueOnce([{
        id: 'existing-1',
        name: 'Existing Policy',
        priority: 100,
        rules: JSON.stringify([{
          id: 'er1',
          effect: 'deny',
          principals: ['user-1'],
          actions: ['read'],
        }]),
      }]);

      await expect(service.createPolicy({
        name: 'Conflicting',
        description: '',
        resourceType: 'document',
        resourceId: 'doc-1',
        rules: [{
          id: 'r1',
          effect: 'allow',
          principals: ['user-1'],
          actions: ['read'],
        }],
        priority: 50, // lower than existing
        enabled: true,
        createdBy: 'admin',
      })).rejects.toThrow('conflicts with existing policy');
    });
  });

  describe('evaluateAccess', () => {
    it('should allow access when a matching allow rule exists', async () => {
      mockRedisGet.mockResolvedValue(null); // no cache
      mockPolicyFindMany.mockResolvedValueOnce([{
        id: 'p1',
        name: 'Allow Policy',
        enabled: true,
        priority: 100,
        rules: JSON.stringify([{
          id: 'r1',
          effect: 'allow',
          principals: ['user-1'],
          actions: ['read'],
        }]),
      }]);
      mockUserRoleFindMany.mockResolvedValueOnce([]);
      mockDelegationFindMany.mockResolvedValueOnce([]);
      mockAccessLogCreate.mockResolvedValueOnce({});
      mockRedisSet.mockResolvedValue('OK');

      const result = await service.evaluateAccess('user-1', 'document', 'doc-1', 'read');

      expect(result.allowed).toBe(true);
      expect(result.matchedRules).toContain('Allow Policy:r1');
    });

    it('should deny access when an explicit deny rule exists', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockPolicyFindMany.mockResolvedValueOnce([{
        id: 'p1',
        name: 'Deny Policy',
        enabled: true,
        priority: 100,
        rules: JSON.stringify([
          { id: 'r1', effect: 'allow', principals: ['user-1'], actions: ['read'] },
          { id: 'r2', effect: 'deny', principals: ['user-1'], actions: ['read'] },
        ]),
      }]);
      mockUserRoleFindMany.mockResolvedValueOnce([]);
      mockDelegationFindMany.mockResolvedValueOnce([]);
      mockAccessLogCreate.mockResolvedValueOnce({});
      mockRedisSet.mockResolvedValue('OK');

      const result = await service.evaluateAccess('user-1', 'document', 'doc-1', 'read');

      expect(result.allowed).toBe(false);
      expect(result.deniedReasons.length).toBeGreaterThan(0);
    });

    it('should deny when no matching allow rule is found', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockPolicyFindMany.mockResolvedValueOnce([]);
      mockUserRoleFindMany.mockResolvedValueOnce([]);
      mockDelegationFindMany.mockResolvedValueOnce([]);
      mockAccessLogCreate.mockResolvedValueOnce({});
      mockRedisSet.mockResolvedValue('OK');

      const result = await service.evaluateAccess('user-1', 'document', 'doc-1', 'read');

      expect(result.allowed).toBe(false);
      expect(result.deniedReasons).toContain('No matching allow rule found');
    });

    it('should return cached evaluation when available', async () => {
      const cached = {
        allowed: true,
        matchedRules: ['cached-rule'],
        deniedReasons: [],
        fieldRestrictions: [],
        evaluationTimeMs: 1,
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.evaluateAccess('user-1', 'document', 'doc-1', 'read');

      expect(result.allowed).toBe(true);
      expect(result.matchedRules).toContain('cached-rule');
    });
  });

  describe('createAccessRequest', () => {
    it('should create a pending access request', async () => {
      mockAccessRequestFindFirst.mockResolvedValueOnce(null); // no existing pending request
      mockAccessRequestCreate.mockResolvedValueOnce({
        id: 'req-1',
        requesterId: 'user-1',
        requesterName: 'Test User',
        resourceType: 'document',
        resourceId: 'doc-1',
        requestedActions: JSON.stringify(['read']),
        justification: 'Need access for review',
        status: 'pending',
        createdAt: new Date(),
      });

      const result = await service.createAccessRequest({
        requesterId: 'user-1',
        requesterName: 'Test User',
        resourceType: 'document',
        resourceId: 'doc-1',
        requestedActions: ['read'],
        justification: 'Need access for review',
      });

      expect(result.id).toBe('req-1');
      expect(result.status).toBe('pending');
    });

    it('should throw when a pending request already exists', async () => {
      mockAccessRequestFindFirst.mockResolvedValueOnce({ id: 'existing-req' });

      await expect(service.createAccessRequest({
        requesterId: 'user-1',
        requesterName: 'Test User',
        resourceType: 'document',
        resourceId: 'doc-1',
        requestedActions: ['read'],
        justification: 'Duplicate',
      })).rejects.toThrow('A pending request already exists');
    });
  });

  describe('getAccessAnalytics', () => {
    it('should compute analytics from access logs', async () => {
      const now = new Date();
      mockAccessLogFindMany.mockResolvedValueOnce([
        { userId: 'u1', action: 'read', allowed: true, evaluatedAt: now },
        { userId: 'u1', action: 'write', allowed: false, evaluatedAt: now },
        { userId: 'u2', action: 'read', allowed: true, evaluatedAt: now },
      ]);

      const analytics = await service.getAccessAnalytics('doc-1', 30);

      expect(analytics.totalRequests).toBe(3);
      expect(analytics.uniqueUsers).toBe(2);
      expect(analytics.deniedRequests).toBe(1);
      expect(analytics.topActions.length).toBeGreaterThan(0);
    });
  });
});
