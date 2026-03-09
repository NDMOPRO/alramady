import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import * as XLSX from 'xlsx';

// ─── Types ─────────────────────────────────────────────────────────

interface ColumnDiff {
  name: string;
  status: 'added' | 'removed' | 'unchanged' | 'type_changed' | 'renamed';
  oldType?: string | null;
  newType?: string | null;
  oldName?: string;
  newName?: string;
}

interface ValueChange {
  rowIndex: number;
  column: string;
  oldValue: unknown;
  newValue: unknown;
}

interface RowDiff {
  addedRows: number;
  removedRows: number;
  modifiedRows: number;
  unchangedRows: number;
  addedRowIndices: number[];
  removedRowIndices: number[];
  modifiedRowIndices: number[];
}

interface ColumnStatsDiff {
  column: string;
  oldStats: ColumnStats;
  newStats: ColumnStats;
  changes: string[];
}

interface ColumnStats {
  count: number;
  nullCount: number;
  uniqueCount: number;
  mean?: number;
  min?: unknown;
  max?: unknown;
  mostFrequent?: unknown;
}

interface DiffResult {
  summary: {
    structuralChanges: number;
    valueChanges: number;
    addedRows: number;
    removedRows: number;
    modifiedRows: number;
    overallSimilarity: number;
  };
  columns: ColumnDiff[];
  rows: RowDiff;
  valueChanges: ValueChange[];
  statisticsDiff: ColumnStatsDiff[];
  executionTimeMs: number;
}

interface FileDiffResult {
  format: string;
  leftRowCount: number;
  rightRowCount: number;
  diff: DiffResult;
}

interface DiffReportHtml {
  html: string;
  format: 'html';
}

interface DiffReportJson {
  data: DiffResult;
  format: 'json';
}

type DiffReport = DiffReportHtml | DiffReportJson;

// ─── Service ───────────────────────────────────────────────────────

export class TableDiffEngineService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async compareDatasets(
    datasetId1: string,
    datasetId2: string,
    tenantId: string
  ): Promise<DiffResult> {
    logger.info('Comparing datasets', { datasetId1, datasetId2, tenantId });
    const startTime = Date.now();

    // Load both datasets
    const [ds1, ds2] = await Promise.all([
      this.loadDataset(datasetId1, tenantId),
      this.loadDataset(datasetId2, tenantId),
    ]);

    const result = this.computeDiff(
      ds1.columns,
      ds2.columns,
      ds1.rows,
      ds2.rows
    );

    result.executionTimeMs = Date.now() - startTime;

    // Audit
    await this.logAudit(tenantId, 'table_diff_compare', JSON.stringify({
      datasetId1,
      datasetId2,
      structuralChanges: result.summary.structuralChanges,
      valueChanges: result.summary.valueChanges,
    }));

    return result;
  }

  async compareFiles(
    file1: Buffer,
    file2: Buffer,
    format: string
  ): Promise<FileDiffResult> {
    logger.info('Comparing files', { format, file1Size: file1.length, file2Size: file2.length });

    const rows1 = this.parseFileToRows(file1, format);
    const rows2 = this.parseFileToRows(file2, format);

    const cols1 = rows1.length > 0 ? Object.keys(rows1[0]).map(name => ({ name, dataType: null })) : [];
    const cols2 = rows2.length > 0 ? Object.keys(rows2[0]).map(name => ({ name, dataType: null })) : [];

    const diff = this.computeDiff(
      cols1.map(c => ({ name: c.name, dataType: c.dataType as string | null })),
      cols2.map(c => ({ name: c.name, dataType: c.dataType as string | null })),
      rows1,
      rows2
    );

    return {
      format,
      leftRowCount: rows1.length,
      rightRowCount: rows2.length,
      diff,
    };
  }

  generateDiffReport(diffResult: DiffResult, format: 'html' | 'json'): DiffReport {
    if (format === 'json') {
      return { data: diffResult, format: 'json' };
    }

    return { html: this.generateHtmlReport(diffResult), format: 'html' };
  }

  // ─── Private: Core diff logic ──────────────────────────────────

  private computeDiff(
    cols1: Array<{ name: string; dataType: string | null }>,
    cols2: Array<{ name: string; dataType: string | null }>,
    rows1: Record<string, unknown>[],
    rows2: Record<string, unknown>[]
  ): DiffResult {
    const startTime = Date.now();

    // Column diff
    const columnDiffs = this.diffColumns(cols1, cols2);

    // Row diff
    const rowDiff = this.diffRows(rows1, rows2);

    // Value changes (limit to avoid memory issues)
    const valueChanges = this.diffValues(rows1, rows2, cols1, cols2);

    // Statistics diff
    const commonColumns = cols1.filter(c1 => cols2.some(c2 => c2.name === c1.name));
    const statsDiff = commonColumns.map(col => {
      const oldStats = this.computeColumnStats(rows1, col.name);
      const newStats = this.computeColumnStats(rows2, col.name);
      return {
        column: col.name,
        oldStats,
        newStats,
        changes: this.describeStatsChanges(oldStats, newStats, col.name),
      };
    });

    // Compute similarity
    const totalCells = Math.max(
      rows1.length * cols1.length,
      rows2.length * cols2.length,
      1
    );
    const changedCells = valueChanges.length + rowDiff.addedRows * cols2.length + rowDiff.removedRows * cols1.length;
    const similarity = Math.max(0, Math.min(1, 1 - changedCells / totalCells));

    return {
      summary: {
        structuralChanges: columnDiffs.filter(c => c.status !== 'unchanged').length,
        valueChanges: valueChanges.length,
        addedRows: rowDiff.addedRows,
        removedRows: rowDiff.removedRows,
        modifiedRows: rowDiff.modifiedRows,
        overallSimilarity: Math.round(similarity * 10000) / 10000,
      },
      columns: columnDiffs,
      rows: rowDiff,
      valueChanges: valueChanges.slice(0, 1000),
      statisticsDiff: statsDiff,
      executionTimeMs: Date.now() - startTime,
    };
  }

  private diffColumns(
    cols1: Array<{ name: string; dataType: string | null }>,
    cols2: Array<{ name: string; dataType: string | null }>
  ): ColumnDiff[] {
    const diffs: ColumnDiff[] = [];
    const names1 = new Set(cols1.map(c => c.name));
    const names2 = new Set(cols2.map(c => c.name));
    const typeMap1 = new Map(cols1.map(c => [c.name, c.dataType]));
    const typeMap2 = new Map(cols2.map(c => [c.name, c.dataType]));

    // Check common and changed columns
    for (const col of cols1) {
      if (names2.has(col.name)) {
        const oldType = typeMap1.get(col.name) || null;
        const newType = typeMap2.get(col.name) || null;
        if (oldType !== newType) {
          diffs.push({
            name: col.name,
            status: 'type_changed',
            oldType,
            newType,
          });
        } else {
          diffs.push({
            name: col.name,
            status: 'unchanged',
          });
        }
      } else {
        // Check if it was renamed (similar values in another column)
        const renamed = this.detectRenamedColumn(col.name, cols2, names1);
        if (renamed) {
          diffs.push({
            name: col.name,
            status: 'renamed',
            oldName: col.name,
            newName: renamed,
          });
        } else {
          diffs.push({
            name: col.name,
            status: 'removed',
          });
        }
      }
    }

    // Added columns
    for (const col of cols2) {
      if (!names1.has(col.name)) {
        const isRenamed = diffs.some(d => d.status === 'renamed' && d.newName === col.name);
        if (!isRenamed) {
          diffs.push({
            name: col.name,
            status: 'added',
          });
        }
      }
    }

    return diffs;
  }

  private detectRenamedColumn(
    oldName: string,
    newCols: Array<{ name: string; dataType: string | null }>,
    existingOldNames: Set<string>
  ): string | null {
    for (const nc of newCols) {
      if (existingOldNames.has(nc.name)) continue;
      // Simple heuristic: similar names
      const similarity = this.nameSimilarity(oldName, nc.name);
      if (similarity > 0.7) return nc.name;
    }
    return null;
  }

  private nameSimilarity(a: string, b: string): number {
    const na = a.toLowerCase().replace(/[_\-\s]/g, '');
    const nb = b.toLowerCase().replace(/[_\-\s]/g, '');
    if (na === nb) return 1;
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen === 0) return 1;
    const dist = this.levenshteinDistance(na, nb);
    return 1 - dist / maxLen;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m: number[][] = [];
    for (let i = 0; i <= a.length; i++) m[i] = [i];
    for (let j = 0; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
      }
    }
    return m[a.length][b.length];
  }

  private diffRows(
    rows1: Record<string, unknown>[],
    rows2: Record<string, unknown>[]
  ): RowDiff {
    const hash1 = new Map<string, number>();
    const hash2 = new Map<string, number>();

    for (let i = 0; i < rows1.length; i++) {
      hash1.set(this.hashRow(rows1[i]), i);
    }
    for (let i = 0; i < rows2.length; i++) {
      hash2.set(this.hashRow(rows2[i]), i);
    }

    const addedRowIndices: number[] = [];
    const removedRowIndices: number[] = [];
    const modifiedRowIndices: number[] = [];
    let unchangedRows = 0;

    // Find removed/modified rows
    for (const [hash, idx] of hash1) {
      if (hash2.has(hash)) {
        unchangedRows++;
      } else {
        // Check if row exists at same index but modified
        if (idx < rows2.length) {
          modifiedRowIndices.push(idx);
        } else {
          removedRowIndices.push(idx);
        }
      }
    }

    // Find added rows
    for (const [hash, idx] of hash2) {
      if (!hash1.has(hash) && idx >= rows1.length) {
        addedRowIndices.push(idx);
      }
    }

    return {
      addedRows: addedRowIndices.length,
      removedRows: removedRowIndices.length,
      modifiedRows: modifiedRowIndices.length,
      unchangedRows,
      addedRowIndices: addedRowIndices.slice(0, 500),
      removedRowIndices: removedRowIndices.slice(0, 500),
      modifiedRowIndices: modifiedRowIndices.slice(0, 500),
    };
  }

  private diffValues(
    rows1: Record<string, unknown>[],
    rows2: Record<string, unknown>[],
    cols1: Array<{ name: string; dataType: string | null }>,
    cols2: Array<{ name: string; dataType: string | null }>
  ): ValueChange[] {
    const changes: ValueChange[] = [];
    const commonCols = cols1.filter(c => cols2.some(c2 => c2.name === c.name));
    const maxRows = Math.min(rows1.length, rows2.length);
    const MAX_CHANGES = 1000;

    for (let i = 0; i < maxRows && changes.length < MAX_CHANGES; i++) {
      for (const col of commonCols) {
        if (changes.length >= MAX_CHANGES) break;
        const oldVal = rows1[i][col.name];
        const newVal = rows2[i][col.name];

        if (!this.valuesEqual(oldVal, newVal)) {
          changes.push({
            rowIndex: i,
            column: col.name,
            oldValue: oldVal,
            newValue: newVal,
          });
        }
      }
    }

    return changes;
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || a === undefined) return b === null || b === undefined;
    if (b === null || b === undefined) return false;
    return String(a) === String(b);
  }

  private hashRow(row: Record<string, unknown>): string {
    const keys = Object.keys(row).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(`${k}:${String(row[k] ?? '')}`);
    }
    return parts.join('|');
  }

  private computeColumnStats(rows: Record<string, unknown>[], column: string): ColumnStats {
    const values = rows.map(r => r[column]);
    const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
    const unique = new Set(nonNull.map(String));

    const stats: ColumnStats = {
      count: values.length,
      nullCount: values.length - nonNull.length,
      uniqueCount: unique.size,
    };

    // Numeric statistics
    const numbers = nonNull.map(v => Number(v)).filter(n => !isNaN(n));
    if (numbers.length > 0) {
      stats.mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      stats.min = Math.min(...numbers);
      stats.max = Math.max(...numbers);
    } else if (nonNull.length > 0) {
      const sorted = nonNull.map(String).sort();
      stats.min = sorted[0];
      stats.max = sorted[sorted.length - 1];
    }

    // Most frequent value
    if (nonNull.length > 0) {
      const freq = new Map<string, number>();
      for (const v of nonNull) {
        const key = String(v);
        freq.set(key, (freq.get(key) || 0) + 1);
      }
      let maxCount = 0;
      let mostFreq = '';
      for (const [val, count] of freq) {
        if (count > maxCount) {
          maxCount = count;
          mostFreq = val;
        }
      }
      stats.mostFrequent = mostFreq;
    }

    return stats;
  }

  private describeStatsChanges(
    oldStats: ColumnStats,
    newStats: ColumnStats,
    column: string
  ): string[] {
    const changes: string[] = [];

    if (oldStats.count !== newStats.count) {
      changes.push(`عدد السجلات تغير من ${oldStats.count} إلى ${newStats.count}`);
    }

    if (oldStats.nullCount !== newStats.nullCount) {
      changes.push(`القيم الفارغة تغيرت من ${oldStats.nullCount} إلى ${newStats.nullCount}`);
    }

    if (oldStats.uniqueCount !== newStats.uniqueCount) {
      changes.push(`القيم الفريدة تغيرت من ${oldStats.uniqueCount} إلى ${newStats.uniqueCount}`);
    }

    if (oldStats.mean !== undefined && newStats.mean !== undefined) {
      const oldMean = Math.round(oldStats.mean * 100) / 100;
      const newMean = Math.round(newStats.mean * 100) / 100;
      if (oldMean !== newMean) {
        const pctChange = oldMean !== 0 ? Math.round(((newMean - oldMean) / Math.abs(oldMean)) * 10000) / 100 : 0;
        changes.push(`المتوسط تغير من ${oldMean} إلى ${newMean} (${pctChange > 0 ? '+' : ''}${pctChange}%)`);
      }
    }

    if (String(oldStats.min) !== String(newStats.min)) {
      changes.push(`الحد الأدنى تغير من ${String(oldStats.min)} إلى ${String(newStats.min)}`);
    }

    if (String(oldStats.max) !== String(newStats.max)) {
      changes.push(`الحد الأقصى تغير من ${String(oldStats.max)} إلى ${String(newStats.max)}`);
    }

    if (changes.length === 0) {
      changes.push(`لا توجد تغييرات إحصائية في عمود ${column}`);
    }

    return changes;
  }

  // ─── File parsing ──────────────────────────────────────────────

  private parseFileToRows(buffer: Buffer, format: string): Record<string, unknown>[] {
    const lowerFormat = format.toLowerCase();

    if (lowerFormat === 'csv' || lowerFormat === 'tsv') {
      return this.parseCSV(buffer, lowerFormat === 'tsv' ? '\t' : ',');
    }

    if (lowerFormat === 'excel' || lowerFormat === 'xlsx' || lowerFormat === 'xls') {
      return this.parseExcel(buffer);
    }

    if (lowerFormat === 'json') {
      return this.parseJSON(buffer);
    }

    throw new Error(`Unsupported file format: ${format}`);
  }

  private parseCSV(buffer: Buffer, delimiter: string): Record<string, unknown>[] {
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return [];

    const headers = this.parseCSVLine(lines[0], delimiter);
    const rows: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i], delimiter);
      const row: Record<string, unknown> = {};
      for (let j = 0; j < headers.length; j++) {
        const val = values[j] ?? null;
        row[headers[j]] = val === '' ? null : this.autoConvert(val);
      }
      rows.push(row);
    }

    return rows;
  }

  private parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      if (inQuotes) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += line[i];
        }
      } else {
        if (line[i] === '"') {
          inQuotes = true;
        } else if (line[i] === delimiter) {
          result.push(current.trim());
          current = '';
        } else {
          current += line[i];
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  private parseExcel(buffer: Buffer): Record<string, unknown>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return [];

    const sheet = workbook.Sheets[firstSheet];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
    return jsonData;
  }

  private parseJSON(buffer: Buffer): Record<string, unknown>[] {
    const text = buffer.toString('utf-8').trim();

    // Try JSON array
    if (text.startsWith('[')) {
      const parsed = JSON.parse(text) as unknown[];
      return parsed.filter((item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
      );
    }

    // Try JSONL
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    return lines.map(line => JSON.parse(line) as Record<string, unknown>);
  }

  private autoConvert(value: string | null): unknown {
    if (value === null || value === undefined) return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') return num;
    return value;
  }

  // ─── HTML Report generation ────────────────────────────────────

  private generateHtmlReport(diff: DiffResult): string {
    const escapeHtml = (str: string): string =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>تقرير مقارنة البيانات</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, sans-serif; margin: 20px; direction: rtl; background: #f9fafb; }
  .summary { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  .summary h2 { margin-top: 0; color: #1f2937; }
  .stat { display: inline-block; background: #f3f4f6; border-radius: 6px; padding: 10px 16px; margin: 4px; }
  .stat .value { font-size: 24px; font-weight: bold; color: #3b82f6; }
  .stat .label { font-size: 12px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
  th { background: #1f2937; color: #fff; padding: 10px 12px; text-align: right; }
  td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
  tr:hover { background: #f9fafb; }
  .added { background: #dcfce7; }
  .removed { background: #fef2f2; }
  .changed { background: #fefce8; }
  .unchanged { color: #9ca3af; }
  .section-title { font-size: 18px; font-weight: 600; color: #1f2937; margin: 20px 0 10px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
  .badge-added { background: #dcfce7; color: #166534; }
  .badge-removed { background: #fef2f2; color: #991b1b; }
  .badge-changed { background: #fefce8; color: #854d0e; }
  .badge-unchanged { background: #f3f4f6; color: #6b7280; }
</style>
</head>
<body>
<h1>تقرير مقارنة البيانات</h1>

<div class="summary">
  <h2>ملخص المقارنة</h2>
  <div class="stat"><div class="value">${Math.round(diff.summary.overallSimilarity * 100)}%</div><div class="label">نسبة التطابق</div></div>
  <div class="stat"><div class="value">${diff.summary.structuralChanges}</div><div class="label">تغييرات هيكلية</div></div>
  <div class="stat"><div class="value">${diff.summary.valueChanges}</div><div class="label">تغييرات في القيم</div></div>
  <div class="stat"><div class="value">${diff.summary.addedRows}</div><div class="label">صفوف مضافة</div></div>
  <div class="stat"><div class="value">${diff.summary.removedRows}</div><div class="label">صفوف محذوفة</div></div>
  <div class="stat"><div class="value">${diff.summary.modifiedRows}</div><div class="label">صفوف معدلة</div></div>
</div>

<div class="section-title">التغييرات الهيكلية (الأعمدة)</div>
<table>
<thead><tr><th>العمود</th><th>الحالة</th><th>التفاصيل</th></tr></thead>
<tbody>`;

    for (const col of diff.columns) {
      const statusClass = col.status === 'added' ? 'added' : col.status === 'removed' ? 'removed' : col.status === 'type_changed' || col.status === 'renamed' ? 'changed' : '';
      const badgeClass = `badge-${col.status === 'type_changed' || col.status === 'renamed' ? 'changed' : col.status}`;
      const statusLabel = col.status === 'added' ? 'مضاف' : col.status === 'removed' ? 'محذوف' : col.status === 'type_changed' ? 'تغيير نوع' : col.status === 'renamed' ? 'تمت إعادة تسمية' : 'بدون تغيير';
      let details = '';
      if (col.status === 'type_changed') details = `${escapeHtml(String(col.oldType || ''))} -> ${escapeHtml(String(col.newType || ''))}`;
      if (col.status === 'renamed') details = `${escapeHtml(col.oldName || '')} -> ${escapeHtml(col.newName || '')}`;

      html += `<tr class="${statusClass}"><td>${escapeHtml(col.name)}</td><td><span class="badge ${badgeClass}">${statusLabel}</span></td><td>${details}</td></tr>`;
    }

    html += `</tbody></table>`;

    // Value changes
    if (diff.valueChanges.length > 0) {
      html += `<div class="section-title">تغييرات القيم (أول ${Math.min(diff.valueChanges.length, 50)} تغيير)</div>
<table>
<thead><tr><th>الصف</th><th>العمود</th><th>القيمة القديمة</th><th>القيمة الجديدة</th></tr></thead>
<tbody>`;

      for (const vc of diff.valueChanges.slice(0, 50)) {
        html += `<tr class="changed">
  <td>${vc.rowIndex}</td>
  <td>${escapeHtml(vc.column)}</td>
  <td class="removed">${escapeHtml(String(vc.oldValue ?? 'فارغ'))}</td>
  <td class="added">${escapeHtml(String(vc.newValue ?? 'فارغ'))}</td>
</tr>`;
      }

      html += `</tbody></table>`;
    }

    // Statistics diff
    if (diff.statisticsDiff.length > 0) {
      html += `<div class="section-title">التغييرات الإحصائية</div>
<table>
<thead><tr><th>العمود</th><th>التغييرات</th></tr></thead>
<tbody>`;

      for (const sd of diff.statisticsDiff) {
        const changesHtml = sd.changes.map(c => escapeHtml(c)).join('<br>');
        html += `<tr><td>${escapeHtml(sd.column)}</td><td>${changesHtml}</td></tr>`;
      }

      html += `</tbody></table>`;
    }

    html += `
<p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 30px;">
  تم إنشاء هذا التقرير بواسطة منصة راصد - ${new Date().toISOString().split('T')[0]}
</p>
</body></html>`;

    return html;
  }

  // ─── Dataset loading ───────────────────────────────────────────

  private async loadDataset(
    datasetId: string,
    tenantId: string
  ): Promise<{
    columns: Array<{ name: string; dataType: string | null }>;
    rows: Record<string, unknown>[];
  }> {
    const dataset = await this.prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    if (!dataset) throw new Error(`Dataset '${datasetId}' not found`);

    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      select: { data: true },
    });

    return {
      columns: dataset.columns.map(c => ({ name: c.name, dataType: c.dataType })),
      rows: dataRows.map(r => r.data as Record<string, unknown>),
    };
  }

  private async logAudit(tenantId: string, action: string, details: string): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          userId: '00000000-0000-0000-0000-000000000000',
          action,
          entityType: 'dataset',
          detailsJson: { action, details, timestamp: new Date().toISOString() },
        },
      });
    } catch (err) {
      logger.warn('Failed to write audit log', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
