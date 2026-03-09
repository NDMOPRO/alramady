import { dateTimeFunctions } from '../../../services/formula-functions/date-time.functions.js';
import type { FormulaContext } from '../../../types/formula.types.js';

const ctx: FormulaContext = { cellValues: new Map() };
const getFunc = (name: string) => dateTimeFunctions.find(f => f.name === name)!;

describe('date-time functions', () => {
  describe('NOW', () => {
    it('should be volatile', () => {
      expect(getFunc('NOW').isVolatile).toBe(true);
    });

    it('should return a number greater than 0', () => {
      const result = getFunc('NOW').execute([], ctx);
      expect(typeof result).toBe('number');
      expect(result as number).toBeGreaterThan(0);
    });
  });

  describe('TODAY', () => {
    it('should be volatile', () => {
      expect(getFunc('TODAY').isVolatile).toBe(true);
    });

    it('should return a number greater than 0', () => {
      const result = getFunc('TODAY').execute([], ctx);
      expect(typeof result).toBe('number');
      expect(result as number).toBeGreaterThan(0);
    });

    it('should return an integer (no time fraction)', () => {
      const result = getFunc('TODAY').execute([], ctx) as number;
      expect(result).toBe(Math.floor(result));
    });
  });

  describe('DATE', () => {
    it('should return the serial number for a given year, month, day', () => {
      // DATE(2023, 1, 15) => 44941
      const result = getFunc('DATE').execute([2023, 1, 15], ctx);
      expect(result).toBe(44941);
    });

    it('should handle month overflow', () => {
      // DATE(2023, 13, 1) => same as DATE(2024, 1, 1)
      const overflow = getFunc('DATE').execute([2023, 13, 1], ctx);
      const normal = getFunc('DATE').execute([2024, 1, 1], ctx);
      expect(overflow).toBe(normal);
    });

    it('should return #VALUE! for non-numeric arguments', () => {
      const result = getFunc('DATE').execute(['abc', 1, 1], ctx);
      expect(result).toBe('#VALUE!');
    });
  });

  describe('YEAR', () => {
    it('should extract the year from a serial number', () => {
      // Serial 44941 => Jan 15 2023
      const result = getFunc('YEAR').execute([44941], ctx);
      expect(result).toBe(2023);
    });

    it('should return #VALUE! for non-numeric input', () => {
      expect(getFunc('YEAR').execute(['abc'], ctx)).toBe('#VALUE!');
    });
  });

  describe('MONTH', () => {
    it('should extract the month from a serial number', () => {
      // Serial 44941 => Jan 15 2023 => month 1
      const result = getFunc('MONTH').execute([44941], ctx);
      expect(result).toBe(1);
    });

    it('should return month 6 for June date', () => {
      // Serial 45097 => Jun 20 2023
      expect(getFunc('MONTH').execute([45097], ctx)).toBe(6);
    });
  });

  describe('DAY', () => {
    it('should extract the day from a serial number', () => {
      // Serial 44941 => Jan 15 2023 => day 15
      const result = getFunc('DAY').execute([44941], ctx);
      expect(result).toBe(15);
    });

    it('should return day 20 for Jun 20 2023', () => {
      expect(getFunc('DAY').execute([45097], ctx)).toBe(20);
    });
  });

  describe('HOUR', () => {
    it('should return 0 for a date with no time fraction', () => {
      expect(getFunc('HOUR').execute([44941], ctx)).toBe(0);
    });

    it('should return 12 for a 0.5 fraction (noon)', () => {
      expect(getFunc('HOUR').execute([44941.5], ctx)).toBe(12);
    });

    it('should return 18 for a 0.75 fraction', () => {
      expect(getFunc('HOUR').execute([44941.75], ctx)).toBe(18);
    });
  });

  describe('MINUTE', () => {
    it('should return 0 for an integer serial', () => {
      expect(getFunc('MINUTE').execute([44941], ctx)).toBe(0);
    });

    it('should return 30 for half-hour past noon', () => {
      // 0.5 + 30min/1440min = 0.5 + 0.020833... = 0.520833...
      const serial = 44941 + 0.5 + 30 / 1440;
      expect(getFunc('MINUTE').execute([serial], ctx)).toBe(30);
    });
  });

  describe('SECOND', () => {
    it('should return 0 for an integer serial', () => {
      expect(getFunc('SECOND').execute([44941], ctx)).toBe(0);
    });

    it('should return 45 for 45 seconds past midnight', () => {
      // 45 seconds = 45/86400
      const serial = 44941 + 45 / 86400;
      expect(getFunc('SECOND').execute([serial], ctx)).toBe(45);
    });
  });

  describe('DATEVALUE', () => {
    it('should convert a date string to a serial number', () => {
      const result = getFunc('DATEVALUE').execute(['2023-01-15'], ctx);
      expect(result).toBe(44941);
    });

    it('should return #VALUE! for non-string input', () => {
      expect(getFunc('DATEVALUE').execute([12345], ctx)).toBe('#VALUE!');
    });

    it('should return #VALUE! for an unparseable date string', () => {
      expect(getFunc('DATEVALUE').execute(['not-a-date'], ctx)).toBe('#VALUE!');
    });
  });

  describe('EDATE', () => {
    it('should add months to a start date', () => {
      // EDATE(44941, 3) => Jan 15 2023 + 3 months => Apr 15 2023 => 45031
      const result = getFunc('EDATE').execute([44941, 3], ctx);
      expect(result).toBe(45031);
    });

    it('should subtract months with a negative value', () => {
      // EDATE(44941, -1) => Dec 15 2022
      const dec15 = getFunc('DATE').execute([2022, 12, 15], ctx);
      const result = getFunc('EDATE').execute([44941, -1], ctx);
      expect(result).toBe(dec15);
    });
  });

  describe('EOMONTH', () => {
    it('should return end of month after adding months', () => {
      // EOMONTH(44941, 1) => end of Feb 2023 => Feb 28 2023 => 44985
      const result = getFunc('EOMONTH').execute([44941, 1], ctx);
      expect(result).toBe(44985);
    });

    it('should return end of current month when months offset is 0', () => {
      // EOMONTH(44941, 0) => end of Jan 2023 => Jan 31 2023
      const jan31 = getFunc('DATE').execute([2023, 1, 31], ctx);
      const result = getFunc('EOMONTH').execute([44941, 0], ctx);
      expect(result).toBe(jan31);
    });
  });

  describe('NETWORKDAYS', () => {
    it('should count working days between two dates (Mon-Fri)', () => {
      // Mon Jan 2 2023 (44928) to Fri Jan 6 2023 (44932) => 5 working days
      const result = getFunc('NETWORKDAYS').execute([44928, 44932], ctx);
      expect(result).toBe(5);
    });

    it('should return negative when start > end', () => {
      const result = getFunc('NETWORKDAYS').execute([44932, 44928], ctx);
      expect(result).toBe(-5);
    });

    it('should return #VALUE! for non-numeric input', () => {
      expect(getFunc('NETWORKDAYS').execute(['abc', 44932], ctx)).toBe('#VALUE!');
    });
  });

  describe('WORKDAY', () => {
    it('should return the serial after skipping weekends', () => {
      // WORKDAY(44928, 5) => Mon Jan 2 + 5 workdays => Mon Jan 9 2023 => 44935
      const result = getFunc('WORKDAY').execute([44928, 5], ctx);
      expect(result).toBe(44935);
    });

    it('should go backward with negative days', () => {
      // WORKDAY(44935, -5) => Mon Jan 9 - 5 workdays => Mon Jan 2 => 44928
      const result = getFunc('WORKDAY').execute([44935, -5], ctx);
      expect(result).toBe(44928);
    });
  });

  describe('DATEDIF', () => {
    // DATE(2020,1,1) = 43831 to DATE(2023,6,15) = 45092

    it('should compute difference in complete years ("Y")', () => {
      const result = getFunc('DATEDIF').execute([43831, 45092, 'Y'], ctx);
      expect(result).toBe(3);
    });

    it('should compute difference in complete months ("M")', () => {
      const result = getFunc('DATEDIF').execute([43831, 45092, 'M'], ctx);
      expect(result).toBe(41);
    });

    it('should compute difference in days ("D")', () => {
      const result = getFunc('DATEDIF').execute([43831, 45092, 'D'], ctx);
      expect(result).toBe(1261);
    });

    it('should return #NUM! when start > end', () => {
      expect(getFunc('DATEDIF').execute([45092, 43831, 'D'], ctx)).toBe('#NUM!');
    });

    it('should return #NUM! for an invalid unit', () => {
      expect(getFunc('DATEDIF').execute([43831, 45092, 'X'], ctx)).toBe('#NUM!');
    });
  });

  describe('WEEKDAY', () => {
    it('should return Sunday=1 for type 1 (default)', () => {
      // Jan 15 2023 is a Sunday => type 1 => 1
      const result = getFunc('WEEKDAY').execute([44941], ctx);
      expect(result).toBe(1);
    });

    it('should return Sunday=7 for type 2', () => {
      const result = getFunc('WEEKDAY').execute([44941, 2], ctx);
      expect(result).toBe(7);
    });

    it('should return Sunday=6 for type 3', () => {
      const result = getFunc('WEEKDAY').execute([44941, 3], ctx);
      expect(result).toBe(6);
    });

    it('should return #NUM! for invalid return type', () => {
      expect(getFunc('WEEKDAY').execute([44941, 5], ctx)).toBe('#NUM!');
    });
  });

  describe('WEEKNUM', () => {
    it('should return the week number for a date (type 1, weeks start Sunday)', () => {
      // Jan 15 2023 (Sunday). Jan 1 2023 is also Sunday.
      // dayOfYear=14, offset=0, weeknum = floor(14/7)+1 = 3
      const result = getFunc('WEEKNUM').execute([44941], ctx);
      expect(result).toBe(3);
    });

    it('should return week 1 for Jan 1', () => {
      // Jan 1 2023 serial
      const jan1Serial = getFunc('DATE').execute([2023, 1, 1], ctx) as number;
      const result = getFunc('WEEKNUM').execute([jan1Serial], ctx);
      expect(result).toBe(1);
    });

    it('should return #NUM! for an invalid return type', () => {
      expect(getFunc('WEEKNUM').execute([44941, 5], ctx)).toBe('#NUM!');
    });
  });
});
