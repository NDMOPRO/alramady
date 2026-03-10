import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────

interface DiffResult {
  diffId: string;
  leftDatasetId: string;
  rightDatasetId: string;
  summary: {
    totalLeftRows: number;
    totalRightRows: number;
    addedRows: number;
    removedRows: number;
    modifiedRows: number;
    unchangedRows: number;
    addedColumns: string[];
    removedColumns: string[];
    commonColumns: string[];
  };
  changes: Array<{
    type: 'added' | 'removed' | 'modified';
    rowIndex: number;
    column?: string;
    leftValue?: unknown;
    rightValue?: unknown;
  }>;
  executionTimeMs: number;
}

interface DiffSummary {
  leftDatasetId: string;
  rightDatasetId: string;
  totalLeftRows: number;
  totalRightRows: number;
  addedRows: number;
  removedRows: number;
  modifiedRows: number;
  unchangedRows: number;
  addedColumns: string[];
  removedColumns: string[];
  commonColumns: string[];
  overallSimilarity: number;
}

interface ColumnDiffResult {
  column: string;
  leftDatasetId: string;
  rightDatasetId: string;
  totalCompared: number;
  matchCount: number;
  mismatchCount: number;
  leftOnlyCount: number;
  rightOnlyCount: number;
  mismatches: Array<{
    rowIndex: number;
    leftValue: unknown;
    rightValue: unknown;
  }>;
}

// ─── Service ─────────────────────────────────────────────────────────

export class TableDiffService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async compareTables(
    leftDatasetId: string,
    rightDatasetId: string,
    tenantId: string,
    keyColumns?: string[]
  ): Promise<DiffResult> {
    logger.info('Starting table comparison', { leftDatasetId, rightDatasetId, tenantId, keyColumns });
    const startTime = Date.now();

    const [leftData, rightData] = await Promise.all([
      this.loadDataset(leftDatasetId, tenantId),
      this.loadDataset(rightDatasetId, tenantId),
    ]);

    // Determine column sets
    const leftColNames = new Set(leftData.columns.map(c => c.name));
    const rightColNames = new Set(rightData.columns.map(c => c.name));

    const addedColumns = [...rightColNames].filter(c => !leftColNames.has(c));
    const removedColumns = [...leftColNames].filter(c => !rightColNames.has(c));
    const commonColumns = [...leftColNames].filter(c => rightColNames.has(c));

    const changes: DiffResult['changes'] = [];
    let addedRows = 0;
    let removedRows = 0;
    let modifiedRows = 0;
    let unchangedRows = 0;

    if (keyColumns && keyColumns.length > 0) {
      // Key-based matching
      const result = this.keyBasedDiff(
        leftData.rows,
        rightData.rows,
        keyColumns,
        commonColumns
      );
      addedRows = result.addedRows;
      removedRows = result.removedRows;
      modifiedRows = result.modifiedRows;
      unchangedRows = result.unchangedRows;
      changes.push(...result.changes);
    } else {
      // Index-based matching
      const result = this.indexBasedDiff(
        leftData.rows,
        rightData.rows,
        commonColumns
      );
      addedRows = result.addedRows;
      removedRows = result.removedRows;
      modifiedRows = result.modifiedRows;
      unchangedRows = result.unchangedRows;
      changes.push(...result.changes);
    }

    const executionTimeMs = Date.now() - startTime;
    const diffId = crypto.randomUUID();

    logger.info('Table comparison completed', {
      diffId,
      addedRows,
      removedRows,
      modifiedRows,
      unchangedRows,
      changeCount: changes.length,
      executionTimeMs,
    });

    return {
      diffId,
      leftDatasetId,
      rightDatasetId,
      summary: {
        totalLeftRows: leftData.rows.length,
        totalRightRows: rightData.rows.length,
        addedRows,
        removedRows,
        modifiedRows,
        unchangedRows,
        addedColumns,
        removedColumns,
        commonColumns,
      },
      changes,
      executionTimeMs,
    };
  }

  async diffSummary(
    leftDatasetId: string,
    rightDatasetId: string,
    tenantId: string
  ): Promise<DiffSummary> {
    logger.info('Computing diff summary', { leftDatasetId, rightDatasetId, tenantId });

    const [leftData, rightData] = await Promise.all([
      this.loadDataset(leftDatasetId, tenantId),
      this.loadDataset(rightDatasetId, tenantId),
    ]);

    const leftColNames = new Set(leftData.columns.map(c => c.name));
    const rightColNames = new Set(rightData.columns.map(c => c.name));

    const addedColumns = [...rightColNames].filter(c => !leftColNames.has(c));
    const removedColumns = [...leftColNames].filter(c => !rightColNames.has(c));
    const commonColumns = [...leftColNames].filter(c => rightColNames.has(c));

    // Fast row-level comparison using hashes (no per-cell changes)
    const leftHashes = new Set<string>();
    for (const row of leftData.rows) {
      leftHashes.add(this.hashRow(row, commonColumns));
    }

    const rightHashes = new Set<string>();
    for (const row of rightData.rows) {
      rightHashes.add(this.hashRow(row, commonColumns));
    }

    let matchedHashes = 0;
    for (const hash of leftHashes) {
      if (rightHashes.has(hash)) matchedHashes++;
    }

    // Rows in left not in right -> either removed or modified
    const leftOnlyCount = leftData.rows.length - matchedHashes;
    // Rows in right not in left -> either added or modified
    const rightOnlyCount = rightData.rows.length - matchedHashes;

    // Estimate: modified rows are the overlap of left-only and right-only at same positions
    const minOnly = Math.min(leftOnlyCount, rightOnlyCount);
    const modifiedRows = Math.min(
      minOnly,
      Math.min(leftData.rows.length, rightData.rows.length) - matchedHashes
    );
    const removedRows = leftOnlyCount - modifiedRows;
    const addedRows = rightOnlyCount - modifiedRows;
    const unchangedRows = matchedHashes;

    const totalCells = Math.max(
      leftData.rows.length * commonColumns.length,
      rightData.rows.length * commonColumns.length,
      1
    );
    const estimatedChangedCells =
      modifiedRows * commonColumns.length +
      addedRows * commonColumns.length +
      removedRows * commonColumns.length;
    const overallSimilarity = Math.max(
      0,
      Math.min(1, 1 - estimatedChangedCells / totalCells)
    );

    return {
      leftDatasetId,
      rightDatasetId,
      totalLeftRows: leftData.rows.length,
      totalRightRows: rightData.rows.length,
      addedRows,
      removedRows,
      modifiedRows,
      unchangedRows,
      addedColumns,
      removedColumns,
      commonColumns,
      overallSimilarity: Math.round(overallSimilarity * 10000) / 10000,
    };
  }

  async columnDiff(
    leftDatasetId: string,
    rightDatasetId: string,
    tenantId: string,
    column: string
  ): Promise<ColumnDiffResult> {
    logger.info('Computing column diff', { leftDatasetId, rightDatasetId, tenantId, column });

    const [leftData, rightData] = await Promise.all([
      this.loadDataset(leftDatasetId, tenantId),
      this.loadDataset(rightDatasetId, tenantId),
    ]);

    const leftHasColumn = leftData.columns.some(c => c.name === column);
    const rightHasColumn = rightData.columns.some(c => c.name === column);

    if (!leftHasColumn && !rightHasColumn) {
      throw new Error(`Column '${column}' not found in either dataset`);
    }

    const maxRows = Math.max(leftData.rows.length, rightData.rows.length);
    const mismatches: Array<{ rowIndex: number; leftValue: unknown; rightValue: unknown }> = [];
    let matchCount = 0;
    let mismatchCount = 0;
    let leftOnlyCount = 0;
    let rightOnlyCount = 0;

    for (let i = 0; i < maxRows; i++) {
      const leftRow = i < leftData.rows.length ? leftData.rows[i] : null;
      const rightRow = i < rightData.rows.length ? rightData.rows[i] : null;

      if (leftRow && rightRow) {
        const leftVal = leftHasColumn ? leftRow[column] : undefined;
        const rightVal = rightHasColumn ? rightRow[column] : undefined;

        if (this.valuesEqual(leftVal, rightVal)) {
          matchCount++;
        } else {
          mismatchCount++;
          if (mismatches.length < 1000) {
            mismatches.push({
              rowIndex: i,
              leftValue: leftVal !== undefined ? leftVal : null,
              rightValue: rightVal !== undefined ? rightVal : null,
            });
          }
        }
      } else if (leftRow) {
        leftOnlyCount++;
      } else {
        rightOnlyCount++;
      }
    }

    return {
      column,
      leftDatasetId,
      rightDatasetId,
      totalCompared: matchCount + mismatchCount,
      matchCount,
      mismatchCount,
      leftOnlyCount,
      rightOnlyCount,
      mismatches,
    };
  }

  // ─── Private: Dataset loading ────────────────────────────────────

  private async loadDataset(
    datasetId: string,
    tenantId: string
  ): Promise<{
    columns: Array<{ name: string; dataType: string | null }>;
    rows: Record<string, any>[];
  }> {
    const dataset = await this.prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    if (!dataset) {
      throw new Error(`Dataset '${datasetId}' not found for tenant '${tenantId}'`);
    }

    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      select: { data: true },
    });

    return {
      columns: dataset.columns.map(c => ({ name: c.name, dataType: c.dataType })),
      rows: dataRows.map(r => r.data as Record<string, any>),
    };
  }

  // ─── Private: Diff algorithms ────────────────────────────────────

  private keyBasedDiff(
    leftRows: Record<string, any>[],
    rightRows: Record<string, any>[],
    keyColumns: string[],
    commonColumns: string[]
  ): {
    addedRows: number;
    removedRows: number;
    modifiedRows: number;
    unchangedRows: number;
    changes: DiffResult['changes'];
  } {
    const MAX_CHANGES = 5000;
    const changes: DiffResult['changes'] = [];

    // Build index of left rows by key
    const leftIndex = new Map<string, { row: Record<string, any>; index: number }>();
    for (let i = 0; i < leftRows.length; i++) {
      const key = this.buildRowKey(leftRows[i], keyColumns);
      leftIndex.set(key, { row: leftRows[i], index: i });
    }

    // Build index of right rows by key
    const rightIndex = new Map<string, { row: Record<string, any>; index: number }>();
    for (let i = 0; i < rightRows.length; i++) {
      const key = this.buildRowKey(rightRows[i], keyColumns);
      rightIndex.set(key, { row: rightRows[i], index: i });
    }

    let addedRows = 0;
    let removedRows = 0;
    let modifiedRows = 0;
    let unchangedRows = 0;

    // Check rows in left against right
    const matchedRightKeys = new Set<string>();

    for (const [key, leftEntry] of leftIndex) {
      const rightEntry = rightIndex.get(key);

      if (!rightEntry) {
        // Row removed
        removedRows++;
        if (changes.length < MAX_CHANGES) {
          changes.push({
            type: 'removed',
            rowIndex: leftEntry.index,
          });
        }
      } else {
        matchedRightKeys.add(key);

        // Compare common columns (excluding key columns as they already match)
        const nonKeyColumns = commonColumns.filter(c => !keyColumns.includes(c));
        let rowModified = false;

        for (const col of nonKeyColumns) {
          const leftVal = leftEntry.row[col];
          const rightVal = rightEntry.row[col];

          if (!this.valuesEqual(leftVal, rightVal)) {
            rowModified = true;
            if (changes.length < MAX_CHANGES) {
              changes.push({
                type: 'modified',
                rowIndex: leftEntry.index,
                column: col,
                leftValue: leftVal,
                rightValue: rightVal,
              });
            }
          }
        }

        if (rowModified) {
          modifiedRows++;
        } else {
          unchangedRows++;
        }
      }
    }

    // Check rows in right that are not in left (added)
    for (const [key, rightEntry] of rightIndex) {
      if (!matchedRightKeys.has(key)) {
        addedRows++;
        if (changes.length < MAX_CHANGES) {
          changes.push({
            type: 'added',
            rowIndex: rightEntry.index,
          });
        }
      }
    }

    return { addedRows, removedRows, modifiedRows, unchangedRows, changes };
  }

  private indexBasedDiff(
    leftRows: Record<string, any>[],
    rightRows: Record<string, any>[],
    commonColumns: string[]
  ): {
    addedRows: number;
    removedRows: number;
    modifiedRows: number;
    unchangedRows: number;
    changes: DiffResult['changes'];
  } {
    const MAX_CHANGES = 5000;
    const changes: DiffResult['changes'] = [];
    let modifiedRows = 0;
    let unchangedRows = 0;

    const minRows = Math.min(leftRows.length, rightRows.length);

    // Compare overlapping rows by index
    for (let i = 0; i < minRows; i++) {
      let rowModified = false;

      for (const col of commonColumns) {
        const leftVal = leftRows[i][col];
        const rightVal = rightRows[i][col];

        if (!this.valuesEqual(leftVal, rightVal)) {
          rowModified = true;
          if (changes.length < MAX_CHANGES) {
            changes.push({
              type: 'modified',
              rowIndex: i,
              column: col,
              leftValue: leftVal,
              rightValue: rightVal,
            });
          }
        }
      }

      if (rowModified) {
        modifiedRows++;
      } else {
        unchangedRows++;
      }
    }

    // Extra rows in right are added
    const addedRows = rightRows.length > leftRows.length
      ? rightRows.length - leftRows.length
      : 0;

    for (let i = minRows; i < rightRows.length; i++) {
      if (changes.length < MAX_CHANGES) {
        changes.push({
          type: 'added',
          rowIndex: i,
        });
      }
    }

    // Extra rows in left are removed
    const removedRows = leftRows.length > rightRows.length
      ? leftRows.length - rightRows.length
      : 0;

    for (let i = minRows; i < leftRows.length; i++) {
      if (changes.length < MAX_CHANGES) {
        changes.push({
          type: 'removed',
          rowIndex: i,
        });
      }
    }

    return { addedRows, removedRows, modifiedRows, unchangedRows, changes };
  }

  // ─── Private: Utility ────────────────────────────────────────────

  private buildRowKey(row: Record<string, any>, keyColumns: string[]): string {
    return keyColumns.map(col => String(row[col] ?? '__NULL__')).join('|||');
  }

  private hashRow(row: Record<string, any>, columns: string[]): string {
    const parts: string[] = [];
    for (const col of columns) {
      parts.push(`${col}:${String(row[col] ?? '')}`);
    }
    return parts.join('|');
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || a === undefined) return b === null || b === undefined;
    if (b === null || b === undefined) return false;

    // Numeric comparison with tolerance
    const numA = Number(a);
    const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return Math.abs(numA - numB) < 1e-10;
    }

    return String(a) === String(b);
  }
}
