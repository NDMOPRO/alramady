import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class CleansingService {

  async removeDuplicates(datasetId: string, columns: string[], threshold: number = 1.0) {
    const allRows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    const seen = new Map<string, number>();
    const duplicateIds: string[] = [];

    for (const row of allRows) {
      const data = row.data as Record<string, any>;
      const key = columns.map(c => String(data[c] ?? '')).join('|');

      if (threshold >= 1.0) {
        if (seen.has(key)) {
          duplicateIds.push(row.id);
        } else {
          seen.set(key, row.rowIndex);
        }
      } else {
        let isDuplicate = false;
        for (const [existingKey] of seen) {
          const similarity = this.jaroWinkler(key, existingKey);
          if (similarity >= threshold) {
            isDuplicate = true;
            break;
          }
        }
        if (isDuplicate) {
          duplicateIds.push(row.id);
        } else {
          seen.set(key, row.rowIndex);
        }
      }
    }

    if (duplicateIds.length > 0) {
      await prisma.dataRow.deleteMany({ where: { id: { in: duplicateIds } } });
      await prisma.dataset.update({
        where: { id: datasetId },
        data: { rowCount: BigInt(allRows.length - duplicateIds.length) },
      });
    }

    await prisma.dataQualityCheck.create({
      data: {
        datasetId,
        checkType: 'uniqueness',
        result: duplicateIds.length === 0 ? 'pass' : 'warning',
        detailsJson: { duplicatesRemoved: duplicateIds.length, totalRows: allRows.length, columns, threshold },
      },
    });

    return { duplicatesRemoved: duplicateIds.length, remainingRows: allRows.length - duplicateIds.length };
  }

  async handleMissing(datasetId: string, column: string, strategy: 'mean' | 'median' | 'mode' | 'forward' | 'backward' | 'drop' | 'interpolate') {
    const allRows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    const values = allRows.map(r => (r.data as Record<string, any>)[column]).filter(v => v !== null && v !== undefined && v !== '');
    let fillValue: string | number | null = null;
    let dropped = 0;

    if (strategy === 'mean') {
      const nums = values.map(Number).filter(n => !isNaN(n));
      fillValue = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    } else if (strategy === 'median') {
      const nums = values.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
      fillValue = nums.length > 0 ? (nums.length % 2 === 0 ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2 : nums[Math.floor(nums.length / 2)]) : 0;
    } else if (strategy === 'mode') {
      const freq = new Map<string, number>();
      values.forEach(v => freq.set(String(v), (freq.get(String(v)) || 0) + 1));
      let maxFreq = 0;
      for (const [val, count] of freq) { if (count > maxFreq) { maxFreq = count; fillValue = val; } }
    }

    for (let i = 0; i < allRows.length; i++) {
      const data = allRows[i].data as Record<string, any>;
      if (data[column] === null || data[column] === undefined || data[column] === '') {
        if (strategy === 'drop') {
          await prisma.dataRow.delete({ where: { id: allRows[i].id } });
          dropped++;
          continue;
        }
        if (strategy === 'forward') {
          fillValue = i > 0 ? (allRows[i - 1].data as Record<string, any>)[column] : null;
        } else if (strategy === 'backward') {
          for (let j = i + 1; j < allRows.length; j++) {
            const nextVal = (allRows[j].data as Record<string, any>)[column];
            if (nextVal !== null && nextVal !== undefined && nextVal !== '') { fillValue = nextVal; break; }
          }
        } else if (strategy === 'interpolate') {
          let prevVal: number | null = null;
          let nextVal: number | null = null;
          for (let j = i - 1; j >= 0; j--) {
            const v = Number((allRows[j].data as Record<string, any>)[column]);
            if (!isNaN(v)) { prevVal = v; break; }
          }
          for (let j = i + 1; j < allRows.length; j++) {
            const v = Number((allRows[j].data as Record<string, any>)[column]);
            if (!isNaN(v)) { nextVal = v; break; }
          }
          fillValue = prevVal !== null && nextVal !== null ? (prevVal + nextVal) / 2 : prevVal ?? nextVal ?? 0;
        }

        if (fillValue !== null && (strategy as string) !== 'drop') {
          data[column] = fillValue;
          await prisma.dataRow.update({
            where: { id: allRows[i].id },
            data: { data: JSON.parse(JSON.stringify(data)) },
          });
        }
      }
    }

    if (strategy === 'drop' && dropped > 0) {
      const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } });
      if (dataset) {
        await prisma.dataset.update({
          where: { id: datasetId },
          data: { rowCount: BigInt(Number(dataset.rowCount || 0) - dropped) },
        });
      }
    }

    return { strategy, column, rowsAffected: strategy === 'drop' ? dropped : allRows.filter(r => (r.data as Record<string, any>)[column] === null || (r.data as Record<string, any>)[column] === undefined || (r.data as Record<string, any>)[column] === '').length, fillValue: strategy !== 'drop' ? fillValue : undefined };
  }

  async normalizeValues(datasetId: string, column: string, method: 'minmax' | 'zscore' | 'log' | 'robust') {
    const allRows = await prisma.dataRow.findMany({ where: { datasetId }, orderBy: { rowIndex: 'asc' } });
    const values = allRows.map(r => Number((r.data as Record<string, any>)[column])).filter(n => !isNaN(n));

    if (values.length === 0) throw new Error(`No numeric values found in column ${column}`);

    let normalize: (v: number) => number;

    if (method === 'minmax') {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      normalize = (v) => (v - min) / range;
    } else if (method === 'zscore') {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length) || 1;
      normalize = (v) => (v - mean) / std;
    } else if (method === 'log') {
      normalize = (v) => v > 0 ? Math.log(v) : 0;
    } else {
      const sorted = [...values].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1 || 1;
      const median = sorted[Math.floor(sorted.length / 2)];
      normalize = (v) => (v - median) / iqr;
    }

    let updated = 0;
    for (const row of allRows) {
      const data = row.data as Record<string, any>;
      const val = Number(data[column]);
      if (!isNaN(val)) {
        data[`${column}_normalized`] = Math.round(normalize(val) * 10000) / 10000;
        await prisma.dataRow.update({ where: { id: row.id }, data: { data } });
        updated++;
      }
    }

    return { method, column, rowsNormalized: updated };
  }

  async detectOutliers(datasetId: string, column: string, method: 'iqr' | 'zscore' | 'modified_zscore' = 'iqr') {
    const allRows = await prisma.dataRow.findMany({ where: { datasetId }, orderBy: { rowIndex: 'asc' } });
    const values = allRows.map(r => ({ id: r.id, rowIndex: r.rowIndex, value: Number((r.data as Record<string, any>)[column]) })).filter(v => !isNaN(v.value));

    const nums = values.map(v => v.value);
    const sorted = [...nums].sort((a, b) => a - b);
    const outliers: { rowIndex: number; value: number; reason: string }[] = [];

    if (method === 'iqr') {
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;
      values.forEach(v => {
        if (v.value < lower || v.value > upper) {
          outliers.push({ rowIndex: v.rowIndex, value: v.value, reason: `Outside IQR range [${lower.toFixed(2)}, ${upper.toFixed(2)}]` });
        }
      });
    } else if (method === 'zscore') {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const std = Math.sqrt(nums.reduce((s, n) => s + Math.pow(n - mean, 2), 0) / nums.length) || 1;
      values.forEach(v => {
        const z = Math.abs((v.value - mean) / std);
        if (z > 3) {
          outliers.push({ rowIndex: v.rowIndex, value: v.value, reason: `Z-score ${z.toFixed(2)} > 3` });
        }
      });
    } else {
      const median = sorted[Math.floor(sorted.length / 2)];
      const mad = sorted.map(v => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)] || 1;
      values.forEach(v => {
        const mz = Math.abs(0.6745 * (v.value - median) / mad);
        if (mz > 3.5) {
          outliers.push({ rowIndex: v.rowIndex, value: v.value, reason: `Modified Z-score ${mz.toFixed(2)} > 3.5` });
        }
      });
    }

    await prisma.dataQualityCheck.create({
      data: {
        datasetId,
        checkType: 'accuracy',
        result: outliers.length === 0 ? 'pass' : 'warning',
        detailsJson: { method, column, outliersFound: outliers.length, outliers: outliers.slice(0, 100) },
      },
    });

    return { method, column, outliersFound: outliers.length, outliers: outliers.slice(0, 50) };
  }

  async validateDataTypes(datasetId: string) {
    const columns = await prisma.datasetColumn.findMany({ where: { datasetId } });
    const allRows = await prisma.dataRow.findMany({ where: { datasetId }, take: 10000, orderBy: { rowIndex: 'asc' } });
    const issues: { rowIndex: number; column: string; expectedType: string; actualValue: unknown }[] = [];

    for (const row of allRows) {
      const data = row.data as Record<string, any>;
      for (const col of columns) {
        const val = data[col.name];
        if (val === null || val === undefined) continue;

        if ((col.dataType === 'integer' || col.dataType === 'float') && typeof val === 'string' && isNaN(Number(val))) {
          issues.push({ rowIndex: row.rowIndex, column: col.name, expectedType: col.dataType || 'unknown', actualValue: val });
        }
        if (col.dataType === 'boolean' && typeof val === 'string' && !['true', 'false', '0', '1'].includes(val.toLowerCase())) {
          issues.push({ rowIndex: row.rowIndex, column: col.name, expectedType: 'boolean', actualValue: val });
        }
      }
    }

    await prisma.dataQualityCheck.create({
      data: {
        datasetId,
        checkType: 'validity',
        result: issues.length === 0 ? 'pass' : 'fail',
        detailsJson: JSON.parse(JSON.stringify({ issuesFound: issues.length, issues: issues.slice(0, 100) })),
      },
    });

    return { valid: issues.length === 0, issuesFound: issues.length, issues: issues.slice(0, 50) };
  }

  async trimWhitespace(datasetId: string) {
    const columns = await prisma.datasetColumn.findMany({ where: { datasetId } });
    const stringCols = columns.filter(c => c.dataType === 'string' || c.dataType === 'text');
    const allRows = await prisma.dataRow.findMany({ where: { datasetId } });
    let trimmed = 0;

    for (const row of allRows) {
      const data = row.data as Record<string, any>;
      let changed = false;
      for (const col of stringCols) {
        if (typeof data[col.name] === 'string') {
          const original = data[col.name];
          data[col.name] = original.trim().replace(/\s+/g, ' ');
          if (data[col.name] !== original) changed = true;
        }
      }
      if (changed) {
        await prisma.dataRow.update({ where: { id: row.id }, data: { data } });
        trimmed++;
      }
    }

    return { rowsTrimmed: trimmed, columnsProcessed: stringCols.map(c => c.name) };
  }

  private jaroWinkler(s1: string, s2: string): number {
    if (s1 === s2) return 1;
    const len1 = s1.length, len2 = s2.length;
    if (len1 === 0 || len2 === 0) return 0;

    const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);
    let matches = 0, transpositions = 0;

    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchDist);
      const end = Math.min(i + matchDist + 1, len2);
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
  }
}

export const cleansingService = new CleansingService();
