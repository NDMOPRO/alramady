import type { FormulaFunction, FormulaValue, FormulaContext } from '../../types/formula.types.js';

// ---------------------------------------------------------------------------
// Helpers: Excel serial date ←→ JavaScript Date
// Excel epoch: serial 1 = 1 Jan 1900.  We model "Jan 0, 1900" as the origin.
// ---------------------------------------------------------------------------

// Both conversions use UTC to avoid historical timezone drift (e.g. LMT vs
// modern offset).  Jan 1, 1900 (serial 1) is the common base.

function dateToSerial(date: Date): number {
  const msPerDay = 86_400_000;
  // Use UTC for both to avoid DST / historical-offset skew
  const targetMs = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const baseMs = Date.UTC(1900, 0, 1); // Jan 1, 1900 00:00 UTC
  const daysSinceJan1 = Math.round((targetMs - baseMs) / msPerDay);
  const s = daysSinceJan1 + 1; // serial 1 = Jan 1, 1900
  // Excel's phantom Feb 29, 1900 inflates all later serials by 1
  return s > 59 ? s + 1 : s;
}

function serialToDate(serial: number): Date {
  let s = serial;
  if (s > 59) s--; // Skip the phantom Feb 29, 1900
  // Compute in UTC, then extract y/m/d to build a local Date
  const utcMs = Date.UTC(1900, 0, s);
  const utc = new Date(utcMs);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function toNumber(v: FormulaValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isNaN(n)) return NaN;
    return n;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return NaN;
}

function isWeekend(date: Date): boolean {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  return dow === 0 || dow === 6;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
  // If the day overflowed (e.g. Jan 31 + 1 month → Mar 3), clamp to last day.
  if (result.getDate() !== date.getDate()) {
    result.setDate(0); // last day of previous month
  }
  return result;
}

function endOfMonth(date: Date, monthsOffset: number): Date {
  // Move to target month then get last day
  return new Date(date.getFullYear(), date.getMonth() + monthsOffset + 1, 0);
}

// ---------------------------------------------------------------------------
// Function implementations
// ---------------------------------------------------------------------------

const NOW_FN: FormulaFunction = {
  name: 'NOW',
  category: 'date-time',
  description: 'Returns the current date and time as an Excel serial number.',
  minArgs: 0,
  maxArgs: 0,
  isVolatile: true,
  returnsArray: false,
  execute: (_args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const now = new Date();
    const daySerial = dateToSerial(now);
    const fraction =
      (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
    return daySerial + fraction;
  },
};

const TODAY_FN: FormulaFunction = {
  name: 'TODAY',
  category: 'date-time',
  description: 'Returns the current date as an Excel serial number (no time component).',
  minArgs: 0,
  maxArgs: 0,
  isVolatile: true,
  returnsArray: false,
  execute: (_args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return dateToSerial(today);
  },
};

const DATE_FN: FormulaFunction = {
  name: 'DATE',
  category: 'date-time',
  description: 'Creates a date serial number from year, month, and day.',
  minArgs: 3,
  maxArgs: 3,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const year = toNumber(args[0]);
    const month = toNumber(args[1]);
    const day = toNumber(args[2]);
    if ([year, month, day].some(Number.isNaN)) return '#VALUE!' as FormulaValue;
    // JS Date constructor handles overflow (e.g. month 13 → next year)
    const date = new Date(year, month - 1, day);
    if (year >= 0 && year <= 99) date.setFullYear(year);
    return dateToSerial(date);
  },
};

const YEAR_FN: FormulaFunction = {
  name: 'YEAR',
  category: 'date-time',
  description: 'Returns the year of a date given its serial number.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const serial = toNumber(args[0]);
    if (Number.isNaN(serial)) return '#VALUE!' as FormulaValue;
    return serialToDate(Math.floor(serial)).getFullYear();
  },
};

const MONTH_FN: FormulaFunction = {
  name: 'MONTH',
  category: 'date-time',
  description: 'Returns the month (1-12) of a date given its serial number.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const serial = toNumber(args[0]);
    if (Number.isNaN(serial)) return '#VALUE!' as FormulaValue;
    return serialToDate(Math.floor(serial)).getMonth() + 1;
  },
};

const DAY_FN: FormulaFunction = {
  name: 'DAY',
  category: 'date-time',
  description: 'Returns the day of the month (1-31) of a date given its serial number.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const serial = toNumber(args[0]);
    if (Number.isNaN(serial)) return '#VALUE!' as FormulaValue;
    return serialToDate(Math.floor(serial)).getDate();
  },
};

const HOUR_FN: FormulaFunction = {
  name: 'HOUR',
  category: 'date-time',
  description: 'Returns the hour (0-23) from an Excel serial number.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const serial = toNumber(args[0]);
    if (Number.isNaN(serial)) return '#VALUE!' as FormulaValue;
    const fraction = serial - Math.floor(serial);
    const totalSeconds = Math.round(fraction * 86400);
    return Math.floor(totalSeconds / 3600) % 24;
  },
};

const MINUTE_FN: FormulaFunction = {
  name: 'MINUTE',
  category: 'date-time',
  description: 'Returns the minute (0-59) from an Excel serial number.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const serial = toNumber(args[0]);
    if (Number.isNaN(serial)) return '#VALUE!' as FormulaValue;
    const fraction = serial - Math.floor(serial);
    const totalSeconds = Math.round(fraction * 86400);
    return Math.floor((totalSeconds % 3600) / 60);
  },
};

const SECOND_FN: FormulaFunction = {
  name: 'SECOND',
  category: 'date-time',
  description: 'Returns the second (0-59) from an Excel serial number.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const serial = toNumber(args[0]);
    if (Number.isNaN(serial)) return '#VALUE!' as FormulaValue;
    const fraction = serial - Math.floor(serial);
    const totalSeconds = Math.round(fraction * 86400);
    return totalSeconds % 60;
  },
};

const DATEVALUE_FN: FormulaFunction = {
  name: 'DATEVALUE',
  category: 'date-time',
  description: 'Converts a date string to an Excel serial number.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const str = args[0];
    if (typeof str !== 'string') return '#VALUE!' as FormulaValue;
    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) return '#VALUE!' as FormulaValue;
    // Strip time component
    const dateOnly = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    return dateToSerial(dateOnly);
  },
};

const EDATE_FN: FormulaFunction = {
  name: 'EDATE',
  category: 'date-time',
  description: 'Returns the serial number of a date that is a specified number of months before or after a start date.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const startSerial = toNumber(args[0]);
    const months = toNumber(args[1]);
    if (Number.isNaN(startSerial) || Number.isNaN(months)) return '#VALUE!' as FormulaValue;
    const startDate = serialToDate(Math.floor(startSerial));
    const result = addMonths(startDate, Math.floor(months));
    return dateToSerial(result);
  },
};

const EOMONTH_FN: FormulaFunction = {
  name: 'EOMONTH',
  category: 'date-time',
  description: 'Returns the serial number of the last day of the month that is a specified number of months before or after a start date.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const startSerial = toNumber(args[0]);
    const months = toNumber(args[1]);
    if (Number.isNaN(startSerial) || Number.isNaN(months)) return '#VALUE!' as FormulaValue;
    const startDate = serialToDate(Math.floor(startSerial));
    const result = endOfMonth(startDate, Math.floor(months));
    return dateToSerial(result);
  },
};

const NETWORKDAYS_FN: FormulaFunction = {
  name: 'NETWORKDAYS',
  category: 'date-time',
  description: 'Returns the number of whole working days between two dates, excluding weekends.',
  minArgs: 2,
  maxArgs: 3,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const startSerial = toNumber(args[0]);
    const endSerial = toNumber(args[1]);
    if (Number.isNaN(startSerial) || Number.isNaN(endSerial)) return '#VALUE!' as FormulaValue;

    // Optional holidays array
    const holidays = new Set<number>();
    if (args.length >= 3 && args[2] != null) {
      const hol = args[2];
      if (Array.isArray(hol)) {
        for (const h of hol) {
          const n = toNumber(h);
          if (!Number.isNaN(n)) holidays.add(Math.floor(n));
        }
      } else {
        const n = toNumber(hol);
        if (!Number.isNaN(n)) holidays.add(Math.floor(n));
      }
    }

    const start = Math.floor(startSerial);
    const end = Math.floor(endSerial);
    const direction = start <= end ? 1 : -1;
    const low = Math.min(start, end);
    const high = Math.max(start, end);

    let count = 0;
    for (let s = low; s <= high; s++) {
      const d = serialToDate(s);
      if (!isWeekend(d) && !holidays.has(s)) {
        count++;
      }
    }
    return count * direction;
  },
};

const WORKDAY_FN: FormulaFunction = {
  name: 'WORKDAY',
  category: 'date-time',
  description: 'Returns the serial number of the date a specified number of working days before or after a start date.',
  minArgs: 2,
  maxArgs: 3,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const startSerial = toNumber(args[0]);
    const days = toNumber(args[1]);
    if (Number.isNaN(startSerial) || Number.isNaN(days)) return '#VALUE!' as FormulaValue;

    const holidays = new Set<number>();
    if (args.length >= 3 && args[2] != null) {
      const hol = args[2];
      if (Array.isArray(hol)) {
        for (const h of hol) {
          const n = toNumber(h);
          if (!Number.isNaN(n)) holidays.add(Math.floor(n));
        }
      } else {
        const n = toNumber(hol);
        if (!Number.isNaN(n)) holidays.add(Math.floor(n));
      }
    }

    let current = Math.floor(startSerial);
    let remaining = Math.abs(Math.floor(days));
    const step = days >= 0 ? 1 : -1;

    while (remaining > 0) {
      current += step;
      const d = serialToDate(current);
      if (!isWeekend(d) && !holidays.has(current)) {
        remaining--;
      }
    }
    return current;
  },
};

const DATEDIF_FN: FormulaFunction = {
  name: 'DATEDIF',
  category: 'date-time',
  description: 'Calculates the difference between two dates in years, months, or days.',
  minArgs: 3,
  maxArgs: 3,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const startSerial = toNumber(args[0]);
    const endSerial = toNumber(args[1]);
    const unit = typeof args[2] === 'string' ? args[2].toUpperCase() : '';

    if (Number.isNaN(startSerial) || Number.isNaN(endSerial)) return '#VALUE!' as FormulaValue;
    if (startSerial > endSerial) return '#NUM!' as FormulaValue;

    const start = serialToDate(Math.floor(startSerial));
    const end = serialToDate(Math.floor(endSerial));

    const sy = start.getFullYear();
    const sm = start.getMonth();
    const sd = start.getDate();
    const ey = end.getFullYear();
    const em = end.getMonth();
    const ed = end.getDate();

    switch (unit) {
      case 'Y': {
        let years = ey - sy;
        if (em < sm || (em === sm && ed < sd)) years--;
        return Math.max(0, years);
      }
      case 'M': {
        let months = (ey - sy) * 12 + (em - sm);
        if (ed < sd) months--;
        return Math.max(0, months);
      }
      case 'D': {
        const diffMs = end.getTime() - start.getTime();
        return Math.floor(diffMs / 86_400_000);
      }
      case 'MD': {
        // Difference in days, ignoring months and years
        let days = ed - sd;
        if (days < 0) {
          // Days in the month before the end date
          const prevMonth = new Date(ey, em, 0);
          days = prevMonth.getDate() - sd + ed;
        }
        return days;
      }
      case 'YM': {
        // Difference in months, ignoring years and days
        let months = em - sm;
        if (ed < sd) months--;
        if (months < 0) months += 12;
        return months;
      }
      case 'YD': {
        // Difference in days, ignoring years
        const startThisYear = new Date(ey, sm, sd);
        let diffMs: number;
        if (startThisYear <= end) {
          diffMs = end.getTime() - startThisYear.getTime();
        } else {
          const startPrevYear = new Date(ey - 1, sm, sd);
          diffMs = end.getTime() - startPrevYear.getTime();
        }
        return Math.floor(diffMs / 86_400_000);
      }
      default:
        return '#NUM!' as FormulaValue;
    }
  },
};

const WEEKDAY_FN: FormulaFunction = {
  name: 'WEEKDAY',
  category: 'date-time',
  description: 'Returns the day of the week for a date serial number.',
  minArgs: 1,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const serial = toNumber(args[0]);
    if (Number.isNaN(serial)) return '#VALUE!' as FormulaValue;

    const returnType = args.length >= 2 ? toNumber(args[1]) : 1;
    if (Number.isNaN(returnType)) return '#VALUE!' as FormulaValue;

    const date = serialToDate(Math.floor(serial));
    const jsDow = date.getDay(); // 0=Sun … 6=Sat

    switch (Math.floor(returnType)) {
      case 1:
        // Sunday=1 … Saturday=7
        return jsDow + 1;
      case 2:
        // Monday=1 … Sunday=7
        return jsDow === 0 ? 7 : jsDow;
      case 3:
        // Monday=0 … Sunday=6
        return jsDow === 0 ? 6 : jsDow - 1;
      default:
        return '#NUM!' as FormulaValue;
    }
  },
};

const WEEKNUM_FN: FormulaFunction = {
  name: 'WEEKNUM',
  category: 'date-time',
  description: 'Returns the week number of a date within the year.',
  minArgs: 1,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const serial = toNumber(args[0]);
    if (Number.isNaN(serial)) return '#VALUE!' as FormulaValue;

    const returnType = args.length >= 2 ? toNumber(args[1]) : 1;
    if (Number.isNaN(returnType)) return '#VALUE!' as FormulaValue;

    const date = serialToDate(Math.floor(serial));
    const year = date.getFullYear();

    // Week start day: type 1 → Sunday (0), type 2 → Monday (1)
    let weekStart: number;
    switch (Math.floor(returnType)) {
      case 1:
        weekStart = 0; // Sunday
        break;
      case 2:
        weekStart = 1; // Monday
        break;
      default:
        return '#NUM!' as FormulaValue;
    }

    const jan1 = new Date(year, 0, 1);
    const jan1Dow = jan1.getDay();

    // Days from Jan 1 to the date
    const dayOfYear = Math.floor(
      (date.getTime() - jan1.getTime()) / 86_400_000
    );

    // Offset: how many days Jan 1 is past the week-start day
    const offset = (jan1Dow - weekStart + 7) % 7;

    return Math.floor((dayOfYear + offset) / 7) + 1;
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const dateTimeFunctions: FormulaFunction[] = [
  NOW_FN,
  TODAY_FN,
  DATE_FN,
  YEAR_FN,
  MONTH_FN,
  DAY_FN,
  HOUR_FN,
  MINUTE_FN,
  SECOND_FN,
  DATEVALUE_FN,
  EDATE_FN,
  EOMONTH_FN,
  NETWORKDAYS_FN,
  WORKDAY_FN,
  DATEDIF_FN,
  WEEKDAY_FN,
  WEEKNUM_FN,
];
