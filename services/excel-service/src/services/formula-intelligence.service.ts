import { logger } from '../utils/logger.js';
import type {
  FormulaOptimization,
  FormulaAuditResult,
  FormulaIssue,
  BusinessLogicModel,
} from '../types/formula.types.js';

export class FormulaIntelligenceService {
  /**
   * Analyze formulas in a sheet and suggest optimizations.
   */
  async optimizeFormulas(
    workbookId: string,
    sheet: string
  ): Promise<FormulaOptimization[]> {
    logger.info('Optimizing formulas', { workbookId, sheet });

    const formulas = await this.extractFormulasFromSheet(workbookId, sheet);
    const optimizations: FormulaOptimization[] = [];

    for (const { cell, formula } of formulas) {
      const suggestions = this.analyzeForOptimization(formula);
      for (const suggestion of suggestions) {
        optimizations.push({
          original: formula,
          optimized: suggestion.optimized,
          reason: suggestion.reason,
          impact: suggestion.impact,
        });
      }
    }

    logger.info('Formula optimization complete', { workbookId, sheet, suggestions: optimizations.length });
    return optimizations;
  }

  /**
   * Detect logical errors in formulas.
   */
  async detectFormulaErrors(
    workbookId: string,
    sheet: string
  ): Promise<FormulaAuditResult[]> {
    logger.info('Detecting formula errors', { workbookId, sheet });

    const formulas = await this.extractFormulasFromSheet(workbookId, sheet);
    const results: FormulaAuditResult[] = [];

    for (const { cell, formula } of formulas) {
      const issues = this.detectIssues(formula);
      const complexity = this.calculateComplexity(formula);
      const volatileDeps = this.findVolatileDependencies(formula);

      results.push({
        cell,
        formula,
        issues,
        complexity,
        volatileDependencies: volatileDeps,
      });
    }

    logger.info('Formula error detection complete', { workbookId, sheet, cellsAnalyzed: results.length });
    return results;
  }

  /**
   * Extract a business logic model from the spreadsheet formulas.
   */
  async extractBusinessLogic(
    workbookId: string,
    sheet: string
  ): Promise<BusinessLogicModel> {
    logger.info('Extracting business logic', { workbookId, sheet });

    const formulas = await this.extractFormulasFromSheet(workbookId, sheet);
    const inputs: BusinessLogicModel['inputs'] = [];
    const outputs: BusinessLogicModel['outputs'] = [];
    const rules: BusinessLogicModel['rules'] = [];
    const dependencies: BusinessLogicModel['dependencies'] = [];

    const cellsWithFormulas = new Set(formulas.map((f) => f.cell));
    const referencedCells = new Set<string>();

    for (const { cell, formula } of formulas) {
      const refs = this.extractCellReferences(formula);
      for (const ref of refs) {
        referencedCells.add(ref);
        dependencies.push({ from: ref, to: cell });
      }

      outputs.push({ cell, name: cell, formula });

      if (formula.toUpperCase().includes('IF(') || formula.toUpperCase().includes('IFS(')) {
        rules.push({
          description: `Conditional logic in ${cell}`,
          formula,
          cells: [cell, ...refs],
        });
      }
    }

    for (const ref of referencedCells) {
      if (!cellsWithFormulas.has(ref)) {
        inputs.push({ cell: ref, name: ref, type: 'input' });
      }
    }

    logger.info('Business logic extracted', {
      workbookId, sheet,
      inputs: inputs.length,
      outputs: outputs.length,
      rules: rules.length,
    });

    return { inputs, outputs, rules, dependencies };
  }

  /**
   * Simplify a complex formula expression.
   */
  simplifyFormula(formula: string): { simplified: string; changes: string[] } {
    const changes: string[] = [];
    let simplified = formula;

    // Remove redundant IF(condition, TRUE, FALSE)
    const redundantIf = /IF\(([^,]+),\s*TRUE\s*,\s*FALSE\s*\)/gi;
    if (redundantIf.test(simplified)) {
      simplified = simplified.replace(redundantIf, '$1');
      changes.push('Removed redundant IF(cond, TRUE, FALSE) → cond');
    }

    // Replace IF(condition, FALSE, TRUE) with NOT(condition)
    const negatedIf = /IF\(([^,]+),\s*FALSE\s*,\s*TRUE\s*\)/gi;
    if (negatedIf.test(simplified)) {
      simplified = simplified.replace(negatedIf, 'NOT($1)');
      changes.push('Replaced IF(cond, FALSE, TRUE) → NOT(cond)');
    }

    // Replace nested IFs with IFS when possible
    const nestedIfCount = (simplified.match(/IF\(/gi) || []).length;
    if (nestedIfCount >= 3) {
      changes.push('Consider replacing nested IFs with IFS() function');
    }

    // Detect SUM of individual cells that could be a range
    const sumIndividual = /SUM\(([A-Z]+\d+(?:\s*,\s*[A-Z]+\d+){3,})\)/gi;
    if (sumIndividual.test(simplified)) {
      changes.push('Consider using range reference in SUM instead of individual cells');
    }

    // Detect VLOOKUP that could be XLOOKUP
    if (/VLOOKUP\(/i.test(simplified)) {
      changes.push('Consider replacing VLOOKUP with XLOOKUP for better flexibility');
    }

    return { simplified, changes };
  }

  /**
   * Comprehensive formula audit for a sheet.
   */
  async auditFormulas(
    workbookId: string,
    sheet: string
  ): Promise<{
    totalFormulas: number;
    errorCount: number;
    warningCount: number;
    complexityAvg: number;
    volatileCount: number;
    results: FormulaAuditResult[];
  }> {
    const results = await this.detectFormulaErrors(workbookId, sheet);
    const errorCount = results.reduce((sum, r) => sum + r.issues.filter((i) => i.type === 'error').length, 0);
    const warningCount = results.reduce((sum, r) => sum + r.issues.filter((i) => i.type === 'warning').length, 0);
    const complexityAvg = results.length > 0
      ? results.reduce((sum, r) => sum + r.complexity, 0) / results.length
      : 0;
    const volatileCount = results.filter((r) => r.volatileDependencies.length > 0).length;

    return {
      totalFormulas: results.length,
      errorCount,
      warningCount,
      complexityAvg: Math.round(complexityAvg * 100) / 100,
      volatileCount,
      results,
    };
  }

  /**
   * Detect performance bottlenecks in formulas.
   */
  async detectBottlenecks(
    workbookId: string,
    sheet: string
  ): Promise<Array<{ cell: string; formula: string; issue: string; severity: 'high' | 'medium' | 'low' }>> {
    const formulas = await this.extractFormulasFromSheet(workbookId, sheet);
    const bottlenecks: Array<{ cell: string; formula: string; issue: string; severity: 'high' | 'medium' | 'low' }> = [];

    for (const { cell, formula } of formulas) {
      const upper = formula.toUpperCase();

      if (upper.includes('INDIRECT(')) {
        bottlenecks.push({ cell, formula, issue: 'INDIRECT prevents formula caching', severity: 'high' });
      }
      if (upper.includes('OFFSET(')) {
        bottlenecks.push({ cell, formula, issue: 'OFFSET is volatile and recalculates on every change', severity: 'high' });
      }
      if ((upper.match(/VLOOKUP\(/g) || []).length > 1) {
        bottlenecks.push({ cell, formula, issue: 'Multiple VLOOKUP in one cell - consider INDEX/MATCH', severity: 'medium' });
      }
      if (this.calculateComplexity(formula) > 10) {
        bottlenecks.push({ cell, formula, issue: 'High complexity formula - consider breaking into helper cells', severity: 'medium' });
      }
      if (/[A-Z]+:\s*[A-Z]+/i.test(formula)) {
        bottlenecks.push({ cell, formula, issue: 'Full column reference causes unnecessary calculation', severity: 'medium' });
      }
      const volatiles = this.findVolatileDependencies(formula);
      if (volatiles.length > 0) {
        bottlenecks.push({ cell, formula, issue: `Uses volatile functions: ${volatiles.join(', ')}`, severity: 'low' });
      }
    }

    return bottlenecks;
  }

  // --- Private helpers ---

  private async extractFormulasFromSheet(
    workbookId: string,
    sheet: string
  ): Promise<Array<{ cell: string; formula: string }>> {
    const { prisma } = await import('../utils/prisma.js');
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) return [];

    const sheetsJson = ((workbook as any).sheetsJson as Record<string, any>) || {};
    const formulas: Array<{ cell: string; formula: string }> = [];

    if (sheetsJson.sheets && Array.isArray(sheetsJson.sheets)) {
      const sheetData = (sheetsJson.sheets as Array<Record<string, any>>).find((s: Record<string, any>) => s.name === sheet);
      if (sheetData?.cells) {
        for (const [cellRef, cellData] of Object.entries(sheetData.cells)) {
          const data = cellData as Record<string, any>;
          if (data?.formula) {
            formulas.push({ cell: cellRef, formula: data.formula });
          }
        }
      }
    }

    if (sheetsJson.formulas) {
      for (const [cellRef, formula] of Object.entries(sheetsJson.formulas)) {
        if (typeof formula === 'string') {
          formulas.push({ cell: cellRef, formula });
        }
      }
    }

    return formulas;
  }

  private analyzeForOptimization(formula: string): Array<{ optimized: string; reason: string; impact: 'high' | 'medium' | 'low' }> {
    const suggestions: Array<{ optimized: string; reason: string; impact: 'high' | 'medium' | 'low' }> = [];
    const upper = formula.toUpperCase();

    if (upper.includes('VLOOKUP(')) {
      suggestions.push({
        optimized: formula.replace(/VLOOKUP\(/gi, 'XLOOKUP('),
        reason: 'XLOOKUP is more flexible and handles errors better than VLOOKUP',
        impact: 'medium',
      });
    }

    if (/IF\([^,]+,\s*TRUE\s*,\s*FALSE\s*\)/i.test(formula)) {
      suggestions.push({
        optimized: formula.replace(/IF\(([^,]+),\s*TRUE\s*,\s*FALSE\s*\)/gi, '$1'),
        reason: 'Redundant IF wrapping a boolean expression',
        impact: 'low',
      });
    }

    const nestedIfCount = (upper.match(/IF\(/g) || []).length;
    if (nestedIfCount >= 3) {
      suggestions.push({
        optimized: 'Consider IFS() or SWITCH()',
        reason: `${nestedIfCount} nested IFs reduce readability`,
        impact: 'medium',
      });
    }

    return suggestions;
  }

  private detectIssues(formula: string): FormulaIssue[] {
    const issues: FormulaIssue[] = [];
    const upper = formula.toUpperCase();

    // Check for potential division by zero
    if (/\/\s*0\b/.test(formula)) {
      issues.push({ type: 'error', message: 'Potential division by zero', suggestion: 'Wrap with IFERROR()' });
    }

    // Check for hardcoded values in formulas
    if (/[=+\-*/]\s*\d{4,}/.test(formula)) {
      issues.push({ type: 'warning', message: 'Hardcoded large number in formula', suggestion: 'Use a named range or cell reference' });
    }

    // Check for inconsistent range references
    if (upper.includes('INDIRECT(')) {
      issues.push({ type: 'warning', message: 'INDIRECT prevents static analysis', suggestion: 'Use direct cell references when possible' });
    }

    // Check for missing IFERROR on lookups
    if ((upper.includes('VLOOKUP(') || upper.includes('HLOOKUP(') || upper.includes('MATCH(')) && !upper.includes('IFERROR(') && !upper.includes('IFNA(')) {
      issues.push({ type: 'info', message: 'Lookup function without error handling', suggestion: 'Wrap with IFERROR() or IFNA()' });
    }

    return issues;
  }

  private calculateComplexity(formula: string): number {
    let complexity = 1;
    complexity += (formula.match(/\(/g) || []).length;
    complexity += (formula.match(/IF\(/gi) || []).length * 2;
    complexity += (formula.match(/VLOOKUP\(|HLOOKUP\(|XLOOKUP\(|INDEX\(|MATCH\(/gi) || []).length * 2;
    complexity += (formula.match(/SUMPRODUCT\(|AGGREGATE\(/gi) || []).length * 3;
    return complexity;
  }

  private findVolatileDependencies(formula: string): string[] {
    const volatileFunctions = ['NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'INDIRECT', 'OFFSET', 'INFO'];
    const found: string[] = [];
    const upper = formula.toUpperCase();
    for (const fn of volatileFunctions) {
      if (upper.includes(`${fn}(`)) {
        found.push(fn);
      }
    }
    return found;
  }

  private extractCellReferences(formula: string): string[] {
    const refs: string[] = [];
    const cellRefRegex = /\$?([A-Z]+)\$?(\d+)/gi;
    let match: RegExpExecArray | null;
    while ((match = cellRefRegex.exec(formula)) !== null) {
      refs.push(`${match[1].toUpperCase()}${match[2]}`);
    }
    return [...new Set(refs)];
  }
}

export const formulaIntelligenceService = new FormulaIntelligenceService();
