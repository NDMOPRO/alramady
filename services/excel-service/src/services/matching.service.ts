import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'excel-matching';
const CACHE_TTL = 300;

export interface ListMatchingParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  workbookId?: string;
  tenantId?: string;
}

export class MatchingService {
  async list(params: ListMatchingParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, workbookId, tenantId } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (workbookId) {
      where.id = workbookId;
    }

    if (tenantId) {
      where.tenantId = tenantId;
    }

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const [data, total] = await Promise.all([
      prisma.workbook.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.workbook.count({ where }),
    ]);

    const result = {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const workbook = await prisma.workbook.findUnique({ where: { id } });
    if (!workbook) {
      throw new NotFoundError('Workbook', id);
    }

    await cacheSet(cacheKey, workbook, CACHE_TTL);
    return workbook;
  }

  async create(data: {
    tenant_id: string;
    dataset_id?: string;
    name: string;
    sheets_json?: unknown;
    formulas_json?: unknown;
    created_by: string;
  }) {
    const workbook = await prisma.workbook.create({
      data: {
        tenantId: data.tenant_id,
        datasetId: data.dataset_id || null,
        name: data.name,
        sheetsJson: data.sheets_json ?? {},
        formulasJson: data.formulas_json ?? {},
        createdBy: data.created_by,
      },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return workbook;
  }

  async update(id: string, data: {
    name?: string;
    sheets_json?: unknown;
    formulas_json?: unknown;
  }) {
    await this.getById(id);

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.sheets_json !== undefined) updateData.sheetsJson = data.sheets_json;
    if (data.formulas_json !== undefined) updateData.formulasJson = data.formulas_json;

    const updated = await prisma.workbook.update({
      where: { id },
      data: updateData,
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return updated;
  }

  async delete(id: string) {
    await this.getById(id);
    await prisma.workbook.delete({ where: { id } });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Jaro similarity between two strings.
   * Returns a value in [0, 1] where 1 means identical.
   */
  private jaroSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = new Array<boolean>(s1.length).fill(false);
    const s2Matches = new Array<boolean>(s2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, s2.length);

      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
  }

  /**
   * Jaro-Winkler similarity between two strings.
   * Boosts the Jaro score for strings sharing a common prefix (up to 4 chars).
   */
  private jaroWinklerSimilarity(s1: string, s2: string): number {
    const jaro = this.jaroSimilarity(s1, s2);
    const prefixLength = Math.min(
      4,
      [...Array(Math.min(s1.length, s2.length))].findIndex((_, i) => s1[i] !== s2[i]) === -1
        ? Math.min(s1.length, s2.length)
        : [...Array(Math.min(s1.length, s2.length))].findIndex((_, i) => s1[i] !== s2[i])
    );
    return jaro + prefixLength * 0.1 * (1 - jaro);
  }

  /**
   * Compares two cell values according to the specified matchType.
   * Returns a similarity score in [0, 1].  A score >= threshold means "matched".
   */
  private compareValues(
    sourceVal: unknown,
    targetVal: unknown,
    matchType: string,
    threshold: number
  ): number {
    const toStr = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
    const src = toStr(sourceVal);
    const tgt = toStr(targetVal);

    switch (matchType) {
      case 'exact':
        return src === tgt ? 1 : 0;

      case 'fuzzy': {
        if (src.length === 0 && tgt.length === 0) return 1;
        if (src.length === 0 || tgt.length === 0) return 0;
        return this.jaroWinklerSimilarity(src.toLowerCase(), tgt.toLowerCase());
      }

      case 'numeric': {
        const n1 = parseFloat(src);
        const n2 = parseFloat(tgt);
        if (isNaN(n1) || isNaN(n2)) return 0;
        if (n1 === n2) return 1;
        const maxAbs = Math.max(Math.abs(n1), Math.abs(n2));
        if (maxAbs === 0) return 1;
        const relDiff = Math.abs(n1 - n2) / maxAbs;
        // Convert threshold to a tolerance: e.g. threshold 0.9 → tolerance 0.1
        const tolerance = 1 - threshold;
        return relDiff <= tolerance ? 1 - relDiff : 0;
      }

      case 'contains': {
        if (src.length === 0 && tgt.length === 0) return 1;
        if (src.length === 0 || tgt.length === 0) return 0;
        const srcLower = src.toLowerCase();
        const tgtLower = tgt.toLowerCase();
        return srcLower.includes(tgtLower) || tgtLower.includes(srcLower) ? 1 : 0;
      }

      default:
        return src === tgt ? 1 : 0;
    }
  }

  /**
   * Given source and target row arrays, build a matched result set according
   * to matchColumns config and matchStrategy.
   */
  private performMatch(
    sourceRows: Record<string, unknown>[],
    targetRows: Record<string, unknown>[],
    matchColumns: Array<{
      sourceColumn: string;
      targetColumn: string;
      matchType: string;
      threshold?: number;
    }>,
    matchStrategy: string
  ): {
    matchedRows: number;
    unmatchedRows: number;
    rows: Array<{
      sourceIndex: number;
      targetIndex: number | null;
      similarity: number;
      matched: boolean;
    }>;
  } {
    const resultRows: Array<{
      sourceIndex: number;
      targetIndex: number | null;
      similarity: number;
      matched: boolean;
    }> = [];

    const targetMatched = new Set<number>();

    for (let si = 0; si < sourceRows.length; si++) {
      const sourceRow = sourceRows[si];
      let bestScore = 0;
      let bestTargetIndex = -1;

      for (let ti = 0; ti < targetRows.length; ti++) {
        const targetRow = targetRows[ti];

        // All match columns must meet their threshold for the row pair to match
        let rowScore = 1;
        for (const col of matchColumns) {
          const threshold = col.threshold ?? 0.8;
          const colScore = this.compareValues(
            sourceRow[col.sourceColumn],
            targetRow[col.targetColumn],
            col.matchType,
            threshold
          );
          if (colScore < threshold) {
            rowScore = 0;
            break;
          }
          rowScore = Math.min(rowScore, colScore);
        }

        if (rowScore > bestScore) {
          bestScore = rowScore;
          bestTargetIndex = ti;
        }
      }

      const defaultThreshold = matchColumns[0]?.threshold ?? 0.8;
      const isMatched = bestScore >= defaultThreshold && bestTargetIndex !== -1;

      if (isMatched) {
        targetMatched.add(bestTargetIndex);
        resultRows.push({
          sourceIndex: si,
          targetIndex: bestTargetIndex,
          similarity: bestScore,
          matched: true,
        });
      } else {
        // Include unmatched source rows only for 'left' and 'full' strategies
        if (matchStrategy === 'left' || matchStrategy === 'full') {
          resultRows.push({
            sourceIndex: si,
            targetIndex: null,
            similarity: 0,
            matched: false,
          });
        }
      }
    }

    // For 'full' strategy also include unmatched target rows
    if (matchStrategy === 'full') {
      for (let ti = 0; ti < targetRows.length; ti++) {
        if (!targetMatched.has(ti)) {
          resultRows.push({
            sourceIndex: -1,
            targetIndex: ti,
            similarity: 0,
            matched: false,
          });
        }
      }
    }

    const matchedRows = resultRows.filter((r) => r.matched).length;
    const unmatchedRows = resultRows.filter((r) => !r.matched).length;

    return { matchedRows, unmatchedRows, rows: resultRows };
  }

  // ---------------------------------------------------------------------------
  // Public matching methods
  // ---------------------------------------------------------------------------

  async executeMatch(
    workbookId: string,
    sourceSheetName: string,
    targetSheetName: string,
    matchColumns: Array<{
      sourceColumn: string;
      targetColumn: string;
      matchType: string;
      threshold?: number;
    }>,
    matchStrategy: string = 'inner'
  ) {
    const workbook = await this.getById(workbookId);
    const sheetsJson = (workbook as Record<string, unknown>).sheetsJson as Record<string, unknown> || {};

    // Sheets are stored as arrays of row-objects keyed by sheet name
    const sourceRows = (sheetsJson[sourceSheetName] as Record<string, unknown>[]) || [];
    const targetRows = (sheetsJson[targetSheetName] as Record<string, unknown>[]) || [];

    const { matchedRows, unmatchedRows, rows } = this.performMatch(
      sourceRows,
      targetRows,
      matchColumns,
      matchStrategy
    );

    const matchResult = {
      sourceSheet: sourceSheetName,
      targetSheet: targetSheetName,
      matchColumns,
      matchStrategy,
      executedAt: new Date().toISOString(),
      status: 'completed',
      matchedRows,
      unmatchedRows,
      rows,
    };

    if (!sheetsJson._matchResults) {
      sheetsJson._matchResults = [];
    }
    (sheetsJson._matchResults as unknown[]).push(matchResult);

    const updated = await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${workbookId}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return {
      workbook: updated,
      matchResult,
    };
  }

  async getMatchResults(workbookId: string) {
    const workbook = await this.getById(workbookId);
    const sheetsJson = (workbook as Record<string, unknown>).sheetsJson as Record<string, unknown> || {};
    return (sheetsJson._matchResults as unknown[]) || [];
  }

  async fuzzyMatch(
    workbookId: string,
    sourceSheet: string,
    targetSheet: string,
    sourceColumn: string,
    targetColumn: string,
    threshold: number = 0.8
  ) {
    const workbook = await this.getById(workbookId);
    const sheetsJson = (workbook as Record<string, unknown>).sheetsJson as Record<string, unknown> || {};

    const sourceRows = (sheetsJson[sourceSheet] as Record<string, unknown>[]) || [];
    const targetRows = (sheetsJson[targetSheet] as Record<string, unknown>[]) || [];

    // Collect per-value similarity scores for every source→target combination
    const matches: Array<{
      sourceIndex: number;
      sourceValue: unknown;
      targetIndex: number;
      targetValue: unknown;
      similarity: number;
    }> = [];

    for (let si = 0; si < sourceRows.length; si++) {
      const srcVal = sourceRows[si][sourceColumn];
      for (let ti = 0; ti < targetRows.length; ti++) {
        const tgtVal = targetRows[ti][targetColumn];
        const score = this.compareValues(srcVal, tgtVal, 'fuzzy', threshold);
        if (score >= threshold) {
          matches.push({
            sourceIndex: si,
            sourceValue: srcVal,
            targetIndex: ti,
            targetValue: tgtVal,
            similarity: score,
          });
        }
      }
    }

    // Sort by descending similarity for easy inspection
    matches.sort((a, b) => b.similarity - a.similarity);

    return {
      sourceSheet,
      targetSheet,
      sourceColumn,
      targetColumn,
      threshold,
      totalMatches: matches.length,
      matches,
    };
  }

  async deduplicateSheet(workbookId: string, sheetName: string, columns: string[]) {
    const workbook = await this.getById(workbookId);
    const sheetsJson = (workbook as Record<string, unknown>).sheetsJson as Record<string, unknown> || {};

    const originalRows = (sheetsJson[sheetName] as Record<string, unknown>[]) || [];
    const toStr = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

    const seen = new Set<string>();
    const deduplicatedRows: Record<string, unknown>[] = [];
    let duplicatesFound = 0;

    for (const row of originalRows) {
      // Build a composite key from the specified columns (or all columns if none given)
      const keyColumns = columns.length > 0 ? columns : Object.keys(row);
      const key = keyColumns.map((col) => toStr(row[col])).join('\u0000');

      if (seen.has(key)) {
        duplicatesFound++;
      } else {
        seen.add(key);
        deduplicatedRows.push(row);
      }
    }

    const duplicatesRemoved = duplicatesFound;

    // Persist the deduplicated rows back into sheets_json
    sheetsJson[sheetName] = deduplicatedRows;

    const dedupeResult = {
      sheetName,
      columns,
      executedAt: new Date().toISOString(),
      status: 'completed',
      originalRowCount: originalRows.length,
      deduplicatedRowCount: deduplicatedRows.length,
      duplicatesFound,
      duplicatesRemoved,
    };

    if (!sheetsJson._dedupeResults) {
      sheetsJson._dedupeResults = [];
    }
    (sheetsJson._dedupeResults as unknown[]).push(dedupeResult);

    const updated = await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${workbookId}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return {
      workbook: updated,
      dedupeResult,
    };
  }
}

export const matchingService = new MatchingService();
