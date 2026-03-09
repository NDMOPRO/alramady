import { getLocaleConfig, getAllLocales, getCulturalFormatConfig, formatNumber, formatCurrency } from '../../utils/locale-config.js';

describe('Locale Config', () => {
  describe('getLocaleConfig', () => {
    it('should return Saudi Arabia locale', () => {
      const config = getLocaleConfig('ar-SA');
      expect(config.locale).toBe('ar-SA');
      expect(config.direction).toBe('rtl');
      expect(config.calendar).toBe('hijri');
      expect(config.numberFormat.currency).toBe('SAR');
    });

    it('should return US locale', () => {
      const config = getLocaleConfig('en-US');
      expect(config.locale).toBe('en-US');
      expect(config.direction).toBe('ltr');
      expect(config.dateFormat).toBe('MM/DD/YYYY');
    });

    it('should fallback to en-US for unknown locale', () => {
      const config = getLocaleConfig('xx-XX');
      expect(config.locale).toBe('en-US');
    });
  });

  describe('getAllLocales', () => {
    it('should return available locales', () => {
      const locales = getAllLocales();
      expect(locales).toContain('ar-SA');
      expect(locales).toContain('en-US');
      expect(locales).toContain('fr-FR');
    });
  });

  describe('getCulturalFormatConfig', () => {
    it('should return Arabic cultural config', () => {
      const config = getCulturalFormatConfig('ar-SA');
      expect(config.direction).toBe('rtl');
      expect(config.currencySymbol).toBe('SAR');
      expect(config.currencyPosition).toBe('after');
      expect(config.fontFamily).toBe('Sakkal Majalla');
    });

    it('should return USD cultural config', () => {
      const config = getCulturalFormatConfig('en-US');
      expect(config.currencyPosition).toBe('before');
    });
  });

  describe('formatNumber', () => {
    it('should format with US locale', () => {
      expect(formatNumber(1234567.89, 'en-US')).toBe('1,234,567.89');
    });

    it('should format with French locale', () => {
      expect(formatNumber(1234567.89, 'fr-FR')).toBe('1 234 567,89');
    });

    it('should format with German locale', () => {
      expect(formatNumber(1234567.89, 'de-DE')).toBe('1.234.567,89');
    });
  });

  describe('formatCurrency', () => {
    it('should format USD (before)', () => {
      const result = formatCurrency(100, 'en-US');
      expect(result).toContain('USD');
      expect(result).toContain('100.00');
    });

    it('should format SAR (after)', () => {
      const result = formatCurrency(100, 'ar-SA');
      expect(result).toContain('SAR');
      expect(result.indexOf('100')).toBeLessThan(result.indexOf('SAR'));
    });
  });
});
