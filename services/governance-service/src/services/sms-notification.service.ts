import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface SMSConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

interface SMSResult {
  sid: string;
  status: string;
  to: string;
  sentAt: Date;
}

interface OTPRecord {
  otpId: string;
  hashedCode: string;
  to: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class SMSNotificationService {
  private config: SMSConfig;

  constructor(private prisma: PrismaClient) {
    this.config = {
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
      fromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
    };
  }

  async sendSMS(to: string, message: string): Promise<SMSResult> {
    if (!to || !to.trim()) {
      throw new Error('Recipient phone number is required');
    }
    if (!message || !message.trim()) {
      throw new Error('Message body is required');
    }
    if (!this.config.accountSid || !this.config.authToken || !this.config.fromNumber) {
      throw new Error('Twilio configuration is incomplete. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER environment variables.');
    }

    const normalizedTo = this.normalizePhoneNumber(to);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
    const credentials = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64');

    const body = new URLSearchParams({
      To: normalizedTo,
      From: this.config.fromNumber,
      Body: message.trim(),
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText })) as Record<string, unknown>;
      const errorMessage = (errorData.message as string) || response.statusText;
      logger.error('Failed to send SMS via Twilio', {
        to: normalizedTo,
        statusCode: response.status,
        error: errorMessage,
      });
      throw new Error(`Twilio SMS failed (${response.status}): ${errorMessage}`);
    }

    const responseData = await response.json() as Record<string, unknown>;
    const sentAt = new Date();
    const sid = responseData.sid as string;
    const status = responseData.status as string;

    const smsLogId = crypto.randomUUID();

    await this.prisma.auditLog.create({
      data: {
        tenantId: 'system',
        userId: 'system',
        action: 'sms.sent',
        entityType: 'sms_notification',
        entityId: smsLogId,
        detailsJson: {
          smsLogId,
          sid,
          to: normalizedTo,
          status,
          messageLength: message.trim().length,
          sentAt: sentAt.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    logger.info('SMS sent successfully', {
      sid,
      to: normalizedTo,
      status,
      messageLength: message.trim().length,
    });

    return {
      sid,
      status,
      to: normalizedTo,
      sentAt,
    };
  }

  async sendBulkSMS(recipients: string[], message: string): Promise<SMSResult[]> {
    if (!recipients || recipients.length === 0) {
      throw new Error('At least one recipient is required');
    }
    if (!message || !message.trim()) {
      throw new Error('Message body is required');
    }

    const results: SMSResult[] = [];
    const batchSize = 10;
    const delayBetweenBatchesMs = 1000;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const batchPromises = batch.map(async (recipient) => {
        try {
          const result = await this.sendSMS(recipient, message);
          return result;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn('Failed to send SMS to recipient in bulk batch', {
            to: recipient,
            error: errorMessage,
          });
          return {
            sid: '',
            status: 'failed',
            to: recipient,
            sentAt: new Date(),
          } as SMSResult;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (i + batchSize < recipients.length) {
        await this.delay(delayBetweenBatchesMs);
      }
    }

    logger.info('Bulk SMS completed', {
      totalRecipients: recipients.length,
      successful: results.filter((r) => r.status !== 'failed').length,
      failed: results.filter((r) => r.status === 'failed').length,
    });

    return results;
  }

  async sendOTP(to: string): Promise<{ otpId: string; expiresAt: Date }> {
    if (!to || !to.trim()) {
      throw new Error('Recipient phone number is required');
    }

    const normalizedTo = this.normalizePhoneNumber(to);
    const otpCode = this.generateSecureOTP();
    const otpId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const hashedCode = this.hashOTP(otpCode, otpId);

    await this.prisma.auditLog.create({
      data: {
        tenantId: 'system',
        userId: 'system',
        action: 'otp.created',
        entityType: 'otp',
        entityId: otpId,
        detailsJson: {
          otpId,
          to: normalizedTo,
          hashedCode,
          expiresAt: expiresAt.toISOString(),
          used: false,
          createdAt: new Date().toISOString(),
        } satisfies Record<string, unknown>,
      },
    });

    const message = `Your RASID verification code is: ${otpCode}. It expires in 5 minutes. Do not share this code.`;
    await this.sendSMS(normalizedTo, message);

    logger.info('OTP sent', { otpId, to: normalizedTo, expiresAt: expiresAt.toISOString() });

    return { otpId, expiresAt };
  }

  async verifyOTP(otpId: string, code: string): Promise<boolean> {
    if (!otpId || !code) {
      throw new Error('OTP ID and code are required');
    }

    const otpLogs = await this.prisma.auditLog.findMany({
      where: {
        entityId: otpId,
        entityType: 'otp',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (otpLogs.length === 0) {
      logger.warn('OTP verification failed: not found', { otpId });
      return false;
    }

    const otpData = otpLogs[0].detailsJson as Record<string, unknown>;
    const record: OTPRecord = {
      otpId: otpData.otpId as string,
      hashedCode: otpData.hashedCode as string,
      to: otpData.to as string,
      expiresAt: new Date(otpData.expiresAt as string),
      used: otpData.used as boolean,
      createdAt: new Date(otpData.createdAt as string),
    };

    if (record.used) {
      logger.warn('OTP verification failed: already used', { otpId });
      return false;
    }

    if (new Date() > record.expiresAt) {
      logger.warn('OTP verification failed: expired', { otpId });
      return false;
    }

    const providedHash = this.hashOTP(code, otpId);
    const isValid = this.timingSafeEqual(providedHash, record.hashedCode);

    await this.prisma.auditLog.create({
      data: {
        tenantId: 'system',
        userId: 'system',
        action: isValid ? 'otp.verified' : 'otp.failed',
        entityType: 'otp',
        entityId: otpId,
        detailsJson: {
          ...otpData,
          used: isValid ? true : otpData.used,
          verified: isValid,
          verifiedAt: isValid ? new Date().toISOString() : null,
        } as Prisma.InputJsonValue,
      },
    });

    if (isValid) {
      logger.info('OTP verified successfully', { otpId });
    } else {
      logger.warn('OTP verification failed: invalid code', { otpId });
    }

    return isValid;
  }

  private normalizePhoneNumber(phone: string): string {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    if (cleaned.startsWith('05') && cleaned.length === 10) {
      return `+966${cleaned.slice(1)}`;
    }
    if (cleaned.startsWith('966')) {
      return `+${cleaned}`;
    }
    return `+${cleaned}`;
  }

  private generateSecureOTP(): string {
    const buffer = crypto.randomBytes(4);
    const num = buffer.readUInt32BE(0) % 1000000;
    return num.toString().padStart(6, '0');
  }

  private hashOTP(code: string, salt: string): string {
    return crypto.createHash('sha256').update(`${code}:${salt}`).digest('hex');
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    return crypto.timingSafeEqual(bufA, bufB);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
