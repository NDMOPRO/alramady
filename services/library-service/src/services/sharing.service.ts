import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ShareConfig {
  id: string;
  resourceType: 'file' | 'folder' | 'collection';
  resourceId: string;
  sharedBy: string;
  sharedWith: ShareRecipient[];
  permission: 'view' | 'comment' | 'edit' | 'admin';
  publicLink?: PublicLinkConfig;
  notifyRecipients: boolean;
  message?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShareRecipient {
  email: string;
  userId?: string;
  name: string;
  permission: 'view' | 'comment' | 'edit' | 'admin';
  addedAt: Date;
  lastAccessedAt?: Date;
}

export interface PublicLinkConfig {
  token: string;
  url: string;
  permission: 'view' | 'download';
  expiresAt?: Date;
  maxUses?: number;
  currentUses: number;
  password?: string;
  allowDownload: boolean;
  enabled: boolean;
}

export interface ShareAnalytics {
  shareId: string;
  totalViews: number;
  uniqueViewers: number;
  downloads: number;
  lastViewedAt?: Date;
  viewsByDate: { date: string; views: number }[];
  viewsByUser: { userId: string; email: string; views: number; lastViewed: Date }[];
  linkClicks: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  fileIds: string[];
  folderIds: string[];
  sharedWith: string[];
  isPublic: boolean;
  createdAt: Date;
}

export interface ShareNotification {
  id: string;
  recipientEmail: string;
  shareId: string;
  resourceName: string;
  sharedByName: string;
  message?: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: Date;
}

export interface BulkShareResult {
  successCount: number;
  failureCount: number;
  results: { resourceId: string; success: boolean; error?: string }[];
}

export interface ShareAuditEntry {
  id: string;
  shareId: string;
  action: 'created' | 'modified' | 'revoked' | 'accessed' | 'downloaded';
  performedBy: string;
  details: Record<string, unknown>;
  timestamp: Date;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class SharingService {
  private transporter: nodemailer.Transporter;

  constructor(private prisma: PrismaClient) {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });
  }

  async shareResource(
    resourceType: ShareConfig['resourceType'],
    resourceId: string,
    sharedBy: string,
    recipients: Omit<ShareRecipient, 'addedAt'>[],
    permission: ShareConfig['permission'],
    options?: { notifyRecipients?: boolean; message?: string },
  ): Promise<ShareConfig> {
    const resource = await this.getResourceInfo(resourceType, resourceId);
    if (!resource) {
      throw new Error(`${resourceType} with ID ${resourceId} not found`);
    }

    const existingShare = await this.prisma.share.findFirst({
      where: { resourceType, resourceId, sharedBy },
    });

    const enrichedRecipients: ShareRecipient[] = recipients.map(r => ({
      ...r,
      addedAt: new Date(),
    }));

    let shareId: string;
    if (existingShare) {
      const existingRecipients: ShareRecipient[] = JSON.parse(existingShare.recipients as string);
      const mergedRecipients = [...existingRecipients];

      for (const newRecipient of enrichedRecipients) {
        const existingIdx = mergedRecipients.findIndex(r => r.email === newRecipient.email);
        if (existingIdx >= 0) {
          mergedRecipients[existingIdx] = { ...mergedRecipients[existingIdx], ...newRecipient };
        } else {
          mergedRecipients.push(newRecipient);
        }
      }

      await this.prisma.share.update({
        where: { id: existingShare.id },
        data: {
          recipients: JSON.stringify(mergedRecipients),
          permission,
          updatedAt: new Date(),
        },
      });

      shareId = existingShare.id;
      enrichedRecipients.splice(0, enrichedRecipients.length, ...mergedRecipients);
    } else {
      const share = await this.prisma.share.create({
        data: {
          resourceType,
          resourceId,
          sharedBy,
          recipients: JSON.stringify(enrichedRecipients),
          permission,
          notifyRecipients: options?.notifyRecipients ?? true,
          message: options?.message || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      shareId = share.id;
    }

    if (options?.notifyRecipients !== false) {
      for (const recipient of recipients) {
        await this.sendShareNotification(shareId, recipient.email, resource.name, sharedBy, options?.message);
      }
    }

    await this.logAuditEntry(shareId, 'created', sharedBy, {
      resourceType,
      resourceId,
      recipientCount: recipients.length,
      permission,
    });

    return {
      id: shareId,
      resourceType,
      resourceId,
      sharedBy,
      sharedWith: enrichedRecipients,
      permission,
      notifyRecipients: options?.notifyRecipients ?? true,
      message: options?.message,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async generatePublicLink(
    shareId: string,
    permission: 'view' | 'download',
    options?: { expiresAt?: Date; maxUses?: number; password?: string; allowDownload?: boolean },
  ): Promise<PublicLinkConfig> {
    const share = await this.prisma.share.findUniqueOrThrow({ where: { id: shareId } });
    const token = crypto.randomBytes(32).toString('base64url');
    let hashedPassword: string | null = null;

    if (options?.password) {
      hashedPassword = crypto.createHash('sha256').update(options.password).digest('hex');
    }

    const url = `${process.env.APP_URL || 'https://app.rasid.com'}/shared/${token}`;

    const linkConfig: PublicLinkConfig = {
      token,
      url,
      permission,
      expiresAt: options?.expiresAt,
      maxUses: options?.maxUses,
      currentUses: 0,
      password: hashedPassword || undefined,
      allowDownload: options?.allowDownload ?? (permission === 'download'),
      enabled: true,
    };

    await this.prisma.share.update({
      where: { id: shareId },
      data: {
        publicLink: JSON.stringify(linkConfig),
        updatedAt: new Date(),
      },
    });

    await this.prisma.publicLink.create({
      data: {
        shareId,
        token,
        permission,
        expiresAt: options?.expiresAt || null,
        maxUses: options?.maxUses || null,
        currentUses: 0,
        passwordHash: hashedPassword,
        allowDownload: linkConfig.allowDownload,
        enabled: true,
        createdAt: new Date(),
      },
    });

    await this.logAuditEntry(shareId, 'modified', share.sharedBy, {
      action: 'public_link_generated',
      token: token.slice(0, 8) + '...',
      permission,
    });

    return linkConfig;
  }

  async accessPublicLink(token: string, password?: string): Promise<{
    allowed: boolean;
    shareId?: string;
    resourceType?: string;
    resourceId?: string;
    permission?: string;
    reason?: string;
  }> {
    const link = await this.prisma.publicLink.findFirst({
      where: { token, enabled: true },
    });

    if (!link) {
      return { allowed: false, reason: 'Invalid or disabled link' };
    }

    if (link.expiresAt && new Date() > link.expiresAt) {
      return { allowed: false, reason: 'Link has expired' };
    }

    if (link.maxUses && link.currentUses >= link.maxUses) {
      return { allowed: false, reason: 'Link has reached maximum uses' };
    }

    if (link.passwordHash) {
      if (!password) {
        return { allowed: false, reason: 'Password required' };
      }
      const inputHash = crypto.createHash('sha256').update(password).digest('hex');
      if (inputHash !== link.passwordHash) {
        return { allowed: false, reason: 'Invalid password' };
      }
    }

    await this.prisma.publicLink.update({
      where: { id: link.id },
      data: { currentUses: { increment: 1 } },
    });

    const share = await this.prisma.share.findUnique({ where: { id: link.shareId } });
    if (!share) {
      return { allowed: false, reason: 'Share not found' };
    }

    await this.logAuditEntry(link.shareId, 'accessed', 'anonymous', {
      accessType: 'public_link',
      token: token.slice(0, 8) + '...',
    });

    return {
      allowed: true,
      shareId: link.shareId,
      resourceType: share.resourceType,
      resourceId: share.resourceId,
      permission: link.permission,
    };
  }

  async getShareAnalytics(shareId: string): Promise<ShareAnalytics> {
    const accessLogs = await this.prisma.shareAccessLog.findMany({
      where: { shareId },
      orderBy: { timestamp: 'desc' },
    });

    const totalViews = accessLogs.filter(l => l.action === 'view').length;
    const downloads = accessLogs.filter(l => l.action === 'download').length;
    const uniqueViewers = new Set(accessLogs.map(l => l.userId || l.ipAddress)).size;
    const lastViewedAt = accessLogs.length > 0 ? accessLogs[0].timestamp : undefined;
    const linkClicks = accessLogs.filter(l => l.action === 'link_click').length;

    const viewsByDateMap = new Map<string, number>();
    for (const log of accessLogs.filter(l => l.action === 'view')) {
      const dateKey = log.timestamp.toISOString().split('T')[0];
      viewsByDateMap.set(dateKey, (viewsByDateMap.get(dateKey) || 0) + 1);
    }

    const viewsByUserMap = new Map<string, { email: string; views: number; lastViewed: Date }>();
    for (const log of accessLogs.filter(l => l.action === 'view' && l.userId)) {
      const existing = viewsByUserMap.get(log.userId!) || {
        email: log.userEmail || '',
        views: 0,
        lastViewed: log.timestamp,
      };
      existing.views += 1;
      if (log.timestamp > existing.lastViewed) existing.lastViewed = log.timestamp;
      viewsByUserMap.set(log.userId!, existing);
    }

    return {
      shareId,
      totalViews,
      uniqueViewers,
      downloads,
      lastViewedAt,
      viewsByDate: Array.from(viewsByDateMap.entries())
        .map(([date, views]) => ({ date, views }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      viewsByUser: Array.from(viewsByUserMap.entries())
        .map(([userId, stats]) => ({ userId, ...stats }))
        .sort((a, b) => b.views - a.views),
      linkClicks,
    };
  }

  async createCollection(
    name: string,
    description: string,
    ownerId: string,
    fileIds: string[],
    folderIds: string[] = [],
  ): Promise<Collection> {
    const verifiedFiles = await this.prisma.file.findMany({
      where: { id: { in: fileIds } },
      select: { id: true },
    });
    const verifiedFileIds = verifiedFiles.map(f => f.id);
    const missingFiles = fileIds.filter(id => !verifiedFileIds.includes(id));

    if (missingFiles.length > 0) {
      throw new Error(`Files not found: ${missingFiles.join(', ')}`);
    }

    const collection = await this.prisma.collection.create({
      data: {
        name,
        description,
        ownerId,
        fileIds: JSON.stringify(verifiedFileIds),
        folderIds: JSON.stringify(folderIds),
        sharedWith: JSON.stringify([]),
        isPublic: false,
        createdAt: new Date(),
      },
    });

    return {
      id: collection.id,
      name,
      description,
      ownerId,
      fileIds: verifiedFileIds,
      folderIds,
      sharedWith: [],
      isPublic: false,
      createdAt: collection.createdAt,
    };
  }

  private async sendShareNotification(
    shareId: string,
    recipientEmail: string,
    resourceName: string,
    sharedByName: string,
    message?: string,
  ): Promise<void> {
    const notification = await this.prisma.shareNotification.create({
      data: {
        shareId,
        recipientEmail,
        resourceName,
        sharedByName,
        message: message || null,
        status: 'pending',
        createdAt: new Date(),
      },
    });

    try {
      const shareUrl = `${process.env.APP_URL || 'https://app.rasid.com'}/shared/accept/${shareId}`;
      const emailBody = `
        <h2>New Share</h2>
        <p><strong>${sharedByName}</strong> has shared "${resourceName}" with you.</p>
        ${message ? `<p>Message: ${message}</p>` : ''}
        <p><a href="${shareUrl}" style="display:inline-block;padding:10px 20px;background:#1976D2;color:white;text-decoration:none;border-radius:4px;">Open Shared Item</a></p>
        <p>If the button doesn't work, copy this link: ${shareUrl}</p>
      `;

      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@rasid.com',
        to: recipientEmail,
        subject: `${sharedByName} shared "${resourceName}" with you`,
        html: emailBody,
      });

      await this.prisma.shareNotification.update({
        where: { id: notification.id },
        data: { status: 'sent', sentAt: new Date() },
      });
    } catch (err) {
      await this.prisma.shareNotification.update({
        where: { id: notification.id },
        data: { status: 'failed', errorMessage: (err as Error).message },
      });
    }
  }

  async bulkShare(
    resourceIds: string[],
    resourceType: ShareConfig['resourceType'],
    sharedBy: string,
    recipients: Omit<ShareRecipient, 'addedAt'>[],
    permission: ShareConfig['permission'],
  ): Promise<BulkShareResult> {
    const results: { resourceId: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const resourceId of resourceIds) {
      try {
        await this.shareResource(resourceType, resourceId, sharedBy, recipients, permission, {
          notifyRecipients: false,
        });
        results.push({ resourceId, success: true });
        successCount += 1;
      } catch (err) {
        results.push({ resourceId, success: false, error: (err as Error).message });
        failureCount += 1;
      }
    }

    if (successCount > 0) {
      for (const recipient of recipients) {
        await this.sendShareNotification(
          'bulk', recipient.email, `${successCount} items`, sharedBy,
          `${successCount} items have been shared with you.`,
        );
      }
    }

    return { successCount, failureCount, results };
  }

  async revokeShare(shareId: string, revokedBy: string, recipientEmail?: string): Promise<void> {
    const share = await this.prisma.share.findUniqueOrThrow({ where: { id: shareId } });

    if (recipientEmail) {
      const recipients: ShareRecipient[] = JSON.parse(share.recipients as string);
      const updatedRecipients = recipients.filter(r => r.email !== recipientEmail);

      await this.prisma.share.update({
        where: { id: shareId },
        data: {
          recipients: JSON.stringify(updatedRecipients),
          updatedAt: new Date(),
        },
      });

      await this.logAuditEntry(shareId, 'modified', revokedBy, {
        action: 'recipient_removed',
        recipientEmail,
      });
    } else {
      await this.prisma.publicLink.updateMany({
        where: { shareId },
        data: { enabled: false },
      });

      await this.prisma.share.update({
        where: { id: shareId },
        data: {
          recipients: JSON.stringify([]),
          publicLink: null,
          updatedAt: new Date(),
        },
      });

      await this.logAuditEntry(shareId, 'revoked', revokedBy, {
        action: 'share_revoked',
      });
    }
  }

  async getShareAuditTrail(shareId: string): Promise<ShareAuditEntry[]> {
    const entries = await this.prisma.shareAuditLog.findMany({
      where: { shareId },
      orderBy: { timestamp: 'desc' },
    });

    return entries.map(e => ({
      id: e.id,
      shareId: e.shareId,
      action: e.action as ShareAuditEntry['action'],
      performedBy: e.performedBy,
      details: JSON.parse(e.details as string || '{}'),
      timestamp: e.timestamp,
    }));
  }

  private async logAuditEntry(
    shareId: string,
    action: ShareAuditEntry['action'],
    performedBy: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.shareAuditLog.create({
      data: {
        shareId,
        action,
        performedBy,
        details: JSON.stringify(details),
        timestamp: new Date(),
      },
    });
  }

  private async getResourceInfo(resourceType: string, resourceId: string): Promise<{ name: string } | null> {
    if (resourceType === 'file') {
      return this.prisma.file.findUnique({ where: { id: resourceId }, select: { name: true } });
    } else if (resourceType === 'folder') {
      return this.prisma.folder.findUnique({ where: { id: resourceId }, select: { name: true } });
    } else if (resourceType === 'collection') {
      return this.prisma.collection.findUnique({ where: { id: resourceId }, select: { name: true } });
    }
    return null;
  }
}
