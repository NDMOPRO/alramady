import { PrismaClient } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import * as crypto from 'crypto';
import * as fs from 'fs';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DistributionConfig {
  id: string;
  reportId: string;
  name: string;
  recipients: Recipient[];
  schedule?: DistributionSchedule;
  format: 'pdf' | 'xlsx' | 'csv' | 'html';
  includeWatermark: boolean;
  watermarkText?: string;
  emailSubject: string;
  emailBody: string;
  trackReadReceipts: boolean;
  accessControl: AccessConfig;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface Recipient {
  email: string;
  name: string;
  role: 'to' | 'cc' | 'bcc';
  userId?: string;
}

export interface DistributionSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  time: string;
  timezone: string;
}

export interface AccessConfig {
  requirePassword: boolean;
  password?: string;
  expiresAt?: Date;
  maxViews?: number;
  allowDownload: boolean;
  allowPrint: boolean;
}

export interface DistributionRecord {
  id: string;
  distributionConfigId: string;
  reportId: string;
  sentAt: Date;
  recipientCount: number;
  status: 'sent' | 'failed' | 'partial';
  errorMessage?: string;
  fileSize: number;
  readReceipts: ReadReceipt[];
}

export interface ReadReceipt {
  recipientEmail: string;
  readAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  viewCount: number;
}

export interface DistributionAnalytics {
  distributionId: string;
  totalSent: number;
  totalOpened: number;
  openRate: number;
  averageTimeToOpen: number;
  topRecipients: { email: string; openCount: number }[];
  deliveryTrend: { date: string; sent: number; opened: number }[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DistributionService {
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

  async createDistribution(
    input: Omit<DistributionConfig, 'id' | 'createdAt'>,
  ): Promise<DistributionConfig> {
    const validationErrors = this.validateDistributionConfig(input);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }

    let hashedPassword: string | null = null;
    if (input.accessControl.requirePassword && input.accessControl.password) {
      hashedPassword = crypto
        .createHash('sha256')
        .update(input.accessControl.password)
        .digest('hex');
    }

    const config = await this.prisma.distributionConfig.create({
      data: {
        reportId: input.reportId,
        name: input.name,
        recipients: JSON.stringify(input.recipients),
        schedule: input.schedule ? JSON.parse(JSON.stringify(input.schedule)) : undefined,
        format: input.format.toUpperCase() as 'PDF' | 'XLSX' | 'CSV' | 'HTML',
        includeWatermark: input.includeWatermark,
        watermarkText: input.watermarkText || null,
        emailSubject: input.emailSubject,
        emailBody: input.emailBody,
        trackReadReceipts: input.trackReadReceipts,
        accessPassword: hashedPassword,
        accessExpiry: input.accessControl.expiresAt || null,
        maxViews: input.accessControl.maxViews || null,
        allowDownload: input.accessControl.allowDownload,
        allowPrint: input.accessControl.allowPrint,
        enabled: input.enabled,
        createdBy: input.createdBy,
        createdAt: new Date(),
      },
    });

    return { ...input, id: config.id, createdAt: config.createdAt };
  }

  private validateDistributionConfig(input: Omit<DistributionConfig, 'id' | 'createdAt'>): string[] {
    const errors: string[] = [];
    if (!input.reportId) errors.push('Report ID is required');
    if (!input.name || input.name.trim().length === 0) errors.push('Distribution name is required');
    if (!input.recipients || input.recipients.length === 0) errors.push('At least one recipient is required');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const recipient of input.recipients || []) {
      if (!emailRegex.test(recipient.email)) {
        errors.push(`Invalid email address: ${recipient.email}`);
      }
    }

    if (!input.emailSubject || input.emailSubject.trim().length === 0) {
      errors.push('Email subject is required');
    }

    if (input.schedule) {
      if (input.schedule.frequency === 'weekly' && input.schedule.dayOfWeek === undefined) {
        errors.push('Day of week is required for weekly schedule');
      }
      if (input.schedule.frequency === 'monthly' && input.schedule.dayOfMonth === undefined) {
        errors.push('Day of month is required for monthly schedule');
      }
    }

    return errors;
  }

  async distributeReport(distributionConfigId: string): Promise<DistributionRecord> {
    const config = await this.prisma.distributionConfig.findUniqueOrThrow({
      where: { id: distributionConfigId },
    });

    const recipients: Recipient[] = JSON.parse(config.recipients as string);
    const report = await this.prisma.reportDefinition.findUniqueOrThrow({
      where: { id: config.reportId },
    });

    // Get the latest build output for this report
    const latestBuild = await this.prisma.reportBuildOutput.findFirst({
      where: { reportId: config.reportId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });

    let fileBuffer: Buffer;
    let fileSize: number;

    if (latestBuild?.filePath) {
      const filePath = latestBuild.filePath;
      if (config.includeWatermark && config.watermarkText && config.format === 'PDF') {
        const watermarkedPath = await this.applyWatermark(filePath, config.watermarkText, 'pdf');
        fileBuffer = fs.readFileSync(watermarkedPath);
      } else {
        fileBuffer = fs.readFileSync(filePath);
      }
      fileSize = fileBuffer.length;
    } else {
      // Generate a simple text buffer if no build output exists
      const content = `Report: ${(report as Record<string, unknown>).name}\nGenerated: ${new Date().toISOString()}`;
      fileBuffer = Buffer.from(content, 'utf-8');
      fileSize = fileBuffer.length;
    }

    const toRecipients = recipients.filter(r => r.role === 'to').map(r => r.email);
    const ccRecipients = recipients.filter(r => r.role === 'cc').map(r => r.email);
    const bccRecipients = recipients.filter(r => r.role === 'bcc').map(r => r.email);

    let trackingPixel = '';
    const trackingIds: Map<string, string> = new Map();
    if (config.trackReadReceipts) {
      for (const recipient of recipients) {
        const trackingId = crypto.randomBytes(16).toString('hex');
        trackingIds.set(recipient.email, trackingId);
      }
      const firstTrackingId = trackingIds.values().next().value;
      trackingPixel = `<img src="${process.env.TRACKING_URL}/track/${firstTrackingId}" width="1" height="1" />`;
    }

    const emailBody = config.emailBody + (trackingPixel ? `<br/>${trackingPixel}` : '');

    let status: 'sent' | 'failed' | 'partial' = 'sent';
    let errorMessage: string | undefined;
    const failedRecipients: string[] = [];

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@rasid.com',
        to: toRecipients.join(', '),
        cc: ccRecipients.length > 0 ? ccRecipients.join(', ') : undefined,
        bcc: bccRecipients.length > 0 ? bccRecipients.join(', ') : undefined,
        subject: this.interpolateSubject(config.emailSubject, report as Record<string, unknown>),
        html: emailBody,
        attachments: [{
          filename: `${(report as Record<string, unknown>).name}.${config.format}`,
          content: fileBuffer,
          contentType: this.getContentType(config.format as string),
        }],
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      status = 'failed';
      errorMessage = error.message;

      for (const recipient of toRecipients) {
        try {
          await this.transporter.sendMail({
            from: process.env.SMTP_FROM || 'noreply@rasid.com',
            to: recipient,
            subject: this.interpolateSubject(config.emailSubject as string, report as Record<string, unknown>),
            html: emailBody,
            attachments: [{
              filename: `${(report as Record<string, unknown>).name}.${config.format}`,
              content: fileBuffer,
              contentType: this.getContentType(config.format as string),
            }],
          });
        } catch {
          failedRecipients.push(recipient);
        }
      }

      if (failedRecipients.length < toRecipients.length) {
        status = 'partial';
      }
    }

    const readReceipts: ReadReceipt[] = recipients.map(r => ({
      recipientEmail: r.email,
      viewCount: 0,
    }));

    const record = await this.prisma.distributionRecord.create({
      data: {
        distributionConfigId,
        reportId: config.reportId,
        sentAt: new Date(),
        recipientCount: recipients.length,
        status: status.toUpperCase() as 'SENT' | 'FAILED' | 'PARTIAL',
        errorMessage: errorMessage || null,
        fileSize,
        readReceipts: JSON.parse(JSON.stringify(readReceipts)),
        trackingIds: JSON.stringify(Object.fromEntries(trackingIds)),
      },
    });

    return {
      id: record.id,
      distributionConfigId,
      reportId: config.reportId,
      sentAt: record.sentAt ?? new Date(),
      recipientCount: recipients.length,
      status,
      errorMessage,
      fileSize: Number(fileSize),
      readReceipts,
    };
  }

  private interpolateSubject(template: string, report: Record<string, unknown>): string {
    let result = template;
    result = result.replace('{{reportName}}', String(report.name || ''));
    result = result.replace('{{date}}', new Date().toLocaleDateString());
    result = result.replace('{{time}}', new Date().toLocaleTimeString());
    result = result.replace('{{year}}', String(new Date().getFullYear()));
    result = result.replace('{{month}}', new Date().toLocaleString('default', { month: 'long' }));
    return result;
  }

  private getContentType(format: string): string {
    const contentTypes: Record<string, string> = {
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
      html: 'text/html',
    };
    return contentTypes[format] || 'application/octet-stream';
  }

  async applyWatermark(filePath: string, watermarkText: string, format: string): Promise<string> {
    if (format !== 'pdf') {
      return filePath;
    }

    const outputPath = `/tmp/watermarked_${Date.now()}.pdf`;
    const doc = new PDFDocument({ autoFirstPage: false });
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    const existingBuffer = fs.readFileSync(filePath);
    doc.addPage({ size: 'A4' });

    doc.save();
    doc.translate(doc.page.width / 2, doc.page.height / 2);
    doc.rotate(-45);
    doc.fontSize(60);
    doc.fillColor('gray', 0.15);
    doc.text(watermarkText, -200, -30, { align: 'center' });
    doc.restore();

    doc.save();
    doc.fontSize(8);
    doc.fillColor('gray', 0.3);
    const timestamp = new Date().toISOString();
    doc.text(`Distributed: ${timestamp} | ${watermarkText}`, 50, doc.page.height - 30);
    doc.restore();

    doc.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    return outputPath;
  }

  async trackReadReceipt(trackingId: string, ipAddress: string, userAgent: string): Promise<void> {
    const records = await this.prisma.distributionRecord.findMany({
      where: { trackingIds: { path: [], string_contains: trackingId } },
    });

    for (const record of records) {
      const trackingIds: Record<string, string> = JSON.parse(record.trackingIds as string || '{}');
      let recipientEmail: string | null = null;

      for (const [email, id] of Object.entries(trackingIds)) {
        if (id === trackingId) {
          recipientEmail = email;
          break;
        }
      }

      if (!recipientEmail) continue;

      const readReceipts: ReadReceipt[] = JSON.parse(record.readReceipts as string || '[]');
      const receiptIndex = readReceipts.findIndex(r => r.recipientEmail === recipientEmail);

      if (receiptIndex >= 0) {
        readReceipts[receiptIndex].readAt = readReceipts[receiptIndex].readAt || new Date();
        readReceipts[receiptIndex].ipAddress = ipAddress;
        readReceipts[receiptIndex].userAgent = userAgent;
        readReceipts[receiptIndex].viewCount += 1;
      } else {
        readReceipts.push({
          recipientEmail,
          readAt: new Date(),
          ipAddress,
          userAgent,
          viewCount: 1,
        });
      }

      await this.prisma.distributionRecord.update({
        where: { id: record.id },
        data: { readReceipts: JSON.stringify(readReceipts) },
      });

      await this.prisma.readReceiptLog.create({
        data: {
          distributionRecordId: record.id,
          recipientEmail,
          ipAddress,
          userAgent,
          readAt: new Date(),
        },
      });
    }
  }

  async getDistributionHistory(
    reportId: string,
    options?: { limit?: number; offset?: number; status?: string },
  ): Promise<{ records: DistributionRecord[]; totalCount: number }> {
    const where: Record<string, unknown> = { reportId };
    if (options?.status) where.status = options.status;

    const [records, totalCount] = await Promise.all([
      this.prisma.distributionRecord.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      this.prisma.distributionRecord.count({ where }),
    ]);

    return {
      records: records.map(r => ({
        id: r.id,
        distributionConfigId: r.distributionConfigId,
        reportId: r.reportId,
        sentAt: r.sentAt ?? new Date(),
        recipientCount: r.recipientCount,
        status: r.status.toLowerCase() as 'sent' | 'failed' | 'partial',
        errorMessage: r.errorMessage || undefined,
        fileSize: Number(r.fileSize ?? 0),
        readReceipts: JSON.parse(r.readReceipts as string || '[]'),
      })),
      totalCount,
    };
  }

  async getDistributionAnalytics(distributionConfigId: string, days: number = 30): Promise<DistributionAnalytics> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const records = await this.prisma.distributionRecord.findMany({
      where: {
        distributionConfigId,
        sentAt: { gte: since },
      },
      orderBy: { sentAt: 'asc' },
    });

    let totalSent = 0;
    let totalOpened = 0;
    let totalTimeToOpen = 0;
    let openedCount = 0;
    const recipientOpenCounts = new Map<string, number>();
    const dailyStats = new Map<string, { sent: number; opened: number }>();

    for (const record of records) {
      totalSent += record.recipientCount;
      const readReceipts: ReadReceipt[] = JSON.parse(record.readReceipts as string || '[]');

      for (const receipt of readReceipts) {
        if (receipt.readAt) {
          totalOpened += 1;
          const timeToOpen = new Date(receipt.readAt).getTime() - (record.sentAt ?? new Date()).getTime();
          totalTimeToOpen += timeToOpen;
          openedCount += 1;
          recipientOpenCounts.set(
            receipt.recipientEmail,
            (recipientOpenCounts.get(receipt.recipientEmail) || 0) + receipt.viewCount,
          );
        }
      }

      const dateKey = (record.sentAt ?? new Date()).toISOString().split('T')[0];
      const existing = dailyStats.get(dateKey) || { sent: 0, opened: 0 };
      existing.sent += record.recipientCount;
      existing.opened += readReceipts.filter(r => r.readAt).length;
      dailyStats.set(dateKey, existing);
    }

    const topRecipients = Array.from(recipientOpenCounts.entries())
      .map(([email, openCount]) => ({ email, openCount }))
      .sort((a, b) => b.openCount - a.openCount)
      .slice(0, 10);

    const deliveryTrend = Array.from(dailyStats.entries())
      .map(([date, stats]) => ({ date, sent: stats.sent, opened: stats.opened }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      distributionId: distributionConfigId,
      totalSent,
      totalOpened,
      openRate: totalSent > 0 ? totalOpened / totalSent : 0,
      averageTimeToOpen: openedCount > 0 ? totalTimeToOpen / openedCount : 0,
      topRecipients,
      deliveryTrend,
    };
  }

  async verifyAccess(
    distributionRecordId: string,
    password?: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const record = await this.prisma.distributionRecord.findUniqueOrThrow({
      where: { id: distributionRecordId },
      include: { distributionConfig: true },
    });

    const config = record.distributionConfig;

    if (config.accessExpiry && new Date() > config.accessExpiry) {
      return { allowed: false, reason: 'Distribution access has expired' };
    }

    if (config.maxViews) {
      const readReceipts: ReadReceipt[] = JSON.parse(record.readReceipts as string || '[]');
      const totalViews = readReceipts.reduce((sum, r) => sum + r.viewCount, 0);
      if (totalViews >= config.maxViews) {
        return { allowed: false, reason: 'Maximum view count reached' };
      }
    }

    if (config.accessPassword && password) {
      const hashedInput = crypto.createHash('sha256').update(password).digest('hex');
      if (hashedInput !== config.accessPassword) {
        return { allowed: false, reason: 'Invalid password' };
      }
    } else if (config.accessPassword && !password) {
      return { allowed: false, reason: 'Password required' };
    }

    return { allowed: true };
  }

  async deleteDistributionConfig(configId: string): Promise<void> {
    await this.prisma.readReceiptLog.deleteMany({
      where: { distributionRecord: { distributionConfigId: configId } },
    });
    await this.prisma.distributionRecord.deleteMany({ where: { distributionConfigId: configId } });
    await this.prisma.distributionConfig.delete({ where: { id: configId } });
  }
}
