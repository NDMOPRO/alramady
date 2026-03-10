// @ts-nocheck

/**
 * Contract Tests — governance-service
 * Verify that API endpoints enforce schema validation and return proper shapes.
 */

// ─── Mock Dependencies (must be before imports) ──────────────────────────────

const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
const mockUserUpdate = jest.fn();
const mockTenantFindUnique = jest.fn();
const mockRoleFindFirst = jest.fn();
const mockUserRoleCreate = jest.fn();
const mockAuditLogCreate = jest.fn();
const mockRoleCreate = jest.fn();
const mockRoleFind = jest.fn();
const mockPermissionCreate = jest.fn();
const mockPermissionFindMany = jest.fn();
const mockQueryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: {
      findUnique: mockUserFindUnique,
      findMany: jest.fn().mockResolvedValue([]),
      create: mockUserCreate,
      update: mockUserUpdate,
      count: jest.fn().mockResolvedValue(0),
    },
    tenant: { findUnique: mockTenantFindUnique },
    role: { findFirst: mockRoleFindFirst, create: mockRoleCreate, findMany: mockRoleFind },
    userRole: { create: mockUserRoleCreate, findMany: jest.fn().mockResolvedValue([]) },
    permission: { create: mockPermissionCreate, findMany: mockPermissionFindMany },
    auditLog: { create: mockAuditLogCreate, findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    teamMember: { count: jest.fn().mockResolvedValue(0) },
    permissionSuggestion: { count: jest.fn().mockResolvedValue(0) },
    accessPolicy: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    accessRequest: { create: jest.fn(), findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    permissionDelegation: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    accessLog: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    policy: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn() },
    workflow: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    notification: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    $queryRaw: mockQueryRaw,
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $on: jest.fn(),
  })),
  Prisma: {
    sql: jest.fn(),
    empty: '',
    join: jest.fn(),
    InputJsonValue: {},
  },
}));

const mockBcryptHash = jest.fn().mockResolvedValue('$2b$12$hashedpassword');
const mockBcryptCompare = jest.fn().mockResolvedValue(true);
jest.mock('bcrypt', () => ({
  __esModule: true,
  default: { hash: mockBcryptHash, compare: mockBcryptCompare },
}));

const mockJwtSign = jest.fn().mockReturnValue('mock.jwt.token');
const mockJwtVerify = jest.fn().mockImplementation((token) => {
  if (token === 'valid-token') {
    return { id: 'user-1', userId: 'user-1', email: 'admin@rasid.ai', role: 'admin', tenantId: 'tenant-1' };
  }
  throw new Error('invalid token');
});
jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: { sign: mockJwtSign, verify: mockJwtVerify },
  TokenExpiredError: class TokenExpiredError extends Error { name = 'TokenExpiredError'; },
  JsonWebTokenError: class JsonWebTokenError extends Error { name = 'JsonWebTokenError'; },
}));

jest.mock('speakeasy', () => ({
  __esModule: true,
  default: {
    generateSecret: jest.fn().mockReturnValue({ base32: 'SECRET', otpauth_url: 'otpauth://test' }),
    totp: { verify: jest.fn().mockReturnValue(true) },
  },
}));
jest.mock('qrcode', () => ({ __esModule: true, default: { toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qr') } }));
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: jest.fn().mockReturnValue({ sendMail: jest.fn().mockResolvedValue({}) }) } }));
jest.mock('crypto', () => {
  const actualCrypto = jest.requireActual('crypto');
  const randomUUID = jest.fn().mockReturnValue('mock-uuid');
  const randomBytes = jest.fn((size?: number) => actualCrypto.randomBytes(size ?? 16));

  return {
    __esModule: true,
    ...actualCrypto,
    default: {
      ...actualCrypto,
      randomUUID,
      randomBytes,
    },
    randomUUID,
    randomBytes,
  };
});

const mockRedisGet = jest.fn().mockResolvedValue(null);
const mockRedisSet = jest.fn().mockResolvedValue('OK');
const mockRedisDel = jest.fn().mockResolvedValue(1);
const mockRedisIncr = jest.fn().mockResolvedValue(1);
const mockRedisExpire = jest.fn().mockResolvedValue(1);
const mockRedisKeys = jest.fn().mockResolvedValue([]);
const mockRedisPipeline = jest.fn().mockReturnValue({ del: jest.fn(), exec: jest.fn().mockResolvedValue([]) });

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    keys: mockRedisKeys,
    pipeline: mockRedisPipeline,
    ping: jest.fn().mockResolvedValue('PONG'),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ─── Import app after mocks ──────────────────────────────────────────────────

import request from 'supertest';
import { app } from '../index';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Governance Service — Contract Tests', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
  });

  // ── Health Endpoint ──────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('should return a proper health object with required fields', async () => {
      const res = await request(app).get('/health');

      // Regardless of DB connectivity in test, the response must have the shape
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('service', 'governance-service');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('memory');
      expect(res.body).toHaveProperty('connections');
      expect(res.body.connections).toHaveProperty('database');
      expect(res.body.connections).toHaveProperty('redis');
    });

    it('should not return a bare "ok" string', async () => {
      const res = await request(app).get('/health');
      expect(res.body).not.toBe('ok');
      expect(typeof res.body).toBe('object');
    });
  });

  // ── Auth Login ───────────────────────────────────────────────────────────

  describe('POST /api/v1/governance/auth/login', () => {
    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/v1/governance/auth/login')
        .send({ password: 'Secret123!' });

      expect([400, 422]).toContain(res.status);
    });

    it('should return 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/v1/governance/auth/login')
        .send({ email: 'user@rasid.ai' });

      expect([400, 422]).toContain(res.status);
    });

    it('should return 400 when body is empty', async () => {
      const res = await request(app)
        .post('/api/v1/governance/auth/login')
        .send({});

      expect([400, 422]).toContain(res.status);
    });

    it('should return 200 with proper response shape on valid login', async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'admin@rasid.ai',
        name: 'Admin',
        role: 'admin',
        tenantId: 'tenant-1',
        status: 'active',
        passwordHash: '$2b$12$hashed',
        lastLogin: null,
        createdAt: new Date(),
      });
      mockBcryptCompare.mockResolvedValueOnce(true);
      mockRedisDel.mockResolvedValueOnce(1);
      mockRedisSet.mockResolvedValue('OK');
      mockUserUpdate.mockResolvedValueOnce({});
      mockAuditLogCreate.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/api/v1/governance/auth/login')
        .send({ email: 'admin@rasid.ai', password: 'StrongP@ss1' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('accessToken');
    });
  });

  // ── Governance Root POST (auth/register via governance routes) ───────────

  describe('POST /api/v1/governance/auth/register', () => {
    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/v1/governance/auth/register')
        .send({ email: 'test@rasid.ai' });

      expect([400, 422]).toContain(res.status);
    });

    it('should return 400 when email is invalid format', async () => {
      const res = await request(app)
        .post('/api/v1/governance/auth/register')
        .send({
          email: 'not-an-email',
          password: 'StrongP@ss1',
          name: 'Test User',
          tenantId: 'tenant-1',
        });

      expect([400, 422]).toContain(res.status);
    });

    it('should return 400 when password is too short', async () => {
      const res = await request(app)
        .post('/api/v1/governance/auth/register')
        .send({
          email: 'test@rasid.ai',
          password: 'Ab1!',
          name: 'Test User',
          tenantId: 'tenant-1',
        });

      expect([400, 422]).toContain(res.status);
    });

    it('should return 201 with proper response shape on valid registration', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null); // no existing user
      mockTenantFindUnique.mockResolvedValueOnce({ id: 'tenant-1' });
      mockUserCreate.mockResolvedValueOnce({
        id: 'user-1',
        email: 'new@rasid.ai',
        name: 'New User',
        role: 'viewer',
        tenantId: 'tenant-1',
        status: 'active',
        createdAt: new Date(),
      });
      mockRoleFindFirst.mockResolvedValueOnce({ id: 'role-1' });
      mockUserRoleCreate.mockResolvedValueOnce({});
      mockAuditLogCreate.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/api/v1/governance/auth/register')
        .send({
          email: 'new@rasid.ai',
          password: 'StrongP@ss1!',
          name: 'New User',
          tenantId: 'tenant-1',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
    });
  });

  // ── 404 for unknown routes ───────────────────────────────────────────────

  describe('Unknown routes', () => {
    it('should return 404 for non-existent endpoint', async () => {
      const res = await request(app).get('/api/v1/governance/nonexistent-endpoint');
      expect(res.status).toBe(404);
    });
  });

  // ── Response shape enforcement ───────────────────────────────────────────

  describe('Response shape enforcement', () => {
    it('should not return bare "ok" without data/artifact refs on auth endpoints', async () => {
      // Login with missing body should return structured error, not bare string
      const res = await request(app)
        .post('/api/v1/governance/auth/login')
        .send({});

      expect(typeof res.body).toBe('object');
      expect(res.body).not.toBe('ok');
      // Must contain either error or success field
      const hasStructure = res.body.error !== undefined || res.body.success !== undefined || res.body.details !== undefined;
      expect(hasStructure).toBe(true);
    });
  });
});
