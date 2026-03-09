import { logger } from '../../utils/logger.js';

interface ColumnSchema {
  name: string;
  type: 'INTEGER' | 'BIGINT' | 'DOUBLE' | 'VARCHAR' | 'BOOLEAN' | 'TIMESTAMP' | 'DATE' | 'JSON';
  nullable?: boolean;
  defaultValue?: unknown;
}

interface TableSchema {
  tableName: string;
  columns: ColumnSchema[];
  primaryKey?: string[];
  partitionBy?: string;
}

interface VersionRecord {
  versionId: number;
  timestamp: number;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'SCHEMA_CHANGE';
  rowCount: number;
  snapshotData: unknown[];
  schema: TableSchema;
}

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionTimeMs: number;
}

export class LakehouseEngine {
  private tables: Map<string, { schema: TableSchema; data: unknown[][]; versions: VersionRecord[] }> = new Map();
  private nextVersionId = 1;

  async executeQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
    const startTime = Date.now();
    const trimmedSql = sql.trim().toUpperCase();

    try {
      if (trimmedSql.startsWith('SELECT')) {
        return this.executeSelect(sql, params, startTime);
      } else if (trimmedSql.startsWith('INSERT')) {
        return this.executeInsert(sql, params, startTime);
      } else if (trimmedSql.startsWith('CREATE')) {
        return this.executeCreate(sql, startTime);
      } else if (trimmedSql.startsWith('DELETE')) {
        return this.executeDelete(sql, params, startTime);
      } else {
        throw new Error(`Unsupported SQL statement: ${trimmedSql.substring(0, 20)}`);
      }
    } catch (error) {
      logger.error('LakehouseEngine query failed', { sql, error: (error as Error).message });
      throw error;
    }
  }

  private executeSelect(sql: string, params: unknown[] | undefined, startTime: number): QueryResult {
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) throw new Error('Invalid SELECT: missing FROM clause');
    const tableName = fromMatch[1];
    const table = this.tables.get(tableName);
    if (!table) throw new Error(`Table "${tableName}" does not exist`);

    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (!selectMatch) throw new Error('Invalid SELECT clause');
    const selectClause = selectMatch[1].trim();

    let selectedIndices: number[];
    let selectedColumns: string[];

    if (selectClause === '*') {
      selectedIndices = table.schema.columns.map((_, i) => i);
      selectedColumns = table.schema.columns.map(c => c.name);
    } else {
      const requestedCols = selectClause.split(',').map(c => c.trim());
      selectedIndices = [];
      selectedColumns = [];
      for (const col of requestedCols) {
        const idx = table.schema.columns.findIndex(c => c.name.toLowerCase() === col.toLowerCase());
        if (idx === -1) throw new Error(`Column "${col}" not found in table "${tableName}"`);
        selectedIndices.push(idx);
        selectedColumns.push(table.schema.columns[idx].name);
      }
    }

    let rows = table.data.map(row => selectedIndices.map(i => row[i]));

    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s+GROUP|\s*$)/i);
    if (whereMatch) {
      const condition = whereMatch[1].trim();
      rows = this.applyWhereFilter(rows, selectedColumns, condition, params);
    }

    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      rows = rows.slice(0, parseInt(limitMatch[1], 10));
    }

    logger.debug('LakehouseEngine SELECT executed', { tableName, rowCount: rows.length });
    return {
      columns: selectedColumns,
      rows,
      rowCount: rows.length,
      executionTimeMs: Date.now() - startTime,
    };
  }

  private applyWhereFilter(rows: unknown[][], columns: string[], condition: string, params?: unknown[]): unknown[][] {
    const eqMatch = condition.match(/(\w+)\s*=\s*(?:\$(\d+)|'([^']*)'|(\d+(?:\.\d+)?))/);
    if (!eqMatch) return rows;

    const colName = eqMatch[1];
    const colIdx = columns.findIndex(c => c.toLowerCase() === colName.toLowerCase());
    if (colIdx === -1) return rows;

    let value: unknown;
    if (eqMatch[2] && params) {
      value = params[parseInt(eqMatch[2], 10) - 1];
    } else if (eqMatch[3] !== undefined) {
      value = eqMatch[3];
    } else if (eqMatch[4] !== undefined) {
      value = parseFloat(eqMatch[4]);
    }

    return rows.filter(row => row[colIdx] === value);
  }

  private executeInsert(sql: string, params: unknown[] | undefined, startTime: number): QueryResult {
    const match = sql.match(/INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]+)\))?\s*VALUES\s*\(([^)]+)\)/i);
    if (!match) throw new Error('Invalid INSERT statement');
    const tableName = match[1];
    const table = this.tables.get(tableName);
    if (!table) throw new Error(`Table "${tableName}" does not exist`);

    const valuesPart = match[3];
    const values = valuesPart.split(',').map((v, i) => {
      const trimmed = v.trim();
      if (trimmed.startsWith('$') && params) {
        return params[parseInt(trimmed.substring(1), 10) - 1];
      }
      if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
      if (trimmed === 'NULL' || trimmed === 'null') return null;
      if (trimmed === 'TRUE' || trimmed === 'true') return true;
      if (trimmed === 'FALSE' || trimmed === 'false') return false;
      const num = parseFloat(trimmed);
      return isNaN(num) ? trimmed : num;
    });

    table.data.push(values);
    this.createVersionSnapshot(tableName, 'INSERT');

    logger.debug('LakehouseEngine INSERT executed', { tableName });
    return { columns: [], rows: [], rowCount: 1, executionTimeMs: Date.now() - startTime };
  }

  private executeCreate(sql: string, startTime: number): QueryResult {
    const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\((.+)\)/is);
    if (!match) throw new Error('Invalid CREATE TABLE statement');
    const tableName = match[1];
    const columnDefs = match[2];

    const columns: ColumnSchema[] = [];
    const colParts = columnDefs.split(',').map(s => s.trim()).filter(s => !s.toUpperCase().startsWith('PRIMARY'));
    for (const colDef of colParts) {
      const parts = colDef.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const name = parts[0];
      const typeStr = parts[1].toUpperCase() as ColumnSchema['type'];
      const nullable = !colDef.toUpperCase().includes('NOT NULL');
      columns.push({ name, type: typeStr, nullable });
    }

    const schema: TableSchema = { tableName, columns };
    this.tables.set(tableName, { schema, data: [], versions: [] });

    logger.info('LakehouseEngine table created', { tableName, columnCount: columns.length });
    return { columns: [], rows: [], rowCount: 0, executionTimeMs: Date.now() - startTime };
  }

  private executeDelete(sql: string, params: unknown[] | undefined, startTime: number): QueryResult {
    const match = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
    if (!match) throw new Error('Invalid DELETE statement');
    const tableName = match[1];
    const table = this.tables.get(tableName);
    if (!table) throw new Error(`Table "${tableName}" does not exist`);

    const beforeCount = table.data.length;
    if (match[2]) {
      const columns = table.schema.columns.map(c => c.name);
      const remaining = this.applyWhereFilter(table.data, columns, match[2], params);
      const deletedCount = beforeCount - remaining.length;
      table.data = table.data.filter(row => remaining.some(r => JSON.stringify(r) === JSON.stringify(row)));
      // Actually invert: keep rows NOT matching
      const allCols = table.schema.columns.map(c => c.name);
      const matchingRows = this.applyWhereFilter(table.data, allCols, match[2], params);
      table.data = table.data.filter(row => !matchingRows.some(m => JSON.stringify(m) === JSON.stringify(row)));
      this.createVersionSnapshot(tableName, 'DELETE');
      return { columns: [], rows: [], rowCount: beforeCount - table.data.length, executionTimeMs: Date.now() - startTime };
    } else {
      table.data = [];
      this.createVersionSnapshot(tableName, 'DELETE');
      return { columns: [], rows: [], rowCount: beforeCount, executionTimeMs: Date.now() - startTime };
    }
  }

  async importDataset(data: unknown[], schema: TableSchema): Promise<{ tableId: string; rowCount: number }> {
    if (!data || data.length === 0) {
      throw new Error('Cannot import empty dataset');
    }

    const tableName = schema.tableName;
    const columnarData: unknown[][] = [];

    for (const record of data) {
      const row: unknown[] = [];
      for (const col of schema.columns) {
        const value = (record as Record<string, unknown>)[col.name];
        row.push(value !== undefined ? value : null);
      }
      columnarData.push(row);
    }

    this.tables.set(tableName, { schema, data: columnarData, versions: [] });
    this.createVersionSnapshot(tableName, 'INSERT');

    logger.info('LakehouseEngine dataset imported', { tableName, rowCount: data.length, columnCount: schema.columns.length });
    return { tableId: tableName, rowCount: data.length };
  }

  async timeTravel(tableId: string, timestamp: number): Promise<{ data: unknown[][]; schema: TableSchema; versionId: number }> {
    const table = this.tables.get(tableId);
    if (!table) throw new Error(`Table "${tableId}" does not exist`);

    const versions = table.versions.filter(v => v.timestamp <= timestamp);
    if (versions.length === 0) {
      throw new Error(`No version found for table "${tableId}" at or before timestamp ${timestamp}`);
    }

    const targetVersion = versions[versions.length - 1];
    logger.info('LakehouseEngine time travel', { tableId, timestamp, versionId: targetVersion.versionId });

    return {
      data: targetVersion.snapshotData as unknown[][],
      schema: targetVersion.schema,
      versionId: targetVersion.versionId,
    };
  }

  async schemaEvolution(tableId: string, newSchema: TableSchema): Promise<{ migratedRows: number; addedColumns: string[]; droppedColumns: string[] }> {
    const table = this.tables.get(tableId);
    if (!table) throw new Error(`Table "${tableId}" does not exist`);

    const oldColNames = table.schema.columns.map(c => c.name);
    const newColNames = newSchema.columns.map(c => c.name);
    const addedColumns = newColNames.filter(n => !oldColNames.includes(n));
    const droppedColumns = oldColNames.filter(n => !newColNames.includes(n));

    const newData: unknown[][] = [];
    for (const row of table.data) {
      const newRow: unknown[] = [];
      for (const newCol of newSchema.columns) {
        const oldIdx = table.schema.columns.findIndex(c => c.name === newCol.name);
        if (oldIdx >= 0) {
          newRow.push(row[oldIdx]);
        } else {
          newRow.push(newCol.defaultValue !== undefined ? newCol.defaultValue : null);
        }
      }
      newData.push(newRow);
    }

    table.schema = { ...newSchema };
    table.data = newData;
    this.createVersionSnapshot(tableId, 'SCHEMA_CHANGE');

    logger.info('LakehouseEngine schema evolved', { tableId, addedColumns, droppedColumns, migratedRows: newData.length });
    return { migratedRows: newData.length, addedColumns, droppedColumns };
  }

  private createVersionSnapshot(tableId: string, operation: VersionRecord['operation']): void {
    const table = this.tables.get(tableId);
    if (!table) return;

    const version: VersionRecord = {
      versionId: this.nextVersionId++,
      timestamp: Date.now(),
      operation,
      rowCount: table.data.length,
      snapshotData: table.data.map(row => [...row]),
      schema: { ...table.schema, columns: table.schema.columns.map(c => ({ ...c })) },
    };
    table.versions.push(version);
  }

  getTableNames(): string[] {
    return Array.from(this.tables.keys());
  }

  getTableSchema(tableId: string): TableSchema | null {
    const table = this.tables.get(tableId);
    return table ? table.schema : null;
  }

  getVersionHistory(tableId: string): Omit<VersionRecord, 'snapshotData'>[] {
    const table = this.tables.get(tableId);
    if (!table) return [];
    return table.versions.map(({ snapshotData, ...rest }) => rest);
  }
}
