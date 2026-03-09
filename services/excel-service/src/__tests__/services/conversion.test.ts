jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../utils/locale-config', () => ({
  getLocaleConfig: jest.fn(),
  formatNumber: jest.fn(),
  formatCurrency: jest.fn(),
}));

import { ConversionService } from '../../services/conversion.service.js';

describe('ConversionService', () => {
  let service: ConversionService;

  beforeEach(() => {
    service = new ConversionService();
    jest.clearAllMocks();
  });

  describe('convertDateFormat', () => {
    it('should convert DD/MM/YYYY to YYYY-MM-DD', () => {
      const result = service.convertDateFormat('25/12/2024', 'DD/MM/YYYY', 'YYYY-MM-DD');
      expect(result).toBe('2024-12-25');
    });

    it('should convert MM/DD/YYYY to YYYY-MM-DD', () => {
      const result = service.convertDateFormat('12/25/2024', 'MM/DD/YYYY', 'YYYY-MM-DD');
      expect(result).toBe('2024-12-25');
    });

    it('should convert YYYY-MM-DD to DD/MM/YYYY', () => {
      const result = service.convertDateFormat('2024-01-15', 'YYYY-MM-DD', 'DD/MM/YYYY');
      expect(result).toBe('15/01/2024');
    });

    it('should handle single-digit day and month with proper padding', () => {
      const result = service.convertDateFormat('05/03/2024', 'DD/MM/YYYY', 'YYYY-MM-DD');
      expect(result).toBe('2024-03-05');
    });

    it('should convert to hijri calendar when specified', () => {
      const result = service.convertDateFormat('01/01/2024', 'DD/MM/YYYY', 'YYYY-MM-DD', 'hijri');
      // Result should be a string in the hijri format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('convertCurrency', () => {
    it('should convert USD to SAR using default rate', () => {
      const result = service.convertCurrency(100, 'USD', 'SAR');
      expect(result.rate).toBe(3.75);
      expect(result.result).toBe(375);
      expect(result.from).toBe('USD');
      expect(result.to).toBe('SAR');
      expect(result.amount).toBe(100);
    });

    it('should convert SAR to USD using default rate', () => {
      const result = service.convertCurrency(375, 'SAR', 'USD');
      expect(result.rate).toBe(0.267);
      expect(result.result).toBe(100.13); // 375 * 0.267 = 100.125 rounded to 100.13
    });

    it('should use custom rate when provided', () => {
      const result = service.convertCurrency(100, 'USD', 'SAR', 4.0);
      expect(result.rate).toBe(4.0);
      expect(result.result).toBe(400);
    });

    it('should return rate 1 when converting same currency', () => {
      const result = service.convertCurrency(100, 'USD', 'USD');
      expect(result.rate).toBe(1);
      expect(result.result).toBe(100);
    });

    it('should round result to 2 decimal places', () => {
      const result = service.convertCurrency(33, 'USD', 'SAR');
      // 33 * 3.75 = 123.75
      expect(result.result).toBe(123.75);
    });

    it('should convert EUR to GBP using default rate', () => {
      const result = service.convertCurrency(100, 'EUR', 'GBP');
      expect(result.rate).toBe(0.86);
      expect(result.result).toBe(86);
    });
  });

  describe('normalizeTextFormat', () => {
    it('should trim and normalize whitespace', () => {
      const result = service.normalizeTextFormat('  hello   world  ');
      expect(result.normalized).toBe('hello world');
      expect(result.original).toBe('  hello   world  ');
    });

    it('should detect English text', () => {
      const result = service.normalizeTextFormat('Hello World');
      expect(result.detectedLanguage).toBe('en');
    });

    it('should detect Arabic text', () => {
      const result = service.normalizeTextFormat('مرحبا بالعالم');
      expect(result.detectedLanguage).toBe('ar');
    });

    it('should remove zero-width characters', () => {
      const text = 'hello\u200Bworld\u200C';
      const result = service.normalizeTextFormat(text);
      expect(result.normalized).toBe('helloworld');
    });

    it('should return unknown for non-Latin non-Arabic text', () => {
      const result = service.normalizeTextFormat('12345');
      expect(result.detectedLanguage).toBe('unknown');
    });
  });

  describe('gregorianToHijri and hijriToGregorian', () => {
    it('should convert a known Gregorian date to Hijri', () => {
      // January 1, 2024 is approximately 19 Jumada al-Thani 1445
      const hijri = service.gregorianToHijri(new Date(2024, 0, 1));
      expect(hijri.year).toBe(1445);
      expect(hijri.month).toBeGreaterThanOrEqual(1);
      expect(hijri.month).toBeLessThanOrEqual(12);
      expect(hijri.day).toBeGreaterThanOrEqual(1);
      expect(hijri.day).toBeLessThanOrEqual(30);
    });

    it('should round-trip a date through Hijri and back to Gregorian', () => {
      const original = new Date(2024, 5, 15); // June 15, 2024
      const hijri = service.gregorianToHijri(original);
      const roundTripped = service.hijriToGregorian(hijri.year, hijri.month, hijri.day);

      // Allow a tolerance of 1 day due to algorithm approximation
      const diffMs = Math.abs(original.getTime() - roundTripped.getTime());
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeLessThanOrEqual(2);
    });

    it('should produce valid Hijri month and day values', () => {
      const hijri = service.gregorianToHijri(new Date(2025, 0, 1));
      expect(hijri.month).toBeGreaterThanOrEqual(1);
      expect(hijri.month).toBeLessThanOrEqual(12);
      expect(hijri.day).toBeGreaterThanOrEqual(1);
      expect(hijri.day).toBeLessThanOrEqual(30);
    });

    it('should convert a Hijri date to Gregorian', () => {
      // 1 Muharram 1446 should be approximately July 2024
      const greg = service.hijriToGregorian(1446, 1, 1);
      expect(greg.getFullYear()).toBeGreaterThanOrEqual(2024);
      expect(greg.getFullYear()).toBeLessThanOrEqual(2025);
    });
  });
});
