// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
const mockUserUpdate = jest.fn();
const mockTenantFindUnique = jest.fn();
const mockRoleFindFirst = jest.fn();
const mockUserRoleCreate = jest.fn();
const mockAuditLogCreate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
    tenant: { findUnique: mockTenantFindUnique },
    role: { findFirst: mockRoleFindFirst },
    userRole: { create: mockUserRoleCreate },
    auditLog: { create: mockAuditLogCreate },
  })),
}));

const mockBcryptHash = jest.fn().mockResolvedValue('$2b$12$hashedpassword');
const mockBcryptCompare = jest.fn();

jest.mock('bcrypt', () => ({
  __esModule: true,
  default: {
    hash: mockBcryptHash,
    compare: mockBcryptCompare,
  },
}));

const mockJwtSign = jest.fn().mockReturnValue('mock.jwt.token');
const mockJwtVerify = jest.fn();

jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    sign: mockJwtSign,
    verify: mockJwtVerify,
  },
}));

const mockSpeakeasyGenerateSecret = jest.fn();
const mockSpeakeasyVerify = jest.fn();

jest.mock('speakeasy', () => ({
  __esModule: true,
  default: {
    generateSecret: mockSpeakeasyGenerateSecret,
    totp: { verify: mockSpeakeasyVerify },
  },
}));

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockQR'),
  },
}));

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
const mockRedisIncr = jest.fn();
const mockRedisExpire = jest.fn();
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
  })),
}));

jest.mock('crypto', () => ({
  __esModule: true,
  default: {
    randomUUID: jest.fn().mockReturnValue('mock-uuid'),
    randomBytes: jest.fn().mockReturnValue({ toString: jest.fn().mockReturnValue('a1b2c3d4e5f6') }),
    createHash: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('hashedtoken'),
    }),
  },
}));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn().mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({}),
    }),
  },
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

// ─── Import Under Test ──────────────────────────────────────────────────────

import { AuthenticationService } from '../services/authentication.service';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Engine 10.1 - Authentication Service', () => {
  let authService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthenticationService();
  });

  describe('register', () => {
    it('should register a new user with hashed password', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null); // no existing user
      mockTenantFindUnique.mockResolvedValueOnce({ id: 'tenant-1' });
      mockUserCreate.mockResolvedValueOnce({
        id: 'user-1', email: 'test@rasid.ai', name: 'Test', role: 'editor',
        tenantId: 'tenant-1', status: 'active', createdAt: new Date(),
      });
      mockRoleFindFirst.mockResolvedValueOnce({ id: 'role-1' });
      mockUserRoleCreate.mockResolvedValueOnce({});
      mockAuditLogCreate.mockResolvedValueOnce({});

      const result = await authService.register(
        'test@rasid.ai', 'StrongP@ss1', 'Test', 'editor', 'tenant-1',
      );

      expect(result.email).toBe('test@rasid.ai');
      expect(result.role).toBe('editor');
      expect(mockBcryptHash).toHaveBeenCalled();
    });

    it('should throw if email already exists', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'existing' });

      await expect(
        authService.register('existing@rasid.ai', 'StrongP@ss1', 'Test', 'viewer', 'tenant-1'),
      ).rejects.toThrow('A user with this email address already exists');
    });

    it('should throw if password is too short', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);

      await expect(
        authService.register('new@rasid.ai', 'Ab1!', 'Test', 'viewer', 'tenant-1'),
      ).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should throw if password has no uppercase letter', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);

      await expect(
        authService.register('new@rasid.ai', 'lowercase1!', 'Test', 'viewer', 'tenant-1'),
      ).rejects.toThrow('Password must contain at least one uppercase letter');
    });

    it('should throw if password has no special character', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);

      await expect(
        authService.register('new@rasid.ai', 'Uppercase1a', 'Test', 'viewer', 'tenant-1'),
      ).rejects.toThrow('Password must contain at least one special character');
    });

    it('should throw if tenant does not exist', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);
      mockTenantFindUnique.mockResolvedValueOnce(null);

      await expect(
        authService.register('new@rasid.ai', 'StrongP@ss1', 'Test', 'viewer', 'bad-tenant'),
      ).rejects.toThrow("Tenant with id 'bad-tenant' does not exist");
    });
  });

  describe('login', () => {
    const mockUser = {
      id: 'user-1', email: 'test@rasid.ai', name: 'Test',
      role: 'editor', tenantId: 'tenant-1', status: 'active',
      passwordHash: '$2b$12$hashed', lastLogin: null, createdAt: new Date(),
    };

    it('should login successfully and return tokens', async () => {
      mockUserFindUnique.mockResolvedValueOnce(mockUser);
      mockRedisGet.mockResolvedValueOnce(null); // no login attempts
      mockBcryptCompare.mockResolvedValueOnce(true);
      mockRedisDel.mockResolvedValueOnce(1);
      mockRedisGet.mockResolvedValueOnce(null); // no 2FA
      mockRedisSet.mockResolvedValue('OK');
      mockUserUpdate.mockResolvedValueOnce({});
      mockAuditLogCreate.mockResolvedValueOnce({});

      const result = await authService.login('test@rasid.ai', 'StrongP@ss1');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('test@rasid.ai');
    });

    it('should throw on invalid email', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);

      await expect(authService.login('unknown@rasid.ai', 'pass')).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('should throw when account is inactive', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ ...mockUser, status: 'suspended' });

      await expect(authService.login('test@rasid.ai', 'pass')).rejects.toThrow(
        'Account is not active',
      );
    });

    it('should lock account after 5 failed attempts', async () => {
      mockUserFindUnique.mockResolvedValueOnce(mockUser);
      mockRedisGet.mockResolvedValueOnce('5'); // already 5 attempts
      mockUserUpdate.mockResolvedValueOnce({});

      await expect(authService.login('test@rasid.ai', 'wrong')).rejects.toThrow(
        'Account has been locked',
      );
    });

    it('should return 2FA prompt when 2FA is enabled', async () => {
      mockUserFindUnique.mockResolvedValueOnce(mockUser);
      mockRedisGet
        .mockResolvedValueOnce(null) // login attempts
        .mockResolvedValueOnce('secret123'); // 2FA secret exists
      mockBcryptCompare.mockResolvedValueOnce(true);
      mockRedisDel.mockResolvedValueOnce(1);

      const result = await authService.login('test@rasid.ai', 'StrongP@ss1');

      expect(result.requires2FA).toBe(true);
    });
  });

  describe('enable2FA', () => {
    it('should generate a 2FA secret and QR code', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1', email: 'test@rasid.ai' });
      mockRedisGet.mockResolvedValueOnce(null); // no existing 2FA
      mockSpeakeasyGenerateSecret.mockReturnValueOnce({
        base32: 'JBSWY3DPEHPK3PXP',
        otpauth_url: 'otpauth://totp/RASID:test@rasid.ai?secret=JBSWY3DPEHPK3PXP',
      });
      mockRedisSet.mockResolvedValue('OK');

      const result = await authService.enable2FA('user-1');

      expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(result.qrCode).toContain('data:image/png');
      expect(result.backupCodes).toHaveLength(10);
    });

    it('should throw if 2FA is already enabled', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1', email: 'test@rasid.ai' });
      mockRedisGet.mockResolvedValueOnce('existing-secret');

      await expect(authService.enable2FA('user-1')).rejects.toThrow(
        'Two-factor authentication is already enabled',
      );
    });
  });

  describe('verify2FA', () => {
    it('should verify a valid 2FA token and return access token', async () => {
      mockRedisGet
        .mockResolvedValueOnce('pendingSecret') // pending secret
        .mockResolvedValueOnce(null) // no active secret
        .mockResolvedValueOnce('["CODE1","CODE2"]'); // backup codes
      mockSpeakeasyVerify.mockReturnValueOnce(true);
      mockRedisSet.mockResolvedValue('OK');
      mockRedisDel.mockResolvedValue(1);
      mockAuditLogCreate.mockResolvedValueOnce({});
      mockUserFindUnique.mockResolvedValueOnce({
        id: 'user-1', email: 'test@rasid.ai', tenantId: 'tenant-1', role: 'editor',
      });

      const result = await authService.verify2FA('user-1', '123456');

      expect(result.verified).toBe(true);
      expect(result.accessToken).toBeDefined();
    });

    it('should throw on invalid 2FA token', async () => {
      mockRedisGet
        .mockResolvedValueOnce(null)  // no pending
        .mockResolvedValueOnce('activeSecret'); // active secret
      mockSpeakeasyVerify.mockReturnValueOnce(false);

      await expect(authService.verify2FA('user-1', 'badtoken')).rejects.toThrow(
        'Invalid two-factor authentication token',
      );
    });
  });

  describe('logout', () => {
    it('should blacklist token and clear refresh tokens', async () => {
      mockRedisSet.mockResolvedValue('OK');
      mockRedisKeys.mockResolvedValueOnce(['refresh:user-1:abc']);
      mockRedisPipeline.mockReturnValueOnce({
        del: jest.fn(),
        exec: jest.fn().mockResolvedValue([]),
      });
      mockAuditLogCreate.mockResolvedValueOnce({});

      const result = await authService.logout('user-1', 'token-id');

      expect(result.success).toBe(true);
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringContaining('blacklist:token:'),
        'revoked',
        'EX',
        expect.any(Number),
      );
    });
  });
});
