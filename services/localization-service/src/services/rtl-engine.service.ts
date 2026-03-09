import dayjs from 'dayjs';
import 'dayjs/locale/ar';
import 'dayjs/locale/en';
import 'dayjs/locale/fr';
import numeral from 'numeral';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'rtl-engine' },
  transports: [new winston.transports.Console()],
});

const RTL_MARK = '\u200F';
const LTR_MARK = '\u200E';
const RLE = '\u202B';
const LRE = '\u202A';
const PDF = '\u202C';
const RLO = '\u202E';
const RLI = '\u2067';
const LRI = '\u2066';
const PDI = '\u2069';

const ARABIC_NUMERALS: Record<string, string> = {
  '0': '\u0660', '1': '\u0661', '2': '\u0662', '3': '\u0663', '4': '\u0664',
  '5': '\u0665', '6': '\u0666', '7': '\u0667', '8': '\u0668', '9': '\u0669',
};

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const ARABIC_DAYS = [
  'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت',
];

const HIJRI_MONTHS = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
];

export function applyRTL(content: string): string {
  logger.info('applyRTL called', { contentLength: content.length });

  if (content.trim().length === 0) {
    throw new Error('Content must not be empty for RTL application');
  }

  const lines = content.split('\n');
  const processedLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      processedLines.push('');
      continue;
    }

    const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(trimmedLine);

    if (hasArabic) {
      const wrappedLine = RLE + RTL_MARK + trimmedLine + PDF;
      processedLines.push(wrappedLine);
    } else {
      processedLines.push(trimmedLine);
    }
  }

  const result = RTL_MARK + processedLines.join('\n');

  logger.info('RTL applied successfully', {
    inputLength: content.length,
    outputLength: result.length,
    linesProcessed: lines.length,
  });

  return result;
}

export function handleBiDirectional(text: string): string {
  logger.info('handleBiDirectional called', { textLength: text.length });

  if (text.trim().length === 0) {
    throw new Error('Text must not be empty for bidi handling');
  }

  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g;
  const isMainlyRTL = (text.match(arabicPattern) || []).join('').length > text.length * 0.3;

  let result = text;

  if (isMainlyRTL) {
    const ltrSegmentPattern = /([A-Za-z][A-Za-z0-9\s.,;:!?'"-]*[A-Za-z0-9])/g;
    result = result.replace(ltrSegmentPattern, (match) => {
      return LRE + match + PDF;
    });

    const standaloneNumberPattern = /(?<=[\u0600-\u06FF\s]|^)(\d[\d.,]*\d|\d)(?=[\u0600-\u06FF\s]|$)/g;
    result = result.replace(standaloneNumberPattern, (match) => {
      return LRE + match + PDF;
    });

    const urlPattern = /(https?:\/\/[^\s]+)/g;
    result = result.replace(urlPattern, (match) => {
      return LRI + match + PDI;
    });

    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    result = result.replace(emailPattern, (match) => {
      return LRI + match + PDI;
    });

    result = RLI + result + PDI;
  } else {
    result = result.replace(arabicPattern, (match) => {
      return RLI + match + PDI;
    });
  }

  logger.info('Bidi handling completed', {
    inputLength: text.length,
    outputLength: result.length,
    mainDirection: isMainlyRTL ? 'RTL' : 'LTR',
  });

  return result;
}

export function mirrorLayout(layout: Record<string, unknown>): Record<string, unknown> {
  logger.info('mirrorLayout called', { properties: Object.keys(layout).length });

  const mirrored: Record<string, unknown> = {};
  const swapMap: Record<string, string> = {
    'left': 'right',
    'right': 'left',
    'margin-left': 'margin-right',
    'margin-right': 'margin-left',
    'padding-left': 'padding-right',
    'padding-right': 'padding-left',
    'border-left': 'border-right',
    'border-right': 'border-left',
    'border-left-width': 'border-right-width',
    'border-right-width': 'border-left-width',
    'border-left-color': 'border-right-color',
    'border-right-color': 'border-left-color',
    'border-left-style': 'border-right-style',
    'border-right-style': 'border-left-style',
    'border-top-left-radius': 'border-top-right-radius',
    'border-top-right-radius': 'border-top-left-radius',
    'border-bottom-left-radius': 'border-bottom-right-radius',
    'border-bottom-right-radius': 'border-bottom-left-radius',
    'marginLeft': 'marginRight',
    'marginRight': 'marginLeft',
    'paddingLeft': 'paddingRight',
    'paddingRight': 'paddingLeft',
    'borderLeft': 'borderRight',
    'borderRight': 'borderLeft',
  };

  for (const [key, value] of Object.entries(layout)) {
    const swappedKey = swapMap[key] || key;

    if (key === 'text-align' || key === 'textAlign') {
      if (value === 'left') {
        mirrored[swappedKey] = 'right';
      } else if (value === 'right') {
        mirrored[swappedKey] = 'left';
      } else {
        mirrored[swappedKey] = value;
      }
    } else if (key === 'direction') {
      mirrored[key] = value === 'ltr' ? 'rtl' : 'ltr';
    } else if (key === 'float') {
      mirrored[key] = value === 'left' ? 'right' : value === 'right' ? 'left' : value;
    } else if (key === 'clear') {
      mirrored[key] = value === 'left' ? 'right' : value === 'right' ? 'left' : value;
    } else if (key === 'transform' && typeof value === 'string') {
      mirrored[key] = value.replace(/translateX\(([^)]+)\)/, (_match: string, val: string) => {
        const numVal = parseFloat(val);
        if (!isNaN(numVal)) {
          return `translateX(${-numVal}${val.replace(String(numVal), '')})`;
        }
        return _match;
      });
    } else if (key === 'background-position' || key === 'backgroundPosition') {
      if (typeof value === 'string') {
        const replaced = value.replace('left', '__RIGHT__').replace('right', 'left').replace('__RIGHT__', 'right');
        mirrored[swappedKey] = replaced;
      } else {
        mirrored[swappedKey] = value;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      mirrored[swappedKey] = mirrorLayout(value as Record<string, unknown>);
    } else {
      mirrored[swappedKey] = value;
    }
  }

  mirrored['direction'] = mirrored['direction'] || 'rtl';

  logger.info('Layout mirrored successfully', {
    inputKeys: Object.keys(layout).length,
    outputKeys: Object.keys(mirrored).length,
  });

  return mirrored;
}

export function formatNumber(value: number, locale: string): string {
  logger.info('formatNumber called', { value, locale });

  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error('Invalid number value provided');
  }

  const isArabicLocale = locale.startsWith('ar');
  const isInteger = Number.isInteger(value);

  let formatted: string;

  if (isArabicLocale) {
    const absValue = Math.abs(value);
    let westernFormatted: string;

    if (isInteger) {
      westernFormatted = numeral(absValue).format('0,0');
    } else {
      const decimalPlaces = (value.toString().split('.')[1] || '').length;
      const formatStr = '0,0.' + '0'.repeat(Math.min(decimalPlaces, 6));
      westernFormatted = numeral(absValue).format(formatStr);
    }

    const withArabicDecimals = westernFormatted
      .replace(/,/g, '\u066C')
      .replace(/\./g, '\u066B');

    const withArabicNumerals = withArabicDecimals.replace(/[0-9]/g, (digit: string) => {
      return ARABIC_NUMERALS[digit] || digit;
    });

    formatted = value < 0 ? '-' + withArabicNumerals : withArabicNumerals;
  } else {
    if (isInteger) {
      formatted = numeral(value).format('0,0');
    } else {
      const decimalPlaces = (value.toString().split('.')[1] || '').length;
      const formatStr = '0,0.' + '0'.repeat(Math.min(decimalPlaces, 6));
      formatted = numeral(value).format(formatStr);
    }
  }

  logger.info('Number formatted', { input: value, output: formatted, locale });
  return formatted;
}

export function formatCurrency(value: number, currency: string, locale: string): string {
  logger.info('formatCurrency called', { value, currency, locale });

  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error('Invalid currency value provided');
  }

  const currencyConfig: Record<string, { symbolAr: string; symbolEn: string; decimals: number }> = {
    SAR: { symbolAr: 'ريال سعودي', symbolEn: 'SAR', decimals: 2 },
    USD: { symbolAr: 'دولار أمريكي', symbolEn: '$', decimals: 2 },
    EUR: { symbolAr: 'يورو', symbolEn: '€', decimals: 2 },
    AED: { symbolAr: 'درهم إماراتي', symbolEn: 'AED', decimals: 2 },
    KWD: { symbolAr: 'دينار كويتي', symbolEn: 'KWD', decimals: 3 },
    BHD: { symbolAr: 'دينار بحريني', symbolEn: 'BHD', decimals: 3 },
    QAR: { symbolAr: 'ريال قطري', symbolEn: 'QAR', decimals: 2 },
    OMR: { symbolAr: 'ريال عماني', symbolEn: 'OMR', decimals: 3 },
    EGP: { symbolAr: 'جنيه مصري', symbolEn: 'EGP', decimals: 2 },
    GBP: { symbolAr: 'جنيه إسترليني', symbolEn: '£', decimals: 2 },
  };

  const config = currencyConfig[currency.toUpperCase()] || {
    symbolAr: currency,
    symbolEn: currency,
    decimals: 2,
  };

  const isArabicLocale = locale.startsWith('ar');
  const formatStr = '0,0.' + '0'.repeat(config.decimals);
  const absValue = Math.abs(value);

  let formattedNumber: string;

  if (isArabicLocale) {
    const westernFormatted = numeral(absValue).format(formatStr);
    const withArabicSeparators = westernFormatted
      .replace(/,/g, '\u066C')
      .replace(/\./g, '\u066B');
    formattedNumber = withArabicSeparators.replace(/[0-9]/g, (digit: string) => {
      return ARABIC_NUMERALS[digit] || digit;
    });
  } else {
    formattedNumber = numeral(absValue).format(formatStr);
  }

  let result: string;
  const sign = value < 0 ? '-' : '';

  if (isArabicLocale) {
    result = `${sign}${formattedNumber} ${config.symbolAr}`;
  } else {
    const prefixSymbols = ['$', '£', '€'];
    if (prefixSymbols.includes(config.symbolEn)) {
      result = `${sign}${config.symbolEn}${formattedNumber}`;
    } else {
      result = `${sign}${formattedNumber} ${config.symbolEn}`;
    }
  }

  logger.info('Currency formatted', { input: value, currency, output: result, locale });
  return result;
}

export function formatDate(date: Date | string, format: string, locale: string): string {
  logger.info('formatDate called', { date: String(date), format, locale });

  const parsedDate = dayjs(date);

  if (!parsedDate.isValid()) {
    throw new Error(`Invalid date provided: ${String(date)}`);
  }

  const isArabicLocale = locale.startsWith('ar');

  if (isArabicLocale) {
    const localizedDate = parsedDate.locale('ar');
    let formatted = localizedDate.format(format);

    const monthIndex = parsedDate.month();
    const dayIndex = parsedDate.day();

    if (format.includes('MMMM')) {
      formatted = formatted.replace(localizedDate.format('MMMM'), ARABIC_MONTHS[monthIndex]);
    }

    if (format.includes('dddd')) {
      formatted = formatted.replace(localizedDate.format('dddd'), ARABIC_DAYS[dayIndex]);
    }

    formatted = formatted.replace(/[0-9]/g, (digit: string) => {
      return ARABIC_NUMERALS[digit] || digit;
    });

    logger.info('Date formatted (Arabic)', { output: formatted });
    return formatted;
  }

  const localizedDate = parsedDate.locale(locale.substring(0, 2));
  const formatted = localizedDate.format(format);

  logger.info('Date formatted', { output: formatted, locale });
  return formatted;
}

export function getHijriDate(gregorianDate: Date): { year: number; month: number; day: number; monthName: string } {
  logger.info('getHijriDate called', { gregorianDate: gregorianDate.toISOString() });

  const gDate = new Date(gregorianDate);
  if (isNaN(gDate.getTime())) {
    throw new Error('Invalid Gregorian date provided');
  }

  const gYear = gDate.getFullYear();
  const gMonth = gDate.getMonth() + 1;
  const gDay = gDate.getDate();

  let julianDay: number;
  const a = Math.floor((14 - gMonth) / 12);
  const y = gYear + 4800 - a;
  const m = gMonth + 12 * a - 3;

  julianDay = gDay
    + Math.floor((153 * m + 2) / 5)
    + 365 * y
    + Math.floor(y / 4)
    - Math.floor(y / 100)
    + Math.floor(y / 400)
    - 32045;

  const epochJD = 1948439.5;
  const daysSinceEpoch = julianDay - epochJD - 0.5;

  const lunarCycleLength = 29.5305882;
  const yearLengthInDays = 354.36667;

  const approxYear = Math.floor(daysSinceEpoch / yearLengthInDays) + 1;

  const cycleNumber = Math.floor((30 * daysSinceEpoch + 10646) / 10631);
  const remainingDays = daysSinceEpoch - 10631 * Math.floor((30 * (cycleNumber - 1) + 10646) / 10631 - (cycleNumber > 1 ? 1 : 0));

  const leapYears = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];

  function daysInHijriYear(hYear: number): number {
    const posInCycle = ((hYear - 1) % 30) + 1;
    return leapYears.includes(posInCycle) ? 355 : 354;
  }

  function daysInHijriMonth(hMonth: number, hYear: number): number {
    if (hMonth % 2 === 1) {
      return 30;
    } else if (hMonth === 12) {
      const posInCycle = ((hYear - 1) % 30) + 1;
      return leapYears.includes(posInCycle) ? 30 : 29;
    } else {
      return 29;
    }
  }

  let totalDays = daysSinceEpoch;
  let hijriYear = 1;

  while (totalDays > daysInHijriYear(hijriYear)) {
    totalDays -= daysInHijriYear(hijriYear);
    hijriYear += 1;
  }

  let hijriMonth = 1;
  while (hijriMonth <= 12 && totalDays > daysInHijriMonth(hijriMonth, hijriYear)) {
    totalDays -= daysInHijriMonth(hijriMonth, hijriYear);
    hijriMonth += 1;
  }

  const hijriDay = Math.max(1, Math.floor(totalDays) + 1);

  const clampedMonth = Math.min(Math.max(hijriMonth, 1), 12);
  const monthName = HIJRI_MONTHS[clampedMonth - 1];

  const maxDay = daysInHijriMonth(clampedMonth, hijriYear);
  const clampedDay = Math.min(hijriDay, maxDay);

  const result = {
    year: hijriYear,
    month: clampedMonth,
    day: clampedDay,
    monthName,
  };

  logger.info('Hijri date computed', result);
  return result;
}

export function getGregorianDate(
  hijriYear: number,
  hijriMonth: number,
  hijriDay: number
): { year: number; month: number; day: number; date: string } {
  logger.info('getGregorianDate called', { hijriYear, hijriMonth, hijriDay });

  if (hijriYear < 1 || hijriMonth < 1 || hijriMonth > 12 || hijriDay < 1 || hijriDay > 30) {
    throw new Error('Invalid Hijri date parameters');
  }

  const leapYears = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];

  function daysInHijriMonth(month: number, year: number): number {
    if (month % 2 === 1) {
      return 30;
    } else if (month === 12) {
      const posInCycle = ((year - 1) % 30) + 1;
      return leapYears.includes(posInCycle) ? 30 : 29;
    } else {
      return 29;
    }
  }

  function daysInHijriYear(year: number): number {
    const posInCycle = ((year - 1) % 30) + 1;
    return leapYears.includes(posInCycle) ? 355 : 354;
  }

  let totalDays = 0;

  for (let y = 1; y < hijriYear; y++) {
    totalDays += daysInHijriYear(y);
  }

  for (let m = 1; m < hijriMonth; m++) {
    totalDays += daysInHijriMonth(m, hijriYear);
  }

  totalDays += hijriDay - 1;

  const epochJD = 1948439.5;
  const julianDay = epochJD + totalDays + 0.5;

  const a = julianDay + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor(146097 * b / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor(1461 * d / 4);
  const mCalc = Math.floor((5 * e + 2) / 153);

  const gDay = Math.floor(e - Math.floor((153 * mCalc + 2) / 5) + 1);
  const gMonth = Math.floor(mCalc + 3 - 12 * Math.floor(mCalc / 10));
  const gYear = Math.floor(100 * b + d - 4800 + Math.floor(mCalc / 10));

  const dateStr = `${gYear}-${String(gMonth).padStart(2, '0')}-${String(gDay).padStart(2, '0')}`;

  const result = {
    year: gYear,
    month: gMonth,
    day: gDay,
    date: dateStr,
  };

  logger.info('Gregorian date computed', result);
  return result;
}
