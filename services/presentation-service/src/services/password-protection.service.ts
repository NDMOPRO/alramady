import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const ProtectionSettingsSchema = z.object({
  requirePassword: z.boolean(),
  allowPrinting: z.boolean(),
  allowCopying: z.boolean(),
  allowEditing: z.boolean(),
  expiresAt: z.date().optional(),
});

interface ProtectionSettings {
  requirePassword: boolean;
  allowPrinting: boolean;
  allowCopying: boolean;
  allowEditing: boolean;
  expiresAt?: Date;
}

interface StoredProtection {
  id: string;
  presentationId: string;
  passwordHash: string;
  salt: string;
  requirePassword: boolean;
  allowPrinting: boolean;
  allowCopying: boolean;
  allowEditing: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SCRYPT_KEY_LENGTH = 64;
const SALT_LENGTH = 32;

export class PasswordProtectionService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  private hashPassword(password: string, salt: Buffer): string {
    const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
      N: 16384,
      r: 8,
      p: 1,
    });
    return derived.toString('hex');
  }

  private verifyHash(password: string, storedHash: string, salt: string): boolean {
    const saltBuffer = Buffer.from(salt, 'hex');
    const derived = scryptSync(password, saltBuffer, SCRYPT_KEY_LENGTH, {
      N: 16384,
      r: 8,
      p: 1,
    });
    const storedBuffer = Buffer.from(storedHash, 'hex');
    return timingSafeEqual(derived, storedBuffer);
  }

  async protectPresentation(
    presentationId: string,
    password: string,
    settings: ProtectionSettings
  ): Promise<{ protected: boolean; presentationId: string }> {
    const validatedId = z.string().uuid().parse(presentationId);
    const validatedPassword = z.string().min(4).max(128).parse(password);
    const validatedSettings = ProtectionSettingsSchema.parse(settings);

    const presentation = await this.prisma.presentation.findUnique({
      where: { id: validatedId },
      select: { id: true },
    });

    if (!presentation) {
      throw new Error(`Presentation not found: ${validatedId}`);
    }

    const existingProtection = await this.prisma.presentationProtection.findUnique({
      where: { presentationId: validatedId },
    });

    const salt = randomBytes(SALT_LENGTH);
    const passwordHash = this.hashPassword(validatedPassword, salt);

    const protectionData = {
      passwordHash,
      salt: salt.toString('hex'),
      requirePassword: validatedSettings.requirePassword,
      allowPrinting: validatedSettings.allowPrinting,
      allowCopying: validatedSettings.allowCopying,
      allowEditing: validatedSettings.allowEditing,
      expiresAt: validatedSettings.expiresAt ?? null,
      updatedAt: new Date(),
    };

    if (existingProtection) {
      await this.prisma.presentationProtection.update({
        where: { presentationId: validatedId },
        data: protectionData,
      });
    } else {
      await this.prisma.presentationProtection.create({
        data: {
          presentationId: validatedId,
          ...protectionData,
          createdAt: new Date(),
        },
      });
    }

    return { protected: true, presentationId: validatedId };
  }

  async verifyPassword(presentationId: string, password: string): Promise<boolean> {
    const validatedId = z.string().uuid().parse(presentationId);
    const validatedPassword = z.string().min(1).parse(password);

    const protection = await this.prisma.presentationProtection.findUnique({
      where: { presentationId: validatedId },
    });

    if (!protection) {
      throw new Error(`No protection found for presentation: ${validatedId}`);
    }

    if (protection.expiresAt && protection.expiresAt < new Date()) {
      return false;
    }

    return this.verifyHash(
      validatedPassword,
      protection.passwordHash,
      protection.salt
    );
  }

  async removeProtection(
    presentationId: string,
    password: string
  ): Promise<{ removed: boolean }> {
    const validatedId = z.string().uuid().parse(presentationId);
    const validatedPassword = z.string().min(1).parse(password);

    const protection = await this.prisma.presentationProtection.findUnique({
      where: { presentationId: validatedId },
    });

    if (!protection) {
      throw new Error(`No protection found for presentation: ${validatedId}`);
    }

    const isValid = this.verifyHash(
      validatedPassword,
      protection.passwordHash,
      protection.salt
    );

    if (!isValid) {
      throw new Error('Invalid password. Cannot remove protection.');
    }

    await this.prisma.presentationProtection.delete({
      where: { presentationId: validatedId },
    });

    return { removed: true };
  }

  async getProtectionSettings(
    presentationId: string
  ): Promise<ProtectionSettings | null> {
    const validatedId = z.string().uuid().parse(presentationId);

    const protection = await this.prisma.presentationProtection.findUnique({
      where: { presentationId: validatedId },
      select: {
        requirePassword: true,
        allowPrinting: true,
        allowCopying: true,
        allowEditing: true,
        expiresAt: true,
      },
    });

    if (!protection) {
      return null;
    }

    return {
      requirePassword: protection.requirePassword,
      allowPrinting: protection.allowPrinting,
      allowCopying: protection.allowCopying,
      allowEditing: protection.allowEditing,
      expiresAt: protection.expiresAt ?? undefined,
    };
  }

  async checkAccess(
    presentationId: string,
    action: 'view' | 'print' | 'copy' | 'edit'
  ): Promise<boolean> {
    const validatedId = z.string().uuid().parse(presentationId);
    const validatedAction = z.enum(['view', 'print', 'copy', 'edit']).parse(action);

    const protection = await this.prisma.presentationProtection.findUnique({
      where: { presentationId: validatedId },
    });

    if (!protection) {
      return true;
    }

    if (protection.expiresAt && protection.expiresAt < new Date()) {
      return true;
    }

    switch (validatedAction) {
      case 'view':
        return !protection.requirePassword;
      case 'print':
        return protection.allowPrinting;
      case 'copy':
        return protection.allowCopying;
      case 'edit':
        return protection.allowEditing;
      default:
        return false;
    }
  }

  async updateProtectionSettings(
    presentationId: string,
    password: string,
    settings: Partial<ProtectionSettings>
  ): Promise<ProtectionSettings> {
    const validatedId = z.string().uuid().parse(presentationId);
    const validatedPassword = z.string().min(1).parse(password);
    const validatedSettings = ProtectionSettingsSchema.partial().parse(settings);

    const protection = await this.prisma.presentationProtection.findUnique({
      where: { presentationId: validatedId },
    });

    if (!protection) {
      throw new Error(`No protection found for presentation: ${validatedId}`);
    }

    const isValid = this.verifyHash(
      validatedPassword,
      protection.passwordHash,
      protection.salt
    );

    if (!isValid) {
      throw new Error('Invalid password. Cannot update protection settings.');
    }

    const updated = await this.prisma.presentationProtection.update({
      where: { presentationId: validatedId },
      data: {
        ...(validatedSettings.requirePassword !== undefined && {
          requirePassword: validatedSettings.requirePassword,
        }),
        ...(validatedSettings.allowPrinting !== undefined && {
          allowPrinting: validatedSettings.allowPrinting,
        }),
        ...(validatedSettings.allowCopying !== undefined && {
          allowCopying: validatedSettings.allowCopying,
        }),
        ...(validatedSettings.allowEditing !== undefined && {
          allowEditing: validatedSettings.allowEditing,
        }),
        ...(validatedSettings.expiresAt !== undefined && {
          expiresAt: validatedSettings.expiresAt ?? null,
        }),
        updatedAt: new Date(),
      },
      select: {
        requirePassword: true,
        allowPrinting: true,
        allowCopying: true,
        allowEditing: true,
        expiresAt: true,
      },
    });

    return {
      requirePassword: updated.requirePassword,
      allowPrinting: updated.allowPrinting,
      allowCopying: updated.allowCopying,
      allowEditing: updated.allowEditing,
      expiresAt: updated.expiresAt ?? undefined,
    };
  }
}
