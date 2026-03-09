import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<unknown[]>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  count(args: Record<string, unknown>): Promise<number>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<unknown>;
}

const MODEL = 'presentationSmartDesign';
const CACHE_PREFIX = 'smart-design';

function getModel(): PrismaDelegate {
  return (prisma as unknown as Record<string, PrismaDelegate>)[MODEL];
}

function getModelByName(name: string): PrismaDelegate {
  return (prisma as unknown as Record<string, PrismaDelegate>)[name];
}

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId: string;
  designMode?: string;
  search?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', userId, designMode, search } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<{ data: unknown[]; total: number; page: number; limit: number; totalPages: number }>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = { userId };
  if (designMode) where.designMode = designMode;
  if (search) where.name = { contains: search, mode: 'insensitive' };

  const [data, total] = await Promise.all([
    getModel().findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    getModel().count({ where }),
  ]);

  const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  await cacheSet(cacheKey, result, 300);
  logger.info('Smart-design list fetched', { userId, total });
  return result;
}

export async function getById(id: string, userId: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await getModel().findUnique({ where: { id } });
  if (!record || record.userId !== userId) throw new NotFoundError('Smart-design');

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>, userId: string) {
  const record = await getModel().create({ data: { ...data, userId } });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Smart-design created', { id: record.id, userId });
  return record;
}

export async function update(id: string, data: Record<string, unknown>, userId: string) {
  const existing = await getModel().findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Smart-design');

  const record = await getModel().update({ where: { id }, data });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Smart-design updated', { id, userId });
  return record;
}

export async function remove(id: string, userId: string) {
  const existing = await getModel().findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Smart-design');

  await getModel().delete({ where: { id } });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Smart-design deleted', { id, userId });
  return { success: true };
}

export async function applyDesign(presentationId: string, designId: string, userId: string) {
  const design = await getById(designId, userId);
  const { applyBranding } = await import('./design-engine.service.js');

  const colors = (design.colors || {}) as Record<string, string>;
  const fonts = (design.fonts || {}) as Record<string, string>;
  const brandConfig = {
    logo: (design.logo || Buffer.alloc(0)) as Buffer,
    primaryColor: colors.primary || '#000000',
    secondaryColor: colors.secondary || '#666666',
    fontFamily: fonts.heading || fonts.body || 'Arial',
  };
  const result = await applyBranding(presentationId, brandConfig);

  logger.info('Design applied to presentation', { presentationId, designId, slidesUpdated: result.slidesUpdated });
  return { status: 'applied', presentationId, designId, designMode: design.designMode, slidesUpdated: result.slidesUpdated };
}

export async function suggestDesigns(presentationId: string, userId: string) {
  logger.info('Design suggestions requested', { presentationId });
  const { generateColorPalette } = await import('./design-engine.service.js');

  const presentation = await getModelByName('presentation').findUnique({
    where: { id: presentationId },
    include: { slides: true },
  });

  if (!presentation) throw new NotFoundError('Presentation');

  const baseColors = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#5f6368'];
  const suggestions = baseColors.map((color, idx) => {
    const palette = generateColorPalette(color, 5);
    return {
      id: `suggestion-${idx}`,
      name: `Style ${idx + 1}`,
      palette,
      preview: { primaryColor: color, accentColors: palette.slice(1) },
    };
  });

  return { presentationId, suggestions, count: suggestions.length };
}

export async function analyzeBrand(brandGuideId: string, userId: string) {
  logger.info('Brand analysis triggered', { brandGuideId });

  const brandGuide = await getModelByName('brandGuide').findUnique({ where: { id: brandGuideId } }).catch(() => null);
  if (!brandGuide) throw new NotFoundError('Brand guide');

  const { generateColorPalette } = await import('./design-engine.service.js');
  const palette = brandGuide.primaryColor
    ? generateColorPalette(brandGuide.primaryColor, 8)
    : [];

  return {
    brandGuideId,
    palette,
    fonts: brandGuide.fonts || [],
    guidelines: {
      primaryColor: brandGuide.primaryColor,
      secondaryColor: brandGuide.secondaryColor,
      logo: brandGuide.logoUrl,
      fontFamily: brandGuide.fontFamily,
    },
  };
}
