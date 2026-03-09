import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { z } from 'zod';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const EncryptCellInputSchema = z.object({
  plaintext: z.string(),
  encryptionKey: z.string().min(1),
});

const DecryptCellInputSchema = z.object({
  ciphertext: z.string(),
  encryptionKey: z.string().min(1),
});

const MarkFieldAsSensitiveInputSchema = z.object({
  documentId: z.string().uuid(),
  fieldPath: z.string().min(1),
  sensitivityLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  markedBy: z.string().uuid(),
});

const EncryptSensitiveFieldsInputSchema = z.object({
  documentId: z.string().uuid(),
  data: z.record(z.string(), z.unknown()),
  encryptionKey: z.string().min(1),
});

interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  tag: string;
}

interface EncryptSensitiveFieldsResult {
  processedData: Record<string, unknown>;
  encryptedFieldCount: number;
  encryptedFields: string[];
}

export class CellEncryptionService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private deriveKey(encryptionKey: string): Buffer {
    return crypto.scryptSync(encryptionKey, 'rasid-cell-encryption-salt', KEY_LENGTH);
  }

  async encryptCell(input: z.infer<typeof EncryptCellInputSchema>): Promise<string> {
    const validated = EncryptCellInputSchema.parse(input);
    const key = this.deriveKey(validated.encryptionKey);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

    const encrypted = Buffer.concat([
      cipher.update(validated.plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    const payload: EncryptedPayload = {
      iv: iv.toString('base64'),
      ciphertext: encrypted.toString('base64'),
      tag: tag.toString('base64'),
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  async decryptCell(input: z.infer<typeof DecryptCellInputSchema>): Promise<string> {
    const validated = DecryptCellInputSchema.parse(input);
    const key = this.deriveKey(validated.encryptionKey);

    let payload: EncryptedPayload;
    try {
      const decoded = Buffer.from(validated.ciphertext, 'base64').toString('utf8');
      payload = JSON.parse(decoded) as EncryptedPayload;
    } catch {
      throw new Error('Invalid ciphertext format: unable to decode encrypted payload');
    }

    const iv = Buffer.from(payload.iv, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  async markFieldAsSensitive(
    input: z.infer<typeof MarkFieldAsSensitiveInputSchema>
  ): Promise<{ id: string; documentId: string; fieldPath: string; sensitivityLevel: string }> {
    const validated = MarkFieldAsSensitiveInputSchema.parse(input);

    const existing = await this.prisma.sensitiveField.findFirst({
      where: {
        documentId: validated.documentId,
        fieldPath: validated.fieldPath,
      },
    });

    if (existing) {
      const updated = await this.prisma.sensitiveField.update({
        where: { id: existing.id },
        data: {
          sensitivityLevel: validated.sensitivityLevel,
          markedBy: validated.markedBy,
          updatedAt: new Date(),
        },
      });
      return {
        id: updated.id,
        documentId: updated.documentId,
        fieldPath: updated.fieldPath,
        sensitivityLevel: updated.sensitivityLevel,
      };
    }

    const record = await this.prisma.sensitiveField.create({
      data: {
        documentId: validated.documentId,
        fieldPath: validated.fieldPath,
        sensitivityLevel: validated.sensitivityLevel,
        markedBy: validated.markedBy,
      },
    });

    return {
      id: record.id,
      documentId: record.documentId,
      fieldPath: record.fieldPath,
      sensitivityLevel: record.sensitivityLevel,
    };
  }

  async encryptSensitiveFields(
    input: z.infer<typeof EncryptSensitiveFieldsInputSchema>
  ): Promise<EncryptSensitiveFieldsResult> {
    const validated = EncryptSensitiveFieldsInputSchema.parse(input);

    const sensitiveFields = await this.prisma.sensitiveField.findMany({
      where: { documentId: validated.documentId },
      select: { fieldPath: true },
    });

    const sensitiveFieldPaths = new Set(sensitiveFields.map((f) => f.fieldPath));
    const processedData: Record<string, unknown> = {};
    const encryptedFields: string[] = [];

    for (const [key, value] of Object.entries(validated.data)) {
      if (sensitiveFieldPaths.has(key) && typeof value === 'string') {
        processedData[key] = await this.encryptCell({
          plaintext: value,
          encryptionKey: validated.encryptionKey,
        });
        encryptedFields.push(key);
      } else if (sensitiveFieldPaths.has(key) && value !== null && value !== undefined) {
        processedData[key] = await this.encryptCell({
          plaintext: JSON.stringify(value),
          encryptionKey: validated.encryptionKey,
        });
        encryptedFields.push(key);
      } else {
        processedData[key] = value;
      }
    }

    await this.prisma.encryptionLog.create({
      data: {
        documentId: validated.documentId,
        encryptedFieldCount: encryptedFields.length,
        encryptedFields: JSON.stringify(encryptedFields),
        performedAt: new Date(),
      },
    });

    return {
      processedData,
      encryptedFieldCount: encryptedFields.length,
      encryptedFields,
    };
  }
}
