import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createLogger, format, transports } from 'winston';

const prisma = new PrismaClient();

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'distributed-query' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

interface QueryPartition {
  partitionId: string;
  offset: number;
  limit: number;
  filter?: Record<string, unknown>;
}

interface PartitionResult {
  partitionId: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

interface AggregateResult {
  column: string;
  sum: number;
  count: number;
  min: number;
  max: number;
  avg: number;
}

interface DistributedQueryResult {
  queryId: string;
  totalRows: number;
  partitions: number;
  executionTimeMs: number;
  data: Record<string, unknown>[];
  aggregates?: AggregateResult[];
  memoryUsageMb: number;
}

export class DistributedQueryService {
  private normalizeRowCount(value: bigint | number | null | undefined): number {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    return value ?? 0;
  }

  async executeDistributedQuery(
    datasetId: string,
    tenantId: string,
    query: {
      select?: string[];
      where?: Record<string, unknown>;
      groupBy?: string[];
      orderBy?: { column: string; direction: 'asc' | 'desc' }[];
      limit?: number;
      offset?: number;
      aggregates?: Array<{ function: 'sum' | 'avg' | 'min' | 'max' | 'count'; column: string }>;
    },
    userId = 'system',
  ): Promise<DistributedQueryResult> {
    const queryId = randomUUID();
    const startTime = Date.now();

    logger.info('Executing distributed query', { queryId, datasetId, tenantId });

    const dataset = await prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      select: { id: true, name: true, rowCount: true, columnCount: true },
    });

    if (!dataset) throw new Error(`Dataset not found: ${datasetId}`);

    const totalRows = this.normalizeRowCount(dataset.rowCount);
    const partitionSize = Math.min(50000, Math.max(10000, Math.ceil(totalRows / 8)));
    const numPartitions = Math.ceil(totalRows / partitionSize);

    const partitions: QueryPartition[] = [];
    for (let i = 0; i < numPartitions; i++) {
      partitions.push({
        partitionId: `${queryId}-p${i}`,
        offset: i * partitionSize,
        limit: partitionSize,
        filter: query.where,
      });
    }

    logger.info('Query partitioned', { queryId, totalRows, numPartitions, partitionSize });

    const concurrency = Math.min(numPartitions, 8);
    const results: PartitionResult[] = [];

    for (let i = 0; i < partitions.length; i += concurrency) {
      const batch = partitions.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((partition) => this.executePartition(datasetId, partition, query.select)),
      );
      results.push(...batchResults);
    }

    let allRows = results.flatMap((r) => r.rows);

    if (query.where) {
      allRows = this.applyFilter(allRows, query.where);
    }

    if (query.select && query.select.length > 0) {
      allRows = allRows.map((row) => {
        const selected: Record<string, unknown> = {};
        for (const col of query.select!) {
          if (col in row) selected[col] = row[col];
        }
        return selected;
      });
    }

    let aggregates: AggregateResult[] | undefined;
    if (query.aggregates && query.aggregates.length > 0) {
      aggregates = this.computeAggregates(allRows, query.aggregates);
    }

    if (query.groupBy && query.groupBy.length > 0) {
      allRows = this.applyGroupBy(allRows, query.groupBy, query.aggregates);
    }

    if (query.orderBy && query.orderBy.length > 0) {
      allRows = this.applyOrderBy(allRows, query.orderBy);
    }

    const offset = query.offset || 0;
    const limit = query.limit || 1000;
    allRows = allRows.slice(offset, offset + limit);

    const executionTimeMs = Date.now() - startTime;
    const memUsage = process.memoryUsage();

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'distributed_query_executed',
        entityType: 'dataset',
        entityId: datasetId,
        detailsJson: {
          queryId,
          tenantId,
          partitions: numPartitions,
          totalRows,
          resultRows: allRows.length,
          executionTimeMs,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      queryId,
      totalRows: allRows.length,
      partitions: numPartitions,
      executionTimeMs,
      data: allRows,
      aggregates,
      memoryUsageMb: Math.round(memUsage.heapUsed / 1024 / 1024),
    };
  }

  async estimateQueryCost(
    datasetId: string,
    tenantId: string,
  ): Promise<{ estimatedRows: number; estimatedPartitions: number; estimatedTimeMs: number; estimatedMemoryMb: number }> {
    const dataset = await prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      select: { rowCount: true, columnCount: true },
    });

    if (!dataset) throw new Error(`Dataset not found: ${datasetId}`);

    const rows = this.normalizeRowCount(dataset.rowCount);
    const cols = dataset.columnCount || 10;
    const partitions = Math.ceil(rows / 50000);
    const estimatedTimeMs = Math.round(rows * 0.001 * cols * 0.1 + partitions * 50);
    const estimatedMemoryMb = Math.round((rows * cols * 50) / (1024 * 1024));

    return {
      estimatedRows: rows,
      estimatedPartitions: partitions,
      estimatedTimeMs,
      estimatedMemoryMb: Math.max(10, estimatedMemoryMb),
    };
  }

  private async executePartition(
    datasetId: string,
    partition: QueryPartition,
    selectColumns?: string[],
  ): Promise<PartitionResult> {
    const startTime = Date.now();
    const rowRepository = (
      prisma as unknown as {
        dataRow?: { findMany: (args: Record<string, unknown>) => Promise<Array<{ data: Prisma.JsonValue }>> };
        datasetRow?: { findMany: (args: Record<string, unknown>) => Promise<Array<{ data: Prisma.JsonValue }>> };
      }
    ).dataRow ?? (
      prisma as unknown as {
        datasetRow?: { findMany: (args: Record<string, unknown>) => Promise<Array<{ data: Prisma.JsonValue }>> };
      }
    ).datasetRow;

    if (!rowRepository) {
      throw new Error('Data row repository is not available');
    }

    const rows = await rowRepository.findMany({
      where: { datasetId },
      skip: partition.offset,
      take: partition.limit,
      select: { data: true },
    });

    const parsedRows = rows.map((row: { data: Prisma.JsonValue }) => {
      const data = row.data as Record<string, unknown>;
      return data;
    });

    return {
      partitionId: partition.partitionId,
      rows: parsedRows,
      rowCount: parsedRows.length,
      executionTimeMs: Date.now() - startTime,
    };
  }

  private applyFilter(
    rows: Record<string, unknown>[],
    filter: Record<string, unknown>,
  ): Record<string, unknown>[] {
    return rows.filter((row) => {
      for (const [key, condition] of Object.entries(filter)) {
        const value = row[key];

        if (condition === null) {
          if (value !== null) return false;
          continue;
        }

        if (typeof condition === 'object' && condition !== null) {
          const cond = condition as Record<string, unknown>;
          if ('eq' in cond && value !== cond.eq) return false;
          if ('neq' in cond && value === cond.neq) return false;
          if ('gt' in cond && (typeof value !== 'number' || value <= (cond.gt as number))) return false;
          if ('gte' in cond && (typeof value !== 'number' || value < (cond.gte as number))) return false;
          if ('lt' in cond && (typeof value !== 'number' || value >= (cond.lt as number))) return false;
          if ('lte' in cond && (typeof value !== 'number' || value > (cond.lte as number))) return false;
          if ('contains' in cond && (typeof value !== 'string' || !value.includes(String(cond.contains)))) return false;
          if ('in' in cond && Array.isArray(cond.in) && !cond.in.includes(value)) return false;
        } else if (value !== condition) {
          return false;
        }
      }
      return true;
    });
  }

  private computeAggregates(
    rows: Record<string, unknown>[],
    aggregates: Array<{ function: string; column: string }>,
  ): AggregateResult[] {
    return aggregates.map((agg) => {
      const values = rows
        .map((r) => r[agg.column])
        .filter((v): v is number => typeof v === 'number');

      if (values.length === 0) {
        return { column: agg.column, sum: 0, count: 0, min: 0, max: 0, avg: 0 };
      }

      const sum = values.reduce((a, b) => a + b, 0);
      return {
        column: agg.column,
        sum,
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: sum / values.length,
      };
    });
  }

  private applyGroupBy(
    rows: Record<string, unknown>[],
    groupColumns: string[],
    aggregates?: Array<{ function: string; column: string }>,
  ): Record<string, unknown>[] {
    const groups = new Map<string, Record<string, unknown>[]>();

    for (const row of rows) {
      const key = groupColumns.map((col) => String(row[col] ?? 'null')).join('|');
      const group = groups.get(key) || [];
      group.push(row);
      groups.set(key, group);
    }

    const result: Record<string, unknown>[] = [];
    for (const [, groupRows] of groups) {
      const representative: Record<string, unknown> = {};

      for (const col of groupColumns) {
        representative[col] = groupRows[0][col];
      }

      representative._count = groupRows.length;

      if (aggregates) {
        for (const agg of aggregates) {
          const values = groupRows
            .map((r) => r[agg.column])
            .filter((v): v is number => typeof v === 'number');

          if (values.length > 0) {
            switch (agg.function) {
              case 'sum': representative[`${agg.function}_${agg.column}`] = values.reduce((a, b) => a + b, 0); break;
              case 'avg': representative[`${agg.function}_${agg.column}`] = values.reduce((a, b) => a + b, 0) / values.length; break;
              case 'min': representative[`${agg.function}_${agg.column}`] = Math.min(...values); break;
              case 'max': representative[`${agg.function}_${agg.column}`] = Math.max(...values); break;
              case 'count': representative[`${agg.function}_${agg.column}`] = values.length; break;
            }
          }
        }
      }

      result.push(representative);
    }

    return result;
  }

  private applyOrderBy(
    rows: Record<string, unknown>[],
    orderBy: Array<{ column: string; direction: 'asc' | 'desc' }>,
  ): Record<string, unknown>[] {
    return [...rows].sort((a, b) => {
      for (const { column, direction } of orderBy) {
        const valA = a[column];
        const valB = b[column];
        const mult = direction === 'desc' ? -1 : 1;

        if (valA === valB) continue;
        if (valA === null || valA === undefined) return mult;
        if (valB === null || valB === undefined) return -mult;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * mult;
        }

        return String(valA).localeCompare(String(valB), 'ar') * mult;
      }
      return 0;
    });
  }
}

export const distributedQueryService = new DistributedQueryService();
