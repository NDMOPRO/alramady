import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'classification';
const CACHE_TTL = 300;
const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

const DOMAIN_CATEGORIES = [
  'financial',
  'hr',
  'sales',
  'marketing',
  'operations',
  'logistics',
  'healthcare',
  'education',
  'government',
  'legal',
  'general',
] as const;

type DomainCategory = (typeof DOMAIN_CATEGORIES)[number];

// ─── Zod Schemas ────────────────────────────────────────────────

const ClassifyDatasetInputSchema = z.object({
  datasetId: z.string().uuid('datasetId must be a valid UUID'),
  tenantId: z.string().uuid('tenantId must be a valid UUID'),
});

const ClassifyFileInputSchema = z.object({
  fileName: z.string().min(1, 'fileName is required'),
  columnNames: z.array(z.string()).min(1, 'at least one column name is required'),
  sampleRows: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, 'at least one sample row is required')
    .max(100, 'at most 100 sample rows allowed'),
});

// ─── AI Response Schema ──────────────────────────────────────────

const AiClassificationResponseSchema = z.object({
  domain: z.enum(DOMAIN_CATEGORIES),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedSchema: z.object({
    primaryEntity: z.string(),
    keyColumns: z.array(
      z.object({
        name: z.string(),
        inferredType: z.string(),
        semanticRole: z.string(),
      })
    ),
    suggestedIndexes: z.array(z.string()),
    dataCharacteristics: z.array(z.string()),
  }),
  alternativeDomains: z.array(
    z.object({
      domain: z.enum(DOMAIN_CATEGORIES),
      confidence: z.number().min(0).max(1),
    })
  ),
});

type AiClassificationResponse = z.infer<typeof AiClassificationResponseSchema>;

// ─── Public Result Types ─────────────────────────────────────────

export interface ClassificationResult {
  domain: DomainCategory;
  confidence: number;
  reasoning: string;
  suggestedSchema: AiClassificationResponse['suggestedSchema'];
  alternativeDomains: AiClassificationResponse['alternativeDomains'];
  aiModel: string;
}

export interface DatasetClassificationResult extends ClassificationResult {
  classificationId: string;
  datasetId: string;
}

// ─── List params ─────────────────────────────────────────────────

export interface ListClassificationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  fileType?: string;
  classifiedType?: string;
}

// ─── OpenAI Client ───────────────────────────────────────────────

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

// ─── Core AI Classification Logic ───────────────────────────────

async function callOpenAIClassification(
  fileName: string,
  columnNames: string[],
  sampleRows: Record<string, unknown>[]
): Promise<AiClassificationResponse> {
  const openai = getOpenAIClient();

  const columnSample = columnNames.slice(0, 50);
  const rowSample = sampleRows.slice(0, 20);

  const sampleDataText = rowSample
    .map((row, idx) => {
      const entries = Object.entries(row)
        .slice(0, 20)
        .map(([k, v]) => `${k}: ${String(v ?? '').substring(0, 100)}`)
        .join(', ');
      return `Row ${idx + 1}: { ${entries} }`;
    })
    .join('\n');

  const systemPrompt = `You are a data classification expert for enterprise data platforms. Your task is to analyze dataset metadata and sample data to determine the business domain it belongs to.

You MUST return a JSON object with EXACTLY this structure (no markdown fences, no extra text):
{
  "domain": "<one of: ${DOMAIN_CATEGORIES.join(', ')}>",
  "confidence": <float 0.0-1.0>,
  "reasoning": "<clear explanation of why this domain was chosen, referencing specific column names or values>",
  "suggestedSchema": {
    "primaryEntity": "<the main business entity this dataset represents, e.g. 'Employee', 'Invoice', 'Order'>",
    "keyColumns": [
      { "name": "<column name>", "inferredType": "<data type: string|number|date|boolean|currency|percentage|id|email|phone|address>", "semanticRole": "<business meaning, e.g. 'primary key', 'employee name', 'transaction amount'>" }
    ],
    "suggestedIndexes": ["<column names that should be indexed for query performance>"],
    "dataCharacteristics": ["<observable characteristics like 'contains PII', 'time series data', 'financial amounts', 'categorical labels'>"]
  },
  "alternativeDomains": [
    { "domain": "<domain>", "confidence": <float 0.0-1.0> }
  ]
}

Domain definitions:
- financial: banking, accounting, invoices, expenses, budgets, P&L, balance sheets, transactions
- hr: employees, payroll, recruitment, performance reviews, leave, attendance, org structure
- sales: orders, customers, revenue, pipeline, CRM, deals, quotes, commissions
- marketing: campaigns, leads, ads, clicks, conversions, channels, content performance
- operations: processes, projects, tasks, KPIs, inventory, production, maintenance
- logistics: shipments, tracking, warehousing, fleet, routes, delivery, supply chain
- healthcare: patients, diagnoses, medications, appointments, lab results, clinical data
- education: students, courses, grades, enrollment, curriculum, assessments
- government: public services, regulations, permits, census, elections, public finance
- legal: contracts, cases, compliance, regulations, litigation, IP rights
- general: does not clearly fit any specific domain above

Include 2-4 alternative domains in alternativeDomains (can be empty array if very certain). Return ONLY valid JSON.`;

  const userContent = `File name: "${fileName}"

Columns (${columnSample.length}): ${columnSample.join(', ')}

Sample data (${rowSample.length} rows):
${sampleDataText}

Classify this dataset into the most appropriate business domain.`;

  logger.info('Calling OpenAI for dataset classification', {
    fileName,
    columnCount: columnNames.length,
    sampleRowCount: sampleRows.length,
    model: AI_MODEL,
  });

  const startTime = Date.now();

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const durationMs = Date.now() - startTime;
  const rawContent = response.choices[0]?.message?.content;

  if (!rawContent) {
    throw new Error('OpenAI returned empty response for classification');
  }

  logger.info('OpenAI classification response received', {
    durationMs,
    tokensUsed: response.usage?.total_tokens ?? 0,
    fileName,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`Failed to parse OpenAI JSON response: ${rawContent.substring(0, 200)}`);
  }

  const validated = AiClassificationResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `OpenAI response did not match expected schema: ${validated.error.message}`
    );
  }

  return validated.data;
}

// ─── ClassificationService ───────────────────────────────────────

export class ClassificationService {
  // ── CRUD: list ─────────────────────────────────────────────────

  async list(params: ListClassificationParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, fileType, classifiedType } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.FileClassificationWhereInput = {};
    if (search) {
      where.OR = [
        { fileName: { contains: search, mode: 'insensitive' } },
        { classifiedType: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (fileType) where.fileType = fileType;
    if (classifiedType) where.classifiedType = classifiedType;

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const [data, total] = await Promise.all([
      prisma.fileClassification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.fileClassification.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  // ── CRUD: getById ──────────────────────────────────────────────

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const classification = await prisma.fileClassification.findUnique({ where: { id } });
    if (!classification) throw new NotFoundError('FileClassification', id);

    await cacheSet(cacheKey, classification, CACHE_TTL);
    return classification;
  }

  // ── CRUD: create ───────────────────────────────────────────────

  async create(data: {
    fileName: string;
    fileType: string;
    fileSize: number;
    mimeType?: string;
    classifiedType: string;
    confidence: number;
    aiModel?: string;
    suggestedSchema?: Prisma.InputJsonValue;
    detectedEncoding?: string;
    detectedDelimiter?: string;
    previewData?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    const classification = await prisma.fileClassification.create({
      data: {
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: BigInt(data.fileSize),
        mimeType: data.mimeType,
        classifiedType: data.classifiedType,
        confidence: data.confidence,
        aiModel: data.aiModel,
        suggestedSchema: data.suggestedSchema || undefined,
        detectedEncoding: data.detectedEncoding,
        detectedDelimiter: data.detectedDelimiter,
        previewData: data.previewData || undefined,
        metadata: data.metadata || undefined,
      },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return classification;
  }

  // ── CRUD: update ───────────────────────────────────────────────

  async update(
    id: string,
    data: {
      classifiedType?: string;
      confidence?: number;
      aiModel?: string;
      suggestedSchema?: Prisma.InputJsonValue;
      detectedEncoding?: string;
      detectedDelimiter?: string;
      previewData?: Prisma.InputJsonValue;
      metadata?: Prisma.InputJsonValue;
    }
  ) {
    await this.getById(id);

    const updateData: Record<string, unknown> = {};
    if (data.classifiedType !== undefined) updateData.classifiedType = data.classifiedType;
    if (data.confidence !== undefined) updateData.confidence = data.confidence;
    if (data.aiModel !== undefined) updateData.aiModel = data.aiModel;
    if (data.suggestedSchema !== undefined) updateData.suggestedSchema = data.suggestedSchema;
    if (data.detectedEncoding !== undefined) updateData.detectedEncoding = data.detectedEncoding;
    if (data.detectedDelimiter !== undefined) updateData.detectedDelimiter = data.detectedDelimiter;
    if (data.previewData !== undefined) updateData.previewData = data.previewData;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const updated = await prisma.fileClassification.update({
      where: { id },
      data: updateData,
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);
    return updated;
  }

  // ── CRUD: delete ───────────────────────────────────────────────

  async delete(id: string) {
    await this.getById(id);
    await prisma.fileClassification.delete({ where: { id } });
    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);
    return { deleted: true };
  }

  // ── AI: classifyDataset ────────────────────────────────────────

  /**
   * Loads the first 100 rows of a dataset from Prisma, calls GPT-4o to classify
   * the dataset domain, and stores the result as a FileClassification record.
   *
   * @param datasetId - UUID of the dataset to classify
   * @param tenantId  - UUID of the owning tenant (used for access scoping)
   * @returns Classification result with confidence score, suggested schema, and the stored record ID
   */
  async classifyDataset(datasetId: string, tenantId: string): Promise<DatasetClassificationResult> {
    const validated = ClassifyDatasetInputSchema.parse({ datasetId, tenantId });

    logger.info('classifyDataset called', { datasetId: validated.datasetId, tenantId: validated.tenantId });

    // 1. Load the dataset record to get name, format, and column metadata
    const dataset = await prisma.dataset.findFirst({
      where: { id: validated.datasetId, tenantId: validated.tenantId },
      include: {
        columns: {
          orderBy: { displayOrder: 'asc' },
          select: { name: true, dataType: true, inferredType: true },
        },
      },
    });

    if (!dataset) {
      throw new NotFoundError('Dataset', validated.datasetId);
    }

    // 2. Load the first 100 data rows
    const dataRows = await prisma.dataRow.findMany({
      where: { datasetId: validated.datasetId },
      orderBy: { rowIndex: 'asc' },
      take: 100,
      select: { data: true },
    });

    // 3. Extract column names — prefer schema columns, fall back to keys from first row
    let columnNames: string[] = dataset.columns.map((c) => c.name);

    if (columnNames.length === 0 && dataRows.length > 0) {
      const firstRow = dataRows[0].data;
      if (firstRow !== null && typeof firstRow === 'object' && !Array.isArray(firstRow)) {
        columnNames = Object.keys(firstRow as Record<string, unknown>);
      }
    }

    // 4. Convert DataRow.data (Json) to plain Record<string, unknown>[]
    const sampleRows: Record<string, unknown>[] = dataRows
      .map((row) => {
        const d = row.data;
        if (d !== null && typeof d === 'object' && !Array.isArray(d)) {
          return d as Record<string, unknown>;
        }
        return null;
      })
      .filter((r): r is Record<string, unknown> => r !== null);

    if (columnNames.length === 0) {
      throw new Error(
        `Dataset ${validated.datasetId} has no columns and no data rows — cannot classify`
      );
    }

    // 5. Call GPT-4o
    const aiResult = await callOpenAIClassification(dataset.name, columnNames, sampleRows);

    // 6. Persist as a FileClassification record (reuse existing CRUD)
    const fileName = dataset.name;
    const fileType = dataset.format ?? 'unknown';
    const fileSize = dataset.sizeBytes !== null ? Number(dataset.sizeBytes) : 0;

    const stored = await this.create({
      fileName,
      fileType,
      fileSize,
      classifiedType: aiResult.domain,
      confidence: aiResult.confidence,
      aiModel: AI_MODEL,
      suggestedSchema: aiResult.suggestedSchema as Prisma.InputJsonValue,
      previewData: sampleRows.slice(0, 5) as unknown as Prisma.InputJsonValue,
      metadata: {
        reasoning: aiResult.reasoning,
        alternativeDomains: aiResult.alternativeDomains,
        datasetId: validated.datasetId,
        tenantId: validated.tenantId,
        columnCount: columnNames.length,
        rowsSampled: sampleRows.length,
      } as Prisma.InputJsonValue,
    });

    // 7. Optionally update the dataset's category field to reflect classification
    await prisma.dataset.update({
      where: { id: validated.datasetId },
      data: { category: aiResult.domain },
    });

    logger.info('Dataset classified successfully', {
      datasetId: validated.datasetId,
      domain: aiResult.domain,
      confidence: aiResult.confidence,
      classificationId: stored.id,
    });

    return {
      classificationId: stored.id,
      datasetId: validated.datasetId,
      domain: aiResult.domain as DomainCategory,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
      suggestedSchema: aiResult.suggestedSchema,
      alternativeDomains: aiResult.alternativeDomains,
      aiModel: AI_MODEL,
    };
  }

  // ── AI: classifyFile ───────────────────────────────────────────

  /**
   * Classifies a file based on its name, column headers, and sample row data.
   * Does NOT persist to the database — returns the raw classification result.
   * Callers can persist using `create()` if desired.
   *
   * @param fileName    - Original file name (used as a classification signal)
   * @param columnNames - Array of column header strings
   * @param sampleRows  - Up to 100 sample rows as key-value maps
   * @returns Classification result with domain, confidence, and suggested schema
   */
  async classifyFile(
    fileName: string,
    columnNames: string[],
    sampleRows: Record<string, unknown>[]
  ): Promise<ClassificationResult> {
    const validated = ClassifyFileInputSchema.parse({ fileName, columnNames, sampleRows });

    logger.info('classifyFile called', {
      fileName: validated.fileName,
      columnCount: validated.columnNames.length,
      sampleRowCount: validated.sampleRows.length,
    });

    const aiResult = await callOpenAIClassification(
      validated.fileName,
      validated.columnNames,
      validated.sampleRows
    );

    logger.info('File classified successfully', {
      fileName: validated.fileName,
      domain: aiResult.domain,
      confidence: aiResult.confidence,
    });

    return {
      domain: aiResult.domain as DomainCategory,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
      suggestedSchema: aiResult.suggestedSchema,
      alternativeDomains: aiResult.alternativeDomains,
      aiModel: AI_MODEL,
    };
  }
}

export const classificationService = new ClassificationService();
