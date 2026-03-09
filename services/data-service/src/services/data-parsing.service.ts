import { PrismaClient } from '@prisma/client';
import { createReadStream } from 'fs';
import { Transform, TransformCallback } from 'stream';
import { parse as csvParse } from 'csv-parse';
import { pipeline } from 'stream/promises';
import { logger } from '../utils/logger';

interface ColumnStats {
  name: string;
  dataType: string;
  nullCount: number;
  uniqueCount: number;
  distribution: Record<string, number>;
  numericStats?: {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
    variance: number;
    skewness: number;
    kurtosis: number;
    q1: number;
    q3: number;
    iqr: number;
  };
  stringStats?: {
    minLength: number;
    maxLength: number;
    avgLength: number;
    emptyCount: number;
    patternFrequency: Record<string, number>;
  };
}

interface SchemaField {
  name: string;
  inferredType: string;
  nullable: boolean;
  unique: boolean;
  sampleValues: unknown[];
  confidence: number;
}

interface ValidationViolation {
  rowIndex: number;
  column: string;
  expectedType: string;
  actualValue: unknown;
  message: string;
}

export default class DataParsingService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async parseStructured(datasetId: string): Promise<{
    datasetId: string;
    totalRows: number;
    columns: ColumnStats[];
    overallQuality: number;
  }> {
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });
    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const columns = await this.prisma.datasetColumn.findMany({
      where: { datasetId },
      orderBy: { position: 'asc' },
    });

    const allRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    if (allRows.length === 0) {
      throw new Error(`Dataset "${datasetId}" has no data rows`);
    }

    const columnStats: ColumnStats[] = [];
    let totalNonNull = 0;
    let totalCells = 0;

    for (const col of columns) {
      const values = allRows.map((r) => (r.data as Record<string, unknown>)[col.name]);
      const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
      const nullCount = values.length - nonNull.length;
      const uniqueSet = new Set(nonNull.map(String));

      totalNonNull += nonNull.length;
      totalCells += values.length;

      const distribution: Record<string, number> = {};
      const freqMap = new Map<string, number>();
      for (const v of nonNull) {
        const key = String(v);
        freqMap.set(key, (freqMap.get(key) || 0) + 1);
      }
      const sortedFreqs = Array.from(freqMap.entries()).sort((a, b) => b[1] - a[1]);
      const topN = sortedFreqs.slice(0, 20);
      for (const [key, count] of topN) {
        distribution[key] = count;
      }

      const stat: ColumnStats = {
        name: col.name,
        dataType: col.dataType || 'string',
        nullCount,
        uniqueCount: uniqueSet.size,
        distribution,
      };

      if (col.dataType === 'integer' || col.dataType === 'float') {
        const nums = nonNull.map(Number).filter((n) => !isNaN(n));
        if (nums.length > 0) {
          nums.sort((a, b) => a - b);
          const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
          const variance = nums.reduce((s, n) => s + Math.pow(n - mean, 2), 0) / nums.length;
          const stdDev = Math.sqrt(variance);
          const median =
            nums.length % 2 === 0
              ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2
              : nums[Math.floor(nums.length / 2)];
          const q1 = nums[Math.floor(nums.length * 0.25)];
          const q3 = nums[Math.floor(nums.length * 0.75)];
          const iqr = q3 - q1;

          let skewness = 0;
          let kurtosis = 0;
          if (stdDev > 0) {
            skewness =
              nums.reduce((s, n) => s + Math.pow((n - mean) / stdDev, 3), 0) / nums.length;
            kurtosis =
              nums.reduce((s, n) => s + Math.pow((n - mean) / stdDev, 4), 0) / nums.length - 3;
          }

          stat.numericStats = {
            min: nums[0],
            max: nums[nums.length - 1],
            mean: Math.round(mean * 10000) / 10000,
            median: Math.round(median * 10000) / 10000,
            stdDev: Math.round(stdDev * 10000) / 10000,
            variance: Math.round(variance * 10000) / 10000,
            skewness: Math.round(skewness * 10000) / 10000,
            kurtosis: Math.round(kurtosis * 10000) / 10000,
            q1,
            q3,
            iqr,
          };
        }
      }

      if (col.dataType === 'string' || col.dataType === 'text') {
        const strValues = nonNull.map(String);
        const lengths = strValues.map((s) => s.length);
        const emptyCount = strValues.filter((s) => s.trim().length === 0).length;

        const patternFrequency: Record<string, number> = {};
        for (const s of strValues.slice(0, 500)) {
          const pattern = s
            .replace(/[A-Z]/g, 'A')
            .replace(/[a-z]/g, 'a')
            .replace(/[0-9]/g, '9')
            .replace(/\s+/g, '_');
          patternFrequency[pattern] = (patternFrequency[pattern] || 0) + 1;
        }
        const topPatterns: Record<string, number> = {};
        const sortedPatterns = Object.entries(patternFrequency).sort((a, b) => b[1] - a[1]);
        for (const [p, c] of sortedPatterns.slice(0, 10)) {
          topPatterns[p] = c;
        }

        stat.stringStats = {
          minLength: lengths.length > 0 ? Math.min(...lengths) : 0,
          maxLength: lengths.length > 0 ? Math.max(...lengths) : 0,
          avgLength:
            lengths.length > 0
              ? Math.round(lengths.reduce((s, l) => s + l, 0) / lengths.length)
              : 0,
          emptyCount,
          patternFrequency: topPatterns,
        };
      }

      columnStats.push(stat);

      await this.prisma.datasetColumn.update({
        where: { id: col.id },
        data: { statsJson: JSON.parse(JSON.stringify(stat)),
      });
    }

    const overallQuality =
      totalCells > 0
        ? Math.round((totalNonNull / totalCells) * 10000) / 100
        : 0;

    logger.info(`Structured parse complete for dataset ${datasetId}`, {
      totalRows: allRows.length,
      columnsAnalyzed: columns.length,
      overallQuality,
    });

    return {
      datasetId,
      totalRows: allRows.length,
      columns: columnStats,
      overallQuality,
    };
  }

  async streamLargeFile(
    filepath: string,
    callback: (chunk: Record<string, unknown>[]) => Promise<void>,
    options?: { delimiter?: string; batchSize?: number; encoding?: BufferEncoding }
  ): Promise<{ totalRows: number; totalBatches: number; elapsed: number }> {
    const delimiter = options?.delimiter || ',';
    const batchSize = options?.batchSize || 1000;
    const encoding = options?.encoding || 'utf-8';
    const startTime = Date.now();

    let totalRows = 0;
    let totalBatches = 0;
    let batch: Record<string, unknown>[] = [];

    const readStream = createReadStream(filepath, { encoding, highWaterMark: 64 * 1024 });

    const csvParser = csvParse({
      delimiter,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      cast: true,
      cast_date: true,
    });

    const batchTransform = new Transform({
      objectMode: true,
      async transform(
        record: Record<string, unknown>,
        _encoding: BufferEncoding,
        done: TransformCallback
      ) {
        batch.push(record);
        totalRows++;

        if (batch.length >= batchSize) {
          const currentBatch = [...batch];
          batch = [];
          totalBatches++;
          try {
            await callback(currentBatch);
            done();
          } catch (err) {
            done(err as Error);
          }
        } else {
          done();
        }
      },
      async flush(done: TransformCallback) {
        if (batch.length > 0) {
          totalBatches++;
          try {
            await callback(batch);
            batch = [];
            done();
          } catch (err) {
            done(err as Error);
          }
        } else {
          done();
        }
      },
    });

    await pipeline(readStream, csvParser, batchTransform);

    const elapsed = Date.now() - startTime;

    logger.info(`Stream processing complete: ${filepath}`, {
      totalRows,
      totalBatches,
      elapsed: `${elapsed}ms`,
      throughput: `${Math.round(totalRows / (elapsed / 1000))} rows/sec`,
    });

    return { totalRows, totalBatches, elapsed };
  }

  async chunkProcess(
    datasetId: string,
    chunkSize: number,
    processor: (rows: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>
  ): Promise<{
    datasetId: string;
    totalProcessed: number;
    chunksProcessed: number;
    elapsed: number;
  }> {
    const startTime = Date.now();
    const totalCount = await this.prisma.dataRow.count({ where: { datasetId } });

    if (totalCount === 0) {
      throw new Error(`Dataset "${datasetId}" has no rows to process`);
    }

    let processed = 0;
    let chunksProcessed = 0;
    let offset = 0;

    while (offset < totalCount) {
      const rows = await this.prisma.dataRow.findMany({
        where: { datasetId },
        orderBy: { rowIndex: 'asc' },
        skip: offset,
        take: chunkSize,
      });

      if (rows.length === 0) break;

      const rowData = rows.map((r) => r.data as Record<string, unknown>);
      const processedData = await processor(rowData);

      for (let i = 0; i < rows.length; i++) {
        if (i < processedData.length && processedData[i] !== rowData[i]) {
          await this.prisma.dataRow.update({
            where: { id: rows[i].id },
            data: { data: processedData[i] },
          });
        }
      }

      processed += rows.length;
      chunksProcessed++;
      offset += chunkSize;

      logger.debug(`Chunk ${chunksProcessed} processed: ${processed}/${totalCount} rows`, {
        datasetId,
      });
    }

    const elapsed = Date.now() - startTime;

    logger.info(`Chunk processing complete for dataset ${datasetId}`, {
      totalProcessed: processed,
      chunksProcessed,
      elapsed: `${elapsed}ms`,
    });

    return {
      datasetId,
      totalProcessed: processed,
      chunksProcessed,
      elapsed,
    };
  }

  inferSchema(data: Record<string, unknown>[]): SchemaField[] {
    if (data.length === 0) {
      throw new Error('Cannot infer schema from empty data');
    }

    const allKeys = new Set<string>();
    data.forEach((row) => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach((k) => allKeys.add(k));
      }
    });

    const fields: SchemaField[] = [];
    const sampleSize = Math.min(data.length, 500);
    const sample = data.slice(0, sampleSize);

    for (const key of allKeys) {
      const values = sample.map((row) => row[key]);
      const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
      const nullable = nonNull.length < values.length;
      const uniqueSet = new Set(nonNull.map(String));
      const unique = uniqueSet.size === nonNull.length && nonNull.length > 1;

      let inferredType = 'string';
      let confidence = 0;

      if (nonNull.length === 0) {
        inferredType = 'string';
        confidence = 0;
      } else {
        const typeScores: Record<string, number> = {
          integer: 0,
          float: 0,
          boolean: 0,
          date: 0,
          string: 0,
          text: 0,
        };

        const datePatterns = [
          /^\d{4}-\d{2}-\d{2}/,
          /^\d{2}\/\d{2}\/\d{4}/,
          /^\d{2}-\d{2}-\d{4}/,
          /^\d{4}\/\d{2}\/\d{2}/,
        ];
        const boolValues = new Set(['true', 'false', '0', '1', 'yes', 'no']);

        for (const val of nonNull) {
          const strVal = String(val).trim().toLowerCase();

          if (typeof val === 'number' && Number.isInteger(val)) {
            typeScores.integer++;
          } else if (typeof val === 'number') {
            typeScores.float++;
          } else if (typeof val === 'string' && strVal !== '' && !isNaN(Number(strVal))) {
            if (Number.isInteger(Number(strVal))) {
              typeScores.integer++;
            } else {
              typeScores.float++;
            }
          } else if (typeof val === 'boolean' || boolValues.has(strVal)) {
            typeScores.boolean++;
          } else if (val instanceof Date || datePatterns.some((p) => p.test(strVal))) {
            typeScores.date++;
          } else if (typeof val === 'string' && val.length > 200) {
            typeScores.text++;
          } else {
            typeScores.string++;
          }
        }

        const sortedTypes = Object.entries(typeScores).sort((a, b) => b[1] - a[1]);
        const topType = sortedTypes[0];

        if (topType[1] / nonNull.length >= 0.8) {
          inferredType = topType[0];
          confidence = Math.round((topType[1] / nonNull.length) * 100) / 100;
        } else if (
          (typeScores.integer + typeScores.float) / nonNull.length >= 0.8
        ) {
          inferredType = typeScores.float > 0 ? 'float' : 'integer';
          confidence =
            Math.round(
              ((typeScores.integer + typeScores.float) / nonNull.length) * 100
            ) / 100;
        } else {
          inferredType = 'string';
          confidence = Math.round((typeScores.string / nonNull.length) * 100) / 100;
        }
      }

      const sampleValues = nonNull
        .slice(0, 5)
        .map((v) => (typeof v === 'object' ? JSON.stringify(v) : v));

      fields.push({
        name: key,
        inferredType,
        nullable,
        unique,
        sampleValues,
        confidence,
      });
    }

    logger.info(`Schema inferred: ${fields.length} fields from ${data.length} rows`);

    return fields;
  }

  validateSchema(
    data: Record<string, unknown>[],
    schema: {
      fields: Array<{
        name: string;
        type: string;
        nullable?: boolean;
        min?: number;
        max?: number;
        pattern?: string;
        enum?: unknown[];
        maxLength?: number;
      }>;
    }
  ): {
    valid: boolean;
    totalViolations: number;
    violations: ValidationViolation[];
    violationsByColumn: Record<string, number>;
  } {
    if (data.length === 0) {
      return { valid: true, totalViolations: 0, violations: [], violationsByColumn: {} };
    }

    const violations: ValidationViolation[] = [];
    const violationsByColumn: Record<string, number> = {};
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}/,
      /^\d{2}\/\d{2}\/\d{4}/,
    ];

    for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      if (!row || typeof row !== 'object') continue;

      for (const field of schema.fields) {
        const value = row[field.name];
        const isNull = value === null || value === undefined || value === '';

        if (isNull && field.nullable === false) {
          violations.push({
            rowIndex: rowIdx,
            column: field.name,
            expectedType: field.type,
            actualValue: value,
            message: `Required field "${field.name}" is null/empty`,
          });
          violationsByColumn[field.name] = (violationsByColumn[field.name] || 0) + 1;
          continue;
        }

        if (isNull) continue;

        let typeValid = true;
        switch (field.type) {
          case 'integer':
            typeValid = Number.isInteger(Number(value)) && !isNaN(Number(value));
            break;
          case 'float':
          case 'number':
            typeValid = !isNaN(Number(value));
            break;
          case 'boolean':
            typeValid =
              typeof value === 'boolean' ||
              ['true', 'false', '0', '1'].includes(String(value).toLowerCase());
            break;
          case 'date':
            typeValid =
              value instanceof Date ||
              datePatterns.some((p) => p.test(String(value))) ||
              !isNaN(new Date(String(value)).getTime());
            break;
          case 'string':
          case 'text':
            typeValid = typeof value === 'string' || typeof value === 'number';
            break;
        }

        if (!typeValid) {
          violations.push({
            rowIndex: rowIdx,
            column: field.name,
            expectedType: field.type,
            actualValue: value,
            message: `Type mismatch: expected ${field.type}, got ${typeof value}`,
          });
          violationsByColumn[field.name] = (violationsByColumn[field.name] || 0) + 1;
          continue;
        }

        if (
          (field.type === 'integer' || field.type === 'float' || field.type === 'number') &&
          field.min !== undefined &&
          Number(value) < field.min
        ) {
          violations.push({
            rowIndex: rowIdx,
            column: field.name,
            expectedType: field.type,
            actualValue: value,
            message: `Value ${value} is below minimum ${field.min}`,
          });
          violationsByColumn[field.name] = (violationsByColumn[field.name] || 0) + 1;
        }

        if (
          (field.type === 'integer' || field.type === 'float' || field.type === 'number') &&
          field.max !== undefined &&
          Number(value) > field.max
        ) {
          violations.push({
            rowIndex: rowIdx,
            column: field.name,
            expectedType: field.type,
            actualValue: value,
            message: `Value ${value} exceeds maximum ${field.max}`,
          });
          violationsByColumn[field.name] = (violationsByColumn[field.name] || 0) + 1;
        }

        if (field.pattern) {
          const regex = new RegExp(field.pattern);
          if (!regex.test(String(value))) {
            violations.push({
              rowIndex: rowIdx,
              column: field.name,
              expectedType: field.type,
              actualValue: value,
              message: `Value does not match pattern: ${field.pattern}`,
            });
            violationsByColumn[field.name] = (violationsByColumn[field.name] || 0) + 1;
          }
        }

        if (field.enum && !field.enum.includes(value) && !field.enum.includes(String(value))) {
          violations.push({
            rowIndex: rowIdx,
            column: field.name,
            expectedType: field.type,
            actualValue: value,
            message: `Value not in allowed values: [${field.enum.join(', ')}]`,
          });
          violationsByColumn[field.name] = (violationsByColumn[field.name] || 0) + 1;
        }

        if (
          field.maxLength !== undefined &&
          typeof value === 'string' &&
          value.length > field.maxLength
        ) {
          violations.push({
            rowIndex: rowIdx,
            column: field.name,
            expectedType: field.type,
            actualValue: `${String(value).substring(0, 50)}...`,
            message: `String length ${value.length} exceeds max ${field.maxLength}`,
          });
          violationsByColumn[field.name] = (violationsByColumn[field.name] || 0) + 1;
        }
      }
    }

    const valid = violations.length === 0;

    logger.info(`Schema validation complete: ${valid ? 'PASSED' : 'FAILED'}`, {
      totalViolations: violations.length,
      rowsChecked: data.length,
      fieldsChecked: schema.fields.length,
    });

    return {
      valid,
      totalViolations: violations.length,
      violations: violations.slice(0, 500),
      violationsByColumn,
    };
  }
}
