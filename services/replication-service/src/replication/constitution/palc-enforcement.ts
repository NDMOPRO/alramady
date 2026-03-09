/**
 * PALC (Professional Arabic Localization Constitution) Enforcement
 * Rules PALC-001 through PALC-016: Arabic typography, linguistic accuracy,
 * RTL layout, cultural formatting, and Hijri calendar validation.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

export interface PALCRuleResult {
  ruleId: string;
  passed: boolean;
  actual: number | string;
  threshold: number | string;
  description: string;
  category: 'typography' | 'linguistic' | 'cultural' | 'layout' | 'formatting';
}

export interface PALCEnforcementReport {
  passed: boolean;
  timestamp: number;
  rules: PALCRuleResult[];
  failedCount: number;
  passedCount: number;
  overallScore: number;
  hash: string;
}

export interface TypographyMetrics {
  fontFamilyCorrect: boolean;
  fontSizePreserved: boolean;
  lineHeightRatio: number;
  letterSpacingCorrect: boolean;
  kerningScore: number;
  ligatureSupport: boolean;
  diacriticsRendered: boolean;
  kashidaExtension: boolean;
  overallScore: number;
}

export interface TranslationMetrics {
  accuracy: number;
  fluency: number;
  terminology: number;
  grammarCorrect: boolean;
  contextPreserved: boolean;
  meaningScore: number;
}

export interface CulturalFormattingData {
  dateFormat: string;
  numberFormat: string;
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
  calendarType: 'hijri' | 'gregorian' | 'both';
  textDirection: 'rtl' | 'ltr';
  digitType: 'arabic' | 'hindi' | 'mixed';
  weekStart: 'saturday' | 'sunday' | 'monday';
}

/** Arabic/Hindi numeral mapping */
const ARABIC_EASTERN_DIGITS: Record<string, string> = {
  '0': '\u0660', '1': '\u0661', '2': '\u0662', '3': '\u0663', '4': '\u0664',
  '5': '\u0665', '6': '\u0666', '7': '\u0667', '8': '\u0668', '9': '\u0669',
};

/** Common Arabic font families considered acceptable */
const VALID_ARABIC_FONTS = new Set([
  'Noto Sans Arabic', 'Noto Kufi Arabic', 'Cairo', 'Tajawal', 'Amiri',
  'Scheherazade', 'Lateef', 'Harmattan', 'IBM Plex Sans Arabic',
  'Dubai', 'Droid Arabic Kufi', 'Droid Arabic Naskh',
  'Traditional Arabic', 'Simplified Arabic', 'Arabic Typesetting',
  'Sakkal Majalla', 'Microsoft Uighur', 'Al Bayan',
]);

export class PALCEnforcement {
  /**
   * Enforce Arabic localization quality across all PALC rules.
   */
  enforceArabicLocalization(content: {
    text?: string;
    typography?: TypographyMetrics;
    translation?: TranslationMetrics;
    cultural?: CulturalFormattingData;
    fontFamily?: string;
  }): PALCEnforcementReport {
    const rules: PALCRuleResult[] = [];

    // PALC-001: Text direction must be RTL
    const isRtl = content.cultural?.textDirection === 'rtl';
    rules.push({
      ruleId: 'PALC-001', passed: isRtl, actual: content.cultural?.textDirection ?? 'unknown',
      threshold: 'rtl', description: 'Text direction must be RTL for Arabic content',
      category: 'layout',
    });

    // PALC-002: Arabic font family required
    const fontValid = content.fontFamily ? VALID_ARABIC_FONTS.has(content.fontFamily) : false;
    rules.push({
      ruleId: 'PALC-002', passed: fontValid, actual: content.fontFamily ?? 'none',
      threshold: 'valid Arabic font', description: 'Font family must support Arabic glyphs',
      category: 'typography',
    });

    // PALC-003: Typography integrity score >= 0.95
    const typoScore = content.typography?.overallScore ?? 0;
    rules.push({
      ruleId: 'PALC-003', passed: typoScore >= 0.95, actual: typoScore,
      threshold: 0.95, description: 'Typography integrity score must be >= 0.95',
      category: 'typography',
    });

    // PALC-004: Diacritics rendering support
    const diacritics = content.typography?.diacriticsRendered ?? false;
    rules.push({
      ruleId: 'PALC-004', passed: diacritics, actual: String(diacritics),
      threshold: 'true', description: 'Diacritics (tashkeel) must render correctly',
      category: 'typography',
    });

    // PALC-005: Kashida extension support
    const kashida = content.typography?.kashidaExtension ?? false;
    rules.push({
      ruleId: 'PALC-005', passed: kashida, actual: String(kashida),
      threshold: 'true', description: 'Kashida justification extension must be supported',
      category: 'typography',
    });

    // PALC-006: Ligature support
    const ligatures = content.typography?.ligatureSupport ?? false;
    rules.push({
      ruleId: 'PALC-006', passed: ligatures, actual: String(ligatures),
      threshold: 'true', description: 'Arabic ligatures (lam-alef etc.) must render',
      category: 'typography',
    });

    // PALC-007: Translation accuracy >= 0.98
    const translationAcc = content.translation?.accuracy ?? 0;
    rules.push({
      ruleId: 'PALC-007', passed: translationAcc >= 0.98, actual: translationAcc,
      threshold: 0.98, description: 'Linguistic accuracy must be >= 0.98',
      category: 'linguistic',
    });

    // PALC-008: Translation fluency >= 0.95
    const fluency = content.translation?.fluency ?? 0;
    rules.push({
      ruleId: 'PALC-008', passed: fluency >= 0.95, actual: fluency,
      threshold: 0.95, description: 'Translation fluency must be >= 0.95',
      category: 'linguistic',
    });

    // PALC-009: Grammar correctness
    const grammar = content.translation?.grammarCorrect ?? false;
    rules.push({
      ruleId: 'PALC-009', passed: grammar, actual: String(grammar),
      threshold: 'true', description: 'Arabic grammar must be correct',
      category: 'linguistic',
    });

    // PALC-010: Context preservation
    const context = content.translation?.contextPreserved ?? false;
    rules.push({
      ruleId: 'PALC-010', passed: context, actual: String(context),
      threshold: 'true', description: 'Original context and meaning must be preserved',
      category: 'linguistic',
    });

    // PALC-011: Date format (Hijri support)
    const dateOk = content.cultural?.calendarType === 'hijri' || content.cultural?.calendarType === 'both';
    rules.push({
      ruleId: 'PALC-011', passed: dateOk, actual: content.cultural?.calendarType ?? 'unknown',
      threshold: 'hijri or both', description: 'Hijri calendar must be supported',
      category: 'cultural',
    });

    // PALC-012: Currency formatting (SAR)
    const currencyOk = content.cultural?.currencySymbol === 'ر.س' || content.cultural?.currencySymbol === 'SAR';
    rules.push({
      ruleId: 'PALC-012', passed: currencyOk, actual: content.cultural?.currencySymbol ?? 'unknown',
      threshold: 'ر.س or SAR', description: 'Saudi Riyal currency must be correctly formatted',
      category: 'cultural',
    });

    // PALC-013: Number format (Eastern Arabic digits support)
    const digitOk = content.cultural?.digitType === 'arabic' || content.cultural?.digitType === 'hindi';
    rules.push({
      ruleId: 'PALC-013', passed: digitOk, actual: content.cultural?.digitType ?? 'unknown',
      threshold: 'arabic or hindi', description: 'Digit type must support Arabic/Hindi numerals',
      category: 'formatting',
    });

    // PALC-014: Week starts on Saturday or Sunday (Saudi standard)
    const weekOk = content.cultural?.weekStart === 'saturday' || content.cultural?.weekStart === 'sunday';
    rules.push({
      ruleId: 'PALC-014', passed: weekOk, actual: content.cultural?.weekStart ?? 'unknown',
      threshold: 'saturday or sunday', description: 'Week must start on Saturday or Sunday',
      category: 'cultural',
    });

    // PALC-015: Kerning quality
    const kerning = content.typography?.kerningScore ?? 0;
    rules.push({
      ruleId: 'PALC-015', passed: kerning >= 0.90, actual: kerning,
      threshold: 0.90, description: 'Kerning quality must be >= 0.90',
      category: 'typography',
    });

    // PALC-016: Line height ratio for Arabic text
    const lineHeight = content.typography?.lineHeightRatio ?? 0;
    const lineHeightOk = lineHeight >= 1.4 && lineHeight <= 2.0;
    rules.push({
      ruleId: 'PALC-016', passed: lineHeightOk, actual: lineHeight,
      threshold: '1.4-2.0', description: 'Arabic line height ratio must be between 1.4 and 2.0',
      category: 'typography',
    });

    const failedCount = rules.filter((r) => !r.passed).length;
    const passedCount = rules.filter((r) => r.passed).length;
    const overallScore = passedCount / rules.length;

    const reportHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(rules))
      .digest('hex');

    const report: PALCEnforcementReport = {
      passed: failedCount === 0,
      timestamp: Date.now(),
      rules,
      failedCount,
      passedCount,
      overallScore,
      hash: reportHash,
    };

    logger.info('PALC enforcement completed', {
      passed: report.passed,
      failedCount,
      overallScore: overallScore.toFixed(3),
    });

    return report;
  }

  /** Check typography integrity, returning pass/fail for the >= 0.95 threshold */
  checkTypographyIntegrity(metrics: TypographyMetrics): PALCRuleResult {
    const passed = metrics.overallScore >= 0.95;
    logger.debug('Typography integrity check', { score: metrics.overallScore, passed });
    return {
      ruleId: 'PALC-003',
      passed,
      actual: metrics.overallScore,
      threshold: 0.95,
      description: `Typography integrity ${metrics.overallScore.toFixed(3)} must be >= 0.95`,
      category: 'typography',
    };
  }

  /** Check linguistic accuracy, returning pass/fail for the >= 0.98 threshold */
  checkLinguisticAccuracy(translation: TranslationMetrics): PALCRuleResult {
    const passed = translation.accuracy >= 0.98;
    logger.debug('Linguistic accuracy check', { accuracy: translation.accuracy, passed });
    return {
      ruleId: 'PALC-007',
      passed,
      actual: translation.accuracy,
      threshold: 0.98,
      description: `Linguistic accuracy ${translation.accuracy.toFixed(3)} must be >= 0.98`,
      category: 'linguistic',
    };
  }

  /** Validate cultural formatting is 100% correct */
  validateCulturalFormatting(data: CulturalFormattingData): {
    passed: boolean;
    violations: string[];
    score: number;
  } {
    const violations: string[] = [];

    if (data.textDirection !== 'rtl') {
      violations.push('Text direction must be RTL');
    }
    if (data.calendarType !== 'hijri' && data.calendarType !== 'both') {
      violations.push('Hijri calendar required');
    }
    if (data.currencySymbol !== 'ر.س' && data.currencySymbol !== 'SAR') {
      violations.push(`Invalid currency symbol: ${data.currencySymbol}`);
    }
    if (data.currencyPosition !== 'after') {
      violations.push('Currency symbol must follow the amount in Arabic');
    }
    if (data.digitType !== 'arabic' && data.digitType !== 'hindi') {
      violations.push(`Invalid digit type: ${data.digitType}`);
    }
    if (data.weekStart !== 'saturday' && data.weekStart !== 'sunday') {
      violations.push(`Invalid week start: ${data.weekStart}`);
    }

    const totalChecks = 6;
    const score = (totalChecks - violations.length) / totalChecks;
    const passed = violations.length === 0;

    logger.info('Cultural formatting validation', { passed, violations: violations.length, score });
    return { passed, violations, score };
  }

  /** Convert Western digits to Eastern Arabic digits */
  toEasternArabicDigits(input: string): string {
    return input.replace(/[0-9]/g, (d) => ARABIC_EASTERN_DIGITS[d] ?? d);
  }
}

export const palcEnforcement = new PALCEnforcement();
