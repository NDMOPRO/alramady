// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────────────

jest.mock('dayjs', () => {
  const dayjs = (date) => {
    const d = date ? new Date(date) : new Date();
    return {
      isValid: () => !isNaN(d.getTime()),
      locale: () => dayjs(date),
      format: (fmt) => {
        if (fmt === 'YYYY-MM-DD') return d.toISOString().split('T')[0];
        if (fmt === 'MMMM') return ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()];
        if (fmt === 'dddd') return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
        return d.toISOString().split('T')[0];
      },
      month: () => d.getMonth(),
      day: () => d.getDay(),
    };
  };
  dayjs.extend = jest.fn();
  return { __esModule: true, default: dayjs };
});

jest.mock('dayjs/locale/ar', () => ({}));
jest.mock('dayjs/locale/en', () => ({}));
jest.mock('dayjs/locale/fr', () => ({}));

jest.mock('numeral', () => ({
  __esModule: true,
  default: (val) => ({
    format: (fmt) => {
      if (fmt === '0,0') return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
      const decimals = (fmt.split('.')[1] || '').length;
      return val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    },
  }),
}));

jest.mock('winston', () => ({
  __esModule: true,
  default: {
    createLogger: jest.fn().mockReturnValue({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    }),
    format: { combine: jest.fn(), timestamp: jest.fn(), json: jest.fn() },
    transports: { Console: jest.fn() },
  },
}));

// ─── Import Under Test ──────────────────────────────────────────────────────

import {
  applyRTL,
  handleBiDirectional,
  mirrorLayout,
  formatNumber,
  formatCurrency,
  formatDate,
  getHijriDate,
  getGregorianDate,
} from '../services/rtl-engine.service';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Engine 7.2 - RTL Engine Service', () => {
  describe('applyRTL', () => {
    it('should wrap Arabic lines with RTL markers', () => {
      const result = applyRTL('مرحبا بالعالم');
      expect(result).toContain('\u200F');
      expect(result).toContain('\u202B');
    });

    it('should not wrap non-Arabic lines with RLE markers', () => {
      const result = applyRTL('Hello world');
      expect(result).not.toContain('\u202B');
    });

    it('should throw on empty content', () => {
      expect(() => applyRTL('   ')).toThrow('Content must not be empty for RTL application');
    });

    it('should preserve blank lines', () => {
      const result = applyRTL('مرحبا\n\nالعالم');
      const lines = result.split('\n');
      // The blank line between two Arabic lines should be empty
      expect(lines[1]).toBe('');
    });
  });

  describe('handleBiDirectional', () => {
    it('should wrap LTR segments inside mainly-RTL text', () => {
      const mixed = 'مرحبا بالعالم Hello World من فضلك يا صديقي';
      const result = handleBiDirectional(mixed);
      // Should contain RLI for mainly RTL + LRE for LTR segment
      expect(result).toContain('\u2067'); // RLI
    });

    it('should wrap RTL segments inside mainly-LTR text', () => {
      const mixed = 'Hello world this is a test with مرحبا inside it here';
      const result = handleBiDirectional(mixed);
      expect(result).toContain('\u2067'); // RLI wrapping the Arabic part
    });

    it('should throw on empty text', () => {
      expect(() => handleBiDirectional('  ')).toThrow('Text must not be empty for bidi handling');
    });
  });

  describe('mirrorLayout', () => {
    it('should swap left and right margin properties', () => {
      const layout = { 'margin-left': '10px', 'margin-right': '20px' };
      const result = mirrorLayout(layout);
      expect(result['margin-right']).toBe('10px');
      expect(result['margin-left']).toBe('20px');
    });

    it('should swap text-align left to right', () => {
      const layout = { 'text-align': 'left' };
      const result = mirrorLayout(layout);
      expect(result['text-align']).toBe('right');
    });

    it('should swap direction ltr to rtl', () => {
      const layout = { direction: 'ltr' };
      const result = mirrorLayout(layout);
      expect(result.direction).toBe('rtl');
    });

    it('should swap float values', () => {
      const layout = { float: 'left' };
      const result = mirrorLayout(layout);
      expect(result.float).toBe('right');
    });

    it('should negate translateX in transform', () => {
      const layout = { transform: 'translateX(50px)' };
      const result = mirrorLayout(layout);
      expect(result.transform).toBe('translateX(-50px)');
    });

    it('should recursively mirror nested objects', () => {
      const layout = { child: { 'margin-left': '5px' } };
      const result = mirrorLayout(layout);
      expect(result.child['margin-right']).toBe('5px');
    });
  });

  describe('formatNumber', () => {
    it('should format integers for Arabic locale with Arabic-Indic numerals', () => {
      const result = formatNumber(1234, 'ar');
      // Should contain Arabic-Indic digits
      expect(result).toMatch(/[\u0660-\u0669]/);
    });

    it('should format numbers for English locale with western numerals', () => {
      const result = formatNumber(1234, 'en');
      expect(result).toMatch(/1.*2.*3.*4/);
    });

    it('should throw on NaN value', () => {
      expect(() => formatNumber(NaN, 'en')).toThrow('Invalid number value provided');
    });
  });

  describe('formatCurrency', () => {
    it('should format SAR in Arabic locale with Arabic symbol', () => {
      const result = formatCurrency(100, 'SAR', 'ar');
      expect(result).toContain('ريال سعودي');
    });

    it('should format USD in English locale with $ prefix', () => {
      const result = formatCurrency(100, 'USD', 'en');
      expect(result).toContain('$');
    });

    it('should throw on NaN currency value', () => {
      expect(() => formatCurrency(NaN, 'SAR', 'ar')).toThrow('Invalid currency value provided');
    });
  });

  describe('getHijriDate', () => {
    it('should convert a known Gregorian date to approximate Hijri', () => {
      const result = getHijriDate(new Date('2024-01-01'));
      expect(result).toHaveProperty('year');
      expect(result).toHaveProperty('month');
      expect(result).toHaveProperty('day');
      expect(result).toHaveProperty('monthName');
      expect(result.year).toBeGreaterThan(1440);
    });

    it('should throw on invalid Gregorian date', () => {
      expect(() => getHijriDate(new Date('invalid'))).toThrow();
    });
  });

  describe('getGregorianDate', () => {
    it('should convert a Hijri date to Gregorian', () => {
      const result = getGregorianDate(1445, 6, 15);
      expect(result).toHaveProperty('year');
      expect(result).toHaveProperty('month');
      expect(result).toHaveProperty('day');
      expect(result).toHaveProperty('date');
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should throw on invalid Hijri parameters', () => {
      expect(() => getGregorianDate(0, 1, 1)).toThrow('Invalid Hijri date parameters');
      expect(() => getGregorianDate(1445, 13, 1)).toThrow('Invalid Hijri date parameters');
    });
  });
});
