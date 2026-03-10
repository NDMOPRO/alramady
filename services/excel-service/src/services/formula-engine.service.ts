import { Parser as FormulaParser } from 'hot-formula-parser';
import * as mathjs from 'mathjs';
import Decimal from 'decimal.js';
import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';

interface FormulaCoord {
  column: { index: number };
  row: { index: number };
}

interface FormulaParserInternal {
  on(event: string, callback: (...args: any[]) => void): void;
}

type CellValue = string | number | boolean | null | undefined;

interface DependencyNode {
  cell: string;
  dependsOn: string[];
  dependedBy: string[];
  formula: string | null;
}

interface CircularChain {
  cells: string[];
  description: string;
}

export class FormulaEngineService {
  private parser: FormulaParser;

  constructor() {
    this.parser = new FormulaParser();

    this.parser.on('callVariable', (name: string, done: (val: unknown) => void) => {
      done(0);
    });

    (this.parser as unknown as FormulaParserInternal).on('callFunction', (name: string, params: any[], done: (val: unknown) => void) => {
      const upperName = name.toUpperCase();
      switch (upperName) {
        case 'SUM':
          done(this.computeSUM(params as CellValue[]));
          break;
        case 'AVERAGE':
          done(this.computeAVERAGE(params as CellValue[]));
          break;
        case 'IF':
          done(this.computeIF(params[0] as CellValue, params[1] as CellValue, params[2] as CellValue));
          break;
        case 'COUNTIF':
          done(this.computeCOUNTIF(Array.isArray(params[0]) ? params[0] : [params[0]], String(params[1])));
          break;
        case 'SUMIF':
          done(this.computeSUMIF(
            Array.isArray(params[0]) ? params[0] : [params[0]],
            String(params[1]),
            Array.isArray(params[2]) ? params[2] : [params[2]]
          ));
          break;
        case 'VLOOKUP':
          done(this.computeVLOOKUP(params[0], params[1] as any, Number(params[2]), params[3] !== false));
          break;
        case 'INDEX':
          done(this.computeINDEX(params[0] as any, Number(params[1]), Number(params[2]) || 1));
          break;
        case 'MATCH':
          done(this.computeMATCH(params[0], params[1] as any, params[2] !== undefined ? Number(params[2]) : 1));
          break;
        default:
          done(undefined);
      }
    });
  }

  /**
   * Parse an Excel formula string using hot-formula-parser's Parser.
   * Returns the parsed result including the computed value, any error, and metadata.
   */
  parseFormula(formula: string): {
    result: unknown;
    error: string | null;
    formulaText: string;
    tokens: Array<{ type: string; value: string }>;
  } {
    logger.info('Parsing formula', { formula });

    const cleanFormula = formula.startsWith('=') ? formula.substring(1) : formula;

    const parsed = this.parser.parse(cleanFormula);

    const tokens: Array<{ type: string; value: string }> = [];
    const tokenRegex = /([A-Z]+[0-9]+(?::[A-Z]+[0-9]+)?)|([0-9]+\.?[0-9]*)|([+\-*/^%<>=!&|,;()])|("(?:[^"\\]|\\.)*")|([A-Z_][A-Z0-9_]*)\s*\(/gi;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(cleanFormula)) !== null) {
      if (match[1]) {
        tokens.push({ type: 'cell_reference', value: match[1] });
      } else if (match[2]) {
        tokens.push({ type: 'number', value: match[2] });
      } else if (match[3]) {
        tokens.push({ type: 'operator', value: match[3] });
      } else if (match[4]) {
        tokens.push({ type: 'string', value: match[4] });
      } else if (match[5]) {
        tokens.push({ type: 'function', value: match[5] });
      }
    }

    const errorStr = parsed.error ? String(parsed.error) : null;

    logger.info('Formula parsed', { formula: cleanFormula, result: parsed.result, error: errorStr, tokenCount: tokens.length });

    return {
      result: parsed.result,
      error: errorStr,
      formulaText: cleanFormula,
      tokens,
    };
  }

  /**
   * Evaluate a formula with cell references resolved from the context map.
   * Uses hot-formula-parser with custom cell value resolution.
   */
  evaluateFormula(
    formula: string,
    cellContext: Map<string, CellValue>
  ): { result: unknown; error: string | null; resolvedCells: string[] } {
    logger.info('Evaluating formula', { formula, contextSize: cellContext.size });

    const evalParser = new FormulaParser();
    const resolvedCells: string[] = [];

    evalParser.on('callCellValue', (cellCoord: FormulaCoord, done: (val: unknown) => void) => {
      const colLetter = String.fromCharCode(65 + cellCoord.column.index);
      const cellRef = `${colLetter}${cellCoord.row.index + 1}`;
      resolvedCells.push(cellRef);

      if (cellContext.has(cellRef)) {
        const val = cellContext.get(cellRef);
        done(val !== null && val !== undefined ? val : 0);
      } else {
        done(0);
      }
    });

    evalParser.on('callRangeValue', (startCoord: FormulaCoord, endCoord: FormulaCoord, done: (vals: CellValue[][]) => void) => {
      const values: CellValue[][] = [];
      for (let row = startCoord.row.index; row <= endCoord.row.index; row++) {
        const rowVals: CellValue[] = [];
        for (let col = startCoord.column.index; col <= endCoord.column.index; col++) {
          const colLetter = String.fromCharCode(65 + col);
          const cellRef = `${colLetter}${row + 1}`;
          resolvedCells.push(cellRef);
          const val = cellContext.has(cellRef) ? cellContext.get(cellRef) : 0;
          rowVals.push(val !== null && val !== undefined ? val : 0);
        }
        values.push(rowVals);
      }
      done(values);
    });

    (evalParser as unknown as FormulaParserInternal).on('callFunction', (name: string, params: any[], done: (val: unknown) => void) => {
      const upperName = name.toUpperCase();
      switch (upperName) {
        case 'SUM':
          done(this.computeSUM(this.flattenParams(params as CellValue[])));
          break;
        case 'AVERAGE':
          done(this.computeAVERAGE(this.flattenParams(params as CellValue[])));
          break;
        case 'IF':
          done(this.computeIF(params[0] as CellValue, params[1] as CellValue, params[2] as CellValue));
          break;
        case 'COUNTIF':
          done(this.computeCOUNTIF(this.flattenParams([params[0]] as CellValue[]), String(params[1])));
          break;
        case 'SUMIF':
          done(this.computeSUMIF(
            this.flattenParams([params[0]] as CellValue[]),
            String(params[1]),
            this.flattenParams([params[2]] as CellValue[])
          ));
          break;
        case 'VLOOKUP':
          done(this.computeVLOOKUP(params[0], params[1] as any, Number(params[2]), params[3] !== false));
          break;
        case 'INDEX':
          done(this.computeINDEX(params[0] as any, Number(params[1]), Number(params[2]) || 1));
          break;
        case 'MATCH':
          done(this.computeMATCH(params[0], params[1] as any, params[2] !== undefined ? Number(params[2]) : 1));
          break;
        default:
          done(undefined);
      }
    });

    const cleanFormula = formula.startsWith('=') ? formula.substring(1) : formula;
    const parsed = evalParser.parse(cleanFormula);

    const errorStr = parsed.error ? String(parsed.error) : null;

    logger.info('Formula evaluated', {
      formula: cleanFormula,
      result: parsed.result,
      error: errorStr,
      resolvedCellCount: resolvedCells.length,
    });

    return {
      result: parsed.result,
      error: errorStr,
      resolvedCells: [...new Set(resolvedCells)],
    };
  }

  /**
   * Build a directed acyclic graph of cell dependencies by parsing all formulas in the sheet.
   */
  async buildDependencyGraph(
    workbookId: string,
    sheet: number
  ): Promise<Map<string, DependencyNode>> {
    logger.info('Building dependency graph', { workbookId, sheet });

    const cells = await prisma.excelCell.findMany({
      where: { workbookId, sheetIndex: sheet },
    });

    const graph = new Map<string, DependencyNode>();
    const cellRefRegex = /\$?([A-Z]+)\$?(\d+)/g;
    const rangeRefRegex = /\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/g;

    for (const cell of cells) {
      const cellRef = `${this.colNumberToLetter(cell.col)}${cell.row}`;

      if (!graph.has(cellRef)) {
        graph.set(cellRef, {
          cell: cellRef,
          dependsOn: [],
          dependedBy: [],
          formula: cell.formula || null,
        });
      }

      if (cell.formula) {
        const formulaStr = cell.formula;
        const dependencies = new Set<string>();

        let rangeMatch: RegExpExecArray | null;
        const rangeRegexCopy = new RegExp(rangeRefRegex.source, rangeRefRegex.flags);
        while ((rangeMatch = rangeRegexCopy.exec(formulaStr)) !== null) {
          const startCol = this.letterToColNumber(rangeMatch[1]);
          const startRow = parseInt(rangeMatch[2], 10);
          const endCol = this.letterToColNumber(rangeMatch[3]);
          const endRow = parseInt(rangeMatch[4], 10);

          for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
              dependencies.add(`${this.colNumberToLetter(c)}${r}`);
            }
          }
        }

        const cleanedFormula = formulaStr.replace(rangeRefRegex, '');
        let cellMatch: RegExpExecArray | null;
        const cellRegexCopy = new RegExp(cellRefRegex.source, cellRefRegex.flags);
        while ((cellMatch = cellRegexCopy.exec(cleanedFormula)) !== null) {
          dependencies.add(`${cellMatch[1]}${cellMatch[2]}`);
        }

        const node = graph.get(cellRef)!;
        node.dependsOn = Array.from(dependencies);

        for (const dep of dependencies) {
          if (!graph.has(dep)) {
            graph.set(dep, { cell: dep, dependsOn: [], dependedBy: [], formula: null });
          }
          graph.get(dep)!.dependedBy.push(cellRef);
        }
      }
    }

    logger.info('Dependency graph built', { workbookId, sheet, nodeCount: graph.size });
    return graph;
  }

  /**
   * Topological sort of the dependency graph to recalculate all affected cells
   * in correct order after a cell change.
   */
  async recalculate(
    workbookId: string,
    sheet: number,
    changedCell: { row: number; col: number }
  ): Promise<Array<{ cell: string; oldValue: CellValue; newValue: unknown }>> {
    logger.info('Recalculating', { workbookId, sheet, changedCell });

    const graph = await this.buildDependencyGraph(workbookId, sheet);
    const changedRef = `${this.colNumberToLetter(changedCell.col)}${changedCell.row}`;

    const affectedCells = new Set<string>();
    const queue: string[] = [changedRef];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = graph.get(current);
      if (node) {
        for (const dep of node.dependedBy) {
          if (!affectedCells.has(dep)) {
            affectedCells.add(dep);
            queue.push(dep);
          }
        }
      }
    }

    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const topSort = (cellRef: string): void => {
      if (visited.has(cellRef)) return;
      if (visiting.has(cellRef)) {
        logger.warn('Circular reference detected during recalc', { cellRef });
        return;
      }
      visiting.add(cellRef);
      const node = graph.get(cellRef);
      if (node) {
        for (const dep of node.dependsOn) {
          if (affectedCells.has(dep)) {
            topSort(dep);
          }
        }
      }
      visiting.delete(cellRef);
      visited.add(cellRef);
      sorted.push(cellRef);
    };

    for (const cell of affectedCells) {
      topSort(cell);
    }

    const allCells = await prisma.excelCell.findMany({
      where: { workbookId, sheetIndex: sheet },
    });

    const cellValues = new Map<string, CellValue>();
    for (const cell of allCells) {
      const ref = `${this.colNumberToLetter(cell.col)}${cell.row}`;
      cellValues.set(ref, cell.value !== null ? (isNaN(Number(cell.value)) ? cell.value : Number(cell.value)) : null);
    }

    const changes: Array<{ cell: string; oldValue: CellValue; newValue: unknown }> = [];

    for (const cellRef of sorted) {
      const node = graph.get(cellRef);
      if (!node || !node.formula) continue;

      const oldValue = cellValues.get(cellRef);
      const evalResult = this.evaluateFormula(node.formula, cellValues);

      if (evalResult.error === null && evalResult.result !== undefined) {
        cellValues.set(cellRef, evalResult.result as CellValue);

        const coords = this.parseCellRef(cellRef);
        if (coords) {
          await prisma.excelCell.updateMany({
            where: { workbookId, sheetIndex: sheet, row: coords.row, col: coords.col },
            data: { value: String(evalResult.result) },
          });
        }

        changes.push({ cell: cellRef, oldValue, newValue: evalResult.result });
      }
    }

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Recalculation complete', { workbookId, sheet, changesCount: changes.length });
    return changes;
  }

  /**
   * DFS-based cycle detection in the dependency graph.
   * Returns any circular reference chains found.
   */
  async detectCircularReference(
    workbookId: string,
    sheet: number
  ): Promise<{ hasCircular: boolean; chains: CircularChain[] }> {
    logger.info('Detecting circular references', { workbookId, sheet });

    const graph = await this.buildDependencyGraph(workbookId, sheet);
    const chains: CircularChain[] = [];
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const parent = new Map<string, string | null>();

    for (const key of graph.keys()) {
      color.set(key, WHITE);
      parent.set(key, null);
    }

    const dfs = (node: string): void => {
      color.set(node, GRAY);
      const deps = graph.get(node)?.dependsOn || [];

      for (const neighbor of deps) {
        if (!graph.has(neighbor)) continue;

        if (color.get(neighbor) === GRAY) {
          const chain: string[] = [neighbor];
          let current = node;
          while (current !== neighbor) {
            chain.push(current);
            current = parent.get(current) || neighbor;
          }
          chain.push(neighbor);
          chain.reverse();

          chains.push({
            cells: chain,
            description: `Circular reference chain: ${chain.join(' -> ')}`,
          });
        } else if (color.get(neighbor) === WHITE) {
          parent.set(neighbor, node);
          dfs(neighbor);
        }
      }

      color.set(node, BLACK);
    };

    for (const key of graph.keys()) {
      if (color.get(key) === WHITE) {
        dfs(key);
      }
    }

    const hasCircular = chains.length > 0;
    logger.info('Circular reference detection complete', { workbookId, sheet, hasCircular, chainCount: chains.length });
    return { hasCircular, chains };
  }

  /**
   * Compute SUM using decimal.js for high precision arithmetic.
   */
  computeSUM(values: unknown[]): number {
    logger.debug('Computing SUM', { valueCount: values.length });
    const flatValues = this.flattenParams(values);
    let sum = new Decimal(0);
    let validCount = 0;

    for (const val of flatValues) {
      if (val === null || val === undefined || val === '') {
        continue;
      }
      const numVal = Number(val);
      if (!isNaN(numVal)) {
        sum = sum.plus(new Decimal(numVal));
        validCount++;
      }
    }

    const result = sum.toNumber();
    logger.debug('SUM computed', { result, validCount, totalValues: flatValues.length });
    return result;
  }

  /**
   * Compute AVERAGE using decimal.js for precision.
   */
  computeAVERAGE(values: unknown[]): number {
    logger.debug('Computing AVERAGE', { valueCount: values.length });
    const flatValues = this.flattenParams(values);
    let sum = new Decimal(0);
    let count = 0;

    for (const val of flatValues) {
      if (val === null || val === undefined || val === '') {
        continue;
      }
      const numVal = Number(val);
      if (!isNaN(numVal)) {
        sum = sum.plus(new Decimal(numVal));
        count++;
      }
    }

    if (count === 0) {
      logger.warn('AVERAGE division by zero: no numeric values');
      throw new Error('#DIV/0! - No numeric values for AVERAGE');
    }

    const result = sum.dividedBy(new Decimal(count)).toNumber();
    logger.debug('AVERAGE computed', { result, count });
    return result;
  }

  /**
   * Compute VLOOKUP: search for lookupValue in the first column of tableRange,
   * and return the value from colIndex column in the matching row.
   */
  computeVLOOKUP(
    lookupValue: unknown,
    tableRange: unknown[][],
    colIndex: number,
    exactMatch: boolean
  ): unknown {
    logger.debug('Computing VLOOKUP', { lookupValue, colIndex, exactMatch, rows: tableRange?.length });

    if (!Array.isArray(tableRange) || tableRange.length === 0) {
      throw new Error('#VALUE! - Table range is empty or invalid');
    }
    if (colIndex < 1 || colIndex > (tableRange[0]?.length || 0)) {
      throw new Error('#REF! - Column index out of range');
    }

    if (exactMatch) {
      for (let i = 0; i < tableRange.length; i++) {
        const row = tableRange[i];
        if (!Array.isArray(row)) continue;
        const firstCol = row[0];

        if (firstCol === lookupValue) {
          const result = row[colIndex - 1];
          logger.debug('VLOOKUP exact match found', { row: i, result });
          return result !== undefined ? result : null;
        }
        if (typeof firstCol === 'string' && typeof lookupValue === 'string' &&
            firstCol.toLowerCase() === lookupValue.toLowerCase()) {
          const result = row[colIndex - 1];
          logger.debug('VLOOKUP case-insensitive match found', { row: i, result });
          return result !== undefined ? result : null;
        }
      }
      throw new Error('#N/A - Exact match not found');
    } else {
      let bestIdx = -1;
      for (let i = 0; i < tableRange.length; i++) {
        const row = tableRange[i];
        if (!Array.isArray(row)) continue;
        const firstCol = row[0] as any;
        if (firstCol <= (lookupValue as any)) {
          bestIdx = i;
        } else {
          break;
        }
      }
      if (bestIdx === -1) {
        throw new Error('#N/A - No match found in approximate search');
      }
      const result = tableRange[bestIdx][colIndex - 1];
      logger.debug('VLOOKUP approximate match found', { row: bestIdx, result });
      return result !== undefined ? result : null;
    }
  }

  /**
   * Compute IF: evaluate condition and return trueValue or falseValue.
   */
  computeIF(condition: CellValue, trueValue: unknown, falseValue: unknown): unknown {
    logger.debug('Computing IF', { condition, trueValue, falseValue });

    let boolCondition: boolean;
    if (typeof condition === 'boolean') {
      boolCondition = condition;
    } else if (typeof condition === 'number') {
      boolCondition = condition !== 0;
    } else if (typeof condition === 'string') {
      const lower = condition.toLowerCase();
      boolCondition = lower !== 'false' && lower !== '0' && lower !== '';
    } else {
      boolCondition = Boolean(condition);
    }

    const result = boolCondition ? trueValue : falseValue;
    logger.debug('IF evaluated', { boolCondition, result });
    return result !== undefined ? result : (boolCondition ? 0 : false);
  }

  /**
   * Compute COUNTIF: count cells in range that match the criteria string.
   * Criteria can be a number, string, or comparison like ">5", "<=10", "<>abc".
   */
  computeCOUNTIF(range: unknown[], criteria: string): number {
    logger.debug('Computing COUNTIF', { rangeLength: range.length, criteria });
    const flatRange = this.flattenParams(range);

    const operatorMatch = criteria.match(/^(>=|<=|<>|!=|>|<|=)(.*)$/);
    let operator = '=';
    let compareValue: string = criteria;

    if (operatorMatch) {
      operator = operatorMatch[1];
      compareValue = operatorMatch[2];
    }

    const numCompare = Number(compareValue);
    const isNumericCompare = !isNaN(numCompare) && compareValue !== '';

    let count = 0;
    for (const val of flatRange) {
      if (val === null || val === undefined) continue;
      const numVal = Number(val);
      const isNumVal = !isNaN(numVal);

      let matches = false;
      switch (operator) {
        case '=':
          if (isNumericCompare && isNumVal) {
            matches = numVal === numCompare;
          } else {
            matches = String(val).toLowerCase() === String(compareValue).toLowerCase();
          }
          break;
        case '>':
          matches = isNumVal && isNumericCompare && numVal > numCompare;
          break;
        case '<':
          matches = isNumVal && isNumericCompare && numVal < numCompare;
          break;
        case '>=':
          matches = isNumVal && isNumericCompare && numVal >= numCompare;
          break;
        case '<=':
          matches = isNumVal && isNumericCompare && numVal <= numCompare;
          break;
        case '<>':
        case '!=':
          if (isNumericCompare && isNumVal) {
            matches = numVal !== numCompare;
          } else {
            matches = String(val).toLowerCase() !== String(compareValue).toLowerCase();
          }
          break;
      }
      if (matches) count++;
    }

    logger.debug('COUNTIF computed', { count, rangeLength: flatRange.length, criteria });
    return count;
  }

  /**
   * Compute SUMIF: sum values in sumRange where corresponding range values match criteria.
   */
  computeSUMIF(range: unknown[], criteria: string, sumRange: unknown[]): number {
    logger.debug('Computing SUMIF', { rangeLength: range.length, criteria, sumRangeLength: sumRange.length });
    const flatRange = this.flattenParams(range);
    const flatSumRange = this.flattenParams(sumRange);

    const operatorMatch = criteria.match(/^(>=|<=|<>|!=|>|<|=)(.*)$/);
    let operator = '=';
    let compareValue: string = criteria;

    if (operatorMatch) {
      operator = operatorMatch[1];
      compareValue = operatorMatch[2];
    }

    const numCompare = Number(compareValue);
    const isNumericCompare = !isNaN(numCompare) && compareValue !== '';

    let sum = new Decimal(0);
    const maxLen = Math.min(flatRange.length, flatSumRange.length);

    for (let i = 0; i < maxLen; i++) {
      const val = flatRange[i];
      if (val === null || val === undefined) continue;
      const numVal = Number(val);
      const isNumVal = !isNaN(numVal);

      let matches = false;
      switch (operator) {
        case '=':
          if (isNumericCompare && isNumVal) {
            matches = numVal === numCompare;
          } else {
            matches = String(val).toLowerCase() === String(compareValue).toLowerCase();
          }
          break;
        case '>': matches = isNumVal && isNumericCompare && numVal > numCompare; break;
        case '<': matches = isNumVal && isNumericCompare && numVal < numCompare; break;
        case '>=': matches = isNumVal && isNumericCompare && numVal >= numCompare; break;
        case '<=': matches = isNumVal && isNumericCompare && numVal <= numCompare; break;
        case '<>':
        case '!=':
          if (isNumericCompare && isNumVal) {
            matches = numVal !== numCompare;
          } else {
            matches = String(val).toLowerCase() !== String(compareValue).toLowerCase();
          }
          break;
      }

      if (matches) {
        const sumVal = Number(flatSumRange[i]);
        if (!isNaN(sumVal)) {
          sum = sum.plus(new Decimal(sumVal));
        }
      }
    }

    const result = sum.toNumber();
    logger.debug('SUMIF computed', { result, criteria });
    return result;
  }

  /**
   * Compute INDEX: return the value at the specified row and column in the array.
   */
  computeINDEX(array: unknown[][], rowNum: number, colNum: number): unknown {
    logger.debug('Computing INDEX', { rowNum, colNum, arrayRows: array?.length });

    if (!Array.isArray(array) || array.length === 0) {
      throw new Error('#VALUE! - Array is empty or invalid');
    }

    const flatArray: unknown[][] = [];
    for (const item of array) {
      if (Array.isArray(item)) {
        flatArray.push(item);
      } else {
        flatArray.push([item]);
      }
    }

    if (rowNum < 1 || rowNum > flatArray.length) {
      throw new Error(`#REF! - Row number ${rowNum} is out of range (1-${flatArray.length})`);
    }

    const targetRow = flatArray[rowNum - 1];
    if (colNum < 1 || colNum > targetRow.length) {
      throw new Error(`#REF! - Column number ${colNum} is out of range (1-${targetRow.length})`);
    }

    const result = targetRow[colNum - 1];
    logger.debug('INDEX computed', { result, rowNum, colNum });
    return result !== undefined ? result : null;
  }

  /**
   * Compute MATCH: find the position of lookupValue in the lookupArray.
   * matchType: 1 = largest value <= lookupValue (sorted asc),
   *            0 = exact match,
   *           -1 = smallest value >= lookupValue (sorted desc).
   */
  computeMATCH(lookupValue: unknown, lookupArray: unknown[], matchType: number): number {
    logger.debug('Computing MATCH', { lookupValue, arrayLength: lookupArray?.length, matchType });

    const flatArray = this.flattenParams(Array.isArray(lookupArray) ? lookupArray : [lookupArray]);

    if (!flatArray || flatArray.length === 0) {
      throw new Error('#VALUE! - Lookup array is empty');
    }

    if (matchType === 0) {
      for (let i = 0; i < flatArray.length; i++) {
        const val = flatArray[i];
        if (val === lookupValue) {
          logger.debug('MATCH exact found', { position: i + 1 });
          return i + 1;
        }
        if (typeof val === 'string' && typeof lookupValue === 'string' &&
            val.toLowerCase() === lookupValue.toLowerCase()) {
          logger.debug('MATCH case-insensitive found', { position: i + 1 });
          return i + 1;
        }
      }
      throw new Error('#N/A - Match not found');
    } else if (matchType === 1) {
      let bestIdx = -1;
      for (let i = 0; i < flatArray.length; i++) {
        const val = flatArray[i] as any;
        if (val <= (lookupValue as any)) {
          bestIdx = i;
        } else {
          break;
        }
      }
      if (bestIdx === -1) {
        throw new Error('#N/A - No value found <= lookup value');
      }
      logger.debug('MATCH ascending found', { position: bestIdx + 1 });
      return bestIdx + 1;
    } else {
      let bestIdx = -1;
      for (let i = 0; i < flatArray.length; i++) {
        const val = flatArray[i] as any;
        if (val >= (lookupValue as any)) {
          bestIdx = i;
        } else {
          break;
        }
      }
      if (bestIdx === -1) {
        throw new Error('#N/A - No value found >= lookup value');
      }
      logger.debug('MATCH descending found', { position: bestIdx + 1 });
      return bestIdx + 1;
    }
  }

  /**
   * Flatten nested arrays into a single-level array.
   */
  private flattenParams(params: unknown[]): unknown[] {
    const result: unknown[] = [];
    for (const p of params) {
      if (Array.isArray(p)) {
        result.push(...this.flattenParams(p));
      } else {
        result.push(p);
      }
    }
    return result;
  }

  private colNumberToLetter(col: number): string {
    let result = '';
    let c = col;
    while (c > 0) {
      c--;
      result = String.fromCharCode(65 + (c % 26)) + result;
      c = Math.floor(c / 26);
    }
    return result || 'A';
  }

  private letterToColNumber(letter: string): number {
    let col = 0;
    for (let i = 0; i < letter.length; i++) {
      col = col * 26 + (letter.charCodeAt(i) - 64);
    }
    return col;
  }

  private parseCellRef(ref: string): { row: number; col: number } | null {
    const match = ref.match(/^([A-Z]+)(\d+)$/);
    if (!match) return null;
    return {
      col: this.letterToColNumber(match[1]),
      row: parseInt(match[2], 10),
    };
  }
}

export const formulaEngineService = new FormulaEngineService();
