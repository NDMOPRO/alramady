import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { getThemeConfig, getAllThemes } from '../utils/theme-presets.js';
import type {
  ProfessionalFormatOptions,
  ThemePreset,
  ThemeConfig,
  BrandConfig,
  AccessibilityReport,
  AccessibilityIssue,
  ConditionalFormatRule,
  DesignConstraints,
  DesignValidationResult,
} from '../types/formatting.types.js';

// ── Font preset definitions ─────────────────────────────────────────────────
const FONT_PRESETS: Record<string, { headerFont: string; bodyFont: string; headerSize: number; bodySize: number }> = {
  'classic': { headerFont: 'Times New Roman', bodyFont: 'Times New Roman', headerSize: 13, bodySize: 11 },
  'modern': { headerFont: 'Segoe UI', bodyFont: 'Segoe UI', headerSize: 12, bodySize: 11 },
  'clean': { headerFont: 'Calibri', bodyFont: 'Calibri', headerSize: 12, bodySize: 11 },
  'mono': { headerFont: 'Consolas', bodyFont: 'Consolas', headerSize: 12, bodySize: 11 },
  'elegant': { headerFont: 'Garamond', bodyFont: 'Garamond', headerSize: 13, bodySize: 11 },
  'sans': { headerFont: 'Arial', bodyFont: 'Arial', headerSize: 12, bodySize: 11 },
};

// ── Color palette definitions ───────────────────────────────────────────────
const COLOR_PALETTES: Record<string, { primary: string; secondary: string; accent: string; headerBg: string; headerFg: string; borderColor: string }> = {
  'blue': { primary: '#1F4E79', secondary: '#2E75B6', accent: '#BDD7EE', headerBg: '#1F4E79', headerFg: '#FFFFFF', borderColor: '#8DB4E2' },
  'green': { primary: '#2E7D32', secondary: '#4CAF50', accent: '#C8E6C9', headerBg: '#2E7D32', headerFg: '#FFFFFF', borderColor: '#A5D6A7' },
  'red': { primary: '#B71C1C', secondary: '#E53935', accent: '#FFCDD2', headerBg: '#B71C1C', headerFg: '#FFFFFF', borderColor: '#EF9A9A' },
  'gray': { primary: '#424242', secondary: '#757575', accent: '#E0E0E0', headerBg: '#424242', headerFg: '#FFFFFF', borderColor: '#BDBDBD' },
  'teal': { primary: '#00695C', secondary: '#00897B', accent: '#B2DFDB', headerBg: '#00695C', headerFg: '#FFFFFF', borderColor: '#80CBC4' },
  'purple': { primary: '#4A148C', secondary: '#7B1FA2', accent: '#E1BEE7', headerBg: '#4A148C', headerFg: '#FFFFFF', borderColor: '#CE93D8' },
  'orange': { primary: '#E65100', secondary: '#FB8C00', accent: '#FFE0B2', headerBg: '#E65100', headerFg: '#FFFFFF', borderColor: '#FFCC80' },
  'neutral': { primary: '#212121', secondary: '#616161', accent: '#F5F5F5', headerBg: '#FAFAFA', headerFg: '#212121', borderColor: '#E0E0E0' },
};

// ── WCAG contrast helpers ───────────────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  return {
    r: parseInt(cleaned.substring(0, 2), 16),
    g: parseInt(cleaned.substring(2, 4), 16),
    b: parseInt(cleaned.substring(4, 6), 16),
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── Service ─────────────────────────────────────────────────────────────────
class ProfessionalFormattingService {

  // ── helpers ───────────────────────────────────────────────────────────────

  private async getWorkbook(workbookId: string) {
    const { prisma } = await import('../utils/prisma.js');
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }
    return workbook;
  }

  private getSheetsJson(workbook: Record<string, any>): Record<string, any>[] {
    if (Array.isArray(workbook.sheetsJson)) return workbook.sheetsJson as Record<string, any>[];
    if (typeof workbook.sheetsJson === 'string') return JSON.parse(workbook.sheetsJson);
    return [];
  }

  private findSheet(sheets: Record<string, any>[], sheetName: string): Record<string, any> {
    const sheet = sheets.find((s: Record<string, any>) => s.name === sheetName);
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found in workbook`);
    }
    return sheet;
  }

  private ensureFormatting(sheet: Record<string, any>): Record<string, any> {
    if (!sheet._formatting) {
      sheet._formatting = {};
    }
    return sheet._formatting as Record<string, any>;
  }

  private async persistSheets(workbookId: string, sheetsJson: Record<string, any>[]): Promise<void> {
    const { prisma } = await import('../utils/prisma.js');
    const { cacheDel } = await import('../utils/redis.js');

    await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await cacheDel(`workbook:${workbookId}:*`);
  }

  // ── 1. applyProfessionalFormat ────────────────────────────────────────────

  async applyProfessionalFormat(workbookId: string, options: ProfessionalFormatOptions) {
    logger.info('Applying professional format', { workbookId, options });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);

    if (sheets.length === 0) {
      throw new Error('Workbook has no sheets');
    }

    // Determine theme config
    const themePreset = options.theme || 'corporate-blue';
    const themeConfig = getThemeConfig(themePreset);

    const appliedFeatures: string[] = [];

    for (const sheet of sheets) {
      const fmt = this.ensureFormatting(sheet);

      // Apply theme
      fmt.theme = {
        preset: themePreset,
        config: themeConfig,
        appliedAt: new Date().toISOString(),
      };
      appliedFeatures.push('theme');

      // Apply brand if provided
      if (options.brand) {
        fmt.brand = {
          name: options.brand.name,
          primaryColor: options.brand.primaryColor,
          secondaryColor: options.brand.secondaryColor,
          accentColor: options.brand.accentColor,
          fontFamily: options.brand.fontFamily,
          headerFontFamily: options.brand.headerFontFamily || options.brand.fontFamily,
          logoUrl: options.brand.logoUrl || null,
          appliedAt: new Date().toISOString(),
        };
        appliedFeatures.push('brand');
      }

      // Auto-freeze header row
      if (options.autoFreezeHeader !== false) {
        fmt.frozenPane = { row: 1, col: 0 };
        appliedFeatures.push('autoFreezeHeader');
      }

      // Auto-filter on first row
      if (options.autoFilter !== false) {
        const colCount = sheet.columnCount || 10;
        const lastColLetter = String.fromCharCode(64 + Math.min(colCount, 26));
        fmt.autoFilter = { range: `A1:${lastColLetter}1` };
        appliedFeatures.push('autoFilter');
      }

      // Alternate row colors
      if (options.alternateRowColors !== false) {
        fmt.alternateRowColors = {
          evenColor: themeConfig.altRowBg,
          oddColor: '#FFFFFF',
          appliedAt: new Date().toISOString(),
        };
        appliedFeatures.push('alternateRowColors');
      }

      // Professional fonts
      if (options.professionalFonts !== false) {
        fmt.fonts = {
          headerFont: themeConfig.headerFontFamily,
          bodyFont: themeConfig.fontFamily,
          headerSize: themeConfig.headerFontSize,
          bodySize: themeConfig.bodyFontSize,
          appliedAt: new Date().toISOString(),
        };
        appliedFeatures.push('professionalFonts');
      }

      // Professional borders
      if (options.professionalBorders !== false) {
        fmt.borders = {
          style: 'thin',
          color: themeConfig.borderColor,
          headerBorderStyle: 'medium',
          headerBorderColor: themeConfig.primaryColor,
          appliedAt: new Date().toISOString(),
        };
        appliedFeatures.push('professionalBorders');
      }

      // Auto-align values
      if (options.autoAlign !== false) {
        fmt.alignment = {
          headers: 'center',
          numbers: 'right',
          text: 'left',
          verticalAlignment: 'middle',
          appliedAt: new Date().toISOString(),
        };
        appliedFeatures.push('autoAlign');
      }

      // Convert to table
      if (options.convertToTable) {
        const rowCount = sheet.rowCount || 1;
        const colCount = sheet.columnCount || 1;
        const lastColLetter = String.fromCharCode(64 + Math.min(colCount, 26));
        fmt.table = {
          name: `Table_${sheet.name.replace(/\s+/g, '_')}`,
          range: `A1:${lastColLetter}${rowCount}`,
          hasHeaders: true,
          style: themePreset,
          appliedAt: new Date().toISOString(),
        };
        appliedFeatures.push('convertToTable');
      }

      // Header styling
      fmt.headerStyle = {
        backgroundColor: themeConfig.headerBg,
        foregroundColor: themeConfig.headerFg,
        fontFamily: themeConfig.headerFontFamily,
        fontSize: themeConfig.headerFontSize,
        bold: true,
        appliedAt: new Date().toISOString(),
      };
    }

    await this.persistSheets(workbookId, sheets);

    const uniqueFeatures = [...new Set(appliedFeatures)];
    logger.info('Professional format applied', { workbookId, features: uniqueFeatures });

    return {
      workbookId,
      sheetsFormatted: sheets.length,
      appliedFeatures: uniqueFeatures,
      theme: themePreset,
      sheetsJson: sheets,
    };
  }

  // ── 2. autoFreezeHeaderRow ────────────────────────────────────────────────

  async autoFreezeHeaderRow(workbookId: string, sheet: string) {
    logger.info('Auto-freezing header row', { workbookId, sheet });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);
    const sheetObj = this.findSheet(sheets, sheet);
    const fmt = this.ensureFormatting(sheetObj);

    fmt.frozenPane = { row: 1, col: 0 };

    await this.persistSheets(workbookId, sheets);

    logger.info('Header row frozen', { workbookId, sheet });
    return { workbookId, sheet, frozenPane: fmt.frozenPane };
  }

  // ── 3. applyProfessionalColors ────────────────────────────────────────────

  async applyProfessionalColors(workbookId: string, sheet: string, palette: string) {
    logger.info('Applying professional colors', { workbookId, sheet, palette });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);
    const sheetObj = this.findSheet(sheets, sheet);
    const fmt = this.ensureFormatting(sheetObj);

    const paletteConfig = COLOR_PALETTES[palette] || COLOR_PALETTES['blue'];

    fmt.colors = {
      palette,
      primary: paletteConfig.primary,
      secondary: paletteConfig.secondary,
      accent: paletteConfig.accent,
      headerBg: paletteConfig.headerBg,
      headerFg: paletteConfig.headerFg,
      borderColor: paletteConfig.borderColor,
      appliedAt: new Date().toISOString(),
    };

    await this.persistSheets(workbookId, sheets);

    logger.info('Professional colors applied', { workbookId, sheet, palette });
    return { workbookId, sheet, palette, colors: fmt.colors };
  }

  // ── 4. applyProfessionalFonts ─────────────────────────────────────────────

  async applyProfessionalFonts(workbookId: string, sheet: string, fontPreset: string) {
    logger.info('Applying professional fonts', { workbookId, sheet, fontPreset });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);
    const sheetObj = this.findSheet(sheets, sheet);
    const fmt = this.ensureFormatting(sheetObj);

    const preset = FONT_PRESETS[fontPreset] || FONT_PRESETS['clean'];

    fmt.fonts = {
      preset: fontPreset,
      headerFont: preset.headerFont,
      bodyFont: preset.bodyFont,
      headerSize: preset.headerSize,
      bodySize: preset.bodySize,
      appliedAt: new Date().toISOString(),
    };

    await this.persistSheets(workbookId, sheets);

    logger.info('Professional fonts applied', { workbookId, sheet, fontPreset });
    return { workbookId, sheet, fontPreset, fonts: fmt.fonts };
  }

  // ── 5. applyProfessionalBorders ───────────────────────────────────────────

  async applyProfessionalBorders(workbookId: string, sheet: string) {
    logger.info('Applying professional borders', { workbookId, sheet });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);
    const sheetObj = this.findSheet(sheets, sheet);
    const fmt = this.ensureFormatting(sheetObj);

    const colors = fmt.colors || {};
    const borderColor = colors.borderColor || '#BDBDBD';
    const headerBorderColor = colors.primary || '#424242';

    fmt.borders = {
      style: 'thin',
      color: borderColor,
      headerBorderStyle: 'medium',
      headerBorderColor,
      outerBorderStyle: 'medium',
      outerBorderColor: borderColor,
      appliedAt: new Date().toISOString(),
    };

    await this.persistSheets(workbookId, sheets);

    logger.info('Professional borders applied', { workbookId, sheet });
    return { workbookId, sheet, borders: fmt.borders };
  }

  // ── 6. autoAlignValues ────────────────────────────────────────────────────

  async autoAlignValues(workbookId: string, sheet: string) {
    logger.info('Auto-aligning values', { workbookId, sheet });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);
    const sheetObj = this.findSheet(sheets, sheet);
    const fmt = this.ensureFormatting(sheetObj);

    fmt.alignment = {
      headers: 'center',
      numbers: 'right',
      text: 'left',
      dates: 'center',
      booleans: 'center',
      verticalAlignment: 'middle',
      wrapText: false,
      appliedAt: new Date().toISOString(),
    };

    await this.persistSheets(workbookId, sheets);

    logger.info('Values auto-aligned', { workbookId, sheet });
    return { workbookId, sheet, alignment: fmt.alignment };
  }

  // ── 7. applyAutoFilters ───────────────────────────────────────────────────

  async applyAutoFilters(workbookId: string, sheet: string, range: string) {
    logger.info('Applying auto-filters', { workbookId, sheet, range });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);
    const sheetObj = this.findSheet(sheets, sheet);
    const fmt = this.ensureFormatting(sheetObj);

    fmt.autoFilter = {
      range,
      appliedAt: new Date().toISOString(),
    };

    await this.persistSheets(workbookId, sheets);

    logger.info('Auto-filters applied', { workbookId, sheet, range });
    return { workbookId, sheet, autoFilter: fmt.autoFilter };
  }

  // ── 8. convertRangeToTable ────────────────────────────────────────────────

  async convertRangeToTable(workbookId: string, sheet: string, range: string, tableName?: string) {
    logger.info('Converting range to table', { workbookId, sheet, range, tableName });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);
    const sheetObj = this.findSheet(sheets, sheet);
    const fmt = this.ensureFormatting(sheetObj);

    const resolvedName = tableName || `Table_${sheet.replace(/\s+/g, '_')}_${Date.now()}`;

    // Initialise table list if absent
    if (!fmt.tables) {
      fmt.tables = [];
    }

    const tableConfig = {
      name: resolvedName,
      range,
      hasHeaders: true,
      showStripes: true,
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: true,
      showColumnStripes: false,
      style: fmt.theme?.preset || 'corporate-blue',
      createdAt: new Date().toISOString(),
    };

    fmt.tables.push(tableConfig);

    // Also set autoFilter to match the table range header row
    const headerRange = range.replace(/(\d+):.*$/, '$1') || range;
    fmt.autoFilter = { range, appliedAt: new Date().toISOString() };

    await this.persistSheets(workbookId, sheets);

    logger.info('Range converted to table', { workbookId, sheet, tableName: resolvedName, range });
    return { workbookId, sheet, table: tableConfig };
  }

  // ── 9. applyTheme ────────────────────────────────────────────────────────

  async applyTheme(workbookId: string, theme: ThemePreset) {
    logger.info('Applying theme', { workbookId, theme });

    const themeConfig = getThemeConfig(theme);
    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);

    for (const sheetObj of sheets) {
      const fmt = this.ensureFormatting(sheetObj);

      fmt.theme = {
        preset: theme,
        config: themeConfig,
        appliedAt: new Date().toISOString(),
      };

      // Propagate theme colours and fonts to dependent sections
      fmt.colors = {
        palette: theme,
        primary: themeConfig.primaryColor,
        secondary: themeConfig.secondaryColor,
        accent: themeConfig.accentColor,
        headerBg: themeConfig.headerBg,
        headerFg: themeConfig.headerFg,
        borderColor: themeConfig.borderColor,
        appliedAt: new Date().toISOString(),
      };

      fmt.fonts = {
        preset: theme,
        headerFont: themeConfig.headerFontFamily,
        bodyFont: themeConfig.fontFamily,
        headerSize: themeConfig.headerFontSize,
        bodySize: themeConfig.bodyFontSize,
        appliedAt: new Date().toISOString(),
      };

      fmt.headerStyle = {
        backgroundColor: themeConfig.headerBg,
        foregroundColor: themeConfig.headerFg,
        fontFamily: themeConfig.headerFontFamily,
        fontSize: themeConfig.headerFontSize,
        bold: true,
        appliedAt: new Date().toISOString(),
      };

      fmt.alternateRowColors = {
        evenColor: themeConfig.altRowBg,
        oddColor: '#FFFFFF',
        appliedAt: new Date().toISOString(),
      };

      fmt.borders = {
        style: 'thin',
        color: themeConfig.borderColor,
        headerBorderStyle: 'medium',
        headerBorderColor: themeConfig.primaryColor,
        appliedAt: new Date().toISOString(),
      };
    }

    await this.persistSheets(workbookId, sheets);

    logger.info('Theme applied', { workbookId, theme });
    return { workbookId, theme, sheetsUpdated: sheets.length, themeConfig };
  }

  // ── 10. applyBrandIdentity ────────────────────────────────────────────────

  async applyBrandIdentity(workbookId: string, brand: BrandConfig) {
    logger.info('Applying brand identity', { workbookId, brand: brand.name });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);

    for (const sheetObj of sheets) {
      const fmt = this.ensureFormatting(sheetObj);

      fmt.brand = {
        name: brand.name,
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor,
        accentColor: brand.accentColor,
        fontFamily: brand.fontFamily,
        headerFontFamily: brand.headerFontFamily || brand.fontFamily,
        logoUrl: brand.logoUrl || null,
        appliedAt: new Date().toISOString(),
      };

      // Override colours and fonts to match brand
      fmt.colors = {
        palette: `brand-${brand.name}`,
        primary: brand.primaryColor,
        secondary: brand.secondaryColor,
        accent: brand.accentColor,
        headerBg: brand.primaryColor,
        headerFg: '#FFFFFF',
        borderColor: brand.secondaryColor,
        appliedAt: new Date().toISOString(),
      };

      fmt.fonts = {
        preset: `brand-${brand.name}`,
        headerFont: brand.headerFontFamily || brand.fontFamily,
        bodyFont: brand.fontFamily,
        headerSize: 12,
        bodySize: 11,
        appliedAt: new Date().toISOString(),
      };

      fmt.headerStyle = {
        backgroundColor: brand.primaryColor,
        foregroundColor: '#FFFFFF',
        fontFamily: brand.headerFontFamily || brand.fontFamily,
        fontSize: 12,
        bold: true,
        appliedAt: new Date().toISOString(),
      };
    }

    await this.persistSheets(workbookId, sheets);

    logger.info('Brand identity applied', { workbookId, brand: brand.name });
    return { workbookId, brand: brand.name, sheetsUpdated: sheets.length };
  }

  // ── 11. extractConditionalFormatting ──────────────────────────────────────

  async extractConditionalFormatting(workbookId: string, sheet: string): Promise<ConditionalFormatRule[]> {
    logger.info('Extracting conditional formatting', { workbookId, sheet });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);
    const sheetObj = this.findSheet(sheets, sheet);
    const fmt = this.ensureFormatting(sheetObj);

    const rules: ConditionalFormatRule[] = fmt.conditionalFormatting || [];

    logger.info('Conditional formatting extracted', { workbookId, sheet, ruleCount: rules.length });
    return rules;
  }

  // ── 12. replicateConditionalFormatting ────────────────────────────────────

  async replicateConditionalFormatting(sourceId: string, targetId: string) {
    logger.info('Replicating conditional formatting', { sourceId, targetId });

    const sourceWorkbook = await this.getWorkbook(sourceId);
    const sourceSheets = this.getSheetsJson(sourceWorkbook);

    const targetWorkbook = await this.getWorkbook(targetId);
    const targetSheets = this.getSheetsJson(targetWorkbook);

    let totalRulesCopied = 0;

    for (const sourceSheet of sourceSheets) {
      const sourceFmt = sourceSheet._formatting || {};
      const sourceRules: ConditionalFormatRule[] = sourceFmt.conditionalFormatting || [];

      if (sourceRules.length === 0) continue;

      // Find matching target sheet by name, or apply to first target sheet
      let targetSheet = targetSheets.find((t: Record<string, any>) => t.name === sourceSheet.name);
      if (!targetSheet && targetSheets.length > 0) {
        targetSheet = targetSheets[0];
      }
      if (!targetSheet) continue;

      const targetFmt = this.ensureFormatting(targetSheet);
      targetFmt.conditionalFormatting = [
        ...(targetFmt.conditionalFormatting || []),
        ...sourceRules.map((rule: ConditionalFormatRule, idx: number) => ({
          ...rule,
          priority: (targetFmt.conditionalFormatting?.length || 0) + idx + 1,
        })),
      ];

      totalRulesCopied += sourceRules.length;
    }

    // Also replicate theme and color settings
    const firstSourceFmt = sourceSheets[0]?._formatting || {};
    if (firstSourceFmt.theme) {
      for (const targetSheet of targetSheets) {
        const targetFmt = this.ensureFormatting(targetSheet);
        if (!targetFmt.theme) {
          targetFmt.theme = { ...firstSourceFmt.theme, appliedAt: new Date().toISOString() };
        }
      }
    }

    await this.persistSheets(targetId, targetSheets);

    logger.info('Conditional formatting replicated', { sourceId, targetId, totalRulesCopied });
    return { sourceId, targetId, totalRulesCopied };
  }

  // ── 13. checkAccessibility ────────────────────────────────────────────────

  async checkAccessibility(workbookId: string): Promise<AccessibilityReport> {
    logger.info('Checking accessibility', { workbookId });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);

    const issues: AccessibilityIssue[] = [];
    const passed: string[] = [];
    let totalChecks = 0;
    let passedChecks = 0;

    for (const sheetObj of sheets) {
      const fmt = sheetObj._formatting || {};
      const sheetName = sheetObj.name || 'Unknown';

      // ── Check 1: Header contrast ratio (WCAG AA requires >= 4.5:1) ──
      totalChecks++;
      if (fmt.headerStyle || fmt.colors) {
        const bg = fmt.headerStyle?.backgroundColor || fmt.colors?.headerBg || '#FFFFFF';
        const fg = fmt.headerStyle?.foregroundColor || fmt.colors?.headerFg || '#000000';
        const ratio = contrastRatio(bg, fg);

        if (ratio >= 4.5) {
          passedChecks++;
          passed.push(`[${sheetName}] Header contrast ratio ${ratio.toFixed(2)}:1 meets WCAG AA`);
        } else if (ratio >= 3) {
          issues.push({
            type: 'warning',
            message: `Header contrast ratio ${ratio.toFixed(2)}:1 is below WCAG AA (4.5:1)`,
            location: `Sheet: ${sheetName} (headers)`,
            suggestion: 'Use a darker background or lighter text colour to improve readability',
          });
        } else {
          issues.push({
            type: 'error',
            message: `Header contrast ratio ${ratio.toFixed(2)}:1 fails WCAG guidelines`,
            location: `Sheet: ${sheetName} (headers)`,
            suggestion: 'Significantly increase contrast between header background and text colours',
          });
        }
      } else {
        passedChecks++;
        passed.push(`[${sheetName}] Default header colours (assumed sufficient contrast)`);
      }

      // ── Check 2: Alternate row contrast ──
      totalChecks++;
      if (fmt.alternateRowColors) {
        const altBg = fmt.alternateRowColors.evenColor || '#F5F5F5';
        const textColor = '#000000'; // assume black body text
        const altRatio = contrastRatio(altBg, textColor);

        if (altRatio >= 4.5) {
          passedChecks++;
          passed.push(`[${sheetName}] Alternate row contrast ${altRatio.toFixed(2)}:1 meets WCAG AA`);
        } else {
          issues.push({
            type: 'warning',
            message: `Alternate row background may reduce text readability (contrast ${altRatio.toFixed(2)}:1)`,
            location: `Sheet: ${sheetName} (alternate rows)`,
            suggestion: 'Use a lighter alternate row colour to maintain text readability',
          });
        }
      } else {
        passedChecks++;
        passed.push(`[${sheetName}] No alternate row colours (no contrast issue)`);
      }

      // ── Check 3: Font size minimums ──
      totalChecks++;
      const bodySize = fmt.fonts?.bodySize || 11;
      const headerSize = fmt.fonts?.headerSize || 12;

      if (bodySize >= 10 && headerSize >= 10) {
        passedChecks++;
        passed.push(`[${sheetName}] Font sizes adequate (body: ${bodySize}pt, header: ${headerSize}pt)`);
      } else {
        issues.push({
          type: 'error',
          message: `Font size too small (body: ${bodySize}pt, header: ${headerSize}pt). Minimum recommended is 10pt`,
          location: `Sheet: ${sheetName}`,
          suggestion: 'Increase font sizes to at least 10pt for body text and 11pt for headers',
        });
      }

      // ── Check 4: Frozen panes for navigation ──
      totalChecks++;
      if (fmt.frozenPane) {
        passedChecks++;
        passed.push(`[${sheetName}] Frozen panes enabled for easier navigation`);
      } else {
        issues.push({
          type: 'info',
          message: 'No frozen panes detected',
          location: `Sheet: ${sheetName}`,
          suggestion: 'Freeze the header row so column labels remain visible while scrolling',
        });
      }

      // ── Check 5: Named tables for screen readers ──
      totalChecks++;
      if (fmt.tables && fmt.tables.length > 0) {
        passedChecks++;
        passed.push(`[${sheetName}] Named tables present (${fmt.tables.length}), improving screen reader support`);
      } else {
        issues.push({
          type: 'info',
          message: 'No named tables found',
          location: `Sheet: ${sheetName}`,
          suggestion: 'Convert data ranges to named tables to improve screen reader navigation',
        });
      }

      // ── Check 6: Border contrast ──
      totalChecks++;
      if (fmt.borders) {
        const borderColor = fmt.borders.color || '#BDBDBD';
        const bgColor = '#FFFFFF';
        const borderRatio = contrastRatio(borderColor, bgColor);

        if (borderRatio >= 1.5) {
          passedChecks++;
          passed.push(`[${sheetName}] Border visibility adequate (contrast ${borderRatio.toFixed(2)}:1)`);
        } else {
          issues.push({
            type: 'warning',
            message: `Borders may not be visible enough (contrast ${borderRatio.toFixed(2)}:1)`,
            location: `Sheet: ${sheetName}`,
            suggestion: 'Use darker border colours for better cell delineation',
          });
        }
      } else {
        passedChecks++;
        passed.push(`[${sheetName}] Default borders (assumed visible)`);
      }
    }

    const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

    const report: AccessibilityReport = { score, issues, passed };

    logger.info('Accessibility check complete', { workbookId, score, issueCount: issues.length });
    return report;
  }

  // ── 14. validateDesignConstraints ─────────────────────────────────────────

  async validateDesignConstraints(workbookId: string, constraints: DesignConstraints): Promise<DesignValidationResult> {
    logger.info('Validating design constraints', { workbookId, constraints });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);

    const violations: Array<{ constraint: string; message: string; severity: 'error' | 'warning' }> = [];

    // Collect all unique colours and fonts across sheets
    const allColors = new Set<string>();
    const allFonts = new Set<string>();
    let minFontFound = Infinity;
    let maxFontFound = 0;
    let hasAlternateRows = false;
    let hasHeaders = false;

    for (const sheetObj of sheets) {
      const fmt = sheetObj._formatting || {};

      // Gather colours
      if (fmt.colors) {
        allColors.add(fmt.colors.primary);
        allColors.add(fmt.colors.secondary);
        allColors.add(fmt.colors.accent);
        allColors.add(fmt.colors.headerBg);
        allColors.add(fmt.colors.headerFg);
        allColors.add(fmt.colors.borderColor);
      }
      if (fmt.alternateRowColors) {
        allColors.add(fmt.alternateRowColors.evenColor);
        allColors.add(fmt.alternateRowColors.oddColor);
        hasAlternateRows = true;
      }

      // Gather fonts
      if (fmt.fonts) {
        allFonts.add(fmt.fonts.headerFont);
        allFonts.add(fmt.fonts.bodyFont);
        minFontFound = Math.min(minFontFound, fmt.fonts.bodySize, fmt.fonts.headerSize);
        maxFontFound = Math.max(maxFontFound, fmt.fonts.bodySize, fmt.fonts.headerSize);
      }

      if (fmt.headerStyle) {
        allFonts.add(fmt.headerStyle.fontFamily);
        hasHeaders = true;
      }

      if (fmt.frozenPane) {
        hasHeaders = true;
      }
    }

    // ── Validate maxColors ──
    if (constraints.maxColors !== undefined && allColors.size > constraints.maxColors) {
      violations.push({
        constraint: 'maxColors',
        message: `Found ${allColors.size} unique colours, limit is ${constraints.maxColors}`,
        severity: 'error',
      });
    }

    // ── Validate maxFonts ──
    if (constraints.maxFonts !== undefined && allFonts.size > constraints.maxFonts) {
      violations.push({
        constraint: 'maxFonts',
        message: `Found ${allFonts.size} unique fonts, limit is ${constraints.maxFonts}`,
        severity: 'error',
      });
    }

    // ── Validate requiredFontFamily ──
    if (constraints.requiredFontFamily) {
      const required = constraints.requiredFontFamily.toLowerCase();
      const hasRequired = [...allFonts].some((f) => f.toLowerCase() === required);
      if (!hasRequired && allFonts.size > 0) {
        violations.push({
          constraint: 'requiredFontFamily',
          message: `Required font "${constraints.requiredFontFamily}" not found. Fonts in use: ${[...allFonts].join(', ')}`,
          severity: 'error',
        });
      }
    }

    // ── Validate requiredColors ──
    if (constraints.requiredColors && constraints.requiredColors.length > 0) {
      for (const reqColor of constraints.requiredColors) {
        const normalised = reqColor.toUpperCase();
        const found = [...allColors].some((c) => c.toUpperCase() === normalised);
        if (!found && allColors.size > 0) {
          violations.push({
            constraint: 'requiredColors',
            message: `Required colour "${reqColor}" not found in workbook`,
            severity: 'warning',
          });
        }
      }
    }

    // ── Validate maxFontSize ──
    if (constraints.maxFontSize !== undefined && maxFontFound > constraints.maxFontSize) {
      violations.push({
        constraint: 'maxFontSize',
        message: `Maximum font size ${maxFontFound}pt exceeds limit of ${constraints.maxFontSize}pt`,
        severity: 'error',
      });
    }

    // ── Validate minFontSize ──
    if (constraints.minFontSize !== undefined && minFontFound < constraints.minFontSize && minFontFound !== Infinity) {
      violations.push({
        constraint: 'minFontSize',
        message: `Minimum font size ${minFontFound}pt is below the required ${constraints.minFontSize}pt`,
        severity: 'error',
      });
    }

    // ── Validate requireAlternateRows ──
    if (constraints.requireAlternateRows && !hasAlternateRows) {
      violations.push({
        constraint: 'requireAlternateRows',
        message: 'Alternate row colours are required but not applied',
        severity: 'warning',
      });
    }

    // ── Validate requireHeaders ──
    if (constraints.requireHeaders && !hasHeaders) {
      violations.push({
        constraint: 'requireHeaders',
        message: 'Header styling or frozen panes required but not found',
        severity: 'warning',
      });
    }

    const result: DesignValidationResult = {
      valid: violations.filter((v) => v.severity === 'error').length === 0,
      violations,
    };

    logger.info('Design constraints validated', { workbookId, valid: result.valid, violationCount: violations.length });
    return result;
  }

  // ── 15. applyAlternateRowColors ───────────────────────────────────────────

  async applyAlternateRowColors(workbookId: string, sheet: string, colors: [string, string]) {
    logger.info('Applying alternate row colours', { workbookId, sheet, colors });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);
    const sheetObj = this.findSheet(sheets, sheet);
    const fmt = this.ensureFormatting(sheetObj);

    fmt.alternateRowColors = {
      evenColor: colors[0],
      oddColor: colors[1],
      appliedAt: new Date().toISOString(),
    };

    await this.persistSheets(workbookId, sheets);

    logger.info('Alternate row colours applied', { workbookId, sheet, colors });
    return { workbookId, sheet, alternateRowColors: fmt.alternateRowColors };
  }

  // ── 16. applyWatermark ────────────────────────────────────────────────────

  async applyWatermark(workbookId: string, text: string) {
    logger.info('Applying watermark', { workbookId, text });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);

    for (const sheetObj of sheets) {
      const fmt = this.ensureFormatting(sheetObj);

      fmt.watermark = {
        text,
        fontSize: 48,
        color: '#D0D0D0',
        opacity: 0.3,
        rotation: -45,
        position: 'center',
        appliedAt: new Date().toISOString(),
      };
    }

    await this.persistSheets(workbookId, sheets);

    logger.info('Watermark applied', { workbookId, text, sheetsUpdated: sheets.length });
    return { workbookId, text, sheetsUpdated: sheets.length };
  }

  // ── 17. exportTheme ───────────────────────────────────────────────────────

  async exportTheme(workbookId: string): Promise<ThemeConfig> {
    logger.info('Exporting theme', { workbookId });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);

    if (sheets.length === 0) {
      throw new Error('Workbook has no sheets to export theme from');
    }

    const fmt = sheets[0]._formatting || {};

    // Reconstruct ThemeConfig from stored formatting data
    const themeData = fmt.theme?.config;
    const colors = fmt.colors || {};
    const fonts = fmt.fonts || {};

    const exportedTheme: ThemeConfig = {
      name: (themeData?.name || fmt.theme?.preset || 'corporate-blue') as ThemePreset,
      primaryColor: colors.primary || themeData?.primaryColor || '#1F4E79',
      secondaryColor: colors.secondary || themeData?.secondaryColor || '#2E75B6',
      accentColor: colors.accent || themeData?.accentColor || '#BDD7EE',
      headerBg: colors.headerBg || themeData?.headerBg || '#1F4E79',
      headerFg: colors.headerFg || themeData?.headerFg || '#FFFFFF',
      altRowBg: fmt.alternateRowColors?.evenColor || themeData?.altRowBg || '#D6E4F0',
      borderColor: colors.borderColor || themeData?.borderColor || '#8DB4E2',
      fontFamily: fonts.bodyFont || themeData?.fontFamily || 'Calibri',
      headerFontFamily: fonts.headerFont || themeData?.headerFontFamily || 'Calibri',
      headerFontSize: fonts.headerSize || themeData?.headerFontSize || 12,
      bodyFontSize: fonts.bodySize || themeData?.bodyFontSize || 11,
    };

    logger.info('Theme exported', { workbookId, themeName: exportedTheme.name });
    return exportedTheme;
  }

  // ── 18. importTheme ───────────────────────────────────────────────────────

  async importTheme(workbookId: string, theme: ThemeConfig) {
    logger.info('Importing theme', { workbookId, themeName: theme.name });

    const workbook = await this.getWorkbook(workbookId);
    const sheets = this.getSheetsJson(workbook);

    for (const sheetObj of sheets) {
      const fmt = this.ensureFormatting(sheetObj);

      fmt.theme = {
        preset: theme.name,
        config: theme,
        imported: true,
        appliedAt: new Date().toISOString(),
      };

      fmt.colors = {
        palette: theme.name,
        primary: theme.primaryColor,
        secondary: theme.secondaryColor,
        accent: theme.accentColor,
        headerBg: theme.headerBg,
        headerFg: theme.headerFg,
        borderColor: theme.borderColor,
        appliedAt: new Date().toISOString(),
      };

      fmt.fonts = {
        preset: theme.name,
        headerFont: theme.headerFontFamily,
        bodyFont: theme.fontFamily,
        headerSize: theme.headerFontSize,
        bodySize: theme.bodyFontSize,
        appliedAt: new Date().toISOString(),
      };

      fmt.headerStyle = {
        backgroundColor: theme.headerBg,
        foregroundColor: theme.headerFg,
        fontFamily: theme.headerFontFamily,
        fontSize: theme.headerFontSize,
        bold: true,
        appliedAt: new Date().toISOString(),
      };

      fmt.alternateRowColors = {
        evenColor: theme.altRowBg,
        oddColor: '#FFFFFF',
        appliedAt: new Date().toISOString(),
      };

      fmt.borders = {
        style: 'thin',
        color: theme.borderColor,
        headerBorderStyle: 'medium',
        headerBorderColor: theme.primaryColor,
        appliedAt: new Date().toISOString(),
      };
    }

    await this.persistSheets(workbookId, sheets);

    logger.info('Theme imported', { workbookId, themeName: theme.name, sheetsUpdated: sheets.length });
    return { workbookId, themeName: theme.name, sheetsUpdated: sheets.length, themeConfig: theme };
  }
}

export const professionalFormattingService = new ProfessionalFormattingService();
