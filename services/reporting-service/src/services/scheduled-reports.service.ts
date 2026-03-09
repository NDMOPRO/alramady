import { PrismaClient } from '@prisma/client';
import cron, { ScheduledTask } from 'node-cron';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { NotFoundError, BadRequestError } from '../middleware/errorHandler';
import { reportBuilderService } from './report-builder.service';
import { templateEngineService } from './template-engine.service';
import { cacheDel } from '../utils/redis';
import { ensureRuntimeReportRecord } from './report-runtime-record.service';

const prisma = new PrismaClient();

interface ScheduleHistoryRecord {
  id: string;
  scheduleId: string;
  status: string;
  duration: number;
  error?: string;
  recipientCount?: number;
  fileSize?: number;
  executedAt: Date;
  metadata?: Record<string, unknown>;
}

interface ReportRecord {
  id: string;
  name: string;
  [key: string]: unknown;
}

const CACHE_PREFIX = 'reporting:schedules';

const activeJobs: Map<string, ScheduledTask> = new Map();

function createMailTransport(): nodemailer.Transporter {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });

  return transport;
}

export class ScheduledReportsService {
  /**
   * Create scheduled report in DB. Register cron job with node-cron.
   * On trigger: build report, export to format, send via email.
   */
  async scheduleReport(
    reportId: string,
    cronExpression: string,
    recipients: string[],
    format: 'pdf' | 'docx' | 'html',
    tenantId: string,
    userId: string
  ): Promise<Record<string, unknown>> {
    logger.info('Scheduling report', { reportId, cronExpression, recipients, format });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    await ensureRuntimeReportRecord({
      reportId,
      tenantId,
      userId,
      name: (report as unknown as ReportRecord).name || 'Report',
      description: ((report as unknown as Record<string, unknown>).description as string | null | undefined) ?? null,
      dataSources: ((report as unknown as Record<string, unknown>).dataSources as unknown) ?? ((report as unknown as Record<string, unknown>).config as Record<string, unknown> | undefined)?.dataSources,
      format,
    });

    if (!cron.validate(cronExpression)) {
      throw new BadRequestError(`Invalid cron expression: '${cronExpression}'. Must be a valid cron pattern.`);
    }

    if (!recipients || recipients.length === 0) {
      throw new BadRequestError('At least one recipient email address is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipients.filter((email) => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      throw new BadRequestError(`Invalid email addresses: ${invalidEmails.join(', ')}`);
    }

    const validFormats = ['pdf', 'docx', 'html'];
    if (!validFormats.includes(format)) {
      throw new BadRequestError(`Invalid format '${format}'. Allowed: ${validFormats.join(', ')}`);
    }

    const scheduleId = uuidv4();
    const now = new Date();

    const schedule = await prisma.reportSchedule.create({
      data: {
        id: scheduleId,
        reportId,
        cronExpression,
        recipients: JSON.parse(JSON.stringify(recipients)),
        format: format.toUpperCase() as 'PDF' | 'HTML' | 'DOCX',
        status: 'active',
        tenantId,
        createdBy: userId,
        nextRunAt: this.calculateNextRun(cronExpression),
        lastRunAt: null,
        runCount: 0,
        failureCount: 0,
        metadata: JSON.parse(JSON.stringify({
          createdAt: now.toISOString(),
          reportName: (report as unknown as ReportRecord).name,
        })),
        createdAt: now,
        updatedAt: now,
      },
    });

    const task = cron.schedule(cronExpression, async () => {
      logger.info('Cron triggered for scheduled report', { scheduleId, reportId });
      try {
        await this.executeScheduledRun(scheduleId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Scheduled report execution failed', {
          scheduleId,
          reportId,
          error: message,
        });
      }
    }, {
      scheduled: true,
      timezone: process.env.SCHEDULE_TIMEZONE || 'UTC',
    });

    activeJobs.set(scheduleId, task);

    await cacheDel(`${CACHE_PREFIX}:${reportId}*`);

    logger.info('Report scheduled successfully', { scheduleId, reportId, cronExpression });

    return {
      id: schedule.id,
      reportId: schedule.reportId,
      cronExpression: schedule.cronExpression,
      recipients,
      format: schedule.format,
      status: schedule.status,
      nextRunAt: schedule.nextRunAt,
      createdBy: schedule.createdBy,
      createdAt: schedule.createdAt,
    };
  }

  /**
   * Build report, export to format, create nodemailer transport, send email with attachment.
   */
  async sendReport(
    reportId: string,
    recipients: string[],
    format: string
  ): Promise<Record<string, unknown>> {
    const normalizedFormat = String(format || 'pdf').toLowerCase();
    logger.info('Sending report', { reportId, recipients, format: normalizedFormat });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const buildResult = await reportBuilderService.buildReport(reportId);
    logger.info('Report built for sending', { reportId, buildId: buildResult.buildId });

    let fileBuffer: Buffer;
    let fileName: string;
    let contentType: string;

    const reportName = ((report as unknown as ReportRecord).name || 'report').replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

    switch (normalizedFormat) {
      case 'pdf': {
        fileBuffer = await templateEngineService.exportToPDF(reportId);
        fileName = `${reportName}_${timestamp}.pdf`;
        contentType = 'application/pdf';
        break;
      }
      case 'docx': {
        fileBuffer = await templateEngineService.exportToWord(reportId);
        fileName = `${reportName}_${timestamp}.docx`;
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      }
      case 'html': {
        const htmlContent = await templateEngineService.exportToHTML(reportId);
        fileBuffer = Buffer.from(htmlContent, 'utf8');
        fileName = `${reportName}_${timestamp}.html`;
        contentType = 'text/html';
        break;
      }
      default: {
        throw new BadRequestError(`Unsupported export format: ${normalizedFormat}`);
      }
    }

    const transport = createMailTransport();
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'reports@rasid.app';
    const subjectLine = `Report: ${(report as unknown as ReportRecord).name || 'Report'} - ${new Date().toLocaleDateString()}`;

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px;">
          RASID Report Delivery
        </h2>
        <p style="color:#555;line-height:1.6;">
          Your scheduled report <strong>"${(report as unknown as ReportRecord).name || 'Report'}"</strong> has been generated
          and is attached to this email in <strong>${normalizedFormat.toUpperCase()}</strong> format.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:15px 0;">
          <tr style="background:#f8f9fa;">
            <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;">Report</td>
            <td style="padding:8px;border:1px solid #dee2e6;">${(report as unknown as ReportRecord).name}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;">Format</td>
            <td style="padding:8px;border:1px solid #dee2e6;">${normalizedFormat.toUpperCase()}</td>
          </tr>
          <tr style="background:#f8f9fa;">
            <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;">Generated</td>
            <td style="padding:8px;border:1px solid #dee2e6;">${new Date().toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;">File Size</td>
            <td style="padding:8px;border:1px solid #dee2e6;">${(fileBuffer.length / 1024).toFixed(1)} KB</td>
          </tr>
        </table>
        <p style="color:#888;font-size:12px;margin-top:20px;border-top:1px solid #eee;padding-top:10px;">
          This is an automated report from RASID Reporting Service.
        </p>
      </div>
    `;

    const mailResult = await transport.sendMail({
      from: fromAddress,
      to: recipients.join(', '),
      subject: subjectLine,
      html: htmlBody,
      attachments: [
        {
          filename: fileName,
          content: fileBuffer,
          contentType,
        },
      ],
    });

    await transport.close();

    logger.info('Report email sent successfully', {
      reportId,
      messageId: mailResult.messageId,
      recipientCount: recipients.length,
    });

    return {
      reportId,
      messageId: mailResult.messageId,
      recipients,
      format: normalizedFormat,
      fileName,
      fileSize: fileBuffer.length,
      sentAt: new Date().toISOString(),
      accepted: mailResult.accepted,
      rejected: mailResult.rejected,
    };
  }

  /**
   * List all schedules for a given report.
   */
  async listSchedules(reportId: string): Promise<Record<string, unknown>> {
    logger.info('Listing schedules for report', { reportId });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const schedules = await prisma.reportSchedule.findMany({
      where: { reportId },
      orderBy: { createdAt: 'desc' },
    });

    const enrichedSchedules = schedules.map((schedule) => ({
      id: schedule.id,
      reportId: schedule.reportId,
      cronExpression: schedule.cronExpression,
      recipients: schedule.recipients,
      format: schedule.format,
      status: schedule.status,
      nextRunAt: schedule.nextRunAt,
      lastRunAt: schedule.lastRunAt,
      runCount: schedule.runCount,
      failureCount: schedule.failureCount,
      isJobActive: activeJobs.has(schedule.id),
      createdBy: schedule.createdBy,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    }));

    logger.info('Schedules listed', { reportId, count: enrichedSchedules.length });

    return {
      reportId,
      schedules: enrichedSchedules,
      totalSchedules: enrichedSchedules.length,
      activeCount: enrichedSchedules.filter((s) => s.status === 'active').length,
      pausedCount: enrichedSchedules.filter((s) => s.status === 'paused').length,
    };
  }

  /**
   * Pause a cron job. Update status in DB.
   */
  async pauseSchedule(scheduleId: string): Promise<Record<string, unknown>> {
    logger.info('Pausing schedule', { scheduleId });

    const schedule = await prisma.reportSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundError('Schedule', scheduleId);
    }

    if (schedule.status === 'paused') {
      throw new BadRequestError('Schedule is already paused');
    }

    const job = activeJobs.get(scheduleId);
    if (job) {
      job.stop();
      logger.info('Cron job stopped', { scheduleId });
    } else {
      logger.warn('No active cron job found for schedule', { scheduleId });
    }

    const updated = await prisma.reportSchedule.update({
      where: { id: scheduleId },
      data: {
        status: 'paused',
        updatedAt: new Date(),
        metadata: JSON.parse(JSON.stringify({
          ...((schedule.metadata as Record<string, unknown>) || {}),
          pausedAt: new Date().toISOString(),
        })),
      },
    });

    await cacheDel(`${CACHE_PREFIX}:${schedule.reportId}*`);

    logger.info('Schedule paused successfully', { scheduleId });

    return {
      id: updated.id,
      reportId: updated.reportId,
      status: updated.status,
      pausedAt: new Date().toISOString(),
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Resume a paused cron job.
   */
  async resumeSchedule(scheduleId: string): Promise<Record<string, unknown>> {
    logger.info('Resuming schedule', { scheduleId });

    const schedule = await prisma.reportSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundError('Schedule', scheduleId);
    }

    if (schedule.status === 'active') {
      throw new BadRequestError('Schedule is already active');
    }

    let job = activeJobs.get(scheduleId);
    if (job) {
      job.start();
      logger.info('Existing cron job restarted', { scheduleId });
    } else {
      job = cron.schedule(schedule.cronExpression, async () => {
        logger.info('Cron triggered for resumed schedule', { scheduleId });
        try {
          await this.executeScheduledRun(scheduleId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error('Resumed schedule execution failed', {
            scheduleId,
            error: message,
          });
        }
      }, {
        scheduled: true,
        timezone: process.env.SCHEDULE_TIMEZONE || 'UTC',
      });
      activeJobs.set(scheduleId, job);
      logger.info('New cron job created for resumed schedule', { scheduleId });
    }

    const updated = await prisma.reportSchedule.update({
      where: { id: scheduleId },
      data: {
        status: 'active',
        nextRunAt: this.calculateNextRun(schedule.cronExpression),
        updatedAt: new Date(),
        metadata: JSON.parse(JSON.stringify({
          ...((schedule.metadata as Record<string, unknown>) || {}),
          resumedAt: new Date().toISOString(),
        })),
      },
    });

    await cacheDel(`${CACHE_PREFIX}:${schedule.reportId}*`);

    logger.info('Schedule resumed successfully', { scheduleId });

    return {
      id: updated.id,
      reportId: updated.reportId,
      status: updated.status,
      nextRunAt: updated.nextRunAt,
      resumedAt: new Date().toISOString(),
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Get execution history for a schedule.
   */
  async getScheduleHistory(scheduleId: string): Promise<Record<string, unknown>> {
    logger.info('Fetching schedule history', { scheduleId });

    const schedule = await prisma.reportSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundError('Schedule', scheduleId);
    }

    const history = await prisma.scheduleHistory.findMany({
      where: { scheduleId },
      orderBy: { executedAt: 'desc' },
      take: 100,
    });

    const stats = {
      totalRuns: history.length,
      successCount: history.filter((h) => (h as unknown as ScheduleHistoryRecord).status === 'success').length,
      failureCount: history.filter((h) => (h as unknown as ScheduleHistoryRecord).status === 'failed').length,
      averageDuration: history.length > 0
        ? Math.round(history.reduce((sum, h) => sum + ((h as unknown as ScheduleHistoryRecord).duration || 0), 0) / history.length)
        : 0,
      lastRun: history.length > 0 ? history[0] : null,
    };

    logger.info('Schedule history fetched', { scheduleId, totalRuns: stats.totalRuns });

    return {
      scheduleId,
      reportId: schedule.reportId,
      currentStatus: schedule.status,
      history: history.map((h) => ({
        id: (h as unknown as ScheduleHistoryRecord).id,
        status: (h as unknown as ScheduleHistoryRecord).status,
        duration: (h as unknown as ScheduleHistoryRecord).duration,
        error: (h as unknown as ScheduleHistoryRecord).error,
        recipientCount: (h as unknown as ScheduleHistoryRecord).recipientCount,
        fileSize: (h as unknown as ScheduleHistoryRecord).fileSize,
        executedAt: (h as unknown as ScheduleHistoryRecord).executedAt,
      })),
      stats,
    };
  }

  /**
   * Internal: execute a scheduled run (build, export, send, log history).
   */
  private async executeScheduledRun(scheduleId: string): Promise<void> {
    const startTime = Date.now();
    const historyId = uuidv4();

    const schedule = await prisma.reportSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule || schedule.status !== 'active') {
      logger.warn('Schedule not found or not active, skipping', { scheduleId });
      return;
    }

    try {
      const recipients = schedule.recipients as unknown as string[];
      const format = schedule.format;

      const sendResult = await this.sendReport(schedule.reportId, recipients, format ?? 'PDF');
      const duration = Date.now() - startTime;

      await prisma.scheduleHistory.create({
        data: {
          id: historyId,
          scheduleId,
          status: 'success',
          duration,
          recipientCount: recipients.length,
          fileSize: sendResult.fileSize,
          metadata: JSON.parse(JSON.stringify({
            messageId: sendResult.messageId,
            fileName: sendResult.fileName,
          })),
          executedAt: new Date(),
        },
      });

      await prisma.reportSchedule.update({
        where: { id: scheduleId },
        data: {
          lastRunAt: new Date(),
          nextRunAt: this.calculateNextRun(schedule.cronExpression),
          runCount: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      logger.info('Scheduled run completed successfully', { scheduleId, duration });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;

      await prisma.scheduleHistory.create({
        data: {
          id: historyId,
          scheduleId,
          status: 'failed',
          duration,
          error: message || 'Unknown error',
          executedAt: new Date(),
        },
      });

      await prisma.reportSchedule.update({
        where: { id: scheduleId },
        data: {
          lastRunAt: new Date(),
          nextRunAt: this.calculateNextRun(schedule.cronExpression),
          failureCount: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      logger.error('Scheduled run failed', { scheduleId, error: message, duration });
    }
  }

  /**
   * Calculate the next run time from a cron expression.
   */
  private calculateNextRun(cronExpression: string): Date {
    const parts = cronExpression.split(/\s+/);
    const now = new Date();

    if (parts.length < 5) {
      return new Date(now.getTime() + 60 * 60 * 1000);
    }

    const minute = parts[0];
    const hour = parts[1];
    const nextRun = new Date(now);

    if (minute !== '*') {
      const minVal = parseInt(minute, 10);
      if (!isNaN(minVal)) {
        nextRun.setMinutes(minVal);
      }
    }

    if (hour !== '*') {
      const hourVal = parseInt(hour, 10);
      if (!isNaN(hourVal)) {
        nextRun.setHours(hourVal);
      }
    }

    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);

    if (nextRun.getTime() <= now.getTime()) {
      if (hour === '*') {
        nextRun.setHours(nextRun.getHours() + 1);
      } else {
        nextRun.setDate(nextRun.getDate() + 1);
      }
    }

    return nextRun;
  }
}

export const scheduledReportsService = new ScheduledReportsService();
