import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const prisma = new PrismaClient();

interface ScenarioVariable {
  name: string;
  baseValue: number;
  modifiedValue: number;
  unit?: string;
}

interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  variables: ScenarioVariable[];
  formula: string;
  createdAt: Date;
}

interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  baselineOutcome: number;
  scenarioOutcome: number;
  deltaAbsolute: number;
  deltaPercent: number;
  variableImpacts: Array<{
    variable: string;
    baseValue: number;
    modifiedValue: number;
    impact: number;
  }>;
  executedAt: Date;
}

interface ComparisonResult {
  scenarios: Array<{
    scenarioId: string;
    scenarioName: string;
    outcome: number;
    deltaFromBaseline: number;
    rank: number;
  }>;
  bestScenario: string;
  worstScenario: string;
  interpretation: string;
}

interface MonteCarloResult {
  scenarioId: string;
  iterations: number;
  mean: number;
  median: number;
  stdDev: number;
  percentile5: number;
  percentile25: number;
  percentile75: number;
  percentile95: number;
  min: number;
  max: number;
  distribution: Array<{ bucketMin: number; bucketMax: number; count: number; frequency: number }>;
  executedAt: Date;
}

interface MultiVariableResult {
  scenarioId: string;
  dimensions: string[];
  results: Array<{
    variableCombination: Record<string, number>;
    outcome: number;
  }>;
  sensitivityRanking: Array<{ variable: string; sensitivity: number }>;
  executedAt: Date;
}

export class WhatIfService {
  async defineScenario(input: {
    projectId: string;
    name: string;
    description: string;
    variables: ScenarioVariable[];
    formula: string;
  }): Promise<ScenarioDefinition> {
    const scenario: ScenarioDefinition = {
      id: this.generateId('scen'),
      name: input.name,
      description: input.description,
      variables: input.variables,
      formula: input.formula,
      createdAt: new Date(),
    };

    await prisma.scenario.create({
      data: {
        id: scenario.id,
        projectId: input.projectId,
        name: scenario.name,
        description: scenario.description,
        variables: JSON.stringify(scenario.variables),
        formula: scenario.formula,
        createdAt: scenario.createdAt,
      },
    });

    return scenario;
  }

  async runScenario(scenarioId: string): Promise<ScenarioResult> {
    const record = await prisma.scenario.findUniqueOrThrow({
      where: { id: scenarioId },
    });

    const variables: ScenarioVariable[] = JSON.parse(record.variables as string);
    const formula = record.formula;

    const baselineOutcome = this.evaluateFormula(
      formula,
      variables.reduce<Record<string, number>>((acc, v) => {
        acc[v.name] = v.baseValue;
        return acc;
      }, {})
    );

    const scenarioOutcome = this.evaluateFormula(
      formula,
      variables.reduce<Record<string, number>>((acc, v) => {
        acc[v.name] = v.modifiedValue;
        return acc;
      }, {})
    );

    const variableImpacts = variables.map((v) => {
      const isolated = variables.reduce<Record<string, number>>((acc, other) => {
        acc[other.name] = other.name === v.name ? v.modifiedValue : other.baseValue;
        return acc;
      }, {});
      const isolatedOutcome = this.evaluateFormula(formula, isolated);
      return {
        variable: v.name,
        baseValue: v.baseValue,
        modifiedValue: v.modifiedValue,
        impact: isolatedOutcome - baselineOutcome,
      };
    });

    variableImpacts.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    const deltaAbsolute = scenarioOutcome - baselineOutcome;
    const deltaPercent = baselineOutcome !== 0
      ? (deltaAbsolute / Math.abs(baselineOutcome)) * 100
      : 0;

    const result: ScenarioResult = {
      scenarioId,
      scenarioName: record.name,
      baselineOutcome,
      scenarioOutcome,
      deltaAbsolute: parseFloat(deltaAbsolute.toFixed(6)),
      deltaPercent: parseFloat(deltaPercent.toFixed(4)),
      variableImpacts,
      executedAt: new Date(),
    };

    await prisma.scenarioRun.create({
      data: {
        scenarioId,
        baselineOutcome: result.baselineOutcome,
        scenarioOutcome: result.scenarioOutcome,
        deltaAbsolute: result.deltaAbsolute,
        deltaPercent: result.deltaPercent,
        variableImpacts: JSON.stringify(result.variableImpacts),
        executedAt: result.executedAt,
      },
    });

    return result;
  }

  async compareScenarios(scenarioIds: string[]): Promise<ComparisonResult> {
    if (scenarioIds.length < 2) {
      throw new Error('At least 2 scenarios are required for comparison');
    }

    const results: ScenarioResult[] = [];
    for (const id of scenarioIds) {
      const result = await this.runScenario(id);
      results.push(result);
    }

    const ranked = results
      .map((r) => ({
        scenarioId: r.scenarioId,
        scenarioName: r.scenarioName,
        outcome: r.scenarioOutcome,
        deltaFromBaseline: r.deltaAbsolute,
      }))
      .sort((a, b) => b.outcome - a.outcome)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    const bestScenario = ranked[0].scenarioName;
    const worstScenario = ranked[ranked.length - 1].scenarioName;

    const prompt = `You are a strategic scenario analyst for a Saudi analytics platform.
Compare these what-if scenarios and provide an executive interpretation.

Scenarios:
${ranked.map((r) => `${r.rank}. "${r.scenarioName}": outcome=${r.outcome.toFixed(2)}, delta=${r.deltaFromBaseline.toFixed(2)}`).join('\n')}

Best: "${bestScenario}"
Worst: "${worstScenario}"

Provide a 2-3 sentence interpretation in Arabic (formal MSA) focusing on:
- Which scenario offers the best risk-adjusted outcome
- Key trade-offs between scenarios
- Recommended approach

Respond in JSON: { "interpretation": "text" }`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for scenario comparison');
    }

    const parsed: { interpretation: string } = JSON.parse(content);

    return {
      scenarios: ranked,
      bestScenario,
      worstScenario,
      interpretation: parsed.interpretation,
    };
  }

  async runMonteCarloScenario(input: {
    scenarioId: string;
    iterations: number;
    variableDistributions: Array<{
      name: string;
      distribution: 'normal' | 'uniform' | 'triangular';
      params: { mean?: number; stdDev?: number; min?: number; max?: number; mode?: number };
    }>;
  }): Promise<MonteCarloResult> {
    const record = await prisma.scenario.findUniqueOrThrow({
      where: { id: input.scenarioId },
    });

    const formula = record.formula;
    const iterations = Math.min(input.iterations, 100000);
    const outcomes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const vars: Record<string, number> = {};
      for (const dist of input.variableDistributions) {
        vars[dist.name] = this.sampleDistribution(dist.distribution, dist.params);
      }
      outcomes.push(this.evaluateFormula(formula, vars));
    }

    outcomes.sort((a, b) => a - b);

    const mean = outcomes.reduce((s, v) => s + v, 0) / outcomes.length;
    const median = outcomes[Math.floor(outcomes.length / 2)];
    const variance = outcomes.reduce((s, v) => s + (v - mean) ** 2, 0) / outcomes.length;
    const stdDev = Math.sqrt(variance);
    const min = outcomes[0];
    const max = outcomes[outcomes.length - 1];

    const percentile5 = outcomes[Math.floor(outcomes.length * 0.05)];
    const percentile25 = outcomes[Math.floor(outcomes.length * 0.25)];
    const percentile75 = outcomes[Math.floor(outcomes.length * 0.75)];
    const percentile95 = outcomes[Math.floor(outcomes.length * 0.95)];

    const bucketCount = 20;
    const bucketSize = (max - min) / bucketCount || 1;
    const distribution: MonteCarloResult['distribution'] = [];

    for (let b = 0; b < bucketCount; b++) {
      const bucketMin = min + b * bucketSize;
      const bucketMax = bucketMin + bucketSize;
      const count = outcomes.filter((v) =>
        b === bucketCount - 1 ? v >= bucketMin && v <= bucketMax : v >= bucketMin && v < bucketMax
      ).length;
      distribution.push({
        bucketMin: parseFloat(bucketMin.toFixed(4)),
        bucketMax: parseFloat(bucketMax.toFixed(4)),
        count,
        frequency: parseFloat((count / iterations).toFixed(6)),
      });
    }

    const result: MonteCarloResult = {
      scenarioId: input.scenarioId,
      iterations,
      mean: parseFloat(mean.toFixed(4)),
      median: parseFloat(median.toFixed(4)),
      stdDev: parseFloat(stdDev.toFixed(4)),
      percentile5: parseFloat(percentile5.toFixed(4)),
      percentile25: parseFloat(percentile25.toFixed(4)),
      percentile75: parseFloat(percentile75.toFixed(4)),
      percentile95: parseFloat(percentile95.toFixed(4)),
      min: parseFloat(min.toFixed(4)),
      max: parseFloat(max.toFixed(4)),
      distribution,
      executedAt: new Date(),
    };

    await prisma.scenarioRun.create({
      data: {
        scenarioId: input.scenarioId,
        baselineOutcome: mean,
        scenarioOutcome: median,
        deltaAbsolute: stdDev,
        deltaPercent: 0,
        variableImpacts: JSON.stringify({
          type: 'monte_carlo',
          iterations,
          percentile5,
          percentile95,
        }),
        executedAt: result.executedAt,
      },
    });

    return result;
  }

  async runMultiVariableSimulation(input: {
    scenarioId: string;
    variableRanges: Array<{
      name: string;
      min: number;
      max: number;
      steps: number;
    }>;
  }): Promise<MultiVariableResult> {
    const record = await prisma.scenario.findUniqueOrThrow({
      where: { id: input.scenarioId },
    });

    const formula = record.formula;
    const dimensions = input.variableRanges.map((v) => v.name);

    const stepValues: Record<string, number[]> = {};
    for (const range of input.variableRanges) {
      const steps = Math.max(2, Math.min(range.steps, 50));
      const stepSize = (range.max - range.min) / (steps - 1);
      const values: number[] = [];
      for (let i = 0; i < steps; i++) {
        values.push(parseFloat((range.min + i * stepSize).toFixed(6)));
      }
      stepValues[range.name] = values;
    }

    const combinations = this.cartesianProduct(stepValues, dimensions);
    const results: MultiVariableResult['results'] = [];

    for (const combo of combinations) {
      const outcome = this.evaluateFormula(formula, combo);
      results.push({
        variableCombination: Object.fromEntries(
          Object.entries(combo).map(([k, v]) => [k, parseFloat(v.toFixed(6))])
        ),
        outcome: parseFloat(outcome.toFixed(6)),
      });
    }

    const sensitivityRanking = this.computeSensitivity(input.variableRanges, formula);

    return {
      scenarioId: input.scenarioId,
      dimensions,
      results,
      sensitivityRanking,
      executedAt: new Date(),
    };
  }

  private evaluateFormula(formula: string, variables: Record<string, number>): number {
    const tokens = this.tokenize(formula);
    const rpn = this.toRPN(tokens);
    return this.evaluateRPN(rpn, variables);
  }

  private tokenize(formula: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < formula.length) {
      const ch = formula[i];
      if (ch === ' ' || ch === '\t') {
        i++;
        continue;
      }
      if ('+-*/()^'.includes(ch)) {
        tokens.push(ch);
        i++;
        continue;
      }
      if (ch >= '0' && ch <= '9' || ch === '.') {
        let num = '';
        while (i < formula.length && (formula[i] >= '0' && formula[i] <= '9' || formula[i] === '.')) {
          num += formula[i];
          i++;
        }
        tokens.push(num);
        continue;
      }
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
        let name = '';
        while (
          i < formula.length &&
          ((formula[i] >= 'a' && formula[i] <= 'z') ||
            (formula[i] >= 'A' && formula[i] <= 'Z') ||
            (formula[i] >= '0' && formula[i] <= '9') ||
            formula[i] === '_')
        ) {
          name += formula[i];
          i++;
        }
        tokens.push(name);
        continue;
      }
      throw new Error(`Unexpected character in formula: "${ch}" at position ${i}`);
    }
    return tokens;
  }

  private toRPN(tokens: string[]): string[] {
    const output: string[] = [];
    const operators: string[] = [];
    const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
    const rightAssoc = new Set(['^']);

    for (const token of tokens) {
      if (token in precedence) {
        while (
          operators.length > 0 &&
          operators[operators.length - 1] !== '(' &&
          operators[operators.length - 1] in precedence &&
          (precedence[operators[operators.length - 1]] > precedence[token] ||
            (precedence[operators[operators.length - 1]] === precedence[token] && !rightAssoc.has(token)))
        ) {
          output.push(operators.pop()!);
        }
        operators.push(token);
      } else if (token === '(') {
        operators.push(token);
      } else if (token === ')') {
        while (operators.length > 0 && operators[operators.length - 1] !== '(') {
          output.push(operators.pop()!);
        }
        if (operators.length === 0) throw new Error('Mismatched parentheses in formula');
        operators.pop();
      } else {
        output.push(token);
      }
    }

    while (operators.length > 0) {
      const op = operators.pop()!;
      if (op === '(' || op === ')') throw new Error('Mismatched parentheses in formula');
      output.push(op);
    }

    return output;
  }

  private evaluateRPN(rpn: string[], variables: Record<string, number>): number {
    const stack: number[] = [];

    for (const token of rpn) {
      if (token === '+' || token === '-' || token === '*' || token === '/' || token === '^') {
        if (stack.length < 2) throw new Error('Invalid formula: insufficient operands');
        const b = stack.pop()!;
        const a = stack.pop()!;
        switch (token) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/':
            if (b === 0) throw new Error('Division by zero in formula');
            stack.push(a / b);
            break;
          case '^': stack.push(a ** b); break;
        }
      } else {
        const num = parseFloat(token);
        if (!isNaN(num)) {
          stack.push(num);
        } else if (token in variables) {
          stack.push(variables[token]);
        } else {
          throw new Error(`Unknown variable in formula: "${token}"`);
        }
      }
    }

    if (stack.length !== 1) throw new Error('Invalid formula: result stack has multiple values');
    return stack[0];
  }

  private sampleDistribution(
    distribution: 'normal' | 'uniform' | 'triangular',
    params: { mean?: number; stdDev?: number; min?: number; max?: number; mode?: number }
  ): number {
    switch (distribution) {
      case 'normal': {
        const mean = params.mean ?? 0;
        const stdDev = params.stdDev ?? 1;
        return mean + stdDev * this.boxMullerTransform();
      }
      case 'uniform': {
        const min = params.min ?? 0;
        const max = params.max ?? 1;
        return min + this.cryptoRandom() * (max - min);
      }
      case 'triangular': {
        const min = params.min ?? 0;
        const max = params.max ?? 1;
        const mode = params.mode ?? (min + max) / 2;
        const u = this.cryptoRandom();
        const fc = (mode - min) / (max - min);
        if (u < fc) {
          return min + Math.sqrt(u * (max - min) * (mode - min));
        }
        return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
      }
      default: {
        const exhaustive: never = distribution;
        throw new Error(`Unsupported distribution: ${exhaustive}`);
      }
    }
  }

  private boxMullerTransform(): number {
    const u1 = this.cryptoRandom();
    const u2 = this.cryptoRandom();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private cryptoRandom(): number {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      globalThis.crypto.getRandomValues(buf);
      return buf[0] / 0xFFFFFFFF;
    }
    const buf = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
      buf[i] = (Date.now() * (i + 1) * 7919) & 0xff;
    }
    const view = new DataView(buf.buffer);
    return view.getUint32(0) / 0xFFFFFFFF;
  }

  private cartesianProduct(
    stepValues: Record<string, number[]>,
    dimensions: string[]
  ): Array<Record<string, number>> {
    if (dimensions.length === 0) return [{}];

    const [first, ...rest] = dimensions;
    const subCombinations = this.cartesianProduct(stepValues, rest);
    const results: Array<Record<string, number>> = [];

    for (const val of stepValues[first]) {
      for (const sub of subCombinations) {
        results.push({ [first]: val, ...sub });
      }
    }

    return results;
  }

  private computeSensitivity(
    variableRanges: Array<{ name: string; min: number; max: number; steps: number }>,
    formula: string
  ): Array<{ variable: string; sensitivity: number }> {
    const midpoint: Record<string, number> = {};
    for (const range of variableRanges) {
      midpoint[range.name] = (range.min + range.max) / 2;
    }

    const baseOutcome = this.evaluateFormula(formula, midpoint);
    const sensitivities: Array<{ variable: string; sensitivity: number }> = [];

    for (const range of variableRanges) {
      const lowVars = { ...midpoint, [range.name]: range.min };
      const highVars = { ...midpoint, [range.name]: range.max };
      const lowOutcome = this.evaluateFormula(formula, lowVars);
      const highOutcome = this.evaluateFormula(formula, highVars);

      const outputRange = Math.abs(highOutcome - lowOutcome);
      const inputRange = range.max - range.min;
      const sensitivity = inputRange !== 0 && baseOutcome !== 0
        ? (outputRange / Math.abs(baseOutcome)) / (inputRange / ((range.max + range.min) / 2 || 1))
        : 0;

      sensitivities.push({
        variable: range.name,
        sensitivity: parseFloat(sensitivity.toFixed(6)),
      });
    }

    sensitivities.sort((a, b) => b.sensitivity - a.sensitivity);
    return sensitivities;
  }

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const randomPart = new Uint8Array(6);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(randomPart);
    } else {
      for (let i = 0; i < randomPart.length; i++) {
        randomPart[i] = (Date.now() * (i + 1)) & 0xff;
      }
    }
    const hex = Array.from(randomPart)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `${prefix}-${timestamp}-${hex}`;
  }
}
