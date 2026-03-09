/**
 * Excel Accuracy Audit Service — Rasid Platform
 * تدقيق دقة ملفات Excel: تحقق من الصيغ، أنواع البيانات، التناسق، والتنسيق
 * يغطي: F-01251, F-01311, F-01393, F-01525, F-01528
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

interface AuditIssue {
  sheet: string;
  cell: string;
  type: 'formula_error' | 'type_mismatch' | 'inconsistency' | 'missing_data' | 'format_issue' | 'precision_loss';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

interface AccuracyReport {
  workbookId: string;
  totalSheets: number;
  totalCells: number;
  totalFormulas: number;
  issues: AuditIssue[];
  score: number; // 0-100
  passedChecks: number;
  failedChecks: number;
  auditedAt: string;
  details: {
    formulaAccuracy: { score: number; checked: number; errors: number };
    dataTypeConsistency: { score: number; checked: number; errors: number };
    formatCompliance: { score: number; checked: number; errors: number };
    structuralIntegrity: { score: number; checked: number; errors: number };
  };
}

interface StructuralComparisonResult {
  similarity: number; // 0-1
  sheetMatch: Array<{ source: string; target: string; similarity: number }>;
  dimensionMatch: { rows: boolean; cols: boolean; merges: boolean };
  formulaMatch: { total: number; matched: number; mismatched: number };
  styleMatch: { total: number; matched: number; mismatched: number };
  passed: boolean;
}

export class AccuracyAuditService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * تدقيق شامل لدقة ملف Excel
   */
  async auditWorkbook(workbookId: string): Promise<AccuracyReport> {
    const workbook = await this.prisma.workbook.findUnique({
      where: { id: workbookId },
    });

    if (!workbook) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const sheetsJson = (workbook as Record<string, unknown>).sheetsJson as Record<string, unknown>;
    const sheets = this.extractSheets(sheetsJson);

    const issues: AuditIssue[] = [];
    let totalCells = 0;
    let totalFormulas = 0;

    for (const sheet of sheets) {
      const cells = (sheet.cells ?? {}) as Record<string, Record<string, unknown>>;
      const cellKeys = Object.keys(cells);
      totalCells += cellKeys.length;

      // 1. Formula accuracy check
      const formulaIssues = this.auditFormulas(String(sheet.name), cells);
      issues.push(...formulaIssues);
      totalFormulas += cellKeys.filter((k) => cells[k]?.formula).length;

      // 2. Data type consistency check
      const typeIssues = this.auditDataTypes(String(sheet.name), cells);
      issues.push(...typeIssues);

      // 3. Format compliance check
      const formatIssues = this.auditFormatting(String(sheet.name), cells);
      issues.push(...formatIssues);

      // 4. Structural integrity check
      const structIssues = this.auditStructure(sheet);
      issues.push(...structIssues);
    }

    const formulaErrors = issues.filter((i) => i.type === 'formula_error').length;
    const typeErrors = issues.filter((i) => i.type === 'type_mismatch').length;
    const formatErrors = issues.filter((i) => i.type === 'format_issue').length;
    const structErrors = issues.filter((i) => i.type === 'inconsistency' || i.type === 'missing_data').length;

    const formulaChecked = Math.max(totalFormulas, 1);
    const totalChecks = totalCells * 4; // 4 types of checks
    const failedChecks = issues.filter((i) => i.severity === 'critical').length;
    const passedChecks = Math.max(totalChecks - failedChecks, 0);

    const details = {
      formulaAccuracy: {
        score: Math.round(((formulaChecked - formulaErrors) / formulaChecked) * 100),
        checked: formulaChecked,
        errors: formulaErrors,
      },
      dataTypeConsistency: {
        score: Math.round(((totalCells - typeErrors) / Math.max(totalCells, 1)) * 100),
        checked: totalCells,
        errors: typeErrors,
      },
      formatCompliance: {
        score: Math.round(((totalCells - formatErrors) / Math.max(totalCells, 1)) * 100),
        checked: totalCells,
        errors: formatErrors,
      },
      structuralIntegrity: {
        score: Math.round(((sheets.length - structErrors) / Math.max(sheets.length, 1)) * 100),
        checked: sheets.length,
        errors: structErrors,
      },
    };

    const overallScore = Math.round(
      (details.formulaAccuracy.score * 0.35 +
        details.dataTypeConsistency.score * 0.25 +
        details.formatCompliance.score * 0.2 +
        details.structuralIntegrity.score * 0.2)
    );

    const report: AccuracyReport = {
      workbookId,
      totalSheets: sheets.length,
      totalCells,
      totalFormulas,
      issues,
      score: overallScore,
      passedChecks,
      failedChecks,
      auditedAt: new Date().toISOString(),
      details,
    };

    logger.info('Accuracy audit completed', {
      workbookId,
      score: overallScore,
      issues: issues.length,
    });

    return report;
  }

  /**
   * مقارنة هيكلية بين ملفين Excel (المطابقة الحرفية والنسخ الهيكلي)
   */
  async compareStructure(
    sourceWorkbookId: string,
    targetWorkbookId: string
  ): Promise<StructuralComparisonResult> {
    const [source, target] = await Promise.all([
      this.prisma.workbook.findUnique({ where: { id: sourceWorkbookId } }),
      this.prisma.workbook.findUnique({ where: { id: targetWorkbookId } }),
    ]);

    if (!source || !target) {
      throw new Error('Source or target workbook not found');
    }

    const sourceSheets = this.extractSheets((source as Record<string, unknown>).sheetsJson as Record<string, unknown>);
    const targetSheets = this.extractSheets((target as Record<string, unknown>).sheetsJson as Record<string, unknown>);

    // Match sheets by name
    const sheetMatch = sourceSheets.map((ss) => {
      const ts = targetSheets.find((t) => t.name === ss.name);
      if (!ts) {
        return { source: String(ss.name), target: '', similarity: 0 };
      }
      const sim = this.computeSheetSimilarity(ss, ts);
      return { source: String(ss.name), target: String(ts.name), similarity: sim };
    });

    // Dimension match
    const firstSource = sourceSheets[0];
    const firstTarget = targetSheets.find((t) => t.name === firstSource?.name) ?? targetSheets[0];
    const dimensionMatch = {
      rows: firstSource?.rowCount === firstTarget?.rowCount,
      cols: firstSource?.colCount === firstTarget?.colCount,
      merges: JSON.stringify(firstSource?.mergedCells ?? []) === JSON.stringify(firstTarget?.mergedCells ?? []),
    };

    // Formula match
    let totalFormulas = 0;
    let matchedFormulas = 0;
    for (const ss of sourceSheets) {
      const ts = targetSheets.find((t) => t.name === ss.name);
      if (!ts) continue;
      const sCells = (ss.cells ?? {}) as Record<string, Record<string, unknown>>;
      const tCells = (ts.cells ?? {}) as Record<string, Record<string, unknown>>;
      for (const key of Object.keys(sCells)) {
        if (sCells[key]?.formula) {
          totalFormulas++;
          if (tCells[key]?.formula === sCells[key].formula) {
            matchedFormulas++;
          }
        }
      }
    }

    // Style match
    let totalStyles = 0;
    let matchedStyles = 0;
    for (const ss of sourceSheets) {
      const ts = targetSheets.find((t) => t.name === ss.name);
      if (!ts) continue;
      const sCells = (ss.cells ?? {}) as Record<string, Record<string, unknown>>;
      const tCells = (ts.cells ?? {}) as Record<string, Record<string, unknown>>;
      for (const key of Object.keys(sCells)) {
        if (sCells[key]?.style) {
          totalStyles++;
          if (JSON.stringify(sCells[key].style) === JSON.stringify(tCells[key]?.style)) {
            matchedStyles++;
          }
        }
      }
    }

    const avgSheetSimilarity =
      sheetMatch.length > 0
        ? sheetMatch.reduce((sum, s) => sum + s.similarity, 0) / sheetMatch.length
        : 0;

    const formulaRatio = totalFormulas > 0 ? matchedFormulas / totalFormulas : 1;
    const styleRatio = totalStyles > 0 ? matchedStyles / totalStyles : 1;

    const similarity = avgSheetSimilarity * 0.4 + formulaRatio * 0.35 + styleRatio * 0.25;

    return {
      similarity,
      sheetMatch,
      dimensionMatch,
      formulaMatch: {
        total: totalFormulas,
        matched: matchedFormulas,
        mismatched: totalFormulas - matchedFormulas,
      },
      styleMatch: {
        total: totalStyles,
        matched: matchedStyles,
        mismatched: totalStyles - matchedStyles,
      },
      passed: similarity >= 0.95,
    };
  }

  /**
   * توقع صيغ Excel بناءً على أنماط البيانات
   */
  async predictFormulas(
    workbookId: string,
    sheetName: string
  ): Promise<Array<{ cell: string; suggestedFormula: string; confidence: number; reason: string }>> {
    const workbook = await this.prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) throw new Error('Workbook not found');

    const sheets = this.extractSheets((workbook as Record<string, unknown>).sheetsJson as Record<string, unknown>);
    const sheet = sheets.find((s) => s.name === sheetName);
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

    const cells = (sheet.cells ?? {}) as Record<string, Record<string, unknown>>;
    const suggestions: Array<{ cell: string; suggestedFormula: string; confidence: number; reason: string }> = [];

    // Detect columns with numeric data that could benefit from SUM/AVERAGE
    const columnData = this.groupCellsByColumn(cells);
    for (const [col, colCells] of Object.entries(columnData)) {
      const numericCells = colCells.filter((c) => typeof c.value === 'number');
      if (numericCells.length >= 3) {
        const lastRow = Math.max(...colCells.map((c) => c.row)) + 1;
        const firstRow = Math.min(...numericCells.map((c) => c.row));

        // Suggest SUM at bottom
        const sumCell = `${col}${lastRow}`;
        if (!cells[sumCell]?.formula) {
          suggestions.push({
            cell: sumCell,
            suggestedFormula: `=SUM(${col}${firstRow}:${col}${lastRow - 1})`,
            confidence: 0.85,
            reason: `عمود ${col} يحتوي ${numericCells.length} قيم رقمية — اقتراح جمع تلقائي`,
          });
        }

        // Suggest AVERAGE
        const avgCell = `${col}${lastRow + 1}`;
        if (!cells[avgCell]?.formula) {
          suggestions.push({
            cell: avgCell,
            suggestedFormula: `=AVERAGE(${col}${firstRow}:${col}${lastRow - 1})`,
            confidence: 0.7,
            reason: `حساب المتوسط لعمود ${col}`,
          });
        }
      }

      // Detect percentage patterns
      const pctCells = colCells.filter((c) => {
        const val = c.value;
        return typeof val === 'number' && val >= 0 && val <= 1;
      });
      if (pctCells.length >= 2 && pctCells.length === numericCells.length) {
        for (const pc of pctCells) {
          if (!cells[`${col}${pc.row}`]?.numberFormat) {
            suggestions.push({
              cell: `${col}${pc.row}`,
              suggestedFormula: '', // Not a formula, but a format suggestion
              confidence: 0.75,
              reason: `القيمة ${pc.value} تبدو نسبة مئوية — اقتراح تنسيق كنسبة مئوية`,
            });
          }
        }
      }
    }

    // Detect potential VLOOKUP opportunities
    if (sheets.length >= 2) {
      const otherSheets = sheets.filter((s) => s.name !== sheetName);
      for (const other of otherSheets) {
        const otherCols = this.groupCellsByColumn((other.cells ?? {}) as Record<string, Record<string, unknown>>);
        for (const [col, mainCells] of Object.entries(columnData)) {
          const mainValues = new Set(mainCells.map((c) => String(c.value)));
          for (const [otherCol, otherCells] of Object.entries(otherCols)) {
            const otherValues = new Set(otherCells.map((c) => String(c.value)));
            const overlap = [...mainValues].filter((v) => otherValues.has(v));
            if (overlap.length >= mainValues.size * 0.5 && mainValues.size >= 3) {
              suggestions.push({
                cell: `${col}1`,
                suggestedFormula: `=VLOOKUP(${col}1,'${other.name}'!${otherCol}:${otherCol},1,FALSE)`,
                confidence: 0.6,
                reason: `تطابق ${overlap.length} قيمة بين عمود ${col} وورقة "${other.name}" عمود ${otherCol}`,
              });
              break;
            }
          }
        }
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  // ─── Private helpers ─────────────────────────────────────────

  private extractSheets(sheetsJson: Record<string, unknown>): Array<Record<string, unknown>> {
    if (!sheetsJson) return [];
    if (Array.isArray(sheetsJson.sheets)) return sheetsJson.sheets;
    if (Array.isArray(sheetsJson)) return sheetsJson;
    return [];
  }

  private auditFormulas(sheetName: string, cells: Record<string, Record<string, unknown>>): AuditIssue[] {
    const issues: AuditIssue[] = [];

    for (const [cellRef, cell] of Object.entries(cells)) {
      if (!cell.formula) continue;
      const formula = String(cell.formula);

      // Check for circular references (simplified)
      if (formula.includes(cellRef)) {
        issues.push({
          sheet: sheetName,
          cell: cellRef,
          type: 'formula_error',
          severity: 'critical',
          message: `مرجع دائري محتمل: الصيغة تشير إلى نفس الخلية`,
          suggestion: `مراجعة الصيغة ${formula} وإزالة المرجع الدائري`,
        });
      }

      // Check for #REF! errors
      if (cell.error === '#REF!' || cell.value === '#REF!') {
        issues.push({
          sheet: sheetName,
          cell: cellRef,
          type: 'formula_error',
          severity: 'critical',
          message: `خطأ مرجع: ${formula}`,
          suggestion: 'تحقق من المراجع المحذوفة في الصيغة',
        });
      }

      // Check for #DIV/0! errors
      if (cell.error === '#DIV/0!' || cell.value === '#DIV/0!') {
        issues.push({
          sheet: sheetName,
          cell: cellRef,
          type: 'formula_error',
          severity: 'warning',
          message: `قسمة على صفر: ${formula}`,
          suggestion: `استخدم IFERROR(${formula}, 0) لتجنب الخطأ`,
        });
      }

      // Check hardcoded numbers in formulas (potential data integrity issue)
      const hardcodedNums = formula.match(/[+\-*/]\s*\d{4,}/g);
      if (hardcodedNums && hardcodedNums.length > 0) {
        issues.push({
          sheet: sheetName,
          cell: cellRef,
          type: 'formula_error',
          severity: 'info',
          message: `أرقام ثابتة في الصيغة: ${hardcodedNums.join(', ')}`,
          suggestion: 'استبدل الأرقام الثابتة بمراجع خلايا لسهولة الصيانة',
        });
      }
    }

    return issues;
  }

  private auditDataTypes(sheetName: string, cells: Record<string, Record<string, unknown>>): AuditIssue[] {
    const issues: AuditIssue[] = [];
    const columnTypes = new Map<string, Set<string>>();

    for (const [cellRef, cell] of Object.entries(cells)) {
      const col = cellRef.replace(/\d+/g, '');
      const valueType = typeof cell.value;

      if (!columnTypes.has(col)) {
        columnTypes.set(col, new Set());
      }
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
        columnTypes.get(col)!.add(valueType);
      }
    }

    // Check for mixed types in columns
    for (const [col, types] of columnTypes) {
      if (types.size > 1 && types.has('number') && types.has('string')) {
        issues.push({
          sheet: sheetName,
          cell: `${col}:*`,
          type: 'type_mismatch',
          severity: 'warning',
          message: `عمود ${col} يحتوي أنواع بيانات مختلطة (نصوص وأرقام)`,
          suggestion: 'تأكد من توحيد نوع البيانات في العمود',
        });
      }
    }

    return issues;
  }

  private auditFormatting(sheetName: string, cells: Record<string, Record<string, unknown>>): AuditIssue[] {
    const issues: AuditIssue[] = [];
    const columnFormats = new Map<string, Set<string>>();

    for (const [cellRef, cell] of Object.entries(cells)) {
      const col = cellRef.replace(/\d+/g, '');
      const format = cell.numberFormat ? String(cell.numberFormat) : 'general';

      if (!columnFormats.has(col)) {
        columnFormats.set(col, new Set());
      }
      columnFormats.get(col)!.add(format);
    }

    for (const [col, formats] of columnFormats) {
      if (formats.size > 2) {
        issues.push({
          sheet: sheetName,
          cell: `${col}:*`,
          type: 'format_issue',
          severity: 'info',
          message: `عمود ${col} يستخدم ${formats.size} تنسيقات مختلفة`,
          suggestion: 'توحيد التنسيق في العمود لتحسين القراءة',
        });
      }
    }

    return issues;
  }

  private auditStructure(sheet: Record<string, unknown>): AuditIssue[] {
    const issues: AuditIssue[] = [];
    const sheetName = String(sheet.name ?? 'Sheet');

    // Check for empty sheet
    const cells = (sheet.cells ?? {}) as Record<string, unknown>;
    if (Object.keys(cells).length === 0) {
      issues.push({
        sheet: sheetName,
        cell: 'A1',
        type: 'missing_data',
        severity: 'warning',
        message: 'ورقة فارغة بدون بيانات',
      });
    }

    // Check for merged cells that may cause issues
    const mergedCells = (sheet.mergedCells ?? []) as Array<Record<string, unknown>>;
    if (mergedCells.length > 50) {
      issues.push({
        sheet: sheetName,
        cell: '*',
        type: 'inconsistency',
        severity: 'info',
        message: `${mergedCells.length} خلية مدمجة — قد يؤثر على الفلترة والفرز`,
        suggestion: 'تقليل دمج الخلايا لتحسين إمكانية المعالجة',
      });
    }

    return issues;
  }

  private computeSheetSimilarity(
    source: Record<string, unknown>,
    target: Record<string, unknown>
  ): number {
    const sCells = (source.cells ?? {}) as Record<string, Record<string, unknown>>;
    const tCells = (target.cells ?? {}) as Record<string, Record<string, unknown>>;

    const allKeys = new Set([...Object.keys(sCells), ...Object.keys(tCells)]);
    if (allKeys.size === 0) return 1;

    let matchCount = 0;
    for (const key of allKeys) {
      const sCell = sCells[key];
      const tCell = tCells[key];
      if (!sCell || !tCell) continue;

      // Compare value
      if (sCell.value === tCell.value) matchCount += 0.5;
      // Compare formula
      if (sCell.formula === tCell.formula && sCell.formula) matchCount += 0.3;
      // Compare style
      if (JSON.stringify(sCell.style) === JSON.stringify(tCell.style)) matchCount += 0.2;
    }

    return matchCount / allKeys.size;
  }

  private groupCellsByColumn(
    cells: Record<string, Record<string, unknown>>
  ): Record<string, Array<{ row: number; value: unknown }>> {
    const columns: Record<string, Array<{ row: number; value: unknown }>> = {};

    for (const [cellRef, cell] of Object.entries(cells)) {
      const col = cellRef.replace(/\d+/g, '');
      const row = parseInt(cellRef.replace(/[A-Z]+/gi, ''), 10);

      if (!columns[col]) columns[col] = [];
      columns[col].push({ row, value: cell.value });
    }

    return columns;
  }
}
