import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

interface OutlierResult {
  rowIndex: number;
  value: number;
  reason: string;
}

interface FormatRule {
  column: string;
  type: 'date' | 'phone' | 'email' | 'uppercase' | 'lowercase' | 'capitalize' | 'trim' | 'custom';
  format?: string;
  pattern?: string;
  replacement?: string;
}

export default class DataCleansingService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async removeDuplicates(
    datasetId: string,
    columns: string[],
    threshold: number = 1.0
  ): Promise<{
    duplicatesRemoved: number;
    remainingRows: number;
    duplicateGroups: number;
  }> {
    const allRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    if (allRows.length === 0) {
      throw new Error(`Dataset "${datasetId}" has no rows`);
    }

    if (columns.length === 0) {
      throw new Error('At least one column must be specified for deduplication');
    }

    const seen = new Map<string, { id: string; rowIndex: number }>();
    const duplicateIds: string[] = [];
    let duplicateGroups = 0;

    for (const row of allRows) {
      const data = row.data as Record<string, any>;
      const keyParts = columns.map((col) => {
        const val = data[col];
        if (val === null || val === undefined) return '__NULL__';
        return String(val).trim().toLowerCase();
      });
      const key = keyParts.join('|||');

      if (threshold >= 1.0) {
        if (seen.has(key)) {
          duplicateIds.push(row.id);
          if (!duplicateIds.includes(seen.get(key)!.id)) {
            duplicateGroups++;
          }
        } else {
          seen.set(key, { id: row.id, rowIndex: row.rowIndex });
        }
      } else {
        let foundMatch = false;
        for (const [existingKey, existingMeta] of seen) {
          const similarity = this.computeSimilarity(key, existingKey);
          if (similarity >= threshold) {
            duplicateIds.push(row.id);
            foundMatch = true;
            if (
              duplicateIds.filter((did) => did === existingMeta.id).length === 0 &&
              !duplicateIds.includes(existingMeta.id)
            ) {
              duplicateGroups++;
            }
            break;
          }
        }
        if (!foundMatch) {
          seen.set(key, { id: row.id, rowIndex: row.rowIndex });
        }
      }
    }

    if (duplicateIds.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < duplicateIds.length; i += BATCH) {
        const batch = duplicateIds.slice(i, i + BATCH);
        await this.prisma.dataRow.deleteMany({
          where: { id: { in: batch } },
        });
      }

      await this.prisma.dataset.update({
        where: { id: datasetId },
        data: { rowCount: BigInt(allRows.length - duplicateIds.length) },
      });
    }

    await this.prisma.dataQualityCheck.create({
      data: {
        datasetId,
        checkType: 'uniqueness',
        result: duplicateIds.length === 0 ? 'pass' : 'warning',
        detailsJson: {
          duplicatesRemoved: duplicateIds.length,
          totalRows: allRows.length,
          remainingRows: allRows.length - duplicateIds.length,
          columns,
          threshold,
          duplicateGroups,
        },
      },
    });

    logger.info(`Deduplication complete for dataset ${datasetId}`, {
      removed: duplicateIds.length,
      remaining: allRows.length - duplicateIds.length,
    });

    return {
      duplicatesRemoved: duplicateIds.length,
      remainingRows: allRows.length - duplicateIds.length,
      duplicateGroups,
    };
  }

  async handleMissing(
    datasetId: string,
    column: string,
    strategy: 'mean' | 'median' | 'mode' | 'drop' | 'forward' | 'backward'
  ): Promise<{
    strategy: string;
    column: string;
    rowsAffected: number;
    fillValue: unknown;
  }> {
    const allRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    if (allRows.length === 0) {
      throw new Error(`Dataset "${datasetId}" has no rows`);
    }

    const values = allRows
      .map((r) => (r.data as Record<string, any>)[column])
      .filter((v) => v !== null && v !== undefined && v !== '');

    let fillValue: any = null;
    let rowsAffected = 0;

    if (strategy === 'mean') {
      const nums = values.map(Number).filter((n) => !isNaN(n));
      if (nums.length === 0) {
        throw new Error(`No numeric values found in column "${column}" for mean calculation`);
      }
      const sum = nums.reduce((a, b) => a + b, 0);
      fillValue = Math.round((sum / nums.length) * 10000) / 10000;
      logger.info(`Mean computed for column "${column}": ${fillValue}`, {
        datasetId,
        sampleSize: nums.length,
      });
    } else if (strategy === 'median') {
      const nums = values.map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
      if (nums.length === 0) {
        throw new Error(`No numeric values found in column "${column}" for median calculation`);
      }
      if (nums.length % 2 === 0) {
        fillValue = (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2;
      } else {
        fillValue = nums[Math.floor(nums.length / 2)];
      }
      fillValue = Math.round(fillValue * 10000) / 10000;
      logger.info(`Median computed for column "${column}": ${fillValue}`, {
        datasetId,
        sampleSize: nums.length,
      });
    } else if (strategy === 'mode') {
      const freq = new Map<string, number>();
      for (const v of values) {
        const key = String(v);
        freq.set(key, (freq.get(key) || 0) + 1);
      }
      let maxFreq = 0;
      let modeValue = values[0];
      for (const [val, count] of freq) {
        if (count > maxFreq) {
          maxFreq = count;
          modeValue = val;
        }
      }
      fillValue = modeValue;
      logger.info(`Mode computed for column "${column}": ${fillValue} (frequency: ${maxFreq})`, {
        datasetId,
      });
    }

    for (let i = 0; i < allRows.length; i++) {
      const data = allRows[i].data as Record<string, any>;
      const val = data[column];
      const isMissing = val === null || val === undefined || val === '';

      if (!isMissing) continue;

      if (strategy === 'drop') {
        await this.prisma.dataRow.delete({ where: { id: allRows[i].id } });
        rowsAffected++;
        continue;
      }

      let currentFill = fillValue;

      if (strategy === 'forward') {
        currentFill = null;
        for (let j = i - 1; j >= 0; j--) {
          const prevVal = (allRows[j].data as Record<string, any>)[column];
          if (prevVal !== null && prevVal !== undefined && prevVal !== '') {
            currentFill = prevVal;
            break;
          }
        }
        if (currentFill === null) {
          for (let j = i + 1; j < allRows.length; j++) {
            const nextVal = (allRows[j].data as Record<string, any>)[column];
            if (nextVal !== null && nextVal !== undefined && nextVal !== '') {
              currentFill = nextVal;
              break;
            }
          }
        }
      } else if (strategy === 'backward') {
        currentFill = null;
        for (let j = i + 1; j < allRows.length; j++) {
          const nextVal = (allRows[j].data as Record<string, any>)[column];
          if (nextVal !== null && nextVal !== undefined && nextVal !== '') {
            currentFill = nextVal;
            break;
          }
        }
        if (currentFill === null) {
          for (let j = i - 1; j >= 0; j--) {
            const prevVal = (allRows[j].data as Record<string, any>)[column];
            if (prevVal !== null && prevVal !== undefined && prevVal !== '') {
              currentFill = prevVal;
              break;
            }
          }
        }
      }

      if (currentFill !== null) {
        data[column] = currentFill;
        await this.prisma.dataRow.update({
          where: { id: allRows[i].id },
          data: { data },
        });
        rowsAffected++;
      }
    }

    if (strategy === 'drop' && rowsAffected > 0) {
      const dataset = await this.prisma.dataset.findUnique({ where: { id: datasetId } });
      if (dataset) {
        await this.prisma.dataset.update({
          where: { id: datasetId },
          data: { rowCount: BigInt(Number(dataset.rowCount || 0) - rowsAffected) },
        });
      }
    }

    await this.prisma.dataQualityCheck.create({
      data: {
        datasetId,
        checkType: 'completeness',
        result: rowsAffected === 0 ? 'pass' : 'warning',
        detailsJson: {
          strategy,
          column,
          rowsAffected,
          fillValue: strategy !== 'drop' ? fillValue as any : undefined,
          totalRows: allRows.length,
        } as any,
      },
    });

    logger.info(`Missing value handling complete for column "${column}"`, {
      datasetId,
      strategy,
      rowsAffected,
    });

    return {
      strategy,
      column,
      rowsAffected,
      fillValue: strategy !== 'drop' ? fillValue : null,
    };
  }

  async normalizeValues(
    datasetId: string,
    column: string,
    method: 'min-max' | 'z-score' | 'log'
  ): Promise<{
    method: string;
    column: string;
    rowsNormalized: number;
    stats: { min: number; max: number; mean: number; stdDev: number };
  }> {
    const allRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    if (allRows.length === 0) {
      throw new Error(`Dataset "${datasetId}" has no rows`);
    }

    const numericEntries = allRows
      .map((r) => ({
        id: r.id,
        value: Number((r.data as Record<string, any>)[column]),
        data: r.data as Record<string, any>,
      }))
      .filter((e) => !isNaN(e.value));

    if (numericEntries.length === 0) {
      throw new Error(`No numeric values found in column "${column}"`);
    }

    const values = numericEntries.map((e) => e.value);
    const sortedValues = [...values].sort((a, b) => a - b);
    const min = sortedValues[0];
    const max = sortedValues[sortedValues.length - 1];
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance) || 1;

    let normalize: (v: number) => number;

    if (method === 'min-max') {
      const range = max - min || 1;
      normalize = (v: number) => {
        const normalized = (v - min) / range;
        return Math.round(normalized * 10000) / 10000;
      };
    } else if (method === 'z-score') {
      normalize = (v: number) => {
        const zScore = (v - mean) / stdDev;
        return Math.round(zScore * 10000) / 10000;
      };
    } else if (method === 'log') {
      const minShift = min <= 0 ? Math.abs(min) + 1 : 0;
      normalize = (v: number) => {
        const shifted = v + minShift;
        const logVal = shifted > 0 ? Math.log(shifted) : 0;
        return Math.round(logVal * 10000) / 10000;
      };
    } else {
      throw new Error(`Unsupported normalization method: ${method}`);
    }

    let rowsNormalized = 0;
    for (const entry of numericEntries) {
      const normalizedValue = normalize(entry.value);
      entry.data[`${column}_normalized`] = normalizedValue;
      await this.prisma.dataRow.update({
        where: { id: entry.id },
        data: { data: entry.data },
      });
      rowsNormalized++;
    }

    await this.prisma.dataQualityCheck.create({
      data: {
        datasetId,
        checkType: 'consistency',
        result: 'pass',
        detailsJson: {
          method,
          column,
          rowsNormalized,
          originalStats: { min, max, mean: Math.round(mean * 10000) / 10000, stdDev: Math.round(stdDev * 10000) / 10000 },
        },
      },
    });

    logger.info(`Normalization complete for column "${column}"`, {
      datasetId,
      method,
      rowsNormalized,
    });

    return {
      method,
      column,
      rowsNormalized,
      stats: {
        min,
        max,
        mean: Math.round(mean * 10000) / 10000,
        stdDev: Math.round(stdDev * 10000) / 10000,
      },
    };
  }

  async standardizeFormats(
    datasetId: string,
    rules: FormatRule[]
  ): Promise<{
    rulesApplied: number;
    rowsModified: number;
    details: Array<{ column: string; type: string; modified: number }>;
  }> {
    if (rules.length === 0) {
      throw new Error('No format rules provided');
    }

    const allRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    if (allRows.length === 0) {
      throw new Error(`Dataset "${datasetId}" has no rows`);
    }

    const details: Array<{ column: string; type: string; modified: number }> = [];
    const modifiedRowIds = new Set<string>();

    for (const rule of rules) {
      let modifiedCount = 0;

      for (const row of allRows) {
        const data = row.data as Record<string, any>;
        const val = data[rule.column];

        if (val === null || val === undefined || val === '') continue;

        let newVal: any = val;
        const strVal = String(val).trim();

        switch (rule.type) {
          case 'date': {
            const dateFormats = [
              /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
              /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
              /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
              /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,
            ];
            let parsed: Date | null = null;

            for (const fmt of dateFormats) {
              const match = strVal.match(fmt);
              if (match) {
                if (fmt === dateFormats[0] || fmt === dateFormats[1]) {
                  parsed = new Date(
                    parseInt(match[3]),
                    parseInt(match[1]) - 1,
                    parseInt(match[2])
                  );
                } else {
                  parsed = new Date(
                    parseInt(match[1]),
                    parseInt(match[2]) - 1,
                    parseInt(match[3])
                  );
                }
                break;
              }
            }

            if (!parsed || isNaN(parsed.getTime())) {
              parsed = new Date(strVal);
            }

            if (parsed && !isNaN(parsed.getTime())) {
              const targetFormat = rule.format || 'YYYY-MM-DD';
              const year = parsed.getFullYear();
              const month = String(parsed.getMonth() + 1).padStart(2, '0');
              const day = String(parsed.getDate()).padStart(2, '0');

              if (targetFormat === 'YYYY-MM-DD') {
                newVal = `${year}-${month}-${day}`;
              } else if (targetFormat === 'DD/MM/YYYY') {
                newVal = `${day}/${month}/${year}`;
              } else if (targetFormat === 'MM/DD/YYYY') {
                newVal = `${month}/${day}/${year}`;
              } else {
                newVal = `${year}-${month}-${day}`;
              }
            }
            break;
          }

          case 'phone': {
            const digits = strVal.replace(/\D/g, '');
            if (digits.length >= 10) {
              const targetFormat = rule.format || '+X (XXX) XXX-XXXX';
              if (digits.length === 10) {
                newVal = `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
              } else if (digits.length === 11 && digits.startsWith('1')) {
                newVal = `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
              } else {
                newVal = `+${digits.slice(0, digits.length - 10)} (${digits.slice(-10, -7)}) ${digits.slice(-7, -4)}-${digits.slice(-4)}`;
              }
            }
            break;
          }

          case 'email': {
            newVal = strVal.toLowerCase().trim();
            newVal = newVal.replace(/\s+/g, '');
            break;
          }

          case 'uppercase': {
            newVal = strVal.toUpperCase();
            break;
          }

          case 'lowercase': {
            newVal = strVal.toLowerCase();
            break;
          }

          case 'capitalize': {
            newVal = strVal
              .split(/\s+/)
              .map((word: string) => {
                if (word.length === 0) return word;
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
              })
              .join(' ');
            break;
          }

          case 'trim': {
            newVal = strVal.replace(/\s+/g, ' ').trim();
            break;
          }

          case 'custom': {
            if (rule.pattern && rule.replacement !== undefined) {
              const regex = new RegExp(rule.pattern, 'g');
              newVal = strVal.replace(regex, rule.replacement);
            }
            break;
          }
        }

        if (newVal !== val) {
          data[rule.column] = newVal;
          await this.prisma.dataRow.update({
            where: { id: row.id },
            data: { data },
          });
          modifiedCount++;
          modifiedRowIds.add(row.id);
        }
      }

      details.push({
        column: rule.column,
        type: rule.type,
        modified: modifiedCount,
      });

      logger.info(`Format rule applied: ${rule.type} on column "${rule.column}"`, {
        datasetId,
        modified: modifiedCount,
      });
    }

    await this.prisma.dataQualityCheck.create({
      data: {
        datasetId,
        checkType: 'consistency',
        result: 'pass',
        detailsJson: {
          rulesApplied: rules.length,
          rowsModified: modifiedRowIds.size,
          details,
        },
      },
    });

    return {
      rulesApplied: rules.length,
      rowsModified: modifiedRowIds.size,
      details,
    };
  }

  async detectOutliers(
    datasetId: string,
    column: string,
    method: 'iqr' | 'z-score'
  ): Promise<{
    method: string;
    column: string;
    outliersFound: number;
    outliers: OutlierResult[];
    stats: Record<string, number>;
  }> {
    const allRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    if (allRows.length === 0) {
      throw new Error(`Dataset "${datasetId}" has no rows`);
    }

    const entries = allRows
      .map((r) => ({
        rowIndex: r.rowIndex,
        value: Number((r.data as Record<string, any>)[column]),
      }))
      .filter((e) => !isNaN(e.value));

    if (entries.length === 0) {
      throw new Error(`No numeric values found in column "${column}"`);
    }

    const values = entries.map((e) => e.value);
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance) || 1;
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;

    const outliers: OutlierResult[] = [];

    if (method === 'iqr') {
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;

      for (const entry of entries) {
        if (entry.value < lowerBound) {
          outliers.push({
            rowIndex: entry.rowIndex,
            value: entry.value,
            reason: `Below IQR lower bound ${lowerBound.toFixed(4)} (Q1=${q1}, IQR=${iqr.toFixed(4)})`,
          });
        } else if (entry.value > upperBound) {
          outliers.push({
            rowIndex: entry.rowIndex,
            value: entry.value,
            reason: `Above IQR upper bound ${upperBound.toFixed(4)} (Q3=${q3}, IQR=${iqr.toFixed(4)})`,
          });
        }
      }
    } else if (method === 'z-score') {
      const zThreshold = 3.0;

      for (const entry of entries) {
        const zScore = Math.abs((entry.value - mean) / stdDev);
        if (zScore > zThreshold) {
          outliers.push({
            rowIndex: entry.rowIndex,
            value: entry.value,
            reason: `Z-score ${zScore.toFixed(4)} exceeds threshold ${zThreshold} (mean=${mean.toFixed(4)}, std=${stdDev.toFixed(4)})`,
          });
        }
      }
    }

    const stats: Record<string, number> = {
      count: entries.length,
      mean: Math.round(mean * 10000) / 10000,
      median: Math.round(median * 10000) / 10000,
      stdDev: Math.round(stdDev * 10000) / 10000,
      q1,
      q3,
      iqr: Math.round(iqr * 10000) / 10000,
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };

    await this.prisma.dataQualityCheck.create({
      data: {
        datasetId,
        checkType: 'accuracy',
        result: outliers.length === 0 ? 'pass' : 'warning',
        detailsJson: JSON.parse(JSON.stringify({
          method,
          column,
          outliersFound: outliers.length,
          stats,
          outliers: outliers.slice(0, 100),
        })),
      },
    });

    logger.info(`Outlier detection complete for column "${column}"`, {
      datasetId,
      method,
      outliersFound: outliers.length,
    });

    return {
      method,
      column,
      outliersFound: outliers.length,
      outliers: outliers.slice(0, 200),
      stats,
    };
  }

  async trimWhitespace(datasetId: string): Promise<{
    rowsTrimmed: number;
    columnsProcessed: string[];
    totalCellsCleaned: number;
  }> {
    const columns = await this.prisma.datasetColumn.findMany({
      where: { datasetId },
    });

    const stringCols = columns.filter(
      (c) => c.dataType === 'string' || c.dataType === 'text'
    );

    if (stringCols.length === 0) {
      logger.info(`No string columns found in dataset ${datasetId} for whitespace trimming`);
      return { rowsTrimmed: 0, columnsProcessed: [], totalCellsCleaned: 0 };
    }

    const allRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    let rowsTrimmed = 0;
    let totalCellsCleaned = 0;

    for (const row of allRows) {
      const data = row.data as Record<string, any>;
      let rowChanged = false;

      for (const col of stringCols) {
        const val = data[col.name];
        if (typeof val === 'string') {
          const trimmed = val.trim().replace(/\s+/g, ' ');
          if (trimmed !== val) {
            data[col.name] = trimmed;
            rowChanged = true;
            totalCellsCleaned++;
          }
        }
      }

      if (rowChanged) {
        await this.prisma.dataRow.update({
          where: { id: row.id },
          data: { data },
        });
        rowsTrimmed++;
      }
    }

    await this.prisma.dataQualityCheck.create({
      data: {
        datasetId,
        checkType: 'consistency',
        result: 'pass',
        detailsJson: {
          rowsTrimmed,
          totalCellsCleaned,
          columnsProcessed: stringCols.map((c) => c.name),
        },
      },
    });

    logger.info(`Whitespace trimming complete for dataset ${datasetId}`, {
      rowsTrimmed,
      totalCellsCleaned,
      columnsProcessed: stringCols.map((c) => c.name),
    });

    return {
      rowsTrimmed,
      columnsProcessed: stringCols.map((c) => c.name),
      totalCellsCleaned,
    };
  }

  async validateDataTypes(datasetId: string): Promise<{
    valid: boolean;
    issuesFound: number;
    issues: Array<{
      rowIndex: number;
      column: string;
      expectedType: string;
      actualValue: unknown;
      suggestion: string;
    }>;
    columnSummary: Record<string, { valid: number; invalid: number; percentage: number }>;
  }> {
    const columns = await this.prisma.datasetColumn.findMany({
      where: { datasetId },
      orderBy: { position: 'asc' },
    });

    if (columns.length === 0) {
      throw new Error(`No columns defined for dataset "${datasetId}"`);
    }

    const allRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      take: 10000,
      orderBy: { rowIndex: 'asc' },
    });

    const issues: Array<{
      rowIndex: number;
      column: string;
      expectedType: string;
      actualValue: unknown;
      suggestion: string;
    }> = [];

    const columnSummary: Record<string, { valid: number; invalid: number; percentage: number }> = {};

    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}/,
      /^\d{2}\/\d{2}\/\d{4}/,
      /^\d{2}-\d{2}-\d{4}/,
    ];

    for (const col of columns) {
      let validCount = 0;
      let invalidCount = 0;

      for (const row of allRows) {
        const data = row.data as Record<string, any>;
        const val = data[col.name];

        if (val === null || val === undefined || val === '') {
          validCount++;
          continue;
        }

        let isValid = true;
        let suggestion = '';

        switch (col.dataType) {
          case 'integer': {
            const num = Number(val);
            if (isNaN(num) || !Number.isInteger(num)) {
              if (!isNaN(num)) {
                suggestion = `Round to ${Math.round(num)}`;
              } else {
                suggestion = `Cannot convert "${String(val).substring(0, 30)}" to integer`;
              }
              isValid = false;
            }
            break;
          }
          case 'float': {
            const num = Number(val);
            if (isNaN(num)) {
              suggestion = `Cannot convert "${String(val).substring(0, 30)}" to float`;
              isValid = false;
            }
            break;
          }
          case 'boolean': {
            const strVal = String(val).toLowerCase();
            const validBooleans = ['true', 'false', '0', '1', 'yes', 'no', 'y', 'n'];
            if (typeof val !== 'boolean' && !validBooleans.includes(strVal)) {
              suggestion = `Use one of: true, false, 0, 1, yes, no`;
              isValid = false;
            }
            break;
          }
          case 'date': {
            const isDate =
              val instanceof Date ||
              datePatterns.some((p) => p.test(String(val))) ||
              !isNaN(new Date(String(val)).getTime());
            if (!isDate) {
              suggestion = `Cannot parse "${String(val).substring(0, 30)}" as a date`;
              isValid = false;
            }
            break;
          }
          case 'string':
          case 'text': {
            if (typeof val !== 'string' && typeof val !== 'number') {
              suggestion = `Convert to string using String()`;
              isValid = false;
            }
            break;
          }
        }

        if (isValid) {
          validCount++;
        } else {
          invalidCount++;
          if (issues.length < 500) {
            issues.push({
              rowIndex: row.rowIndex,
              column: col.name,
              expectedType: col.dataType || 'unknown',
              actualValue: typeof val === 'string' ? val.substring(0, 100) : val,
              suggestion,
            });
          }
        }
      }

      const total = validCount + invalidCount;
      columnSummary[col.name] = {
        valid: validCount,
        invalid: invalidCount,
        percentage: total > 0 ? Math.round((validCount / total) * 10000) / 100 : 100,
      };
    }

    const totalIssues = issues.length;
    const isValid = totalIssues === 0;

    await this.prisma.dataQualityCheck.create({
      data: {
        datasetId,
        checkType: 'validity',
        result: isValid ? 'pass' : 'fail',
        detailsJson: {
          issuesFound: totalIssues,
          columnSummary,
          sampleIssues: issues.slice(0, 100),
        } as any,
      },
    });

    logger.info(`Data type validation complete for dataset ${datasetId}`, {
      valid: isValid,
      issuesFound: totalIssues,
    });

    return {
      valid: isValid,
      issuesFound: totalIssues,
      issues: issues.slice(0, 200),
      columnSummary,
    };
  }

  private computeSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    const len1 = s1.length;
    const len2 = s2.length;
    if (len1 === 0 || len2 === 0) return 0;

    const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);
    let matches = 0;
    let transpositions = 0;

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

    const jaro =
      (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
  }
}
