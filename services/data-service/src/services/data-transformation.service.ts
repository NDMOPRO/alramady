import { PrismaClient } from '@prisma/client';
import * as mathjs from 'mathjs';
import { logger } from '../utils/logger';

export class DataTransformationService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async mergeDatasets(
    datasetIds: string[],
    joinType: 'inner' | 'outer' | 'left' | 'right',
    joinColumns: string[]
  ) {
    if (datasetIds.length < 2) {
      throw new Error('At least two dataset IDs are required for merging');
    }
    if (joinColumns.length === 0) {
      throw new Error('At least one join column must be specified');
    }

    logger.info('Starting dataset merge', { datasetIds, joinType, joinColumns });

    const allDatasets: { id: string; rows: Record<string, unknown>[]; columns: string[] }[] = [];

    for (const dsId of datasetIds) {
      const dataset = await this.prisma.dataset.findUniqueOrThrow({
        where: { id: dsId },
        include: { columns: { orderBy: { position: 'asc' } } },
      });
      const dataRows = await this.prisma.dataRow.findMany({
        where: { datasetId: dsId },
        orderBy: { rowIndex: 'asc' },
      });
      const rows = dataRows.map(r => r.data as Record<string, unknown>);
      const columns = dataset.columns.map(c => c.name);
      allDatasets.push({ id: dsId, rows, columns });
    }

    const buildKey = (row: Record<string, unknown>): string => {
      return joinColumns.map(col => String(row[col] ?? '__NULL__')).join('|||');
    };

    let mergedRows: Record<string, unknown>[] = allDatasets[0].rows.map(row => ({ ...row }));

    for (let i = 1; i < allDatasets.length; i++) {
      const rightDataset = allDatasets[i];
      const rightIndex = new Map<string, Record<string, unknown>[]>();
      for (const row of rightDataset.rows) {
        const key = buildKey(row);
        if (!rightIndex.has(key)) {
          rightIndex.set(key, []);
        }
        rightIndex.get(key)!.push(row);
      }

      const leftIndex = new Map<string, boolean>();
      const newMerged: Record<string, unknown>[] = [];
      const rightNonJoinCols = rightDataset.columns.filter(c => !joinColumns.includes(c));

      for (const leftRow of mergedRows) {
        const key = buildKey(leftRow);
        const rightMatches = rightIndex.get(key);

        if (rightMatches && rightMatches.length > 0) {
          leftIndex.set(key, true);
          for (const rightRow of rightMatches) {
            const combined: Record<string, unknown> = { ...leftRow };
            for (const col of rightNonJoinCols) {
              const targetCol = combined.hasOwnProperty(col) ? `${col}_${i + 1}` : col;
              combined[targetCol] = rightRow[col];
            }
            newMerged.push(combined);
          }
        } else if (joinType === 'left' || joinType === 'outer') {
          const combined: Record<string, unknown> = { ...leftRow };
          for (const col of rightNonJoinCols) {
            const targetCol = combined.hasOwnProperty(col) ? `${col}_${i + 1}` : col;
            combined[targetCol] = null;
          }
          newMerged.push(combined);
        }
      }

      if (joinType === 'right' || joinType === 'outer') {
        const existingLeftCols = Object.keys(mergedRows[0] || {});
        const leftNonJoinCols = existingLeftCols.filter(c => !joinColumns.includes(c));
        for (const rightRow of rightDataset.rows) {
          const key = buildKey(rightRow);
          if (!leftIndex.has(key)) {
            const combined: Record<string, unknown> = {};
            for (const col of joinColumns) {
              combined[col] = rightRow[col];
            }
            for (const col of leftNonJoinCols) {
              combined[col] = null;
            }
            for (const col of rightNonJoinCols) {
              const targetCol = combined.hasOwnProperty(col) ? `${col}_${i + 1}` : col;
              combined[targetCol] = rightRow[col];
            }
            newMerged.push(combined);
          }
        }
      }

      mergedRows = newMerged;
    }

    const allKeys = new Set<string>();
    mergedRows.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
    const mergedColumnNames = Array.from(allKeys);

    const columns = mergedColumnNames.map((name, idx) => ({
      name,
      dataType: this.inferColumnType(mergedRows.slice(0, 100), name),
      position: idx,
      nullable: mergedRows.some(r => r[name] === null || r[name] === undefined),
    }));

    const firstDataset = await this.prisma.dataset.findUniqueOrThrow({ where: { id: datasetIds[0] } });

    const newDataset = await this.prisma.dataset.create({
      data: {
        tenantId: firstDataset.tenantId,
        name: `merged_${datasetIds.length}_datasets_${Date.now()}`,
        sourceType: 'manual',
        format: 'MERGED',
        sizeBytes: BigInt(JSON.stringify(mergedRows).length),
        rowCount: BigInt(mergedRows.length),
        columnCount: mergedColumnNames.length,
        schemaJson: JSON.parse(JSON.stringify(columns)),
        status: 'active',
        createdBy: firstDataset.createdBy,
      },
    });

    for (const col of columns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: newDataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK = 1000;
    for (let i = 0; i < mergedRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: mergedRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId: newDataset.id,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Dataset merge completed', {
      newDatasetId: newDataset.id,
      rowCount: mergedRows.length,
      columnCount: mergedColumnNames.length,
    });

    return {
      id: newDataset.id,
      name: newDataset.name,
      joinType,
      joinColumns,
      sourceDatasetIds: datasetIds,
      rowCount: mergedRows.length,
      columnCount: mergedColumnNames.length,
      columns,
    };
  }

  async pivotTable(
    datasetId: string,
    rowFields: string[],
    colField: string,
    valueField: string,
    aggFunc: 'sum' | 'avg' | 'count' | 'min' | 'max'
  ) {
    logger.info('Starting pivot table operation', { datasetId, rowFields, colField, valueField, aggFunc });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, unknown>);

    const colValues = [...new Set(rows.map(r => String(r[colField] ?? 'null')))].sort();

    const groupMap = new Map<string, Map<string, number[]>>();
    for (const row of rows) {
      const groupKey = rowFields.map(f => String(row[f] ?? '')).join('|||');
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, new Map<string, number[]>());
      }
      const colMap = groupMap.get(groupKey)!;
      const colVal = String(row[colField] ?? 'null');
      if (!colMap.has(colVal)) {
        colMap.set(colVal, []);
      }
      const numericValue = parseFloat(String(row[valueField]));
      if (!isNaN(numericValue)) {
        colMap.get(colVal)!.push(numericValue);
      }
    }

    const aggregate = (values: number[]): number => {
      if (values.length === 0) return 0;
      switch (aggFunc) {
        case 'sum': return values.reduce((a, b) => a + b, 0);
        case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
        case 'count': return values.length;
        case 'min': return Math.min(...values);
        case 'max': return Math.max(...values);
      }
    };

    const pivotRows: Record<string, unknown>[] = [];
    for (const [groupKey, colMap] of groupMap.entries()) {
      const keyParts = groupKey.split('|||');
      const pivotRow: Record<string, unknown> = {};
      rowFields.forEach((field, idx) => {
        pivotRow[field] = keyParts[idx];
      });
      for (const colVal of colValues) {
        const values = colMap.get(colVal) || [];
        pivotRow[`${colVal}_${aggFunc}`] = aggregate(values);
      }
      pivotRows.push(pivotRow);
    }

    const pivotColumnNames = [
      ...rowFields,
      ...colValues.map(cv => `${cv}_${aggFunc}`),
    ];

    const columns = pivotColumnNames.map((name, idx) => ({
      name,
      dataType: rowFields.includes(name) ? 'string' : 'float',
      position: idx,
      nullable: false,
    }));

    const newDataset = await this.prisma.dataset.create({
      data: {
        tenantId: dataset.tenantId,
        name: `pivot_${dataset.name}_${Date.now()}`,
        sourceType: 'manual',
        format: 'PIVOT',
        sizeBytes: BigInt(JSON.stringify(pivotRows).length),
        rowCount: BigInt(pivotRows.length),
        columnCount: pivotColumnNames.length,
        schemaJson: JSON.parse(JSON.stringify(columns)),
        status: 'active',
        createdBy: dataset.createdBy,
      },
    });

    for (const col of columns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: newDataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK = 1000;
    for (let i = 0; i < pivotRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: pivotRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId: newDataset.id,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Pivot table created', { newDatasetId: newDataset.id, rowCount: pivotRows.length });

    return {
      id: newDataset.id,
      name: newDataset.name,
      rowFields,
      colField,
      valueField,
      aggFunc,
      rowCount: pivotRows.length,
      columnCount: pivotColumnNames.length,
      columns,
    };
  }

  async unpivotTable(
    datasetId: string,
    idColumns: string[],
    valueColumns: string[]
  ) {
    logger.info('Starting unpivot operation', { datasetId, idColumns, valueColumns });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, unknown>);

    const unpivotedRows: Record<string, unknown>[] = [];
    for (const row of rows) {
      for (const valCol of valueColumns) {
        const newRow: Record<string, unknown> = {};
        for (const idCol of idColumns) {
          newRow[idCol] = row[idCol];
        }
        newRow['variable'] = valCol;
        newRow['value'] = row[valCol] !== undefined ? row[valCol] : null;
        unpivotedRows.push(newRow);
      }
    }

    const unpivotColumnNames = [...idColumns, 'variable', 'value'];
    const columns = unpivotColumnNames.map((name, idx) => ({
      name,
      dataType: name === 'variable' ? 'string' : this.inferColumnType(unpivotedRows.slice(0, 100), name),
      position: idx,
      nullable: name === 'value',
    }));

    const newDataset = await this.prisma.dataset.create({
      data: {
        tenantId: dataset.tenantId,
        name: `unpivot_${dataset.name}_${Date.now()}`,
        sourceType: 'manual',
        format: 'UNPIVOT',
        sizeBytes: BigInt(JSON.stringify(unpivotedRows).length),
        rowCount: BigInt(unpivotedRows.length),
        columnCount: unpivotColumnNames.length,
        schemaJson: JSON.parse(JSON.stringify(columns)),
        status: 'active',
        createdBy: dataset.createdBy,
      },
    });

    for (const col of columns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: newDataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK = 1000;
    for (let i = 0; i < unpivotedRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: unpivotedRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId: newDataset.id,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Unpivot operation completed', { newDatasetId: newDataset.id, rowCount: unpivotedRows.length });

    return {
      id: newDataset.id,
      name: newDataset.name,
      idColumns,
      valueColumns,
      rowCount: unpivotedRows.length,
      columnCount: unpivotColumnNames.length,
      columns,
    };
  }

  async aggregateData(
    datasetId: string,
    groupBy: string[],
    aggregations: Array<{ column: string; func: string }>
  ) {
    logger.info('Starting aggregation', { datasetId, groupBy, aggregations });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, unknown>);

    const groupMap = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const key = groupBy.map(g => String(row[g] ?? '__NULL__')).join('|||');
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(row);
    }

    const computeAgg = (values: unknown[], func: string): unknown => {
      const nums = values.map(v => parseFloat(String(v))).filter(n => !isNaN(n));
      switch (func) {
        case 'sum': return nums.reduce((a, b) => a + b, 0);
        case 'avg': return nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0;
        case 'count': return values.length;
        case 'count_distinct': return new Set(values.map(String)).size;
        case 'min': return nums.length > 0 ? Math.min(...nums) : null;
        case 'max': return nums.length > 0 ? Math.max(...nums) : null;
        case 'median': {
          if (nums.length === 0) return null;
          const sorted = [...nums].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
        }
        case 'stddev': {
          if (nums.length === 0) return null;
          const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
          const variance = nums.reduce((s, n) => s + Math.pow(n - mean, 2), 0) / nums.length;
          return Math.round(Math.sqrt(variance) * 100) / 100;
        }
        case 'first': return values.length > 0 ? values[0] : null;
        case 'last': return values.length > 0 ? values[values.length - 1] : null;
        case 'concat': return values.join(', ');
        default: return nums.reduce((a, b) => a + b, 0);
      }
    };

    const aggregatedRows: Record<string, unknown>[] = [];
    for (const [key, groupRows] of groupMap.entries()) {
      const keyParts = key.split('|||');
      const aggRow: Record<string, unknown> = {};
      groupBy.forEach((g, idx) => {
        aggRow[g] = keyParts[idx] === '__NULL__' ? null : keyParts[idx];
      });
      for (const agg of aggregations) {
        const values = groupRows.map(r => r[agg.column]);
        const colName = `${agg.column}_${agg.func}`;
        aggRow[colName] = computeAgg(values, agg.func);
      }
      aggregatedRows.push(aggRow);
    }

    const aggColumnNames = [
      ...groupBy,
      ...aggregations.map(a => `${a.column}_${a.func}`),
    ];

    const columns = aggColumnNames.map((name, idx) => ({
      name,
      dataType: groupBy.includes(name) ? 'string' : 'float',
      position: idx,
      nullable: false,
    }));

    const newDataset = await this.prisma.dataset.create({
      data: {
        tenantId: dataset.tenantId,
        name: `agg_${dataset.name}_${Date.now()}`,
        sourceType: 'manual',
        format: 'AGGREGATED',
        sizeBytes: BigInt(JSON.stringify(aggregatedRows).length),
        rowCount: BigInt(aggregatedRows.length),
        columnCount: aggColumnNames.length,
        schemaJson: JSON.parse(JSON.stringify(columns)),
        status: 'active',
        createdBy: dataset.createdBy,
      },
    });

    for (const col of columns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: newDataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK = 1000;
    for (let i = 0; i < aggregatedRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: aggregatedRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId: newDataset.id,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Aggregation completed', { newDatasetId: newDataset.id, rowCount: aggregatedRows.length });

    return {
      id: newDataset.id,
      name: newDataset.name,
      groupBy,
      aggregations,
      rowCount: aggregatedRows.length,
      columnCount: aggColumnNames.length,
      columns,
    };
  }

  async filterData(
    datasetId: string,
    conditions: Array<{ column: string; operator: string; value: unknown; logic?: 'AND' | 'OR' }>
  ) {
    logger.info('Starting data filter', { datasetId, conditionCount: conditions.length });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, unknown>);

    const evaluateCondition = (row: Record<string, unknown>, cond: { column: string; operator: string; value: unknown }): boolean => {
      const cellValue = row[cond.column];
      const compareValue = cond.value;

      switch (cond.operator) {
        case 'eq':
        case '=':
        case '==':
          return String(cellValue) === String(compareValue);
        case 'neq':
        case '!=':
        case '<>':
          return String(cellValue) !== String(compareValue);
        case 'gt':
        case '>':
          return parseFloat(String(cellValue)) > parseFloat(String(compareValue));
        case 'gte':
        case '>=':
          return parseFloat(String(cellValue)) >= parseFloat(String(compareValue));
        case 'lt':
        case '<':
          return parseFloat(String(cellValue)) < parseFloat(String(compareValue));
        case 'lte':
        case '<=':
          return parseFloat(String(cellValue)) <= parseFloat(String(compareValue));
        case 'contains':
          return String(cellValue ?? '').toLowerCase().includes(String(compareValue).toLowerCase());
        case 'not_contains':
          return !String(cellValue ?? '').toLowerCase().includes(String(compareValue).toLowerCase());
        case 'starts_with':
          return String(cellValue ?? '').toLowerCase().startsWith(String(compareValue).toLowerCase());
        case 'ends_with':
          return String(cellValue ?? '').toLowerCase().endsWith(String(compareValue).toLowerCase());
        case 'is_null':
          return cellValue === null || cellValue === undefined || cellValue === '';
        case 'is_not_null':
          return cellValue !== null && cellValue !== undefined && cellValue !== '';
        case 'in':
          return Array.isArray(compareValue) ? compareValue.map(String).includes(String(cellValue)) : false;
        case 'not_in':
          return Array.isArray(compareValue) ? !compareValue.map(String).includes(String(cellValue)) : true;
        case 'between': {
          const num = parseFloat(String(cellValue));
          const arr = Array.isArray(compareValue) ? compareValue : [];
          return arr.length === 2 && num >= parseFloat(String(arr[0])) && num <= parseFloat(String(arr[1]));
        }
        case 'regex':
          try { return new RegExp(String(compareValue)).test(String(cellValue ?? '')); } catch { return false; }
        default:
          return String(cellValue) === String(compareValue);
      }
    };

    const filteredRows = rows.filter(row => {
      if (conditions.length === 0) return true;
      let result = evaluateCondition(row, conditions[0]);

      for (let i = 1; i < conditions.length; i++) {
        const condResult = evaluateCondition(row, conditions[i]);
        const logic = conditions[i].logic || 'AND';
        if (logic === 'OR') {
          result = result || condResult;
        } else {
          result = result && condResult;
        }
      }
      return result;
    });

    const newDataset = await this.prisma.dataset.create({
      data: {
        tenantId: dataset.tenantId,
        name: `filtered_${dataset.name}_${Date.now()}`,
        sourceType: 'manual',
        format: dataset.format,
        sizeBytes: BigInt(JSON.stringify(filteredRows).length),
        rowCount: BigInt(filteredRows.length),
        columnCount: dataset.columnCount,
        schemaJson: dataset.schemaJson as Record<string, unknown>,
        status: 'active',
        createdBy: dataset.createdBy,
      },
    });

    for (const col of dataset.columns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: newDataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK = 1000;
    for (let i = 0; i < filteredRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: filteredRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId: newDataset.id,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Filter completed', {
      newDatasetId: newDataset.id,
      originalCount: rows.length,
      filteredCount: filteredRows.length,
    });

    return {
      id: newDataset.id,
      name: newDataset.name,
      conditions,
      originalRowCount: rows.length,
      filteredRowCount: filteredRows.length,
      removedRowCount: rows.length - filteredRows.length,
      columns: dataset.columns.map(c => ({ name: c.name, dataType: c.dataType })),
    };
  }

  async sortData(
    datasetId: string,
    columns: Array<{ column: string; direction: 'asc' | 'desc' }>
  ) {
    logger.info('Starting multi-column sort', { datasetId, columns });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, unknown>);

    const sortedRows = [...rows].sort((a, b) => {
      for (const sortCol of columns) {
        const aVal = a[sortCol.column];
        const bVal = b[sortCol.column];
        const aNum = parseFloat(String(aVal));
        const bNum = parseFloat(String(bVal));
        let comparison: number;

        if (!isNaN(aNum) && !isNaN(bNum)) {
          comparison = aNum - bNum;
        } else {
          const aStr = String(aVal ?? '').toLowerCase();
          const bStr = String(bVal ?? '').toLowerCase();
          comparison = aStr.localeCompare(bStr);
        }

        if (comparison !== 0) {
          return sortCol.direction === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });

    const newDataset = await this.prisma.dataset.create({
      data: {
        tenantId: dataset.tenantId,
        name: `sorted_${dataset.name}_${Date.now()}`,
        sourceType: 'manual',
        format: dataset.format,
        sizeBytes: BigInt(JSON.stringify(sortedRows).length),
        rowCount: BigInt(sortedRows.length),
        columnCount: dataset.columnCount,
        schemaJson: dataset.schemaJson as Record<string, unknown>,
        status: 'active',
        createdBy: dataset.createdBy,
      },
    });

    for (const col of dataset.columns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: newDataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK = 1000;
    for (let i = 0; i < sortedRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: sortedRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId: newDataset.id,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Sort completed', { newDatasetId: newDataset.id, rowCount: sortedRows.length });

    return {
      id: newDataset.id,
      name: newDataset.name,
      sortColumns: columns,
      rowCount: sortedRows.length,
      columnCount: dataset.columnCount,
    };
  }

  async addCalculatedColumn(
    datasetId: string,
    name: string,
    formula: string
  ) {
    logger.info('Adding calculated column', { datasetId, name, formula });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, unknown>);

    const existingColumns = dataset.columns.map(c => c.name);
    const compiledExpression = mathjs.compile(formula);

    const updatedRows: Record<string, unknown>[] = [];
    const errors: { rowIndex: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = { ...rows[i] };
      const scope: Record<string, unknown> = {};
      for (const col of existingColumns) {
        const val = row[col];
        const numVal = parseFloat(String(val));
        scope[col] = isNaN(numVal) ? val : numVal;
      }
      scope['ROW_INDEX'] = i;
      scope['ROW_NUM'] = i + 1;

      try {
        const result = compiledExpression.evaluate(scope);
        row[name] = typeof result === 'object' && result !== null ? Number(result) : result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ rowIndex: i, error: message });
        row[name] = null;
      }
      updatedRows.push(row);
    }

    const newPosition = dataset.columns.length;
    const newColType = this.inferColumnType(updatedRows.slice(0, 100), name);

    await this.prisma.datasetColumn.create({
      data: {
        datasetId: dataset.id,
        name,
        dataType: newColType,
        position: newPosition,
        nullable: updatedRows.some(r => r[name] === null || r[name] === undefined),
      },
    });

    await this.prisma.dataset.update({
      where: { id: datasetId },
      data: {
        columnCount: newPosition + 1,
        sizeBytes: BigInt(JSON.stringify(updatedRows).length),
      },
    });

    await this.prisma.dataRow.deleteMany({ where: { datasetId } });

    const CHUNK = 1000;
    for (let i = 0; i < updatedRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: updatedRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Calculated column added', {
      datasetId,
      columnName: name,
      formula,
      errorCount: errors.length,
    });

    return {
      datasetId,
      columnName: name,
      formula,
      dataType: newColType,
      rowCount: updatedRows.length,
      errorCount: errors.length,
      sampleErrors: errors.slice(0, 10),
      sampleValues: updatedRows.slice(0, 5).map(r => r[name]),
    };
  }

  async splitColumn(
    datasetId: string,
    column: string,
    delimiter: string
  ) {
    logger.info('Splitting column', { datasetId, column, delimiter });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, unknown>);

    let maxParts = 0;
    for (const row of rows) {
      const value = String(row[column] ?? '');
      const parts = value.split(delimiter);
      if (parts.length > maxParts) {
        maxParts = parts.length;
      }
    }

    const newColumnNames: string[] = [];
    for (let i = 0; i < maxParts; i++) {
      newColumnNames.push(`${column}_${i + 1}`);
    }

    const updatedRows: Record<string, unknown>[] = [];
    for (const row of rows) {
      const newRow = { ...row };
      const value = String(row[column] ?? '');
      const parts = value.split(delimiter);
      for (let i = 0; i < maxParts; i++) {
        newRow[`${column}_${i + 1}`] = parts[i] !== undefined ? parts[i].trim() : null;
      }
      updatedRows.push(newRow);
    }

    const existingPos = dataset.columns.length;
    for (let i = 0; i < newColumnNames.length; i++) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId,
          name: newColumnNames[i],
          dataType: 'string',
          position: existingPos + i,
          nullable: true,
        },
      });
    }

    await this.prisma.dataset.update({
      where: { id: datasetId },
      data: {
        columnCount: existingPos + newColumnNames.length,
        sizeBytes: BigInt(JSON.stringify(updatedRows).length),
      },
    });

    await this.prisma.dataRow.deleteMany({ where: { datasetId } });

    const CHUNK = 1000;
    for (let i = 0; i < updatedRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: updatedRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Column split completed', {
      datasetId,
      originalColumn: column,
      newColumns: newColumnNames,
      maxParts,
    });

    return {
      datasetId,
      originalColumn: column,
      delimiter,
      newColumns: newColumnNames,
      maxParts,
      rowCount: updatedRows.length,
    };
  }

  async transposeData(datasetId: string) {
    logger.info('Starting transpose operation', { datasetId });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, unknown>);

    const columnNames = dataset.columns.map(c => c.name);
    const transposedColumnNames = ['field', ...rows.map((_, idx) => `row_${idx + 1}`)];

    const transposedRows: Record<string, unknown>[] = [];
    for (const colName of columnNames) {
      const transposedRow: Record<string, unknown> = { field: colName };
      for (let i = 0; i < rows.length; i++) {
        transposedRow[`row_${i + 1}`] = rows[i][colName] ?? null;
      }
      transposedRows.push(transposedRow);
    }

    const columns = transposedColumnNames.map((name, idx) => ({
      name,
      dataType: name === 'field' ? 'string' : 'string',
      position: idx,
      nullable: name !== 'field',
    }));

    const newDataset = await this.prisma.dataset.create({
      data: {
        tenantId: dataset.tenantId,
        name: `transposed_${dataset.name}_${Date.now()}`,
        sourceType: 'manual',
        format: 'TRANSPOSED',
        sizeBytes: BigInt(JSON.stringify(transposedRows).length),
        rowCount: BigInt(transposedRows.length),
        columnCount: transposedColumnNames.length,
        schemaJson: JSON.parse(JSON.stringify(columns)),
        status: 'active',
        createdBy: dataset.createdBy,
      },
    });

    for (const col of columns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: newDataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK = 1000;
    for (let i = 0; i < transposedRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: transposedRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId: newDataset.id,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Transpose completed', {
      newDatasetId: newDataset.id,
      originalRows: rows.length,
      originalCols: columnNames.length,
      transposedRows: transposedRows.length,
      transposedCols: transposedColumnNames.length,
    });

    return {
      id: newDataset.id,
      name: newDataset.name,
      originalRowCount: rows.length,
      originalColumnCount: columnNames.length,
      transposedRowCount: transposedRows.length,
      transposedColumnCount: transposedColumnNames.length,
      columns,
    };
  }

  private inferColumnType(data: Record<string, unknown>[], columnName: string): string {
    const sample = data.slice(0, 100).map(r => r[columnName]).filter(v => v !== null && v !== undefined && v !== '');
    if (sample.length === 0) return 'string';

    const allNumbers = sample.every(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== ''));
    if (allNumbers) {
      const hasDecimals = sample.some(v => String(v).includes('.'));
      return hasDecimals ? 'float' : 'integer';
    }

    const allBooleans = sample.every(v => typeof v === 'boolean' || ['true', 'false', '0', '1'].includes(String(v).toLowerCase()));
    if (allBooleans) return 'boolean';

    const datePatterns = [/^\d{4}-\d{2}-\d{2}/, /^\d{2}\/\d{2}\/\d{4}/, /^\d{2}-\d{2}-\d{4}/];
    const allDates = sample.every(v => v instanceof Date || datePatterns.some(p => p.test(String(v))));
    if (allDates) return 'date';

    return 'string';
  }
}
