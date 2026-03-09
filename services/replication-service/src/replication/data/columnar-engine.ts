import { logger } from '../../utils/logger.js';

interface ColumnarStore {
  columnNames: string[];
  columnTypes: string[];
  columns: unknown[][];
  rowCount: number;
  compressionMeta: {
    originalSize: number;
    compressedSize: number;
    method: string;
  };
}

interface ColumnPredicate {
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IN' | 'BETWEEN';
  value: unknown;
  valueTo?: unknown; // for BETWEEN
}

interface VectorizedResult {
  columns: string[];
  rows: unknown[][];
  matchCount: number;
  scannedCount: number;
}

export class ColumnarEngine {
  compressColumnar(data: unknown[]): ColumnarStore {
    if (!data || data.length === 0) {
      return {
        columnNames: [],
        columnTypes: [],
        columns: [],
        rowCount: 0,
        compressionMeta: { originalSize: 0, compressedSize: 0, method: 'none' },
      };
    }

    const firstRow = data[0] as Record<string, unknown>;
    const columnNames = Object.keys(firstRow);
    const columnCount = columnNames.length;

    // Transpose row-oriented to column-oriented
    const columns: unknown[][] = Array.from({ length: columnCount }, () => []);
    const columnTypes: string[] = new Array(columnCount).fill('unknown');

    for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx] as Record<string, unknown>;
      for (let colIdx = 0; colIdx < columnCount; colIdx++) {
        const value = row[columnNames[colIdx]];
        columns[colIdx].push(value);
        if (rowIdx === 0) {
          columnTypes[colIdx] = value === null ? 'null' : typeof value;
        }
      }
    }

    // Apply run-length encoding for columns with low cardinality
    const compressedColumns: unknown[][] = [];
    let compressedSize = 0;

    for (let colIdx = 0; colIdx < columnCount; colIdx++) {
      const col = columns[colIdx];
      const uniqueValues = new Set(col.map(v => JSON.stringify(v)));
      const cardinality = uniqueValues.size;

      if (cardinality <= col.length * 0.3) {
        // RLE compression for low cardinality
        const rleEncoded = this.runLengthEncode(col);
        compressedColumns.push(rleEncoded);
        compressedSize += rleEncoded.length * 2; // value + count pairs
      } else {
        compressedColumns.push(col);
        compressedSize += col.length;
      }
    }

    const originalSize = data.length * columnCount;
    logger.debug('ColumnarEngine compressed', {
      rows: data.length,
      columns: columnCount,
      ratio: (compressedSize / originalSize).toFixed(2),
    });

    return {
      columnNames,
      columnTypes,
      columns: compressedColumns,
      rowCount: data.length,
      compressionMeta: {
        originalSize,
        compressedSize,
        method: 'rle-hybrid',
      },
    };
  }

  decompressColumnar(compressed: ColumnarStore): unknown[] {
    if (compressed.rowCount === 0) return [];

    const { columnNames, columns, rowCount } = compressed;
    const decompressedColumns: unknown[][] = [];

    for (const col of columns) {
      if (col.length > 0 && Array.isArray(col[0]) && (col[0] as unknown[]).length === 2) {
        // RLE encoded
        decompressedColumns.push(this.runLengthDecode(col as [unknown, number][]));
      } else {
        decompressedColumns.push(col);
      }
    }

    // Transpose column-oriented back to row-oriented
    const result: unknown[] = [];
    for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
      const row: Record<string, unknown> = {};
      for (let colIdx = 0; colIdx < columnNames.length; colIdx++) {
        row[columnNames[colIdx]] = decompressedColumns[colIdx][rowIdx];
      }
      result.push(row);
    }

    logger.debug('ColumnarEngine decompressed', { rows: result.length, columns: columnNames.length });
    return result;
  }

  vectorizedQuery(data: ColumnarStore, predicates: ColumnPredicate[]): VectorizedResult {
    const { columnNames, columns, rowCount } = data;

    // Decompress columns that are RLE-encoded
    const rawColumns: unknown[][] = columns.map(col => {
      if (col.length > 0 && Array.isArray(col[0]) && (col[0] as unknown[]).length === 2) {
        return this.runLengthDecode(col as [unknown, number][]);
      }
      return col;
    });

    // Build selection vector (bitmap of matching rows)
    const selectionVector = new Uint8Array(rowCount).fill(1);

    for (const predicate of predicates) {
      const colIdx = columnNames.indexOf(predicate.column);
      if (colIdx === -1) {
        logger.warn('ColumnarEngine: column not found for predicate', { column: predicate.column });
        continue;
      }

      const col = rawColumns[colIdx];
      for (let i = 0; i < rowCount; i++) {
        if (selectionVector[i] === 0) continue;
        if (!this.evaluatePredicate(col[i], predicate)) {
          selectionVector[i] = 0;
        }
      }
    }

    // Gather matching rows
    const matchingRows: unknown[][] = [];
    for (let i = 0; i < rowCount; i++) {
      if (selectionVector[i] === 1) {
        const row: unknown[] = [];
        for (let colIdx = 0; colIdx < columnNames.length; colIdx++) {
          row.push(rawColumns[colIdx][i]);
        }
        matchingRows.push(row);
      }
    }

    logger.debug('ColumnarEngine vectorizedQuery', { matchCount: matchingRows.length, scannedCount: rowCount });
    return {
      columns: columnNames,
      rows: matchingRows,
      matchCount: matchingRows.length,
      scannedCount: rowCount,
    };
  }

  lateMaterialization(columnarStore: ColumnarStore, selectedCols: string[]): unknown[] {
    const { columnNames, columns, rowCount } = columnarStore;

    // Only materialize the requested columns — skip irrelevant ones entirely
    const selectedIndices: number[] = [];
    const resolvedNames: string[] = [];
    for (const colName of selectedCols) {
      const idx = columnNames.indexOf(colName);
      if (idx !== -1) {
        selectedIndices.push(idx);
        resolvedNames.push(colName);
      } else {
        logger.warn('ColumnarEngine lateMaterialization: column not found', { column: colName });
      }
    }

    // Decompress only selected columns
    const materializedColumns: unknown[][] = selectedIndices.map(idx => {
      const col = columns[idx];
      if (col.length > 0 && Array.isArray(col[0]) && (col[0] as unknown[]).length === 2) {
        return this.runLengthDecode(col as [unknown, number][]);
      }
      return col;
    });

    // Build row-oriented output from selected columns only
    const result: unknown[] = [];
    for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
      const row: Record<string, unknown> = {};
      for (let i = 0; i < resolvedNames.length; i++) {
        row[resolvedNames[i]] = materializedColumns[i][rowIdx];
      }
      result.push(row);
    }

    logger.debug('ColumnarEngine lateMaterialization', {
      requestedCols: selectedCols.length,
      materializedCols: resolvedNames.length,
      rows: rowCount,
    });
    return result;
  }

  private evaluatePredicate(value: unknown, predicate: ColumnPredicate): boolean {
    const numVal = typeof value === 'number' ? value : parseFloat(value as string);
    const numPred = typeof predicate.value === 'number' ? predicate.value : parseFloat(predicate.value as string);

    switch (predicate.operator) {
      case '=': return value === predicate.value;
      case '!=': return value !== predicate.value;
      case '>': return numVal > numPred;
      case '<': return numVal < numPred;
      case '>=': return numVal >= numPred;
      case '<=': return numVal <= numPred;
      case 'IN': return Array.isArray(predicate.value) && (predicate.value as unknown[]).includes(value);
      case 'BETWEEN': return numVal >= numPred && numVal <= (typeof predicate.valueTo === 'number' ? predicate.valueTo : parseFloat(predicate.valueTo as string));
      default: return true;
    }
  }

  private runLengthEncode(values: unknown[]): [unknown, number][] {
    if (values.length === 0) return [];
    const result: [unknown, number][] = [];
    let current = values[0];
    let count = 1;

    for (let i = 1; i < values.length; i++) {
      if (values[i] === current) {
        count++;
      } else {
        result.push([current, count]);
        current = values[i];
        count = 1;
      }
    }
    result.push([current, count]);
    return result;
  }

  private runLengthDecode(encoded: [unknown, number][]): unknown[] {
    const result: unknown[] = [];
    for (const [value, count] of encoded) {
      for (let i = 0; i < count; i++) {
        result.push(value);
      }
    }
    return result;
  }
}
