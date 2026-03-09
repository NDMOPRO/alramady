import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const MODEL = 'infographicProfessional';
const CACHE_PREFIX = 'professional';

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  count(args: Record<string, unknown>): Promise<number>;
}

const model = (prisma as unknown as Record<string, PrismaDelegate>)[MODEL];
const templateModel = (prisma as unknown as Record<string, PrismaDelegate>).infographicTemplate;

interface PaginatedResult {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId: string;
  infographicType?: string;
  search?: string;
  isPublic?: boolean;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', userId, infographicType, search, isPublic } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = { userId };
  if (infographicType) where.infographicType = infographicType;
  if (search) where.title = { contains: search, mode: 'insensitive' };
  if (isPublic !== undefined) where.isPublic = isPublic;

  const [data, total] = await Promise.all([
    model.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    model.count({ where }),
  ]);

  const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  await cacheSet(cacheKey, result, 300);
  logger.info('Professional infographic list fetched', { userId, total });
  return result;
}

export async function getById(id: string, userId: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await model.findUnique({ where: { id } });
  if (!record || (record.userId !== userId && !record.isPublic)) throw new NotFoundError('Infographic');

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>, userId: string) {
  const record = await model.create({ data: { ...data, userId, status: 'draft' } });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Professional infographic created', { id: record.id, userId, type: data.infographicType });
  return record;
}

export async function update(id: string, data: Record<string, unknown>, userId: string) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Infographic');

  const record = await model.update({ where: { id }, data });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Professional infographic updated', { id, userId });
  return record;
}

export async function remove(id: string, userId: string) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Infographic');

  await model.delete({ where: { id } });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Professional infographic deleted', { id, userId });
  return { success: true };
}

export async function duplicate(id: string, userId: string) {
  const original = await getById(id, userId);
  const { id: _id, createdAt: _c, updatedAt: _u, ...duplicateData } = original;
  const record = await model.create({
    data: { ...duplicateData, title: `${original.title} (Copy)`, userId, status: 'draft' },
  });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Infographic duplicated', { originalId: id, newId: record.id });
  return record;
}

export async function exportInfographic(id: string, format: string, userId: string) {
  const record = await getById(id, userId);
  const { exportToImage, exportToPDF } = await import('./infographic-builder.service.js');

  let exportResult: { buffer?: Buffer; mimeType?: string; url?: string };
  if (format === 'pdf') {
    exportResult = await exportToPDF(id);
  } else {
    const resolution = format === 'png' ? 2 : 1;
    exportResult = await exportToImage(id, format as 'png' | 'jpeg' | 'webp', resolution);
  }

  await model.update({
    where: { id },
    data: { lastExportedAt: new Date(), lastExportFormat: format },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);

  logger.info('Infographic exported', { id, format });
  return { infographicId: id, format, status: 'completed', url: exportResult.url, mimeType: exportResult.mimeType };
}

export async function generateFromData(data: Record<string, unknown>, userId: string) {
  logger.info('AI infographic generation from data', { userId, dataSourceType: (data.dataSource as Record<string, unknown>)?.type });
  const record = await model.create({
    data: { ...data, userId, status: 'processing' },
  });
  await cacheDel(`${CACHE_PREFIX}:list:*`);

  const { generateFromData: aiGenerate } = await import('./ai-infographic.service.js');
  const datasetId = (data.dataSource as Record<string, unknown>)?.datasetId as string;
  const style = (data.style as string) || 'modern';

  if (datasetId) {
    const generated = await aiGenerate(datasetId, style, '', userId);
    await model.update({
      where: { id: record.id },
      data: { status: 'completed', elementsJson: generated, completedAt: new Date() },
    });
    await cacheDel(`${CACHE_PREFIX}:${record.id}`);
  }

  logger.info('Infographic generation completed', { id: record.id, userId });
  return { id: record.id, status: 'completed', userId };
}

export async function applyTemplate(id: string, templateId: string, userId: string) {
  const record = await getById(id, userId);

  const template = await templateModel.findUnique({ where: { id: templateId } });
  if (!template) throw new NotFoundError('Infographic template');

  const templateConfig = template.configJson || {};
  await model.update({
    where: { id },
    data: {
      templateId,
      elementsJson: templateConfig.elements || record.elementsJson,
      styleJson: { ...record.styleJson, ...templateConfig.style },
    },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);

  logger.info('Template applied to infographic', { id, templateId });
  return { infographicId: id, templateId, status: 'applied' };
}

export async function getTemplates(category?: string) {
  const cacheKey = `${CACHE_PREFIX}:templates:${category || 'all'}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = { isActive: true };
  if (category && category !== 'all') where.category = category;

  const templates = await templateModel.findMany({
    where,
    orderBy: { usageCount: 'desc' },
    take: 50,
  });

  const result = { templates, category: category || 'all', count: templates.length };
  await cacheSet(cacheKey, result, 1800);
  return result;
}

export async function addSection(id: string, section: Record<string, unknown>, userId: string) {
  const record = await getById(id, userId);
  const { addSection: builderAddSection } = await import('./infographic-builder.service.js');
  const result = await builderAddSection(id, section.type as 'header' | 'stats' | 'timeline' | 'comparison' | 'flowchart' | 'text', section.content || {}, section.position as Record<string, unknown>);

  await cacheDel(`${CACHE_PREFIX}:${id}`);
  logger.info('Section added to infographic', { id, sectionType: section.type });
  return { infographicId: id, section: result, status: 'added' };
}

export async function updateSection(id: string, sectionIndex: number, section: Record<string, unknown>, userId: string) {
  const record = await getById(id, userId);
  const elements = Array.isArray(record.elementsJson) ? [...record.elementsJson] : [];

  if (sectionIndex < 0 || sectionIndex >= elements.length) {
    throw new NotFoundError('Section at index ' + sectionIndex);
  }

  elements[sectionIndex] = { ...elements[sectionIndex], ...section };
  await model.update({
    where: { id },
    data: { elementsJson: elements },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  logger.info('Section updated in infographic', { id, sectionIndex });
  return { infographicId: id, sectionIndex, status: 'updated' };
}

export async function removeSection(id: string, sectionIndex: number, userId: string) {
  const record = await getById(id, userId);
  const elements = Array.isArray(record.elementsJson) ? [...record.elementsJson] : [];

  if (sectionIndex < 0 || sectionIndex >= elements.length) {
    throw new NotFoundError('Section at index ' + sectionIndex);
  }

  elements.splice(sectionIndex, 1);
  await model.update({
    where: { id },
    data: { elementsJson: elements },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  logger.info('Section removed from infographic', { id, sectionIndex });
  return { infographicId: id, sectionIndex, status: 'removed' };
}

export async function reorderSections(id: string, order: number[], userId: string) {
  const record = await getById(id, userId);
  const elements = Array.isArray(record.elementsJson) ? [...record.elementsJson] : [];

  const reordered = order.map(idx => {
    if (idx < 0 || idx >= elements.length) throw new NotFoundError('Section at index ' + idx);
    return elements[idx];
  });

  await model.update({
    where: { id },
    data: { elementsJson: reordered },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  logger.info('Sections reordered in infographic', { id, newOrder: order });
  return { infographicId: id, order, status: 'reordered' };
}

export async function analyzeData(id: string, userId: string) {
  const record = await getById(id, userId);
  const { DataVizEngineService } = await import('./data-viz-engine.service.js');
  const vizEngine = new DataVizEngineService(prisma as unknown as ConstructorParameters<typeof DataVizEngineService>[0]);

  const elements = Array.isArray(record.elementsJson) ? record.elementsJson : [];
  const dataPoints = elements.reduce((sum: number, el: Record<string, unknown>) => {
    const data = el.data as unknown[] | undefined;
    return sum + (Array.isArray(data) ? data.length : 0);
  }, 0);

  const { suggestStyle } = await import('./ai-infographic.service.js');
  const contentSummary = elements.map((el: Record<string, unknown>) => el.type || '').join(', ');
  const styleRecommendation = await suggestStyle(contentSummary || record.title || '');

  const suggestedCharts = ['bar', 'line', 'pie', 'donut'].filter(() => dataPoints > 0);

  return {
    infographicId: id,
    analysis: {
      dataPoints,
      suggestedCharts,
      insights: styleRecommendation ? [styleRecommendation] : [],
      elementCount: elements.length,
    },
  };
}
