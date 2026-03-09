import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface QualityReport {
  id: string;
  projectId: string;
  locale: string;
  overallScore: number;
  checks: QualityCheck[];
  issues: QualityIssue[];
  generatedAt: Date;
}

export interface QualityCheck {
  type: 'consistency' | 'terminology' | 'length' | 'placeholder' | 'rtl' | 'grammar' | 'mt_detection';
  passed: boolean;
  score: number;
  issueCount: number;
  details: string;
}

export interface QualityIssue {
  id: string;
  type: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  stringKey: string;
  sourceText: string;
  translatedText: string;
  description: string;
  suggestion?: string;
  locale: string;
}

export interface GlossaryTerm {
  term: string;
  translation: string;
  locale: string;
  context?: string;
  approved: boolean;
}

export interface TranslationEntry {
  key: string;
  sourceText: string;
  translatedText: string;
  locale: string;
  status: 'draft' | 'reviewed' | 'approved';
}

export interface LengthConstraint {
  key: string;
  maxLength?: number;
  maxLines?: number;
  context: string;
}

export interface ConsistencyResult {
  term: string;
  translations: { text: string; count: number; keys: string[] }[];
  isConsistent: boolean;
}

export interface MtDetectionResult {
  key: string;
  probability: number;
  indicators: string[];
  confidence: 'high' | 'medium' | 'low';
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class QualityAssuranceService {
  private readonly MT_INDICATORS = [
    'literal_translation',
    'unnatural_word_order',
    'missing_context',
    'over_translation',
    'under_translation',
    'incorrect_terminology',
    'mechanical_phrasing',
  ];

  constructor(private prisma: PrismaClient) {}

  async runFullQualityCheck(projectId: string, locale: string): Promise<QualityReport> {
    const translations = await this.getTranslations(projectId, locale);
    const glossary = await this.getGlossary(projectId, locale);
    const lengthConstraints = await this.getLengthConstraints(projectId);

    const checks: QualityCheck[] = [];
    const allIssues: QualityIssue[] = [];

    const consistencyResult = await this.checkConsistency(translations);
    const consistencyIssues = consistencyResult.filter(r => !r.isConsistent).map(r => ({
      id: `cons_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
      type: 'consistency',
      severity: 'major' as const,
      stringKey: r.translations[0]?.keys[0] || '',
      sourceText: r.term,
      translatedText: r.translations.map(t => t.text).join(' | '),
      description: `Term "${r.term}" has ${r.translations.length} different translations`,
      suggestion: `Consider standardizing to "${r.translations[0]?.text}"`,
      locale,
    }));
    allIssues.push(...consistencyIssues);
    checks.push({
      type: 'consistency',
      passed: consistencyIssues.length === 0,
      score: translations.length > 0 ? 1 - (consistencyIssues.length / translations.length) : 1,
      issueCount: consistencyIssues.length,
      details: `${consistencyIssues.length} inconsistencies found`,
    });

    const terminologyIssues = await this.checkTerminology(translations, glossary);
    allIssues.push(...terminologyIssues);
    checks.push({
      type: 'terminology',
      passed: terminologyIssues.length === 0,
      score: translations.length > 0 ? 1 - (terminologyIssues.length / translations.length) : 1,
      issueCount: terminologyIssues.length,
      details: `${terminologyIssues.length} terminology violations found`,
    });

    const lengthIssues = await this.checkLengths(translations, lengthConstraints, locale);
    allIssues.push(...lengthIssues);
    checks.push({
      type: 'length',
      passed: lengthIssues.length === 0,
      score: translations.length > 0 ? 1 - (lengthIssues.length / translations.length) : 1,
      issueCount: lengthIssues.length,
      details: `${lengthIssues.length} length violations found`,
    });

    const placeholderIssues = this.checkPlaceholders(translations, locale);
    allIssues.push(...placeholderIssues);
    checks.push({
      type: 'placeholder',
      passed: placeholderIssues.length === 0,
      score: translations.length > 0 ? 1 - (placeholderIssues.length / translations.length) : 1,
      issueCount: placeholderIssues.length,
      details: `${placeholderIssues.length} placeholder issues found`,
    });

    const rtlIssues = this.checkRtlLtrMixing(translations, locale);
    allIssues.push(...rtlIssues);
    checks.push({
      type: 'rtl',
      passed: rtlIssues.length === 0,
      score: translations.length > 0 ? 1 - (rtlIssues.length / translations.length) : 1,
      issueCount: rtlIssues.length,
      details: `${rtlIssues.length} RTL/LTR issues found`,
    });

    const mtResults = this.detectMachineTranslation(translations, locale);
    const mtIssues = mtResults
      .filter(r => r.probability > 0.7)
      .map(r => ({
        id: `mt_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
        type: 'mt_detection',
        severity: r.probability > 0.9 ? 'major' as const : 'minor' as const,
        stringKey: r.key,
        sourceText: translations.find(t => t.key === r.key)?.sourceText || '',
        translatedText: translations.find(t => t.key === r.key)?.translatedText || '',
        description: `Possible machine translation (${Math.round(r.probability * 100)}% confidence)`,
        suggestion: 'Review and improve translation quality',
        locale,
      }));
    allIssues.push(...mtIssues);
    checks.push({
      type: 'mt_detection',
      passed: mtIssues.length === 0,
      score: translations.length > 0 ? 1 - (mtIssues.length / translations.length) : 1,
      issueCount: mtIssues.length,
      details: `${mtIssues.length} suspected machine translations`,
    });

    const overallScore = checks.length > 0
      ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length
      : 1;

    const report: QualityReport = {
      id: `qr_${Date.now()}`,
      projectId,
      locale,
      overallScore: Math.round(overallScore * 100) / 100,
      checks,
      issues: allIssues,
      generatedAt: new Date(),
    };

    await this.prisma.qualityReport.create({
      data: {
        projectId,
        locale,
        overallScore: report.overallScore,
        checks: JSON.stringify(checks),
        issues: JSON.stringify(allIssues),
        issueCount: allIssues.length,
        generatedAt: new Date(),
      },
    });

    return report;
  }

  async checkConsistency(translations: TranslationEntry[]): Promise<ConsistencyResult[]> {
    const termMap = new Map<string, Map<string, string[]>>();

    for (const entry of translations) {
      const sourceWords = this.tokenize(entry.sourceText);
      for (const word of sourceWords) {
        if (word.length < 3) continue;
        const translationMap = termMap.get(word) || new Map<string, string[]>();
        const keys = translationMap.get(entry.translatedText) || [];
        keys.push(entry.key);
        translationMap.set(entry.translatedText, keys);
        termMap.set(word, translationMap);
      }
    }

    const results: ConsistencyResult[] = [];

    for (const [term, translationMap] of termMap) {
      if (translationMap.size <= 1) continue;
      if (translationMap.size > 5) continue;

      const translationEntries = Array.from(translationMap.entries()).map(([text, keys]) => ({
        text,
        count: keys.length,
        keys,
      }));

      const totalOccurrences = translationEntries.reduce((s, t) => s + t.count, 0);
      if (totalOccurrences < 3) continue;

      const dominant = translationEntries.sort((a, b) => b.count - a.count)[0];
      const isConsistent = dominant.count / totalOccurrences > 0.8;

      results.push({ term, translations: translationEntries, isConsistent });
    }

    return results.filter(r => !r.isConsistent);
  }

  async checkTerminology(
    translations: TranslationEntry[],
    glossary: GlossaryTerm[],
  ): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];
    const approvedTerms = glossary.filter(g => g.approved);

    for (const entry of translations) {
      for (const term of approvedTerms) {
        const sourceContainsTerm = entry.sourceText.toLowerCase().includes(term.term.toLowerCase());
        if (!sourceContainsTerm) continue;

        const translationContainsTerm = entry.translatedText.toLowerCase().includes(term.translation.toLowerCase());
        if (translationContainsTerm) continue;

        const hasPartialMatch = this.fuzzyContains(entry.translatedText, term.translation, 0.8);
        if (hasPartialMatch) continue;

        issues.push({
          id: `term_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
          type: 'terminology',
          severity: 'major',
          stringKey: entry.key,
          sourceText: entry.sourceText,
          translatedText: entry.translatedText,
          description: `Source contains "${term.term}" but translation does not use approved term "${term.translation}"`,
          suggestion: `Use "${term.translation}" for "${term.term}"`,
          locale: entry.locale,
        });
      }
    }

    return issues;
  }

  private fuzzyContains(text: string, search: string, threshold: number): boolean {
    const textLower = text.toLowerCase();
    const searchLower = search.toLowerCase();

    if (textLower.includes(searchLower)) return true;

    const words = textLower.split(/\s+/);
    const searchWords = searchLower.split(/\s+/);

    let matchedWords = 0;
    for (const sw of searchWords) {
      for (const w of words) {
        if (this.levenshteinRatio(w, sw) >= threshold) {
          matchedWords += 1;
          break;
        }
      }
    }

    return searchWords.length > 0 && matchedWords / searchWords.length >= threshold;
  }

  private levenshteinRatio(s1: string, s2: string): number {
    if (s1 === s2) return 1;
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1;

    const matrix: number[][] = Array.from({ length: shorter.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= longer.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= shorter.length; i++) {
      for (let j = 1; j <= longer.length; j++) {
        const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      }
    }

    return 1 - matrix[shorter.length][longer.length] / longer.length;
  }

  async checkLengths(
    translations: TranslationEntry[],
    constraints: LengthConstraint[],
    locale: string,
  ): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];
    const constraintMap = new Map(constraints.map(c => [c.key, c]));

    const expansionFactors: Record<string, number> = {
      'de': 1.3, 'fr': 1.2, 'es': 1.2, 'it': 1.15,
      'ar': 0.9, 'zh': 0.6, 'ja': 0.7, 'ko': 0.8,
      'ru': 1.1, 'pt': 1.2, 'nl': 1.15, 'sv': 1.1,
    };

    for (const entry of translations) {
      const constraint = constraintMap.get(entry.key);
      const translatedLength = entry.translatedText.length;
      const sourceLength = entry.sourceText.length;
      const expansionFactor = expansionFactors[locale] || 1.0;
      const expectedMaxLength = constraint?.maxLength || Math.round(sourceLength * expansionFactor * 1.5);

      if (translatedLength > expectedMaxLength) {
        issues.push({
          id: `len_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
          type: 'length',
          severity: translatedLength > expectedMaxLength * 1.5 ? 'critical' : 'major',
          stringKey: entry.key,
          sourceText: entry.sourceText,
          translatedText: entry.translatedText,
          description: `Translation length (${translatedLength}) exceeds limit (${expectedMaxLength}). Context: ${constraint?.context || 'general'}`,
          suggestion: `Shorten translation to fit within ${expectedMaxLength} characters`,
          locale,
        });
      }

      if (constraint?.maxLines) {
        const lineCount = entry.translatedText.split('\n').length;
        if (lineCount > constraint.maxLines) {
          issues.push({
            id: `lines_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
            type: 'length',
            severity: 'major',
            stringKey: entry.key,
            sourceText: entry.sourceText,
            translatedText: entry.translatedText,
            description: `Translation has ${lineCount} lines but max is ${constraint.maxLines}`,
            locale,
          });
        }
      }

      if (translatedLength === 0 && sourceLength > 0) {
        issues.push({
          id: `empty_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
          type: 'length',
          severity: 'critical',
          stringKey: entry.key,
          sourceText: entry.sourceText,
          translatedText: '',
          description: 'Translation is empty',
          locale,
        });
      }
    }

    return issues;
  }

  checkPlaceholders(translations: TranslationEntry[], locale: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const placeholderPatterns = [
      /\{(\w+)\}/g,
      /%[sd@]/g,
      /\{\{(\w+)\}\}/g,
      /%(\d+)\$[sd]/g,
      /<(\w+)[^>]*>/g,
    ];

    for (const entry of translations) {
      for (const pattern of placeholderPatterns) {
        const sourceMatches = [...entry.sourceText.matchAll(new RegExp(pattern.source, 'g'))];
        const translationMatches = [...entry.translatedText.matchAll(new RegExp(pattern.source, 'g'))];

        if (sourceMatches.length === 0) continue;

        const sourcePlaceholders = sourceMatches.map(m => m[0]).sort();
        const translationPlaceholders = translationMatches.map(m => m[0]).sort();

        const missingInTranslation = sourcePlaceholders.filter(
          sp => !translationPlaceholders.includes(sp),
        );
        const extraInTranslation = translationPlaceholders.filter(
          tp => !sourcePlaceholders.includes(tp),
        );

        if (missingInTranslation.length > 0) {
          issues.push({
            id: `ph_miss_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
            type: 'placeholder',
            severity: 'critical',
            stringKey: entry.key,
            sourceText: entry.sourceText,
            translatedText: entry.translatedText,
            description: `Missing placeholders in translation: ${missingInTranslation.join(', ')}`,
            suggestion: `Add missing placeholders: ${missingInTranslation.join(', ')}`,
            locale,
          });
        }

        if (extraInTranslation.length > 0) {
          issues.push({
            id: `ph_extra_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
            type: 'placeholder',
            severity: 'major',
            stringKey: entry.key,
            sourceText: entry.sourceText,
            translatedText: entry.translatedText,
            description: `Extra placeholders in translation: ${extraInTranslation.join(', ')}`,
            locale,
          });
        }
      }
    }

    return issues;
  }

  checkRtlLtrMixing(translations: TranslationEntry[], locale: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const rtlLocales = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi']);
    const isRtlLocale = rtlLocales.has(locale);
    const rtlPattern = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const ltrPattern = /[a-zA-Z]/;

    for (const entry of translations) {
      const text = entry.translatedText;
      const hasRtl = rtlPattern.test(text);
      const hasLtr = ltrPattern.test(text);

      if (isRtlLocale && !hasRtl && text.length > 3) {
        issues.push({
          id: `rtl_missing_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
          type: 'rtl',
          severity: 'major',
          stringKey: entry.key,
          sourceText: entry.sourceText,
          translatedText: text,
          description: 'RTL locale but translation contains no RTL characters',
          suggestion: 'Ensure the translation is in the correct language/script',
          locale,
        });
      }

      if (hasRtl && hasLtr) {
        const segments = text.split(/\s+/);
        let directionChanges = 0;
        let prevIsRtl: boolean | null = null;

        for (const segment of segments) {
          const segIsRtl = rtlPattern.test(segment);
          const segIsLtr = ltrPattern.test(segment);
          if (segIsRtl && prevIsRtl === false) directionChanges += 1;
          if (segIsLtr && prevIsRtl === true) directionChanges += 1;
          if (segIsRtl) prevIsRtl = true;
          else if (segIsLtr) prevIsRtl = false;
        }

        if (directionChanges > 3) {
          issues.push({
            id: `rtl_mix_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
            type: 'rtl',
            severity: 'minor',
            stringKey: entry.key,
            sourceText: entry.sourceText,
            translatedText: text,
            description: `Frequent RTL/LTR direction changes (${directionChanges} switches) may cause display issues`,
            suggestion: 'Consider using Unicode bidi control characters or restructuring the text',
            locale,
          });
        }

        const hasControlChars = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(text);
        if (!hasControlChars && directionChanges > 1) {
          issues.push({
            id: `rtl_bidi_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
            type: 'rtl',
            severity: 'info',
            stringKey: entry.key,
            sourceText: entry.sourceText,
            translatedText: text,
            description: 'Mixed direction text without explicit bidi control characters',
            suggestion: 'Add Unicode bidi control characters for correct rendering',
            locale,
          });
        }
      }
    }

    return issues;
  }

  detectMachineTranslation(translations: TranslationEntry[], locale: string): MtDetectionResult[] {
    const results: MtDetectionResult[] = [];

    for (const entry of translations) {
      const indicators: string[] = [];
      let score = 0;

      const sourceWords = this.tokenize(entry.sourceText);
      const translatedWords = this.tokenize(entry.translatedText);
      const wordCountRatio = translatedWords.length / (sourceWords.length || 1);

      if (Math.abs(wordCountRatio - 1.0) < 0.1 && sourceWords.length > 5) {
        indicators.push('literal_translation');
        score += 0.2;
      }

      const sourceWordOrder = sourceWords.slice(0, 5).join(' ').toLowerCase();
      const translatedWordOrder = translatedWords.slice(0, 5).join(' ').toLowerCase();
      if (sourceWordOrder === translatedWordOrder && sourceWords.length > 3) {
        indicators.push('unnatural_word_order');
        score += 0.25;
      }

      const hasUnusualPunctuation = /[！？。、]/.test(entry.translatedText) && !/[！？。、]/.test(entry.sourceText);
      if (hasUnusualPunctuation) {
        indicators.push('mechanical_phrasing');
        score += 0.15;
      }

      const repeatedPatterns = this.detectRepeatedPatterns(entry.translatedText);
      if (repeatedPatterns > 2) {
        indicators.push('over_translation');
        score += 0.15;
      }

      if (entry.translatedText.length < entry.sourceText.length * 0.3 && entry.sourceText.length > 20) {
        indicators.push('under_translation');
        score += 0.2;
      }

      const hasUntranslatedChunks = this.detectUntranslatedChunks(entry.sourceText, entry.translatedText);
      if (hasUntranslatedChunks) {
        indicators.push('missing_context');
        score += 0.15;
      }

      const probability = Math.min(1, score);
      let confidence: 'high' | 'medium' | 'low' = 'low';
      if (probability > 0.7) confidence = 'high';
      else if (probability > 0.4) confidence = 'medium';

      if (indicators.length > 0) {
        results.push({
          key: entry.key,
          probability: Math.round(probability * 100) / 100,
          indicators,
          confidence,
        });
      }
    }

    return results;
  }

  private detectRepeatedPatterns(text: string): number {
    const words = text.split(/\s+/);
    let repeats = 0;
    for (let i = 1; i < words.length; i++) {
      if (words[i] === words[i - 1] && words[i].length > 2) {
        repeats += 1;
      }
    }
    return repeats;
  }

  private detectUntranslatedChunks(source: string, translation: string): boolean {
    const sourceWords = this.tokenize(source);
    const translationLower = translation.toLowerCase();
    let untranslatedCount = 0;

    for (const word of sourceWords) {
      if (word.length > 4 && translationLower.includes(word.toLowerCase())) {
        untranslatedCount += 1;
      }
    }

    return sourceWords.length > 5 && untranslatedCount / sourceWords.length > 0.5;
  }

  private tokenize(text: string): string[] {
    return text
      .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  private async getTranslations(projectId: string, locale: string): Promise<TranslationEntry[]> {
    const entries = await this.prisma.translationEntry.findMany({
      where: { projectId, locale },
    });
    return entries.map(e => ({
      key: e.key,
      sourceText: e.sourceText,
      translatedText: e.translatedText,
      locale: e.locale,
      status: e.status as TranslationEntry['status'],
    }));
  }

  private async getGlossary(_projectId: string, locale: string): Promise<GlossaryTerm[]> {
    const terms = await this.prisma.glossaryTerm.findMany({
      where: { isApproved: true },
    });
    return terms.map(t => {
      const translations = t.translations as Record<string, string> | null;
      const translation = translations ? (translations[locale] || Object.values(translations)[0] || '') : '';
      return {
        term: t.term,
        translation,
        locale,
        context: t.context || undefined,
        approved: t.isApproved,
      };
    });
  }

  private async getLengthConstraints(projectId: string): Promise<LengthConstraint[]> {
    const constraints = await this.prisma.lengthConstraint.findMany({
      where: { projectId },
    });
    return constraints.map(c => ({
      key: c.key,
      maxLength: c.maxLength || undefined,
      maxLines: c.maxLines || undefined,
      context: c.context,
    }));
  }

  // ─── Title Prominence Measurement ───────────────────────────────────────────

  measureTitleProminence(
    title: string,
    locale: string,
    context: { containerWidth: number; fontSize: number; fontWeight: number }
  ): TitleProminenceResult {
    const rtlLocales = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd']);
    const isRtl = rtlLocales.has(locale);

    const charWidthFactor = this.estimateCharWidthFactor(title, locale);
    const estimatedTextWidth = title.length * context.fontSize * charWidthFactor;
    const widthRatio = estimatedTextWidth / context.containerWidth;

    const issues: TitleProminenceIssue[] = [];
    let prominenceScore = 100;

    // Check if title overflows container
    if (widthRatio > 1.0) {
      const overflowPercent = Math.round((widthRatio - 1.0) * 100);
      issues.push({
        type: 'overflow',
        severity: widthRatio > 1.3 ? 'critical' : 'major',
        message: `Title overflows container by ~${overflowPercent}%`,
        suggestion: 'Shorten the translation or reduce font size',
      });
      prominenceScore -= Math.min(40, overflowPercent);
    }

    // Check if title is too short (under-prominent)
    if (widthRatio < 0.2 && title.length > 0) {
      issues.push({
        type: 'under_prominent',
        severity: 'minor',
        message: `Title uses only ~${Math.round(widthRatio * 100)}% of available width`,
        suggestion: 'Consider using a more descriptive translation',
      });
      prominenceScore -= 10;
    }

    // Check font weight appropriateness
    if (context.fontWeight < 600) {
      issues.push({
        type: 'low_weight',
        severity: 'info',
        message: 'Title font weight is below semi-bold (600)',
        suggestion: 'Use font-weight >= 600 for titles',
      });
      prominenceScore -= 5;
    }

    // Check for RTL-specific issues
    if (isRtl) {
      const hasLeadingLtr = /^[a-zA-Z0-9]/.test(title);
      if (hasLeadingLtr) {
        issues.push({
          type: 'rtl_alignment',
          severity: 'major',
          message: 'RTL title starts with LTR characters, may cause alignment issues',
          suggestion: 'Add RTL mark (\\u200F) at the beginning or restructure the title',
        });
        prominenceScore -= 15;
      }

      const arabicDiacritics = title.match(/[\u064B-\u065F\u0670]/g);
      if (arabicDiacritics && arabicDiacritics.length > title.length * 0.3) {
        issues.push({
          type: 'excessive_diacritics',
          severity: 'minor',
          message: 'Title has many diacritics which may affect readability at small sizes',
          suggestion: 'Remove optional diacritics for titles',
        });
        prominenceScore -= 5;
      }
    }

    // Check line count when wrapped
    const estimatedLines = Math.ceil(widthRatio);
    if (estimatedLines > 2) {
      issues.push({
        type: 'multi_line',
        severity: estimatedLines > 3 ? 'critical' : 'major',
        message: `Title would wrap to ~${estimatedLines} lines`,
        suggestion: 'Shorten title to fit within 1-2 lines',
      });
      prominenceScore -= (estimatedLines - 2) * 15;
    }

    return {
      title,
      locale,
      prominenceScore: Math.max(0, Math.min(100, prominenceScore)),
      estimatedTextWidth: Math.round(estimatedTextWidth),
      containerWidth: context.containerWidth,
      widthRatio: Math.round(widthRatio * 100) / 100,
      estimatedLines,
      isRtl,
      issues,
    };
  }

  measureBatchTitleProminence(
    titles: Array<{ key: string; title: string; locale: string }>,
    context: { containerWidth: number; fontSize: number; fontWeight: number }
  ): Map<string, TitleProminenceResult> {
    const results = new Map<string, TitleProminenceResult>();
    for (const entry of titles) {
      results.set(entry.key, this.measureTitleProminence(entry.title, entry.locale, context));
    }
    return results;
  }

  private estimateCharWidthFactor(text: string, locale: string): number {
    const cjkPattern = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/;
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

    if (cjkPattern.test(text)) return 1.0;
    if (arabicPattern.test(text)) return 0.55;

    const wideLocales: Record<string, number> = {
      'de': 0.62, 'ru': 0.58, 'fi': 0.60, 'nl': 0.60,
      'el': 0.58, 'th': 0.55, 'hi': 0.55,
    };
    return wideLocales[locale] ?? 0.55;
  }
}

export interface TitleProminenceResult {
  title: string;
  locale: string;
  prominenceScore: number;
  estimatedTextWidth: number;
  containerWidth: number;
  widthRatio: number;
  estimatedLines: number;
  isRtl: boolean;
  issues: TitleProminenceIssue[];
}

export interface TitleProminenceIssue {
  type: 'overflow' | 'under_prominent' | 'low_weight' | 'rtl_alignment' | 'excessive_diacritics' | 'multi_line';
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
  suggestion: string;
}
