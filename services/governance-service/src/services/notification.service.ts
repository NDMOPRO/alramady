import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

const mailTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

export class NotificationService {

  async sendNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, tenantId: true },
    });
    if (!user) {
      throw new Error(`User with id '${userId}' not found`);
    }

    const validTypes = ['info', 'warning', 'error', 'success', 'approval', 'system', 'alert'];
    const normalizedType = validTypes.includes(type) ? type : 'info';

    const notificationId = crypto.randomUUID();

    const notification = await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId,
        action: 'notification.created',
        entityType: 'notification',
        entityId: notificationId,
        detailsJson: {
          notificationId,
          type: normalizedType,
          title: title.trim(),
          body: body.trim(),
          data: data || null,
          read: false,
          readAt: null,
          createdAt: new Date().toISOString(),
        },
      },
    });

    logger.info('In-app notification created', {
      notificationId,
      userId,
      type: normalizedType,
      title: title.trim(),
    });

    return {
      id: notificationId,
      userId,
      type: normalizedType,
      title: title.trim(),
      body: body.trim(),
      data: data || null,
      read: false,
      createdAt: notification.createdAt,
    };
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: Array<{ filename: string; content: Buffer }>
  ): Promise<Record<string, unknown>> {
    if (!to || !to.includes('@')) {
      throw new Error('A valid email address is required');
    }
    if (!subject || !subject.trim()) {
      throw new Error('Email subject is required');
    }
    if (!body || !body.trim()) {
      throw new Error('Email body is required');
    }

    const mailOptions: nodemailer.SendMailOptions = {
      from: process.env.SMTP_FROM || 'noreply@rasid.ai',
      to: to.trim(),
      subject: subject.trim(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #4F46E5; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">RASID Platform</h2>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            ${body.trim()}
          </div>
          <div style="padding: 12px 24px; text-align: center; color: #9ca3af; font-size: 12px;">
            <p>RASID Governance Platform &copy; ${new Date().getFullYear()}</p>
          </div>
        </div>
      `,
    };

    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map(att => ({
        filename: att.filename,
        content: att.content,
      }));
    }

    const messageId = crypto.randomUUID();
    let sendResult: Record<string, unknown>;

    try {
      sendResult = await mailTransport.sendMail(mailOptions);
      logger.info('Email sent successfully', {
        messageId,
        to: to.trim(),
        subject: subject.trim(),
        smtpMessageId: sendResult.messageId,
        attachmentCount: attachments ? attachments.length : 0,
      });
    } catch (sendError: unknown) {
      const errMsg = sendError instanceof Error ? sendError.message : String(sendError);
      logger.error('Failed to send email', {
        messageId,
        to: to.trim(),
        error: errMsg,
      });
      throw new Error(`Failed to send email: ${errMsg}`);
    }

    return {
      success: true,
      messageId,
      smtpMessageId: sendResult.messageId,
      to: to.trim(),
      subject: subject.trim(),
      attachmentCount: attachments ? attachments.length : 0,
      sentAt: new Date().toISOString(),
    };
  }

  async getNotifications(
    userId: string,
    unreadOnly?: boolean,
    pagination?: { page: number; limit: number }
  ): Promise<Record<string, unknown>> {
    const page = pagination?.page || 1;
    const limit = Math.min(pagination?.limit || 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      userId,
      entityType: 'notification',
      action: 'notification.created',
    };

    const notifications = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const total = await prisma.auditLog.count({ where });

    let filtered = notifications.map(n => {
      const details = n.detailsJson as Record<string, unknown>;
      return {
        id: details?.notificationId || n.id,
        type: details?.type || 'info',
        title: details?.title || '',
        body: details?.body || '',
        data: details?.data || null,
        read: details?.read || false,
        readAt: details?.readAt || null,
        createdAt: n.createdAt,
      };
    });

    if (unreadOnly) {
      filtered = filtered.filter(n => !n.read);
    }

    const unreadCount = filtered.filter(n => !n.read).length;
    const totalPages = Math.ceil(total / limit);

    logger.debug('Notifications retrieved', {
      userId,
      totalFound: total,
      unreadCount,
      page,
      limit,
    });

    return {
      notifications: filtered,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async markAsRead(
    notificationId: string,
    userId: string
  ): Promise<Record<string, unknown>> {
    const notificationLogs = await prisma.auditLog.findMany({
      where: {
        userId,
        entityType: 'notification',
        action: 'notification.created',
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const matchingLog = notificationLogs.find(n => {
      const details = n.detailsJson as Record<string, unknown>;
      return details?.notificationId === notificationId;
    });

    if (!matchingLog) {
      throw new Error(`Notification '${notificationId}' not found for user '${userId}'`);
    }

    const existingDetails = matchingLog.detailsJson as Record<string, unknown>;
    if (existingDetails.read) {
      return {
        id: notificationId,
        read: true,
        readAt: existingDetails.readAt,
        message: 'Notification was already marked as read',
      };
    }

    const readAt = new Date().toISOString();

    await prisma.auditLog.create({
      data: {
        tenantId: matchingLog.tenantId,
        userId,
        action: 'notification.read',
        entityType: 'notification',
        entityId: notificationId,
        detailsJson: {
          ...existingDetails,
          read: true,
          readAt,
        },
      },
    });

    logger.info('Notification marked as read', { notificationId, userId });

    return {
      id: notificationId,
      read: true,
      readAt,
      message: 'Notification marked as read',
    };
  }
}

export const notificationService = new NotificationService();
