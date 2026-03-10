import OpenAI from 'openai';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { v4 as uuidv4 } from 'uuid';

// ─── Schemas ──────────────────────────────────────────────────────────

const ListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().optional(),
});

const CreateSchema = z.object({
  fileId: z.string().uuid(),
  name: z.string().min(1).max(500),
  content: z.string().min(1),
  mimeType: z.string().optional(),
  createdBy: z.string().uuid().optional(),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const AnalyzeSchema = z.object({
  fileId: z.string().uuid(),
  content: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().optional(),
});

const ExtractSchema = z.object({
  fileId: z.string().uuid(),
  content: z.string().min(1),
  fields: z.array(z.string()).optional(),
});

// ─── Interfaces ───────────────────────────────────────────────────────

interface FileProfile {
  fileId: string;
  contentType: string;
  domain: string;
  language: string;
  summary: string;
  keyTopics: string[];
  columns: ColumnProfile[];
  relationships: RelationshipHint[];
  suggestedActions: string[];
  qualityIssues: string[];
  confidence: number;
}

interface ColumnProfile {
  name: string;
  dataType: string;
  semanticType: string;
  nullRate: number;
  uniqueRate: number;
  sampleValues: string[];
}

interface RelationshipHint {
  sourceColumn: string;
  targetColumn: string;
  targetFile: string;
  relationshipType: string;
  confidence: number;
}

// ─── OpenAI Client ────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ─── CRUD Functions ───────────────────────────────────────────────────

export async function list(params: Record<string, unknown>) {
  const validated = ListParamsSchema.parse(params);
  const skip = (validated.page - 1) * validated.limit;

  const where: Record<string, unknown> = {};
  if (validated.search) {
    where.OR = [
      { name: { contains: validated.search, mode: 'insensitive' } },
      { contentType: { contains: validated.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.fileUnderstanding.findMany({
      where,
      skip,
      take: validated.limit,
      orderBy: { [validated.sortBy]: validated.sortOrder },
    }),
    prisma.fileUnderstanding.count({ where }),
  ]);

  return { data, total, page: validated.page, limit: validated.limit };
}

export async function getById(id: string) {
  const idSchema = z.string().uuid();
  const validId = idSchema.parse(id);

  const cached = await cacheGet<Record<string, unknown>>(`file-understanding:${validId}`);
  if (cached) return cached;

  const record = await prisma.fileUnderstanding.findUniqueOrThrow({ where: { id: validId } });
  await cacheSet(`file-understanding:${validId}`, record, 600);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const validated = CreateSchema.parse(data);
  const id = uuidv4();

  const record = await prisma.fileUnderstanding.create({
    data: {
      id,
      fileId: validated.fileId,
      name: validated.name,
      content: validated.content.substring(0, 50000),
      mimeType: validated.mimeType || 'application/octet-stream',
      status: 'pending',
      createdBy: validated.createdBy || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info('File understanding record created', { id, fileId: validated.fileId });
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const validId = z.string().uuid().parse(id);
  const validated = UpdateSchema.parse(data);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (validated.name !== undefined) updateData.name = validated.name;
  if (validated.status !== undefined) updateData.status = validated.status;
  if (validated.metadata !== undefined) updateData.metadata = validated.metadata;

  const record = await prisma.fileUnderstanding.update({
    where: { id: validId },
    data: updateData as unknown as Record<string, unknown>,
  });

  await cacheDel(`file-understanding:${validId}`);
  logger.info('File understanding record updated', { id: validId });
  return record;
}

export async function remove(id: string) {
  const validId = z.string().uuid().parse(id);

  await prisma.fileUnderstanding.delete({ where: { id: validId } });
  await cacheDel(`file-understanding:${validId}`);

  logger.info('File understanding record deleted', { id: validId });
  return { deleted: true, id: validId };
}

// ─── AI Analysis ──────────────────────────────────────────────────────

export async function analyze(body: Record<string, unknown>): Promise<FileProfile> {
  const validated = AnalyzeSchema.parse(body);
  const startTime = Date.now();
  const queryId = uuidv4();

  logger.info('Starting file analysis', { queryId, fileId: validated.fileId, filename: validated.filename });

  const truncatedContent = validated.content.length > 12000
    ? validated.content.substring(0, 8400) + '\n\n[...truncated...]\n\n' + validated.content.slice(-3600)
    : validated.content;

  const systemPrompt = `You are an expert data analyst for the RASID platform. Analyze the uploaded file content and build an intelligent profile.

Return a JSON object:
{
  "contentType": "<tabular|text|financial|invoice|contract|report|spreadsheet|presentation|image_text|mixed>",
  "domain": "<financial|hr|sales|marketing|operations|legal|technical|academic|government|general>",
  "language": "<ar|en|mixed>",
  "summary": "<2-4 sentence summary in the same language as the content>",
  "keyTopics": ["<topic1>", "<topic2>", ...],
  "columns": [
    {
      "name": "<column name>",
      "dataType": "<string|number|date|currency|percentage|boolean|mixed>",
      "semanticType": "<revenue|cost|quantity|name|date|id|category|metric|address|phone|email|other>",
      "nullRate": <0-1>,
      "uniqueRate": <0-1>,
      "sampleValues": ["<val1>", "<val2>", "<val3>"]
    }
  ],
  "relationships": [
    {
      "sourceColumn": "<col>",
      "targetColumn": "<potential matching col in another file>",
      "targetFile": "<inferred file type>",
      "relationshipType": "<foreign_key|semantic_match|temporal_join|lookup>",
      "confidence": <0-1>
    }
  ],
  "suggestedActions": ["<action1>", "<action2>"],
  "qualityIssues": ["<issue1>", "<issue2>"],
  "confidence": <0-1>
}

Be thorough. If the content is Arabic, respond with Arabic text in summary, topics, and actions. Detect tabular data columns if present. Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Filename: ${validated.filename}\nMIME: ${validated.mimeType || 'unknown'}\n\nContent:\n${truncatedContent}` },
    ],
    temperature: 0.15,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenAI returned empty response for file analysis');
  }

  const parsed = JSON.parse(raw);
  const durationMs = Date.now() - startTime;
  const totalTokens = response.usage?.total_tokens || 0;

  const profile: FileProfile = {
    fileId: validated.fileId,
    contentType: String(parsed.contentType || 'mixed'),
    domain: String(parsed.domain || 'general'),
    language: String(parsed.language || 'en'),
    summary: String(parsed.summary || ''),
    keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics.map(String) : [],
    columns: Array.isArray(parsed.columns)
      ? parsed.columns.map((c: Record<string, unknown>) => ({
          name: String(c.name || ''),
          dataType: String(c.dataType || 'string'),
          semanticType: String(c.semanticType || 'other'),
          nullRate: typeof c.nullRate === 'number' ? c.nullRate : 0,
          uniqueRate: typeof c.uniqueRate === 'number' ? c.uniqueRate : 0,
          sampleValues: Array.isArray(c.sampleValues) ? c.sampleValues.map(String).slice(0, 5) : [],
        }))
      : [],
    relationships: Array.isArray(parsed.relationships)
      ? parsed.relationships.map((r: Record<string, unknown>) => ({
          sourceColumn: String(r.sourceColumn || ''),
          targetColumn: String(r.targetColumn || ''),
          targetFile: String(r.targetFile || ''),
          relationshipType: String(r.relationshipType || 'semantic_match'),
          confidence: typeof r.confidence === 'number' ? r.confidence : 0.5,
        }))
      : [],
    suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions.map(String) : [],
    qualityIssues: Array.isArray(parsed.qualityIssues) ? parsed.qualityIssues.map(String) : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
  };

  await prisma.fileUnderstanding.upsert({
    where: { id: validated.fileId },
    create: {
      id: validated.fileId,
      fileId: validated.fileId,
      name: validated.filename,
      content: validated.content.substring(0, 50000),
      mimeType: validated.mimeType || 'application/octet-stream',
      contentType: profile.contentType,
      domain: profile.domain,
      language: profile.language,
      summary: profile.summary,
      keyTopics: JSON.stringify(profile.keyTopics),
      columns: JSON.stringify(profile.columns),
      relationships: JSON.stringify(profile.relationships),
      suggestedActions: JSON.stringify(profile.suggestedActions),
      qualityIssues: JSON.stringify(profile.qualityIssues),
      confidence: profile.confidence,
      status: 'COMPLETED',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      contentType: profile.contentType,
      domain: profile.domain,
      language: profile.language,
      summary: profile.summary,
      keyTopics: JSON.stringify(profile.keyTopics),
      columns: JSON.stringify(profile.columns),
      relationships: JSON.stringify(profile.relationships),
      suggestedActions: JSON.stringify(profile.suggestedActions),
      qualityIssues: JSON.stringify(profile.qualityIssues),
      confidence: profile.confidence,
      status: 'COMPLETED',
      updatedAt: new Date(),
    },
  });

  await prisma.aiQuery.create({
    data: {
      id: queryId,
      queryType: 'file_understanding',
      inputText: `File: ${validated.filename}`,
      outputText: raw.substring(0, 5000),
      model: DEFAULT_MODEL,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens,
      durationMs,
      status: 'COMPLETED',
      createdAt: new Date(),
    },
  });

  logger.info('File analysis complete', { queryId, fileId: validated.fileId, domain: profile.domain, durationMs, totalTokens });
  return profile;
}

// ─── AI Extraction ────────────────────────────────────────────────────

export async function extract(body: Record<string, unknown>) {
  const validated = ExtractSchema.parse(body);
  const startTime = Date.now();

  logger.info('Starting file extraction', { fileId: validated.fileId });

  const truncatedContent = validated.content.length > 10000
    ? validated.content.substring(0, 7000) + '\n\n[...truncated...]\n\n' + validated.content.slice(-3000)
    : validated.content;

  const fieldPrompt = validated.fields && validated.fields.length > 0
    ? `Extract these specific fields: ${validated.fields.join(', ')}.`
    : 'Extract all key fields including names, dates, amounts, addresses, identifiers, and line items.';

  const systemPrompt = `You are a document extraction expert for the RASID platform. ${fieldPrompt}
Return a JSON object:
{
  "fields": [
    { "name": "<field name>", "value": "<extracted value>", "type": "<text|number|date|currency|email|phone|address|percentage>", "confidence": <0-1> }
  ],
  "tables": [
    { "title": "<table title>", "headers": ["<col1>", ...], "rows": [["<val>", ...], ...] }
  ],
  "entities": [
    { "text": "<entity>", "type": "<person|organization|location|date|money|product>", "confidence": <0-1> }
  ]
}
Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: truncatedContent },
    ],
    temperature: 0.1,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenAI returned empty response for file extraction');
  }

  const parsed = JSON.parse(raw);
  const durationMs = Date.now() - startTime;

  const result = {
    fileId: validated.fileId,
    fields: Array.isArray(parsed.fields) ? parsed.fields : [],
    tables: Array.isArray(parsed.tables) ? parsed.tables : [],
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    processingMs: durationMs,
  };

  logger.info('File extraction complete', {
    fileId: validated.fileId,
    fieldCount: result.fields.length,
    tableCount: result.tables.length,
    entityCount: result.entities.length,
    durationMs,
  });

  return result;
}

// ─── Supported Formats ────────────────────────────────────────────────

export async function getSupportedFormats() {
  return {
    documents: ['pdf', 'docx', 'doc', 'txt', 'rtf', 'odt'],
    spreadsheets: ['xlsx', 'xls', 'csv', 'tsv', 'ods'],
    presentations: ['pptx', 'ppt', 'odp'],
    images: ['png', 'jpg', 'jpeg', 'tiff', 'bmp', 'webp'],
    data: ['json', 'xml', 'yaml', 'parquet'],
    archives: ['zip'],
    maxFileSizeMB: 100,
    maxBatchSize: 20,
  };
}
