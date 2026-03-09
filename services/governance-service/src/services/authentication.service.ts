import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import Redis from 'ioredis';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const JWT_SECRET = process.env.JWT_SECRET || 'rasid_jwt_secret_key_2024';
const JWT_ACCESS_EXPIRY = '15m';
const JWT_REFRESH_EXPIRY = '7d';
const SALT_ROUNDS = 12;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const mailTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

export class AuthenticationService {
  private normalizeStatus(status: string | null | undefined): string {
    return (status || '').toString().trim().toUpperCase();
  }

  async register(
    email: string,
    password: string,
    name: string,
    role: string,
    tenantId: string
  ): Promise<Record<string, unknown>> {
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new Error('A user with this email address already exists');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      throw new Error('Password must contain at least one digit');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      throw new Error('Password must contain at least one special character');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const tenantExists = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenantExists) {
      throw new Error(`Tenant with id '${tenantId}' does not exist`);
    }

    const allowedRoles = ['admin', 'editor', 'viewer', 'auditor', 'manager'];
    const assignedRole = allowedRoles.includes(role) ? role : 'viewer';

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: normalizedEmail,
        name: name.trim(),
        role: assignedRole,
        passwordHash,
        status: 'ACTIVE',
      },
    });

    const defaultRole = await prisma.role.findFirst({
      where: { name: assignedRole, tenantId },
    });
    if (defaultRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: defaultRole.id,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: user.id,
        action: 'user.registered',
        entityType: 'user',
        entityId: user.id,
        detailsJson: {
          email: normalizedEmail,
          name: name.trim(),
          role: assignedRole,
          registeredAt: new Date().toISOString(),
        },
      },
    });

    logger.info('User registered successfully', {
      userId: user.id,
      email: normalizedEmail,
      role: assignedRole,
      tenantId,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  async login(
    email: string,
    password: string
  ): Promise<Record<string, unknown>> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) {
      logger.warn('Login attempt with unknown email', { email: normalizedEmail });
      throw new Error('Invalid email or password');
    }

    const userStatus = this.normalizeStatus(user.status);
    if (userStatus !== 'ACTIVE') {
      logger.warn('Login attempt on inactive account', { userId: user.id, status: user.status });
      throw new Error('Account is not active. Please contact support.');
    }

    const loginAttemptsKey = `login_attempts:${normalizedEmail}`;
    const currentAttempts = await redis.get(loginAttemptsKey);
    const attemptCount = currentAttempts ? parseInt(currentAttempts, 10) : 0;

    if (attemptCount >= 5) {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'SUSPENDED' },
      });
      logger.warn('Account locked due to too many failed attempts', { userId: user.id });
      throw new Error('Account has been locked due to too many failed login attempts');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash || '');
    if (!passwordValid) {
      const newCount = await redis.incr(loginAttemptsKey);
      await redis.expire(loginAttemptsKey, 900);
      logger.warn('Invalid password attempt', {
        userId: user.id,
        attempts: newCount,
        remainingAttempts: Math.max(0, 5 - newCount),
      });
      throw new Error('Invalid email or password');
    }

    await redis.del(loginAttemptsKey);

    const has2FA = user.mfaEnabled
      ? (user.mfaSecret || await redis.get(`2fa_secret:${user.id}`))
      : await redis.get(`2fa_secret:${user.id}`);
    if (has2FA) {
      return {
        requires2FA: true,
        userId: user.id,
        message: 'Two-factor authentication token required',
      };
    }

    const tokenId = crypto.randomUUID();
    const accessToken = jwt.sign(
      {
        id: user.id,
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
        organizationId: user.tenantId,
        role: user.role,
        tokenId,
      },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY }
    );

    const refreshToken = jwt.sign(
      {
        id: user.id,
        type: 'refresh',
        tokenId: crypto.randomUUID(),
      },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRY }
    );

    const refreshTokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    await redis.set(
      `refresh:${user.id}:${refreshTokenHash.slice(0, 16)}`,
      refreshTokenHash,
      'EX',
      7 * 24 * 3600
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'user.login',
        entityType: 'user',
        entityId: user.id,
        detailsJson: {
          email: normalizedEmail,
          loginAt: new Date().toISOString(),
          tokenId,
        },
      },
    });

    logger.info('User logged in successfully', { userId: user.id, email: normalizedEmail });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }

  async logout(
    userId: string,
    tokenId: string
  ): Promise<Record<string, unknown>> {
    const tokenBlacklistKey = `blacklist:token:${tokenId}`;
    const remainingTTL = 15 * 60;
    await redis.set(tokenBlacklistKey, 'revoked', 'EX', remainingTTL);

    const refreshKeys = await redis.keys(`refresh:${userId}:*`);
    if (refreshKeys.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of refreshKeys) {
        pipeline.del(key);
      }
      await pipeline.exec();
      logger.info('Cleared refresh tokens for user', {
        userId,
        clearedTokens: refreshKeys.length,
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: 'system',
        userId,
        action: 'user.logout',
        entityType: 'user',
        entityId: userId,
        detailsJson: {
          tokenId,
          logoutAt: new Date().toISOString(),
          revokedRefreshTokens: refreshKeys.length,
        },
      },
    });

    logger.info('User logged out successfully', { userId, tokenId });

    return {
      success: true,
      message: 'Successfully logged out',
      revokedTokens: refreshKeys.length + 1,
    };
  }

  async refreshToken(
    refreshTokenValue: string
  ): Promise<Record<string, unknown>> {
    let payload: { id: string; type: string; email?: string; tenantId?: string; role?: string };
    try {
      payload = jwt.verify(refreshTokenValue, JWT_SECRET);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Invalid refresh token presented', { error: message });
      throw new Error('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new Error('Token is not a refresh token');
    }

    const refreshHash = crypto
      .createHash('sha256')
      .update(refreshTokenValue)
      .digest('hex');
    const storedHash = await redis.get(`refresh:${payload.id}:${refreshHash.slice(0, 16)}`);
    if (!storedHash) {
      logger.warn('Refresh token not found in store', { userId: payload.id });
      throw new Error('Refresh token has been revoked or is invalid');
    }

    const blacklisted = await redis.get(`blacklist:refresh:${refreshHash.slice(0, 32)}`);
    if (blacklisted) {
      logger.warn('Blacklisted refresh token used', { userId: payload.id });
      throw new Error('This refresh token has been blacklisted');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('User not found or account is not active');
    }

    await redis.del(`refresh:${payload.id}:${refreshHash.slice(0, 16)}`);
    await redis.set(
      `blacklist:refresh:${refreshHash.slice(0, 32)}`,
      'rotated',
      'EX',
      7 * 24 * 3600
    );

    const newTokenId = crypto.randomUUID();
    const newAccessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        tokenId: newTokenId,
      },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY }
    );

    const newRefreshToken = jwt.sign(
      {
        id: user.id,
        type: 'refresh',
        tokenId: crypto.randomUUID(),
      },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRY }
    );

    const newRefreshHash = crypto
      .createHash('sha256')
      .update(newRefreshToken)
      .digest('hex');
    await redis.set(
      `refresh:${user.id}:${newRefreshHash.slice(0, 16)}`,
      newRefreshHash,
      'EX',
      7 * 24 * 3600
    );

    logger.info('Token refreshed successfully', { userId: user.id });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    };
  }

  async forgotPassword(
    email: string
  ): Promise<Record<string, unknown>> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) {
      logger.info('Password reset requested for non-existent email', { email: normalizedEmail });
      return {
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent',
      };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'user.password_reset_requested',
        entityType: 'user',
        entityId: user.id,
        detailsJson: {
          email: normalizedEmail,
          expiresAt: expiresAt.toISOString(),
          requestedAt: new Date().toISOString(),
        },
      },
    });

    await redis.set(
      `password_reset:${resetTokenHash}`,
      JSON.stringify({
        userId: user.id,
        email: normalizedEmail,
        createdAt: new Date().toISOString(),
      }),
      'EX',
      3600
    );

    const resetUrl = `${APP_URL}/auth/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@rasid.ai',
      to: normalizedEmail,
      subject: 'RASID Platform - Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hello ${user.name},</p>
          <p>We received a request to reset your password for your RASID account.</p>
          <p>Click the link below to reset your password. This link will expire in 1 hour.</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Reset Password
          </a>
          <p>If you did not request a password reset, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #888; font-size: 12px;">RASID Governance Platform</p>
        </div>
      `,
    };

    try {
      await mailTransport.sendMail(mailOptions);
      logger.info('Password reset email sent', { email: normalizedEmail });
    } catch (mailError: unknown) {
      logger.error('Failed to send password reset email', {
        email: normalizedEmail,
        error: mailError instanceof Error ? mailError.message : String(mailError),
      });
    }

    return {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent',
    };
  }

  async resetPassword(
    token: string,
    newPassword: string
  ): Promise<Record<string, unknown>> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const storedData = await redis.get(`password_reset:${tokenHash}`);
    if (!storedData) {
      throw new Error('Password reset token is invalid or has expired');
    }

    const { userId, email } = JSON.parse(storedData);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User associated with this reset token no longer exists');
    }

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      throw new Error('New password must contain uppercase, lowercase, and a digit');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        status: 'ACTIVE',
      },
    });

    await redis.del(`password_reset:${tokenHash}`);

    const refreshKeys = await redis.keys(`refresh:${userId}:*`);
    if (refreshKeys.length > 0) {
      await redis.del(...refreshKeys);
    }

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId,
        action: 'user.password_reset_completed',
        entityType: 'user',
        entityId: userId,
        detailsJson: {
          email,
          resetAt: new Date().toISOString(),
          sessionsInvalidated: refreshKeys.length,
        },
      },
    });

    logger.info('Password reset completed', { userId, email });

    return {
      success: true,
      message: 'Password has been reset successfully. Please log in with your new password.',
    };
  }

  async enable2FA(
    userId: string
  ): Promise<Record<string, unknown>> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const existing2FA = user.mfaEnabled
      ? (user.mfaSecret || await redis.get(`2fa_secret:${userId}`))
      : await redis.get(`2fa_secret:${userId}`);
    if (existing2FA) {
      throw new Error('Two-factor authentication is already enabled for this account');
    }

    const secret = speakeasy.generateSecret({
      name: `RASID:${user.email}`,
      issuer: 'RASID Governance Platform',
      length: 32,
    });

    const otpauthUrl = secret.otpauth_url
      || `otpauth://totp/${encodeURIComponent(`RASID:${user.email}`)}?secret=${secret.base32}&issuer=${encodeURIComponent('RASID Governance Platform')}`;
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    await redis.set(
      `2fa_pending:${userId}`,
      secret.base32,
      'EX',
      600
    );

    const backupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }

    await redis.set(
      `2fa_backup:${userId}`,
      JSON.stringify(backupCodes),
      'EX',
      600
    );

    logger.info('2FA setup initiated', { userId, email: user.email });

    return {
      secret: secret.base32,
      qrCode: qrCodeDataUrl,
      otpauthUrl,
      backupCodes,
      message: 'Scan the QR code with your authenticator app, then verify with a token to complete setup',
      expiresIn: 600,
    };
  }

  async verify2FA(
    userId: string,
    token: string
  ): Promise<Record<string, unknown>> {
    const pendingSecret = await redis.get(`2fa_pending:${userId}`);
    const activeSecret = await redis.get(`2fa_secret:${userId}`);
    const secretToVerify = pendingSecret || activeSecret;

    if (!secretToVerify) {
      throw new Error('No 2FA secret found. Please initiate 2FA setup first.');
    }

    const isValid = speakeasy.totp.verify({
      secret: secretToVerify,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!isValid) {
      logger.warn('Invalid 2FA token provided', { userId });
      throw new Error('Invalid two-factor authentication token');
    }

    if (pendingSecret) {
      await redis.set(`2fa_secret:${userId}`, pendingSecret, 'EX', 365 * 24 * 3600);
      await redis.del(`2fa_pending:${userId}`);
      await prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaSecret: pendingSecret,
        },
      });

      const backupCodesRaw = await redis.get(`2fa_backup:${userId}`);
      if (backupCodesRaw) {
        await redis.set(`2fa_backup_active:${userId}`, backupCodesRaw, 'EX', 365 * 24 * 3600);
        await redis.del(`2fa_backup:${userId}`);
      }

      await prisma.auditLog.create({
        data: {
          tenantId: 'system',
          userId,
          action: 'user.2fa_enabled',
          entityType: 'user',
          entityId: userId,
          detailsJson: {
            enabledAt: new Date().toISOString(),
          },
        },
      });

      logger.info('2FA enabled successfully', { userId });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const tokenId = crypto.randomUUID();
    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        tokenId,
        twoFactorVerified: true,
      },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY }
    );

    return {
      verified: true,
      accessToken,
      message: pendingSecret
        ? 'Two-factor authentication enabled and verified successfully'
        : 'Two-factor authentication verified successfully',
    };
  }

  async disable2FA(
    userId: string,
    token: string
  ): Promise<Record<string, unknown>> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const activeSecret = user?.mfaSecret || await redis.get(`2fa_secret:${userId}`);
    if (!activeSecret) {
      throw new Error('Two-factor authentication is not enabled for this account');
    }

    const isValid = speakeasy.totp.verify({
      secret: activeSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!isValid) {
      logger.warn('Invalid 2FA token during disable attempt', { userId });
      throw new Error('Invalid two-factor authentication token. Cannot disable 2FA.');
    }

    await redis.del(`2fa_secret:${userId}`);
    await redis.del(`2fa_backup_active:${userId}`);
    await redis.del(`2fa_pending:${userId}`);
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: 'system',
        userId,
        action: 'user.2fa_disabled',
        entityType: 'user',
        entityId: userId,
        detailsJson: {
          disabledAt: new Date().toISOString(),
        },
      },
    });

    logger.info('2FA disabled successfully', { userId });

    return {
      success: true,
      message: 'Two-factor authentication has been disabled',
    };
  }
}

export const authenticationService = new AuthenticationService();
