import { logger } from '../utils/logger.js';
import { getLocaleConfig, formatNumber, formatCurrency } from '../utils/locale-config.js';

export class ConversionService {
  /**
   * Convert date between formats and calendars.
   */
  convertDateFormat(
    value: string | number,
    fromFormat: string,
    toFormat: string,
    calendar?: 'gregorian' | 'hijri'
  ): string {
    logger.info('Converting date format', { value, fromFormat, toFormat, calendar });

    let date: Date;

    if (typeof value === 'number') {
      // Excel serial number
      date = this.serialToDate(value);
    } else {
      date = this.parseDate(value, fromFormat);
    }

    if (calendar === 'hijri') {
      return this.toHijriString(date, toFormat);
    }

    return this.formatDate(date, toFormat);
  }

  /**
   * Convert currency amount.
   */
  convertCurrency(
    amount: number,
    from: string,
    to: string,
    rate?: number
  ): { amount: number; from: string; to: string; rate: number; result: number } {
    logger.info('Converting currency', { amount, from, to, rate });

    const effectiveRate = rate || this.getDefaultRate(from, to);
    const result = Math.round(amount * effectiveRate * 100) / 100;

    return { amount, from, to, rate: effectiveRate, result };
  }

  /**
   * Normalize text format (e.g., city names, transliterations).
   */
  normalizeTextFormat(text: string): {
    original: string;
    normalized: string;
    detectedLanguage: string;
  } {
    logger.info('Normalizing text', { text });

    const normalized = text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, ''); // Remove zero-width characters

    const detectedLanguage = this.detectLanguage(normalized);

    return { original: text, normalized, detectedLanguage };
  }

  /**
   * Convert Gregorian date to Hijri.
   */
  gregorianToHijri(date: Date): { year: number; month: number; day: number } {
    // Approximate Hijri calendar calculation
    const jd = this.gregorianToJulianDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return this.julianDayToHijri(jd);
  }

  /**
   * Convert Hijri date to Gregorian.
   */
  hijriToGregorian(year: number, month: number, day: number): Date {
    const jd = this.hijriToJulianDay(year, month, day);
    const greg = this.julianDayToGregorian(jd);
    return new Date(greg.year, greg.month - 1, greg.day);
  }

  // --- Private helpers ---

  private serialToDate(serial: number): Date {
    const epoch = new Date(1899, 11, 30);
    const adjusted = serial > 59 ? serial - 1 : serial;
    return new Date(epoch.getTime() + adjusted * 86400000);
  }

  private parseDate(value: string, format: string): Date {
    // Support common formats
    const cleanValue = value.trim();

    if (format === 'DD/MM/YYYY' || format === 'dd/MM/yyyy') {
      const parts = cleanValue.split(/[/\-\.]/);
      if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
    }

    if (format === 'MM/DD/YYYY' || format === 'mm/dd/yyyy') {
      const parts = cleanValue.split(/[/\-\.]/);
      if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      }
    }

    if (format === 'YYYY-MM-DD' || format === 'yyyy-mm-dd') {
      const parts = cleanValue.split(/[/\-\.]/);
      if (parts.length === 3) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }
    }

    // Fallback to JS Date parsing
    const d = new Date(cleanValue);
    if (isNaN(d.getTime())) {
      throw new Error(`Cannot parse date: ${value} with format ${format}`);
    }
    return d;
  }

  private formatDate(date: Date, format: string): string {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const pad = (n: number) => String(n).padStart(2, '0');

    return format
      .replace('YYYY', String(y)).replace('yyyy', String(y))
      .replace('MM', pad(m)).replace('mm', pad(m))
      .replace('DD', pad(d)).replace('dd', pad(d));
  }

  private toHijriString(date: Date, format: string): string {
    const hijri = this.gregorianToHijri(date);
    const pad = (n: number) => String(n).padStart(2, '0');

    return format
      .replace('YYYY', String(hijri.year)).replace('yyyy', String(hijri.year))
      .replace('MM', pad(hijri.month)).replace('mm', pad(hijri.month))
      .replace('DD', pad(hijri.day)).replace('dd', pad(hijri.day));
  }

  private getDefaultRate(from: string, to: string): number {
    // Default exchange rates (approximate)
    const rates: Record<string, Record<string, number>> = {
      USD: { SAR: 3.75, AED: 3.67, EGP: 30.9, EUR: 0.92, GBP: 0.79 },
      SAR: { USD: 0.267, AED: 0.979, EGP: 8.24, EUR: 0.245, GBP: 0.211 },
      AED: { USD: 0.272, SAR: 1.021, EGP: 8.42, EUR: 0.251, GBP: 0.215 },
      EUR: { USD: 1.087, SAR: 4.08, AED: 3.99, EGP: 33.6, GBP: 0.86 },
      GBP: { USD: 1.266, SAR: 4.75, AED: 4.65, EGP: 39.1, EUR: 1.163 },
      EGP: { USD: 0.032, SAR: 0.121, AED: 0.119, EUR: 0.03, GBP: 0.026 },
    };

    if (from === to) return 1;
    return rates[from]?.[to] || 1;
  }

  private detectLanguage(text: string): string {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F]/;
    if (arabicRegex.test(text)) return 'ar';

    const latinRegex = /[a-zA-Z]/;
    if (latinRegex.test(text)) return 'en';

    return 'unknown';
  }

  // --- Hijri Calendar calculation (Kuwaiti algorithm) ---

  private gregorianToJulianDay(year: number, month: number, day: number): number {
    if (month <= 2) { year--; month += 12; }
    const A = Math.floor(year / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
  }

  private julianDayToHijri(jd: number): { year: number; month: number; day: number } {
    const l = Math.floor(jd) - 1948440 + 10632;
    const n = Math.floor((l - 1) / 10631);
    const remainder = l - 10631 * n + 354;
    const j = Math.floor((10985 - remainder) / 5316) * Math.floor((50 * remainder) / 17719) +
              Math.floor(remainder / 5670) * Math.floor((43 * remainder) / 15238);
    const adjustedL = remainder - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
                      Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    const month = Math.floor((24 * adjustedL) / 709);
    const day = adjustedL - Math.floor((709 * month) / 24);
    const year = 30 * n + j - 30;
    return { year, month, day };
  }

  private hijriToJulianDay(year: number, month: number, day: number): number {
    return Math.floor((11 * year + 3) / 30) + 354 * year + 30 * month -
           Math.floor((month - 1) / 2) + day + 1948440 - 385;
  }

  private julianDayToGregorian(jd: number): { year: number; month: number; day: number } {
    const l = Math.floor(jd) + 68569;
    const n = Math.floor((4 * l) / 146097);
    const adjustedL = l - Math.floor((146097 * n + 3) / 4);
    const i = Math.floor((4000 * (adjustedL + 1)) / 1461001);
    const finalL = adjustedL - Math.floor((1461 * i) / 4) + 31;
    const j = Math.floor((80 * finalL) / 2447);
    const day = finalL - Math.floor((2447 * j) / 80);
    const adjustedJ = Math.floor(j / 11);
    const month = j + 2 - 12 * adjustedJ;
    const year = 100 * (n - 49) + i + adjustedJ;
    return { year, month, day };
  }
}

export const conversionService = new ConversionService();
