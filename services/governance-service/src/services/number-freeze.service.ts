import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface FreezeRule {
  id: string;
  documentId: string;
  range: string;
  frozenBy: string;
  frozenAt: Date;
  reason: string;
  expiresAt?: Date;
  overridePasswordHash?: string;
}

interface CellRef {
  sheet?: string;
  col: number;
  row: number;
}

interface RangeBounds {
  sheet?: string;
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

interface FreezeCheckResult {
  frozen: boolean;
  rule?: FreezeRule;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class NumberFreezeService {
  constructor(private prisma: PrismaClient) {}

  async freezeRange(
    documentId: string,
    range: string,
    userId: string,
    reason: string,
    expiresAt?: Date,
    overridePassword?: string,
  ): Promise<FreezeRule> {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID is required');
    }
    if (!range || !range.trim()) {
      throw new Error('Cell range is required');
    }
    if (!userId || !userId.trim()) {
      throw new Error('User ID is required');
    }
    if (!reason || !reason.trim()) {
      throw new Error('Freeze reason is required');
    }

    // Validate the range format by parsing it
    this.parseRange(range);

    if (expiresAt && expiresAt <= new Date()) {
      throw new Error('Expiration date must be in the future');
    }

    const freezeId = crypto.randomUUID();
    const frozenAt = new Date();

    let overridePasswordHash: string | undefined;
    if (overridePassword) {
      overridePasswordHash = crypto
        .createHash('sha256')
        .update(`${overridePassword}:${freezeId}`)
        .digest('hex');
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: 'system',
        userId,
        action: 'number_freeze.created',
        entityType: 'number_freeze',
        entityId: freezeId,
        detailsJson: {
          freezeId,
          documentId,
          range: range.trim(),
          frozenBy: userId,
          frozenAt: frozenAt.toISOString(),
          reason: reason.trim(),
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          overridePasswordHash: overridePasswordHash ?? null,
          active: true,
        },
      },
    });

    logger.info('Number freeze rule created', {
      freezeId,
      documentId,
      range: range.trim(),
      frozenBy: userId,
      expiresAt: expiresAt?.toISOString(),
    });

    return {
      id: freezeId,
      documentId,
      range: range.trim(),
      frozenBy: userId,
      frozenAt,
      reason: reason.trim(),
      expiresAt,
      overridePasswordHash,
    };
  }

  async unfreezeRange(freezeId: string, userId: string, overridePassword?: string): Promise<void> {
    if (!freezeId || !userId) {
      throw new Error('Freeze ID and user ID are required');
    }

    const rule = await this.getFreezeRecord(freezeId);

    if (!rule) {
      throw new Error(`Freeze rule '${freezeId}' not found`);
    }

    // Check if user is the one who froze it, or has override password
    if (rule.frozenBy !== userId) {
      if (rule.overridePasswordHash && overridePassword) {
        const providedHash = crypto
          .createHash('sha256')
          .update(`${overridePassword}:${freezeId}`)
          .digest('hex');

        const hashA = Buffer.from(providedHash, 'utf-8');
        const hashB = Buffer.from(rule.overridePasswordHash, 'utf-8');

        if (hashA.length !== hashB.length || !crypto.timingSafeEqual(hashA, hashB)) {
          throw new Error('Invalid override password');
        }
      } else if (rule.overridePasswordHash) {
        throw new Error('Override password is required to unfreeze a rule created by another user');
      } else {
        // Check if user is admin
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });

        if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
          throw new Error('Only the original user or an admin can unfreeze this range');
        }
      }
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: 'system',
        userId,
        action: 'number_freeze.removed',
        entityType: 'number_freeze',
        entityId: freezeId,
        detailsJson: {
          freezeId,
          documentId: rule.documentId,
          range: rule.range,
          frozenBy: rule.frozenBy,
          unfrozenBy: userId,
          unfrozenAt: new Date().toISOString(),
          active: false,
        },
      },
    });

    logger.info('Number freeze rule removed', {
      freezeId,
      documentId: rule.documentId,
      range: rule.range,
      unfrozenBy: userId,
    });
  }

  async isCellFrozen(documentId: string, cellRef: string): Promise<FreezeCheckResult> {
    if (!documentId || !cellRef) {
      throw new Error('Document ID and cell reference are required');
    }

    const cell = this.parseCellRef(cellRef);
    const rules = await this.getFreezeRules(documentId);

    for (const rule of rules) {
      if (this.isInRange(cell, rule.range)) {
        return { frozen: true, rule };
      }
    }

    return { frozen: false };
  }

  async getFreezeRules(documentId: string): Promise<FreezeRule[]> {
    if (!documentId) {
      throw new Error('Document ID is required');
    }

    // Get all creation logs for this document
    const creationLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'number_freeze',
        action: 'number_freeze.created',
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get all removal logs
    const removalLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'number_freeze',
        action: 'number_freeze.removed',
      },
    });

    const removedIds = new Set(removalLogs.map((log) => log.entityId));
    const now = new Date();
    const activeRules: FreezeRule[] = [];

    for (const log of creationLogs) {
      const data = log.detailsJson as Record<string, unknown>;

      // Skip if not for this document
      if (data.documentId !== documentId) {
        continue;
      }

      // Skip if removed
      if (removedIds.has(log.entityId)) {
        continue;
      }

      // Skip if expired
      const expiresAt = data.expiresAt ? new Date(data.expiresAt as string) : undefined;
      if (expiresAt && expiresAt <= now) {
        continue;
      }

      activeRules.push({
        id: data.freezeId as string,
        documentId: data.documentId as string,
        range: data.range as string,
        frozenBy: data.frozenBy as string,
        frozenAt: new Date(data.frozenAt as string),
        reason: data.reason as string,
        expiresAt,
        overridePasswordHash: (data.overridePasswordHash as string) ?? undefined,
      });
    }

    return activeRules;
  }

  parseCellRef(ref: string): CellRef {
    if (!ref || !ref.trim()) {
      throw new Error('Cell reference is required');
    }

    const trimmed = ref.trim();
    let sheet: string | undefined;
    let cellPart: string;

    // Handle "Sheet1!A1" format
    const sheetSeparator = trimmed.indexOf('!');
    if (sheetSeparator !== -1) {
      sheet = trimmed.slice(0, sheetSeparator);
      cellPart = trimmed.slice(sheetSeparator + 1);
    } else {
      cellPart = trimmed;
    }

    const match = cellPart.match(/^([A-Za-z]+)(\d+)$/);
    if (!match) {
      throw new Error(`Invalid cell reference: '${ref}'`);
    }

    const col = this.columnLetterToNumber(match[1]);
    const row = parseInt(match[2], 10);

    if (row < 1) {
      throw new Error(`Invalid row number in cell reference: '${ref}'`);
    }

    return { sheet, col, row };
  }

  isInRange(cell: CellRef, range: string): boolean {
    const bounds = this.parseRange(range);

    // If the range specifies a sheet, the cell must match (or cell has no sheet)
    if (bounds.sheet && cell.sheet && bounds.sheet !== cell.sheet) {
      return false;
    }

    return (
      cell.col >= bounds.startCol &&
      cell.col <= bounds.endCol &&
      cell.row >= bounds.startRow &&
      cell.row <= bounds.endRow
    );
  }

  private parseRange(range: string): RangeBounds {
    const trimmed = range.trim();
    let sheet: string | undefined;
    let rangePart: string;

    const sheetSeparator = trimmed.indexOf('!');
    if (sheetSeparator !== -1) {
      sheet = trimmed.slice(0, sheetSeparator);
      rangePart = trimmed.slice(sheetSeparator + 1);
    } else {
      rangePart = trimmed;
    }

    // Handle single cell like "A1"
    if (!rangePart.includes(':')) {
      const cell = this.parseCellRef(rangePart);
      return {
        sheet,
        startCol: cell.col,
        startRow: cell.row,
        endCol: cell.col,
        endRow: cell.row,
      };
    }

    // Handle range like "A1:C10"
    const parts = rangePart.split(':');
    if (parts.length !== 2) {
      throw new Error(`Invalid range format: '${range}'`);
    }

    const start = this.parseCellRef(parts[0]);
    const end = this.parseCellRef(parts[1]);

    return {
      sheet,
      startCol: Math.min(start.col, end.col),
      startRow: Math.min(start.row, end.row),
      endCol: Math.max(start.col, end.col),
      endRow: Math.max(start.row, end.row),
    };
  }

  private columnLetterToNumber(letters: string): number {
    let result = 0;
    const upper = letters.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      result = result * 26 + (upper.charCodeAt(i) - 64);
    }
    return result;
  }

  private async getFreezeRecord(freezeId: string): Promise<FreezeRule | null> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        entityId: freezeId,
        entityType: 'number_freeze',
        action: 'number_freeze.created',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (logs.length === 0) {
      return null;
    }

    // Check if already removed
    const removalLogs = await this.prisma.auditLog.findMany({
      where: {
        entityId: freezeId,
        entityType: 'number_freeze',
        action: 'number_freeze.removed',
      },
      take: 1,
    });

    if (removalLogs.length > 0) {
      return null;
    }

    const data = logs[0].detailsJson as Record<string, unknown>;
    const expiresAt = data.expiresAt ? new Date(data.expiresAt as string) : undefined;

    // Check expiration
    if (expiresAt && expiresAt <= new Date()) {
      return null;
    }

    return {
      id: data.freezeId as string,
      documentId: data.documentId as string,
      range: data.range as string,
      frozenBy: data.frozenBy as string,
      frozenAt: new Date(data.frozenAt as string),
      reason: data.reason as string,
      expiresAt,
      overridePasswordHash: (data.overridePasswordHash as string) ?? undefined,
    };
  }
}
