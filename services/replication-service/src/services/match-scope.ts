import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { z } from 'zod';
import * as crypto from 'crypto';

// ─── Zod Schemas ────────────────────────────────────────────────────

const DocumentFormatSchema = z.enum(['word', 'pdf', 'excel', 'pptx', 'infographic', 'dashboard', 'image']);

const MatchScopeRequestSchema = z.object({
  documentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  sourceFormat: DocumentFormatSchema,
  targetFormat: DocumentFormatSchema,
  matchMode: z.enum(['STRICT', 'PROFESSIONAL', 'HYBRID']).default('STRICT'),
});

const ScopeCapabilitySchema = z.object({
  format: DocumentFormatSchema,
  supportedOperations: z.array(z.string()),
  maxFileSize: z.number().positive(),
  pixelMatchSupported: z.boolean(),
  structuralMatchSupported: z.boolean(),
  contentMatchSupported: z.boolean(),
});

// ─── Interfaces ─────────────────────────────────────────────────────

interface FormatCapabilities {
  format: z.infer<typeof DocumentFormatSchema>;
  supportedConversions: z.infer<typeof DocumentFormatSchema>[];
  matchFeatures: MatchFeatureSet;
  renderingOptions: RenderingOptions;
}

interface MatchFeatureSet {
  pixelLevelMatch: boolean;
  structuralFingerprint: boolean;
  fontPreservation: boolean;
  colorExactMatch: boolean;
  layoutGridMatch: boolean;
  chartDataMatch: boolean;
  tableGeometryMatch: boolean;
  headerFooterMatch: boolean;
  pageBreakMatch: boolean;
  marginMatch: boolean;
  embeddedObjectMatch: boolean;
}

interface RenderingOptions {
  defaultDpi: number;
  maxDpi: number;
  supportedColorSpaces: string[];
  fontEmbedding: boolean;
  vectorPreservation: boolean;
}

interface ScopeAnalysisResult {
  id: string;
  documentId: string;
  detectedFormat: z.infer<typeof DocumentFormatSchema>;
  fileSize: number;
  pageCount: number;
  elementCount: number;
  containsCharts: boolean;
  containsTables: boolean;
  containsImages: boolean;
  containsFormulas: boolean;
  fontList: string[];
  colorPalette: string[];
  complexityScore: number;
  estimatedMatchDifficulty: 'low' | 'medium' | 'high' | 'extreme';
  recommendedMatchMode: 'STRICT' | 'PROFESSIONAL' | 'HYBRID';
  capabilities: FormatCapabilities;
  warnings: string[];
  analyzedAt: Date;
}

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  scopeType?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── Format Capability Registry ─────────────────────────────────────

const FORMAT_CAPABILITIES: Record<string, FormatCapabilities> = {
  word: {
    format: 'word',
    supportedConversions: ['pdf', 'word', 'image'],
    matchFeatures: {
      pixelLevelMatch: true,
      structuralFingerprint: true,
      fontPreservation: true,
      colorExactMatch: true,
      layoutGridMatch: true,
      chartDataMatch: true,
      tableGeometryMatch: true,
      headerFooterMatch: true,
      pageBreakMatch: true,
      marginMatch: true,
      embeddedObjectMatch: true,
    },
    renderingOptions: {
      defaultDpi: 150,
      maxDpi: 600,
      supportedColorSpaces: ['sRGB', 'CMYK'],
      fontEmbedding: true,
      vectorPreservation: true,
    },
  },
  pdf: {
    format: 'pdf',
    supportedConversions: ['pdf', 'image', 'word'],
    matchFeatures: {
      pixelLevelMatch: true,
      structuralFingerprint: true,
      fontPreservation: true,
      colorExactMatch: true,
      layoutGridMatch: true,
      chartDataMatch: false,
      tableGeometryMatch: true,
      headerFooterMatch: true,
      pageBreakMatch: true,
      marginMatch: true,
      embeddedObjectMatch: true,
    },
    renderingOptions: {
      defaultDpi: 150,
      maxDpi: 1200,
      supportedColorSpaces: ['sRGB', 'CMYK', 'Lab'],
      fontEmbedding: true,
      vectorPreservation: true,
    },
  },
  excel: {
    format: 'excel',
    supportedConversions: ['excel', 'pdf', 'image', 'dashboard'],
    matchFeatures: {
      pixelLevelMatch: true,
      structuralFingerprint: true,
      fontPreservation: true,
      colorExactMatch: true,
      layoutGridMatch: true,
      chartDataMatch: true,
      tableGeometryMatch: true,
      headerFooterMatch: true,
      pageBreakMatch: true,
      marginMatch: true,
      embeddedObjectMatch: true,
    },
    renderingOptions: {
      defaultDpi: 150,
      maxDpi: 600,
      supportedColorSpaces: ['sRGB'],
      fontEmbedding: true,
      vectorPreservation: false,
    },
  },
  pptx: {
    format: 'pptx',
    supportedConversions: ['pptx', 'pdf', 'image', 'infographic'],
    matchFeatures: {
      pixelLevelMatch: true,
      structuralFingerprint: true,
      fontPreservation: true,
      colorExactMatch: true,
      layoutGridMatch: true,
      chartDataMatch: true,
      tableGeometryMatch: true,
      headerFooterMatch: false,
      pageBreakMatch: false,
      marginMatch: true,
      embeddedObjectMatch: true,
    },
    renderingOptions: {
      defaultDpi: 150,
      maxDpi: 600,
      supportedColorSpaces: ['sRGB'],
      fontEmbedding: true,
      vectorPreservation: true,
    },
  },
  infographic: {
    format: 'infographic',
    supportedConversions: ['image', 'pdf', 'pptx'],
    matchFeatures: {
      pixelLevelMatch: true,
      structuralFingerprint: true,
      fontPreservation: true,
      colorExactMatch: true,
      layoutGridMatch: true,
      chartDataMatch: true,
      tableGeometryMatch: false,
      headerFooterMatch: false,
      pageBreakMatch: false,
      marginMatch: true,
      embeddedObjectMatch: true,
    },
    renderingOptions: {
      defaultDpi: 300,
      maxDpi: 600,
      supportedColorSpaces: ['sRGB'],
      fontEmbedding: true,
      vectorPreservation: true,
    },
  },
  dashboard: {
    format: 'dashboard',
    supportedConversions: ['dashboard', 'pdf', 'image', 'pptx'],
    matchFeatures: {
      pixelLevelMatch: true,
      structuralFingerprint: true,
      fontPreservation: true,
      colorExactMatch: true,
      layoutGridMatch: true,
      chartDataMatch: true,
      tableGeometryMatch: true,
      headerFooterMatch: false,
      pageBreakMatch: false,
      marginMatch: true,
      embeddedObjectMatch: true,
    },
    renderingOptions: {
      defaultDpi: 150,
      maxDpi: 300,
      supportedColorSpaces: ['sRGB'],
      fontEmbedding: true,
      vectorPreservation: false,
    },
  },
  image: {
    format: 'image',
    supportedConversions: ['image', 'pdf'],
    matchFeatures: {
      pixelLevelMatch: true,
      structuralFingerprint: true,
      fontPreservation: false,
      colorExactMatch: true,
      layoutGridMatch: true,
      chartDataMatch: false,
      tableGeometryMatch: false,
      headerFooterMatch: false,
      pageBreakMatch: false,
      marginMatch: false,
      embeddedObjectMatch: false,
    },
    renderingOptions: {
      defaultDpi: 300,
      maxDpi: 1200,
      supportedColorSpaces: ['sRGB'],
      fontEmbedding: false,
      vectorPreservation: false,
    },
  },
};

// ─── CRUD Operations ────────────────────────────────────────────────

const MODEL = 'matchScope';
const CACHE_PREFIX = 'match-scope';

export async function list(params: ListParams) {
  const { page = 1, limit = 20, search, scopeType, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {};
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (scopeType) where.scopeType = scopeType;
  if (isActive !== undefined) where.isActive = isActive;

  const [data, total] = await Promise.all([
    (prisma[MODEL as keyof typeof prisma] as unknown as Record<string, Function>).findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    (prisma[MODEL as keyof typeof prisma] as unknown as Record<string, Function>).count({ where }),
  ]);

  const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  await cacheSet(cacheKey, result, 300);
  logger.info('Listed match-scopes', { total, page });
  return result;
}

export async function getById(id: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const record = await (prisma[MODEL as keyof typeof prisma] as unknown as Record<string, Function>).findUnique({ where: { id } });
  if (!record) throw new NotFoundError('MatchScope', id);

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await (prisma[MODEL as keyof typeof prisma] as unknown as Record<string, Function>).create({ data });
  await cacheDel(`${CACHE_PREFIX}:list`);
  logger.info('Created match-scope', { id: record.id });
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const existing = await (prisma[MODEL as keyof typeof prisma] as unknown as Record<string, Function>).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('MatchScope', id);

  const record = await (prisma[MODEL as keyof typeof prisma] as unknown as Record<string, Function>).update({ where: { id }, data });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Updated match-scope', { id });
  return record;
}

export async function remove(id: string) {
  const existing = await (prisma[MODEL as keyof typeof prisma] as unknown as Record<string, Function>).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('MatchScope', id);

  await (prisma[MODEL as keyof typeof prisma] as unknown as Record<string, Function>).delete({ where: { id } });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Deleted match-scope', { id });
  return { success: true };
}

// ─── Scope Analysis Engine ──────────────────────────────────────────

export function getFormatCapabilities(format: z.infer<typeof DocumentFormatSchema>): FormatCapabilities {
  const capabilities = FORMAT_CAPABILITIES[format];
  if (!capabilities) {
    throw new Error(`Unsupported format: ${format}`);
  }
  return capabilities;
}

export function isConversionSupported(
  sourceFormat: z.infer<typeof DocumentFormatSchema>,
  targetFormat: z.infer<typeof DocumentFormatSchema>,
): boolean {
  const capabilities = FORMAT_CAPABILITIES[sourceFormat];
  if (!capabilities) return false;
  return capabilities.supportedConversions.includes(targetFormat);
}

export async function analyzeDocumentScope(
  input: z.infer<typeof MatchScopeRequestSchema>,
): Promise<ScopeAnalysisResult> {
  const validated = MatchScopeRequestSchema.parse(input);

  const document = await prisma.document.findUnique({
    where: { id: validated.documentId },
    include: {
      pages: true,
    },
  });

  if (!document) {
    throw new Error(`Document not found: ${validated.documentId}`);
  }

  const capabilities = getFormatCapabilities(validated.sourceFormat);

  // Analyze document content
  const pages = document.pages || [];
  const pageCount = pages.length;
  let totalElements = 0;
  let hasCharts = false;
  let hasTables = false;
  let hasImages = false;
  let hasFormulas = false;
  const fontSet = new Set<string>();
  const colorSet = new Set<string>();

  for (const page of pages) {
    const elements = ((page as Record<string, unknown>).elements as Array<Record<string, unknown>>) || [];
    totalElements += elements.length;

    for (const el of elements) {
      const elType = el.type as string;
      if (elType === 'chart') hasCharts = true;
      if (elType === 'table') hasTables = true;
      if (elType === 'image') hasImages = true;
      if (elType === 'formula') hasFormulas = true;

      const style = el.style as Record<string, unknown> | undefined;
      if (style?.fontFamily) fontSet.add(String(style.fontFamily));
      if (style?.color) colorSet.add(String(style.color));
    }
  }

  // Calculate complexity score (0-100)
  let complexity = 0;
  complexity += Math.min(30, pageCount * 3);           // Pages contribute up to 30
  complexity += Math.min(20, totalElements * 0.5);       // Elements contribute up to 20
  complexity += hasCharts ? 15 : 0;                       // Charts add 15
  complexity += hasTables ? 10 : 0;                       // Tables add 10
  complexity += hasFormulas ? 10 : 0;                     // Formulas add 10
  complexity += Math.min(10, fontSet.size * 2);           // Font variety up to 10
  complexity += hasImages ? 5 : 0;                        // Images add 5
  complexity = Math.min(100, complexity);

  // Determine difficulty
  let estimatedMatchDifficulty: ScopeAnalysisResult['estimatedMatchDifficulty'];
  if (complexity <= 25) estimatedMatchDifficulty = 'low';
  else if (complexity <= 50) estimatedMatchDifficulty = 'medium';
  else if (complexity <= 75) estimatedMatchDifficulty = 'high';
  else estimatedMatchDifficulty = 'extreme';

  // Recommend match mode
  let recommendedMatchMode: ScopeAnalysisResult['recommendedMatchMode'];
  if (estimatedMatchDifficulty === 'extreme') recommendedMatchMode = 'HYBRID';
  else if (estimatedMatchDifficulty === 'high') recommendedMatchMode = 'PROFESSIONAL';
  else recommendedMatchMode = 'STRICT';

  // Generate warnings
  const warnings: string[] = [];
  if (!isConversionSupported(validated.sourceFormat, validated.targetFormat)) {
    warnings.push(`Conversion from ${validated.sourceFormat} to ${validated.targetFormat} is not natively supported`);
  }
  if (fontSet.size > 10) {
    warnings.push(`Document uses ${fontSet.size} different fonts. Font embedding may be required.`);
  }
  if (totalElements > 500) {
    warnings.push(`High element count (${totalElements}). Processing may take longer.`);
  }
  if (hasFormulas && validated.targetFormat !== 'excel') {
    warnings.push('Document contains formulas. Target format may not preserve formula logic.');
  }
  if (validated.matchMode === 'STRICT' && estimatedMatchDifficulty === 'extreme') {
    warnings.push('STRICT mode requested for extremely complex document. Consider PROFESSIONAL mode.');
  }

  const analysisResult: ScopeAnalysisResult = {
    id: crypto.randomUUID(),
    documentId: validated.documentId,
    detectedFormat: validated.sourceFormat,
    fileSize: (document as Record<string, unknown>).fileSize as number || 0,
    pageCount,
    elementCount: totalElements,
    containsCharts: hasCharts,
    containsTables: hasTables,
    containsImages: hasImages,
    containsFormulas: hasFormulas,
    fontList: Array.from(fontSet),
    colorPalette: Array.from(colorSet),
    complexityScore: Math.round(complexity * 100) / 100,
    estimatedMatchDifficulty,
    recommendedMatchMode,
    capabilities,
    warnings,
    analyzedAt: new Date(),
  };

  // Persist scope analysis
  await (prisma.scopeAnalysis as unknown as { create: (args: Record<string, unknown>) => Promise<unknown> }).create({
    data: {
      id: analysisResult.id,
      documentId: analysisResult.documentId,
      tenantId: validated.tenantId,
      sourceFormat: validated.sourceFormat,
      targetFormat: validated.targetFormat,
      detectedFormat: analysisResult.detectedFormat,
      fileSize: analysisResult.fileSize,
      pageCount: analysisResult.pageCount,
      elementCount: analysisResult.elementCount,
      containsCharts: analysisResult.containsCharts,
      containsTables: analysisResult.containsTables,
      containsImages: analysisResult.containsImages,
      containsFormulas: analysisResult.containsFormulas,
      fontList: analysisResult.fontList,
      colorPalette: analysisResult.colorPalette,
      complexityScore: analysisResult.complexityScore,
      estimatedMatchDifficulty: analysisResult.estimatedMatchDifficulty,
      recommendedMatchMode: analysisResult.recommendedMatchMode,
      warnings: analysisResult.warnings,
      analyzedAt: analysisResult.analyzedAt,
    },
  });

  logger.info('Analyzed document scope', {
    documentId: validated.documentId,
    format: validated.sourceFormat,
    complexity: analysisResult.complexityScore,
    difficulty: analysisResult.estimatedMatchDifficulty,
  });

  return analysisResult;
}

export function getSupportedFormats(): Array<{
  format: string;
  label: string;
  conversions: string[];
  features: string[];
}> {
  return Object.entries(FORMAT_CAPABILITIES).map(([format, caps]) => ({
    format,
    label: format.charAt(0).toUpperCase() + format.slice(1),
    conversions: caps.supportedConversions,
    features: Object.entries(caps.matchFeatures)
      .filter(([, supported]) => supported)
      .map(([feature]) => feature),
  }));
}
