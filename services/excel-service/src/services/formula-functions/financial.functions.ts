import type { FormulaFunction, FormulaValue, FormulaContext } from '../../types/formula.types.js';
import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(v: FormulaValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (isNaN(n)) throw new Error('#VALUE!');
    return n;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null) return 0;
  throw new Error('#VALUE!');
}

function toDec(v: FormulaValue): Decimal {
  return new Decimal(toNum(v));
}

/** Flatten nested arrays into a flat number[] (used by NPV, IRR, etc.) */
function flattenNumbers(args: FormulaValue[]): number[] {
  const result: number[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      result.push(...flattenNumbers(a));
    } else {
      result.push(toNum(a));
    }
  }
  return result;
}

/** Convert a serial date number to a JS Date (Excel epoch 1899-12-30). */
function serialToDate(serial: number): Date {
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}

/** Difference in days between two serial dates. */
function daysDiff(s1: number, s2: number): number {
  return s1 - s2;
}

// ---------------------------------------------------------------------------
// 1. PMT – periodic payment for a loan
// ---------------------------------------------------------------------------
function executePMT(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  const rate = toDec(args[0]);
  const nper = toDec(args[1]);
  const pv = toDec(args[2]);
  const fv = args.length > 3 ? toDec(args[3]) : new Decimal(0);
  const type = args.length > 4 ? toNum(args[4]) : 0;

  if (rate.isZero()) {
    // -(pv + fv) / nper
    if (nper.isZero()) return '#DIV/0!' as FormulaValue;
    return pv.plus(fv).neg().div(nper).toNumber();
  }

  // (1 + rate) ^ nper
  const compound = rate.plus(1).pow(nper);
  // numerator = rate * (pv * compound + fv)
  const numerator = rate.mul(pv.mul(compound).plus(fv));
  // denominator = compound - 1
  const denominator = compound.minus(1);
  if (denominator.isZero()) return '#DIV/0!' as FormulaValue;

  let result = numerator.div(denominator).neg();
  if (type !== 0) {
    result = result.div(rate.plus(1));
  }
  return result.toNumber();
}

// ---------------------------------------------------------------------------
// 2. FV – future value
// ---------------------------------------------------------------------------
function executeFV(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  const rate = toDec(args[0]);
  const nper = toDec(args[1]);
  const pmt = toDec(args[2]);
  const pv = args.length > 3 ? toDec(args[3]) : new Decimal(0);
  const type = args.length > 4 ? toNum(args[4]) : 0;

  if (rate.isZero()) {
    // -pv - pmt * nper
    return pv.neg().minus(pmt.mul(nper)).toNumber();
  }

  const compound = rate.plus(1).pow(nper);
  const annuityFactor = compound.minus(1).div(rate);
  const typeFactor = type !== 0 ? rate.plus(1) : new Decimal(1);

  // FV = -pv * compound - pmt * annuityFactor * typeFactor
  return pv.neg().mul(compound).minus(pmt.mul(annuityFactor).mul(typeFactor)).toNumber();
}

// ---------------------------------------------------------------------------
// 3. PV – present value
// ---------------------------------------------------------------------------
function executePV(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  const rate = toDec(args[0]);
  const nper = toDec(args[1]);
  const pmt = toDec(args[2]);
  const fv = args.length > 3 ? toDec(args[3]) : new Decimal(0);
  const type = args.length > 4 ? toNum(args[4]) : 0;

  if (rate.isZero()) {
    // -fv - pmt * nper
    return fv.neg().minus(pmt.mul(nper)).toNumber();
  }

  const compound = rate.plus(1).pow(nper);
  const annuityFactor = compound.minus(1).div(rate);
  const typeFactor = type !== 0 ? rate.plus(1) : new Decimal(1);

  // PV = (-fv - pmt * annuityFactor * typeFactor) / compound
  return fv.neg().minus(pmt.mul(annuityFactor).mul(typeFactor)).div(compound).toNumber();
}

// ---------------------------------------------------------------------------
// 4. NPV – net present value
// ---------------------------------------------------------------------------
function executeNPV(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  if (args.length < 2) return '#VALUE!' as FormulaValue;
  const rate = toDec(args[0]);
  const values = flattenNumbers(args.slice(1));

  let npv = new Decimal(0);
  for (let i = 0; i < values.length; i++) {
    // values[i] / (1 + rate) ^ (i + 1)
    npv = npv.plus(new Decimal(values[i]).div(rate.plus(1).pow(i + 1)));
  }
  return npv.toNumber();
}

// ---------------------------------------------------------------------------
// 5. IRR – internal rate of return (Newton-Raphson)
// ---------------------------------------------------------------------------
function executeIRR(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  // IRR(values, [guess]) – values is an array of cash flows, guess is optional scalar
  let cashFlows: number[];
  if (Array.isArray(args[0])) {
    cashFlows = flattenNumbers(args[0] as FormulaValue[]);
  } else {
    cashFlows = flattenNumbers([args[0]]);
  }

  const guess = args.length > 1 && !Array.isArray(args[1]) ? toNum(args[1]) : 0.1;

  // Validate: must have at least one positive and one negative
  const hasPos = cashFlows.some(v => v > 0);
  const hasNeg = cashFlows.some(v => v < 0);
  if (!hasPos || !hasNeg) return '#NUM!' as FormulaValue;

  let rate = new Decimal(guess);
  const maxIter = 100;
  const tolerance = new Decimal('1e-10');

  for (let iter = 0; iter < maxIter; iter++) {
    let npv = new Decimal(0);
    let dnpv = new Decimal(0); // derivative

    for (let i = 0; i < cashFlows.length; i++) {
      const cf = new Decimal(cashFlows[i]);
      const factor = rate.plus(1).pow(i);
      if (factor.isZero()) return '#NUM!' as FormulaValue;
      npv = npv.plus(cf.div(factor));
      if (i > 0) {
        dnpv = dnpv.minus(cf.mul(i).div(rate.plus(1).pow(i + 1)));
      }
    }

    if (dnpv.isZero()) return '#NUM!' as FormulaValue;

    const newRate = rate.minus(npv.div(dnpv));
    if (newRate.minus(rate).abs().lte(tolerance)) {
      return newRate.toNumber();
    }
    rate = newRate;

    // Guard against divergence
    if (rate.lt(-1)) return '#NUM!' as FormulaValue;
  }

  return '#NUM!' as FormulaValue;
}

// ---------------------------------------------------------------------------
// 6. XIRR – IRR for irregular cash flows
// ---------------------------------------------------------------------------
function executeXIRR(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  if (args.length < 2) return '#VALUE!' as FormulaValue;

  const values = flattenNumbers(Array.isArray(args[0]) ? args[0] as FormulaValue[] : [args[0]]);
  const dateSerials = flattenNumbers(Array.isArray(args[1]) ? args[1] as FormulaValue[] : [args[1]]);
  const guess = args.length > 2 ? toNum(args[2]) : 0.1;

  if (values.length !== dateSerials.length || values.length < 2) return '#NUM!' as FormulaValue;

  const hasPos = values.some(v => v > 0);
  const hasNeg = values.some(v => v < 0);
  if (!hasPos || !hasNeg) return '#NUM!' as FormulaValue;

  const d0 = dateSerials[0];
  let rate = new Decimal(guess);
  const maxIter = 100;
  const tolerance = new Decimal('1e-10');

  for (let iter = 0; iter < maxIter; iter++) {
    let fVal = new Decimal(0);
    let fDeriv = new Decimal(0);

    for (let i = 0; i < values.length; i++) {
      const cf = new Decimal(values[i]);
      const exponent = new Decimal(daysDiff(dateSerials[i], d0)).div(365);
      const denom = rate.plus(1).pow(exponent);
      if (denom.isZero()) return '#NUM!' as FormulaValue;
      fVal = fVal.plus(cf.div(denom));
      fDeriv = fDeriv.minus(cf.mul(exponent).div(rate.plus(1).pow(exponent.plus(1))));
    }

    if (fDeriv.isZero()) return '#NUM!' as FormulaValue;

    const newRate = rate.minus(fVal.div(fDeriv));
    if (newRate.minus(rate).abs().lte(tolerance)) {
      return newRate.toNumber();
    }
    rate = newRate;

    if (rate.lt(-1)) return '#NUM!' as FormulaValue;
  }

  return '#NUM!' as FormulaValue;
}

// ---------------------------------------------------------------------------
// 7. XNPV – NPV for irregular cash flows
// ---------------------------------------------------------------------------
function executeXNPV(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  if (args.length < 3) return '#VALUE!' as FormulaValue;

  const rate = toDec(args[0]);
  const values = flattenNumbers(Array.isArray(args[1]) ? args[1] as FormulaValue[] : [args[1]]);
  const dateSerials = flattenNumbers(Array.isArray(args[2]) ? args[2] as FormulaValue[] : [args[2]]);

  if (values.length !== dateSerials.length || values.length === 0) return '#NUM!' as FormulaValue;

  const d0 = dateSerials[0];
  let npv = new Decimal(0);

  for (let i = 0; i < values.length; i++) {
    const cf = new Decimal(values[i]);
    const exponent = new Decimal(daysDiff(dateSerials[i], d0)).div(365);
    const denom = rate.plus(1).pow(exponent);
    if (denom.isZero()) return '#DIV/0!' as FormulaValue;
    npv = npv.plus(cf.div(denom));
  }

  return npv.toNumber();
}

// ---------------------------------------------------------------------------
// 8. RATE – interest rate per period (Newton-Raphson)
// ---------------------------------------------------------------------------
function executeRATE(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  const nper = toDec(args[0]);
  const pmt = toDec(args[1]);
  const pv = toDec(args[2]);
  const fv = args.length > 3 ? toDec(args[3]) : new Decimal(0);
  const type = args.length > 4 ? toNum(args[4]) : 0;
  const guess = args.length > 5 ? toNum(args[5]) : 0.1;

  let rate = new Decimal(guess);
  const maxIter = 100;
  const tolerance = new Decimal('1e-10');

  for (let iter = 0; iter < maxIter; iter++) {
    const rp1 = rate.plus(1); // 1 + rate
    const compound = rp1.pow(nper); // (1+rate)^nper
    const typeFactor = type !== 0 ? rp1 : new Decimal(1);

    // f(rate) = pv * compound + pmt * typeFactor * (compound - 1) / rate + fv
    let f: Decimal;
    let df: Decimal;

    if (rate.isZero()) {
      // fallback for rate near zero – use a small perturbation
      rate = new Decimal(1e-8);
      continue;
    }

    const annuity = compound.minus(1).div(rate); // ((1+r)^n - 1) / r
    f = pv.mul(compound).plus(pmt.mul(typeFactor).mul(annuity)).plus(fv);

    // derivative of f w.r.t. rate
    // d/dr [pv * (1+r)^n] = pv * n * (1+r)^(n-1)
    const dCompound = nper.mul(rp1.pow(nper.minus(1)));
    // d/dr [pmt * typeFactor * ((1+r)^n - 1) / r]
    // For type=0: pmt * (r * n * (1+r)^(n-1) - (1+r)^n + 1) / r^2
    // For type=1: pmt * (1+r) * [...] + pmt * annuity
    const dAnnuity = rate.mul(dCompound).minus(compound).plus(1).div(rate.pow(2));

    if (type !== 0) {
      df = pv.mul(dCompound)
        .plus(pmt.mul(rp1).mul(dAnnuity))
        .plus(pmt.mul(annuity));
    } else {
      df = pv.mul(dCompound).plus(pmt.mul(dAnnuity));
    }

    if (df.isZero()) return '#NUM!' as FormulaValue;

    const newRate = rate.minus(f.div(df));
    if (newRate.minus(rate).abs().lte(tolerance)) {
      return newRate.toNumber();
    }
    rate = newRate;

    if (rate.lt(-1)) return '#NUM!' as FormulaValue;
  }

  return '#NUM!' as FormulaValue;
}

// ---------------------------------------------------------------------------
// 9. NPER – number of periods
// ---------------------------------------------------------------------------
function executeNPER(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  const rate = toDec(args[0]);
  const pmt = toDec(args[1]);
  const pv = toDec(args[2]);
  const fv = args.length > 3 ? toDec(args[3]) : new Decimal(0);
  const type = args.length > 4 ? toNum(args[4]) : 0;

  if (rate.isZero()) {
    // nper = -(pv + fv) / pmt
    if (pmt.isZero()) return '#DIV/0!' as FormulaValue;
    return pv.plus(fv).neg().div(pmt).toNumber();
  }

  // NPER = log((pmt*(1+rate*type) - fv*rate) / (pmt*(1+rate*type) + pv*rate)) / log(1+rate)
  const pmtAdj = pmt.mul(rate.mul(type).plus(1)); // pmt * (1 + rate * type)
  const numerator = pmtAdj.minus(fv.mul(rate));
  const denominator = pmtAdj.plus(pv.mul(rate));

  if (denominator.isZero() || numerator.div(denominator).lte(0)) return '#NUM!' as FormulaValue;

  const result = Decimal.ln(numerator.div(denominator)).div(Decimal.ln(rate.plus(1)));
  return result.toNumber();
}

// ---------------------------------------------------------------------------
// 10. SLN – straight-line depreciation
// ---------------------------------------------------------------------------
function executeSLN(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  const cost = toDec(args[0]);
  const salvage = toDec(args[1]);
  const life = toDec(args[2]);

  if (life.isZero()) return '#DIV/0!' as FormulaValue;

  return cost.minus(salvage).div(life).toNumber();
}

// ---------------------------------------------------------------------------
// 11. DB – declining balance depreciation
// ---------------------------------------------------------------------------
function executeDB(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  const cost = toDec(args[0]);
  const salvage = toDec(args[1]);
  const life = toDec(args[2]);
  const period = toDec(args[3]);
  const month = args.length > 4 ? toDec(args[4]) : new Decimal(12);

  if (life.isZero() || cost.isZero()) return '#DIV/0!' as FormulaValue;
  if (period.lt(1) || period.gt(life.plus(1))) return '#NUM!' as FormulaValue;

  // Fixed-rate: rate = 1 - (salvage / cost) ^ (1 / life), rounded to 3 decimal places
  const ratio = salvage.div(cost);
  if (ratio.lt(0)) return '#NUM!' as FormulaValue;

  let rate: Decimal;
  if (ratio.isZero()) {
    rate = new Decimal(1);
  } else {
    rate = new Decimal(1).minus(ratio.pow(new Decimal(1).div(life)));
  }
  // Round rate to 3 decimal places
  rate = rate.toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

  let totalDepreciation = new Decimal(0);
  let currentValue = cost;

  const periodInt = period.toNumber();

  for (let p = 1; p <= periodInt; p++) {
    let depreciation: Decimal;

    if (p === 1) {
      // First period: cost * rate * month / 12
      depreciation = cost.mul(rate).mul(month).div(12);
    } else if (p === life.toNumber() + 1) {
      // Last fractional period
      const remainingMonths = new Decimal(12).minus(month);
      depreciation = currentValue.mul(rate).mul(remainingMonths).div(12);
    } else {
      depreciation = currentValue.mul(rate);
    }

    if (p === periodInt) {
      return depreciation.toNumber();
    }

    totalDepreciation = totalDepreciation.plus(depreciation);
    currentValue = cost.minus(totalDepreciation);
  }

  return new Decimal(0).toNumber();
}

// ---------------------------------------------------------------------------
// 12. DDB – double declining balance depreciation
// ---------------------------------------------------------------------------
function executeDDB(args: FormulaValue[], _ctx: FormulaContext): FormulaValue {
  const cost = toDec(args[0]);
  const salvage = toDec(args[1]);
  const life = toDec(args[2]);
  const period = toDec(args[3]);
  const factor = args.length > 4 ? toDec(args[4]) : new Decimal(2);

  if (life.isZero()) return '#DIV/0!' as FormulaValue;
  if (period.lt(1) || period.gt(life)) return '#NUM!' as FormulaValue;

  const rate = factor.div(life); // e.g. 2/life for double declining
  let bookValue = cost;

  const periodInt = period.toNumber();

  for (let p = 1; p <= periodInt; p++) {
    let depreciation = bookValue.mul(rate);

    // Cannot depreciate below salvage value
    if (bookValue.minus(depreciation).lt(salvage)) {
      depreciation = bookValue.minus(salvage);
    }
    if (depreciation.lt(0)) {
      depreciation = new Decimal(0);
    }

    if (p === periodInt) {
      return depreciation.toNumber();
    }

    bookValue = bookValue.minus(depreciation);
  }

  return new Decimal(0).toNumber();
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const financialFunctions: FormulaFunction[] = [
  {
    name: 'PMT',
    category: 'financial',
    description: 'Calculates the periodic payment for a loan based on constant payments and a constant interest rate',
    minArgs: 3,
    maxArgs: 5,
    isVolatile: false,
    returnsArray: false,
    execute: executePMT,
  },
  {
    name: 'FV',
    category: 'financial',
    description: 'Returns the future value of an investment based on periodic, constant payments and a constant interest rate',
    minArgs: 3,
    maxArgs: 5,
    isVolatile: false,
    returnsArray: false,
    execute: executeFV,
  },
  {
    name: 'PV',
    category: 'financial',
    description: 'Returns the present value of an investment',
    minArgs: 3,
    maxArgs: 5,
    isVolatile: false,
    returnsArray: false,
    execute: executePV,
  },
  {
    name: 'NPV',
    category: 'financial',
    description: 'Calculates the net present value of an investment using a discount rate and a series of future payments',
    minArgs: 2,
    maxArgs: Infinity,
    isVolatile: false,
    returnsArray: false,
    execute: executeNPV,
  },
  {
    name: 'IRR',
    category: 'financial',
    description: 'Returns the internal rate of return for a series of cash flows',
    minArgs: 1,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: executeIRR,
  },
  {
    name: 'XIRR',
    category: 'financial',
    description: 'Returns the internal rate of return for a schedule of cash flows that is not necessarily periodic',
    minArgs: 2,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: executeXIRR,
  },
  {
    name: 'XNPV',
    category: 'financial',
    description: 'Returns the net present value for a schedule of cash flows that is not necessarily periodic',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: executeXNPV,
  },
  {
    name: 'RATE',
    category: 'financial',
    description: 'Returns the interest rate per period of an annuity',
    minArgs: 3,
    maxArgs: 6,
    isVolatile: false,
    returnsArray: false,
    execute: executeRATE,
  },
  {
    name: 'NPER',
    category: 'financial',
    description: 'Returns the number of periods for an investment based on periodic, constant payments and a constant interest rate',
    minArgs: 3,
    maxArgs: 5,
    isVolatile: false,
    returnsArray: false,
    execute: executeNPER,
  },
  {
    name: 'SLN',
    category: 'financial',
    description: 'Returns the straight-line depreciation of an asset for one period',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: executeSLN,
  },
  {
    name: 'DB',
    category: 'financial',
    description: 'Returns the depreciation of an asset for a specified period using the fixed-declining balance method',
    minArgs: 4,
    maxArgs: 5,
    isVolatile: false,
    returnsArray: false,
    execute: executeDB,
  },
  {
    name: 'DDB',
    category: 'financial',
    description: 'Returns the depreciation of an asset for a specified period using the double-declining balance method or some other method you specify',
    minArgs: 4,
    maxArgs: 5,
    isVolatile: false,
    returnsArray: false,
    execute: executeDDB,
  },
];
