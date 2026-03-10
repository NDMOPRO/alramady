import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface DataSourceConfig {
  id: string;
  name: string;
  type: 'postgresql' | 'mysql' | 'mssql' | 'oracle' | 'mongodb' | 'rest_api' | 'graphql' | 'csv' | 'excel';
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  schema?: string;
  apiEndpoint?: string;
  apiHeaders?: Record<string, string>;
  options: Record<string, any>;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt?: Date;
}

interface QueryBuilderOptions {
  table: string;
  select: SelectClause[];
  where?: WhereClause[];
  joins?: JoinClause[];
  groupBy?: string[];
  having?: WhereClause[];
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
  distinct?: boolean;
}

interface SelectClause {
  field: string;
  alias?: string;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'count_distinct';
  expression?: string;
}

interface WhereClause {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'not_in' | 'between' | 'is_null' | 'is_not_null';
  value?: unknown;
  logicalOp?: 'AND' | 'OR';
}

interface JoinClause {
  type: 'inner' | 'left' | 'right' | 'full';
  table: string;
  alias?: string;
  on: { leftField: string; rightField: string };
}

interface OrderByClause {
  field: string;
  direction: 'asc' | 'desc';
  nullsPosition?: 'first' | 'last';
}

interface AggregationPipeline {
  stages: AggregationStage[];
  outputFields: string[];
}

interface AggregationStage {
  type: 'group' | 'filter' | 'project' | 'sort' | 'limit' | 'unwind' | 'lookup' | 'compute';
  config: Record<string, any>;
}

interface CrossJoinResult {
  data: Record<string, any>[];
  metadata: {
    sourceA: string;
    sourceB: string;
    joinField: string;
    matchedRows: number;
    unmatchedRowsA: number;
    unmatchedRowsB: number;
    totalRows: number;
    executionTime: number;
  };
}

interface DataSourceTestResult {
  success: boolean;
  latency: number;
  error?: string;
  serverVersion?: string;
  availableTables?: string[];
}

interface SchemaInfo {
  tables: TableInfo[];
  views: ViewInfo[];
}

interface TableInfo {
  name: string;
  schema: string;
  columns: ColumnInfo[];
  rowCount: number;
  primaryKey?: string[];
  indexes: string[];
}

interface ViewInfo {
  name: string;
  schema: string;
  columns: ColumnInfo[];
  definition: string;
}

interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: { table: string; column: string };
}

// ─── Service ─────────────────────────────────────────────────────────
export default class DataSourceService {
  private prisma: PrismaClient;
  private dataSources: Map<string, DataSourceConfig> = new Map();
  private schemaCache: Map<string, { schema: SchemaInfo; expiry: number }> = new Map();
  private queryCache: Map<string, { data: Record<string, any>[]; expiry: number }> = new Map();
  private readonly SCHEMA_CACHE_TTL = 600000;
  private readonly QUERY_CACHE_TTL = 30000;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private mapTypeToEnum(type: string): string {
    const typeMap: Record<string, string> = {
      postgresql: 'POSTGRESQL', mysql: 'MYSQL', mssql: 'MSSQL', oracle: 'ORACLE',
      mongodb: 'MONGODB', rest_api: 'REST_API', graphql: 'GRAPHQL',
      csv: 'CSV_FILE', excel: 'EXCEL_FILE',
    };
    return typeMap[type] || 'INTERNAL_DATASET';
  }

  private mapStatusToEnum(status: string): string {
    const statusMap: Record<string, string> = {
      active: 'ACTIVE', inactive: 'INACTIVE', error: 'ERROR', testing: 'TESTING',
    };
    return statusMap[status] || 'ACTIVE';
  }

  async registerDataSource(config: DataSourceConfig, tenantId?: string): Promise<string> {
    const sourceId = config.id || crypto.randomUUID();
    config.id = sourceId;

    const testResult = await this.testConnection(config);
    config.status = testResult.success ? 'active' : 'error';
    config.lastTestedAt = new Date();

    this.dataSources.set(sourceId, config);

    const resolvedTenantId = tenantId || 'default';

    await this.prisma.reportDataSource.upsert({
      where: { id: sourceId },
      update: {
        name: config.name,
        type: this.mapTypeToEnum(config.type) as string,
        connectionConfig: this.sanitizeConfig(config) as Record<string, any>,
        status: this.mapStatusToEnum(config.status) as string,
        lastTestedAt: config.lastTestedAt,
        updatedAt: new Date(),
      },
      create: {
        id: sourceId,
        reportId: 'system',
        tenantId: resolvedTenantId,
        name: config.name,
        type: this.mapTypeToEnum(config.type) as string,
        connectionConfig: this.sanitizeConfig(config) as Record<string, any>,
        status: this.mapStatusToEnum(config.status) as string,
        lastTestedAt: config.lastTestedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return sourceId;
  }

  private sanitizeConfig(config: DataSourceConfig): Record<string, any> {
    const sanitized = { ...config } as Record<string, any>;
    if (sanitized.password) {
      sanitized.password = '***ENCRYPTED***';
    }
    if (sanitized.connectionString) {
      const connStr = String(sanitized.connectionString);
      sanitized.connectionString = connStr.replace(/:([^@]+)@/, ':***@');
    }
    return sanitized;
  }

  async testConnection(config: DataSourceConfig): Promise<DataSourceTestResult> {
    const startTime = Date.now();

    try {
      if (config.type === 'postgresql' || config.type === 'mysql' || config.type === 'mssql') {
        const result: Record<string, any>[] = await this.prisma.$queryRawUnsafe('SELECT 1 as test');
        const latency = Date.now() - startTime;

        const versionResult: Record<string, any>[] = await this.prisma.$queryRawUnsafe('SELECT version() as ver');
        const serverVersion = versionResult[0]?.ver || 'unknown';

        const tablesResult: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = '${config.schema || 'public'}'
          ORDER BY table_name
          LIMIT 100
        `);

        const availableTables = tablesResult.map(t => t.table_name);

        return {
          success: true,
          latency,
          serverVersion: String(serverVersion),
          availableTables,
        };
      } else if (config.type === 'rest_api' && config.apiEndpoint) {
        const response = await fetch(config.apiEndpoint, {
          method: 'HEAD',
          headers: config.apiHeaders || {},
          signal: AbortSignal.timeout(10000),
        });

        return {
          success: response.ok,
          latency: Date.now() - startTime,
          serverVersion: response.headers.get('server') || undefined,
          error: response.ok ? undefined : `HTTP ${response.status}`,
        };
      }

      return { success: true, latency: Date.now() - startTime };
    } catch (error) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getSchema(sourceId: string): Promise<SchemaInfo> {
    const cached = this.schemaCache.get(sourceId);
    if (cached && cached.expiry > Date.now()) {
      return cached.schema;
    }

    const config = this.dataSources.get(sourceId);
    if (!config) {
      throw new Error(`Data source not found: ${sourceId}`);
    }

    const schemaName = config.schema || 'public';

    const tablesResult: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
      SELECT
        t.table_name,
        t.table_schema,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = t.table_name) as row_count
      FROM information_schema.tables t
      WHERE t.table_schema = '${schemaName}' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);

    const tables: TableInfo[] = [];
    for (const tableRow of tablesResult) {
      const columnsResult: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
        SELECT
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
          CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key,
          fk.foreign_table_name,
          fk.foreign_column_name
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = '${tableRow.table_name}' AND tc.constraint_type = 'PRIMARY KEY'
        ) pk ON pk.column_name = c.column_name
        LEFT JOIN (
          SELECT
            kcu.column_name,
            ccu.table_name as foreign_table_name,
            ccu.column_name as foreign_column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = '${tableRow.table_name}' AND tc.constraint_type = 'FOREIGN KEY'
        ) fk ON fk.column_name = c.column_name
        WHERE c.table_name = '${tableRow.table_name}' AND c.table_schema = '${schemaName}'
        ORDER BY c.ordinal_position
      `);

      const columns: ColumnInfo[] = columnsResult.map(col => ({
        name: col.column_name,
        dataType: col.data_type,
        nullable: col.is_nullable === 'YES',
        defaultValue: col.column_default || undefined,
        isPrimaryKey: col.is_primary_key,
        isForeignKey: col.is_foreign_key,
        references: col.is_foreign_key
          ? { table: col.foreign_table_name, column: col.foreign_column_name }
          : undefined,
      }));

      const primaryKeys = columns.filter(c => c.isPrimaryKey).map(c => c.name);

      const indexResult: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = '${tableRow.table_name}' AND schemaname = '${schemaName}'
      `);

      tables.push({
        name: tableRow.table_name,
        schema: tableRow.table_schema,
        columns,
        rowCount: Number(tableRow.row_count) || 0,
        primaryKey: primaryKeys.length > 0 ? primaryKeys : undefined,
        indexes: indexResult.map(i => i.indexname),
      });
    }

    const viewsResult: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
      SELECT table_name, view_definition
      FROM information_schema.views
      WHERE table_schema = '${schemaName}'
      ORDER BY table_name
    `);

    const views: ViewInfo[] = [];
    for (const viewRow of viewsResult) {
      const viewCols: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = '${viewRow.table_name}' AND table_schema = '${schemaName}'
        ORDER BY ordinal_position
      `);

      views.push({
        name: viewRow.table_name,
        schema: schemaName,
        columns: viewCols.map(c => ({
          name: c.column_name,
          dataType: c.data_type,
          nullable: c.is_nullable === 'YES',
          isPrimaryKey: false,
          isForeignKey: false,
        })),
        definition: viewRow.view_definition || '',
      });
    }

    const schemaInfo: SchemaInfo = { tables, views };
    this.schemaCache.set(sourceId, { schema: schemaInfo, expiry: Date.now() + this.SCHEMA_CACHE_TTL });
    return schemaInfo;
  }

  buildQuery(options: QueryBuilderOptions): string {
    const parts: string[] = [];

    const selectFields = options.select.map(s => {
      let fieldExpr = s.expression || `"${s.field}"`;

      if (s.aggregation) {
        switch (s.aggregation) {
          case 'sum': fieldExpr = `SUM(${fieldExpr})`; break;
          case 'avg': fieldExpr = `AVG(${fieldExpr})`; break;
          case 'count': fieldExpr = `COUNT(${fieldExpr})`; break;
          case 'min': fieldExpr = `MIN(${fieldExpr})`; break;
          case 'max': fieldExpr = `MAX(${fieldExpr})`; break;
          case 'count_distinct': fieldExpr = `COUNT(DISTINCT ${fieldExpr})`; break;
        }
      }

      return s.alias ? `${fieldExpr} AS "${s.alias}"` : fieldExpr;
    });

    const selectKeyword = options.distinct ? 'SELECT DISTINCT' : 'SELECT';
    parts.push(`${selectKeyword} ${selectFields.join(', ')}`);
    parts.push(`FROM "${options.table}"`);

    if (options.joins) {
      for (const join of options.joins) {
        const joinType = join.type.toUpperCase();
        const tableExpr = join.alias ? `"${join.table}" AS "${join.alias}"` : `"${join.table}"`;
        const onClause = `"${join.on.leftField}" = "${join.on.rightField}"`;
        parts.push(`${joinType} JOIN ${tableExpr} ON ${onClause}`);
      }
    }

    if (options.where && options.where.length > 0) {
      const whereStr = this.buildWhereClause(options.where);
      parts.push(`WHERE ${whereStr}`);
    }

    if (options.groupBy && options.groupBy.length > 0) {
      parts.push(`GROUP BY ${options.groupBy.map(g => `"${g}"`).join(', ')}`);
    }

    if (options.having && options.having.length > 0) {
      const havingStr = this.buildWhereClause(options.having);
      parts.push(`HAVING ${havingStr}`);
    }

    if (options.orderBy && options.orderBy.length > 0) {
      const orderStr = options.orderBy
        .map(o => {
          let clause = `"${o.field}" ${o.direction.toUpperCase()}`;
          if (o.nullsPosition) {
            clause += ` NULLS ${o.nullsPosition.toUpperCase()}`;
          }
          return clause;
        })
        .join(', ');
      parts.push(`ORDER BY ${orderStr}`);
    }

    if (options.limit !== undefined) {
      parts.push(`LIMIT ${options.limit}`);
    }
    if (options.offset !== undefined) {
      parts.push(`OFFSET ${options.offset}`);
    }

    return parts.join('\n');
  }

  private buildWhereClause(clauses: WhereClause[]): string {
    const conditions: string[] = [];

    for (let i = 0; i < clauses.length; i++) {
      const clause = clauses[i];
      let condition = '';
      const field = `"${clause.field}"`;

      switch (clause.operator) {
        case 'eq': condition = `${field} = '${clause.value}'`; break;
        case 'neq': condition = `${field} != '${clause.value}'`; break;
        case 'gt': condition = `${field} > ${clause.value}`; break;
        case 'gte': condition = `${field} >= ${clause.value}`; break;
        case 'lt': condition = `${field} < ${clause.value}`; break;
        case 'lte': condition = `${field} <= ${clause.value}`; break;
        case 'like': condition = `${field} ILIKE '${clause.value}'`; break;
        case 'in': {
          const vals = Array.isArray(clause.value) ? clause.value.map(v => `'${v}'`).join(', ') : `'${clause.value}'`;
          condition = `${field} IN (${vals})`;
          break;
        }
        case 'not_in': {
          const vals = Array.isArray(clause.value) ? clause.value.map(v => `'${v}'`).join(', ') : `'${clause.value}'`;
          condition = `${field} NOT IN (${vals})`;
          break;
        }
        case 'between': {
          const range = clause.value as [unknown, unknown];
          condition = `${field} BETWEEN ${range[0]} AND ${range[1]}`;
          break;
        }
        case 'is_null': condition = `${field} IS NULL`; break;
        case 'is_not_null': condition = `${field} IS NOT NULL`; break;
      }

      if (i > 0 && clause.logicalOp) {
        conditions.push(`${clause.logicalOp} ${condition}`);
      } else {
        conditions.push(condition);
      }
    }

    return conditions.join(' ');
  }

  async executeQuery(sourceId: string, query: string, useCache: boolean = true): Promise<Record<string, any>[]> {
    if (useCache) {
      const cacheKey = `${sourceId}:${crypto.createHash('md5').update(query).digest('hex')}`;
      const cached = this.queryCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return cached.data;
      }
    }

    const data: Record<string, any>[] = await this.prisma.$queryRawUnsafe(query);

    if (useCache) {
      const cacheKey = `${sourceId}:${crypto.createHash('md5').update(query).digest('hex')}`;
      this.queryCache.set(cacheKey, { data, expiry: Date.now() + this.QUERY_CACHE_TTL });
    }

    return data;
  }

  async runAggregationPipeline(
    sourceId: string,
    tableName: string,
    pipeline: AggregationPipeline,
  ): Promise<Record<string, any>[]> {
    let currentData: Record<string, any>[] = await this.executeQuery(
      sourceId,
      `SELECT * FROM "${tableName}"`,
      false,
    );

    for (const stage of pipeline.stages) {
      currentData = this.applyPipelineStage(currentData, stage);
    }

    if (pipeline.outputFields.length > 0) {
      currentData = currentData.map(row => {
        const projected: Record<string, any> = {};
        for (const field of pipeline.outputFields) {
          projected[field] = row[field];
        }
        return projected;
      });
    }

    return currentData;
  }

  private applyPipelineStage(
    data: Record<string, any>[],
    stage: AggregationStage,
  ): Record<string, any>[] {
    switch (stage.type) {
      case 'filter': {
        const field = stage.config.field as string;
        const operator = stage.config.operator as string;
        const value = stage.config.value;

        return data.filter(row => {
          const rowVal = row[field];
          switch (operator) {
            case 'eq': return rowVal === value;
            case 'neq': return rowVal !== value;
            case 'gt': return Number(rowVal) > Number(value);
            case 'gte': return Number(rowVal) >= Number(value);
            case 'lt': return Number(rowVal) < Number(value);
            case 'lte': return Number(rowVal) <= Number(value);
            default: return true;
          }
        });
      }

      case 'group': {
        const groupField = stage.config.groupBy as string;
        const aggField = stage.config.aggregateField as string;
        const aggType = stage.config.aggregationType as string;

        const groups = new Map<string, Record<string, any>[]>();
        for (const row of data) {
          const key = String(row[groupField] || 'null');
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(row);
        }

        const result: Record<string, any>[] = [];
        for (const [key, rows] of groups) {
          const values = rows.map(r => Number(r[aggField]) || 0);
          let aggValue: number;

          switch (aggType) {
            case 'sum': aggValue = values.reduce((a, b) => a + b, 0); break;
            case 'avg': aggValue = values.reduce((a, b) => a + b, 0) / values.length; break;
            case 'count': aggValue = values.length; break;
            case 'min': aggValue = Math.min(...values); break;
            case 'max': aggValue = Math.max(...values); break;
            default: aggValue = 0;
          }

          result.push({
            [groupField]: key,
            [aggField]: aggValue,
            _count: rows.length,
          });
        }
        return result;
      }

      case 'sort': {
        const sortField = stage.config.field as string;
        const direction = stage.config.direction as string;
        const multiplier = direction === 'desc' ? -1 : 1;

        return [...data].sort((a, b) => {
          const aVal = a[sortField];
          const bVal = b[sortField];
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            return (aVal - bVal) * multiplier;
          }
          return String(aVal || '').localeCompare(String(bVal || '')) * multiplier;
        });
      }

      case 'limit': {
        const limitCount = stage.config.count as number;
        return data.slice(0, limitCount);
      }

      case 'compute': {
        const outputField = stage.config.outputField as string;
        const expression = stage.config.expression as string;
        const fieldA = stage.config.fieldA as string;
        const fieldB = stage.config.fieldB as string;

        return data.map(row => {
          const a = Number(row[fieldA]) || 0;
          const b = Number(row[fieldB]) || 0;
          let computed: number;

          switch (expression) {
            case 'add': computed = a + b; break;
            case 'subtract': computed = a - b; break;
            case 'multiply': computed = a * b; break;
            case 'divide': computed = b !== 0 ? a / b : 0; break;
            case 'percentage': computed = b !== 0 ? (a / b) * 100 : 0; break;
            default: computed = 0;
          }

          return { ...row, [outputField]: Math.round(computed * 100) / 100 };
        });
      }

      case 'project': {
        const fields = stage.config.fields as string[];
        return data.map(row => {
          const projected: Record<string, any> = {};
          for (const f of fields) {
            projected[f] = row[f];
          }
          return projected;
        });
      }

      default:
        return data;
    }
  }

  async crossJoinSources(
    sourceIdA: string,
    tableA: string,
    sourceIdB: string,
    tableB: string,
    joinField: string,
    joinType: 'inner' | 'left' | 'right' | 'full' = 'inner',
  ): Promise<CrossJoinResult> {
    const startTime = Date.now();

    const [dataA, dataB] = await Promise.all([
      this.executeQuery(sourceIdA, `SELECT * FROM "${tableA}"`),
      this.executeQuery(sourceIdB, `SELECT * FROM "${tableB}"`),
    ]);

    const indexB = new Map<string, Record<string, any>[]>();
    for (const row of dataB) {
      const key = String(row[joinField] || '');
      if (!indexB.has(key)) indexB.set(key, []);
      indexB.get(key)!.push(row);
    }

    const joined: Record<string, any>[] = [];
    const matchedBKeys = new Set<string>();
    let matchedRows = 0;
    let unmatchedA = 0;

    for (const rowA of dataA) {
      const key = String(rowA[joinField] || '');
      const matchingB = indexB.get(key);

      if (matchingB && matchingB.length > 0) {
        for (const rowB of matchingB) {
          const merged: Record<string, any> = {};
          for (const [k, v] of Object.entries(rowA)) {
            merged[`a_${k}`] = v;
          }
          for (const [k, v] of Object.entries(rowB)) {
            merged[`b_${k}`] = v;
          }
          merged[joinField] = rowA[joinField];
          joined.push(merged);
          matchedRows++;
        }
        matchedBKeys.add(key);
      } else if (joinType === 'left' || joinType === 'full') {
        const merged: Record<string, any> = {};
        for (const [k, v] of Object.entries(rowA)) {
          merged[`a_${k}`] = v;
        }
        merged[joinField] = rowA[joinField];
        joined.push(merged);
        unmatchedA++;
      }
    }

    let unmatchedB = 0;
    if (joinType === 'right' || joinType === 'full') {
      for (const rowB of dataB) {
        const key = String(rowB[joinField] || '');
        if (!matchedBKeys.has(key)) {
          const merged: Record<string, any> = {};
          for (const [k, v] of Object.entries(rowB)) {
            merged[`b_${k}`] = v;
          }
          merged[joinField] = rowB[joinField];
          joined.push(merged);
          unmatchedB++;
        }
      }
    }

    return {
      data: joined,
      metadata: {
        sourceA: tableA,
        sourceB: tableB,
        joinField,
        matchedRows,
        unmatchedRowsA: unmatchedA,
        unmatchedRowsB: unmatchedB,
        totalRows: joined.length,
        executionTime: Date.now() - startTime,
      },
    };
  }

  async listDataSources(): Promise<DataSourceConfig[]> {
    return Array.from(this.dataSources.values());
  }

  async removeDataSource(sourceId: string): Promise<void> {
    this.dataSources.delete(sourceId);
    this.schemaCache.delete(sourceId);

    for (const key of this.queryCache.keys()) {
      if (key.startsWith(`${sourceId}:`)) {
        this.queryCache.delete(key);
      }
    }

    await this.prisma.reportDataSource.update({
      where: { id: sourceId },
      data: { status: 'INACTIVE', updatedAt: new Date() },
    });
  }
}
