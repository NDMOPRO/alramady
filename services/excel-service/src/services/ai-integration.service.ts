import { logger } from '../utils/logger.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8009';

export class AIIntegrationService {
  /**
   * Convert natural language description to an Excel formula.
   */
  async naturalLanguageToFormula(
    text: string,
    context?: { columns?: string[]; sampleData?: unknown[]; sheetName?: string }
  ): Promise<{ formula: string; explanation: string; confidence: number }> {
    logger.info('NL to formula', { text });
    const result = await this.callAIService('/api/v1/ai/excel/nl-to-formula', {
      text,
      context,
    });
    return result || {
      formula: '',
      explanation: 'AI service unavailable',
      confidence: 0,
    };
  }

  /**
   * Explain a formula in natural language.
   */
  async formulaToNaturalLanguage(
    formula: string,
    locale: string = 'ar'
  ): Promise<{ explanation: string; steps: string[] }> {
    logger.info('Formula to NL', { formula, locale });
    const result = await this.callAIService('/api/v1/ai/excel/formula-to-nl', {
      formula,
      locale,
    });
    return result || {
      explanation: this.basicFormulaExplanation(formula),
      steps: [],
    };
  }

  /**
   * Generate DAX expression from Excel formula or description.
   */
  async generateDAX(
    formula: string,
    context?: { tableName?: string; columns?: string[] }
  ): Promise<{ dax: string; explanation: string }> {
    logger.info('Generate DAX', { formula });
    const result = await this.callAIService('/api/v1/ai/excel/generate-dax', {
      formula,
      context,
    });
    return result || { dax: '', explanation: 'AI service unavailable' };
  }

  /**
   * Generate LookML from spreadsheet structure.
   */
  async generateLookML(
    structure: { tableName: string; columns: Array<{ name: string; type: string }> }
  ): Promise<{ lookml: string; explanation: string }> {
    logger.info('Generate LookML', { tableName: structure.tableName });
    const result = await this.callAIService('/api/v1/ai/excel/generate-lookml', {
      structure,
    });
    return result || { lookml: '', explanation: 'AI service unavailable' };
  }

  /**
   * Suggest a formula based on description.
   */
  async suggestFormula(
    description: string,
    context?: { columns?: string[]; dataTypes?: string[] }
  ): Promise<Array<{ formula: string; explanation: string; confidence: number }>> {
    logger.info('Suggest formula', { description });
    const result = await this.callAIService('/api/v1/ai/excel/suggest-formula', {
      description,
      context,
    });
    return result || [];
  }

  /**
   * Translate formula between Excel locales (e.g., English to Arabic function names).
   */
  async translateFormula(
    formula: string,
    fromLang: string,
    toLang: string
  ): Promise<{ translated: string; mappings: Array<{ from: string; to: string }> }> {
    logger.info('Translate formula', { formula, fromLang, toLang });

    // Built-in translation for common function names
    const translations: Record<string, Record<string, string>> = {
      en: {
        SUM: 'SUM', AVERAGE: 'AVERAGE', IF: 'IF', COUNT: 'COUNT',
        VLOOKUP: 'VLOOKUP', INDEX: 'INDEX', MATCH: 'MATCH',
      },
      ar: {
        SUM: 'مجموع', AVERAGE: 'متوسط', IF: 'إذا', COUNT: 'عدد',
        VLOOKUP: 'بحث_عمودي', INDEX: 'دليل', MATCH: 'مطابقة',
      },
      fr: {
        SUM: 'SOMME', AVERAGE: 'MOYENNE', IF: 'SI', COUNT: 'NB',
        VLOOKUP: 'RECHERCHEV', INDEX: 'INDEX', MATCH: 'EQUIV',
      },
    };

    const fromMap = translations[fromLang] || translations['en'];
    const toMap = translations[toLang] || translations['en'];
    const reverseFrom = Object.fromEntries(Object.entries(fromMap).map(([k, v]) => [v, k]));

    const mappings: Array<{ from: string; to: string }> = [];
    let translated = formula;

    for (const [localName, englishName] of Object.entries(reverseFrom)) {
      if (formula.includes(localName + '(')) {
        const targetName = toMap[englishName] || englishName;
        translated = translated.replace(new RegExp(localName + '\\(', 'g'), targetName + '(');
        if (localName !== targetName) {
          mappings.push({ from: localName, to: targetName });
        }
      }
    }

    return { translated, mappings };
  }

  // --- Private helpers ---

  private async callAIService(endpoint: string, data: unknown): Promise<any> {
    try {
      const response = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        logger.warn('AI service returned non-OK status', { endpoint, status: response.status });
        return null;
      }

      const result = await response.json() as Record<string, unknown>;
      return result.data || result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('AI service call failed', { endpoint, error: message });
      return null;
    }
  }

  private basicFormulaExplanation(formula: string): string {
    const clean = formula.startsWith('=') ? formula.substring(1) : formula;
    const funcMatch = clean.match(/^([A-Z]+)\(/i);
    if (!funcMatch) return `Expression: ${clean}`;

    const descriptions: Record<string, string> = {
      SUM: 'Calculates the sum of values',
      AVERAGE: 'Calculates the average of values',
      IF: 'Evaluates a condition and returns different values',
      VLOOKUP: 'Searches for a value in a table',
      COUNT: 'Counts numeric values',
      COUNTIF: 'Counts values matching a criteria',
      SUMIF: 'Sums values matching a criteria',
      INDEX: 'Returns a value at a specific position',
      MATCH: 'Finds the position of a value',
    };

    const funcName = funcMatch[1].toUpperCase();
    return descriptions[funcName] || `Applies the ${funcName} function`;
  }
}

export const aiIntegrationService = new AIIntegrationService();
