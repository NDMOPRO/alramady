import { logger } from '../utils/logger';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ReportSection {
  id: string;
  title: string;
  type: 'text' | 'chart' | 'table' | 'image' | 'pagebreak' | 'summary' | 'kpi';
  content: unknown;
}

export interface Report {
  id: string;
  title?: string;
  sections: ReportSection[];
  metadata?: Record<string, any>;
}

export type ChangeType = 'added' | 'removed' | 'changed' | 'unchanged';

export interface ValueChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: ChangeType;
  percentageChange?: number;
}

export interface RowDiff {
  key: string;
  changeType: ChangeType;
  cellChanges: ValueChange[];
}

export interface SectionDiff {
  sectionId: string;
  sectionTitle: string;
  sectionType: string;
  changeType: ChangeType;
  changes: ValueChange[];
  rowDiffs?: RowDiff[];
  dataPointDiffs?: ValueChange[];
}

export interface ReportDiff {
  reportAId: string;
  reportBId: string;
  totalSections: { a: number; b: number };
  addedSections: string[];
  removedSections: string[];
  changedSections: string[];
  unchangedSections: string[];
  sectionDiffs: SectionDiff[];
}

export interface DiffSummary {
  overview: string;
  sectionSummaries: string[];
  statistics: {
    totalChanges: number;
    additions: number;
    removals: number;
    modifications: number;
  };
}

export interface HighlightedChange {
  position: number;
  length: number;
  type: 'added' | 'removed';
  text: string;
}

export interface HighlightResult {
  sectionId: string;
  highlights: HighlightedChange[];
  summary: string;
}

// ────────────────────────────────────────────────────────────────────────────
// LCS-based text diff
// ────────────────────────────────────────────────────────────────────────────

/**
 * Computes the Longest Common Subsequence table for two arrays of tokens.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * Backtracks through the LCS table to produce a diff sequence.
 */
function diffFromLCS(
  a: string[],
  b: string[],
  dp: number[][],
): Array<{ type: 'equal' | 'added' | 'removed'; value: string }> {
  const result: Array<{ type: 'equal' | 'added' | 'removed'; value: string }> = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'equal', value: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: b[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', value: a[i - 1] });
      i--;
    }
  }
  return result;
}

/**
 * Character-level diff of two strings using LCS.
 */
function textDiff(
  textA: string,
  textB: string,
): Array<{ type: 'equal' | 'added' | 'removed'; value: string }> {
  // Tokenise by words for readability (character-level is too granular for summaries)
  const wordsA = textA.split(/(\s+)/);
  const wordsB = textB.split(/(\s+)/);
  const dp = lcsTable(wordsA, wordsB);
  return diffFromLCS(wordsA, wordsB, dp);
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function isNumeric(v: unknown): v is number {
  return typeof v === 'number' && !isNaN(v);
}

function percentChange(newVal: number, oldVal: number): number {
  if (oldVal === 0) return newVal === 0 ? 0 : 100;
  return ((newVal - oldVal) / Math.abs(oldVal)) * 100;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  const objA = a as Record<string, any>;
  const objB = b as Record<string, any>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => keysB.includes(k) && deepEqual(objA[k], objB[k]));
}

/**
 * Attempts to determine a row key from a data row.
 * Uses 'id', 'key', 'name', or falls back to the first string field.
 */
function getRowKey(row: Record<string, any>): string {
  for (const candidate of ['id', 'key', 'name', 'label', 'category']) {
    if (row[candidate] !== undefined) return String(row[candidate]);
  }
  const firstStringField = Object.entries(row).find(([, v]) => typeof v === 'string');
  if (firstStringField) return firstStringField[1] as string;
  return JSON.stringify(row);
}

// ────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────

export class ReportDiffService {
  /**
   * Full comparison of two reports, returning diffs per section.
   */
  compareReports(reportA: Report, reportB: Report): ReportDiff {
    logger.info('Comparing reports', { reportAId: reportA.id, reportBId: reportB.id });

    const sectionDiffs = this.compareSections(reportA.sections, reportB.sections);

    const addedSections: string[] = [];
    const removedSections: string[] = [];
    const changedSections: string[] = [];
    const unchangedSections: string[] = [];

    for (const diff of sectionDiffs) {
      switch (diff.changeType) {
        case 'added':
          addedSections.push(diff.sectionId);
          break;
        case 'removed':
          removedSections.push(diff.sectionId);
          break;
        case 'changed':
          changedSections.push(diff.sectionId);
          break;
        case 'unchanged':
          unchangedSections.push(diff.sectionId);
          break;
      }
    }

    const result: ReportDiff = {
      reportAId: reportA.id,
      reportBId: reportB.id,
      totalSections: { a: reportA.sections.length, b: reportB.sections.length },
      addedSections,
      removedSections,
      changedSections,
      unchangedSections,
      sectionDiffs,
    };

    logger.info('Report comparison complete', {
      added: addedSections.length,
      removed: removedSections.length,
      changed: changedSections.length,
      unchanged: unchangedSections.length,
    });

    return result;
  }

  /**
   * Section-level diff: matches sections by ID and compares their contents.
   */
  compareSections(sectionsA: ReportSection[], sectionsB: ReportSection[]): SectionDiff[] {
    logger.debug('Comparing sections', { countA: sectionsA.length, countB: sectionsB.length });

    const mapA = new Map(sectionsA.map((s) => [s.id, s]));
    const mapB = new Map(sectionsB.map((s) => [s.id, s]));
    const allIds = new Set([...mapA.keys(), ...mapB.keys()]);
    const diffs: SectionDiff[] = [];

    for (const id of allIds) {
      const secA = mapA.get(id);
      const secB = mapB.get(id);

      if (!secA && secB) {
        // Added section
        diffs.push({
          sectionId: id,
          sectionTitle: secB.title,
          sectionType: secB.type,
          changeType: 'added',
          changes: [{ field: 'content', oldValue: null, newValue: secB.content, changeType: 'added' }],
        });
      } else if (secA && !secB) {
        // Removed section
        diffs.push({
          sectionId: id,
          sectionTitle: secA.title,
          sectionType: secA.type,
          changeType: 'removed',
          changes: [{ field: 'content', oldValue: secA.content, newValue: null, changeType: 'removed' }],
        });
      } else if (secA && secB) {
        // Both exist - compare
        if (deepEqual(secA.content, secB.content) && secA.title === secB.title && secA.type === secB.type) {
          diffs.push({
            sectionId: id,
            sectionTitle: secA.title,
            sectionType: secA.type,
            changeType: 'unchanged',
            changes: [],
          });
        } else {
          const sectionDiff: SectionDiff = {
            sectionId: id,
            sectionTitle: secB.title,
            sectionType: secB.type,
            changeType: 'changed',
            changes: [],
          };

          // Title change
          if (secA.title !== secB.title) {
            sectionDiff.changes.push({
              field: 'title',
              oldValue: secA.title,
              newValue: secB.title,
              changeType: 'changed',
            });
          }

          // Type change
          if (secA.type !== secB.type) {
            sectionDiff.changes.push({
              field: 'type',
              oldValue: secA.type,
              newValue: secB.type,
              changeType: 'changed',
            });
          }

          // Content diff by section type
          if (secA.type === 'text' || secA.type === 'summary') {
            const contentA = typeof secA.content === 'string' ? secA.content : JSON.stringify(secA.content);
            const contentB = typeof secB.content === 'string' ? secB.content : JSON.stringify(secB.content);
            if (contentA !== contentB) {
              sectionDiff.changes.push({
                field: 'content',
                oldValue: contentA,
                newValue: contentB,
                changeType: 'changed',
              });
            }
          } else if (secA.type === 'table') {
            const rowDiffs = this.diffTableData(secA.content, secB.content);
            sectionDiff.rowDiffs = rowDiffs;
          } else if (secA.type === 'chart') {
            const dataPointDiffs = this.diffChartData(secA.content, secB.content);
            sectionDiff.dataPointDiffs = dataPointDiffs;
          } else if (!deepEqual(secA.content, secB.content)) {
            sectionDiff.changes.push({
              field: 'content',
              oldValue: secA.content,
              newValue: secB.content,
              changeType: 'changed',
            });
          }

          diffs.push(sectionDiff);
        }
      }
    }

    return diffs;
  }

  /**
   * Data-level diff: compares two data objects, identifying added/removed/changed
   * rows and computing value change percentages for numeric fields.
   */
  compareData(
    dataA: Record<string, any>[],
    dataB: Record<string, any>[],
  ): { added: Record<string, any>[]; removed: Record<string, any>[]; changed: RowDiff[] } {
    logger.debug('Comparing data', { rowsA: dataA.length, rowsB: dataB.length });

    const mapA = new Map<string, Record<string, any>>();
    const mapB = new Map<string, Record<string, any>>();

    for (const row of dataA) {
      mapA.set(getRowKey(row), row);
    }
    for (const row of dataB) {
      mapB.set(getRowKey(row), row);
    }

    const added: Record<string, any>[] = [];
    const removed: Record<string, any>[] = [];
    const changed: RowDiff[] = [];

    // Find removed and changed rows
    for (const [key, rowA] of mapA) {
      const rowB = mapB.get(key);
      if (!rowB) {
        removed.push(rowA);
      } else if (!deepEqual(rowA, rowB)) {
        const cellChanges = this.diffRowCells(rowA, rowB);
        changed.push({ key, changeType: 'changed', cellChanges });
      }
    }

    // Find added rows
    for (const [key, rowB] of mapB) {
      if (!mapA.has(key)) {
        added.push(rowB);
      }
    }

    logger.debug('Data comparison complete', {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
    });

    return { added, removed, changed };
  }

  /**
   * Generates a human-readable summary of report diffs.
   */
  generateDiffSummary(diffs: SectionDiff[]): DiffSummary {
    logger.info('Generating diff summary', { sectionCount: diffs.length });

    let totalChanges = 0;
    let additions = 0;
    let removals = 0;
    let modifications = 0;
    const sectionSummaries: string[] = [];

    for (const diff of diffs) {
      switch (diff.changeType) {
        case 'added':
          additions++;
          totalChanges++;
          sectionSummaries.push(`Section "${diff.sectionTitle}" was added.`);
          break;

        case 'removed':
          removals++;
          totalChanges++;
          sectionSummaries.push(`Section "${diff.sectionTitle}" was removed.`);
          break;

        case 'changed': {
          modifications++;
          totalChanges++;
          const parts: string[] = [];

          // Field-level changes
          for (const change of diff.changes) {
            if (change.field === 'title') {
              parts.push(`title changed from "${change.oldValue}" to "${change.newValue}"`);
            } else if (change.field === 'content') {
              parts.push('content was modified');
            } else {
              parts.push(`${change.field} was updated`);
            }
          }

          // Row-level changes
          if (diff.rowDiffs && diff.rowDiffs.length > 0) {
            const addedRows = diff.rowDiffs.filter((r) => r.changeType === 'added').length;
            const removedRows = diff.rowDiffs.filter((r) => r.changeType === 'removed').length;
            const changedRows = diff.rowDiffs.filter((r) => r.changeType === 'changed').length;
            const rowParts: string[] = [];
            if (addedRows) rowParts.push(`${addedRows} row${addedRows > 1 ? 's' : ''} added`);
            if (removedRows) rowParts.push(`${removedRows} row${removedRows > 1 ? 's' : ''} removed`);
            if (changedRows) rowParts.push(`${changedRows} row${changedRows > 1 ? 's' : ''} modified`);
            parts.push(rowParts.join(', '));
          }

          // Data point changes
          if (diff.dataPointDiffs && diff.dataPointDiffs.length > 0) {
            parts.push(`${diff.dataPointDiffs.length} data point${diff.dataPointDiffs.length > 1 ? 's' : ''} changed`);
          }

          sectionSummaries.push(
            `Section "${diff.sectionTitle}" (${diff.sectionType}): ${parts.join('; ')}.`,
          );
          break;
        }

        case 'unchanged':
          // Not included in summary
          break;
      }
    }

    const unchangedCount = diffs.filter((d) => d.changeType === 'unchanged').length;
    let overview: string;

    if (totalChanges === 0) {
      overview = 'The two reports are identical. No differences were found.';
    } else {
      const changeParts: string[] = [];
      if (additions) changeParts.push(`${additions} added`);
      if (removals) changeParts.push(`${removals} removed`);
      if (modifications) changeParts.push(`${modifications} modified`);
      overview =
        `Found ${totalChanges} section change${totalChanges > 1 ? 's' : ''}: ${changeParts.join(', ')}.` +
        (unchangedCount > 0 ? ` ${unchangedCount} section${unchangedCount > 1 ? 's' : ''} remained unchanged.` : '');
    }

    return {
      overview,
      sectionSummaries,
      statistics: { totalChanges, additions, removals, modifications },
    };
  }

  /**
   * Returns highlighted change markers between two sections, useful for
   * rendering visual diffs.
   */
  highlightChanges(sectionA: ReportSection, sectionB: ReportSection): HighlightResult {
    logger.debug('Highlighting changes', { sectionId: sectionA.id });

    const highlights: HighlightedChange[] = [];

    if (sectionA.type === 'text' || sectionA.type === 'summary') {
      const textA = typeof sectionA.content === 'string' ? sectionA.content : JSON.stringify(sectionA.content);
      const textB = typeof sectionB.content === 'string' ? sectionB.content : JSON.stringify(sectionB.content);

      const diffOps = textDiff(textA, textB);

      let posA = 0;
      let posB = 0;

      for (const op of diffOps) {
        if (op.type === 'equal') {
          posA += op.value.length;
          posB += op.value.length;
        } else if (op.type === 'removed') {
          highlights.push({
            position: posA,
            length: op.value.length,
            type: 'removed',
            text: op.value,
          });
          posA += op.value.length;
        } else if (op.type === 'added') {
          highlights.push({
            position: posB,
            length: op.value.length,
            type: 'added',
            text: op.value,
          });
          posB += op.value.length;
        }
      }
    } else if (sectionA.type === 'table') {
      const rowDiffs = this.diffTableData(sectionA.content, sectionB.content);
      let position = 0;
      for (const rowDiff of rowDiffs) {
        if (rowDiff.changeType === 'added') {
          highlights.push({
            position,
            length: 1,
            type: 'added',
            text: `Row "${rowDiff.key}" added`,
          });
        } else if (rowDiff.changeType === 'removed') {
          highlights.push({
            position,
            length: 1,
            type: 'removed',
            text: `Row "${rowDiff.key}" removed`,
          });
        } else if (rowDiff.changeType === 'changed') {
          for (const cellChange of rowDiff.cellChanges) {
            const pctStr =
              cellChange.percentageChange !== undefined
                ? ` (${cellChange.percentageChange >= 0 ? '+' : ''}${cellChange.percentageChange.toFixed(1)}%)`
                : '';
            highlights.push({
              position,
              length: 1,
              type: 'removed',
              text: `${cellChange.field}: ${cellChange.oldValue} -> ${cellChange.newValue}${pctStr}`,
            });
          }
        }
        position++;
      }
    } else if (sectionA.type === 'chart') {
      const dataPointDiffs = this.diffChartData(sectionA.content, sectionB.content);
      let position = 0;
      for (const dpDiff of dataPointDiffs) {
        const pctStr =
          dpDiff.percentageChange !== undefined
            ? ` (${dpDiff.percentageChange >= 0 ? '+' : ''}${dpDiff.percentageChange.toFixed(1)}%)`
            : '';
        highlights.push({
          position,
          length: 1,
          type: dpDiff.changeType === 'removed' ? 'removed' : 'added',
          text: `${dpDiff.field}: ${dpDiff.oldValue} -> ${dpDiff.newValue}${pctStr}`,
        });
        position++;
      }
    }

    const addedCount = highlights.filter((h) => h.type === 'added').length;
    const removedCount = highlights.filter((h) => h.type === 'removed').length;
    const summary =
      highlights.length === 0
        ? 'No differences found.'
        : `${highlights.length} change${highlights.length > 1 ? 's' : ''} detected: ${addedCount} addition${addedCount !== 1 ? 's' : ''}, ${removedCount} removal${removedCount !== 1 ? 's' : ''}.`;

    return { sectionId: sectionA.id, highlights, summary };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Diffs table content. Expects content to be an array of row objects or
   * an object with a `rows` property.
   */
  private diffTableData(contentA: unknown, contentB: unknown): RowDiff[] {
    const contentAObj = contentA as Record<string, any> | undefined;
    const contentBObj = contentB as Record<string, any> | undefined;
    const rowsA: Record<string, any>[] = Array.isArray(contentA)
      ? contentA
      : (contentAObj?.rows ?? contentAObj?.data ?? []) as Record<string, any>[];
    const rowsB: Record<string, any>[] = Array.isArray(contentB)
      ? contentB
      : (contentBObj?.rows ?? contentBObj?.data ?? []) as Record<string, any>[];

    const mapA = new Map<string, Record<string, any>>();
    const mapB = new Map<string, Record<string, any>>();

    for (const row of rowsA) mapA.set(getRowKey(row), row);
    for (const row of rowsB) mapB.set(getRowKey(row), row);

    const diffs: RowDiff[] = [];

    for (const [key, rowA] of mapA) {
      const rowB = mapB.get(key);
      if (!rowB) {
        diffs.push({ key, changeType: 'removed', cellChanges: [] });
      } else if (!deepEqual(rowA, rowB)) {
        diffs.push({ key, changeType: 'changed', cellChanges: this.diffRowCells(rowA, rowB) });
      }
    }

    for (const [key] of mapB) {
      if (!mapA.has(key)) {
        diffs.push({ key, changeType: 'added', cellChanges: [] });
      }
    }

    return diffs;
  }

  /**
   * Compares individual cells of two rows and computes percentage changes
   * for numeric values.
   */
  private diffRowCells(rowA: Record<string, any>, rowB: Record<string, any>): ValueChange[] {
    const allFields = new Set([...Object.keys(rowA), ...Object.keys(rowB)]);
    const changes: ValueChange[] = [];

    for (const field of allFields) {
      const valA = rowA[field];
      const valB = rowB[field];

      if (valA === undefined && valB !== undefined) {
        changes.push({ field, oldValue: null, newValue: valB, changeType: 'added' });
      } else if (valA !== undefined && valB === undefined) {
        changes.push({ field, oldValue: valA, newValue: null, changeType: 'removed' });
      } else if (!deepEqual(valA, valB)) {
        const change: ValueChange = {
          field,
          oldValue: valA,
          newValue: valB,
          changeType: 'changed',
        };
        if (isNumeric(valA) && isNumeric(valB)) {
          change.percentageChange = percentChange(valB, valA);
        }
        changes.push(change);
      }
    }

    return changes;
  }

  /**
   * Diffs chart data. Expects content to have a `data` or `dataPoints` array,
   * or be an array directly. Falls back to generic deep comparison.
   */
  private diffChartData(contentA: unknown, contentB: unknown): ValueChange[] {
    const contentAObj = contentA as Record<string, any> | undefined;
    const contentBObj = contentB as Record<string, any> | undefined;
    const pointsA: unknown[] = Array.isArray(contentA)
      ? contentA
      : (contentAObj?.dataPoints ?? contentAObj?.data ?? contentAObj?.datasets ?? []) as unknown[];
    const pointsB: unknown[] = Array.isArray(contentB)
      ? contentB
      : (contentBObj?.dataPoints ?? contentBObj?.data ?? contentBObj?.datasets ?? []) as unknown[];

    const changes: ValueChange[] = [];
    const maxLen = Math.max(pointsA.length, pointsB.length);

    for (let i = 0; i < maxLen; i++) {
      const a = pointsA[i];
      const b = pointsB[i];

      if (a === undefined && b !== undefined) {
        const label = typeof b === 'object' && b !== null ? ((b as any).label ?? (b as any).name ?? `Point ${i}`) : `Point ${i}`;
        changes.push({ field: String(label), oldValue: null, newValue: b, changeType: 'added' });
      } else if (a !== undefined && b === undefined) {
        const label = typeof a === 'object' && a !== null ? ((a as any).label ?? (a as any).name ?? `Point ${i}`) : `Point ${i}`;
        changes.push({ field: String(label), oldValue: a, newValue: null, changeType: 'removed' });
      } else if (!deepEqual(a, b)) {
        const label =
          typeof a === 'object' && a !== null ? ((a as any).label ?? (a as any).name ?? `Point ${i}`) : `Point ${i}`;

        if (isNumeric(a) && isNumeric(b)) {
          changes.push({
            field: String(label),
            oldValue: a,
            newValue: b,
            changeType: 'changed',
            percentageChange: percentChange(b, a),
          });
        } else if (
          typeof a === 'object' &&
          typeof b === 'object' &&
          a !== null &&
          b !== null &&
          isNumeric((a as any).value) &&
          isNumeric((b as any).value)
        ) {
          changes.push({
            field: String(label),
            oldValue: (a as any).value,
            newValue: (b as any).value,
            changeType: 'changed',
            percentageChange: percentChange((b as any).value, (a as any).value),
          });
        } else {
          changes.push({
            field: String(label),
            oldValue: a,
            newValue: b,
            changeType: 'changed',
          });
        }
      }
    }

    return changes;
  }
}

export const reportDiffService = new ReportDiffService();
