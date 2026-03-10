import ExcelJS from 'exceljs';
import { prisma } from '../utils/prisma';
import { cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';

interface NumberDateFormat {
  numFmt?: string;
  dateFormat?: string;
}

interface CellStyle {
  font?: {
    name?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
    color?: { argb?: string; theme?: number };
  };
  fill?: {
    type?: string;
    fgColor?: { argb?: string; theme?: number };
    bgColor?: { argb?: string; theme?: number };
    pattern?: string;
  };
  border?: {
    top?: { style?: string; color?: { argb?: string } };
    left?: { style?: string; color?: { argb?: string } };
    bottom?: { style?: string; color?: { argb?: string } };
    right?: { style?: string; color?: { argb?: string } };
  };
  alignment?: {
    horizontal?: string;
    vertical?: string;
    wrapText?: boolean;
    textRotation?: number;
    indent?: number;
    shrinkToFit?: boolean;
  };
}

interface ConditionalRuleStyle {
  font?: Record<string, unknown>;
  fill?: Record<string, unknown>;
  border?: Record<string, unknown>;
}

interface ConditionalRule {
  type: string;
  operator: string;
  value: unknown;
  style: ConditionalRuleStyle;
}

interface ChartConfig {
  type?: string;
  dataRange?: string;
  title?: string;
  position?: { row: number; col: number };
  series?: unknown[];
  xAxis?: Record<string, unknown>;
  yAxis?: Record<string, unknown>;
  legend?: boolean;
  width?: number;
  height?: number;
}

interface PageMargins {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  header?: number;
  footer?: number;
}

interface PageSetupConfig {
  orientation?: string;
  paperSize?: number;
  margins?: PageMargins;
}

interface PageSetupResult {
  orientation: string;
  paperSize: number;
  margins: PageMargins | null;
}

interface ConditionalFormatRule {
  ref?: string;
  priority?: number;
  type?: string;
  operator?: string;
  formulae?: unknown[];
  text?: string;
  rank?: unknown;
  cfvo?: Array<{ type: string; value?: number }>;
  color?: Array<{ argb: string }>;
  style?: ConditionalRuleStyle;
}

interface ExcelWorkbookMetadata {
  charts?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface DataValidationConfig {
  type: string;
  values?: string[];
  min?: number;
  max?: number;
}

export class FormattingService {
  /**
   * Apply number/date format to a range of cells in the workbook.
   */
  async setCellFormat(
    workbookId: string,
    sheet: number,
    range: string,
    format: NumberDateFormat
  ): Promise<{ formatted: boolean; range: string; appliedFormat: string }> {
    logger.info('Setting cell format', { workbookId, sheet, range, format });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);

    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet ${sheet} not found in workbook ${workbookId}`);
    }

    const parsedRange = this.parseRange(range);
    let appliedFormat = '';

    if (format.dateFormat) {
      const dateFormatMap: Record<string, string> = {
        'short': 'MM/DD/YYYY',
        'long': 'MMMM DD, YYYY',
        'iso': 'YYYY-MM-DD',
        'time': 'HH:mm:ss',
        'datetime': 'MM/DD/YYYY HH:mm:ss',
        'european': 'DD/MM/YYYY',
      };
      appliedFormat = dateFormatMap[format.dateFormat] || format.dateFormat;
    } else if (format.numFmt) {
      appliedFormat = format.numFmt;
    } else {
      appliedFormat = 'General';
    }

    for (let r = parsedRange.startRow; r <= parsedRange.endRow; r++) {
      for (let c = parsedRange.startCol; c <= parsedRange.endCol; c++) {
        const cell = worksheet.getCell(r, c);
        cell.numFmt = appliedFormat;
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Cell format applied', { workbookId, sheet, range, appliedFormat });
    return { formatted: true, range, appliedFormat };
  }

  /**
   * Apply font, color, borders, fill, and alignment styles to a range of cells.
   */
  async setCellStyle(
    workbookId: string,
    sheet: number,
    range: string,
    style: CellStyle
  ): Promise<{ styled: boolean; range: string; appliedProperties: string[] }> {
    logger.info('Setting cell style', { workbookId, sheet, range });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);

    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet ${sheet} not found in workbook ${workbookId}`);
    }

    const parsedRange = this.parseRange(range);
    const appliedProperties: string[] = [];

    for (let r = parsedRange.startRow; r <= parsedRange.endRow; r++) {
      for (let c = parsedRange.startCol; c <= parsedRange.endCol; c++) {
        const cell = worksheet.getCell(r, c);

        if (style.font) {
          const fontObj: Partial<ExcelJS.Font> = {};
          if (style.font.name) fontObj.name = style.font.name;
          if (style.font.size) fontObj.size = style.font.size;
          if (style.font.bold !== undefined) fontObj.bold = style.font.bold;
          if (style.font.italic !== undefined) fontObj.italic = style.font.italic;
          if (style.font.underline !== undefined) fontObj.underline = style.font.underline;
          if (style.font.strike !== undefined) fontObj.strike = style.font.strike;
          if (style.font.color) fontObj.color = style.font.color as Partial<ExcelJS.Color>;
          cell.font = { ...(cell.font || {}), ...fontObj };
          if (!appliedProperties.includes('font')) appliedProperties.push('font');
        }

        if (style.fill) {
          const fillObj: Partial<ExcelJS.FillPattern> = {
            type: 'pattern',
            pattern: (style.fill.pattern || 'solid') as ExcelJS.FillPatterns,
          };
          if (style.fill.fgColor) fillObj.fgColor = style.fill.fgColor as Partial<ExcelJS.Color>;
          if (style.fill.bgColor) fillObj.bgColor = style.fill.bgColor as Partial<ExcelJS.Color>;
          cell.fill = fillObj as ExcelJS.Fill;
          if (!appliedProperties.includes('fill')) appliedProperties.push('fill');
        }

        if (style.border) {
          const borderObj: Partial<ExcelJS.Borders> = {};
          if (style.border.top) borderObj.top = style.border.top as Partial<ExcelJS.Border>;
          if (style.border.left) borderObj.left = style.border.left as Partial<ExcelJS.Border>;
          if (style.border.bottom) borderObj.bottom = style.border.bottom as Partial<ExcelJS.Border>;
          if (style.border.right) borderObj.right = style.border.right as Partial<ExcelJS.Border>;
          cell.border = { ...(cell.border || {}), ...borderObj };
          if (!appliedProperties.includes('border')) appliedProperties.push('border');
        }

        if (style.alignment) {
          const alignObj: Partial<ExcelJS.Alignment> = {};
          if (style.alignment.horizontal) alignObj.horizontal = style.alignment.horizontal as ExcelJS.Alignment['horizontal'];
          if (style.alignment.vertical) alignObj.vertical = style.alignment.vertical as ExcelJS.Alignment['vertical'];
          if (style.alignment.wrapText !== undefined) alignObj.wrapText = style.alignment.wrapText;
          if (style.alignment.textRotation !== undefined) alignObj.textRotation = style.alignment.textRotation;
          if (style.alignment.indent !== undefined) alignObj.indent = style.alignment.indent;
          if (style.alignment.shrinkToFit !== undefined) alignObj.shrinkToFit = style.alignment.shrinkToFit;
          cell.alignment = { ...(cell.alignment || {}), ...alignObj };
          if (!appliedProperties.includes('alignment')) appliedProperties.push('alignment');
        }
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Cell style applied', { workbookId, sheet, range, appliedProperties });
    return { styled: true, range, appliedProperties };
  }

  /**
   * Set conditional formatting rules on a range of cells.
   */
  async setConditionalFormat(
    workbookId: string,
    sheet: number,
    range: string,
    rules: ConditionalRule[]
  ): Promise<{ applied: boolean; range: string; ruleCount: number }> {
    logger.info('Setting conditional format', { workbookId, sheet, range, ruleCount: rules.length });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);

    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet ${sheet} not found in workbook ${workbookId}`);
    }

    const cfRules: ConditionalFormatRule[] = [];

    for (const rule of rules) {
      const cfRule: ConditionalFormatRule = {
        ref: range,
        priority: cfRules.length + 1,
      };

      switch (rule.type.toLowerCase()) {
        case 'cellvalue':
        case 'cellis':
          cfRule.type = 'cellIs';
          cfRule.operator = this.mapOperator(rule.operator);
          cfRule.formulae = [rule.value];
          break;
        case 'text':
        case 'containstext':
          cfRule.type = 'containsText';
          cfRule.text = String(rule.value);
          break;
        case 'top10':
          cfRule.type = 'top10';
          cfRule.rank = rule.value || 10;
          break;
        case 'aboveaverage':
          cfRule.type = 'aboveAverage';
          break;
        case 'colorscale':
          cfRule.type = 'colorScale';
          cfRule.cfvo = [
            { type: 'min' },
            { type: 'percentile', value: 50 },
            { type: 'max' },
          ];
          cfRule.color = [
            { argb: 'FFF8696B' },
            { argb: 'FFFFEB84' },
            { argb: 'FF63BE7B' },
          ];
          break;
        default:
          cfRule.type = 'cellIs';
          cfRule.operator = 'greaterThan';
          cfRule.formulae = [rule.value || 0];
      }

      if (rule.style) {
        cfRule.style = {};
        if (rule.style.font) cfRule.style.font = rule.style.font;
        if (rule.style.fill) cfRule.style.fill = rule.style.fill;
        if (rule.style.border) cfRule.style.border = rule.style.border;
      }

      cfRules.push(cfRule);
    }

    worksheet.addConditionalFormatting({ ref: range, rules: cfRules as any });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Conditional format applied', { workbookId, sheet, range, ruleCount: cfRules.length });
    return { applied: true, range, ruleCount: cfRules.length };
  }

  /**
   * Set data validation (dropdowns, number ranges, etc.) on a range of cells.
   */
  async setDataValidation(
    workbookId: string,
    sheet: number,
    range: string,
    validation: DataValidationConfig
  ): Promise<{ applied: boolean; range: string; validationType: string }> {
    logger.info('Setting data validation', { workbookId, sheet, range, validation });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);

    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet ${sheet} not found in workbook ${workbookId}`);
    }

    const parsedRange = this.parseRange(range);

    for (let r = parsedRange.startRow; r <= parsedRange.endRow; r++) {
      for (let c = parsedRange.startCol; c <= parsedRange.endCol; c++) {
        const cell = worksheet.getCell(r, c);
        const dv: Partial<ExcelJS.DataValidation> = {
          showErrorMessage: true,
          errorTitle: 'Invalid Input',
          error: `Value does not meet ${validation.type} validation criteria`,
          showInputMessage: true,
          promptTitle: 'Input Required',
        };

        switch (validation.type.toLowerCase()) {
          case 'list':
          case 'dropdown':
            dv.type = 'list';
            dv.formulae = ['"' + (validation.values || []).join(',') + '"'];
            dv.prompt = `Select from: ${(validation.values || []).join(', ')}`;
            break;
          case 'whole':
          case 'integer':
            dv.type = 'whole';
            dv.operator = 'between';
            dv.formulae = [validation.min ?? 0, validation.max ?? 999999];
            dv.prompt = `Enter whole number between ${validation.min ?? 0} and ${validation.max ?? 999999}`;
            break;
          case 'decimal':
          case 'number':
            dv.type = 'decimal';
            dv.operator = 'between';
            dv.formulae = [validation.min ?? 0, validation.max ?? 999999.99];
            dv.prompt = `Enter number between ${validation.min ?? 0} and ${validation.max ?? 999999.99}`;
            break;
          case 'date':
            dv.type = 'date';
            dv.operator = 'between';
            dv.formulae = [new Date(validation.min || 0), new Date(validation.max || Date.now() + 365 * 86400000)];
            dv.prompt = 'Enter a valid date';
            break;
          case 'textlength':
            dv.type = 'textLength';
            dv.operator = 'between';
            dv.formulae = [validation.min ?? 0, validation.max ?? 255];
            dv.prompt = `Text length between ${validation.min ?? 0} and ${validation.max ?? 255}`;
            break;
          default:
            dv.type = 'list';
            dv.formulae = ['"' + (validation.values || ['Yes', 'No']).join(',') + '"'];
            dv.prompt = 'Select a value';
        }

        cell.dataValidation = dv as any;
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Data validation applied', { workbookId, sheet, range, type: validation.type });
    return { applied: true, range, validationType: validation.type };
  }

  /**
   * Add an embedded chart to the worksheet.
   * ExcelJS supports image embedding; we store chart config as metadata
   * and add a fallback image for the chart position.
   */
  async addChart(
    workbookId: string,
    sheet: number,
    chartConfig: ChartConfig
  ): Promise<{ added: boolean; chartType: string; dataRange: string }> {
    logger.info('Adding chart', { workbookId, sheet, chartConfig });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);

    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet ${sheet} not found in workbook ${workbookId}`);
    }

    const chartType = chartConfig.type || 'bar';
    const dataRange = chartConfig.dataRange || 'A1:B10';
    const title = chartConfig.title || 'Chart';
    const position = chartConfig.position || { row: 1, col: 6 };

    const chartMetadata = {
      type: chartType,
      dataRange: dataRange,
      title: title,
      position: position,
      series: chartConfig.series || [],
      xAxis: chartConfig.xAxis || { title: 'X Axis' },
      yAxis: chartConfig.yAxis || { title: 'Y Axis' },
      legend: chartConfig.legend !== undefined ? chartConfig.legend : true,
      width: chartConfig.width || 600,
      height: chartConfig.height || 400,
      createdAt: new Date().toISOString(),
    };

    const existingMetadata: ExcelWorkbookMetadata = record.metadata ? JSON.parse(record.metadata as string) : {};
    if (!existingMetadata.charts) {
      existingMetadata.charts = [];
    }
    existingMetadata.charts.push({ sheet, ...chartMetadata });

    const imageBuffer = this.generateChartFallbackImage();
    const imageId = workbook.addImage({
      buffer: imageBuffer,
      extension: 'png',
    } as any);

    worksheet.addImage(imageId, {
      tl: { col: position.col - 1, row: position.row - 1 },
      ext: { width: chartMetadata.width, height: chartMetadata.height },
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: {
        fileData: buffer,
        fileSize: buffer.length,
        metadata: JSON.stringify(existingMetadata),
        updatedAt: new Date(),
      },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Chart added', { workbookId, sheet, chartType, dataRange });
    return { added: true, chartType, dataRange };
  }

  /**
   * Set page setup / print settings for a worksheet.
   */
  async setPageSetup(
    workbookId: string,
    sheet: number,
    setup: PageSetupConfig
  ): Promise<{ applied: boolean; settings: PageSetupResult }> {
    logger.info('Setting page setup', { workbookId, sheet, setup });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);

    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet ${sheet} not found in workbook ${workbookId}`);
    }

    const pageSetup: Partial<ExcelJS.PageSetup> = {};

    if (setup.orientation) {
      pageSetup.orientation = setup.orientation === 'landscape' ? 'landscape' : 'portrait';
    }
    if (setup.paperSize !== undefined) {
      pageSetup.paperSize = setup.paperSize;
    }
    pageSetup.fitToPage = true;
    pageSetup.fitToWidth = 1;
    pageSetup.fitToHeight = 0;

    worksheet.pageSetup = { ...worksheet.pageSetup, ...pageSetup } as ExcelJS.PageSetup;

    if (setup.margins) {
      const margins: Partial<ExcelJS.Margins> = {};
      if (setup.margins.top !== undefined) margins.top = setup.margins.top;
      if (setup.margins.bottom !== undefined) margins.bottom = setup.margins.bottom;
      if (setup.margins.left !== undefined) margins.left = setup.margins.left;
      if (setup.margins.right !== undefined) margins.right = setup.margins.right;
      if (setup.margins.header !== undefined) margins.header = setup.margins.header;
      if (setup.margins.footer !== undefined) margins.footer = setup.margins.footer;
      worksheet.pageSetup.margins = { ...(worksheet.pageSetup.margins || {}), ...margins } as ExcelJS.Margins;
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    const appliedSettings = {
      orientation: pageSetup.orientation || 'portrait',
      paperSize: pageSetup.paperSize || 9,
      margins: setup.margins || null,
    };
    logger.info('Page setup applied', { workbookId, sheet, settings: appliedSettings });
    return { applied: true, settings: appliedSettings };
  }

  /**
   * Generate a minimal 1x1 transparent PNG image as chart fallback.
   */
  private generateChartFallbackImage(): any {
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9C, 0x62, 0x00, 0x00, 0x00, 0x02,
      0x00, 0x01, 0xE5, 0x27, 0xDE, 0xFC, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42,
      0x60, 0x82,
    ]);
    return pngHeader;
  }

  /**
   * Map operator string to ExcelJS conditional formatting operator.
   */
  private mapOperator(op: string): string {
    const map: Record<string, string> = {
      'equals': 'equal',
      '=': 'equal',
      '==': 'equal',
      'notEqual': 'notEqual',
      '!=': 'notEqual',
      '<>': 'notEqual',
      'greaterThan': 'greaterThan',
      '>': 'greaterThan',
      'lessThan': 'lessThan',
      '<': 'lessThan',
      'greaterThanOrEqual': 'greaterThanOrEqual',
      '>=': 'greaterThanOrEqual',
      'lessThanOrEqual': 'lessThanOrEqual',
      '<=': 'lessThanOrEqual',
      'between': 'between',
      'notBetween': 'notBetween',
    };
    return map[op] || 'equal';
  }

  /**
   * Parse a range string like "A1:C5" into row/col coordinates.
   */
  private parseRange(range: string): { startRow: number; startCol: number; endRow: number; endCol: number } {
    const parts = range.split(':');
    const start = this.parseCellAddress(parts[0].trim());
    const end = parts.length > 1 ? this.parseCellAddress(parts[1].trim()) : start;
    return {
      startRow: start.row,
      startCol: start.col,
      endRow: end.row,
      endCol: end.col,
    };
  }

  private parseCellAddress(addr: string): { row: number; col: number } {
    const match = addr.match(/^([A-Z]+)(\d+)$/i);
    if (!match) {
      throw new Error(`Invalid cell address: ${addr}`);
    }
    const letters = match[1].toUpperCase();
    let col = 0;
    for (let i = 0; i < letters.length; i++) {
      col = col * 26 + (letters.charCodeAt(i) - 64);
    }
    return { row: parseInt(match[2], 10), col };
  }
}

export const formattingService = new FormattingService();
