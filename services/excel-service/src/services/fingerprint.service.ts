import { logger } from '../utils/logger.js';
import CryptoJS from 'crypto-js';
import type { Fingerprint, BrandIdentity } from '../types/common.types.js';
import type { BrandComplianceResult } from '../types/matching.types.js';

/**
 * Digital fingerprint service for workbooks stored in the RASID platform.
 * Generates structural hashes, compares fingerprints, and verifies brand compliance.
 */
export class FingerprintService {
  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async loadWorkbook(workbookId: string) {
    const { prisma } = await import('../utils/prisma.js');
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }
    return workbook;
  }

  private getSheetsArray(sheetsJson: Record<string, any>): Record<string, any>[] {
    if (!sheetsJson) return [];
    if (Array.isArray(sheetsJson.sheets)) return sheetsJson.sheets as Record<string, any>[];
    if (Array.isArray(sheetsJson)) return sheetsJson as Record<string, any>[];
    return [];
  }

  /**
   * Produce a deterministic SHA-256 hex digest of any serializable value.
   */
  private hash(value: unknown): string {
    const obj = (value ?? {}) as Record<string, unknown>;
    const serialized = JSON.stringify(value, Object.keys(obj).sort());
    return CryptoJS.SHA256(serialized).toString(CryptoJS.enc.Hex);
  }

  // ---------------------------------------------------------------------------
  // 1. Generate fingerprint
  // ---------------------------------------------------------------------------

  async generateFingerprint(workbookId: string): Promise<Fingerprint> {
    logger.info('Generating fingerprint', { workbookId });
    const workbook = await this.loadWorkbook(workbookId);
    const sheetsJson = ((workbook as any).sheetsJson ?? {}) as Record<string, any>;
    const sheetsArray = this.getSheetsArray(sheetsJson);

    // -- Dimensions section ---------------------------------------------------
    const dimensionsData: Record<string, Record<string, unknown>> = {};
    for (const sheet of sheetsArray) {
      const cells = sheet.cells ?? {};
      const cellKeys = Object.keys(cells);

      let maxRow = sheet.rowCount ?? 0;
      let maxCol = sheet.colCount ?? 0;
      for (const key of cellKeys) {
        const m = key.match(/^([A-Z]+)(\d+)$/);
        if (m) {
          const row = parseInt(m[2], 10);
          let col = 0;
          for (let i = 0; i < m[1].length; i++) {
            col = col * 26 + (m[1].charCodeAt(i) - 64);
          }
          if (row > maxRow) maxRow = row;
          if (col > maxCol) maxCol = col;
        }
      }

      dimensionsData[sheet.name ?? 'Sheet'] = {
        rowCount: maxRow,
        colCount: maxCol,
        columnWidthKeys: Object.keys(sheet.columnWidths ?? {}).sort(),
        rowHeightKeys: Object.keys(sheet.rowHeights ?? {}).sort(),
        mergedCellCount: Array.isArray(sheet.mergedCells) ? sheet.mergedCells.length : 0,
        frozenPane: sheet.frozenPane ?? null,
        hiddenRowCount: Array.isArray(sheet.hiddenRows) ? sheet.hiddenRows.length : 0,
        hiddenColCount: Array.isArray(sheet.hiddenCols) ? sheet.hiddenCols.length : 0,
      };
    }

    // -- Structure section ----------------------------------------------------
    const structureData: Record<string, Record<string, unknown>> = {};
    for (const sheet of sheetsArray) {
      const namedRanges = Array.isArray(sheet.namedRanges)
        ? (sheet.namedRanges as Record<string, unknown>[]).map((nr) => nr.name).sort()
        : [];
      const cfCount = Array.isArray(sheet.conditionalFormats) ? sheet.conditionalFormats.length : 0;
      const chartTypes = Array.isArray(sheet.charts)
        ? (sheet.charts as Record<string, unknown>[]).map((ch) => ch.type).sort()
        : [];
      const tableNames = Array.isArray(sheet.tables)
        ? (sheet.tables as Record<string, unknown>[]).map((t) => t.name).sort()
        : [];
      const validationCount = Array.isArray(sheet.dataValidations) ? sheet.dataValidations.length : 0;

      structureData[(sheet.name as string) ?? 'Sheet'] = {
        namedRanges,
        conditionalFormatCount: cfCount,
        chartTypes,
        tableNames,
        validationCount,
      };
    }

    // -- Formatting section ---------------------------------------------------
    const formattingData: Record<string, Record<string, unknown>> = {};
    for (const sheet of sheetsArray) {
      const cells = (sheet.cells ?? {}) as Record<string, unknown>;
      const styleKeys: string[] = [];
      for (const [addr, cellObj] of Object.entries(cells)) {
        const c = cellObj as Record<string, unknown> | null;
        const style = c?.style ?? c?.format ?? null;
        if (style !== null) {
          styleKeys.push(`${addr}:${JSON.stringify(style)}`);
        }
      }
      styleKeys.sort();
      formattingData[(sheet.name as string) ?? 'Sheet'] = {
        styledCellCount: styleKeys.length,
        styleHash: styleKeys.length > 0 ? CryptoJS.SHA256(styleKeys.join('|')).toString(CryptoJS.enc.Hex) : null,
      };
    }

    // -- Formulas section -----------------------------------------------------
    const formulasData: Record<string, Record<string, unknown>> = {};
    for (const sheet of sheetsArray) {
      const cells = (sheet.cells ?? {}) as Record<string, unknown>;
      const formulaPatterns: string[] = [];
      for (const [addr, cellObj] of Object.entries(cells)) {
        const c = cellObj as Record<string, unknown> | null;
        if (c?.formula) {
          // Normalise the formula to a pattern by stripping cell references
          const pattern = String(c.formula).replace(/\$?[A-Z]+\$?\d+/g, '_REF_');
          formulaPatterns.push(`${addr}:${c.formula}`);
        }
      }
      formulaPatterns.sort();
      formulasData[(sheet.name as string) ?? 'Sheet'] = {
        formulaCount: formulaPatterns.length,
        formulaHash: formulaPatterns.length > 0
          ? CryptoJS.SHA256(formulaPatterns.join('|')).toString(CryptoJS.enc.Hex)
          : null,
      };
    }

    // -- Composite hash -------------------------------------------------------
    const sheetNames = sheetsArray.map((s) => (s.name as string) ?? 'Sheet').sort();
    const compositePayload = JSON.stringify({
      sheetNames,
      dimensions: dimensionsData,
      structure: structureData,
      formatting: formattingData,
      formulas: formulasData,
    });

    const compositeHash = CryptoJS.SHA256(compositePayload).toString(CryptoJS.enc.Hex);

    const fingerprint: Fingerprint = {
      hash: compositeHash,
      dimensions: dimensionsData,
      structure: structureData,
      formatting: formattingData,
      formulas: formulasData,
      createdAt: new Date().toISOString(),
    };

    logger.info('Fingerprint generated', { workbookId, hash: compositeHash });
    return fingerprint;
  }

  // ---------------------------------------------------------------------------
  // 2. Compare fingerprints
  // ---------------------------------------------------------------------------

  compareFingerprints(
    fp1: Fingerprint,
    fp2: Fingerprint,
  ): { match: boolean; score: number; differences: string[] } {
    logger.info('Comparing fingerprints', { hash1: fp1.hash, hash2: fp2.hash });

    if (fp1.hash === fp2.hash) {
      return { match: true, score: 100, differences: [] };
    }

    const differences: string[] = [];
    let totalSections = 4;
    let sectionScores = 0;

    // -- Dimensions comparison ------------------------------------------------
    const dimScore = this.compareSections(fp1.dimensions, fp2.dimensions, 'dimensions', differences);
    sectionScores += dimScore;

    // -- Structure comparison -------------------------------------------------
    const strScore = this.compareSections(fp1.structure, fp2.structure, 'structure', differences);
    sectionScores += strScore;

    // -- Formatting comparison ------------------------------------------------
    const fmtScore = this.compareSections(fp1.formatting, fp2.formatting, 'formatting', differences);
    sectionScores += fmtScore;

    // -- Formulas comparison --------------------------------------------------
    const fmlScore = this.compareSections(fp1.formulas, fp2.formulas, 'formulas', differences);
    sectionScores += fmlScore;

    const score = Math.round(sectionScores / totalSections);
    const match = score >= 95;

    logger.info('Fingerprint comparison complete', { score, match, differenceCount: differences.length });
    return { match, score, differences };
  }

  /**
   * Compare two section objects key-by-key and accumulate differences.
   * Returns a similarity score 0-100 for the section.
   */
  private compareSections(
    a: Record<string, any>,
    b: Record<string, any>,
    sectionName: string,
    differences: string[],
  ): number {
    const aKeys = Object.keys(a ?? {});
    const bKeys = Object.keys(b ?? {});
    const allKeys = [...new Set([...aKeys, ...bKeys])];

    if (allKeys.length === 0) return 100;

    let matched = 0;
    for (const key of allKeys) {
      const aVal = a?.[key];
      const bVal = b?.[key];

      if (aVal === undefined) {
        differences.push(`${sectionName}.${key}: missing in first fingerprint`);
        continue;
      }
      if (bVal === undefined) {
        differences.push(`${sectionName}.${key}: missing in second fingerprint`);
        continue;
      }

      const aStr = JSON.stringify(aVal);
      const bStr = JSON.stringify(bVal);

      if (aStr === bStr) {
        matched++;
      } else {
        // Drill into sub-keys to give a more useful diff message
        if (typeof aVal === 'object' && typeof bVal === 'object' && aVal !== null && bVal !== null) {
          const subKeys = [...new Set([...Object.keys(aVal), ...Object.keys(bVal)])];
          for (const sk of subKeys) {
            if (JSON.stringify(aVal[sk]) !== JSON.stringify(bVal[sk])) {
              differences.push(`${sectionName}.${key}.${sk}: ${JSON.stringify(aVal[sk])} vs ${JSON.stringify(bVal[sk])}`);
            }
          }
          // Partial credit: count matching sub-keys
          const subTotal = subKeys.length;
          let subMatched = 0;
          for (const sk of subKeys) {
            if (JSON.stringify(aVal[sk]) === JSON.stringify(bVal[sk])) subMatched++;
          }
          matched += subTotal > 0 ? subMatched / subTotal : 0;
        } else {
          differences.push(`${sectionName}.${key}: ${aStr} vs ${bStr}`);
        }
      }
    }

    return Math.round((matched / allKeys.length) * 100);
  }

  // ---------------------------------------------------------------------------
  // 3. Verify brand compliance
  // ---------------------------------------------------------------------------

  async verifyBrandCompliance(
    workbookId: string,
    brand: BrandIdentity,
  ): Promise<BrandComplianceResult> {
    logger.info('Verifying brand compliance', { workbookId, brand: brand.name });
    const workbook = await this.loadWorkbook(workbookId);
    const sheetsJson = ((workbook as any).sheetsJson ?? {}) as Record<string, any>;
    const sheetsArray = this.getSheetsArray(sheetsJson);

    const checks: BrandComplianceResult['checks'] = [];

    // Normalise hex colours for comparison (lowercase, ensure # prefix)
    const normColor = (c: string | undefined): string => {
      if (!c) return '';
      let hex = c.trim().toLowerCase();
      if (!hex.startsWith('#')) hex = `#${hex}`;
      return hex;
    };

    const brandPrimary = normColor(brand.primaryColor);
    const brandSecondary = normColor(brand.secondaryColor);
    const brandAccent = normColor(brand.accentColor);
    const brandFont = brand.fontFamily.toLowerCase();
    const brandHeaderFont = (brand.headerFontFamily ?? brand.fontFamily).toLowerCase();

    const allowedColors = new Set([brandPrimary, brandSecondary, brandAccent]);

    // Track totals for scoring
    let totalChecks = 0;
    let passedChecks = 0;

    // -- Check each sheet for brand compliance --------------------------------
    for (const sheet of sheetsArray) {
      const cells = sheet.cells ?? {};

      // Collect all unique colours and fonts found
      const foundColors = new Set<string>();
      const foundFonts = new Set<string>();

      for (const cellObj of Object.values(cells)) {
        const c = cellObj as Record<string, unknown> | null;
        const style = (c?.style ?? c?.format) as Record<string, unknown> | null;
        if (!style) continue;

        // Collect background / fill colours
        if (style.backgroundColor) foundColors.add(normColor(style.backgroundColor as string));
        if (style.bgColor) foundColors.add(normColor(style.bgColor as string));
        if (style.fillColor) foundColors.add(normColor(style.fillColor as string));
        if (style.color) foundColors.add(normColor(style.color as string));
        if (style.fontColor) foundColors.add(normColor(style.fontColor as string));

        // Collect fonts
        if (style.fontFamily) foundFonts.add(String(style.fontFamily).toLowerCase());
        if (style.font) foundFonts.add(String(style.font).toLowerCase());
      }

      // --- Colour checks ---
      const nonCompliantColors: string[] = [];
      for (const color of foundColors) {
        if (color && !allowedColors.has(color)) {
          // Allow black, white, and common neutral shades
          const neutrals = new Set(['#000000', '#ffffff', '#fff', '#000', '#f2f2f2', '#d9d9d9', '#bfbfbf', '#808080', '#595959', '#404040', '#262626']);
          if (!neutrals.has(color)) {
            nonCompliantColors.push(color);
          }
        }
      }

      totalChecks++;
      const colorPassed = nonCompliantColors.length === 0;
      if (colorPassed) passedChecks++;
      checks.push({
        name: `${sheet.name}: Color compliance`,
        passed: colorPassed,
        expected: `Brand colors: ${[brandPrimary, brandSecondary, brandAccent].join(', ')}`,
        actual: nonCompliantColors.length > 0 ? `Non-compliant: ${nonCompliantColors.join(', ')}` : 'All colors compliant',
        message: colorPassed
          ? `All colors in sheet "${sheet.name}" match the brand palette.`
          : `Sheet "${sheet.name}" contains ${nonCompliantColors.length} non-brand color(s): ${nonCompliantColors.join(', ')}.`,
      });

      // --- Font checks ---
      const nonCompliantFonts: string[] = [];
      const allowedFonts = new Set([brandFont, brandHeaderFont]);
      for (const font of foundFonts) {
        if (font && !allowedFonts.has(font)) {
          nonCompliantFonts.push(font);
        }
      }

      totalChecks++;
      const fontPassed = nonCompliantFonts.length === 0;
      if (fontPassed) passedChecks++;
      checks.push({
        name: `${sheet.name}: Font compliance`,
        passed: fontPassed,
        expected: `Brand fonts: ${[brandFont, brandHeaderFont].filter(Boolean).join(', ')}`,
        actual: nonCompliantFonts.length > 0 ? `Non-compliant: ${nonCompliantFonts.join(', ')}` : 'All fonts compliant',
        message: fontPassed
          ? `All fonts in sheet "${sheet.name}" match the brand typography.`
          : `Sheet "${sheet.name}" uses ${nonCompliantFonts.length} non-brand font(s): ${nonCompliantFonts.join(', ')}.`,
      });

      // --- Header row font check (first row assumed header) ---
      const headerCells = Object.entries(cells).filter(([addr]) => {
        const m = addr.match(/\d+$/);
        return m && m[0] === '1';
      });

      if (headerCells.length > 0) {
        totalChecks++;
        let headerFontOk = true;
        const headerFontsFound: string[] = [];

        for (const [, cellObj] of headerCells) {
          const c = cellObj as Record<string, unknown> | null;
          const style = (c?.style ?? c?.format) as Record<string, unknown> | null;
          if (style) {
            const cellFont = ((style.fontFamily ?? style.font ?? '') as string).toLowerCase();
            if (cellFont && cellFont !== brandHeaderFont && cellFont !== brandFont) {
              headerFontOk = false;
              headerFontsFound.push(cellFont);
            }
          }
        }

        if (headerFontOk) passedChecks++;
        checks.push({
          name: `${sheet.name}: Header font compliance`,
          passed: headerFontOk,
          expected: brandHeaderFont,
          actual: headerFontsFound.length > 0 ? headerFontsFound.join(', ') : brandHeaderFont,
          message: headerFontOk
            ? `Header row in sheet "${sheet.name}" uses the correct brand header font.`
            : `Header row in sheet "${sheet.name}" uses non-brand font(s): ${headerFontsFound.join(', ')}.`,
        });
      }
    }

    // --- Global: Brand logo / watermark presence if specified ---
    if (brand.logo) {
      totalChecks++;
      let logoFound = false;
      for (const sheet of sheetsArray) {
        if (Array.isArray(sheet.images)) {
          for (const img of sheet.images) {
            if (img?.src === brand.logo || img?.name === brand.logo) {
              logoFound = true;
              break;
            }
          }
        }
        if (logoFound) break;
      }
      if (logoFound) passedChecks++;
      checks.push({
        name: 'Brand logo presence',
        passed: logoFound,
        expected: brand.logo,
        actual: logoFound ? 'Logo found' : 'Logo not found',
        message: logoFound
          ? 'Brand logo is present in the workbook.'
          : 'Brand logo is missing from the workbook.',
      });
    }

    if (brand.watermark) {
      totalChecks++;
      let watermarkFound = false;
      for (const sheet of sheetsArray) {
        if (sheet.watermark === brand.watermark) {
          watermarkFound = true;
          break;
        }
        if (sheet.headerFooter?.header?.includes(brand.watermark) || sheet.headerFooter?.footer?.includes(brand.watermark)) {
          watermarkFound = true;
          break;
        }
      }
      if (watermarkFound) passedChecks++;
      checks.push({
        name: 'Brand watermark presence',
        passed: watermarkFound,
        expected: brand.watermark,
        actual: watermarkFound ? 'Watermark found' : 'Watermark not found',
        message: watermarkFound
          ? 'Brand watermark is present in the workbook.'
          : 'Brand watermark is missing from the workbook.',
      });
    }

    const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
    const compliant = score >= 80;

    const result: BrandComplianceResult = {
      compliant,
      score,
      checks,
    };

    logger.info('Brand compliance check complete', { workbookId, brand: brand.name, score, compliant });
    return result;
  }
}

export const fingerprintService = new FingerprintService();
