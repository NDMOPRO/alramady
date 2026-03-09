/**
 * Cultural Data Formatting Engine
 * Formats data values according to cultural conventions including
 * currency, decimals, numerals, dates (Hijri), and chart axis direction.
 */

import { logger } from '../../utils/logger.js';

/** Supported locale identifiers */
export type SupportedLocale = 'ar-SA' | 'ar-AE' | 'ar-EG' | 'en-US' | 'en-GB';

/** Numeral system */
export type NumeralSystem = 'eastern-arabic' | 'western';

/** Data value types for formatting */
export interface DataValue {
  type: 'currency' | 'number' | 'percentage' | 'date' | 'text';
  value: number | string | Date;
  currency?: string;
  decimals?: number;
}

/** Formatted data result */
export interface FormattedData {
  original: DataValue;
  formatted: string;
  locale: SupportedLocale;
  numeralSystem: NumeralSystem;
  direction: 'ltr' | 'rtl';
}

/** Chart direction config for RTL */
export interface ChartDirectionConfig {
  axisDirection: 'ltr' | 'rtl';
  legendPosition: 'right' | 'left';
  labelAlignment: 'start' | 'end';
}

/** Locale configuration */
interface LocaleConfig {
  numeralSystem: NumeralSystem;
  decimalSeparator: string;
  thousandsSeparator: string;
  direction: 'ltr' | 'rtl';
  currencyPosition: 'before' | 'after';
  percentPosition: 'before' | 'after';
  dateOrder: 'dmy' | 'mdy' | 'ymd';
  hijriSupport: boolean;
  monthNames: string[];
  hijriMonthNames: string[];
}

/** Western to Eastern Arabic numeral mapping */
const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '0': '\u0660', '1': '\u0661', '2': '\u0662', '3': '\u0663', '4': '\u0664',
  '5': '\u0665', '6': '\u0666', '7': '\u0667', '8': '\u0668', '9': '\u0669',
};

/** Currency symbols and names */
const CURRENCY_MAP: Record<string, { symbolAr: string; symbolEn: string; nameAr: string }> = {
  SAR: { symbolAr: 'ر.س', symbolEn: 'SAR', nameAr: 'ريال سعودي' },
  AED: { symbolAr: 'د.إ', symbolEn: 'AED', nameAr: 'درهم إماراتي' },
  EGP: { symbolAr: 'ج.م', symbolEn: 'EGP', nameAr: 'جنيه مصري' },
  USD: { symbolAr: '$', symbolEn: '$', nameAr: 'دولار أمريكي' },
  EUR: { symbolAr: '€', symbolEn: '€', nameAr: 'يورو' },
  GBP: { symbolAr: '£', symbolEn: '£', nameAr: 'جنيه إسترليني' },
  KWD: { symbolAr: 'د.ك', symbolEn: 'KWD', nameAr: 'دينار كويتي' },
  BHD: { symbolAr: 'د.ب', symbolEn: 'BHD', nameAr: 'دينار بحريني' },
  QAR: { symbolAr: 'ر.ق', symbolEn: 'QAR', nameAr: 'ريال قطري' },
  OMR: { symbolAr: 'ر.ع', symbolEn: 'OMR', nameAr: 'ريال عماني' },
};

const LOCALE_CONFIGS: Record<SupportedLocale, LocaleConfig> = {
  'ar-SA': {
    numeralSystem: 'eastern-arabic',
    decimalSeparator: '\u066B',
    thousandsSeparator: '\u066C',
    direction: 'rtl',
    currencyPosition: 'after',
    percentPosition: 'before',
    dateOrder: 'dmy',
    hijriSupport: true,
    monthNames: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    hijriMonthNames: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
  },
  'ar-AE': {
    numeralSystem: 'eastern-arabic',
    decimalSeparator: '\u066B',
    thousandsSeparator: '\u066C',
    direction: 'rtl',
    currencyPosition: 'after',
    percentPosition: 'before',
    dateOrder: 'dmy',
    hijriSupport: true,
    monthNames: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    hijriMonthNames: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
  },
  'ar-EG': {
    numeralSystem: 'western',
    decimalSeparator: '\u066B',
    thousandsSeparator: '\u066C',
    direction: 'rtl',
    currencyPosition: 'after',
    percentPosition: 'before',
    dateOrder: 'dmy',
    hijriSupport: false,
    monthNames: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    hijriMonthNames: [],
  },
  'en-US': {
    numeralSystem: 'western',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    direction: 'ltr',
    currencyPosition: 'before',
    percentPosition: 'after',
    dateOrder: 'mdy',
    hijriSupport: false,
    monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    hijriMonthNames: [],
  },
  'en-GB': {
    numeralSystem: 'western',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    direction: 'ltr',
    currencyPosition: 'before',
    percentPosition: 'after',
    dateOrder: 'dmy',
    hijriSupport: false,
    monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    hijriMonthNames: [],
  },
};

/**
 * Converts Western digits to Eastern Arabic numerals.
 */
function toEasternArabic(str: string): string {
  return str.replace(/[0-9]/g, d => EASTERN_ARABIC_DIGITS[d] ?? d);
}

/**
 * Formats a number with separators for the given locale.
 */
function formatNumber(value: number, decimals: number, config: LocaleConfig): string {
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const fixed = absValue.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');

  let formattedInt = '';
  const digits = intPart.split('').reverse();
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && i % 3 === 0) {
      formattedInt = config.thousandsSeparator + formattedInt;
    }
    formattedInt = digits[i] + formattedInt;
  }

  let result = decPart
    ? `${formattedInt}${config.decimalSeparator}${decPart}`
    : formattedInt;

  if (config.numeralSystem === 'eastern-arabic') {
    result = toEasternArabic(result);
  }

  if (isNegative) {
    result = config.direction === 'rtl' ? `${result}-` : `-${result}`;
  }

  return result;
}

/**
 * Formats a currency value for the given locale.
 */
function formatCurrency(value: number, currencyCode: string, config: LocaleConfig, locale: SupportedLocale): string {
  const decimals = currencyCode === 'BHD' || currencyCode === 'KWD' || currencyCode === 'OMR' ? 3 : 2;
  const formatted = formatNumber(value, decimals, config);

  const currencyInfo = CURRENCY_MAP[currencyCode];
  const isArabic = locale.startsWith('ar');
  const symbol = currencyInfo
    ? (isArabic ? currencyInfo.symbolAr : currencyInfo.symbolEn)
    : currencyCode;

  if (config.currencyPosition === 'after') {
    return `${formatted} ${symbol}`;
  }
  return `${symbol}${formatted}`;
}

/**
 * Formats a percentage value.
 */
function formatPercentage(value: number, config: LocaleConfig): string {
  const formatted = formatNumber(value, 1, config);
  if (config.percentPosition === 'before') {
    return `٪${formatted}`;
  }
  return `${formatted}%`;
}

/**
 * Converts a Gregorian date to approximate Hijri date.
 * Uses the Tabular Islamic Calendar algorithm.
 */
function gregorianToHijri(date: Date): { year: number; month: number; day: number } {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();

  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d - 1524.5;
  const l = Math.floor(jd - 1948439.5 + 10632);
  const n = Math.floor((l - 1) / 10631);
  const remainder = l - 10631 * n + 354;
  const j = Math.floor((10985 - remainder) / 5316) * Math.floor(50 * remainder / 17719) +
            Math.floor(remainder / 5670) * Math.floor(43 * remainder / 15238);
  const adjustedL = remainder - Math.floor(30 - j) / 15 * Math.floor(17719 * j / 50) -
                    Math.floor(j / 16) * Math.floor(15238 * j / 43) + 29;
  const hijriMonth = Math.floor(24 * adjustedL / 709);
  const hijriDay = adjustedL - Math.floor(709 * hijriMonth / 24);
  const hijriYear = 30 * n + j - 30;

  return {
    year: Math.max(1, hijriYear),
    month: Math.max(1, Math.min(12, hijriMonth)),
    day: Math.max(1, Math.min(30, hijriDay)),
  };
}

/**
 * Formats a date value for the given locale, with optional Hijri conversion.
 */
function formatDate(date: Date, config: LocaleConfig, locale: SupportedLocale): string {
  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();

  if (config.hijriSupport) {
    const hijri = gregorianToHijri(date);
    const monthName = config.hijriMonthNames[hijri.month - 1] ?? '';
    const dayStr = config.numeralSystem === 'eastern-arabic'
      ? toEasternArabic(String(hijri.day))
      : String(hijri.day);
    const yearStr = config.numeralSystem === 'eastern-arabic'
      ? toEasternArabic(String(hijri.year))
      : String(hijri.year);
    return `${dayStr} ${monthName} ${yearStr} هـ`;
  }

  const monthName = config.monthNames[month] ?? '';
  const dayStr = config.numeralSystem === 'eastern-arabic' ? toEasternArabic(String(day)) : String(day);
  const yearStr = config.numeralSystem === 'eastern-arabic' ? toEasternArabic(String(year)) : String(year);

  switch (config.dateOrder) {
    case 'mdy': return `${monthName} ${dayStr}, ${yearStr}`;
    case 'ymd': return `${yearStr} ${monthName} ${dayStr}`;
    case 'dmy':
    default: return `${dayStr} ${monthName} ${yearStr}`;
  }
}

/**
 * Returns chart direction configuration for RTL locales.
 */
export function getChartDirectionConfig(locale: SupportedLocale): ChartDirectionConfig {
  const config = LOCALE_CONFIGS[locale];
  if (config.direction === 'rtl') {
    return {
      axisDirection: 'rtl',
      legendPosition: 'left',
      labelAlignment: 'end',
    };
  }
  return {
    axisDirection: 'ltr',
    legendPosition: 'right',
    labelAlignment: 'start',
  };
}

/**
 * Formats a data value according to cultural conventions for the specified locale.
 * Handles currency, decimal separators, numeral systems, dates (Hijri), and percentages.
 */
export function formatCulturally(data: DataValue, locale: SupportedLocale): FormattedData {
  const config = LOCALE_CONFIGS[locale];

  if (!config) {
    logger.error('Unsupported locale', { locale });
    throw new Error(`Unsupported locale: ${locale}`);
  }

  let formatted: string;

  switch (data.type) {
    case 'currency': {
      const numValue = typeof data.value === 'number' ? data.value : parseFloat(String(data.value));
      const currencyCode = data.currency ?? 'SAR';
      formatted = formatCurrency(numValue, currencyCode, config, locale);
      break;
    }
    case 'number': {
      const numValue = typeof data.value === 'number' ? data.value : parseFloat(String(data.value));
      formatted = formatNumber(numValue, data.decimals ?? 0, config);
      break;
    }
    case 'percentage': {
      const numValue = typeof data.value === 'number' ? data.value : parseFloat(String(data.value));
      formatted = formatPercentage(numValue, config);
      break;
    }
    case 'date': {
      const dateValue = data.value instanceof Date ? data.value : new Date(String(data.value));
      formatted = formatDate(dateValue, config, locale);
      break;
    }
    case 'text': {
      formatted = String(data.value);
      if (config.numeralSystem === 'eastern-arabic') {
        formatted = toEasternArabic(formatted);
      }
      break;
    }
    default:
      formatted = String(data.value);
  }

  logger.debug('Culturally formatted value', {
    type: data.type,
    locale,
    original: String(data.value),
    formatted,
  });

  return {
    original: data,
    formatted,
    locale,
    numeralSystem: config.numeralSystem,
    direction: config.direction,
  };
}
