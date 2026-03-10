import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger.js';
import type {
  ExcelDimensions,
  ExcelStructure,
  MatchReport,
  MatchDetail,
  FuzzyMatchResult,
  DeduplicationResult,
  ReplicationResult,
} from '../types/matching.types.js';

interface WorkbookRecord {
  id: string;
  sheetsJson: unknown;
  formulasJson: unknown;
  tenantId: string;
  datasetId: string | null;
  name: string;
  createdBy: string;
}

interface SheetData {
  name?: string;
  cells?: Record<string, CellData>;
  rowCount?: number;
  colCount?: number;
  columnWidths?: Record<string, number>;
  rowHeights?: Record<string, number>;
  mergedCells?: Array<{ start?: string; end?: string } | string>;
  frozenPane?: Record<string, unknown>;
  hiddenRows?: number[];
  hiddenCols?: number[];
  namedRanges?: Array<{ name?: string; range?: string }>;
  conditionalFormats?: Array<{ range?: string; rules?: unknown[] }>;
  dataValidations?: Array<{ range?: string; rules?: unknown }>;
  charts?: Array<{ type?: string; range?: string }>;
  tables?: Array<{ name?: string; range?: string }>;
}

interface CellData {
  formula?: string;
  format?: Record<string, unknown>;
  style?: Record<string, unknown>;
  value?: unknown;
}

interface SheetsJson {
  sheets?: SheetData[];
}

interface KeyedRecord {
  [key: string]: unknown;
}

const CACHE_PREFIX = 'excel-matching-engine';

/**
 * Professional Excel file matching engine for the RASID platform.
 * Provides deep comparison, replication, and per-property matching
 * between workbooks stored in Prisma via sheets_json.
 */
export class ExcelMatchingService {
  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Load a workbook record from the database by id.
   * Throws if the workbook cannot be found.
   */
  private async loadWorkbook(workbookId: string) {
    const { prisma } = await import('../utils/prisma.js');
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }
    return workbook;
  }

  /**
   * Persist updated sheets_json back to the database and bust caches.
   */
  private async saveWorkbook(workbookId: string, sheetsJson: SheetsJson) {
    const { prisma } = await import('../utils/prisma.js');
    const { cacheDel } = await import('../utils/redis.js');

    const updated = await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as unknown as Prisma.InputJsonValue },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${workbookId}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return updated;
  }

  /**
   * Safely extract the sheets array from sheets_json, returning an empty array
   * when the structure is absent or unexpected.
   */
  private getSheetsArray(sheetsJson: SheetsJson | SheetData[] | null | undefined): SheetData[] {
    if (!sheetsJson) return [];
    if (Array.isArray(sheetsJson)) return sheetsJson;
    if (Array.isArray((sheetsJson as SheetsJson).sheets)) return (sheetsJson as SheetsJson).sheets!;
    return [];
  }

  // ---------------------------------------------------------------------------
  // 1. Extract dimensions
  // ---------------------------------------------------------------------------

  async extractDimensions(workbookId: string): Promise<ExcelDimensions> {
    logger.info('Extracting dimensions', { workbookId });
    const workbook = await this.loadWorkbook(workbookId);
    const sheetsJson = ((workbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const sheetsArray = this.getSheetsArray(sheetsJson);

    const sheets = sheetsArray.map((sheet: SheetData) => {
      const cells = sheet.cells ?? {};
      const cellKeys = Object.keys(cells);

      let maxRow = sheet.rowCount ?? 0;
      let maxCol = sheet.colCount ?? 0;
      for (const key of cellKeys) {
        const match = key.match(/^([A-Z]+)(\d+)$/);
        if (match) {
          const colLetters = match[1];
          const row = parseInt(match[2], 10);
          let col = 0;
          for (let i = 0; i < colLetters.length; i++) {
            col = col * 26 + (colLetters.charCodeAt(i) - 64);
          }
          if (row > maxRow) maxRow = row;
          if (col > maxCol) maxCol = col;
        }
      }

      const columnWidths: Record<number, number> = {};
      if (sheet.columnWidths) {
        for (const [k, v] of Object.entries(sheet.columnWidths)) {
          columnWidths[Number(k)] = Number(v);
        }
      }

      const rowHeights: Record<number, number> = {};
      if (sheet.rowHeights) {
        for (const [k, v] of Object.entries(sheet.rowHeights)) {
          rowHeights[Number(k)] = Number(v);
        }
      }

      const mergedCells: Array<{ start: string; end: string }> = [];
      if (Array.isArray(sheet.mergedCells)) {
        for (const mc of sheet.mergedCells) {
          if (typeof mc === 'object' && mc !== null && (mc as any).start && (mc as any).end) {
            mergedCells.push({ start: String((mc as any).start), end: String((mc as any).end) });
          } else if (typeof mc === 'string' && mc.includes(':')) {
            const [start, end] = mc.split(':');
            mergedCells.push({ start, end });
          }
        }
      }

      return {
        name: sheet.name ?? 'Sheet',
        rowCount: maxRow,
        colCount: maxCol,
        columnWidths,
        rowHeights,
        mergedCells,
        frozenPane: (sheet.frozenPane as any) ?? undefined,
        hiddenRows: Array.isArray(sheet.hiddenRows) ? sheet.hiddenRows.map(Number) : [],
        hiddenCols: Array.isArray(sheet.hiddenCols) ? sheet.hiddenCols.map(Number) : [],
      };
    });

    logger.info('Dimensions extracted', { workbookId, sheetCount: sheets.length });
    return { sheets };
  }

  // ---------------------------------------------------------------------------
  // 2. Extract structure
  // ---------------------------------------------------------------------------

  async extractStructure(workbookId: string): Promise<ExcelStructure> {
    logger.info('Extracting structure', { workbookId });
    const workbook = await this.loadWorkbook(workbookId);
    const sheetsJson = ((workbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const sheetsArray = this.getSheetsArray(sheetsJson);

    const sheets = sheetsArray.map((sheet: SheetData) => {
      // Formulas
      const formulas: Array<{ cell: string; formula: string }> = [];
      const cells = sheet.cells ?? {};
      for (const [addr, cell] of Object.entries(cells)) {
        const cellObj = cell as CellData;
        if (cellObj?.formula) {
          formulas.push({ cell: addr, formula: String(cellObj.formula) });
        }
      }

      // Named ranges
      const namedRanges: Array<{ name: string; range: string }> = [];
      if (Array.isArray(sheet.namedRanges)) {
        for (const nr of sheet.namedRanges) {
          namedRanges.push({ name: String(nr.name ?? ''), range: String(nr.range ?? '') });
        }
      }

      // Conditional formats
      const conditionalFormats: Array<{ range: string; rules: unknown[] }> = [];
      if (Array.isArray(sheet.conditionalFormats)) {
        for (const cf of sheet.conditionalFormats) {
          conditionalFormats.push({
            range: String(cf.range ?? ''),
            rules: Array.isArray(cf.rules) ? cf.rules : [],
          });
        }
      }

      // Data validations
      const dataValidations: Array<{ range: string; rules: unknown }> = [];
      if (Array.isArray(sheet.dataValidations)) {
        for (const dv of sheet.dataValidations) {
          dataValidations.push({
            range: String(dv.range ?? ''),
            rules: dv.rules ?? {},
          });
        }
      }

      // Charts
      const charts: Array<{ type: string; range: string }> = [];
      if (Array.isArray(sheet.charts)) {
        for (const ch of sheet.charts) {
          charts.push({ type: String(ch.type ?? ''), range: String(ch.range ?? '') });
        }
      }

      // Tables
      const tables: Array<{ name: string; range: string }> = [];
      if (Array.isArray(sheet.tables)) {
        for (const tbl of sheet.tables) {
          tables.push({ name: String(tbl.name ?? ''), range: String(tbl.range ?? '') });
        }
      }

      return {
        name: sheet.name ?? 'Sheet',
        formulas,
        namedRanges,
        conditionalFormats,
        dataValidations,
        charts,
        tables,
      };
    });

    logger.info('Structure extracted', { workbookId, sheetCount: sheets.length });
    return { sheets };
  }

  // ---------------------------------------------------------------------------
  // 3. Apply dimensions
  // ---------------------------------------------------------------------------

  async applyDimensions(workbookId: string, dimensions: ExcelDimensions): Promise<void> {
    logger.info('Applying dimensions', { workbookId, sheetCount: dimensions.sheets.length });
    const workbook = await this.loadWorkbook(workbookId);
    const sheetsJson = ((workbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const sheetsArray = this.getSheetsArray(sheetsJson);

    for (const dimSheet of dimensions.sheets) {
      let targetSheet = sheetsArray.find((s: SheetData) => s.name === dimSheet.name);
      if (!targetSheet) {
        targetSheet = { name: dimSheet.name, cells: {} };
        sheetsArray.push(targetSheet);
      }

      targetSheet.rowCount = dimSheet.rowCount;
      targetSheet.colCount = dimSheet.colCount;
      targetSheet.columnWidths = { ...dimSheet.columnWidths };
      targetSheet.rowHeights = { ...dimSheet.rowHeights };
      targetSheet.mergedCells = dimSheet.mergedCells.map((mc) => ({ ...mc }));
      targetSheet.frozenPane = dimSheet.frozenPane ? { ...dimSheet.frozenPane } : undefined;
      targetSheet.hiddenRows = [...dimSheet.hiddenRows];
      targetSheet.hiddenCols = [...dimSheet.hiddenCols];
    }

    sheetsJson.sheets = sheetsArray;
    await this.saveWorkbook(workbookId, sheetsJson);
    logger.info('Dimensions applied', { workbookId });
  }

  // ---------------------------------------------------------------------------
  // 4. Apply structure
  // ---------------------------------------------------------------------------

  async applyStructure(workbookId: string, structure: ExcelStructure): Promise<void> {
    logger.info('Applying structure', { workbookId, sheetCount: structure.sheets.length });
    const workbook = await this.loadWorkbook(workbookId);
    const sheetsJson = ((workbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const sheetsArray = this.getSheetsArray(sheetsJson);

    for (const strSheet of structure.sheets) {
      let targetSheet = sheetsArray.find((s: SheetData) => s.name === strSheet.name);
      if (!targetSheet) {
        targetSheet = { name: strSheet.name, cells: {} };
        sheetsArray.push(targetSheet);
      }

      // Apply formulas into cells
      if (!targetSheet.cells) targetSheet.cells = {};
      for (const f of strSheet.formulas) {
        if (!targetSheet.cells[f.cell]) {
          targetSheet.cells[f.cell] = {};
        }
        targetSheet.cells[f.cell].formula = f.formula;
      }

      targetSheet.namedRanges = strSheet.namedRanges.map((nr) => ({ ...nr }));
      targetSheet.conditionalFormats = strSheet.conditionalFormats.map((cf) => ({
        range: cf.range,
        rules: [...cf.rules],
      }));
      targetSheet.dataValidations = strSheet.dataValidations.map((dv) => ({
        range: dv.range,
        rules: dv.rules,
      }));
      targetSheet.charts = strSheet.charts.map((ch) => ({ ...ch }));
      targetSheet.tables = strSheet.tables.map((tbl) => ({ ...tbl }));
    }

    sheetsJson.sheets = sheetsArray;
    await this.saveWorkbook(workbookId, sheetsJson);
    logger.info('Structure applied', { workbookId });
  }

  // ---------------------------------------------------------------------------
  // 5. Match column widths
  // ---------------------------------------------------------------------------

  async matchColumnWidths(sourceId: string, targetId: string): Promise<{ matched: number }> {
    logger.info('Matching column widths', { sourceId, targetId });
    const sourceDimensions = await this.extractDimensions(sourceId);
    const targetWorkbook = await this.loadWorkbook(targetId);
    const targetJson = ((targetWorkbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const targetSheets = this.getSheetsArray(targetJson);

    let matched = 0;
    for (const srcSheet of sourceDimensions.sheets) {
      const tgtSheet = targetSheets.find((s: SheetData) => s.name === srcSheet.name);
      if (tgtSheet) {
        tgtSheet.columnWidths = { ...srcSheet.columnWidths };
        matched += Object.keys(srcSheet.columnWidths).length;
      }
    }

    targetJson.sheets = targetSheets;
    await this.saveWorkbook(targetId, targetJson);
    logger.info('Column widths matched', { sourceId, targetId, matched });
    return { matched };
  }

  // ---------------------------------------------------------------------------
  // 6. Match row heights
  // ---------------------------------------------------------------------------

  async matchRowHeights(sourceId: string, targetId: string): Promise<{ matched: number }> {
    logger.info('Matching row heights', { sourceId, targetId });
    const sourceDimensions = await this.extractDimensions(sourceId);
    const targetWorkbook = await this.loadWorkbook(targetId);
    const targetJson = ((targetWorkbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const targetSheets = this.getSheetsArray(targetJson);

    let matched = 0;
    for (const srcSheet of sourceDimensions.sheets) {
      const tgtSheet = targetSheets.find((s: SheetData) => s.name === srcSheet.name);
      if (tgtSheet) {
        tgtSheet.rowHeights = { ...srcSheet.rowHeights };
        matched += Object.keys(srcSheet.rowHeights).length;
      }
    }

    targetJson.sheets = targetSheets;
    await this.saveWorkbook(targetId, targetJson);
    logger.info('Row heights matched', { sourceId, targetId, matched });
    return { matched };
  }

  // ---------------------------------------------------------------------------
  // 7. Match merged cells
  // ---------------------------------------------------------------------------

  async matchMergedCells(sourceId: string, targetId: string): Promise<{ matched: number }> {
    logger.info('Matching merged cells', { sourceId, targetId });
    const sourceDimensions = await this.extractDimensions(sourceId);
    const targetWorkbook = await this.loadWorkbook(targetId);
    const targetJson = ((targetWorkbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const targetSheets = this.getSheetsArray(targetJson);

    let matched = 0;
    for (const srcSheet of sourceDimensions.sheets) {
      const tgtSheet = targetSheets.find((s: SheetData) => s.name === srcSheet.name);
      if (tgtSheet) {
        tgtSheet.mergedCells = srcSheet.mergedCells.map((mc) => ({ ...mc }));
        matched += srcSheet.mergedCells.length;
      }
    }

    targetJson.sheets = targetSheets;
    await this.saveWorkbook(targetId, targetJson);
    logger.info('Merged cells matched', { sourceId, targetId, matched });
    return { matched };
  }

  // ---------------------------------------------------------------------------
  // 8. Match freeze panes
  // ---------------------------------------------------------------------------

  async matchFreezePanes(sourceId: string, targetId: string): Promise<{ matched: number }> {
    logger.info('Matching freeze panes', { sourceId, targetId });
    const sourceDimensions = await this.extractDimensions(sourceId);
    const targetWorkbook = await this.loadWorkbook(targetId);
    const targetJson = ((targetWorkbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const targetSheets = this.getSheetsArray(targetJson);

    let matched = 0;
    for (const srcSheet of sourceDimensions.sheets) {
      const tgtSheet = targetSheets.find((s: SheetData) => s.name === srcSheet.name);
      if (tgtSheet) {
        tgtSheet.frozenPane = srcSheet.frozenPane ? { ...srcSheet.frozenPane } : undefined;
        if (srcSheet.frozenPane) matched++;
      }
    }

    targetJson.sheets = targetSheets;
    await this.saveWorkbook(targetId, targetJson);
    logger.info('Freeze panes matched', { sourceId, targetId, matched });
    return { matched };
  }

  // ---------------------------------------------------------------------------
  // 9. Match formulas
  // ---------------------------------------------------------------------------

  async matchFormulas(sourceId: string, targetId: string): Promise<{ matched: number }> {
    logger.info('Matching formulas', { sourceId, targetId });
    const sourceStructure = await this.extractStructure(sourceId);
    const targetWorkbook = await this.loadWorkbook(targetId);
    const targetJson = ((targetWorkbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const targetSheets = this.getSheetsArray(targetJson);

    let matched = 0;
    for (const srcSheet of sourceStructure.sheets) {
      const tgtSheet = targetSheets.find((s: SheetData) => s.name === srcSheet.name);
      if (tgtSheet) {
        if (!tgtSheet.cells) tgtSheet.cells = {};
        for (const f of srcSheet.formulas) {
          if (!tgtSheet.cells[f.cell]) {
            tgtSheet.cells[f.cell] = {};
          }
          tgtSheet.cells[f.cell].formula = f.formula;
          matched++;
        }
      }
    }

    targetJson.sheets = targetSheets;
    await this.saveWorkbook(targetId, targetJson);
    logger.info('Formulas matched', { sourceId, targetId, matched });
    return { matched };
  }

  // ---------------------------------------------------------------------------
  // 10. Match named ranges
  // ---------------------------------------------------------------------------

  async matchNamedRanges(sourceId: string, targetId: string): Promise<{ matched: number }> {
    logger.info('Matching named ranges', { sourceId, targetId });
    const sourceStructure = await this.extractStructure(sourceId);
    const targetWorkbook = await this.loadWorkbook(targetId);
    const targetJson = ((targetWorkbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const targetSheets = this.getSheetsArray(targetJson);

    let matched = 0;
    for (const srcSheet of sourceStructure.sheets) {
      const tgtSheet = targetSheets.find((s: SheetData) => s.name === srcSheet.name);
      if (tgtSheet) {
        tgtSheet.namedRanges = srcSheet.namedRanges.map((nr) => ({ ...nr }));
        matched += srcSheet.namedRanges.length;
      }
    }

    targetJson.sheets = targetSheets;
    await this.saveWorkbook(targetId, targetJson);
    logger.info('Named ranges matched', { sourceId, targetId, matched });
    return { matched };
  }

  // ---------------------------------------------------------------------------
  // 11. Match conditional formats
  // ---------------------------------------------------------------------------

  async matchConditionalFormats(sourceId: string, targetId: string): Promise<{ matched: number }> {
    logger.info('Matching conditional formats', { sourceId, targetId });
    const sourceStructure = await this.extractStructure(sourceId);
    const targetWorkbook = await this.loadWorkbook(targetId);
    const targetJson = ((targetWorkbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const targetSheets = this.getSheetsArray(targetJson);

    let matched = 0;
    for (const srcSheet of sourceStructure.sheets) {
      const tgtSheet = targetSheets.find((s: SheetData) => s.name === srcSheet.name);
      if (tgtSheet) {
        tgtSheet.conditionalFormats = srcSheet.conditionalFormats.map((cf) => ({
          range: cf.range,
          rules: [...cf.rules],
        }));
        matched += srcSheet.conditionalFormats.length;
      }
    }

    targetJson.sheets = targetSheets;
    await this.saveWorkbook(targetId, targetJson);
    logger.info('Conditional formats matched', { sourceId, targetId, matched });
    return { matched };
  }

  // ---------------------------------------------------------------------------
  // 12. Match hidden states
  // ---------------------------------------------------------------------------

  async matchHiddenStates(sourceId: string, targetId: string): Promise<{ matched: number }> {
    logger.info('Matching hidden states', { sourceId, targetId });
    const sourceDimensions = await this.extractDimensions(sourceId);
    const targetWorkbook = await this.loadWorkbook(targetId);
    const targetJson = ((targetWorkbook as WorkbookRecord).sheetsJson ?? {}) as SheetsJson;
    const targetSheets = this.getSheetsArray(targetJson);

    let matched = 0;
    for (const srcSheet of sourceDimensions.sheets) {
      const tgtSheet = targetSheets.find((s: SheetData) => s.name === srcSheet.name);
      if (tgtSheet) {
        tgtSheet.hiddenRows = [...srcSheet.hiddenRows];
        tgtSheet.hiddenCols = [...srcSheet.hiddenCols];
        matched += srcSheet.hiddenRows.length + srcSheet.hiddenCols.length;
      }
    }

    targetJson.sheets = targetSheets;
    await this.saveWorkbook(targetId, targetJson);
    logger.info('Hidden states matched', { sourceId, targetId, matched });
    return { matched };
  }

  // ---------------------------------------------------------------------------
  // 13. Replicate workbook
  // ---------------------------------------------------------------------------

  async replicateWorkbook(sourceId: string): Promise<ReplicationResult> {
    logger.info('Replicating workbook', { sourceId });
    const { prisma } = await import('../utils/prisma.js');

    const sourceWorkbook = await this.loadWorkbook(sourceId);
    const sourceJson = (sourceWorkbook as WorkbookRecord).sheetsJson ?? {};
    const sourceFormulas = (sourceWorkbook as WorkbookRecord).formulasJson ?? {};

    // Deep clone the JSON payloads
    const clonedSheetsJson = JSON.parse(JSON.stringify(sourceJson));
    const clonedFormulasJson = JSON.parse(JSON.stringify(sourceFormulas));

    const newWorkbook = await prisma.workbook.create({
      data: {
        tenantId: (sourceWorkbook as WorkbookRecord).tenantId,
        datasetId: (sourceWorkbook as WorkbookRecord).datasetId ?? null,
        name: `${(sourceWorkbook as WorkbookRecord).name} (Copy)`,
        sheetsJson: clonedSheetsJson,
        formulasJson: clonedFormulasJson,
        createdBy: (sourceWorkbook as WorkbookRecord).createdBy,
      },
    });

    // Tally what was replicated
    const sheetsArray = this.getSheetsArray(clonedSheetsJson);
    let formulaCount = 0;
    let formatCount = 0;
    const warnings: string[] = [];

    for (const sheet of sheetsArray) {
      const cells = sheet.cells ?? {};
      for (const cellObj of Object.values(cells)) {
        const c = cellObj as CellData;
        if (c?.formula) formulaCount++;
        if (c?.format || c?.style) formatCount++;
      }
      if (Array.isArray(sheet.conditionalFormats)) {
        formatCount += sheet.conditionalFormats.length;
      }
    }

    // Warn about external references that may not resolve in the clone
    for (const sheet of sheetsArray) {
      const cells = sheet.cells ?? {};
      for (const [addr, cellObj] of Object.entries(cells)) {
        const c = cellObj as CellData;
        if (c?.formula && /\[.*\]/.test(c.formula)) {
          warnings.push(`Sheet "${sheet.name}" cell ${addr}: external reference in formula may not resolve in clone`);
        }
      }
    }

    const result: ReplicationResult = {
      sourceId,
      targetId: newWorkbook.id,
      replicatedSheets: sheetsArray.length,
      replicatedFormulas: formulaCount,
      replicatedFormats: formatCount,
      replicatedDimensions: true,
      warnings,
    };

    logger.info('Workbook replicated', { sourceId, targetId: newWorkbook.id, sheets: sheetsArray.length });
    return result;
  }

  // ---------------------------------------------------------------------------
  // 14. Compare and score
  // ---------------------------------------------------------------------------

  async compareAndScore(sourceId: string, targetId: string): Promise<MatchReport> {
    logger.info('Comparing workbooks', { sourceId, targetId });

    const [srcDim, tgtDim] = await Promise.all([
      this.extractDimensions(sourceId),
      this.extractDimensions(targetId),
    ]);

    const [srcStr, tgtStr] = await Promise.all([
      this.extractStructure(sourceId),
      this.extractStructure(targetId),
    ]);

    const details: MatchDetail[] = [];

    // --- Dimension scoring ---------------------------------------------------
    let dimTotal = 0;
    let dimMatched = 0;

    for (const srcSheet of srcDim.sheets) {
      const tgtSheet = tgtDim.sheets.find((s) => s.name === srcSheet.name);
      if (!tgtSheet) {
        details.push({ category: 'dimensions', item: `Sheet "${srcSheet.name}"`, source: srcSheet.name, target: null, match: false, score: 0 });
        dimTotal += 6; // rowCount, colCount, colWidths, rowHeights, merged, frozen
        continue;
      }

      // Row count
      dimTotal++;
      const rowMatch = srcSheet.rowCount === tgtSheet.rowCount;
      if (rowMatch) dimMatched++;
      details.push({ category: 'dimensions', item: `${srcSheet.name}.rowCount`, source: srcSheet.rowCount, target: tgtSheet.rowCount, match: rowMatch, score: rowMatch ? 100 : 0 });

      // Col count
      dimTotal++;
      const colMatch = srcSheet.colCount === tgtSheet.colCount;
      if (colMatch) dimMatched++;
      details.push({ category: 'dimensions', item: `${srcSheet.name}.colCount`, source: srcSheet.colCount, target: tgtSheet.colCount, match: colMatch, score: colMatch ? 100 : 0 });

      // Column widths
      dimTotal++;
      const cwScore = this.compareRecords(srcSheet.columnWidths, tgtSheet.columnWidths);
      if (cwScore === 100) dimMatched++;
      details.push({ category: 'dimensions', item: `${srcSheet.name}.columnWidths`, source: srcSheet.columnWidths, target: tgtSheet.columnWidths, match: cwScore === 100, score: cwScore });

      // Row heights
      dimTotal++;
      const rhScore = this.compareRecords(srcSheet.rowHeights, tgtSheet.rowHeights);
      if (rhScore === 100) dimMatched++;
      details.push({ category: 'dimensions', item: `${srcSheet.name}.rowHeights`, source: srcSheet.rowHeights, target: tgtSheet.rowHeights, match: rhScore === 100, score: rhScore });

      // Merged cells
      dimTotal++;
      const mcScore = this.compareMergedCells(srcSheet.mergedCells, tgtSheet.mergedCells);
      if (mcScore === 100) dimMatched++;
      details.push({ category: 'dimensions', item: `${srcSheet.name}.mergedCells`, source: srcSheet.mergedCells, target: tgtSheet.mergedCells, match: mcScore === 100, score: mcScore });

      // Frozen pane
      dimTotal++;
      const fpMatch = JSON.stringify(srcSheet.frozenPane ?? null) === JSON.stringify(tgtSheet.frozenPane ?? null);
      if (fpMatch) dimMatched++;
      details.push({ category: 'dimensions', item: `${srcSheet.name}.frozenPane`, source: srcSheet.frozenPane, target: tgtSheet.frozenPane, match: fpMatch, score: fpMatch ? 100 : 0 });
    }

    const dimensionScore = dimTotal > 0 ? Math.round((dimMatched / dimTotal) * 100) : 100;

    // --- Structure scoring ---------------------------------------------------
    let strTotal = 0;
    let strMatched = 0;

    for (const srcSheet of srcStr.sheets) {
      const tgtSheet = tgtStr.sheets.find((s) => s.name === srcSheet.name);
      if (!tgtSheet) {
        details.push({ category: 'structure', item: `Sheet "${srcSheet.name}"`, source: srcSheet.name, target: null, match: false, score: 0 });
        strTotal += 4;
        continue;
      }

      // Named ranges
      strTotal++;
      const nrScore = this.compareArraysByKey(srcSheet.namedRanges, tgtSheet.namedRanges, 'name');
      if (nrScore === 100) strMatched++;
      details.push({ category: 'structure', item: `${srcSheet.name}.namedRanges`, source: srcSheet.namedRanges.length, target: tgtSheet.namedRanges.length, match: nrScore === 100, score: nrScore });

      // Conditional formats
      strTotal++;
      const cfScore = this.compareArraysByKey(srcSheet.conditionalFormats, tgtSheet.conditionalFormats, 'range');
      if (cfScore === 100) strMatched++;
      details.push({ category: 'structure', item: `${srcSheet.name}.conditionalFormats`, source: srcSheet.conditionalFormats.length, target: tgtSheet.conditionalFormats.length, match: cfScore === 100, score: cfScore });

      // Charts
      strTotal++;
      const chScore = this.compareArraysByKey(srcSheet.charts, tgtSheet.charts, 'type');
      if (chScore === 100) strMatched++;
      details.push({ category: 'structure', item: `${srcSheet.name}.charts`, source: srcSheet.charts.length, target: tgtSheet.charts.length, match: chScore === 100, score: chScore });

      // Tables
      strTotal++;
      const tblScore = this.compareArraysByKey(srcSheet.tables, tgtSheet.tables, 'name');
      if (tblScore === 100) strMatched++;
      details.push({ category: 'structure', item: `${srcSheet.name}.tables`, source: srcSheet.tables.length, target: tgtSheet.tables.length, match: tblScore === 100, score: tblScore });
    }

    const structureScore = strTotal > 0 ? Math.round((strMatched / strTotal) * 100) : 100;

    // --- Formula scoring -----------------------------------------------------
    let fmTotal = 0;
    let fmMatched = 0;

    for (const srcSheet of srcStr.sheets) {
      const tgtSheet = tgtStr.sheets.find((s) => s.name === srcSheet.name);
      if (!tgtSheet) {
        fmTotal += srcSheet.formulas.length || 1;
        continue;
      }

      const tgtFormulaMap = new Map(tgtSheet.formulas.map((f) => [f.cell, f.formula]));
      for (const f of srcSheet.formulas) {
        fmTotal++;
        if (tgtFormulaMap.get(f.cell) === f.formula) {
          fmMatched++;
          details.push({ category: 'formulas', item: `${srcSheet.name}.${f.cell}`, source: f.formula, target: f.formula, match: true, score: 100 });
        } else {
          details.push({ category: 'formulas', item: `${srcSheet.name}.${f.cell}`, source: f.formula, target: tgtFormulaMap.get(f.cell) ?? null, match: false, score: 0 });
        }
      }
    }

    const formulaScore = fmTotal > 0 ? Math.round((fmMatched / fmTotal) * 100) : 100;

    // --- Formatting scoring --------------------------------------------------
    // Compare formatting by examining cell styles across both workbooks
    const [srcWb, tgtWb] = await Promise.all([
      this.loadWorkbook(sourceId),
      this.loadWorkbook(targetId),
    ]);
    const srcSheetsArr = this.getSheetsArray(((srcWb as WorkbookRecord).sheetsJson ?? {}) as SheetsJson);
    const tgtSheetsArr = this.getSheetsArray(((tgtWb as WorkbookRecord).sheetsJson ?? {}) as SheetsJson);

    let fmtTotal = 0;
    let fmtMatched = 0;

    for (const srcSheet of srcSheetsArr) {
      const tgtSheet = tgtSheetsArr.find((s: SheetData) => s.name === srcSheet.name);
      if (!tgtSheet) {
        const srcCells = srcSheet.cells ?? {};
        fmtTotal += Object.keys(srcCells).length || 1;
        continue;
      }

      const srcCells = srcSheet.cells ?? {};
      const tgtCells = tgtSheet.cells ?? {};
      for (const [addr, cellObj] of Object.entries(srcCells)) {
        const srcCell = cellObj as CellData;
        const srcStyle = srcCell?.style ?? srcCell?.format ?? null;
        if (srcStyle === null) continue;

        fmtTotal++;
        const tgtCell = tgtCells[addr] as CellData | undefined;
        const tgtStyle = tgtCell?.style ?? tgtCell?.format ?? null;

        const match = JSON.stringify(srcStyle) === JSON.stringify(tgtStyle);
        if (match) fmtMatched++;
        details.push({ category: 'formatting', item: `${srcSheet.name}.${addr}`, source: srcStyle, target: tgtStyle, match, score: match ? 100 : 0 });
      }
    }

    const formattingScore = fmtTotal > 0 ? Math.round((fmtMatched / fmtTotal) * 100) : 100;

    // --- Overall score -------------------------------------------------------
    const overallScore = Math.round(
      (dimensionScore * 0.25) +
      (structureScore * 0.25) +
      (formulaScore * 0.25) +
      (formattingScore * 0.25)
    );

    const report: MatchReport = {
      overallScore,
      dimensionScore,
      structureScore,
      formattingScore,
      formulaScore,
      details,
    };

    logger.info('Comparison complete', { sourceId, targetId, overallScore });
    return report;
  }

  // ---------------------------------------------------------------------------
  // Scoring helpers
  // ---------------------------------------------------------------------------

  private compareRecords(a: Record<number, number>, b: Record<number, number>): number {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    const allKeys = new Set([...aKeys, ...bKeys]);
    if (allKeys.size === 0) return 100;

    let matched = 0;
    for (const key of allKeys) {
      if (a[Number(key)] === b[Number(key)]) matched++;
    }
    return Math.round((matched / allKeys.size) * 100);
  }

  private compareMergedCells(
    a: Array<{ start: string; end: string }>,
    b: Array<{ start: string; end: string }>,
  ): number {
    if (a.length === 0 && b.length === 0) return 100;
    if (a.length === 0 || b.length === 0) return 0;

    const aSet = new Set(a.map((mc) => `${mc.start}:${mc.end}`));
    const bSet = new Set(b.map((mc) => `${mc.start}:${mc.end}`));
    const union = new Set([...aSet, ...bSet]);
    let intersection = 0;
    for (const item of aSet) {
      if (bSet.has(item)) intersection++;
    }
    return Math.round((intersection / union.size) * 100);
  }

  private compareArraysByKey(a: KeyedRecord[], b: KeyedRecord[], key: string): number {
    if (a.length === 0 && b.length === 0) return 100;
    if (a.length === 0 || b.length === 0) return 0;

    const aKeys = new Set(a.map((item) => String(item[key])));
    const bKeys = new Set(b.map((item) => String(item[key])));
    const union = new Set([...aKeys, ...bKeys]);
    let intersection = 0;
    for (const item of aKeys) {
      if (bKeys.has(item)) intersection++;
    }
    return Math.round((intersection / union.size) * 100);
  }
}

export const excelMatchingService = new ExcelMatchingService();
