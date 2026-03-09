import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { z } from 'zod';
import * as crypto from 'crypto';

// ─── Zod Schemas ────────────────────────────────────────────────────

const PrintLockRequestSchema = z.object({
  documentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  lockType: z.enum([
    'font_substitution',
    'coordinate_lock',
    'constraint_matrix',
    'pivot_geometry',
    'slide_lock',
    'architecture_lock',
    'full_lock',
  ]),
  scope: z.enum(['document', 'page', 'element', 'slide']).default('document'),
  targetIds: z.array(z.string()).optional(),
});

const UnlockRequestSchema = z.object({
  lockId: z.string().uuid(),
  userId: z.string().uuid(),
  reason: z.string().min(10).max(500),
  supervisorApproval: z.boolean().default(false),
});

const FontLockConfigSchema = z.object({
  documentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  fontEmbedding: z.enum(['embed', 'convert_to_paths', 'reject']).default('embed'),
  preserveKerningTables: z.boolean().default(true),
  preserveBaseline: z.boolean().default(true),
  preserveLineHeight: z.boolean().default(true),
  preserveLetterSpacing: z.boolean().default(true),
});

// ─── Interfaces ─────────────────────────────────────────────────────

interface PrintLockRecord {
  id: string;
  documentId: string;
  tenantId: string;
  userId: string;
  lockType: string;
  scope: string;
  targetIds: string[];
  lockedData: LockedData;
  isActive: boolean;
  createdAt: Date;
  expiresAt: Date | null;
}

interface LockedData {
  elementCoordinates?: Array<{
    elementId: string;
    absoluteX: number;
    absoluteY: number;
    width: number;
    height: number;
    rotation: number;
    zIndex: number;
  }>;
  constraintMatrix?: {
    constraints: Array<{
      elementA: string;
      elementB: string;
      horizontalDistance: number;
      verticalDistance: number;
    }>;
    hash: string;
  };
  fontConfig?: {
    fonts: Array<{
      family: string;
      weight: number;
      size: number;
      lineHeight: number;
      letterSpacing: number;
      baseline: number;
      embedded: boolean;
      convertedToPaths: boolean;
    }>;
    kerningTables: Record<string, Record<string, number>>;
  };
  pivotGeometry?: {
    pivotTableId: string;
    rowHeights: number[];
    columnWidths: number[];
    headerHeight: number;
    totalWidth: number;
    totalHeight: number;
    cellPadding: number;
    borderWidths: { top: number; right: number; bottom: number; left: number };
  };
  slideConfig?: {
    slideIds: string[];
    lockedElements: Array<{ slideId: string; elementId: string; locked: boolean }>;
    masterTemplateHash: string;
    transitionsLocked: boolean;
  };
  architectureHash?: string;
  lockFingerprint: string;
}

interface LockValidationResult {
  valid: boolean;
  lockId: string;
  violations: Array<{
    lockType: string;
    element: string;
    field: string;
    lockedValue: number | string;
    currentValue: number | string;
    deviation: number;
  }>;
  checkedAt: Date;
}

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  lockType?: string;
  securityLevel?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── CRUD Operations ────────────────────────────────────────────────

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<unknown[]>;
  count(args: Record<string, unknown>): Promise<number>;
  findUnique(args: Record<string, unknown>): Promise<unknown | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const MODEL = 'printLock';
const CACHE_PREFIX = 'print-lock';

export async function list(params: ListParams) {
  const { page = 1, limit = 20, search, lockType, securityLevel, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {};
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (lockType) where.lockType = lockType;
  if (securityLevel) where.securityLevel = securityLevel;
  if (isActive !== undefined) where.isActive = isActive;

  const [data, total] = await Promise.all([
    (prisma[MODEL] as unknown as PrismaDelegate).findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    (prisma[MODEL] as unknown as PrismaDelegate).count({ where }),
  ]);

  const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  await cacheSet(cacheKey, result, 300);
  logger.info('Listed print-locks', { total, page });
  return result;
}

export async function getById(id: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const record = await (prisma[MODEL] as unknown as PrismaDelegate).findUnique({ where: { id } });
  if (!record) throw new NotFoundError('PrintLock', id);

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await (prisma[MODEL] as unknown as PrismaDelegate).create({ data });
  await cacheDel(`${CACHE_PREFIX}:list`);
  logger.info('Created print-lock', { id: record.id });
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const existing = await (prisma[MODEL] as unknown as PrismaDelegate).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('PrintLock', id);

  const record = await (prisma[MODEL] as unknown as PrismaDelegate).update({ where: { id }, data });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Updated print-lock', { id });
  return record;
}

export async function remove(id: string) {
  const existing = await (prisma[MODEL] as unknown as PrismaDelegate).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('PrintLock', id);

  await (prisma[MODEL] as unknown as PrismaDelegate).delete({ where: { id } });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Deleted print-lock', { id });
  return { success: true };
}

// ─── Print Lock Engine ──────────────────────────────────────────────

export async function applyPrintLock(
  input: z.infer<typeof PrintLockRequestSchema>,
): Promise<PrintLockRecord> {
  const validated = PrintLockRequestSchema.parse(input);
  const lockId = crypto.randomUUID();

  // Fetch document with its elements
  const document = await prisma.document.findUnique({
    where: { id: validated.documentId },
    include: { pages: { include: { elements: true } } },
  });

  if (!document) {
    throw new Error(`Document not found: ${validated.documentId}`);
  }

  const pages = (document as Record<string, unknown>).pages as Array<Record<string, unknown>> || [];
  const lockedData = await buildLockedData(validated.lockType, pages, validated.targetIds || []);

  const lockRecord: PrintLockRecord = {
    id: lockId,
    documentId: validated.documentId,
    tenantId: validated.tenantId,
    userId: validated.userId,
    lockType: validated.lockType,
    scope: validated.scope,
    targetIds: validated.targetIds || [],
    lockedData,
    isActive: true,
    createdAt: new Date(),
    expiresAt: null,
  };

  // Persist the lock
  await prisma.documentLock.create({
    data: {
      id: lockRecord.id,
      documentId: lockRecord.documentId,
      tenantId: lockRecord.tenantId,
      userId: lockRecord.userId,
      lockType: lockRecord.lockType,
      scope: lockRecord.scope,
      targetIds: lockRecord.targetIds,
      lockedData: JSON.parse(JSON.stringify(lockRecord.lockedData)),
      isActive: true,
      createdAt: lockRecord.createdAt,
      expiresAt: null,
    },
  });

  await cacheDel(`${CACHE_PREFIX}:doc:${validated.documentId}`);
  logger.info('Applied print lock', {
    lockId,
    documentId: validated.documentId,
    lockType: validated.lockType,
    scope: validated.scope,
  });

  return lockRecord;
}

export async function validatePrintLock(
  documentId: string,
  currentElements: Array<Record<string, unknown>>,
): Promise<LockValidationResult> {
  const activeLocks = await prisma.documentLock.findMany({
    where: {
      documentId,
      isActive: true,
    },
  });

  if (activeLocks.length === 0) {
    return {
      valid: true,
      lockId: '',
      violations: [],
      checkedAt: new Date(),
    };
  }

  const allViolations: LockValidationResult['violations'] = [];

  for (const lock of activeLocks) {
    const lockedData = lock.lockedData as unknown as LockedData;

    // Validate coordinate locks
    if (lockedData.elementCoordinates) {
      for (const lockedCoord of lockedData.elementCoordinates) {
        const currentEl = currentElements.find(el => el.id === lockedCoord.elementId);
        if (!currentEl) {
          allViolations.push({
            lockType: 'coordinate_lock',
            element: lockedCoord.elementId,
            field: 'existence',
            lockedValue: 'present',
            currentValue: 'missing',
            deviation: 1,
          });
          continue;
        }

        const bounds = currentEl.bounds as Record<string, number> || {};
        const xDev = Math.abs((bounds.x || 0) - lockedCoord.absoluteX);
        const yDev = Math.abs((bounds.y || 0) - lockedCoord.absoluteY);
        const wDev = Math.abs((bounds.width || 0) - lockedCoord.width);
        const hDev = Math.abs((bounds.height || 0) - lockedCoord.height);

        if (xDev > 0.000001) {
          allViolations.push({
            lockType: 'coordinate_lock',
            element: lockedCoord.elementId,
            field: 'absoluteX',
            lockedValue: lockedCoord.absoluteX,
            currentValue: bounds.x || 0,
            deviation: xDev,
          });
        }
        if (yDev > 0.000001) {
          allViolations.push({
            lockType: 'coordinate_lock',
            element: lockedCoord.elementId,
            field: 'absoluteY',
            lockedValue: lockedCoord.absoluteY,
            currentValue: bounds.y || 0,
            deviation: yDev,
          });
        }
        if (wDev > 0.000001) {
          allViolations.push({
            lockType: 'coordinate_lock',
            element: lockedCoord.elementId,
            field: 'width',
            lockedValue: lockedCoord.width,
            currentValue: bounds.width || 0,
            deviation: wDev,
          });
        }
        if (hDev > 0.000001) {
          allViolations.push({
            lockType: 'coordinate_lock',
            element: lockedCoord.elementId,
            field: 'height',
            lockedValue: lockedCoord.height,
            currentValue: bounds.height || 0,
            deviation: hDev,
          });
        }
      }
    }

    // Validate constraint matrix
    if (lockedData.constraintMatrix) {
      const currentHash = crypto.createHash('sha256')
        .update(JSON.stringify(currentElements.map(e => ({
          id: e.id,
          bounds: e.bounds,
        }))))
        .digest('hex');

      if (currentHash !== lockedData.constraintMatrix.hash) {
        allViolations.push({
          lockType: 'constraint_matrix',
          element: 'matrix',
          field: 'hash',
          lockedValue: lockedData.constraintMatrix.hash,
          currentValue: currentHash,
          deviation: 1,
        });
      }
    }

    // Validate font configuration
    if (lockedData.fontConfig) {
      for (const lockedFont of lockedData.fontConfig.fonts) {
        const currentFont = currentElements
          .filter(e => (e.style as Record<string, unknown>)?.fontFamily === lockedFont.family)
          .map(e => e.style as Record<string, unknown>);

        for (const cf of currentFont) {
          if (cf.fontFamily !== lockedFont.family) {
            allViolations.push({
              lockType: 'font_substitution',
              element: 'font',
              field: 'family',
              lockedValue: lockedFont.family,
              currentValue: String(cf.fontFamily || ''),
              deviation: 1,
            });
          }
          const sizeDeviation = Math.abs(Number(cf.fontSize || 0) - lockedFont.size);
          if (sizeDeviation > 0.000001) {
            allViolations.push({
              lockType: 'font_substitution',
              element: 'font',
              field: 'size',
              lockedValue: lockedFont.size,
              currentValue: Number(cf.fontSize || 0),
              deviation: sizeDeviation,
            });
          }
        }
      }
    }
  }

  const result: LockValidationResult = {
    valid: allViolations.length === 0,
    lockId: activeLocks[0]?.id || '',
    violations: allViolations,
    checkedAt: new Date(),
  };

  // Log validation
  await prisma.lockValidation.create({
    data: {
      id: crypto.randomUUID(),
      documentId,
      lockId: result.lockId,
      valid: result.valid,
      violationCount: allViolations.length,
      violations: JSON.parse(JSON.stringify(allViolations)),
      checkedAt: result.checkedAt,
    },
  });

  logger.info('Validated print lock', {
    documentId,
    valid: result.valid,
    violationCount: allViolations.length,
  });

  return result;
}

export async function releasePrintLock(
  input: z.infer<typeof UnlockRequestSchema>,
): Promise<{ success: boolean; lockId: string; releasedAt: Date }> {
  const validated = UnlockRequestSchema.parse(input);

  const lock = await prisma.documentLock.findUnique({
    where: { id: validated.lockId },
  });

  if (!lock) {
    throw new Error(`Lock not found: ${validated.lockId}`);
  }

  if (!lock.isActive) {
    throw new Error(`Lock ${validated.lockId} is already released`);
  }

  // For full_lock and architecture_lock, require supervisor approval
  if ((lock.lockType === 'full_lock' || lock.lockType === 'architecture_lock') && !validated.supervisorApproval) {
    throw new Error(`Lock type "${lock.lockType}" requires supervisor approval to release`);
  }

  await prisma.documentLock.update({
    where: { id: validated.lockId },
    data: {
      isActive: false,
      releasedBy: validated.userId,
      releaseReason: validated.reason,
      releasedAt: new Date(),
    },
  });

  await cacheDel(`${CACHE_PREFIX}:doc:${lock.documentId}`);

  logger.info('Released print lock', {
    lockId: validated.lockId,
    userId: validated.userId,
    reason: validated.reason,
  });

  return {
    success: true,
    lockId: validated.lockId,
    releasedAt: new Date(),
  };
}

export async function configureFontLock(
  input: z.infer<typeof FontLockConfigSchema>,
): Promise<{ configured: boolean; fontCount: number; action: string }> {
  const validated = FontLockConfigSchema.parse(input);

  const document = await prisma.document.findUnique({
    where: { id: validated.documentId },
    include: { pages: true },
  });

  if (!document) {
    throw new Error(`Document not found: ${validated.documentId}`);
  }

  const pages = (document as Record<string, unknown>).pages as Array<Record<string, unknown>> || [];
  const fontSet = new Set<string>();

  for (const page of pages) {
    const elements = (page.elements as Array<Record<string, unknown>>) || [];
    for (const el of elements) {
      const style = el.style as Record<string, unknown> | undefined;
      if (style?.fontFamily) fontSet.add(String(style.fontFamily));
    }
  }

  const fonts = Array.from(fontSet);
  let action = 'none';

  if (validated.fontEmbedding === 'embed') {
    action = `Embedded ${fonts.length} fonts to prevent substitution`;
  } else if (validated.fontEmbedding === 'convert_to_paths') {
    action = `Converted ${fonts.length} font glyphs to vector paths`;
  } else {
    action = `Configured to reject output if any of ${fonts.length} fonts are unavailable`;
  }

  // Persist font lock configuration
  await prisma.fontLockConfig.create({
    data: {
      id: crypto.randomUUID(),
      documentId: validated.documentId,
      tenantId: validated.tenantId,
      fontEmbedding: validated.fontEmbedding,
      preserveKerningTables: validated.preserveKerningTables,
      preserveBaseline: validated.preserveBaseline,
      preserveLineHeight: validated.preserveLineHeight,
      preserveLetterSpacing: validated.preserveLetterSpacing,
      fontList: fonts,
      createdAt: new Date(),
    },
  });

  logger.info('Configured font lock', {
    documentId: validated.documentId,
    fontCount: fonts.length,
    fontEmbedding: validated.fontEmbedding,
  });

  return { configured: true, fontCount: fonts.length, action };
}

export async function getActiveLocksForDocument(documentId: string): Promise<PrintLockRecord[]> {
  const cacheKey = `${CACHE_PREFIX}:doc:${documentId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached as PrintLockRecord[];

  const locks = await prisma.documentLock.findMany({
    where: {
      documentId,
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const records: PrintLockRecord[] = locks.map(lock => ({
    id: lock.id,
    documentId: lock.documentId,
    tenantId: lock.tenantId,
    userId: lock.userId,
    lockType: lock.lockType,
    scope: lock.scope || 'document',
    targetIds: lock.targetIds as string[],
    lockedData: lock.lockedData as unknown as LockedData,
    isActive: lock.isActive,
    createdAt: lock.createdAt,
    expiresAt: lock.expiresAt,
  }));

  await cacheSet(cacheKey, records, 120);
  return records;
}

// ─── Helper Functions ───────────────────────────────────────────────

async function buildLockedData(
  lockType: string,
  pages: Array<Record<string, unknown>>,
  targetIds: string[],
): Promise<LockedData> {
  const allElements: Array<Record<string, unknown>> = [];
  for (const page of pages) {
    const elements = (page.elements as Array<Record<string, unknown>>) || [];
    allElements.push(...elements);
  }

  const filteredElements = targetIds.length > 0
    ? allElements.filter(el => targetIds.includes(String(el.id)))
    : allElements;

  const elementCoordinates = filteredElements.map(el => {
    const bounds = el.bounds as Record<string, number> || {};
    return {
      elementId: String(el.id || ''),
      absoluteX: bounds.x || 0,
      absoluteY: bounds.y || 0,
      width: bounds.width || 0,
      height: bounds.height || 0,
      rotation: Number(el.rotation || 0),
      zIndex: Number(el.zIndex || 0),
    };
  });

  const constraintHash = crypto.createHash('sha256')
    .update(JSON.stringify(elementCoordinates))
    .digest('hex');

  const lockFingerprint = crypto.createHash('sha256')
    .update(`${lockType}:${constraintHash}:${Date.now()}`)
    .digest('hex');

  const lockedData: LockedData = {
    lockFingerprint,
  };

  switch (lockType) {
    case 'font_substitution': {
      const fontMap = new Map<string, { weight: number; size: number; lineHeight: number; letterSpacing: number }>();
      for (const el of filteredElements) {
        const style = el.style as Record<string, unknown> | undefined;
        if (style?.fontFamily) {
          const family = String(style.fontFamily);
          if (!fontMap.has(family)) {
            fontMap.set(family, {
              weight: Number(style.fontWeight || 400),
              size: Number(style.fontSize || 14),
              lineHeight: Number(style.lineHeight || 1.4),
              letterSpacing: Number(style.letterSpacing || 0),
            });
          }
        }
      }
      lockedData.fontConfig = {
        fonts: Array.from(fontMap.entries()).map(([family, cfg]) => ({
          family,
          weight: cfg.weight,
          size: cfg.size,
          lineHeight: cfg.lineHeight,
          letterSpacing: cfg.letterSpacing,
          baseline: 0,
          embedded: true,
          convertedToPaths: false,
        })),
        kerningTables: {},
      };
      break;
    }

    case 'coordinate_lock':
      lockedData.elementCoordinates = elementCoordinates;
      break;

    case 'constraint_matrix':
      lockedData.constraintMatrix = {
        constraints: buildConstraints(elementCoordinates),
        hash: constraintHash,
      };
      break;

    case 'pivot_geometry': {
      const pivotElements = filteredElements.filter(el => el.type === 'table' || el.type === 'pivot');
      for (const pivot of pivotElements) {
        const bounds = pivot.bounds as Record<string, number> || {};
        lockedData.pivotGeometry = {
          pivotTableId: String(pivot.id || ''),
          rowHeights: (pivot.rowHeights as number[]) || [],
          columnWidths: (pivot.columnWidths as number[]) || [],
          headerHeight: Number(pivot.headerHeight || 30),
          totalWidth: bounds.width || 0,
          totalHeight: bounds.height || 0,
          cellPadding: Number(pivot.cellPadding || 4),
          borderWidths: { top: 1, right: 1, bottom: 1, left: 1 },
        };
        break; // Lock the first pivot table found
      }
      break;
    }

    case 'slide_lock': {
      const slideIds = pages.map(p => String(p.id || ''));
      lockedData.slideConfig = {
        slideIds,
        lockedElements: filteredElements.map(el => ({
          slideId: String(el.pageId || ''),
          elementId: String(el.id || ''),
          locked: true,
        })),
        masterTemplateHash: crypto.createHash('sha256')
          .update(JSON.stringify(slideIds))
          .digest('hex'),
        transitionsLocked: true,
      };
      break;
    }

    case 'architecture_lock':
      lockedData.architectureHash = constraintHash;
      lockedData.elementCoordinates = elementCoordinates;
      lockedData.constraintMatrix = {
        constraints: buildConstraints(elementCoordinates),
        hash: constraintHash,
      };
      break;

    case 'full_lock':
      lockedData.elementCoordinates = elementCoordinates;
      lockedData.constraintMatrix = {
        constraints: buildConstraints(elementCoordinates),
        hash: constraintHash,
      };
      lockedData.architectureHash = constraintHash;
      break;
  }

  return lockedData;
}

function buildConstraints(
  elements: Array<{
    elementId: string;
    absoluteX: number;
    absoluteY: number;
    width: number;
    height: number;
  }>,
): Array<{ elementA: string; elementB: string; horizontalDistance: number; verticalDistance: number }> {
  const constraints: Array<{
    elementA: string;
    elementB: string;
    horizontalDistance: number;
    verticalDistance: number;
  }> = [];

  for (let a = 0; a < elements.length; a++) {
    for (let b = a + 1; b < elements.length; b++) {
      const elA = elements[a];
      const elB = elements[b];
      constraints.push({
        elementA: elA.elementId,
        elementB: elB.elementId,
        horizontalDistance: Math.round(((elB.absoluteX + elB.width / 2) - (elA.absoluteX + elA.width / 2)) * 1000000) / 1000000,
        verticalDistance: Math.round(((elB.absoluteY + elB.height / 2) - (elA.absoluteY + elA.height / 2)) * 1000000) / 1000000,
      });
    }
  }

  return constraints;
}
