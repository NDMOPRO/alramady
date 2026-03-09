import { logger } from '../../utils/logger.js';
import { cacheGet, cacheSet } from '../../utils/redis.js';
import * as crypto from 'crypto';

interface MaterializedView {
  id: string;
  groupBy: string[];
  metrics: AggregateMetric[];
  data: Record<string, unknown>[];
  createdAt: number;
  rowCount: number;
}

interface AggregateMetric {
  field: string;
  aggregation: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
  alias?: string;
}

interface BitmapIndex {
  column: string;
  bitmaps: Map<string, Uint8Array>;
  rowCount: number;
}

interface CardinalityEstimate {
  column: string;
  estimatedCardinality: number;
  method: 'hyperloglog';
  accuracy: number;
}

export class QueryAccelerator {
  private materializedViews: Map<string, MaterializedView> = new Map();
  private bitmapIndices: Map<string, BitmapIndex> = new Map();
  private readonly CACHE_PREFIX = 'qaccel:';
  private readonly CACHE_TTL = 3600;

  preAggregate(dataset: Record<string, unknown>[], groupBy: string[], metrics: AggregateMetric[]): MaterializedView {
    if (!dataset || dataset.length === 0) {
      throw new Error('Cannot pre-aggregate empty dataset');
    }

    // Group data
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of dataset) {
      const key = groupBy.map(g => String(row[g] ?? 'NULL')).join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    // Aggregate each group
    const aggregatedData: Record<string, unknown>[] = [];
    for (const [key, rows] of groups) {
      const result: Record<string, unknown> = {};
      const keyParts = key.split('|');
      groupBy.forEach((g, i) => { result[g] = keyParts[i]; });

      for (const metric of metrics) {
        const alias = metric.alias ?? `${metric.aggregation.toLowerCase()}_${metric.field}`;
        const values = rows
          .map(r => {
            const v = r[metric.field];
            return typeof v === 'number' ? v : parseFloat(v as string);
          })
          .filter(v => !isNaN(v));

        switch (metric.aggregation) {
          case 'SUM':
            result[alias] = values.reduce((a, b) => a + b, 0);
            break;
          case 'AVG':
            result[alias] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            break;
          case 'COUNT':
            result[alias] = values.length;
            break;
          case 'MIN':
            result[alias] = values.length > 0 ? Math.min(...values) : 0;
            break;
          case 'MAX':
            result[alias] = values.length > 0 ? Math.max(...values) : 0;
            break;
        }
      }

      aggregatedData.push(result);
    }

    const viewId = this.generateViewId(groupBy, metrics);
    const view: MaterializedView = {
      id: viewId,
      groupBy,
      metrics,
      data: aggregatedData,
      createdAt: Date.now(),
      rowCount: aggregatedData.length,
    };

    this.materializedViews.set(viewId, view);
    logger.info('QueryAccelerator materialized view created', {
      viewId,
      groupBy,
      inputRows: dataset.length,
      outputRows: aggregatedData.length,
    });

    return view;
  }

  createBitmapIndex(column: string, dataset: Record<string, unknown>[]): BitmapIndex {
    if (!dataset || dataset.length === 0) {
      throw new Error('Cannot create bitmap index on empty dataset');
    }

    const rowCount = dataset.length;
    const bitmaps = new Map<string, Uint8Array>();

    // Collect all distinct values
    const distinctValues = new Set<string>();
    for (const row of dataset) {
      distinctValues.add(String(row[column] ?? 'NULL'));
    }

    // Build bitmap for each distinct value
    for (const value of distinctValues) {
      const bitmap = new Uint8Array(Math.ceil(rowCount / 8)).fill(0);
      for (let i = 0; i < rowCount; i++) {
        if (String(dataset[i][column] ?? 'NULL') === value) {
          const byteIdx = Math.floor(i / 8);
          const bitIdx = i % 8;
          bitmap[byteIdx] |= (1 << bitIdx);
        }
      }
      bitmaps.set(value, bitmap);
    }

    const index: BitmapIndex = { column, bitmaps, rowCount };
    this.bitmapIndices.set(column, index);

    logger.info('QueryAccelerator bitmap index created', {
      column,
      distinctValues: distinctValues.size,
      rowCount,
    });
    return index;
  }

  filterByBitmap(column: string, values: string[], dataset: Record<string, unknown>[]): Record<string, unknown>[] {
    const index = this.bitmapIndices.get(column);
    if (!index) {
      logger.warn('QueryAccelerator: no bitmap index for column, falling back to scan', { column });
      return dataset.filter(row => values.includes(String(row[column])));
    }

    // OR together the bitmaps for requested values
    const resultBitmap = new Uint8Array(Math.ceil(index.rowCount / 8)).fill(0);
    for (const value of values) {
      const bitmap = index.bitmaps.get(value);
      if (bitmap) {
        for (let i = 0; i < resultBitmap.length; i++) {
          resultBitmap[i] |= bitmap[i];
        }
      }
    }

    // Gather matching rows
    const result: Record<string, unknown>[] = [];
    for (let i = 0; i < index.rowCount && i < dataset.length; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      if (resultBitmap[byteIdx] & (1 << bitIdx)) {
        result.push(dataset[i]);
      }
    }

    logger.debug('QueryAccelerator bitmap filter', { column, matchCount: result.length });
    return result;
  }

  estimateCardinality(column: string, dataset: Record<string, unknown>[]): CardinalityEstimate {
    // HyperLogLog cardinality estimation
    const m = 64; // number of registers (use small set for in-memory)
    const registers = new Uint8Array(m).fill(0);

    for (const row of dataset) {
      const value = String(row[column] ?? '');
      const hash = this.hash32(value);
      const bucketIdx = hash & (m - 1); // use low bits for bucket
      const w = hash >>> Math.log2(m); // remaining bits
      const leadingZeros = this.countLeadingZeros(w) + 1;
      registers[bucketIdx] = Math.max(registers[bucketIdx], leadingZeros);
    }

    // Calculate harmonic mean
    const alphaMM = 0.7213 / (1 + 1.079 / m) * m * m;
    let harmonicSum = 0;
    let zeroRegisters = 0;

    for (const reg of registers) {
      harmonicSum += Math.pow(2, -reg);
      if (reg === 0) zeroRegisters++;
    }

    let estimate = alphaMM / harmonicSum;

    // Small range correction
    if (estimate <= 2.5 * m && zeroRegisters > 0) {
      estimate = m * Math.log(m / zeroRegisters);
    }

    const roundedEstimate = Math.round(estimate);
    const actualCardinality = new Set(dataset.map(r => r[column])).size;
    const accuracy = actualCardinality > 0
      ? 1 - Math.abs(roundedEstimate - actualCardinality) / actualCardinality
      : 1;

    logger.debug('QueryAccelerator cardinality estimated', {
      column,
      estimated: roundedEstimate,
      actual: actualCardinality,
      accuracy: accuracy.toFixed(3),
    });

    return {
      column,
      estimatedCardinality: roundedEstimate,
      method: 'hyperloglog',
      accuracy: Math.max(0, Math.min(1, accuracy)),
    };
  }

  async getCachedResult(queryHash: string): Promise<unknown | null> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${queryHash}`;
      const cached = await cacheGet<unknown>(cacheKey);
      if (cached) {
        logger.debug('QueryAccelerator cache hit', { queryHash });
        return cached;
      }
      logger.debug('QueryAccelerator cache miss', { queryHash });
      return null;
    } catch (error) {
      logger.warn('QueryAccelerator cache lookup failed', { queryHash, error: (error as Error).message });
      return null;
    }
  }

  async setCachedResult(queryHash: string, result: unknown, ttl?: number): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${queryHash}`;
      await cacheSet(cacheKey, result, ttl ?? this.CACHE_TTL);
      logger.debug('QueryAccelerator result cached', { queryHash });
    } catch (error) {
      logger.warn('QueryAccelerator cache set failed', { queryHash, error: (error as Error).message });
    }
  }

  computeQueryHash(query: string, params?: unknown[]): string {
    const payload = JSON.stringify({ query, params: params ?? [] });
    return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
  }

  getMaterializedView(viewId: string): MaterializedView | null {
    return this.materializedViews.get(viewId) ?? null;
  }

  private generateViewId(groupBy: string[], metrics: AggregateMetric[]): string {
    const key = JSON.stringify({ groupBy, metrics: metrics.map(m => `${m.aggregation}(${m.field})`) });
    return crypto.createHash('md5').update(key).digest('hex').substring(0, 12);
  }

  private hash32(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash;
  }

  private countLeadingZeros(value: number): number {
    if (value === 0) return 32;
    let count = 0;
    let v = value >>> 0;
    while ((v & 0x80000000) === 0 && count < 32) {
      count++;
      v <<= 1;
    }
    return count;
  }
}
