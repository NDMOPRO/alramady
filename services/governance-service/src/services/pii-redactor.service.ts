import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { z } from 'zod';

const PIIPatterns: Record<string, RegExp> = {
  SAUDI_PHONE: /(?:\+966|00966|0)(?:5\d{8}|1[0-9]\d{7})/g,
  SAUDI_NATIONAL_ID: /\b[12]\d{9}\b/g,
  SAUDI_IBAN: /\bSA\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/gi,
  EMAIL: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  CREDIT_CARD: /\b(?:4\d{3}|5[1-5]\d{2}|6(?:011|5\d{2})|3[47]\d{2}|3(?:0[0-5]|[68]\d)\d)[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{1,4}\b/g,
};

type PIIType = keyof typeof PIIPatterns;

const RedactionMode = z.enum(['mask', 'remove', 'tokenize']);
type RedactionModeType = z.infer<typeof RedactionMode>;

interface PIIDetection {
  type: PIIType;
  value: string;
  startIndex: number;
  endIndex: number;
}

const DetectPIIInputSchema = z.object({
  text: z.string(),
  piiTypes: z.array(z.string()).optional(),
});

const RedactPIIInputSchema = z.object({
  text: z.string(),
  mode: RedactionMode,
  piiTypes: z.array(z.string()).optional(),
  tokenSecret: z.string().optional(),
});

const ScanAndRedactDatasetInputSchema = z.object({
  datasetId: z.string().uuid(),
  records: z.array(z.record(z.string(), z.unknown())),
  mode: RedactionMode,
  piiTypes: z.array(z.string()).optional(),
  tokenSecret: z.string().optional(),
  scannedBy: z.string().uuid(),
});

interface RedactPIIResult {
  redactedText: string;
  detections: PIIDetection[];
  tokenMap: Record<string, string> | null;
}

interface ScanAndRedactDatasetResult {
  redactedRecords: Array<Record<string, unknown>>;
  totalDetections: number;
  detectionsByType: Record<string, number>;
  scanId: string;
}

export class PIIRedactorService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async detectPII(input: z.infer<typeof DetectPIIInputSchema>): Promise<PIIDetection[]> {
    const validated = DetectPIIInputSchema.parse(input);
    const detections: PIIDetection[] = [];

    const typesToScan: string[] = validated.piiTypes && validated.piiTypes.length > 0
      ? validated.piiTypes.filter((t) => t in PIIPatterns)
      : Object.keys(PIIPatterns);

    for (const piiType of typesToScan) {
      const pattern = new RegExp(PIIPatterns[piiType].source, PIIPatterns[piiType].flags);
      let match: RegExpExecArray | null = pattern.exec(validated.text);

      while (match !== null) {
        detections.push({
          type: piiType as PIIType,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
        match = pattern.exec(validated.text);
      }
    }

    detections.sort((a, b) => a.startIndex - b.startIndex);
    return detections;
  }

  async redactPII(input: z.infer<typeof RedactPIIInputSchema>): Promise<RedactPIIResult> {
    const validated = RedactPIIInputSchema.parse(input);

    const detections = await this.detectPII({
      text: validated.text,
      piiTypes: validated.piiTypes,
    });

    if (detections.length === 0) {
      return { redactedText: validated.text, detections: [], tokenMap: null };
    }

    const tokenMap: Record<string, string> = {};
    let redactedText = validated.text;
    const sortedDetections = [...detections].sort((a, b) => b.startIndex - a.startIndex);

    for (const detection of sortedDetections) {
      let replacement: string;

      switch (validated.mode) {
        case 'mask': {
          const visibleChars = Math.min(2, Math.floor(detection.value.length / 4));
          const masked =
            detection.value.substring(0, visibleChars) +
            '*'.repeat(detection.value.length - visibleChars * 2) +
            detection.value.substring(detection.value.length - visibleChars);
          replacement = `[${detection.type}:${masked}]`;
          break;
        }
        case 'remove': {
          replacement = `[${detection.type}:REDACTED]`;
          break;
        }
        case 'tokenize': {
          const secret = validated.tokenSecret || 'rasid-default-token-secret';
          const token = crypto
            .createHmac('sha256', secret)
            .update(detection.value)
            .digest('hex')
            .substring(0, 16);
          const tokenRef = `TOK_${token}`;
          tokenMap[tokenRef] = detection.value;
          replacement = `[${detection.type}:${tokenRef}]`;
          break;
        }
      }

      redactedText =
        redactedText.substring(0, detection.startIndex) +
        replacement +
        redactedText.substring(detection.endIndex);
    }

    return {
      redactedText,
      detections,
      tokenMap: validated.mode === 'tokenize' ? tokenMap : null,
    };
  }

  async scanAndRedactDataset(
    input: z.infer<typeof ScanAndRedactDatasetInputSchema>
  ): Promise<ScanAndRedactDatasetResult> {
    const validated = ScanAndRedactDatasetInputSchema.parse(input);

    const redactedRecords: Array<Record<string, unknown>> = [];
    let totalDetections = 0;
    const detectionsByType: Record<string, number> = {};

    for (const record of validated.records) {
      const redactedRecord: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string') {
          const result = await this.redactPII({
            text: value,
            mode: validated.mode,
            piiTypes: validated.piiTypes,
            tokenSecret: validated.tokenSecret,
          });

          redactedRecord[key] = result.redactedText;
          totalDetections += result.detections.length;

          for (const detection of result.detections) {
            detectionsByType[detection.type] = (detectionsByType[detection.type] || 0) + 1;
          }
        } else {
          redactedRecord[key] = value;
        }
      }

      redactedRecords.push(redactedRecord);
    }

    const scanRecord = await this.prisma.piiScanLog.create({
      data: {
        datasetId: validated.datasetId,
        mode: validated.mode,
        totalRecordsScanned: validated.records.length,
        totalDetections,
        detectionsByType: JSON.stringify(detectionsByType),
        scannedBy: validated.scannedBy,
        performedAt: new Date(),
      },
    });

    return {
      redactedRecords,
      totalDetections,
      detectionsByType,
      scanId: scanRecord.id,
    };
  }
}
