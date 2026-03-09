import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import ExcelJS from 'exceljs';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface FileMetadata {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  standard: StandardMetadata;
  custom: CustomMetadata[];
  exif?: ExifData;
  documentProperties?: DocumentProperties;
  extractedAt: Date;
}

export interface StandardMetadata {
  createdAt?: Date;
  modifiedAt?: Date;
  accessedAt?: Date;
  author?: string;
  title?: string;
  description?: string;
  keywords?: string[];
  language?: string;
  pageCount?: number;
  wordCount?: number;
  duration?: number;
  dimensions?: { width: number; height: number };
}

export interface ExifData {
  cameraMake?: string;
  cameraModel?: string;
  exposureTime?: string;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  dateTimeOriginal?: Date;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  orientation?: number;
  colorSpace?: string;
  whiteBalance?: string;
  flash?: boolean;
  software?: string;
}

export interface DocumentProperties {
  title?: string;
  subject?: string;
  author?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  pageSize?: { width: number; height: number };
  encrypted?: boolean;
  version?: string;
  sheetCount?: number;
  slideCount?: number;
}

export interface CustomMetadata {
  key: string;
  value: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'json';
  namespace?: string;
  createdBy: string;
  createdAt: Date;
}

export interface MetadataTemplate {
  id: string;
  name: string;
  description: string;
  fields: MetadataTemplateField[];
  appliesToMimeTypes: string[];
  createdBy: string;
}

export interface MetadataTemplateField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
  validation?: string;
}

export interface MetadataSearchQuery {
  field: string;
  operator: 'equals' | 'contains' | 'starts_with' | 'range' | 'exists';
  value: unknown;
}

export interface BulkMetadataOperation {
  fileIds: string[];
  operation: 'set' | 'remove' | 'copy';
  metadata: { key: string; value?: string; type?: string }[];
  userId: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class MetadataEngineService {
  constructor(private prisma: PrismaClient) {}

  async extractMetadata(fileId: string, filePath: string, mimeType: string): Promise<FileMetadata> {
    const standard: StandardMetadata = {};
    let exif: ExifData | undefined;
    let documentProperties: DocumentProperties | undefined;

    if (mimeType.startsWith('image/')) {
      const imageResult = await this.extractImageMetadata(filePath);
      Object.assign(standard, imageResult.standard);
      exif = imageResult.exif;
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    ) {
      documentProperties = await this.extractExcelMetadata(filePath);
      if (documentProperties.title) standard.title = documentProperties.title;
      if (documentProperties.author) standard.author = documentProperties.author;
    } else if (mimeType === 'application/pdf') {
      documentProperties = await this.extractPdfMetadata(filePath);
      if (documentProperties.title) standard.title = documentProperties.title;
      if (documentProperties.author) standard.author = documentProperties.author;
    }

    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    const fileSize = file?.size || 0;
    const fileName = file?.name || '';

    const customMetadata = await this.getCustomMetadata(fileId);

    const metadata: FileMetadata = {
      fileId,
      fileName,
      mimeType,
      fileSize,
      standard,
      custom: customMetadata,
      exif,
      documentProperties,
      extractedAt: new Date(),
    };

    await this.prisma.fileMetadata.upsert({
      where: { fileId },
      create: {
        fileId,
        standardMetadata: JSON.stringify(standard),
        exifData: exif ? JSON.stringify(exif) : null,
        documentProperties: documentProperties ? JSON.stringify(documentProperties) : null,
        extractedAt: new Date(),
      },
      update: {
        standardMetadata: JSON.stringify(standard),
        exifData: exif ? JSON.stringify(exif) : null,
        documentProperties: documentProperties ? JSON.stringify(documentProperties) : null,
        extractedAt: new Date(),
      },
    });

    await this.indexMetadata(fileId, metadata);

    return metadata;
  }

  private async extractImageMetadata(filePath: string): Promise<{
    standard: StandardMetadata;
    exif: ExifData;
  }> {
    const image = sharp(filePath);
    const metadata = await image.metadata();
    const stats = await image.stats();

    const standard: StandardMetadata = {
      dimensions: {
        width: metadata.width || 0,
        height: metadata.height || 0,
      },
    };

    const exif: ExifData = {};

    if (metadata.exif) {
      const exifBuffer = metadata.exif;
      try {
        const rawExif = this.parseExifBuffer(exifBuffer);
        if (rawExif.Make) exif.cameraMake = String(rawExif.Make);
        if (rawExif.Model) exif.cameraModel = String(rawExif.Model);
        if (rawExif.ExposureTime) exif.exposureTime = String(rawExif.ExposureTime);
        if (rawExif.FNumber) exif.fNumber = Number(rawExif.FNumber);
        if (rawExif.ISOSpeedRatings) exif.iso = Number(rawExif.ISOSpeedRatings);
        if (rawExif.FocalLength) exif.focalLength = Number(rawExif.FocalLength);
        if (rawExif.DateTimeOriginal) exif.dateTimeOriginal = new Date(String(rawExif.DateTimeOriginal));
        if (rawExif.GPSLatitude) exif.gpsLatitude = Number(rawExif.GPSLatitude);
        if (rawExif.GPSLongitude) exif.gpsLongitude = Number(rawExif.GPSLongitude);
        if (rawExif.Orientation) exif.orientation = Number(rawExif.Orientation);
        if (rawExif.Software) exif.software = String(rawExif.Software);
        if (rawExif.Flash !== undefined) exif.flash = Boolean(rawExif.Flash);
      } catch {
        // EXIF parsing can fail for corrupted data; continue without it
      }
    }

    exif.colorSpace = metadata.space || undefined;

    return { standard, exif };
  }

  private parseExifBuffer(buffer: Buffer): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const marker = buffer.indexOf('Exif');
    if (marker === -1) return result;

    const tiffOffset = marker + 6;
    if (tiffOffset >= buffer.length) return result;

    const isLittleEndian = buffer.readUInt16BE(tiffOffset) === 0x4949;
    const readUInt16 = isLittleEndian
      ? (offset: number) => buffer.readUInt16LE(offset)
      : (offset: number) => buffer.readUInt16BE(offset);
    const readUInt32 = isLittleEndian
      ? (offset: number) => buffer.readUInt32LE(offset)
      : (offset: number) => buffer.readUInt32BE(offset);

    try {
      const ifdOffset = readUInt32(tiffOffset + 4);
      const entryCount = readUInt16(tiffOffset + ifdOffset);

      for (let i = 0; i < entryCount && i < 50; i++) {
        const entryOffset = tiffOffset + ifdOffset + 2 + i * 12;
        if (entryOffset + 12 > buffer.length) break;
        const tag = readUInt16(entryOffset);
        const tagNames: Record<number, string> = {
          0x010F: 'Make', 0x0110: 'Model', 0x0112: 'Orientation',
          0x829A: 'ExposureTime', 0x829D: 'FNumber', 0x8827: 'ISOSpeedRatings',
          0x9003: 'DateTimeOriginal', 0x920A: 'FocalLength', 0x0131: 'Software',
        };
        if (tagNames[tag]) {
          result[tagNames[tag]] = readUInt32(entryOffset + 8);
        }
      }
    } catch {
      // Best-effort parsing
    }

    return result;
  }

  private async extractExcelMetadata(filePath: string): Promise<DocumentProperties> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    return {
      title: workbook.title || undefined,
      subject: workbook.subject || undefined,
      author: workbook.creator || undefined,
      creator: workbook.creator || undefined,
      creationDate: workbook.created || undefined,
      modificationDate: workbook.modified || undefined,
      version: undefined,
      sheetCount: workbook.worksheets.length,
    };
  }

  private async extractPdfMetadata(filePath: string): Promise<DocumentProperties> {
    const fs = await import('fs');
    const buffer = fs.readFileSync(filePath);
    const content = buffer.toString('latin1', 0, Math.min(buffer.length, 10000));

    const properties: DocumentProperties = {};

    const titleMatch = content.match(/\/Title\s*\(([^)]*)\)/);
    if (titleMatch) properties.title = titleMatch[1];

    const authorMatch = content.match(/\/Author\s*\(([^)]*)\)/);
    if (authorMatch) properties.author = authorMatch[1];

    const creatorMatch = content.match(/\/Creator\s*\(([^)]*)\)/);
    if (creatorMatch) properties.creator = creatorMatch[1];

    const producerMatch = content.match(/\/Producer\s*\(([^)]*)\)/);
    if (producerMatch) properties.producer = producerMatch[1];

    const versionMatch = content.match(/%PDF-(\d+\.\d+)/);
    if (versionMatch) properties.version = versionMatch[1];

    const pageCountMatch = content.match(/\/Type\s*\/Page[^s]/g);
    if (pageCountMatch) properties.pageSize = undefined;

    properties.encrypted = content.includes('/Encrypt');

    return properties;
  }

  async setCustomMetadata(
    fileId: string,
    key: string,
    value: string,
    type: CustomMetadata['type'],
    userId: string,
    namespace?: string,
  ): Promise<CustomMetadata> {
    this.validateMetadataValue(value, type);

    await this.prisma.customMetadata.upsert({
      where: {
        fileId_key_namespace: {
          fileId,
          key,
          namespace: namespace || 'default',
        },
      },
      create: {
        fileId,
        key,
        value,
        type,
        namespace: namespace || 'default',
        createdBy: userId,
        createdAt: new Date(),
      },
      update: {
        value,
        type,
        updatedBy: userId,
        updatedAt: new Date(),
      },
    });

    await this.indexMetadataField(fileId, key, value, type);

    return { key, value, type, namespace, createdBy: userId, createdAt: new Date() };
  }

  private validateMetadataValue(value: string, type: CustomMetadata['type']): void {
    switch (type) {
      case 'number':
        if (isNaN(Number(value))) throw new Error(`Invalid number value: ${value}`);
        break;
      case 'date':
        if (isNaN(Date.parse(value))) throw new Error(`Invalid date value: ${value}`);
        break;
      case 'boolean':
        if (value !== 'true' && value !== 'false') throw new Error(`Invalid boolean value: ${value}`);
        break;
      case 'json':
        try { JSON.parse(value); } catch { throw new Error(`Invalid JSON value: ${value}`); }
        break;
    }
  }

  async getCustomMetadata(fileId: string): Promise<CustomMetadata[]> {
    const records = await this.prisma.customMetadata.findMany({
      where: { fileId },
      orderBy: { key: 'asc' },
    });

    return records.map(r => ({
      key: r.key,
      value: r.value,
      type: r.type as CustomMetadata['type'],
      namespace: r.namespace || undefined,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  async searchByMetadata(
    queries: MetadataSearchQuery[],
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{ fileIds: string[]; totalCount: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const query of queries) {
      switch (query.operator) {
        case 'equals':
          conditions.push(`(cm."key" = $${paramIdx} AND cm."value" = $${paramIdx + 1})`);
          params.push(query.field, String(query.value));
          paramIdx += 2;
          break;
        case 'contains':
          conditions.push(`(cm."key" = $${paramIdx} AND cm."value" ILIKE $${paramIdx + 1})`);
          params.push(query.field, `%${query.value}%`);
          paramIdx += 2;
          break;
        case 'starts_with':
          conditions.push(`(cm."key" = $${paramIdx} AND cm."value" ILIKE $${paramIdx + 1})`);
          params.push(query.field, `${query.value}%`);
          paramIdx += 2;
          break;
        case 'exists':
          conditions.push(`(cm."key" = $${paramIdx})`);
          params.push(query.field);
          paramIdx += 1;
          break;
        case 'range':
          const range = query.value as { min?: string; max?: string };
          if (range.min) {
            conditions.push(`(cm."key" = $${paramIdx} AND cm."value" >= $${paramIdx + 1})`);
            params.push(query.field, range.min);
            paramIdx += 2;
          }
          if (range.max) {
            conditions.push(`(cm."key" = $${paramIdx} AND cm."value" <= $${paramIdx + 1})`);
            params.push(query.field, range.max);
            paramIdx += 2;
          }
          break;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countQuery = `SELECT COUNT(DISTINCT cm."fileId") as cnt FROM "custom_metadata" cm ${whereClause}`;
    const countResult = await this.prisma.$queryRawUnsafe(countQuery, ...params) as { cnt: bigint }[];
    const totalCount = Number(countResult[0]?.cnt || 0);

    const offset = (page - 1) * pageSize;
    const dataQuery = `SELECT DISTINCT cm."fileId" FROM "custom_metadata" cm ${whereClause} ORDER BY cm."fileId" LIMIT ${pageSize} OFFSET ${offset}`;
    const dataResult = await this.prisma.$queryRawUnsafe(dataQuery, ...params) as { fileId: string }[];
    const fileIds = dataResult.map(r => r.fileId);

    return { fileIds, totalCount };
  }

  async createMetadataTemplate(
    input: Omit<MetadataTemplate, 'id'>,
  ): Promise<MetadataTemplate> {
    const errors: string[] = [];
    if (!input.name) errors.push('Template name is required');
    if (!input.fields || input.fields.length === 0) errors.push('At least one field is required');

    const fieldKeys = new Set<string>();
    for (const field of input.fields) {
      if (fieldKeys.has(field.key)) errors.push(`Duplicate field key: ${field.key}`);
      fieldKeys.add(field.key);
      if (!field.label) errors.push(`Field ${field.key}: label is required`);
      if (field.type === 'enum' && (!field.enumValues || field.enumValues.length === 0)) {
        errors.push(`Field ${field.key}: enum type requires values`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Template validation failed: ${errors.join(', ')}`);
    }

    const template = await this.prisma.metadataTemplate.create({
      data: {
        name: input.name,
        description: input.description,
        fields: JSON.stringify(input.fields),
        appliesToMimeTypes: JSON.stringify(input.appliesToMimeTypes),
        createdBy: input.createdBy,
        createdAt: new Date(),
      },
    });

    return { ...input, id: template.id };
  }

  async applyTemplate(fileId: string, templateId: string, values: Record<string, string>, userId: string): Promise<CustomMetadata[]> {
    const template = await this.prisma.metadataTemplate.findUniqueOrThrow({
      where: { id: templateId },
    });

    const fields: MetadataTemplateField[] = JSON.parse(template.fields as string);
    const applied: CustomMetadata[] = [];

    for (const field of fields) {
      const value = values[field.key] || (field.defaultValue !== undefined ? String(field.defaultValue) : undefined);

      if (field.required && !value) {
        throw new Error(`Required field "${field.key}" is missing`);
      }

      if (!value) continue;

      if (field.type === 'enum' && field.enumValues && !field.enumValues.includes(value)) {
        throw new Error(`Invalid value "${value}" for enum field "${field.key}"`);
      }

      if (field.validation) {
        const regex = new RegExp(field.validation);
        if (!regex.test(value)) {
          throw new Error(`Value "${value}" does not match validation pattern for field "${field.key}"`);
        }
      }

      const metaType = field.type === 'enum' ? 'string' : field.type;
      const meta = await this.setCustomMetadata(fileId, field.key, value, metaType as CustomMetadata['type'], userId, `template:${templateId}`);
      applied.push(meta);
    }

    return applied;
  }

  async bulkOperation(operation: BulkMetadataOperation): Promise<{ successCount: number; errors: { fileId: string; error: string }[] }> {
    let successCount = 0;
    const errors: { fileId: string; error: string }[] = [];

    for (const fileId of operation.fileIds) {
      try {
        for (const meta of operation.metadata) {
          if (operation.operation === 'set') {
            await this.setCustomMetadata(
              fileId, meta.key, meta.value || '', (meta.type || 'string') as CustomMetadata['type'], operation.userId,
            );
          } else if (operation.operation === 'remove') {
            await this.prisma.customMetadata.deleteMany({
              where: { fileId, key: meta.key },
            });
          } else if (operation.operation === 'copy') {
            const sourceMetadata = await this.getCustomMetadata(operation.fileIds[0]);
            for (const sm of sourceMetadata) {
              if (meta.key === '*' || sm.key === meta.key) {
                await this.setCustomMetadata(fileId, sm.key, sm.value, sm.type, operation.userId);
              }
            }
          }
        }
        successCount += 1;
      } catch (err) {
        errors.push({ fileId, error: (err as Error).message });
      }
    }

    return { successCount, errors };
  }

  private async indexMetadata(fileId: string, metadata: FileMetadata): Promise<void> {
    const searchableText = [
      metadata.standard.title,
      metadata.standard.description,
      metadata.standard.author,
      ...(metadata.standard.keywords || []),
      ...metadata.custom.map(c => `${c.key}:${c.value}`),
    ].filter(Boolean).join(' ');

    await this.prisma.metadataIndex.upsert({
      where: { fileId },
      create: { fileId, searchableText, updatedAt: new Date() },
      update: { searchableText, updatedAt: new Date() },
    });
  }

  private async indexMetadataField(fileId: string, key: string, value: string, type: string): Promise<void> {
    const existing = await this.prisma.metadataIndex.findUnique({ where: { fileId } });
    const currentText = existing?.searchableText || '';
    const newText = `${currentText} ${key}:${value}`;

    await this.prisma.metadataIndex.upsert({
      where: { fileId },
      create: { fileId, searchableText: newText, updatedAt: new Date() },
      update: { searchableText: newText, updatedAt: new Date() },
    });
  }
}
