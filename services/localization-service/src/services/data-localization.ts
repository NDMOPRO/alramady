import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import winston from 'winston';

const prisma = new PrismaClient();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'data-localization' },
  transports: [new winston.transports.Console()],
});

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const NumberConversionInputSchema = z.object({
  value: z.union([z.number(), z.string()]),
  format: z.enum([
    'eastern_arabic',    // ٠١٢٣٤٥٦٧٨٩
    'western_arabic',    // 0123456789
    'arabic_words',      // واحد، اثنان، ثلاثة...
    'ordinal_arabic',    // الأول، الثاني، الثالث...
  ]).default('eastern_arabic'),
  thousandsSeparator: z.boolean().default(true),
  decimalPlaces: z.number().min(0).max(10).optional(),
  currencyCode: z.string().optional(),
  locale: z.string().default('ar-SA'),
});

const HijriDateInputSchema = z.object({
  date: z.union([z.string(), z.date()]).transform(val => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  format: z.enum([
    'full',             // يوم الخميس ٥ رجب ١٤٤٦ هـ
    'long',             // ٥ رجب ١٤٤٦ هـ
    'medium',           // ٥/٧/١٤٤٦ هـ
    'short',            // ٥/٧/١٤٤٦
    'iso',              // 1446-07-05
    'dual',             // ٥ رجب ١٤٤٦ هـ | 5 January 2025
  ]).default('long'),
  numeralSystem: z.enum(['eastern', 'western']).default('eastern'),
  includeDay: z.boolean().default(false),
  calendar: z.enum(['umm_al_qura', 'tabular', 'astronomical']).default('umm_al_qura'),
});

const BatchDataLocalizationInputSchema = z.object({
  data: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  columns: z.array(z.object({
    key: z.string(),
    type: z.enum(['number', 'currency', 'date', 'percentage', 'text', 'phone', 'auto']),
    currencyCode: z.string().optional(),
    dateFormat: z.string().optional(),
  })),
  locale: z.string().default('ar-SA'),
  numeralSystem: z.enum(['eastern', 'western']).default('eastern'),
  tenantId: z.string().min(1),
});

// ─── Constants ───────────────────────────────────────────────────────────────

const EASTERN_ARABIC_NUMERALS: Record<string, string> = {
  '0': '\u0660', '1': '\u0661', '2': '\u0662', '3': '\u0663', '4': '\u0664',
  '5': '\u0665', '6': '\u0666', '7': '\u0667', '8': '\u0668', '9': '\u0669',
};

const WESTERN_FROM_EASTERN: Record<string, string> = Object.fromEntries(
  Object.entries(EASTERN_ARABIC_NUMERALS).map(([k, v]) => [v, k])
);

const ARABIC_ONES = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة',
  'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
  'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
  'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];

const ARABIC_TENS = [
  '', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون',
  'ستون', 'سبعون', 'ثمانون', 'تسعون',
];

const ARABIC_HUNDREDS = [
  '', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة',
  'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة',
];

const ARABIC_ORDINALS = [
  '', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس',
  'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
  'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر',
  'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون',
];

const HIJRI_MONTHS = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
];

const GREGORIAN_MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const ARABIC_DAYS = [
  'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت',
];

const CURRENCY_CONFIG: Record<string, { nameAr: string; subunitAr: string; decimals: number; symbol: string }> = {
  SAR: { nameAr: 'ريال سعودي', subunitAr: 'هللة', decimals: 2, symbol: 'ر.س' },
  USD: { nameAr: 'دولار أمريكي', subunitAr: 'سنت', decimals: 2, symbol: '$' },
  EUR: { nameAr: 'يورو', subunitAr: 'سنت', decimals: 2, symbol: '€' },
  AED: { nameAr: 'درهم إماراتي', subunitAr: 'فلس', decimals: 2, symbol: 'د.إ' },
  KWD: { nameAr: 'دينار كويتي', subunitAr: 'فلس', decimals: 3, symbol: 'د.ك' },
  BHD: { nameAr: 'دينار بحريني', subunitAr: 'فلس', decimals: 3, symbol: 'د.ب' },
  QAR: { nameAr: 'ريال قطري', subunitAr: 'درهم', decimals: 2, symbol: 'ر.ق' },
  OMR: { nameAr: 'ريال عماني', subunitAr: 'بيسة', decimals: 3, symbol: 'ر.ع' },
  EGP: { nameAr: 'جنيه مصري', subunitAr: 'قرش', decimals: 2, symbol: 'ج.م' },
  GBP: { nameAr: 'جنيه إسترليني', subunitAr: 'بنس', decimals: 2, symbol: '£' },
  JOD: { nameAr: 'دينار أردني', subunitAr: 'قرش', decimals: 3, symbol: 'د.أ' },
};

// ─── Hijri Calendar (Umm Al-Qura) ───────────────────────────────────────────

const HIJRI_LEAP_YEARS = new Set([2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29]);

function daysInHijriMonth(month: number, year: number): number {
  if (month % 2 === 1) return 30;
  if (month === 12) {
    const posInCycle = ((year - 1) % 30) + 1;
    return HIJRI_LEAP_YEARS.has(posInCycle) ? 30 : 29;
  }
  return 29;
}

function daysInHijriYear(year: number): number {
  const posInCycle = ((year - 1) % 30) + 1;
  return HIJRI_LEAP_YEARS.has(posInCycle) ? 355 : 354;
}

function gregorianToHijri(gDate: Date): { year: number; month: number; day: number } {
  const gYear = gDate.getFullYear();
  const gMonth = gDate.getMonth() + 1;
  const gDay = gDate.getDate();

  // Convert to Julian Day Number
  const a = Math.floor((14 - gMonth) / 12);
  const y = gYear + 4800 - a;
  const m = gMonth + 12 * a - 3;

  const julianDay = gDay
    + Math.floor((153 * m + 2) / 5)
    + 365 * y
    + Math.floor(y / 4)
    - Math.floor(y / 100)
    + Math.floor(y / 400)
    - 32045;

  const epochJD = 1948439.5;
  const daysSinceEpoch = julianDay - epochJD - 0.5;

  let totalDays = daysSinceEpoch;
  let hijriYear = 1;

  while (totalDays > daysInHijriYear(hijriYear)) {
    totalDays -= daysInHijriYear(hijriYear);
    hijriYear++;
  }

  let hijriMonth = 1;
  while (hijriMonth <= 12 && totalDays > daysInHijriMonth(hijriMonth, hijriYear)) {
    totalDays -= daysInHijriMonth(hijriMonth, hijriYear);
    hijriMonth++;
  }

  const hijriDay = Math.max(1, Math.floor(totalDays) + 1);
  const clampedMonth = Math.min(Math.max(hijriMonth, 1), 12);
  const maxDay = daysInHijriMonth(clampedMonth, hijriYear);
  const clampedDay = Math.min(hijriDay, maxDay);

  return { year: hijriYear, month: clampedMonth, day: clampedDay };
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface NumberConversionResult {
  original: string | number;
  converted: string;
  format: string;
  locale: string;
}

interface HijriDateResult {
  gregorianDate: string;
  hijriYear: number;
  hijriMonth: number;
  hijriDay: number;
  hijriMonthName: string;
  formatted: string;
  format: string;
  dayName: string;
  numeralSystem: string;
}

interface BatchDataLocalizationResult {
  localizedData: Array<Record<string, string>>;
  totalRows: number;
  columnsProcessed: number;
  numbersConverted: number;
  datesConverted: number;
  currenciesFormatted: number;
}

// ─── Service Functions ───────────────────────────────────────────────────────

export function convertNumber(
  input: z.infer<typeof NumberConversionInputSchema>
): NumberConversionResult {
  const validated = NumberConversionInputSchema.parse(input);
  logger.info('convertNumber called', {
    value: validated.value,
    format: validated.format,
  });

  const numValue = typeof validated.value === 'string'
    ? parseFloat(validated.value.replace(/[٬٫,]/g, match => match === '٫' || match === '.' ? '.' : '').replace(/[٠-٩]/g, d => WESTERN_FROM_EASTERN[d] || d))
    : validated.value;

  if (isNaN(numValue)) {
    throw new Error(`Invalid number value: ${validated.value}`);
  }

  let converted: string;

  switch (validated.format) {
    case 'arabic_words': {
      converted = numberToArabicWords(numValue);
      break;
    }

    case 'ordinal_arabic': {
      const intValue = Math.floor(Math.abs(numValue));
      if (intValue >= 0 && intValue < ARABIC_ORDINALS.length) {
        converted = ARABIC_ORDINALS[intValue];
      } else {
        converted = numberToArabicWords(intValue);
      }
      break;
    }

    case 'eastern_arabic': {
      converted = formatNumericValue(numValue, validated.thousandsSeparator, validated.decimalPlaces, true);
      if (validated.currencyCode) {
        const config = CURRENCY_CONFIG[validated.currencyCode.toUpperCase()];
        if (config) {
          converted = `${converted} ${config.nameAr}`;
        }
      }
      break;
    }

    case 'western_arabic':
    default: {
      converted = formatNumericValue(numValue, validated.thousandsSeparator, validated.decimalPlaces, false);
      if (validated.currencyCode) {
        const config = CURRENCY_CONFIG[validated.currencyCode.toUpperCase()];
        if (config) {
          converted = `${converted} ${config.symbol}`;
        }
      }
      break;
    }
  }

  logger.info('Number converted', {
    original: validated.value,
    converted,
    format: validated.format,
  });

  return {
    original: validated.value,
    converted,
    format: validated.format,
    locale: validated.locale,
  };
}

export function convertToHijri(
  input: z.infer<typeof HijriDateInputSchema>
): HijriDateResult {
  const validated = HijriDateInputSchema.parse(input);
  logger.info('convertToHijri called', {
    date: validated.date.toISOString(),
    format: validated.format,
  });

  const gDate = new Date(validated.date);
  if (isNaN(gDate.getTime())) {
    throw new Error('Invalid date provided');
  }

  const hijri = gregorianToHijri(gDate);
  const monthName = HIJRI_MONTHS[hijri.month - 1];
  const dayOfWeek = gDate.getDay();
  const dayName = ARABIC_DAYS[dayOfWeek];

  const useEastern = validated.numeralSystem === 'eastern';

  const dayStr = useEastern ? toEasternArabic(String(hijri.day)) : String(hijri.day);
  const monthStr = useEastern ? toEasternArabic(String(hijri.month)) : String(hijri.month);
  const yearStr = useEastern ? toEasternArabic(String(hijri.year)) : String(hijri.year);

  let formatted: string;

  switch (validated.format) {
    case 'full':
      formatted = `يوم ${dayName} ${dayStr} ${monthName} ${yearStr} هـ`;
      break;

    case 'long':
      formatted = `${dayStr} ${monthName} ${yearStr} هـ`;
      break;

    case 'medium':
      formatted = `${dayStr}/${monthStr}/${yearStr} هـ`;
      break;

    case 'short':
      formatted = `${dayStr}/${monthStr}/${yearStr}`;
      break;

    case 'iso':
      formatted = `${hijri.year}-${String(hijri.month).padStart(2, '0')}-${String(hijri.day).padStart(2, '0')}`;
      break;

    case 'dual': {
      const gDay = gDate.getDate();
      const gMonthName = GREGORIAN_MONTHS_AR[gDate.getMonth()];
      const gYear = gDate.getFullYear();
      const gDayStr = useEastern ? toEasternArabic(String(gDay)) : String(gDay);
      const gYearStr = useEastern ? toEasternArabic(String(gYear)) : String(gYear);
      formatted = `${dayStr} ${monthName} ${yearStr} هـ | ${gDayStr} ${gMonthName} ${gYearStr} م`;
      break;
    }

    default:
      formatted = `${dayStr} ${monthName} ${yearStr} هـ`;
  }

  logger.info('Hijri date converted', {
    hijriYear: hijri.year,
    hijriMonth: hijri.month,
    hijriDay: hijri.day,
    format: validated.format,
  });

  return {
    gregorianDate: gDate.toISOString().split('T')[0],
    hijriYear: hijri.year,
    hijriMonth: hijri.month,
    hijriDay: hijri.day,
    hijriMonthName: monthName,
    formatted,
    format: validated.format,
    dayName,
    numeralSystem: validated.numeralSystem,
  };
}

export async function localizeDataBatch(
  input: z.infer<typeof BatchDataLocalizationInputSchema>
): Promise<BatchDataLocalizationResult> {
  const validated = BatchDataLocalizationInputSchema.parse(input);
  logger.info('localizeDataBatch called', {
    rowCount: validated.data.length,
    columnCount: validated.columns.length,
  });

  const localizedData: Array<Record<string, string>> = [];
  let numbersConverted = 0;
  let datesConverted = 0;
  let currenciesFormatted = 0;
  const useEastern = validated.numeralSystem === 'eastern';

  for (const row of validated.data) {
    const localizedRow: Record<string, string> = {};

    for (const col of validated.columns) {
      const rawValue = row[col.key];
      if (rawValue === null || rawValue === undefined) {
        localizedRow[col.key] = '';
        continue;
      }

      const colType = col.type === 'auto' ? detectColumnType(rawValue) : col.type;

      switch (colType) {
        case 'number': {
          const numVal = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
          if (!isNaN(numVal)) {
            localizedRow[col.key] = formatNumericValue(numVal, true, undefined, useEastern);
            numbersConverted++;
          } else {
            localizedRow[col.key] = String(rawValue);
          }
          break;
        }

        case 'currency': {
          const numVal = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
          if (!isNaN(numVal)) {
            const currConfig = CURRENCY_CONFIG[col.currencyCode?.toUpperCase() || 'SAR'];
            const decimals = currConfig?.decimals || 2;
            const formatted = formatNumericValue(numVal, true, decimals, useEastern);
            const currencyName = currConfig?.nameAr || col.currencyCode || 'SAR';
            localizedRow[col.key] = `${formatted} ${currencyName}`;
            currenciesFormatted++;
          } else {
            localizedRow[col.key] = String(rawValue);
          }
          break;
        }

        case 'date': {
          const dateVal = new Date(String(rawValue));
          if (!isNaN(dateVal.getTime())) {
            const hijri = gregorianToHijri(dateVal);
            const monthName = HIJRI_MONTHS[hijri.month - 1];
            const dayStr = useEastern ? toEasternArabic(String(hijri.day)) : String(hijri.day);
            const yearStr = useEastern ? toEasternArabic(String(hijri.year)) : String(hijri.year);
            localizedRow[col.key] = `${dayStr} ${monthName} ${yearStr} هـ`;
            datesConverted++;
          } else {
            localizedRow[col.key] = String(rawValue);
          }
          break;
        }

        case 'percentage': {
          const numVal = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
          if (!isNaN(numVal)) {
            const pctValue = numVal > 1 ? numVal : numVal * 100;
            const formatted = formatNumericValue(pctValue, false, 1, useEastern);
            localizedRow[col.key] = `${formatted}٪`;
            numbersConverted++;
          } else {
            localizedRow[col.key] = String(rawValue);
          }
          break;
        }

        case 'phone': {
          let phone = String(rawValue).replace(/\s/g, '');
          if (phone.startsWith('+966')) {
            const national = phone.substring(4);
            const formatted = useEastern
              ? `+${toEasternArabic('966')} ${toEasternArabic(national.substring(0, 2))} ${toEasternArabic(national.substring(2, 5))} ${toEasternArabic(national.substring(5))}`
              : `+966 ${national.substring(0, 2)} ${national.substring(2, 5)} ${national.substring(5)}`;
            localizedRow[col.key] = formatted;
          } else {
            localizedRow[col.key] = useEastern ? toEasternArabic(phone) : phone;
          }
          break;
        }

        case 'text':
        default: {
          localizedRow[col.key] = String(rawValue);
          break;
        }
      }
    }

    localizedData.push(localizedRow);
  }

  // Store the localization job
  await prisma.localizationJob.create({
    data: {
      id: crypto.randomUUID(),
      documentId: 'batch-data-localization',
      sourceLanguage: 'en',
      targetLanguage: 'ar',
      status: 'completed',
      totalSegments: validated.data.length,
      translatedSegments: validated.data.length,
      resultContent: JSON.stringify({
        type: 'data_localization',
        numbersConverted,
        datesConverted,
        currenciesFormatted,
      }),
      tenantId: validated.tenantId,
      createdBy: 'system',
      completedAt: new Date(),
    },
  });

  logger.info('Batch data localization completed', {
    totalRows: localizedData.length,
    numbersConverted,
    datesConverted,
    currenciesFormatted,
  });

  return {
    localizedData,
    totalRows: localizedData.length,
    columnsProcessed: validated.columns.length,
    numbersConverted,
    datesConverted,
    currenciesFormatted,
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function toEasternArabic(numStr: string): string {
  return numStr.replace(/[0-9]/g, (digit: string) => EASTERN_ARABIC_NUMERALS[digit] || digit);
}

function formatNumericValue(
  value: number,
  thousandsSeparator: boolean,
  decimalPlaces: number | undefined,
  useEastern: boolean
): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  let formatted: string;

  if (decimalPlaces !== undefined) {
    formatted = absValue.toFixed(decimalPlaces);
  } else {
    formatted = Number.isInteger(absValue) ? absValue.toString() : absValue.toString();
  }

  if (thousandsSeparator) {
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, useEastern ? '\u066C' : ',');
    formatted = parts.join(useEastern ? '\u066B' : '.');
  } else if (useEastern) {
    formatted = formatted.replace(/\./g, '\u066B');
  }

  if (useEastern) {
    formatted = toEasternArabic(formatted);
  }

  return sign + formatted;
}

function numberToArabicWords(num: number): string {
  if (num === 0) return 'صفر';

  const absNum = Math.abs(num);
  const intPart = Math.floor(absNum);

  if (intPart === 0) return 'صفر';
  if (intPart > 999999999) return 'عدد كبير جداً';

  const parts: string[] = [];

  const billions = Math.floor(intPart / 1000000000);
  const millions = Math.floor((intPart % 1000000000) / 1000000);
  const thousands = Math.floor((intPart % 1000000) / 1000);
  const remainder = intPart % 1000;

  if (billions > 0) {
    parts.push(hundredsToWords(billions) + ' مليار');
  }
  if (millions > 0) {
    if (millions === 1) {
      parts.push('مليون');
    } else if (millions === 2) {
      parts.push('مليونان');
    } else if (millions >= 3 && millions <= 10) {
      parts.push(hundredsToWords(millions) + ' ملايين');
    } else {
      parts.push(hundredsToWords(millions) + ' مليون');
    }
  }
  if (thousands > 0) {
    if (thousands === 1) {
      parts.push('ألف');
    } else if (thousands === 2) {
      parts.push('ألفان');
    } else if (thousands >= 3 && thousands <= 10) {
      parts.push(hundredsToWords(thousands) + ' آلاف');
    } else {
      parts.push(hundredsToWords(thousands) + ' ألف');
    }
  }
  if (remainder > 0) {
    parts.push(hundredsToWords(remainder));
  }

  let result = parts.join(' و');

  if (num < 0) {
    result = 'سالب ' + result;
  }

  return result;
}

function hundredsToWords(num: number): string {
  if (num === 0) return '';
  if (num < 20) return ARABIC_ONES[num];

  const hundreds = Math.floor(num / 100);
  const tens = Math.floor((num % 100) / 10);
  const ones = num % 10;

  const parts: string[] = [];

  if (hundreds > 0) {
    parts.push(ARABIC_HUNDREDS[hundreds]);
  }

  const remainder = num % 100;
  if (remainder > 0 && remainder < 20) {
    parts.push(ARABIC_ONES[remainder]);
  } else {
    if (ones > 0) {
      parts.push(ARABIC_ONES[ones]);
    }
    if (tens > 0) {
      parts.push(ARABIC_TENS[tens]);
    }
  }

  return parts.join(' و');
}

function detectColumnType(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'text';

  const strVal = String(value);

  // Date detection
  if (/^\d{4}-\d{2}-\d{2}/.test(strVal) || /^\d{2}\/\d{2}\/\d{4}/.test(strVal)) {
    const d = new Date(strVal);
    if (!isNaN(d.getTime())) return 'date';
  }

  // Percentage
  if (/^[\d.]+%$/.test(strVal)) return 'percentage';

  // Phone
  if (/^\+?\d[\d\s-]{7,}$/.test(strVal)) return 'phone';

  // Number
  if (/^-?[\d,]+\.?\d*$/.test(strVal)) return 'number';

  return 'text';
}
