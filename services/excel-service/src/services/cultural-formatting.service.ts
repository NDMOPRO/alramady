import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { getLocaleConfig, getCulturalFormatConfig } from '../utils/locale-config.js';
import type { CulturalFormatConfig } from '../types/formatting.types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'workbook';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface RTLLayoutConfig {
  direction: 'rtl';
  sheetOrder: 'rtl';
  appliedAt: string;
}

interface ArabicFontConfig {
  primary: string;
  secondary: string;
  header: string;
  mono: string;
  appliedAt: string;
}

interface DateFormatConfig {
  range: string;
  locale: string;
  dateFormat: string;
  calendar: string;
  appliedAt: string;
}

interface CurrencyFormatConfig {
  range: string;
  locale: string;
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
  numberFormat: { decimal: string; thousands: string };
  appliedAt: string;
}

interface NumberFormatConfig {
  range: string;
  locale: string;
  decimalSeparator: string;
  thousandsSeparator: string;
  appliedAt: string;
}

interface LanguageDetectionResult {
  language: string;
  confidence: number;
  script: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class CulturalFormattingService {
  /**
   * Set RTL (right-to-left) direction in sheets_json._culturalFormatting for the given sheet.
   */
  async applyRTLLayout(workbookId: string, sheet: string): Promise<RTLLayoutConfig> {
    logger.info('Applying RTL layout', { workbookId, sheet });

    const { prisma } = await import('../utils/prisma.js');
    const { cacheDel } = await import('../utils/redis.js');

    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const sheetsJson = (workbook as unknown as Record<string, unknown>).sheetsJson || {};
    if (!sheetsJson._culturalFormatting) {
      sheetsJson._culturalFormatting = {};
    }
    if (!sheetsJson._culturalFormatting[sheet]) {
      sheetsJson._culturalFormatting[sheet] = {};
    }

    const rtlConfig: RTLLayoutConfig = {
      direction: 'rtl',
      sheetOrder: 'rtl',
      appliedAt: new Date().toISOString(),
    };

    sheetsJson._culturalFormatting[sheet].rtlLayout = rtlConfig;

    await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await cacheDel(`${CACHE_PREFIX}:${workbookId}`);
    logger.info('RTL layout applied', { workbookId, sheet, rtlConfig });

    return rtlConfig;
  }

  /**
   * Set Arabic professional fonts configuration in sheets_json._culturalFormatting for the given sheet.
   */
  async applyArabicFonts(workbookId: string, sheet: string): Promise<ArabicFontConfig> {
    logger.info('Applying Arabic fonts', { workbookId, sheet });

    const { prisma } = await import('../utils/prisma.js');
    const { cacheDel } = await import('../utils/redis.js');

    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const sheetsJson = (workbook as unknown as Record<string, unknown>).sheetsJson || {};
    if (!sheetsJson._culturalFormatting) {
      sheetsJson._culturalFormatting = {};
    }
    if (!sheetsJson._culturalFormatting[sheet]) {
      sheetsJson._culturalFormatting[sheet] = {};
    }

    const fontConfig: ArabicFontConfig = {
      primary: 'Sakkal Majalla',
      secondary: 'Traditional Arabic',
      header: 'Dubai',
      mono: 'Courier New',
      appliedAt: new Date().toISOString(),
    };

    sheetsJson._culturalFormatting[sheet].arabicFonts = fontConfig;

    await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await cacheDel(`${CACHE_PREFIX}:${workbookId}`);
    logger.info('Arabic fonts applied', { workbookId, sheet, fontConfig });

    return fontConfig;
  }

  /**
   * Apply a cultural date format for a specific range within a sheet.
   * Uses the locale configuration to determine the correct date format and calendar system.
   */
  async applyCulturalDateFormat(
    workbookId: string,
    sheet: string,
    range: string,
    locale: string,
  ): Promise<DateFormatConfig> {
    logger.info('Applying cultural date format', { workbookId, sheet, range, locale });

    const { prisma } = await import('../utils/prisma.js');
    const { cacheDel } = await import('../utils/redis.js');

    const localeConfig = getLocaleConfig(locale);

    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const sheetsJson = (workbook as unknown as Record<string, unknown>).sheetsJson || {};
    if (!sheetsJson._culturalFormatting) {
      sheetsJson._culturalFormatting = {};
    }
    if (!sheetsJson._culturalFormatting[sheet]) {
      sheetsJson._culturalFormatting[sheet] = {};
    }
    if (!sheetsJson._culturalFormatting[sheet].dateFormats) {
      sheetsJson._culturalFormatting[sheet].dateFormats = {};
    }

    const dateFormatConfig: DateFormatConfig = {
      range,
      locale: localeConfig.locale,
      dateFormat: localeConfig.dateFormat,
      calendar: localeConfig.calendar,
      appliedAt: new Date().toISOString(),
    };

    sheetsJson._culturalFormatting[sheet].dateFormats[range] = dateFormatConfig;

    await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await cacheDel(`${CACHE_PREFIX}:${workbookId}`);
    logger.info('Cultural date format applied', { workbookId, sheet, range, dateFormatConfig });

    return dateFormatConfig;
  }

  /**
   * Apply cultural currency formatting for a specific range within a sheet.
   * Uses getCulturalFormatConfig to determine currency symbol, position, and number separators.
   */
  async applyCulturalCurrencyFormat(
    workbookId: string,
    sheet: string,
    range: string,
    locale: string,
  ): Promise<CurrencyFormatConfig> {
    logger.info('Applying cultural currency format', { workbookId, sheet, range, locale });

    const { prisma } = await import('../utils/prisma.js');
    const { cacheDel } = await import('../utils/redis.js');

    const culturalConfig: CulturalFormatConfig = getCulturalFormatConfig(locale);

    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const sheetsJson = (workbook as unknown as Record<string, unknown>).sheetsJson || {};
    if (!sheetsJson._culturalFormatting) {
      sheetsJson._culturalFormatting = {};
    }
    if (!sheetsJson._culturalFormatting[sheet]) {
      sheetsJson._culturalFormatting[sheet] = {};
    }
    if (!sheetsJson._culturalFormatting[sheet].currencyFormats) {
      sheetsJson._culturalFormatting[sheet].currencyFormats = {};
    }

    const currencyFormatConfig: CurrencyFormatConfig = {
      range,
      locale: culturalConfig.locale,
      currencySymbol: culturalConfig.currencySymbol,
      currencyPosition: culturalConfig.currencyPosition,
      numberFormat: {
        decimal: culturalConfig.numberFormat.decimal,
        thousands: culturalConfig.numberFormat.thousands,
      },
      appliedAt: new Date().toISOString(),
    };

    sheetsJson._culturalFormatting[sheet].currencyFormats[range] = currencyFormatConfig;

    await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await cacheDel(`${CACHE_PREFIX}:${workbookId}`);
    logger.info('Cultural currency format applied', { workbookId, sheet, range, currencyFormatConfig });

    return currencyFormatConfig;
  }

  /**
   * Apply cultural number formatting (decimal and thousands separators) for a specific range.
   */
  async applyCulturalNumberFormat(
    workbookId: string,
    sheet: string,
    range: string,
    locale: string,
  ): Promise<NumberFormatConfig> {
    logger.info('Applying cultural number format', { workbookId, sheet, range, locale });

    const { prisma } = await import('../utils/prisma.js');
    const { cacheDel } = await import('../utils/redis.js');

    const localeConfig = getLocaleConfig(locale);

    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const sheetsJson = (workbook as unknown as Record<string, unknown>).sheetsJson || {};
    if (!sheetsJson._culturalFormatting) {
      sheetsJson._culturalFormatting = {};
    }
    if (!sheetsJson._culturalFormatting[sheet]) {
      sheetsJson._culturalFormatting[sheet] = {};
    }
    if (!sheetsJson._culturalFormatting[sheet].numberFormats) {
      sheetsJson._culturalFormatting[sheet].numberFormats = {};
    }

    const numberFormatConfig: NumberFormatConfig = {
      range,
      locale: localeConfig.locale,
      decimalSeparator: localeConfig.numberFormat.decimal,
      thousandsSeparator: localeConfig.numberFormat.thousands,
      appliedAt: new Date().toISOString(),
    };

    sheetsJson._culturalFormatting[sheet].numberFormats[range] = numberFormatConfig;

    await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await cacheDel(`${CACHE_PREFIX}:${workbookId}`);
    logger.info('Cultural number format applied', { workbookId, sheet, range, numberFormatConfig });

    return numberFormatConfig;
  }

  /**
   * Detect the language of the given text by analyzing Unicode character ranges.
   * Returns the detected language, confidence score (0-1), and script name.
   */
  detectTextLanguage(text: string): LanguageDetectionResult {
    if (!text || text.trim().length === 0) {
      return { language: 'unknown', confidence: 0, script: 'unknown' };
    }

    const cleanText = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
    if (cleanText.length === 0) {
      return { language: 'unknown', confidence: 0, script: 'unknown' };
    }

    // Count characters in each Unicode script range
    let arabicCount = 0;
    let cjkCount = 0;
    let latinCount = 0;
    let otherCount = 0;

    for (const char of cleanText) {
      const code = char.codePointAt(0)!;

      // Arabic: U+0600-U+06FF, U+0750-U+077F (Arabic Supplement), U+FB50-U+FDFF (Arabic Presentation Forms-A)
      if (
        (code >= 0x0600 && code <= 0x06FF) ||
        (code >= 0x0750 && code <= 0x077F) ||
        (code >= 0xFB50 && code <= 0xFDFF) ||
        (code >= 0xFE70 && code <= 0xFEFF)
      ) {
        arabicCount++;
      }
      // CJK Unified Ideographs and extensions
      else if (
        (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
        (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
        (code >= 0x3000 && code <= 0x303F) ||   // CJK Symbols and Punctuation
        (code >= 0x3040 && code <= 0x309F) ||   // Hiragana
        (code >= 0x30A0 && code <= 0x30FF) ||   // Katakana
        (code >= 0xAC00 && code <= 0xD7AF)      // Hangul Syllables
      ) {
        cjkCount++;
      }
      // Latin: Basic Latin letters + Latin Extended
      else if (
        (code >= 0x0041 && code <= 0x005A) ||   // A-Z
        (code >= 0x0061 && code <= 0x007A) ||   // a-z
        (code >= 0x00C0 && code <= 0x024F)      // Latin Extended
      ) {
        latinCount++;
      } else {
        otherCount++;
      }
    }

    const totalLetters = cleanText.length;
    const arabicRatio = arabicCount / totalLetters;
    const cjkRatio = cjkCount / totalLetters;
    const latinRatio = latinCount / totalLetters;

    // Determine the dominant script
    if (arabicRatio >= cjkRatio && arabicRatio >= latinRatio && arabicCount > 0) {
      return {
        language: 'arabic',
        confidence: Math.round(arabicRatio * 100) / 100,
        script: 'Arabic',
      };
    }

    if (cjkRatio >= arabicRatio && cjkRatio >= latinRatio && cjkCount > 0) {
      // Try to differentiate between CJK languages based on character ranges
      let hiraganaKatakana = 0;
      let hangul = 0;
      let hanzi = 0;

      for (const char of cleanText) {
        const code = char.codePointAt(0)!;
        if ((code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF)) {
          hiraganaKatakana++;
        } else if (code >= 0xAC00 && code <= 0xD7AF) {
          hangul++;
        } else if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF)) {
          hanzi++;
        }
      }

      if (hiraganaKatakana > hangul && hiraganaKatakana > 0) {
        return {
          language: 'japanese',
          confidence: Math.round(cjkRatio * 100) / 100,
          script: 'CJK',
        };
      }
      if (hangul > hiraganaKatakana && hangul > 0) {
        return {
          language: 'korean',
          confidence: Math.round(cjkRatio * 100) / 100,
          script: 'CJK',
        };
      }

      return {
        language: 'chinese',
        confidence: Math.round(cjkRatio * 100) / 100,
        script: 'CJK',
      };
    }

    if (latinCount > 0) {
      return {
        language: 'latin',
        confidence: Math.round(latinRatio * 100) / 100,
        script: 'Latin',
      };
    }

    return {
      language: 'unknown',
      confidence: 0,
      script: 'unknown',
    };
  }
}

export const culturalFormattingService = new CulturalFormattingService();
