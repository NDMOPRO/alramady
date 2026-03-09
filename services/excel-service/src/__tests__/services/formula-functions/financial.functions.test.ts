import { financialFunctions } from '../../../services/formula-functions/financial.functions.js';
import type { FormulaContext } from '../../../types/formula.types.js';

const ctx: FormulaContext = { cellValues: new Map() };
const getFunc = (name: string) => financialFunctions.find(f => f.name === name)!;

describe('financial functions', () => {
  describe('PMT', () => {
    it('should calculate a monthly mortgage payment', () => {
      // PMT(0.05/12, 360, 200000) => approx -1073.64
      // 5% annual rate, 30 years (360 months), $200k loan
      const result = getFunc('PMT').execute([0.05 / 12, 360, 200000], ctx) as number;
      expect(result).toBeCloseTo(-1073.64, 2);
    });

    it('should handle zero interest rate', () => {
      // PMT(0, 12, 12000) => -(12000 + 0) / 12 = -1000
      const result = getFunc('PMT').execute([0, 12, 12000], ctx) as number;
      expect(result).toBeCloseTo(-1000, 2);
    });

    it('should account for future value', () => {
      // PMT(0.06/12, 120, 0, 100000) => saving to reach $100k in 10 years at 6%
      const result = getFunc('PMT').execute([0.06 / 12, 120, 0, 100000], ctx) as number;
      expect(result).toBeCloseTo(-610.21, 1);
    });

    it('should handle payments at beginning of period (type=1)', () => {
      // PMT(0.05/12, 360, 200000, 0, 1)
      const result = getFunc('PMT').execute([0.05 / 12, 360, 200000, 0, 1], ctx) as number;
      // type=1 divides by (1+rate), slightly smaller magnitude
      expect(result).toBeCloseTo(-1069.18, 1);
    });
  });

  describe('FV', () => {
    it('should calculate the future value of periodic investments', () => {
      // FV(0.06/12, 120, -200, -5000) => investing $200/month for 10 years at 6%, starting $5k
      const result = getFunc('FV').execute([0.06 / 12, 120, -200, -5000], ctx) as number;
      expect(result).toBeCloseTo(41872.85, 0);
    });

    it('should handle zero rate', () => {
      // FV(0, 12, -1000, 0) => 12000
      const result = getFunc('FV').execute([0, 12, -1000, 0], ctx) as number;
      expect(result).toBeCloseTo(12000, 2);
    });

    it('should return correct value with no periodic payment', () => {
      // FV(0.05, 10, 0, -1000) => 1000 * (1.05)^10 => ~1628.89
      const result = getFunc('FV').execute([0.05, 10, 0, -1000], ctx) as number;
      expect(result).toBeCloseTo(1628.89, 1);
    });
  });

  describe('PV', () => {
    it('should calculate the present value of an annuity', () => {
      // PV(0.08/12, 240, -500) => present value of $500/month for 20 years at 8%
      const result = getFunc('PV').execute([0.08 / 12, 240, -500], ctx) as number;
      expect(result).toBeCloseTo(59777.15, 0);
    });

    it('should handle zero rate', () => {
      // PV(0, 10, -1000) => 10000
      const result = getFunc('PV').execute([0, 10, -1000], ctx) as number;
      expect(result).toBeCloseTo(10000, 2);
    });

    it('should account for future value', () => {
      // PV(0.10, 5, 0, -10000) => 10000 / (1.10)^5 => ~6209.21
      const result = getFunc('PV').execute([0.10, 5, 0, -10000], ctx) as number;
      expect(result).toBeCloseTo(6209.21, 1);
    });
  });

  describe('NPV', () => {
    it('should calculate net present value for a series of cash flows', () => {
      // NPV(0.10, -10000, 3000, 4200, 6800)
      // = 3000/1.1 + 4200/1.1^2 + 6800/1.1^3 - ... but note NPV doesn't subtract initial investment
      // NPV(0.10, -10000, 3000, 4200, 6800)
      // = -10000/1.1 + 3000/1.1^2 + 4200/1.1^3 + 6800/1.1^4
      const result = getFunc('NPV').execute([0.10, -10000, 3000, 4200, 6800], ctx) as number;
      expect(result).toBeCloseTo(1188.44, 0);
    });

    it('should handle a single cash flow', () => {
      // NPV(0.10, 1000) => 1000/1.1 => ~909.09
      const result = getFunc('NPV').execute([0.10, 1000], ctx) as number;
      expect(result).toBeCloseTo(909.09, 1);
    });
  });

  describe('IRR', () => {
    it('should compute the internal rate of return', () => {
      // IRR([-10000, 3000, 4200, 6800]) => ~0.1634 (16.34%)
      const result = getFunc('IRR').execute([[-10000, 3000, 4200, 6800]], ctx) as number;
      expect(result).toBeCloseTo(0.1634, 3);
    });

    it('should return #NUM! when all cash flows are positive', () => {
      const result = getFunc('IRR').execute([[1000, 2000, 3000]], ctx);
      expect(result).toBe('#NUM!');
    });

    it('should return #NUM! when all cash flows are negative', () => {
      const result = getFunc('IRR').execute([[-1000, -2000, -3000]], ctx);
      expect(result).toBe('#NUM!');
    });
  });

  describe('SLN', () => {
    it('should calculate straight-line depreciation', () => {
      // SLN(30000, 7500, 10) => (30000-7500)/10 = 2250
      const result = getFunc('SLN').execute([30000, 7500, 10], ctx) as number;
      expect(result).toBeCloseTo(2250, 2);
    });

    it('should return #DIV/0! when life is zero', () => {
      const result = getFunc('SLN').execute([10000, 1000, 0], ctx);
      expect(result).toBe('#DIV/0!');
    });

    it('should handle zero salvage value', () => {
      // SLN(10000, 0, 5) => 2000
      const result = getFunc('SLN').execute([10000, 0, 5], ctx) as number;
      expect(result).toBeCloseTo(2000, 2);
    });
  });

  describe('DDB', () => {
    it('should calculate double-declining balance depreciation for period 1', () => {
      // DDB(10000, 1000, 5, 1) => 10000 * (2/5) = 4000
      const result = getFunc('DDB').execute([10000, 1000, 5, 1], ctx) as number;
      expect(result).toBeCloseTo(4000, 2);
    });

    it('should calculate depreciation for period 2', () => {
      // DDB(10000, 1000, 5, 2) => (10000 - 4000) * (2/5) = 2400
      const result = getFunc('DDB').execute([10000, 1000, 5, 2], ctx) as number;
      expect(result).toBeCloseTo(2400, 2);
    });

    it('should not depreciate below salvage value', () => {
      // DDB(10000, 1000, 5, 4)
      // Period 1: 4000, BV=6000
      // Period 2: 2400, BV=3600
      // Period 3: 1440, BV=2160
      // Period 4: would be 864, but BV would go to 1296 which is > salvage, so 864
      const result = getFunc('DDB').execute([10000, 1000, 5, 4], ctx) as number;
      expect(result).toBeCloseTo(864, 2);
    });

    it('should cap depreciation so book value does not drop below salvage', () => {
      // DDB(10000, 1000, 5, 5)
      // Period 1: 4000, BV=6000
      // Period 2: 2400, BV=3600
      // Period 3: 1440, BV=2160
      // Period 4: 864, BV=1296
      // Period 5: would be 518.4 but BV-518.4=777.6 < 1000, so capped to 296
      const result = getFunc('DDB').execute([10000, 1000, 5, 5], ctx) as number;
      expect(result).toBeCloseTo(296, 2);
    });

    it('should return #DIV/0! when life is zero', () => {
      const result = getFunc('DDB').execute([10000, 1000, 0, 1], ctx);
      expect(result).toBe('#DIV/0!');
    });

    it('should support a custom factor', () => {
      // DDB(10000, 1000, 5, 1, 1.5) => 10000 * (1.5/5) = 3000
      const result = getFunc('DDB').execute([10000, 1000, 5, 1, 1.5], ctx) as number;
      expect(result).toBeCloseTo(3000, 2);
    });
  });
});
