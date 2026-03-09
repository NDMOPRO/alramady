import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { z } from 'zod';

const prisma = new PrismaClient();
const VISION_MODEL = 'claude-sonnet-4-5-20250514';

const ExtractionRequestSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  outputFormat: z.enum(['json', 'csv', 'xlsx-json', 'table']).default('json'),
  language: z.enum(['ar', 'en', 'auto']).default('auto'),
  extractionType: z.enum(['auto', 'table', 'form', 'receipt', 'invoice', 'card', 'document']).default('auto'),
  customSchema: z.record(z.string(), z.string()).optional(),
});

type ExtractionRequest = z.infer<typeof ExtractionRequestSchema>;

interface StructuredTable {
  headers: string[];
  rows: string[][];
  confidence: number;
}

interface StructuredForm {
  fields: Array<{ label: string; value: string; confidence: number; type: string }>;
}

interface StructuredReceipt {
  vendor: string;
  date: string;
  total: string;
  currency: string;
  taxAmount: string;
  items: Array<{ name: string; quantity: string; unitPrice: string; total: string }>;
  paymentMethod: string;
}

interface StructuredInvoice {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  vendor: { name: string; address: string; taxId: string };
  customer: { name: string; address: string; taxId: string };
  items: Array<{ description: string; quantity: string; unitPrice: string; total: string }>;
  subtotal: string;
  taxAmount: string;
  total: string;
  currency: string;
  notes: string;
}

interface StructuredCard {
  name: string;
  title: string;
  organization: string;
  email: string;
  phone: string;
  mobile: string;
  fax: string;
  website: string;
  address: string;
}

interface ExtractionResult {
  extractionType: string;
  data: StructuredTable[] | StructuredForm | StructuredReceipt | StructuredInvoice | StructuredCard | Record<string, unknown>;
  rawText: string;
  confidence: number;
  language: string;
  processingTimeMs: number;
  jobId: string;
}

export class ImageToStructuredDataService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic();
  }

  async extract(
    imageBuffer: Buffer,
    filename: string,
    request: Partial<ExtractionRequest> & { tenantId: string; userId: string }
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    const validated = ExtractionRequestSchema.parse(request);

    logger.info('Starting image to structured data extraction', {
      filename,
      tenantId: validated.tenantId,
      extractionType: validated.extractionType,
      outputFormat: validated.outputFormat,
    });

    const processedImage = await this.preprocessImage(imageBuffer);

    const base64Image = processedImage.toString('base64');
    const ext = filename.split('.').pop()?.toLowerCase() ?? 'png';
    const mediaTypeMap: Record<string, 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const mediaType = mediaTypeMap[ext] ?? 'image/png';

    let extractionType = validated.extractionType;

    if (extractionType === 'auto') {
      extractionType = await this.detectExtractionType(base64Image, mediaType);
      logger.info('Auto-detected extraction type', { extractionType });
    }

    const prompt = this.buildExtractionPrompt(extractionType, validated.language, validated.customSchema);

    const response = await this.anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from vision model');
    }

    let rawJson = textBlock.text.trim();
    if (rawJson.startsWith('```')) {
      rawJson = rawJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let parsedData: Record<string, unknown>;
    try {
      parsedData = JSON.parse(rawJson);
    } catch (parseError) {
      logger.warn('Failed to parse structured response, wrapping raw text', { parseError });
      parsedData = {
        rawText: rawJson,
        extractionType: 'text',
        confidence: 0.5,
      };
    }

    const confidence = typeof parsedData.confidence === 'number'
      ? parsedData.confidence
      : 0.85;

    const detectedLanguage = typeof parsedData.language === 'string'
      ? parsedData.language
      : validated.language === 'auto' ? 'en' : validated.language;

    const rawText = typeof parsedData.rawText === 'string'
      ? parsedData.rawText
      : '';

    const structuredData = parsedData.data ?? parsedData;
    if ('confidence' in (structuredData as Record<string, unknown>)) {
      delete (structuredData as Record<string, unknown>).confidence;
    }
    if ('rawText' in (structuredData as Record<string, unknown>)) {
      delete (structuredData as Record<string, unknown>).rawText;
    }
    if ('language' in (structuredData as Record<string, unknown>)) {
      delete (structuredData as Record<string, unknown>).language;
    }

    const processingTimeMs = Date.now() - startTime;

    const job = await prisma.conversionJob.create({
      data: {
        tenantId: validated.tenantId,
        userId: validated.userId,
        sourceFormat: ext.toUpperCase() as string,
        targetFormat: validated.outputFormat.toUpperCase().replace('-', '_') as string,
        sourceFilename: filename,
        outputFilename: `${filename.replace(/\.[^.]+$/, '')}.${validated.outputFormat === 'xlsx-json' ? 'xlsx' : validated.outputFormat}`,
        sourceSizeBytes: imageBuffer.length,
        status: 'COMPLETED',
        durationMs: processingTimeMs,
        metadata: JSON.stringify({
          extractionType,
          confidence,
          language: detectedLanguage,
        }),
      },
    });

    logger.info('Image to structured data extraction completed', {
      jobId: job.id,
      extractionType,
      confidence,
      language: detectedLanguage,
      processingTimeMs,
    });

    return {
      extractionType,
      data: structuredData as ExtractionResult['data'],
      rawText,
      confidence,
      language: detectedLanguage,
      processingTimeMs,
      jobId: job.id,
    };
  }

  private async preprocessImage(buffer: Buffer): Promise<Buffer> {
    const metadata = await sharp(buffer).metadata();
    let pipeline = sharp(buffer, { failOnError: false });

    const maxDimension = 4096;
    if (metadata.width && metadata.height) {
      if (metadata.width > maxDimension || metadata.height > maxDimension) {
        pipeline = pipeline.resize(maxDimension, maxDimension, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
    }

    pipeline = pipeline
      .normalize()
      .sharpen({ sigma: 1.0, m1: 0.8, m2: 0.3 });

    return pipeline.png().toBuffer();
  }

  private async detectExtractionType(
    base64Image: string,
    mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  ): Promise<ExtractionRequest['extractionType']> {
    try {
      const response = await this.anthropic.messages.create({
        model: VISION_MODEL,
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64Image },
              },
              {
                type: 'text',
                text: `Classify this image into exactly one of these categories. Reply with ONLY the category name, nothing else:
- table (contains tabular data with rows and columns)
- form (a form with labeled fields and values)
- receipt (a purchase receipt or sales slip)
- invoice (a business invoice)
- card (a business card or contact card)
- document (a general document with text)`,
              },
            ],
          },
        ],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') return 'document';

      const category = textBlock.text.trim().toLowerCase();
      const validTypes: ExtractionRequest['extractionType'][] = ['table', 'form', 'receipt', 'invoice', 'card', 'document'];

      for (const vt of validTypes) {
        if (category.includes(vt)) return vt;
      }

      return 'document';
    } catch (error) {
      logger.warn('Failed to auto-detect extraction type, defaulting to document', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 'document';
    }
  }

  private buildExtractionPrompt(
    extractionType: string,
    language: string,
    customSchema?: Record<string, string>
  ): string {
    const languageInstruction = language === 'ar'
      ? 'The image contains Arabic text. Preserve Arabic text exactly as it appears, maintaining right-to-left order.'
      : language === 'en'
        ? 'The image contains English text.'
        : 'Detect the language automatically and preserve text in its original form.';

    if (customSchema) {
      const schemaFields = Object.entries(customSchema)
        .map(([key, desc]) => `  "${key}": "${desc}"`)
        .join(',\n');

      return `Extract structured data from this image according to the following schema.
${languageInstruction}

Required schema:
{
${schemaFields}
}

Return ONLY valid JSON with:
{
  "data": { ...extracted fields matching the schema... },
  "rawText": "full text visible in the image",
  "confidence": <0.0-1.0>,
  "language": "ar" or "en"
}`;
    }

    switch (extractionType) {
      case 'table':
        return `Extract ALL tabular data from this image.
${languageInstruction}

Return ONLY valid JSON:
{
  "data": [
    {
      "headers": ["column1", "column2", ...],
      "rows": [["val1", "val2", ...], ...],
      "confidence": <0.0-1.0>
    }
  ],
  "rawText": "full text in image",
  "confidence": <0.0-1.0>,
  "language": "ar" or "en"
}

Important:
- Extract ALL tables found in the image
- Preserve exact cell values including numbers, dates, currencies
- Maintain column alignment`;

      case 'form':
        return `Extract all form fields and their values from this image.
${languageInstruction}

Return ONLY valid JSON:
{
  "data": {
    "fields": [
      {"label": "field name", "value": "field value", "confidence": <0.0-1.0>, "type": "text|number|date|checkbox|select"}
    ]
  },
  "rawText": "full text in image",
  "confidence": <0.0-1.0>,
  "language": "ar" or "en"
}`;

      case 'receipt':
        return `Extract receipt/sales data from this image.
${languageInstruction}

Return ONLY valid JSON:
{
  "data": {
    "vendor": "store name",
    "date": "date string",
    "total": "total amount",
    "currency": "SAR/USD/etc",
    "taxAmount": "tax amount",
    "items": [{"name": "item", "quantity": "qty", "unitPrice": "price", "total": "line total"}],
    "paymentMethod": "cash/card/etc"
  },
  "rawText": "full text in image",
  "confidence": <0.0-1.0>,
  "language": "ar" or "en"
}`;

      case 'invoice':
        return `Extract invoice data from this image.
${languageInstruction}

Return ONLY valid JSON:
{
  "data": {
    "invoiceNumber": "",
    "date": "",
    "dueDate": "",
    "vendor": {"name": "", "address": "", "taxId": ""},
    "customer": {"name": "", "address": "", "taxId": ""},
    "items": [{"description": "", "quantity": "", "unitPrice": "", "total": ""}],
    "subtotal": "",
    "taxAmount": "",
    "total": "",
    "currency": "",
    "notes": ""
  },
  "rawText": "full text in image",
  "confidence": <0.0-1.0>,
  "language": "ar" or "en"
}`;

      case 'card':
        return `Extract business card information from this image.
${languageInstruction}

Return ONLY valid JSON:
{
  "data": {
    "name": "",
    "title": "",
    "organization": "",
    "email": "",
    "phone": "",
    "mobile": "",
    "fax": "",
    "website": "",
    "address": ""
  },
  "rawText": "full text in image",
  "confidence": <0.0-1.0>,
  "language": "ar" or "en"
}`;

      default:
        return `Extract all structured data and text from this image.
${languageInstruction}

Analyze the content and extract meaningful key-value pairs, tables, lists, or any structured information.

Return ONLY valid JSON:
{
  "data": {
    "title": "document title if visible",
    "sections": [{"heading": "", "content": ""}],
    "keyValues": [{"key": "", "value": ""}],
    "tables": [{"headers": [], "rows": []}],
    "lists": [["item1", "item2"]]
  },
  "rawText": "full text in image",
  "confidence": <0.0-1.0>,
  "language": "ar" or "en"
}`;
    }
  }

  async extractToCSV(
    imageBuffer: Buffer,
    filename: string,
    request: Partial<ExtractionRequest> & { tenantId: string; userId: string }
  ): Promise<{ csv: string; jobId: string }> {
    const result = await this.extract(imageBuffer, filename, {
      ...request,
      extractionType: 'table',
      outputFormat: 'csv',
    });

    const tables = result.data as StructuredTable[];
    if (!Array.isArray(tables) || tables.length === 0) {
      return { csv: '', jobId: result.jobId };
    }

    const csvLines: string[] = [];
    for (const table of tables) {
      if (table.headers && table.headers.length > 0) {
        csvLines.push(table.headers.map(h => this.escapeCSV(h)).join(','));
      }
      if (table.rows) {
        for (const row of table.rows) {
          csvLines.push(row.map(cell => this.escapeCSV(cell)).join(','));
        }
      }
      csvLines.push('');
    }

    return { csv: csvLines.join('\n'), jobId: result.jobId };
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

export const imageToStructuredDataService = new ImageToStructuredDataService();
