import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { z } from 'zod';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const ShareResourceSchema = z.object({
  tenantId: z.string().min(1),
  ownerId: z.string().min(1, 'Owner ID is required'),
  resourceType: z.enum(['dashboard', 'report', 'dataset', 'presentation', 'file']),
  resourceId: z.string().min(1, 'Resource ID is required'),
  shareWith: z.array(z.object({
    type: z.enum(['user', 'role', 'team', 'email']),
    id: z.string().min(1),
    permission: z.enum(['view', 'edit', 'admin']),
  })).min(1, 'At least one share target is required'),
  expiresAt: z.string().datetime().optional(),
  message: z.string().max(500).optional(),
  allowReshare: z.boolean().default(false),
  passwordProtected: z.boolean().default(false),
  password: z.string().min(6).optional(),
});

const CreateShareLinkSchema = z.object({
  tenantId: z.string().min(1),
  ownerId: z.string().min(1),
  resourceType: z.enum(['dashboard', 'report', 'dataset', 'presentation', 'file']),
  resourceId: z.string().min(1),
  permission: z.enum(['view', 'edit']).default('view'),
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().min(1).max(10000).optional(),
  passwordProtected: z.boolean().default(false),
  password: z.string().min(6).optional(),
  allowAnonymous: z.boolean().default(false),
});

const RevokeShareSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  shareId: z.string().min(1),
});

const AccessShareLinkSchema = z.object({
  token: z.string().min(1),
  userId: z.string().optional(),
  password: z.string().optional(),
});

// ─── Service ────────────────────────────────────────────────────────────────

export class SharingService {
  private readonly SHARE_CACHE_TTL = 300;

  /**
   * Share a resource (dashboard, report, dataset, etc.) with users, roles, or teams.
   */
  async shareResource(input: z.infer<typeof ShareResourceSchema>): Promise<Record<string, unknown>> {
    const validated = ShareResourceSchema.parse(input);

    if (validated.passwordProtected && !validated.password) {
      throw new Error('Password is required when password protection is enabled');
    }

    const owner = await prisma.user.findUnique({ where: { id: validated.ownerId } });
    if (!owner || owner.tenantId !== validated.tenantId) {
      throw new Error('Owner not found in this tenant');
    }

    const shareRecords: Array<Record<string, unknown>> = [];
    const shareGroupId = crypto.randomUUID();
    const passwordHash = validated.password
      ? crypto.createHash('sha256').update(validated.password).digest('hex')
      : null;

    for (const target of validated.shareWith) {
      const shareId = crypto.randomUUID();

      if (target.type === 'user') {
        const targetUser = await prisma.user.findUnique({ where: { id: target.id } });
        if (!targetUser) {
          logger.warn('Share target user not found, skipping', { targetId: target.id });
          continue;
        }
      }

      const shareData = {
        shareId,
        shareGroupId,
        tenantId: validated.tenantId,
        ownerId: validated.ownerId,
        ownerName: owner.name,
        resourceType: validated.resourceType,
        resourceId: validated.resourceId,
        targetType: target.type,
        targetId: target.id,
        permission: target.permission,
        expiresAt: validated.expiresAt || null,
        message: validated.message || null,
        allowReshare: validated.allowReshare,
        passwordProtected: validated.passwordProtected,
        passwordHash,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      };

      await redis.set(
        `share:${validated.tenantId}:${shareId}`,
        JSON.stringify(shareData),
        'EX',
        86400,
      );

      await prisma.auditLog.create({
        data: {
          tenantId: validated.tenantId,
          userId: validated.ownerId,
          action: 'sharing.resource_shared',
          entityType: validated.resourceType,
          entityId: validated.resourceId,
          detailsJson: {
            shareId,
            shareGroupId,
            targetType: target.type,
            targetId: target.id,
            permission: target.permission,
            expiresAt: validated.expiresAt || null,
            allowReshare: validated.allowReshare,
            sharedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      shareRecords.push({
        shareId,
        targetType: target.type,
        targetId: target.id,
        permission: target.permission,
      });
    }

    await this.invalidateShareCache(validated.tenantId, validated.resourceType, validated.resourceId);

    logger.info('Resource shared', {
      tenantId: validated.tenantId,
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      shareCount: shareRecords.length,
    });

    return {
      shareGroupId,
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      shares: shareRecords,
      totalShares: shareRecords.length,
      expiresAt: validated.expiresAt || null,
      message: `Resource shared with ${shareRecords.length} target(s)`,
    };
  }

  /**
   * Create a shareable link for a resource.
   */
  async createShareLink(input: z.infer<typeof CreateShareLinkSchema>): Promise<Record<string, unknown>> {
    const validated = CreateShareLinkSchema.parse(input);

    if (validated.passwordProtected && !validated.password) {
      throw new Error('Password is required when password protection is enabled');
    }

    const owner = await prisma.user.findUnique({ where: { id: validated.ownerId } });
    if (!owner || owner.tenantId !== validated.tenantId) {
      throw new Error('Owner not found in this tenant');
    }

    const linkToken = crypto.randomBytes(32).toString('base64url');
    const linkId = crypto.randomUUID();
    const passwordHash = validated.password
      ? crypto.createHash('sha256').update(validated.password).digest('hex')
      : null;

    const linkData = {
      linkId,
      tenantId: validated.tenantId,
      ownerId: validated.ownerId,
      ownerName: owner.name,
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      permission: validated.permission,
      token: linkToken,
      expiresAt: validated.expiresAt || null,
      maxUses: validated.maxUses || null,
      currentUses: 0,
      passwordProtected: validated.passwordProtected,
      passwordHash,
      allowAnonymous: validated.allowAnonymous,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    const ttl = validated.expiresAt
      ? Math.max(1, Math.floor((new Date(validated.expiresAt).getTime() - Date.now()) / 1000))
      : 30 * 24 * 3600;

    await redis.set(
      `share_link:${linkToken}`,
      JSON.stringify(linkData),
      'EX',
      ttl,
    );

    await prisma.auditLog.create({
      data: {
        tenantId: validated.tenantId,
        userId: validated.ownerId,
        action: 'sharing.link_created',
        entityType: validated.resourceType,
        entityId: validated.resourceId,
        detailsJson: {
          linkId,
          permission: validated.permission,
          expiresAt: validated.expiresAt || null,
          maxUses: validated.maxUses || null,
          passwordProtected: validated.passwordProtected,
          allowAnonymous: validated.allowAnonymous,
          createdAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const shareUrl = `${appUrl}/shared/${linkToken}`;

    logger.info('Share link created', {
      linkId,
      tenantId: validated.tenantId,
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
    });

    return {
      linkId,
      url: shareUrl,
      token: linkToken,
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      permission: validated.permission,
      expiresAt: validated.expiresAt || null,
      maxUses: validated.maxUses || null,
      passwordProtected: validated.passwordProtected,
      allowAnonymous: validated.allowAnonymous,
      createdAt: linkData.createdAt,
    };
  }

  /**
   * Access a resource via a share link.
   */
  async accessShareLink(input: z.infer<typeof AccessShareLinkSchema>): Promise<Record<string, unknown>> {
    const validated = AccessShareLinkSchema.parse(input);

    const raw = await redis.get(`share_link:${validated.token}`);
    if (!raw) {
      throw new Error('Share link is invalid or has expired');
    }

    const linkData = JSON.parse(raw) as Record<string, unknown>;

    if (linkData.status !== 'ACTIVE') {
      throw new Error('Share link has been revoked');
    }

    if (!linkData.allowAnonymous && !validated.userId) {
      throw new Error('Authentication is required to access this resource');
    }

    if (linkData.maxUses && (linkData.currentUses as number) >= (linkData.maxUses as number)) {
      throw new Error('Share link has reached its maximum number of uses');
    }

    if (linkData.passwordProtected) {
      if (!validated.password) {
        throw new Error('Password is required to access this resource');
      }
      const providedHash = crypto.createHash('sha256').update(validated.password).digest('hex');
      if (providedHash !== linkData.passwordHash) {
        throw new Error('Incorrect password');
      }
    }

    linkData.currentUses = ((linkData.currentUses as number) || 0) + 1;
    const remainingTtl = await redis.ttl(`share_link:${validated.token}`);
    await redis.set(`share_link:${validated.token}`, JSON.stringify(linkData), 'EX', Math.max(1, remainingTtl));

    await prisma.auditLog.create({
      data: {
        tenantId: linkData.tenantId as string,
        userId: validated.userId || 'anonymous',
        action: 'sharing.link_accessed',
        entityType: linkData.resourceType as string,
        entityId: linkData.resourceId as string,
        detailsJson: {
          linkId: linkData.linkId,
          accessedBy: validated.userId || 'anonymous',
          useNumber: linkData.currentUses,
          maxUses: linkData.maxUses,
          accessedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    logger.info('Share link accessed', {
      linkId: linkData.linkId,
      accessedBy: validated.userId || 'anonymous',
      useNumber: linkData.currentUses,
    });

    return {
      granted: true,
      resourceType: linkData.resourceType,
      resourceId: linkData.resourceId,
      permission: linkData.permission,
      owner: linkData.ownerName,
      useNumber: linkData.currentUses,
      remainingUses: linkData.maxUses
        ? (linkData.maxUses as number) - (linkData.currentUses as number)
        : null,
    };
  }

  /**
   * Revoke a share or a share link.
   */
  async revokeShare(input: z.infer<typeof RevokeShareSchema>): Promise<Record<string, unknown>> {
    const validated = RevokeShareSchema.parse(input);

    const shareKey = `share:${validated.tenantId}:${validated.shareId}`;
    const shareRaw = await redis.get(shareKey);

    if (shareRaw) {
      const shareData = JSON.parse(shareRaw);

      if (shareData.ownerId !== validated.userId) {
        const user = await prisma.user.findUnique({ where: { id: validated.userId } });
        if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
          throw new Error('Only the owner or an admin can revoke this share');
        }
      }

      shareData.status = 'revoked';
      shareData.revokedAt = new Date().toISOString();
      shareData.revokedBy = validated.userId;
      await redis.set(shareKey, JSON.stringify(shareData), 'EX', 3600);

      await prisma.auditLog.create({
        data: {
          tenantId: validated.tenantId,
          userId: validated.userId,
          action: 'sharing.share_revoked',
          entityType: shareData.resourceType,
          entityId: shareData.resourceId,
          detailsJson: {
            shareId: validated.shareId,
            targetType: shareData.targetType,
            targetId: shareData.targetId,
            revokedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      logger.info('Share revoked', { shareId: validated.shareId, revokedBy: validated.userId });

      return {
        shareId: validated.shareId,
        status: 'revoked',
        revokedBy: validated.userId,
        revokedAt: shareData.revokedAt,
        message: 'Share revoked successfully',
      };
    }

    const linkKeys = await redis.keys('share_link:*');
    for (const key of linkKeys) {
      const linkRaw = await redis.get(key);
      if (!linkRaw) continue;
      const linkData = JSON.parse(linkRaw);
      if (linkData.linkId === validated.shareId) {
        if (linkData.ownerId !== validated.userId) {
          const user = await prisma.user.findUnique({ where: { id: validated.userId } });
          if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
            throw new Error('Only the owner or an admin can revoke this share link');
          }
        }

        linkData.status = 'revoked';
        await redis.set(key, JSON.stringify(linkData), 'EX', 3600);

        await prisma.auditLog.create({
          data: {
            tenantId: validated.tenantId,
            userId: validated.userId,
            action: 'sharing.link_revoked',
            entityType: linkData.resourceType,
            entityId: linkData.resourceId,
            detailsJson: {
              linkId: validated.shareId,
              revokedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });

        logger.info('Share link revoked', { linkId: validated.shareId, revokedBy: validated.userId });

        return {
          shareId: validated.shareId,
          status: 'revoked',
          type: 'link',
          revokedBy: validated.userId,
          message: 'Share link revoked successfully',
        };
      }
    }

    throw new Error(`Share '${validated.shareId}' not found`);
  }

  /**
   * List shares for a resource.
   */
  async listShares(
    tenantId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<Array<Record<string, unknown>>> {
    z.string().min(1).parse(tenantId);
    z.string().min(1).parse(resourceType);
    z.string().min(1).parse(resourceId);

    const cacheKey = `share_list:${tenantId}:${resourceType}:${resourceId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const shareKeys = await redis.keys(`share:${tenantId}:*`);
    const shares: Array<Record<string, unknown>> = [];

    for (const key of shareKeys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (
        data.resourceType === resourceType &&
        data.resourceId === resourceId &&
        data.status === 'ACTIVE'
      ) {
        shares.push({
          shareId: data.shareId,
          targetType: data.targetType,
          targetId: data.targetId,
          permission: data.permission,
          ownerName: data.ownerName,
          expiresAt: data.expiresAt,
          allowReshare: data.allowReshare,
          createdAt: data.createdAt,
        });
      }
    }

    await redis.set(cacheKey, JSON.stringify(shares), 'EX', this.SHARE_CACHE_TTL);
    return shares;
  }

  /**
   * Check if a user has access to a shared resource.
   */
  async checkShareAccess(
    tenantId: string,
    userId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<{ hasAccess: boolean; permission: string | null; source: string | null }> {
    z.string().min(1).parse(tenantId);
    z.string().min(1).parse(userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      return { hasAccess: false, permission: null, source: null };
    }

    const shareKeys = await redis.keys(`share:${tenantId}:*`);

    for (const key of shareKeys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const data = JSON.parse(raw);

      if (
        data.resourceType !== resourceType ||
        data.resourceId !== resourceId ||
        data.status !== 'ACTIVE'
      ) {
        continue;
      }

      if (data.expiresAt && new Date(data.expiresAt as string) < new Date()) {
        continue;
      }

      if (data.targetType === 'user' && data.targetId === userId) {
        return { hasAccess: true, permission: data.permission as string, source: 'direct_share' };
      }

      if (data.targetType === 'role' && data.targetId === user.role) {
        return { hasAccess: true, permission: data.permission as string, source: 'role_share' };
      }
    }

    return { hasAccess: false, permission: null, source: null };
  }

  private async invalidateShareCache(tenantId: string, resourceType: string, resourceId: string): Promise<void> {
    const cacheKey = `share_list:${tenantId}:${resourceType}:${resourceId}`;
    await redis.del(cacheKey);
  }
}

export const sharingService = new SharingService();
