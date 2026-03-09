import { PrismaClient } from '@prisma/client';
import Twilio from 'twilio';
import { z } from 'zod';

const SendReportSummaryInput = z.object({
  reportId: z.string().uuid(),
  recipientPhone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Invalid E.164 phone number'),
  locale: z.enum(['ar', 'en']).default('ar'),
});

const BulkSendInput = z.object({
  reportId: z.string().uuid(),
  recipientPhones: z.array(z.string().regex(/^\+[1-9]\d{6,14}$/)).min(1).max(500),
  locale: z.enum(['ar', 'en']).default('ar'),
});

type SendReportSummaryPayload = z.infer<typeof SendReportSummaryInput>;
type BulkSendPayload = z.infer<typeof BulkSendInput>;

interface SMSResult {
  sid: string;
  status: string;
  recipientPhone: string;
  sentAt: Date;
}

interface ReportData {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sections: Array<{
    id: string;
    title: string;
    content: string;
    order: number;
  }>;
  author: {
    id: string;
    name: string;
  } | null;
}

export class SMSDeliveryService {
  private readonly prisma: PrismaClient;
  private readonly twilioClient: Twilio.Twilio;
  private readonly fromNumber: string;
  private readonly maxSMSLength = 1600;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error(
        'Missing required Twilio environment variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER'
      );
    }

    this.twilioClient = Twilio(accountSid, authToken);
    this.fromNumber = fromNumber;
  }

  async sendReportSummary(input: SendReportSummaryPayload): Promise<SMSResult> {
    const validated = SendReportSummaryInput.parse(input);

    const report = await this.prisma.report.findUnique({
      where: { id: validated.reportId },
      include: {
        sections: { orderBy: { order: 'asc' } },
      },
    });

    if (!report) {
      throw new Error(`Report not found: ${validated.reportId}`);
    }

    const messageBody = this.buildSMSSummary(report as unknown as ReportData, validated.locale);

    const message = await this.twilioClient.messages.create({
      body: messageBody,
      from: this.fromNumber,
      to: validated.recipientPhone,
    });

    const logEntry = await this.prisma.sMSLog.create({
      data: {
        reportId: validated.reportId,
        recipientPhone: validated.recipientPhone,
        messageSid: message.sid,
        status: message.status,
        messageBody: messageBody,
        sentAt: new Date(),
        segmentCount: Math.ceil(messageBody.length / 160),
      },
    });

    return {
      sid: message.sid,
      status: message.status,
      recipientPhone: validated.recipientPhone,
      sentAt: logEntry.sentAt,
    };
  }

  async sendBulkReportSummary(input: BulkSendPayload): Promise<{
    successful: SMSResult[];
    failed: Array<{ phone: string; error: string }>;
  }> {
    const validated = BulkSendInput.parse(input);

    const successful: SMSResult[] = [];
    const failed: Array<{ phone: string; error: string }> = [];

    const report = await this.prisma.report.findUnique({
      where: { id: validated.reportId },
      include: {
        sections: { orderBy: { order: 'asc' } },
      },
    });

    if (!report) {
      throw new Error(`Report not found: ${validated.reportId}`);
    }

    const messageBody = this.buildSMSSummary(report as unknown as ReportData, validated.locale);

    const sendPromises = validated.recipientPhones.map(async (phone) => {
      try {
        const message = await this.twilioClient.messages.create({
          body: messageBody,
          from: this.fromNumber,
          to: phone,
        });

        await this.prisma.sMSLog.create({
          data: {
            reportId: validated.reportId,
            recipientPhone: phone,
            messageSid: message.sid,
            status: message.status,
            messageBody: messageBody,
            sentAt: new Date(),
            segmentCount: Math.ceil(messageBody.length / 160),
          },
        });

        successful.push({
          sid: message.sid,
          status: message.status,
          recipientPhone: phone,
          sentAt: new Date(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown send error';
        failed.push({ phone, error: errorMessage });

        await this.prisma.sMSLog.create({
          data: {
            reportId: validated.reportId,
            recipientPhone: phone,
            messageSid: '',
            status: 'failed',
            messageBody: messageBody,
            sentAt: new Date(),
            errorMessage: errorMessage,
            segmentCount: 0,
          },
        });
      }
    });

    await Promise.all(sendPromises);

    return { successful, failed };
  }

  buildSMSSummary(report: ReportData, locale: 'ar' | 'en' = 'ar'): string {
    const parts: string[] = [];

    if (locale === 'ar') {
      parts.push(`[راصد] ملخص التقرير`);
      parts.push(`العنوان: ${report.title}`);
      parts.push(`الحالة: ${this.translateStatus(report.status, 'ar')}`);

      if (report.author) {
        parts.push(`المؤلف: ${report.author.name}`);
      }

      parts.push(`التاريخ: ${this.formatDate(report.updatedAt, 'ar')}`);

      if (report.summary) {
        parts.push(`---`);
        parts.push(report.summary);
      } else if (report.sections.length > 0) {
        parts.push(`---`);
        parts.push(`الأقسام (${report.sections.length}):`);
        for (const section of report.sections.slice(0, 5)) {
          const snippet = section.content.slice(0, 80).replace(/\n/g, ' ');
          parts.push(`- ${section.title}: ${snippet}${section.content.length > 80 ? '...' : ''}`);
        }
        if (report.sections.length > 5) {
          parts.push(`... و ${report.sections.length - 5} أقسام أخرى`);
        }
      }
    } else {
      parts.push(`[Rasid] Report Summary`);
      parts.push(`Title: ${report.title}`);
      parts.push(`Status: ${this.translateStatus(report.status, 'en')}`);

      if (report.author) {
        parts.push(`Author: ${report.author.name}`);
      }

      parts.push(`Date: ${this.formatDate(report.updatedAt, 'en')}`);

      if (report.summary) {
        parts.push(`---`);
        parts.push(report.summary);
      } else if (report.sections.length > 0) {
        parts.push(`---`);
        parts.push(`Sections (${report.sections.length}):`);
        for (const section of report.sections.slice(0, 5)) {
          const snippet = section.content.slice(0, 80).replace(/\n/g, ' ');
          parts.push(`- ${section.title}: ${snippet}${section.content.length > 80 ? '...' : ''}`);
        }
        if (report.sections.length > 5) {
          parts.push(`... and ${report.sections.length - 5} more sections`);
        }
      }
    }

    const fullMessage = parts.join('\n');

    if (fullMessage.length > this.maxSMSLength) {
      return fullMessage.slice(0, this.maxSMSLength - 3) + '...';
    }

    return fullMessage;
  }

  async getDeliveryStatus(messageSid: string): Promise<{ sid: string; status: string; errorCode: number | null }> {
    const message = await this.twilioClient.messages(messageSid).fetch();

    await this.prisma.sMSLog.updateMany({
      where: { messageSid },
      data: { status: message.status },
    });

    return {
      sid: message.sid,
      status: message.status,
      errorCode: message.errorCode ?? null,
    };
  }

  async getLogsByReport(reportId: string): Promise<Array<{
    id: string;
    recipientPhone: string;
    status: string;
    sentAt: Date;
    messageSid: string;
  }>> {
    const reportIdValidated = z.string().uuid().parse(reportId);

    return this.prisma.sMSLog.findMany({
      where: { reportId: reportIdValidated },
      select: {
        id: true,
        recipientPhone: true,
        status: true,
        sentAt: true,
        messageSid: true,
      },
      orderBy: { sentAt: 'desc' },
    });
  }

  private translateStatus(status: string, locale: 'ar' | 'en'): string {
    const statusMap: Record<string, Record<'ar' | 'en', string>> = {
      draft: { ar: 'مسودة', en: 'Draft' },
      in_review: { ar: 'قيد المراجعة', en: 'In Review' },
      approved: { ar: 'معتمد', en: 'Approved' },
      published: { ar: 'منشور', en: 'Published' },
      archived: { ar: 'مؤرشف', en: 'Archived' },
    };

    return statusMap[status]?.[locale] ?? status;
  }

  private formatDate(date: Date, locale: 'ar' | 'en'): string {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    const tag = locale === 'ar' ? 'ar-SA' : 'en-US';
    return new Intl.DateTimeFormat(tag, options).format(date);
  }
}
