import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const JWT_SECRET = process.env.JWT_SECRET || 'rasid_jwt_secret';
const JWT_EXPIRY = '24h';
const REFRESH_EXPIRY = '7d';
const SALT_ROUNDS = 12;

export class AuthService {

  async register(email: string, password: string, name: string, tenantId?: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error('Email already registered');

    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new Error('Password must contain uppercase, lowercase, and number');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    let tenant;
    if (!tenantId) {
      tenant = await prisma.tenant.create({
        data: { name: `${name}'s Organization`, plan: 'free' },
      });
      tenantId = tenant.id;
    }

    const user = await prisma.user.create({
      data: {
        tenantId,
        email,
        name,
        role: tenant ? 'admin' : 'viewer',
        passwordHash,
        status: 'ACTIVE',
      },
    });

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: REFRESH_EXPIRY }
    );

    await redis.set(`refresh:${user.id}:${refreshToken.slice(-16)}`, refreshToken, 'EX', 7 * 24 * 3600);

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: user.id,
        action: 'user.register',
        entityType: 'dataset',
        entityId: user.id,
        detailsJson: { email, name },
      },
    });

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId },
      accessToken,
      refreshToken,
    };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new Error('Account is suspended');

    const valid = await bcrypt.compare(password, user.passwordHash || '');
    if (!valid) {
      const attempts = await redis.incr(`login_attempts:${email}`);
      await redis.expire(`login_attempts:${email}`, 900);
      if (attempts >= 5) {
        await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
        throw new Error('Account locked due to too many failed attempts');
      }
      throw new Error('Invalid credentials');
    }

    await redis.del(`login_attempts:${email}`);

    const twoFASecret = await redis.get(`2fa:${user.id}`);
    if (twoFASecret) {
      return { requires2FA: true, userId: user.id, message: 'Please provide 2FA token' };
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: REFRESH_EXPIRY }
    );

    await redis.set(`refresh:${user.id}:${refreshToken.slice(-16)}`, refreshToken, 'EX', 7 * 24 * 3600);

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'user.login',
        entityType: 'dataset',
        detailsJson: { email },
      },
    });

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId },
      accessToken,
      refreshToken,
    };
  }

  async logout(userId: string, refreshToken: string) {
    await redis.del(`refresh:${userId}:${refreshToken.slice(-16)}`);
    await redis.set(`blacklist:${refreshToken.slice(-32)}`, '1', 'EX', 7 * 24 * 3600);
    return { success: true };
  }

  async refreshToken(token: string) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { id: string; type: string };
      if (payload.type !== 'refresh') throw new Error('Invalid token type');

      const stored = await redis.get(`refresh:${payload.id}:${token.slice(-16)}`);
      if (!stored) throw new Error('Token revoked');

      const blacklisted = await redis.get(`blacklist:${token.slice(-32)}`);
      if (blacklisted) throw new Error('Token blacklisted');

      const user = await prisma.user.findUnique({ where: { id: payload.id } });
      if (!user || user.status !== 'ACTIVE') throw new Error('User not found or inactive');

      const accessToken = jwt.sign(
        { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );

      const newRefreshToken = jwt.sign(
        { id: user.id, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: REFRESH_EXPIRY }
      );

      await redis.del(`refresh:${user.id}:${token.slice(-16)}`);
      await redis.set(`refresh:${user.id}:${newRefreshToken.slice(-16)}`, newRefreshToken, 'EX', 7 * 24 * 3600);

      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Token refresh failed: ${message}`);
    }
  }

  async enable2FA(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const secret = speakeasy.generateSecret({
      name: `Rasid:${user.email}`,
      issuer: 'Rasid Platform',
    });

    await redis.set(`2fa:${userId}`, secret.base32, 'EX', 365 * 24 * 3600);

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      message: 'Scan the QR code with your authenticator app, then verify with a token',
    };
  }

  async verify2FA(userId: string, token: string) {
    const secret = await redis.get(`2fa:${userId}`);
    if (!secret) throw new Error('2FA not enabled');

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) throw new Error('Invalid 2FA token');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return { verified: true, accessToken };
  }

  async checkPermission(userId: string, resource: string, action: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: { include: { permissions: true } } } } },
    });

    if (!user) return false;
    if (user.role === 'admin') return true;

    for (const ur of user.userRoles) {
      for (const perm of ur.role.permissions) {
        if ((perm.resourceType as string) === resource && ((perm.action as string) === action || (perm.action as string) === 'admin')) {
          return true;
        }
      }
    }

    return false;
  }
}

export const authService = new AuthService();
