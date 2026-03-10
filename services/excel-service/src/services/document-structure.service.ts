import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { getThemeConfig } from '../utils/theme-presets.js';
import type { CoverPageConfig, ThemePreset } from '../types/formatting.types.js';

// ─── Internal Types ────────────────────────────────────────────────────

interface SheetData {
  name: string;
  type?: string;
  rows?: unknown[][];
  columns?: string[];
  formulas?: Record<string, string>;
  merges?: string[];
  styles?: Record<string, unknown>;
  hyperlinks?: Record<string, string>;
  [key: string]: unknown;
}

interface SheetsJson {
  sheets: SheetData[];
  _sheetMetadata?: SheetMetadataEntry[];
  [key: string]: unknown;
}

interface SheetMetadataEntry {
  index: number;
  name: string;
  suggestedName?: string;
  [key: string]: unknown;
}

interface SheetSummary {
  name: string;
  type: string;
  rowCount: number;
  columnCount: number;
  formulaCount: number;
}

// ─── Service ───────────────────────────────────────────────────────────

class DocumentStructureService {
  /**
   * Fetch workbook record from the database by ID.
   */
  private async fetchWorkbook(workbookId: string) {
    const { prisma } = await import('../utils/prisma.js');
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }
    return workbook;
  }

  /**
   * Persist updated sheets_json back to the database and bust the cache.
   */
  private async saveAndInvalidate(workbookId: string, sheetsJson: SheetsJson) {
    const { prisma } = await import('../utils/prisma.js');
    const { cacheDel } = await import('../utils/redis.js');

    const updated = await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    return updated;
  }

  /**
   * Safely extract sheets_json from a workbook record, ensuring a valid
   * structure with a sheets array.
   */
  private extractSheetsJson(workbook: Record<string, any>): SheetsJson {
    const raw = (workbook as any).sheetsJson || {} as Record<string, any>;
    const sheetsJson: SheetsJson = {
      ...raw,
      sheets: Array.isArray(raw.sheets) ? raw.sheets : [],
    };
    return sheetsJson;
  }

  // ── 1. Generate Cover Page ───────────────────────────────────────────

  /**
   * Add a cover page as the first sheet (index 0) in the workbook.
   * Populates title, subtitle, author, date, organization from CoverPageConfig.
   * Optionally applies a theme for styling hints.
   */
  async generateCoverPage(workbookId: string, config: CoverPageConfig) {
    logger.info('Generating cover page', { workbookId, title: config.title });

    const workbook = await this.fetchWorkbook(workbookId);
    const sheetsJson = this.extractSheetsJson(workbook);

    const theme = config.theme ? getThemeConfig(config.theme) : null;
    const coverDate = config.date || new Date().toISOString().split('T')[0];

    const coverSheet: SheetData = {
      name: 'Cover',
      type: 'cover',
      rows: [
        [],
        [],
        [null, null, config.title],
        config.subtitle ? [null, null, config.subtitle] : [],
        [],
        config.organization ? [null, null, config.organization] : [],
        [],
        config.author ? [null, null, `Prepared by: ${config.author}`] : [],
        [null, null, `Date: ${coverDate}`],
      ],
      columns: ['A', 'B', 'C'],
      formulas: {},
      styles: {
        title: {
          cell: 'C3',
          font: {
            name: theme?.headerFontFamily ?? 'Calibri',
            size: 28,
            bold: true,
            color: theme?.primaryColor ?? '#1F4E79',
          },
          alignment: { horizontal: 'center', vertical: 'middle' },
        },
        subtitle: config.subtitle
          ? {
              cell: 'C4',
              font: {
                name: theme?.fontFamily ?? 'Calibri',
                size: 18,
                italic: true,
                color: theme?.secondaryColor ?? '#555555',
              },
              alignment: { horizontal: 'center' },
            }
          : undefined,
        organization: config.organization
          ? {
              cell: 'C6',
              font: {
                name: theme?.fontFamily ?? 'Calibri',
                size: 14,
                bold: true,
                color: theme?.accentColor ?? '#333333',
              },
              alignment: { horizontal: 'center' },
            }
          : undefined,
        author: config.author
          ? {
              cell: 'C8',
              font: { name: theme?.fontFamily ?? 'Calibri', size: 12 },
              alignment: { horizontal: 'center' },
            }
          : undefined,
        date: {
          cell: 'C9',
          font: { name: theme?.fontFamily ?? 'Calibri', size: 12 },
          alignment: { horizontal: 'center' },
        },
      },
      merges: ['C3:E3', 'C4:E4', 'C6:E6', 'C8:E8', 'C9:E9'],
      _coverConfig: {
        title: config.title,
        subtitle: config.subtitle ?? null,
        author: config.author ?? null,
        date: coverDate,
        organization: config.organization ?? null,
        logo: config.logo ?? null,
        theme: config.theme ?? null,
      },
    };

    // Remove existing cover sheet if present
    const existingCoverIdx = sheetsJson.sheets.findIndex((s) => s.type === 'cover');
    if (existingCoverIdx !== -1) {
      sheetsJson.sheets.splice(existingCoverIdx, 1);
    }

    // Insert at position 0
    sheetsJson.sheets.unshift(coverSheet);

    await this.saveAndInvalidate(workbookId, sheetsJson);

    logger.info('Cover page generated', { workbookId });
    return {
      success: true,
      sheetName: 'Cover',
      sheetIndex: 0,
      config: coverSheet._coverConfig,
    };
  }

  // ── 2. Generate Summary Page ─────────────────────────────────────────

  /**
   * Analyze every sheet and produce a Summary sheet with row count, column
   * count, and formula count per sheet.
   */
  async generateSummaryPage(workbookId: string) {
    logger.info('Generating summary page', { workbookId });

    const workbook = await this.fetchWorkbook(workbookId);
    const sheetsJson = this.extractSheetsJson(workbook);

    const summaries: SheetSummary[] = sheetsJson.sheets
      .filter((s) => s.type !== 'summary')
      .map((sheet) => {
        const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
        const nonEmptyRows = rows.filter(
          (r) => Array.isArray(r) && r.some((cell) => cell !== null && cell !== undefined && cell !== '')
        );
        const columnCount = rows.reduce((max, r) => {
          if (!Array.isArray(r)) return max;
          return Math.max(max, r.length);
        }, 0);
        const formulaCount = sheet.formulas ? Object.keys(sheet.formulas).length : 0;

        return {
          name: sheet.name,
          type: sheet.type || 'data',
          rowCount: nonEmptyRows.length,
          columnCount,
          formulaCount,
        };
      });

    const totalRows = summaries.reduce((sum, s) => sum + s.rowCount, 0);
    const totalFormulas = summaries.reduce((sum, s) => sum + s.formulaCount, 0);

    const headerRow = ['Sheet Name', 'Type', 'Rows', 'Columns', 'Formulas'];
    const dataRows = summaries.map((s) => [s.name, s.type, s.rowCount, s.columnCount, s.formulaCount]);
    const totalsRow = ['TOTAL', '', totalRows, '', totalFormulas];

    const summarySheet: SheetData = {
      name: 'Summary',
      type: 'summary',
      rows: [headerRow, ...dataRows, [], totalsRow],
      columns: ['A', 'B', 'C', 'D', 'E'],
      formulas: {},
      styles: {
        header: {
          range: 'A1:E1',
          font: { bold: true, size: 12 },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
          fontColor: { argb: 'FFFFFFFF' },
          alignment: { horizontal: 'center' },
        },
        totals: {
          range: `A${dataRows.length + 3}:E${dataRows.length + 3}`,
          font: { bold: true, size: 11 },
          border: { top: { style: 'double' } },
        },
      },
      _summaryData: {
        generatedAt: new Date().toISOString(),
        sheetCount: summaries.length,
        totalRows,
        totalFormulas,
        perSheet: summaries,
      },
    };

    // Replace existing summary or append
    const existingSummaryIdx = sheetsJson.sheets.findIndex((s) => s.type === 'summary');
    if (existingSummaryIdx !== -1) {
      sheetsJson.sheets[existingSummaryIdx] = summarySheet;
    } else {
      sheetsJson.sheets.push(summarySheet);
    }

    await this.saveAndInvalidate(workbookId, sheetsJson);

    logger.info('Summary page generated', {
      workbookId,
      sheetCount: summaries.length,
      totalRows,
      totalFormulas,
    });

    return {
      success: true,
      sheetName: 'Summary',
      sheetIndex: sheetsJson.sheets.findIndex((s) => s.type === 'summary'),
      summary: {
        sheetCount: summaries.length,
        totalRows,
        totalFormulas,
        perSheet: summaries,
      },
    };
  }

  // ── 3. Generate Index Page ───────────────────────────────────────────

  /**
   * Create an Index sheet listing every sheet with a hyperlink to navigate
   * to that sheet.
   */
  async generateIndexPage(workbookId: string) {
    logger.info('Generating index page', { workbookId });

    const workbook = await this.fetchWorkbook(workbookId);
    const sheetsJson = this.extractSheetsJson(workbook);

    const indexableSheets = sheetsJson.sheets.filter((s) => s.type !== 'index');

    const headerRow = ['#', 'Sheet Name', 'Type', 'Rows', 'Link'];
    const dataRows: unknown[][] = [];
    const hyperlinks: Record<string, string> = {};

    indexableSheets.forEach((sheet, idx) => {
      const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
      const nonEmptyRows = rows.filter(
        (r) => Array.isArray(r) && r.some((cell) => cell !== null && cell !== undefined && cell !== '')
      );
      const rowNum = idx + 2; // data starts at row 2 (row 1 = header)

      dataRows.push([idx + 1, sheet.name, sheet.type || 'data', nonEmptyRows.length, `Go to ${sheet.name}`]);

      // Internal hyperlink pointing to cell A1 of the target sheet
      hyperlinks[`E${rowNum}`] = `#'${sheet.name}'!A1`;
    });

    const indexSheet: SheetData = {
      name: 'Index',
      type: 'index',
      rows: [headerRow, ...dataRows],
      columns: ['A', 'B', 'C', 'D', 'E'],
      formulas: {},
      hyperlinks,
      styles: {
        header: {
          range: 'A1:E1',
          font: { bold: true, size: 12 },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
          fontColor: { argb: 'FFFFFFFF' },
          alignment: { horizontal: 'center' },
        },
        links: {
          column: 'E',
          font: { color: { argb: 'FF0563C1' }, underline: true },
        },
      },
      _indexData: {
        generatedAt: new Date().toISOString(),
        sheetCount: indexableSheets.length,
      },
    };

    // Replace existing index or append
    const existingIdx = sheetsJson.sheets.findIndex((s) => s.type === 'index');
    if (existingIdx !== -1) {
      sheetsJson.sheets[existingIdx] = indexSheet;
    } else {
      sheetsJson.sheets.push(indexSheet);
    }

    await this.saveAndInvalidate(workbookId, sheetsJson);

    logger.info('Index page generated', { workbookId, sheetCount: indexableSheets.length });

    return {
      success: true,
      sheetName: 'Index',
      sheetIndex: sheetsJson.sheets.findIndex((s) => s.type === 'index'),
      sheetsIndexed: indexableSheets.length,
      hyperlinks,
    };
  }

  // ── 4. Smart Rename Sheets ───────────────────────────────────────────

  /**
   * Analyze the header row (first non-empty row) of each data sheet and
   * generate a suggested name that reflects its content.
   */
  async smartRenameSheets(workbookId: string) {
    logger.info('Smart renaming sheets', { workbookId });

    const workbook = await this.fetchWorkbook(workbookId);
    const sheetsJson = this.extractSheetsJson(workbook);

    if (!sheetsJson._sheetMetadata) {
      sheetsJson._sheetMetadata = [];
    }

    const suggestions: Array<{ index: number; currentName: string; suggestedName: string }> = [];

    sheetsJson.sheets.forEach((sheet, idx) => {
      // Skip structural sheets – no renaming needed
      if (['cover', 'summary', 'index'].includes(sheet.type ?? '')) {
        return;
      }

      const rows = Array.isArray(sheet.rows) ? sheet.rows : [];

      // Find first non-empty row to use as header
      const headerRow = rows.find(
        (r) => Array.isArray(r) && r.some((cell) => cell !== null && cell !== undefined && cell !== '')
      );

      if (!headerRow || headerRow.length === 0) {
        return;
      }

      const headers = headerRow
        .filter((cell: unknown) => cell !== null && cell !== undefined && cell !== '')
        .map((cell: unknown) => String(cell).trim().toLowerCase());

      const suggestedName = this.deriveName(headers, sheet.name, idx);

      // Update or create metadata entry
      let meta = sheetsJson._sheetMetadata!.find((m) => m.index === idx);
      if (!meta) {
        meta = { index: idx, name: sheet.name };
        sheetsJson._sheetMetadata!.push(meta);
      }
      meta.suggestedName = suggestedName;

      suggestions.push({
        index: idx,
        currentName: sheet.name,
        suggestedName,
      });
    });

    await this.saveAndInvalidate(workbookId, sheetsJson);

    logger.info('Smart rename complete', { workbookId, suggestionsCount: suggestions.length });

    return {
      success: true,
      suggestions,
    };
  }

  /**
   * Derive a human-readable sheet name from header values.
   */
  private deriveName(headers: string[], currentName: string, index: number): string {
    // Map of common header keywords to friendly sheet names
    const keywordMap: Record<string, string> = {
      revenue: 'Revenue',
      sales: 'Sales',
      expense: 'Expenses',
      expenses: 'Expenses',
      cost: 'Costs',
      costs: 'Costs',
      profit: 'Profit & Loss',
      income: 'Income',
      balance: 'Balance Sheet',
      employee: 'Employees',
      employees: 'Employees',
      staff: 'Staff',
      customer: 'Customers',
      customers: 'Customers',
      client: 'Clients',
      clients: 'Clients',
      product: 'Products',
      products: 'Products',
      inventory: 'Inventory',
      order: 'Orders',
      orders: 'Orders',
      invoice: 'Invoices',
      invoices: 'Invoices',
      payment: 'Payments',
      payments: 'Payments',
      transaction: 'Transactions',
      transactions: 'Transactions',
      date: 'Timeline',
      budget: 'Budget',
      forecast: 'Forecast',
      kpi: 'KPI Dashboard',
      metric: 'Metrics',
      metrics: 'Metrics',
      project: 'Projects',
      projects: 'Projects',
      task: 'Tasks',
      tasks: 'Tasks',
    };

    // Check each header against keyword map
    for (const header of headers) {
      for (const [keyword, name] of Object.entries(keywordMap)) {
        if (header.includes(keyword)) {
          return name;
        }
      }
    }

    // Fallback: capitalize up to 3 headers joined
    const meaningful = headers.slice(0, 3).map((h) => h.charAt(0).toUpperCase() + h.slice(1));
    if (meaningful.length > 0) {
      const joined = meaningful.join(' - ');
      // Excel sheet names limited to 31 characters
      return joined.length > 31 ? joined.substring(0, 28) + '...' : joined;
    }

    return currentName;
  }

  // ── 5. Reorder Sheets ────────────────────────────────────────────────

  /**
   * Reorder the sheets array according to the provided order indices.
   * `order` is an array of current indices in the desired new order.
   * e.g. [2, 0, 1] moves sheet at index 2 to position 0, etc.
   */
  async reorderSheets(workbookId: string, order: number[]) {
    logger.info('Reordering sheets', { workbookId, order });

    const workbook = await this.fetchWorkbook(workbookId);
    const sheetsJson = this.extractSheetsJson(workbook);

    const sheetCount = sheetsJson.sheets.length;

    // Validate order array
    if (order.length !== sheetCount) {
      throw new Error(
        `Order array length (${order.length}) does not match sheet count (${sheetCount})`
      );
    }

    const sortedUnique = [...new Set(order)].sort((a, b) => a - b);
    const expected = Array.from({ length: sheetCount }, (_, i) => i);
    if (sortedUnique.length !== sheetCount || !sortedUnique.every((v, i) => v === expected[i])) {
      throw new Error(
        'Order array must be a permutation of sheet indices [0..' + (sheetCount - 1) + ']'
      );
    }

    const originalSheets = [...sheetsJson.sheets];
    sheetsJson.sheets = order.map((idx) => originalSheets[idx]);

    // Also reorder metadata if present
    if (Array.isArray(sheetsJson._sheetMetadata)) {
      const originalMeta = [...sheetsJson._sheetMetadata];
      sheetsJson._sheetMetadata = order.map((oldIdx, newIdx) => {
        const meta = originalMeta.find((m) => m.index === oldIdx);
        if (meta) {
          return { ...meta, index: newIdx };
        }
        return { index: newIdx, name: sheetsJson.sheets[newIdx].name };
      });
    }

    await this.saveAndInvalidate(workbookId, sheetsJson);

    const newOrder = sheetsJson.sheets.map((s, i) => ({ index: i, name: s.name }));
    logger.info('Sheets reordered', { workbookId, newOrder });

    return {
      success: true,
      sheetCount,
      newOrder,
    };
  }

  // ── 6. Remove Empty Sheets ───────────────────────────────────────────

  /**
   * Find and remove sheets that have no data rows and no formulas.
   * Returns the count of removed sheets.
   */
  async removeEmptySheets(workbookId: string) {
    logger.info('Removing empty sheets', { workbookId });

    const workbook = await this.fetchWorkbook(workbookId);
    const sheetsJson = this.extractSheetsJson(workbook);

    const removedSheets: string[] = [];
    const keptSheets: SheetData[] = [];

    for (const sheet of sheetsJson.sheets) {
      const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
      const hasData = rows.some(
        (r) => Array.isArray(r) && r.some((cell) => cell !== null && cell !== undefined && cell !== '')
      );
      const hasFormulas = sheet.formulas && Object.keys(sheet.formulas).length > 0;

      if (!hasData && !hasFormulas) {
        removedSheets.push(sheet.name);
      } else {
        keptSheets.push(sheet);
      }
    }

    // Guard: never remove all sheets – keep at least one
    if (keptSheets.length === 0 && sheetsJson.sheets.length > 0) {
      logger.warn('All sheets are empty; keeping first sheet to avoid empty workbook', { workbookId });
      keptSheets.push(sheetsJson.sheets[0]);
      removedSheets.shift();
    }

    sheetsJson.sheets = keptSheets;

    // Clean up metadata references to removed sheets
    if (Array.isArray(sheetsJson._sheetMetadata)) {
      sheetsJson._sheetMetadata = sheetsJson._sheetMetadata.filter(
        (m) => !removedSheets.includes(m.name)
      );
      // Re-index
      sheetsJson._sheetMetadata.forEach((m, i) => {
        m.index = i;
      });
    }

    await this.saveAndInvalidate(workbookId, sheetsJson);

    logger.info('Empty sheets removed', { workbookId, removedCount: removedSheets.length, removedSheets });

    return {
      success: true,
      removedCount: removedSheets.length,
      removedSheets,
      remainingCount: keptSheets.length,
    };
  }

  // ── 7. Duplicate Sheet ───────────────────────────────────────────────

  /**
   * Deep clone an existing sheet and insert it with a new name.
   */
  async duplicateSheet(workbookId: string, sheetIndex: number, newName: string) {
    logger.info('Duplicating sheet', { workbookId, sheetIndex, newName });

    const workbook = await this.fetchWorkbook(workbookId);
    const sheetsJson = this.extractSheetsJson(workbook);

    if (sheetIndex < 0 || sheetIndex >= sheetsJson.sheets.length) {
      throw new Error(
        `Sheet index ${sheetIndex} out of range [0..${sheetsJson.sheets.length - 1}]`
      );
    }

    // Check for duplicate name
    const nameExists = sheetsJson.sheets.some(
      (s) => s.name.toLowerCase() === newName.toLowerCase()
    );
    if (nameExists) {
      throw new Error(`A sheet with name "${newName}" already exists`);
    }

    // Validate sheet name length (Excel limit: 31 characters)
    if (newName.length > 31) {
      throw new Error('Sheet name must be 31 characters or fewer');
    }

    // Deep clone the source sheet
    const source = sheetsJson.sheets[sheetIndex];
    const cloned: SheetData = JSON.parse(JSON.stringify(source));
    cloned.name = newName;

    // Remove structural type markers – the clone is a regular data sheet
    if (['cover', 'summary', 'index'].includes(cloned.type ?? '')) {
      cloned.type = 'data';
    }

    // Insert immediately after the source sheet
    const insertAt = sheetIndex + 1;
    sheetsJson.sheets.splice(insertAt, 0, cloned);

    // Add metadata entry
    if (Array.isArray(sheetsJson._sheetMetadata)) {
      // Re-index all entries after insert point
      sheetsJson._sheetMetadata.forEach((m) => {
        if (m.index >= insertAt) {
          m.index += 1;
        }
      });
      sheetsJson._sheetMetadata.push({
        index: insertAt,
        name: newName,
      });
    }

    await this.saveAndInvalidate(workbookId, sheetsJson);

    logger.info('Sheet duplicated', { workbookId, sourceSheet: source.name, newSheet: newName, insertAt });

    return {
      success: true,
      sourceSheet: source.name,
      newSheet: newName,
      newSheetIndex: insertAt,
      totalSheets: sheetsJson.sheets.length,
    };
  }
}

export const documentStructureService = new DocumentStructureService();
