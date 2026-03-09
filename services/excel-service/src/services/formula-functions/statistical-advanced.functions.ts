/**
 * Advanced Statistical Functions — Rasid Platform Excel Engine
 * دوال إحصائية متقدمة: CHISQ.TEST, F.TEST, T.TEST, Z.TEST, NORM.DIST, etc.
 */

import type { FormulaFunction, FormulaValue } from '../../types/formula.types.js';

// ─── Statistical Helpers (pure math, no external deps) ────────────────────────

function toNumbers(vals: FormulaValue[]): number[] {
  const result: number[] = [];
  for (const v of Array.isArray(vals[0]) ? (vals[0] as FormulaValue[]) : vals) {
    if (Array.isArray(v)) {
      for (const inner of v as FormulaValue[]) {
        const n = typeof inner === 'number' ? inner : Number(inner);
        if (!Number.isNaN(n)) result.push(n);
      }
    } else {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isNaN(n)) result.push(n);
    }
  }
  return result;
}

function flatNums(arg: FormulaValue): number[] {
  if (Array.isArray(arg)) {
    const result: number[] = [];
    for (const v of arg) {
      if (Array.isArray(v)) {
        result.push(...flatNums(v));
      } else if (typeof v === 'number') {
        result.push(v);
      } else {
        const n = Number(v);
        if (!Number.isNaN(n)) result.push(n);
      }
    }
    return result;
  }
  if (typeof arg === 'number') return [arg];
  const n = Number(arg);
  return Number.isNaN(n) ? [] : [n];
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr: number[], ddof: number = 1): number {
  const m = mean(arr);
  return arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - ddof);
}

function stdev(arr: number[], ddof: number = 1): number {
  return Math.sqrt(variance(arr, ddof));
}

// Gamma function (Lanczos approximation)
function gammaLn(z: number): number {
  const g = 7;
  const p = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - gammaLn(1 - z);
  }

  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) {
    x += p[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function gamma(z: number): number {
  return Math.exp(gammaLn(z));
}

// Regularized incomplete beta function
function betaIncomplete(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return 0;
  if (x === 0 || x === 1) return x;

  const lnBeta = gammaLn(a) + gammaLn(b) - gammaLn(a + b);

  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncomplete(b, a, 1 - x);
  }

  // Continued fraction
  const maxIter = 200;
  const eps = 1e-14;
  let fpmin = 1e-30;

  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    let m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    let del = d * c;
    h *= del;

    if (Math.abs(del - 1) < eps) break;
  }

  return Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) * h / a;
}

// Normal CDF using error function approximation
function normalCDF(x: number, mu: number = 0, sigma: number = 1): number {
  const z = (x - mu) / sigma;
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function normalPDF(x: number, mu: number = 0, sigma: number = 1): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

// Inverse normal CDF (Beasley-Springer-Moro algorithm)
function normalInv(p: number, mu: number = 0, sigma: number = 1): number {
  if (p <= 0 || p >= 1) return '#NUM!' as unknown as number;

  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number, r: number, result: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    result = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    result = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    result = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  return mu + sigma * result;
}

// Student's t CDF
function tCDF(x: number, df: number): number {
  const t2 = x * x;
  return 1 - betaIncomplete(df / 2, 0.5, df / (df + t2));
}

function tCDFfull(x: number, df: number): number {
  if (x >= 0) {
    return 1 - 0.5 * betaIncomplete(df / 2, 0.5, df / (df + x * x));
  }
  return 0.5 * betaIncomplete(df / 2, 0.5, df / (df + x * x));
}

// Student's t PDF
function tPDF(x: number, df: number): number {
  return gamma((df + 1) / 2) / (Math.sqrt(df * Math.PI) * gamma(df / 2)) *
    Math.pow(1 + x * x / df, -(df + 1) / 2);
}

// Student's t inverse (Newton's method)
function tInv(p: number, df: number): number {
  let x = normalInv(p);
  for (let i = 0; i < 50; i++) {
    const cdf = tCDFfull(x, df);
    const pdf = tPDF(x, df);
    if (Math.abs(pdf) < 1e-15) break;
    const dx = (cdf - p) / pdf;
    x -= dx;
    if (Math.abs(dx) < 1e-12) break;
  }
  return x;
}

// Chi-square CDF (using regularized gamma)
function chiSquareCDF(x: number, df: number): number {
  if (x <= 0) return 0;
  return regularizedGammaP(df / 2, x / 2);
}

function regularizedGammaP(a: number, x: number): number {
  if (x < 0) return 0;
  if (x === 0) return 0;

  if (x < a + 1) {
    // Series expansion
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-14 * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammaLn(a));
  } else {
    // Continued fraction
    return 1 - regularizedGammaQ(a, x);
  }
}

function regularizedGammaQ(a: number, x: number): number {
  let fpmin = 1e-30;
  let b = x + 1 - a;
  let c = 1 / fpmin;
  let d = 1 / b;
  let h = d;

  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = b + an / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }

  return Math.exp(-x + a * Math.log(x) - gammaLn(a)) * h;
}

// Binomial PMF/CDF
function binomPMF(k: number, n: number, p: number): number {
  return Math.exp(gammaLn(n + 1) - gammaLn(k + 1) - gammaLn(n - k + 1) +
    k * Math.log(p) + (n - k) * Math.log(1 - p));
}

function binomCDF(k: number, n: number, p: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += binomPMF(i, n, p);
  }
  return sum;
}

// Poisson PMF/CDF
function poissonPMF(k: number, lambda: number): number {
  return Math.exp(k * Math.log(lambda) - lambda - gammaLn(k + 1));
}

function poissonCDF(k: number, lambda: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += poissonPMF(i, lambda);
  }
  return sum;
}

// ─── Functions ────────────────────────────────────────────────────────────────

export const statisticalAdvancedFunctions: FormulaFunction[] = [
  {
    name: 'CHISQ.TEST',
    category: 'statistical-advanced',
    description: 'Returns the chi-squared test p-value',
    minArgs: 2,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const actual = flatNums(args[0]);
      const expected = flatNums(args[1]);
      if (actual.length !== expected.length || actual.length === 0) return '#N/A' as FormulaValue;

      let chiSq = 0;
      for (let i = 0; i < actual.length; i++) {
        if (expected[i] === 0) return '#DIV/0!' as FormulaValue;
        chiSq += (actual[i] - expected[i]) ** 2 / expected[i];
      }

      const df = actual.length - 1;
      return 1 - chiSquareCDF(chiSq, df);
    },
  },
  {
    name: 'F.TEST',
    category: 'statistical-advanced',
    description: 'Returns the F-test p-value for two arrays',
    minArgs: 2,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const arr1 = flatNums(args[0]);
      const arr2 = flatNums(args[1]);
      if (arr1.length < 2 || arr2.length < 2) return '#DIV/0!' as FormulaValue;

      const var1 = variance(arr1);
      const var2 = variance(arr2);
      if (var2 === 0) return '#DIV/0!' as FormulaValue;

      const f = var1 / var2;
      const df1 = arr1.length - 1;
      const df2 = arr2.length - 1;

      // Two-tailed F-test p-value
      const p = betaIncomplete(df2 / 2, df1 / 2, df2 / (df2 + df1 * f));
      return 2 * Math.min(p, 1 - p);
    },
  },
  {
    name: 'T.TEST',
    category: 'statistical-advanced',
    description: 'Returns the Student t-test p-value',
    minArgs: 4,
    maxArgs: 4,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const arr1 = flatNums(args[0]);
      const arr2 = flatNums(args[1]);
      const tails = Number(args[2]);
      const type = Number(args[3]);

      if (arr1.length < 2 || arr2.length < 2) return '#N/A' as FormulaValue;
      if (tails !== 1 && tails !== 2) return '#NUM!' as FormulaValue;
      if (type < 1 || type > 3) return '#NUM!' as FormulaValue;

      let t: number;
      let df: number;

      if (type === 1) {
        // Paired t-test
        if (arr1.length !== arr2.length) return '#N/A' as FormulaValue;
        const diffs = arr1.map((v, i) => v - arr2[i]);
        const dMean = mean(diffs);
        const dStd = stdev(diffs);
        const n = diffs.length;
        if (dStd === 0) return '#DIV/0!' as FormulaValue;
        t = Math.abs(dMean) / (dStd / Math.sqrt(n));
        df = n - 1;
      } else if (type === 2) {
        // Two-sample equal variance
        const n1 = arr1.length;
        const n2 = arr2.length;
        const m1 = mean(arr1);
        const m2 = mean(arr2);
        const v1 = variance(arr1);
        const v2 = variance(arr2);
        df = n1 + n2 - 2;
        const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / df);
        if (sp === 0) return '#DIV/0!' as FormulaValue;
        t = Math.abs(m1 - m2) / (sp * Math.sqrt(1 / n1 + 1 / n2));
      } else {
        // Welch's t-test (unequal variance)
        const n1 = arr1.length;
        const n2 = arr2.length;
        const m1 = mean(arr1);
        const m2 = mean(arr2);
        const v1 = variance(arr1);
        const v2 = variance(arr2);
        const vn1 = v1 / n1;
        const vn2 = v2 / n2;
        const denom = Math.sqrt(vn1 + vn2);
        if (denom === 0) return '#DIV/0!' as FormulaValue;
        t = Math.abs(m1 - m2) / denom;
        df = (vn1 + vn2) ** 2 / (vn1 ** 2 / (n1 - 1) + vn2 ** 2 / (n2 - 1));
      }

      // Calculate p-value
      const pOneTail = 1 - tCDFfull(t, df);
      return tails === 2 ? 2 * pOneTail : pOneTail;
    },
  },
  {
    name: 'Z.TEST',
    category: 'statistical-advanced',
    description: 'Returns the one-tailed z-test p-value',
    minArgs: 2,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const arr = flatNums(args[0]);
      const x = Number(args[1]);
      const sigma = args[2] !== undefined && args[2] !== null ? Number(args[2]) : stdev(arr);
      if (arr.length === 0 || sigma === 0) return '#N/A' as FormulaValue;

      const z = (mean(arr) - x) / (sigma / Math.sqrt(arr.length));
      return 1 - normalCDF(z);
    },
  },
  {
    name: 'NORM.DIST',
    category: 'statistical-advanced',
    description: 'Returns the normal distribution',
    minArgs: 4,
    maxArgs: 4,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const x = Number(args[0]);
      const mu = Number(args[1]);
      const sigma = Number(args[2]);
      const cumulative = Boolean(args[3]);
      if (sigma <= 0) return '#NUM!' as FormulaValue;
      return cumulative ? normalCDF(x, mu, sigma) : normalPDF(x, mu, sigma);
    },
  },
  {
    name: 'NORM.INV',
    category: 'statistical-advanced',
    description: 'Returns the inverse of the normal cumulative distribution',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const p = Number(args[0]);
      const mu = Number(args[1]);
      const sigma = Number(args[2]);
      if (p <= 0 || p >= 1 || sigma <= 0) return '#NUM!' as FormulaValue;
      return normalInv(p, mu, sigma);
    },
  },
  {
    name: 'NORM.S.DIST',
    category: 'statistical-advanced',
    description: 'Returns the standard normal distribution',
    minArgs: 2,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const z = Number(args[0]);
      const cumulative = Boolean(args[1]);
      return cumulative ? normalCDF(z) : normalPDF(z);
    },
  },
  {
    name: 'T.DIST',
    category: 'statistical-advanced',
    description: 'Returns the Student t-distribution',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const x = Number(args[0]);
      const df = Number(args[1]);
      const cumulative = Boolean(args[2]);
      if (df < 1) return '#NUM!' as FormulaValue;
      return cumulative ? tCDFfull(x, df) : tPDF(x, df);
    },
  },
  {
    name: 'T.DIST.2T',
    category: 'statistical-advanced',
    description: 'Returns the two-tailed Student t-distribution',
    minArgs: 2,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const x = Number(args[0]);
      const df = Number(args[1]);
      if (x < 0 || df < 1) return '#NUM!' as FormulaValue;
      return 2 * (1 - tCDFfull(Math.abs(x), df));
    },
  },
  {
    name: 'T.INV',
    category: 'statistical-advanced',
    description: 'Returns the inverse of the Student t-distribution',
    minArgs: 2,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const p = Number(args[0]);
      const df = Number(args[1]);
      if (p <= 0 || p >= 1 || df < 1) return '#NUM!' as FormulaValue;
      return tInv(p, df);
    },
  },
  {
    name: 'BINOM.DIST',
    category: 'statistical-advanced',
    description: 'Returns the binomial distribution probability',
    minArgs: 4,
    maxArgs: 4,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const k = Math.floor(Number(args[0]));
      const n = Math.floor(Number(args[1]));
      const p = Number(args[2]);
      const cumulative = Boolean(args[3]);
      if (k < 0 || n < 0 || k > n || p < 0 || p > 1) return '#NUM!' as FormulaValue;
      return cumulative ? binomCDF(k, n, p) : binomPMF(k, n, p);
    },
  },
  {
    name: 'POISSON.DIST',
    category: 'statistical-advanced',
    description: 'Returns the Poisson distribution',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const k = Math.floor(Number(args[0]));
      const lambda = Number(args[1]);
      const cumulative = Boolean(args[2]);
      if (k < 0 || lambda < 0) return '#NUM!' as FormulaValue;
      return cumulative ? poissonCDF(k, lambda) : poissonPMF(k, lambda);
    },
  },
  {
    name: 'CONFIDENCE.NORM',
    category: 'statistical-advanced',
    description: 'Returns the confidence interval for a population mean (normal)',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const alpha = Number(args[0]);
      const sigma = Number(args[1]);
      const size = Number(args[2]);
      if (alpha <= 0 || alpha >= 1 || sigma <= 0 || size < 1) return '#NUM!' as FormulaValue;
      const zCrit = normalInv(1 - alpha / 2);
      return zCrit * (sigma / Math.sqrt(size));
    },
  },
  {
    name: 'CONFIDENCE.T',
    category: 'statistical-advanced',
    description: 'Returns the confidence interval for a population mean (t-distribution)',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const alpha = Number(args[0]);
      const sigma = Number(args[1]);
      const size = Number(args[2]);
      if (alpha <= 0 || alpha >= 1 || sigma <= 0 || size < 2) return '#NUM!' as FormulaValue;
      const tCrit = tInv(1 - alpha / 2, size - 1);
      return tCrit * (sigma / Math.sqrt(size));
    },
  },
];
