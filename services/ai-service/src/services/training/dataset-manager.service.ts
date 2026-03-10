import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import winston from 'winston';
import { z } from 'zod';

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'dataset-manager' },
  transports: [new winston.transports.Console()],
});

// ─── Validation Schemas ──────────────────────────────────────────────

const CreateDatasetSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  language: z.enum(['ar', 'en', 'mixed']).optional().default('ar'),
  taskType: z.enum([
    'classification', 'regression', 'ner', 'text-generation',
    'summarization', 'translation', 'question-answering', 'sentiment',
  ]),
  tags: z.array(z.string()).optional().default([]),
});

const UpdateDatasetSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
});

const AddSamplesSchema = z.object({
  datasetId: z.string().uuid(),
  samples: z.array(z.object({
    input: z.string().min(1),
    expectedOutput: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
    tags: z.array(z.string()).optional().default([]),
  })).min(1).max(10000),
});

const SplitConfigSchema = z.object({
  trainRatio: z.number().min(0.1).max(0.95).default(0.8),
  validationRatio: z.number().min(0.01).max(0.5).default(0.1),
  testRatio: z.number().min(0.01).max(0.5).default(0.1),
  seed: z.number().int().optional(),
  stratify: z.boolean().optional().default(false),
});

const ExportFormat = z.enum(['jsonl', 'csv', 'parquet']);

// ─── Interfaces ──────────────────────────────────────────────────────

export interface DatasetRecord {
  id: string;
  name: string;
  description: string;
  tenantId: string;
  userId: string;
  language: string;
  taskType: string;
  tags: string[];
  version: number;
  sampleCount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatasetSample {
  id: string;
  datasetId: string;
  input: string;
  expectedOutput: string;
  metadata: Record<string, unknown>;
  quality: number;
  tags: string[];
  isAugmented: boolean;
  split: string | null;
  createdAt: Date;
}

export interface DatasetStatistics {
  totalSamples: number;
  augmentedSamples: number;
  originalSamples: number;
  avgInputLength: number;
  avgOutputLength: number;
  avgQuality: number;
  labelDistribution: Record<string, number>;
  qualityDistribution: { high: number; medium: number; low: number };
  splitDistribution: { train: number; validation: number; test: number; unassigned: number };
  languageBreakdown: Record<string, number>;
  qualityScore: number;
}

export interface DatasetVersion {
  id: string;
  datasetId: string;
  version: number;
  sampleCount: number;
  checksum: string;
  description: string;
  createdAt: Date;
}

export interface AugmentationResult {
  originalCount: number;
  augmentedCount: number;
  totalAfter: number;
  techniques: string[];
}

// ─── Arabic Augmentation Helpers ─────────────────────────────────────

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

const ARABIC_SYNONYMS: Record<string, string[]> = {
  'جيد': ['ممتاز', 'رائع', 'حسن'],
  'سيء': ['ضعيف', 'رديء', 'سلبي'],
  'كبير': ['ضخم', 'عظيم', 'واسع'],
  'صغير': ['ضئيل', 'قليل', 'محدود'],
  'سريع': ['عاجل', 'فوري', 'خاطف'],
  'بطيء': ['متأخر', 'متمهل', 'متباطئ'],
  'مهم': ['ضروري', 'أساسي', 'جوهري'],
  'صعب': ['معقد', 'شاق', 'عسير'],
  'سهل': ['بسيط', 'يسير', 'ميسر'],
  'جديد': ['حديث', 'عصري', 'مستحدث'],
};

function removeDiacritics(text: string): string {
  return text.replace(ARABIC_DIACRITICS, '');
}

function synonymReplacement(text: string): string {
  let result = text;
  const words = text.split(/\s+/);
  let replaced = false;

  for (let i = 0; i < words.length && !replaced; i++) {
    const cleanWord = removeDiacritics(words[i]);
    const synonyms = ARABIC_SYNONYMS[cleanWord];
    if (synonyms && synonyms.length > 0) {
      const idx = Math.abs(hashCode(text + i.toString())) % synonyms.length;
      result = result.replace(words[i], synonyms[idx]);
      replaced = true;
    }
  }

  return result;
}

function shuffleWords(text: string): string {
  const sentences = text.split(/[.،؛!؟]/);
  if (sentences.length <= 1) return text;

  const idx1 = Math.abs(hashCode(text)) % sentences.length;
  let idx2 = (idx1 + 1) % sentences.length;
  if (idx2 === idx1) idx2 = (idx1 + 2) % sentences.length;

  const result = [...sentences];
  const temp = result[idx1];
  result[idx1] = result[idx2];
  result[idx2] = temp;

  return result.filter(s => s.trim()).join('. ');
}

function characterNoise(text: string): string {
  if (text.length < 10) return text;
  const pos = Math.abs(hashCode(text)) % Math.max(1, text.length - 2);
  const chars = text.split('');
  if (pos < chars.length - 1) {
    const temp = chars[pos];
    chars[pos] = chars[pos + 1];
    chars[pos + 1] = temp;
  }
  return chars.join('');
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

function detectLanguage(text: string): string {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
  const arabicChars = (text.match(arabicPattern) || []).length;
  const totalChars = text.replace(/\s/g, '').length;

  if (totalChars === 0) return 'unknown';
  const ratio = arabicChars / totalChars;

  if (ratio > 0.5) return 'ar';
  if (ratio > 0.1) return 'mixed';
  return 'en';
}

// ─── Service ─────────────────────────────────────────────────────────

export class DatasetManagerService {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  // ── CRUD Operations ──────────────────────────────────────────────

  async createDataset(input: z.infer<typeof CreateDatasetSchema>): Promise<DatasetRecord> {
    const validated = CreateDatasetSchema.parse(input);
    const id = crypto.randomUUID();

    logger.info('Creating dataset', { id, name: validated.name, taskType: validated.taskType });

    const dataset = await this.prisma.trainingDataset.create({
      data: {
        id,
        name: validated.name,
        description: validated.description,
        tenantId: validated.tenantId,
        userId: validated.userId,
        language: validated.language,
        taskType: validated.taskType,
        tags: validated.tags,
        version: 1,
        sampleCount: 0,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return this.toDatasetRecord(dataset);
  }

  async getDataset(datasetId: string, tenantId: string): Promise<DatasetRecord | null> {
    const dataset = await this.prisma.trainingDataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!dataset) return null;
    return this.toDatasetRecord(dataset);
  }

  async listDatasets(
    tenantId: string,
    options: { page?: number; limit?: number; taskType?: string; search?: string } = {},
  ): Promise<{ data: DatasetRecord[]; total: number; page: number; limit: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };

    if (options.taskType) {
      where.taskType = options.taskType;
    }

    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { description: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [datasets, total] = await Promise.all([
      this.prisma.trainingDataset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.trainingDataset.count({ where }),
    ]);

    return {
      data: datasets.map((d: Record<string, unknown>) => this.toDatasetRecord(d)),
      total,
      page,
      limit,
    };
  }

  async updateDataset(
    datasetId: string,
    tenantId: string,
    input: z.infer<typeof UpdateDatasetSchema>,
  ): Promise<DatasetRecord> {
    const validated = UpdateDatasetSchema.parse(input);

    const existing = await this.prisma.trainingDataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!existing) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.tags !== undefined) updateData.tags = validated.tags;

    const updated = await this.prisma.trainingDataset.update({
      where: { id: datasetId },
      data: updateData,
    });

    logger.info('Dataset updated', { datasetId });
    return this.toDatasetRecord(updated);
  }

  async deleteDataset(datasetId: string, tenantId: string): Promise<void> {
    const existing = await this.prisma.trainingDataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!existing) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    await this.prisma.trainingSample.deleteMany({
      where: { datasetId },
    });

    await this.prisma.datasetVersion.deleteMany({
      where: { datasetId },
    });

    await this.prisma.trainingDataset.delete({
      where: { id: datasetId },
    });

    logger.info('Dataset deleted', { datasetId });
  }

  // ── Sample Management ────────────────────────────────────────────

  async addSamples(input: z.infer<typeof AddSamplesSchema>): Promise<{ added: number; total: number }> {
    const validated = AddSamplesSchema.parse(input);

    const dataset = await this.prisma.trainingDataset.findFirst({
      where: { id: validated.datasetId },
    });

    if (!dataset) {
      throw new Error(`Dataset not found: ${validated.datasetId}`);
    }

    const sampleRecords = validated.samples.map((sample) => ({
      id: crypto.randomUUID(),
      datasetId: validated.datasetId,
      input: sample.input,
      expectedOutput: sample.expectedOutput,
      metadata: sample.metadata as Record<string, unknown>,
      quality: this.computeSampleQuality(sample.input, sample.expectedOutput),
      tags: sample.tags,
      isAugmented: false,
      split: null as string | null,
      createdAt: new Date(),
    }));

    await this.prisma.trainingSample.createMany({
      data: sampleRecords,
    });

    const totalCount = await this.prisma.trainingSample.count({
      where: { datasetId: validated.datasetId },
    });

    await this.prisma.trainingDataset.update({
      where: { id: validated.datasetId },
      data: { sampleCount: totalCount, updatedAt: new Date() },
    });

    logger.info('Samples added', { datasetId: validated.datasetId, added: validated.samples.length, total: totalCount });

    return { added: validated.samples.length, total: totalCount };
  }

  async getSamples(
    datasetId: string,
    options: { page?: number; limit?: number; split?: string; minQuality?: number } = {},
  ): Promise<{ data: DatasetSample[]; total: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { datasetId };
    if (options.split) where.split = options.split;
    if (options.minQuality !== undefined) where.quality = { gte: options.minQuality };

    const [samples, total] = await Promise.all([
      this.prisma.trainingSample.findMany({
        where,
        skip,
        take: limit,
        orderBy: { quality: 'desc' },
      }),
      this.prisma.trainingSample.count({ where }),
    ]);

    return {
      data: samples.map((s: Record<string, unknown>) => this.toSampleRecord(s)),
      total,
    };
  }

  async deleteSample(sampleId: string, datasetId: string): Promise<void> {
    await this.prisma.trainingSample.delete({
      where: { id: sampleId },
    });

    const totalCount = await this.prisma.trainingSample.count({
      where: { datasetId },
    });

    await this.prisma.trainingDataset.update({
      where: { id: datasetId },
      data: { sampleCount: totalCount, updatedAt: new Date() },
    });
  }

  // ── Versioning ───────────────────────────────────────────────────

  async createVersion(
    datasetId: string,
    tenantId: string,
    description: string,
  ): Promise<DatasetVersion> {
    const dataset = await this.prisma.trainingDataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const typed = dataset as Record<string, unknown>;
    const currentVersion = (typed.version as number) || 1;
    const newVersion = currentVersion + 1;

    const samples = await this.prisma.trainingSample.findMany({
      where: { datasetId },
      orderBy: { createdAt: 'asc' },
    });

    const checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(samples.map((s: Record<string, unknown>) => ({
        input: s.input,
        output: s.expectedOutput,
      }))))
      .digest('hex');

    const versionRecord = await this.prisma.datasetVersion.create({
      data: {
        id: crypto.randomUUID(),
        datasetId,
        version: newVersion,
        sampleCount: samples.length,
        checksum,
        description,
        snapshot: JSON.stringify(samples),
        createdAt: new Date(),
      },
    });

    await this.prisma.trainingDataset.update({
      where: { id: datasetId },
      data: { version: newVersion, updatedAt: new Date() },
    });

    logger.info('Dataset version created', { datasetId, version: newVersion, checksum });

    return {
      id: versionRecord.id as string,
      datasetId,
      version: newVersion,
      sampleCount: samples.length,
      checksum,
      description,
      createdAt: versionRecord.createdAt as Date,
    };
  }

  async listVersions(datasetId: string): Promise<DatasetVersion[]> {
    const versions = await this.prisma.datasetVersion.findMany({
      where: { datasetId },
      orderBy: { version: 'desc' },
    });

    return versions.map((v: Record<string, unknown>) => ({
      id: v.id as string,
      datasetId: v.datasetId as string,
      version: v.version as number,
      sampleCount: v.sampleCount as number,
      checksum: v.checksum as string,
      description: v.description as string,
      createdAt: v.createdAt as Date,
    }));
  }

  async restoreVersion(datasetId: string, tenantId: string, versionId: string): Promise<DatasetRecord> {
    const version = await this.prisma.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
    });

    if (!version) {
      throw new Error(`Version not found: ${versionId}`);
    }

    const typed = version as Record<string, unknown>;
    const snapshot = JSON.parse(typed.snapshot as string) as Array<Record<string, unknown>>;

    await this.prisma.trainingSample.deleteMany({ where: { datasetId } });

    if (snapshot.length > 0) {
      await this.prisma.trainingSample.createMany({
        data: snapshot.map((s) => ({
          id: crypto.randomUUID(),
          datasetId,
          input: s.input as string,
          expectedOutput: s.expectedOutput as string,
          metadata: (s.metadata as Record<string, unknown>) || {},
          quality: (s.quality as number) || 0.5,
          tags: (s.tags as string[]) || [],
          isAugmented: (s.isAugmented as boolean) || false,
          split: (s.split as string) || null,
          createdAt: new Date(),
        })),
      });
    }

    const updated = await this.prisma.trainingDataset.update({
      where: { id: datasetId },
      data: {
        sampleCount: snapshot.length,
        updatedAt: new Date(),
      },
    });

    logger.info('Dataset version restored', { datasetId, versionId, sampleCount: snapshot.length });

    return this.toDatasetRecord(updated);
  }

  // ── Train/Validation/Test Split ──────────────────────────────────

  async splitDataset(
    datasetId: string,
    tenantId: string,
    config: z.infer<typeof SplitConfigSchema>,
  ): Promise<{ train: number; validation: number; test: number }> {
    const validated = SplitConfigSchema.parse(config);

    const totalRatio = validated.trainRatio + validated.validationRatio + validated.testRatio;
    if (Math.abs(totalRatio - 1.0) > 0.01) {
      throw new Error(`Split ratios must sum to 1.0, got ${totalRatio}`);
    }

    const dataset = await this.prisma.trainingDataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const samples = await this.prisma.trainingSample.findMany({
      where: { datasetId },
      orderBy: { createdAt: 'asc' },
    });

    if (samples.length < 3) {
      throw new Error(`Need at least 3 samples to split. Got ${samples.length}`);
    }

    // Deterministic shuffle using seed
    const seed = validated.seed ?? 42;
    const indices = Array.from({ length: samples.length }, (_, i) => i);
    this.seededShuffle(indices, seed);

    const trainEnd = Math.floor(samples.length * validated.trainRatio);
    const valEnd = trainEnd + Math.floor(samples.length * validated.validationRatio);

    const updates: Array<Promise<unknown>> = [];

    for (let i = 0; i < indices.length; i++) {
      const sampleIdx = indices[i];
      const sample = samples[sampleIdx] as Record<string, unknown>;
      let split: string;

      if (i < trainEnd) {
        split = 'train';
      } else if (i < valEnd) {
        split = 'validation';
      } else {
        split = 'test';
      }

      updates.push(
        this.prisma.trainingSample.update({
          where: { id: sample.id as string },
          data: { split },
        }),
      );
    }

    await Promise.all(updates);

    const trainCount = trainEnd;
    const valCount = valEnd - trainEnd;
    const testCount = samples.length - valEnd;

    logger.info('Dataset split complete', { datasetId, train: trainCount, validation: valCount, test: testCount });

    return { train: trainCount, validation: valCount, test: testCount };
  }

  // ── Data Augmentation (Arabic) ───────────────────────────────────

  async augmentDataset(
    datasetId: string,
    tenantId: string,
    techniques: string[] = ['synonym_replacement', 'diacritics_removal', 'sentence_shuffle'],
    maxAugmentPerSample: number = 2,
  ): Promise<AugmentationResult> {
    const dataset = await this.prisma.trainingDataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const originalSamples = await this.prisma.trainingSample.findMany({
      where: { datasetId, isAugmented: false },
    });

    const augmentedRecords: Array<{
      id: string;
      datasetId: string;
      input: string;
      expectedOutput: string;
      metadata: Record<string, unknown>;
      quality: number;
      tags: string[];
      isAugmented: boolean;
      split: string | null;
      createdAt: Date;
    }> = [];

    for (const sample of originalSamples) {
      const typed = sample as Record<string, unknown>;
      const inputText = typed.input as string;
      const outputText = typed.expectedOutput as string;
      let augCount = 0;

      for (const technique of techniques) {
        if (augCount >= maxAugmentPerSample) break;

        let augmentedInput: string;

        switch (technique) {
          case 'synonym_replacement':
            augmentedInput = synonymReplacement(inputText);
            break;
          case 'diacritics_removal':
            augmentedInput = removeDiacritics(inputText);
            break;
          case 'sentence_shuffle':
            augmentedInput = shuffleWords(inputText);
            break;
          case 'character_noise':
            augmentedInput = characterNoise(inputText);
            break;
          default:
            continue;
        }

        if (augmentedInput !== inputText) {
          augmentedRecords.push({
            id: crypto.randomUUID(),
            datasetId,
            input: augmentedInput,
            expectedOutput: outputText,
            metadata: {
              ...(typed.metadata as Record<string, unknown>),
              augmentationTechnique: technique,
              originalSampleId: typed.id as string,
            },
            quality: Math.max(0.3, (typed.quality as number) - 0.1),
            tags: [...(typed.tags as string[]), 'augmented', technique],
            isAugmented: true,
            split: typed.split as string | null,
            createdAt: new Date(),
          });
          augCount++;
        }
      }
    }

    if (augmentedRecords.length > 0) {
      await this.prisma.trainingSample.createMany({
        data: augmentedRecords,
      });

      const totalCount = await this.prisma.trainingSample.count({
        where: { datasetId },
      });

      await this.prisma.trainingDataset.update({
        where: { id: datasetId },
        data: { sampleCount: totalCount, updatedAt: new Date() },
      });
    }

    logger.info('Augmentation complete', {
      datasetId,
      originalCount: originalSamples.length,
      augmentedCount: augmentedRecords.length,
    });

    const totalAfter = await this.prisma.trainingSample.count({
      where: { datasetId },
    });

    return {
      originalCount: originalSamples.length,
      augmentedCount: augmentedRecords.length,
      totalAfter,
      techniques,
    };
  }

  // ── Statistics ───────────────────────────────────────────────────

  async computeStatistics(datasetId: string, tenantId: string): Promise<DatasetStatistics> {
    const dataset = await this.prisma.trainingDataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const samples = await this.prisma.trainingSample.findMany({
      where: { datasetId },
    });

    const totalSamples = samples.length;
    if (totalSamples === 0) {
      return {
        totalSamples: 0,
        augmentedSamples: 0,
        originalSamples: 0,
        avgInputLength: 0,
        avgOutputLength: 0,
        avgQuality: 0,
        labelDistribution: {},
        qualityDistribution: { high: 0, medium: 0, low: 0 },
        splitDistribution: { train: 0, validation: 0, test: 0, unassigned: 0 },
        languageBreakdown: {},
        qualityScore: 0,
      };
    }

    let totalInputLen = 0;
    let totalOutputLen = 0;
    let totalQuality = 0;
    let augmentedSamples = 0;

    const labelDist: Record<string, number> = {};
    const qualityDist = { high: 0, medium: 0, low: 0 };
    const splitDist = { train: 0, validation: 0, test: 0, unassigned: 0 };
    const langBreakdown: Record<string, number> = {};

    for (const sample of samples) {
      const typed = sample as Record<string, unknown>;
      const inputText = typed.input as string;
      const outputText = typed.expectedOutput as string;
      const quality = typed.quality as number;
      const isAugmented = typed.isAugmented as boolean;
      const split = typed.split as string | null;

      totalInputLen += inputText.length;
      totalOutputLen += outputText.length;
      totalQuality += quality;

      if (isAugmented) augmentedSamples++;

      // Label distribution: use first 50 chars of output as label key
      const labelKey = outputText.substring(0, 50).trim();
      labelDist[labelKey] = (labelDist[labelKey] || 0) + 1;

      // Quality distribution
      if (quality >= 0.7) qualityDist.high++;
      else if (quality >= 0.4) qualityDist.medium++;
      else qualityDist.low++;

      // Split distribution
      if (split === 'train') splitDist.train++;
      else if (split === 'validation') splitDist.validation++;
      else if (split === 'test') splitDist.test++;
      else splitDist.unassigned++;

      // Language detection
      const lang = detectLanguage(inputText);
      langBreakdown[lang] = (langBreakdown[lang] || 0) + 1;
    }

    const avgQuality = totalQuality / totalSamples;
    const avgInputLength = totalInputLen / totalSamples;
    const avgOutputLength = totalOutputLen / totalSamples;

    // Quality score: composite metric
    const diversityScore = Math.min(1, Object.keys(labelDist).length / Math.max(1, totalSamples * 0.1));
    const sizeScore = Math.min(1, totalSamples / 1000);
    const splitScore = splitDist.unassigned === 0 ? 1 : 0.5;
    const qualityScore = Math.round((avgQuality * 0.4 + diversityScore * 0.2 + sizeScore * 0.2 + splitScore * 0.2) * 100) / 100;

    return {
      totalSamples,
      augmentedSamples,
      originalSamples: totalSamples - augmentedSamples,
      avgInputLength: Math.round(avgInputLength),
      avgOutputLength: Math.round(avgOutputLength),
      avgQuality: Math.round(avgQuality * 100) / 100,
      labelDistribution: labelDist,
      qualityDistribution: qualityDist,
      splitDistribution: splitDist,
      languageBreakdown: langBreakdown,
      qualityScore,
    };
  }

  // ── Export ───────────────────────────────────────────────────────

  async exportDataset(
    datasetId: string,
    tenantId: string,
    format: z.infer<typeof ExportFormat>,
    split?: string,
  ): Promise<{ filePath: string; format: string; sampleCount: number }> {
    const dataset = await this.prisma.trainingDataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const where: Record<string, unknown> = { datasetId };
    if (split) where.split = split;

    const samples = await this.prisma.trainingSample.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const exportDir = path.join(os.tmpdir(), 'rasid-exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const timestamp = Date.now();
    let filePath: string;

    switch (format) {
      case 'jsonl': {
        filePath = path.join(exportDir, `dataset-${datasetId}-${timestamp}.jsonl`);
        const lines = samples.map((s: Record<string, unknown>) =>
          JSON.stringify({
            messages: [
              { role: 'system', content: 'You are a helpful assistant trained on domain-specific data.' },
              { role: 'user', content: s.input },
              { role: 'assistant', content: s.expectedOutput },
            ],
          }),
        );
        fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
        break;
      }

      case 'csv': {
        filePath = path.join(exportDir, `dataset-${datasetId}-${timestamp}.csv`);
        const header = 'id,input,expected_output,quality,tags,is_augmented,split';
        const rows = samples.map((s: Record<string, unknown>) => {
          const escapeCsv = (val: string): string => `"${val.replace(/"/g, '""')}"`;
          return [
            s.id,
            escapeCsv(s.input as string),
            escapeCsv(s.expectedOutput as string),
            s.quality,
            escapeCsv((s.tags as string[]).join(';')),
            s.isAugmented,
            s.split || '',
          ].join(',');
        });
        fs.writeFileSync(filePath, [header, ...rows].join('\n'), 'utf-8');
        break;
      }

      case 'parquet': {
        // For Parquet, export as JSON with parquet-compatible schema metadata
        filePath = path.join(exportDir, `dataset-${datasetId}-${timestamp}.parquet.json`);
        const parquetData = {
          schema: {
            fields: [
              { name: 'id', type: 'STRING' },
              { name: 'input', type: 'STRING' },
              { name: 'expected_output', type: 'STRING' },
              { name: 'quality', type: 'FLOAT' },
              { name: 'is_augmented', type: 'BOOLEAN' },
              { name: 'split', type: 'STRING' },
            ],
          },
          data: samples.map((s: Record<string, unknown>) => ({
            id: s.id,
            input: s.input,
            expected_output: s.expectedOutput,
            quality: s.quality,
            is_augmented: s.isAugmented,
            split: s.split || '',
          })),
        };
        fs.writeFileSync(filePath, JSON.stringify(parquetData, null, 2), 'utf-8');
        break;
      }

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    logger.info('Dataset exported', { datasetId, format, filePath, sampleCount: samples.length });

    return { filePath, format, sampleCount: samples.length };
  }

  // ── Private Helpers ──────────────────────────────────────────────

  private computeSampleQuality(input: string, output: string): number {
    let score = 0.5;

    // Length-based scoring
    if (input.length >= 20 && input.length <= 10000) score += 0.1;
    if (output.length >= 10 && output.length <= 10000) score += 0.1;

    // Input/output ratio
    const ratio = output.length / Math.max(1, input.length);
    if (ratio >= 0.2 && ratio <= 5.0) score += 0.1;

    // Non-empty and meaningful
    if (input.trim().split(/\s+/).length >= 3) score += 0.1;
    if (output.trim().split(/\s+/).length >= 2) score += 0.1;

    return Math.min(1.0, Math.round(score * 100) / 100);
  }

  private seededShuffle(arr: number[], seed: number): void {
    let currentSeed = seed;

    const nextRandom = (): number => {
      currentSeed = (currentSeed * 16807) % 2147483647;
      return (currentSeed - 1) / 2147483646;
    };

    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(nextRandom() * (i + 1));
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
  }

  private toDatasetRecord(record: Record<string, unknown>): DatasetRecord {
    return {
      id: record.id as string,
      name: record.name as string,
      description: (record.description as string) || '',
      tenantId: record.tenantId as string,
      userId: record.userId as string,
      language: (record.language as string) || 'ar',
      taskType: record.taskType as string,
      tags: (record.tags as string[]) || [],
      version: (record.version as number) || 1,
      sampleCount: (record.sampleCount as number) || 0,
      status: (record.status as string) || 'draft',
      createdAt: record.createdAt as Date,
      updatedAt: record.updatedAt as Date,
    };
  }

  private toSampleRecord(record: Record<string, unknown>): DatasetSample {
    return {
      id: record.id as string,
      datasetId: record.datasetId as string,
      input: record.input as string,
      expectedOutput: record.expectedOutput as string,
      metadata: (record.metadata as Record<string, unknown>) || {},
      quality: (record.quality as number) || 0.5,
      tags: (record.tags as string[]) || [],
      isAugmented: (record.isAugmented as boolean) || false,
      split: (record.split as string) || null,
      createdAt: record.createdAt as Date,
    };
  }
}
