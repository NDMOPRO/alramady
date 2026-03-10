import { PrismaClient, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface MacroAction {
  id: string;
  type: MacroActionType;
  target: CellTarget;
  params: Record<string, unknown>;
  timestamp: number;
}

type MacroActionType =
  | 'setCellValue'
  | 'setCellFormula'
  | 'setCellStyle'
  | 'insertRow'
  | 'deleteRow'
  | 'insertColumn'
  | 'deleteColumn'
  | 'mergeCells'
  | 'unmergeCells'
  | 'sort'
  | 'filter'
  | 'conditional'
  | 'copyRange'
  | 'fillDown'
  | 'findReplace'
  | 'setColumnWidth'
  | 'setRowHeight'
  | 'applyBorder'
  | 'applyNumberFormat';

interface CellTarget {
  sheet: string;
  startRow: number;
  startCol: number;
  endRow?: number;
  endCol?: number;
}

interface MacroRecording {
  id: string;
  name: string;
  description: string;
  actions: MacroAction[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  variables: Record<string, unknown>;
}

interface CustomFunction {
  name: string;
  description: string;
  parameters: FunctionParameter[];
  body: string;
  returnType: 'number' | 'string' | 'boolean' | 'array';
  category: string;
}

interface FunctionParameter {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'range' | 'any';
  required: boolean;
  defaultValue?: unknown;
  description: string;
}

interface UndoRedoEntry {
  id: string;
  action: MacroAction;
  inverseAction: MacroAction;
  timestamp: number;
}

interface BatchOperation {
  id: string;
  name: string;
  operations: MacroAction[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
  progress: number;
  results: BatchOperationResult[];
}

interface BatchOperationResult {
  operationIndex: number;
  success: boolean;
  error?: string;
  affectedCells: number;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class MacroEngineService {
  private prisma: PrismaClient;
  private recordings: Map<string, MacroRecording> = new Map();
  private customFunctions: Map<string, CustomFunction> = new Map();
  private undoStack: UndoRedoEntry[] = [];
  private redoStack: UndoRedoEntry[] = [];
  private isRecording: boolean = false;
  private currentRecordingId: string | null = null;
  private actionBuffer: MacroAction[] = [];
  private readonly MAX_UNDO_HISTORY = 200;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.registerBuiltInFunctions();
  }

  private registerBuiltInFunctions(): void {
    this.customFunctions.set('WEIGHTED_AVERAGE', {
      name: 'WEIGHTED_AVERAGE',
      description: 'Calculates the weighted average of a set of values',
      parameters: [
        { name: 'values', type: 'range', required: true, description: 'Range of values' },
        { name: 'weights', type: 'range', required: true, description: 'Range of weights' },
      ],
      body: `
        if (values.length !== weights.length) throw new Error('Values and weights must have same length');
        let sumProduct = 0;
        let sumWeights = 0;
        for (let i = 0; i < values.length; i++) {
          const v = Number(values[i]) || 0;
          const w = Number(weights[i]) || 0;
          sumProduct += v * w;
          sumWeights += w;
        }
        return sumWeights !== 0 ? sumProduct / sumWeights : 0;
      `,
      returnType: 'number',
      category: 'Statistical',
    });

    this.customFunctions.set('RUNNING_TOTAL', {
      name: 'RUNNING_TOTAL',
      description: 'Calculates a running total for a range of values',
      parameters: [
        { name: 'values', type: 'range', required: true, description: 'Range of values to sum' },
        { name: 'index', type: 'number', required: true, description: 'Current row index (1-based)' },
      ],
      body: `
        let total = 0;
        const limit = Math.min(index, values.length);
        for (let i = 0; i < limit; i++) {
          total += Number(values[i]) || 0;
        }
        return total;
      `,
      returnType: 'number',
      category: 'Financial',
    });

    this.customFunctions.set('GROWTH_RATE', {
      name: 'GROWTH_RATE',
      description: 'Calculates the percentage growth rate between two values',
      parameters: [
        { name: 'currentValue', type: 'number', required: true, description: 'Current period value' },
        { name: 'previousValue', type: 'number', required: true, description: 'Previous period value' },
        { name: 'decimals', type: 'number', required: false, defaultValue: 2, description: 'Decimal places' },
      ],
      body: `
        const curr = Number(currentValue) || 0;
        const prev = Number(previousValue) || 0;
        if (prev === 0) return curr > 0 ? 100 : curr < 0 ? -100 : 0;
        const rate = ((curr - prev) / Math.abs(prev)) * 100;
        const factor = Math.pow(10, decimals || 2);
        return Math.round(rate * factor) / factor;
      `,
      returnType: 'number',
      category: 'Financial',
    });

    this.customFunctions.set('ARABIC_DATE', {
      name: 'ARABIC_DATE',
      description: 'Formats a date in Arabic Hijri calendar format',
      parameters: [
        { name: 'dateValue', type: 'any', required: true, description: 'Date value to format' },
        { name: 'format', type: 'string', required: false, defaultValue: 'long', description: 'Format style' },
      ],
      body: `
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return 'Invalid Date';
        const hijriMonths = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
        const jd = Math.floor((date.getTime() - new Date(1970, 0, 1).getTime()) / 86400000) + 2440588;
        const l = jd - 1948440 + 10632;
        const n = Math.floor((l - 1) / 10631);
        const l2 = l - 10631 * n + 354;
        const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
        const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
        const month = Math.floor((24 * l3) / 709);
        const day = l3 - Math.floor((709 * month) / 24);
        const year = 30 * n + j - 30;
        if (format === 'short') return day + '/' + month + '/' + year;
        return day + ' ' + hijriMonths[month - 1] + ' ' + year;
      `,
      returnType: 'string',
      category: 'Date',
    });
  }

  startRecording(name: string, description: string, createdBy: string): string {
    const id = crypto.randomUUID();
    this.isRecording = true;
    this.currentRecordingId = id;
    this.actionBuffer = [];

    const recording: MacroRecording = {
      id,
      name,
      description,
      actions: [],
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      variables: {},
    };

    this.recordings.set(id, recording);
    return id;
  }

  recordAction(action: Omit<MacroAction, 'id' | 'timestamp'>): void {
    if (!this.isRecording || !this.currentRecordingId) {
      throw new Error('No active recording session');
    }

    const fullAction: MacroAction = {
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    this.actionBuffer.push(fullAction);

    const recording = this.recordings.get(this.currentRecordingId);
    if (recording) {
      recording.actions.push(fullAction);
      recording.updatedAt = new Date();
    }
  }

  async stopRecording(): Promise<MacroRecording> {
    if (!this.isRecording || !this.currentRecordingId) {
      throw new Error('No active recording session');
    }

    const recording = this.recordings.get(this.currentRecordingId)!;
    recording.actions = [...this.actionBuffer];

    await this.prisma.macro.create({
      data: {
        id: recording.id,
        name: recording.name,
        description: recording.description,
        actions: recording.actions as unknown as Prisma.InputJsonValue,
        createdBy: recording.createdBy,
        variables: recording.variables as Prisma.InputJsonValue,
        createdAt: recording.createdAt,
        updatedAt: recording.updatedAt,
      },
    });

    this.isRecording = false;
    this.currentRecordingId = null;
    this.actionBuffer = [];
    return recording;
  }

  async playbackMacro(
    macroId: string,
    workbook: ExcelJS.Workbook,
    variableOverrides?: Record<string, unknown>,
  ): Promise<BatchOperationResult[]> {
    const recording = this.recordings.get(macroId);
    if (!recording) {
      const dbMacro = await this.prisma.macro.findUnique({ where: { id: macroId } });
      if (!dbMacro) {
        throw new Error(`Macro not found: ${macroId}`);
      }
      const loaded: MacroRecording = {
        id: dbMacro.id,
        name: dbMacro.name,
        description: dbMacro.description,
        actions: dbMacro.actions as unknown as MacroAction[],
        createdBy: dbMacro.createdBy,
        createdAt: dbMacro.createdAt,
        updatedAt: dbMacro.updatedAt,
        variables: (dbMacro.variables as Record<string, unknown>) || {},
      };
      this.recordings.set(macroId, loaded);
      return this.executeActions(loaded.actions, workbook, variableOverrides || loaded.variables);
    }

    const mergedVars = { ...recording.variables, ...(variableOverrides || {}) };
    return this.executeActions(recording.actions, workbook, mergedVars);
  }

  private async executeActions(
    actions: MacroAction[],
    workbook: ExcelJS.Workbook,
    variables: Record<string, unknown>,
  ): Promise<BatchOperationResult[]> {
    const results: BatchOperationResult[] = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      try {
        const affectedCells = await this.executeAction(action, workbook, variables);
        results.push({
          operationIndex: i,
          success: true,
          affectedCells,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        results.push({
          operationIndex: i,
          success: false,
          error: errMsg,
          affectedCells: 0,
        });
      }
    }

    return results;
  }

  private async executeAction(
    action: MacroAction,
    workbook: ExcelJS.Workbook,
    variables: Record<string, unknown>,
  ): Promise<number> {
    const worksheet = workbook.getWorksheet(action.target.sheet);
    if (!worksheet) {
      throw new Error(`Worksheet not found: ${action.target.sheet}`);
    }

    let affectedCells = 0;

    switch (action.type) {
      case 'setCellValue': {
        const row = worksheet.getRow(action.target.startRow);
        const cell = row.getCell(action.target.startCol);
        const oldValue = cell.value;
        let newValue = action.params.value;

        if (typeof newValue === 'string' && newValue.startsWith('$')) {
          const varName = newValue.substring(1);
          newValue = variables[varName] ?? newValue;
        }

        cell.value = newValue as ExcelJS.CellValue;
        this.pushUndo(action, {
          ...action,
          id: crypto.randomUUID(),
          params: { value: oldValue },
          timestamp: Date.now(),
        });
        affectedCells = 1;
        break;
      }

      case 'setCellFormula': {
        const cell = worksheet.getRow(action.target.startRow).getCell(action.target.startCol);
        const oldFormula = cell.formula;
        cell.value = { formula: action.params.formula as string } as ExcelJS.CellFormulaValue;
        this.pushUndo(action, {
          ...action,
          id: crypto.randomUUID(),
          params: { formula: oldFormula || '' },
          timestamp: Date.now(),
        });
        affectedCells = 1;
        break;
      }

      case 'setCellStyle': {
        const endRow = action.target.endRow || action.target.startRow;
        const endCol = action.target.endCol || action.target.startCol;
        const style = action.params.style as Partial<ExcelJS.Style>;

        for (let r = action.target.startRow; r <= endRow; r++) {
          for (let c = action.target.startCol; c <= endCol; c++) {
            const cell = worksheet.getRow(r).getCell(c);
            if (style.font) cell.font = { ...cell.font, ...style.font };
            if (style.alignment) cell.alignment = { ...cell.alignment, ...style.alignment };
            if (style.fill) cell.fill = style.fill;
            if (style.border) cell.border = style.border;
            if (style.numFmt) cell.numFmt = style.numFmt;
            affectedCells++;
          }
        }
        break;
      }

      case 'insertRow': {
        const rowCount = (action.params.count as number) || 1;
        worksheet.spliceRows(action.target.startRow, 0, ...new Array(rowCount).fill([]));
        affectedCells = rowCount * (worksheet.columnCount || 1);
        break;
      }

      case 'deleteRow': {
        const delCount = (action.params.count as number) || 1;
        worksheet.spliceRows(action.target.startRow, delCount);
        affectedCells = delCount * (worksheet.columnCount || 1);
        break;
      }

      case 'sort': {
        const sortCol = action.params.sortColumn as number;
        const ascending = action.params.ascending !== false;
        const startR = action.target.startRow;
        const endR = action.target.endRow || worksheet.rowCount;
        const startC = action.target.startCol;
        const endC = action.target.endCol || worksheet.columnCount;

        const rows: { index: number; values: ExcelJS.CellValue[] }[] = [];
        for (let r = startR; r <= endR; r++) {
          const row = worksheet.getRow(r);
          const vals: ExcelJS.CellValue[] = [];
          for (let c = startC; c <= endC; c++) {
            vals.push(row.getCell(c).value);
          }
          rows.push({ index: r, values: vals });
        }

        const colOffset = sortCol - startC;
        rows.sort((a, b) => {
          const aVal = a.values[colOffset];
          const bVal = b.values[colOffset];
          const aNum = Number(aVal);
          const bNum = Number(bVal);

          if (!isNaN(aNum) && !isNaN(bNum)) {
            return ascending ? aNum - bNum : bNum - aNum;
          }

          const aStr = String(aVal || '');
          const bStr = String(bVal || '');
          return ascending ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
        });

        for (let i = 0; i < rows.length; i++) {
          const row = worksheet.getRow(startR + i);
          for (let c = 0; c < rows[i].values.length; c++) {
            row.getCell(startC + c).value = rows[i].values[c];
          }
          affectedCells += rows[i].values.length;
        }
        break;
      }

      case 'findReplace': {
        const findText = String(action.params.find || '');
        const replaceText = String(action.params.replace || '');
        const caseSensitive = action.params.caseSensitive === true;
        const wholeCell = action.params.wholeCell === true;

        worksheet.eachRow((row) => {
          row.eachCell((cell) => {
            if (typeof cell.value === 'string') {
              let cellValue = cell.value;
              let matches = false;

              if (wholeCell) {
                matches = caseSensitive
                  ? cellValue === findText
                  : cellValue.toLowerCase() === findText.toLowerCase();
                if (matches) {
                  cell.value = replaceText;
                  affectedCells++;
                }
              } else {
                if (caseSensitive) {
                  if (cellValue.includes(findText)) {
                    cell.value = cellValue.split(findText).join(replaceText);
                    affectedCells++;
                  }
                } else {
                  const regex = new RegExp(this.escapeRegex(findText), 'gi');
                  if (regex.test(cellValue)) {
                    cell.value = cellValue.replace(regex, replaceText);
                    affectedCells++;
                  }
                }
              }
            }
          });
        });
        break;
      }

      case 'fillDown': {
        const sourceRow = worksheet.getRow(action.target.startRow);
        const endR2 = action.target.endRow || action.target.startRow + 10;
        const startC2 = action.target.startCol;
        const endC2 = action.target.endCol || action.target.startCol;

        for (let r = action.target.startRow + 1; r <= endR2; r++) {
          const targetRow = worksheet.getRow(r);
          for (let c = startC2; c <= endC2; c++) {
            const sourceCell = sourceRow.getCell(c);
            const targetCell = targetRow.getCell(c);
            targetCell.value = sourceCell.value;
            targetCell.style = { ...sourceCell.style };
            affectedCells++;
          }
        }
        break;
      }

      case 'copyRange': {
        const destRow = action.params.destRow as number;
        const destCol = action.params.destCol as number;
        const endR3 = action.target.endRow || action.target.startRow;
        const endC3 = action.target.endCol || action.target.startCol;

        for (let r = action.target.startRow; r <= endR3; r++) {
          for (let c = action.target.startCol; c <= endC3; c++) {
            const srcCell = worksheet.getRow(r).getCell(c);
            const dstR = destRow + (r - action.target.startRow);
            const dstC = destCol + (c - action.target.startCol);
            const dstCell = worksheet.getRow(dstR).getCell(dstC);
            dstCell.value = srcCell.value;
            dstCell.style = { ...srcCell.style };
            affectedCells++;
          }
        }
        break;
      }

      case 'setColumnWidth': {
        const width = action.params.width as number;
        const endC4 = action.target.endCol || action.target.startCol;
        for (let c = action.target.startCol; c <= endC4; c++) {
          const col = worksheet.getColumn(c);
          col.width = width;
          affectedCells++;
        }
        break;
      }

      case 'setRowHeight': {
        const height = action.params.height as number;
        const endR4 = action.target.endRow || action.target.startRow;
        for (let r = action.target.startRow; r <= endR4; r++) {
          const row = worksheet.getRow(r);
          row.height = height;
          affectedCells++;
        }
        break;
      }

      case 'applyNumberFormat': {
        const fmt = action.params.format as string;
        const endR5 = action.target.endRow || action.target.startRow;
        const endC5 = action.target.endCol || action.target.startCol;

        for (let r = action.target.startRow; r <= endR5; r++) {
          for (let c = action.target.startCol; c <= endC5; c++) {
            const cell = worksheet.getRow(r).getCell(c);
            cell.numFmt = fmt;
            affectedCells++;
          }
        }
        break;
      }

      case 'insertColumn': {
        const colCount = (action.params.count as number) || 1;
        worksheet.spliceColumns(action.target.startCol, 0, ...new Array(colCount).fill([]));
        this.pushUndo(action, {
          ...action,
          id: crypto.randomUUID(),
          type: 'deleteColumn',
          params: { count: colCount },
          timestamp: Date.now(),
        });
        affectedCells = colCount * (worksheet.rowCount || 1);
        break;
      }

      case 'deleteColumn': {
        const delColCount = (action.params.count as number) || 1;
        const savedCols: ExcelJS.CellValue[][] = [];
        for (let c = action.target.startCol; c < action.target.startCol + delColCount; c++) {
          const colValues: ExcelJS.CellValue[] = [];
          for (let r = 1; r <= worksheet.rowCount; r++) {
            colValues.push(worksheet.getRow(r).getCell(c).value);
          }
          savedCols.push(colValues);
        }
        worksheet.spliceColumns(action.target.startCol, delColCount);
        this.pushUndo(action, {
          ...action,
          id: crypto.randomUUID(),
          type: 'insertColumn',
          params: { count: delColCount, savedCols },
          timestamp: Date.now(),
        });
        affectedCells = delColCount * (worksheet.rowCount || 1);
        break;
      }

      case 'mergeCells': {
        const mergeEndRow = action.target.endRow || action.target.startRow;
        const mergeEndCol = action.target.endCol || action.target.startCol;
        worksheet.mergeCells(
          action.target.startRow,
          action.target.startCol,
          mergeEndRow,
          mergeEndCol,
        );
        this.pushUndo(action, {
          ...action,
          id: crypto.randomUUID(),
          type: 'unmergeCells',
          params: {},
          timestamp: Date.now(),
        });
        affectedCells =
          (mergeEndRow - action.target.startRow + 1) *
          (mergeEndCol - action.target.startCol + 1);
        break;
      }

      case 'unmergeCells': {
        const unmergeEndRow = action.target.endRow || action.target.startRow;
        const unmergeEndCol = action.target.endCol || action.target.startCol;
        worksheet.unMergeCells(
          action.target.startRow,
          action.target.startCol,
          unmergeEndRow,
          unmergeEndCol,
        );
        this.pushUndo(action, {
          ...action,
          id: crypto.randomUUID(),
          type: 'mergeCells',
          params: {},
          timestamp: Date.now(),
        });
        affectedCells =
          (unmergeEndRow - action.target.startRow + 1) *
          (unmergeEndCol - action.target.startCol + 1);
        break;
      }

      case 'filter': {
        const filterEndRow = action.target.endRow || action.target.startRow;
        const filterEndCol = action.target.endCol || action.target.startCol;
        const startCellRef = worksheet
          .getRow(action.target.startRow)
          .getCell(action.target.startCol).address;
        const endCellRef = worksheet
          .getRow(filterEndRow)
          .getCell(filterEndCol).address;
        worksheet.autoFilter = {
          from: startCellRef,
          to: endCellRef,
        };
        if (action.params.filterValues && Array.isArray(action.params.filterValues)) {
          const filterColOffset =
            (action.params.filterColumn as number | undefined) ?? action.target.startCol;
          worksheet.autoFilter = {
            from: startCellRef,
            to: endCellRef,
            filterButton: true,
          } as ExcelJS.AutoFilter;
          const filterSet = new Set(
            (action.params.filterValues as unknown[]).map(v => String(v)),
          );
          for (let r = action.target.startRow + 1; r <= filterEndRow; r++) {
            const row = worksheet.getRow(r);
            const cellVal = String(row.getCell(filterColOffset).value ?? '');
            row.hidden = !filterSet.has(cellVal);
            affectedCells++;
          }
        } else {
          affectedCells =
            (filterEndRow - action.target.startRow + 1) *
            (filterEndCol - action.target.startCol + 1);
        }
        break;
      }

      case 'conditional': {
        const condEndRow = action.target.endRow || action.target.startRow;
        const condEndCol = action.target.endCol || action.target.startCol;
        const startRef = worksheet
          .getRow(action.target.startRow)
          .getCell(action.target.startCol).address;
        const endRef = worksheet.getRow(condEndRow).getCell(condEndCol).address;
        const ref =
          startRef === endRef ? startRef : `${startRef}:${endRef}`;
        const rule = action.params.rule as ExcelJS.ConditionalFormattingRule;
        if (!rule) {
          throw new Error('conditional action requires params.rule');
        }
        worksheet.addConditionalFormatting({
          ref,
          rules: [rule],
        });
        affectedCells =
          (condEndRow - action.target.startRow + 1) *
          (condEndCol - action.target.startCol + 1);
        break;
      }

      case 'applyBorder': {
        const borderEndRow = action.target.endRow || action.target.startRow;
        const borderEndCol = action.target.endCol || action.target.startCol;
        const border = action.params.border as Partial<ExcelJS.Borders>;
        if (!border) {
          throw new Error('applyBorder action requires params.border');
        }
        for (let r = action.target.startRow; r <= borderEndRow; r++) {
          for (let c = action.target.startCol; c <= borderEndCol; c++) {
            const cell = worksheet.getRow(r).getCell(c);
            cell.border = { ...cell.border, ...border };
            affectedCells++;
          }
        }
        break;
      }

      default: {
        throw new Error(`Unknown action type: ${action.type}`);
      }
    }

    return affectedCells;
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private pushUndo(action: MacroAction, inverseAction: MacroAction): void {
    this.undoStack.push({
      id: crypto.randomUUID(),
      action,
      inverseAction,
      timestamp: Date.now(),
    });

    if (this.undoStack.length > this.MAX_UNDO_HISTORY) {
      this.undoStack.shift();
    }

    this.redoStack = [];
  }

  async undo(workbook: ExcelJS.Workbook): Promise<BatchOperationResult | null> {
    const entry = this.undoStack.pop();
    if (!entry) {
      return null;
    }

    const result = await this.executeAction(entry.inverseAction, workbook, {});
    this.redoStack.push(entry);

    return {
      operationIndex: 0,
      success: true,
      affectedCells: result,
    };
  }

  async redo(workbook: ExcelJS.Workbook): Promise<BatchOperationResult | null> {
    const entry = this.redoStack.pop();
    if (!entry) {
      return null;
    }

    const result = await this.executeAction(entry.action, workbook, {});
    this.undoStack.push(entry);

    return {
      operationIndex: 0,
      success: true,
      affectedCells: result,
    };
  }

  registerFunction(func: CustomFunction): void {
    const nameUpper = func.name.toUpperCase();
    if (this.customFunctions.has(nameUpper)) {
      throw new Error(`Function already registered: ${nameUpper}`);
    }
    this.customFunctions.set(nameUpper, func);
  }

  executeFunction(name: string, args: unknown[]): unknown {
    const func = this.customFunctions.get(name.toUpperCase());
    if (!func) {
      throw new Error(`Unknown function: ${name}`);
    }

    const paramValues: Record<string, unknown> = {};
    for (let i = 0; i < func.parameters.length; i++) {
      const param = func.parameters[i];
      if (i < args.length) {
        paramValues[param.name] = args[i];
      } else if (param.required) {
        throw new Error(`Missing required parameter: ${param.name}`);
      } else {
        paramValues[param.name] = param.defaultValue;
      }
    }

    const paramNames = Object.keys(paramValues);
    const paramVals = Object.values(paramValues);
    const executor = new Function(...paramNames, func.body);
    return executor(...paramVals);
  }

  listFunctions(category?: string): CustomFunction[] {
    const functions = Array.from(this.customFunctions.values());
    if (category) {
      return functions.filter(f => f.category.toLowerCase() === category.toLowerCase());
    }
    return functions;
  }

  async executeBatchOperations(
    workbook: ExcelJS.Workbook,
    operations: MacroAction[],
    stopOnError: boolean = false,
  ): Promise<BatchOperation> {
    const batchId = crypto.randomUUID();
    const batch: BatchOperation = {
      id: batchId,
      name: `Batch-${batchId.substring(0, 8)}`,
      operations,
      status: 'running',
      progress: 0,
      results: [],
    };

    for (let i = 0; i < operations.length; i++) {
      try {
        const affected = await this.executeAction(operations[i], workbook, {});
        batch.results.push({
          operationIndex: i,
          success: true,
          affectedCells: affected,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        batch.results.push({
          operationIndex: i,
          success: false,
          error: errMsg,
          affectedCells: 0,
        });

        if (stopOnError) {
          batch.status = 'failed';
          batch.progress = Math.round(((i + 1) / operations.length) * 100);
          return batch;
        }
      }

      batch.progress = Math.round(((i + 1) / operations.length) * 100);
    }

    const allSucceeded = batch.results.every(r => r.success);
    batch.status = allSucceeded ? 'completed' : 'failed';
    return batch;
  }

  getUndoStackSize(): number {
    return this.undoStack.length;
  }

  getRedoStackSize(): number {
    return this.redoStack.length;
  }

  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  async saveMacro(macroId: string): Promise<void> {
    const recording = this.recordings.get(macroId);
    if (!recording) {
      throw new Error(`Macro not found in memory: ${macroId}`);
    }

    await this.prisma.macro.upsert({
      where: { id: macroId },
      update: {
        name: recording.name,
        description: recording.description,
        actions: recording.actions as unknown as Prisma.InputJsonValue,
        variables: recording.variables as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
      create: {
        id: recording.id,
        name: recording.name,
        description: recording.description,
        actions: recording.actions as unknown as Prisma.InputJsonValue,
        createdBy: recording.createdBy,
        variables: recording.variables as Prisma.InputJsonValue,
        createdAt: recording.createdAt,
        updatedAt: new Date(),
      },
    });
  }

  async listMacros(userId?: string): Promise<MacroRecording[]> {
    const where = userId ? { createdBy: userId } : {};
    const macros = await this.prisma.macro.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return macros.map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      actions: m.actions as unknown as MacroAction[],
      createdBy: m.createdBy,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      variables: (m.variables as Record<string, unknown>) || {},
    }));
  }

  async deleteMacro(macroId: string): Promise<void> {
    this.recordings.delete(macroId);
    await this.prisma.macro.delete({ where: { id: macroId } });
  }
}
