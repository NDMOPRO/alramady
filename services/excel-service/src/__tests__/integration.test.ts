import { formulaRegistry } from '../utils/formula-registry.js';
import '../services/formula-functions/index.js';
import { ConversionService } from '../services/conversion.service.js';
import { FormulaWorkersService } from '../services/formula-workers.service.js';
import { FormulaIntelligenceService } from '../services/formula-intelligence.service.js';
import type { FormulaContext } from '../types/formula.types.js';

describe('Integration Tests', () => {
  describe('Formula Registry Integration', () => {
    it('should have 106+ registered functions', () => {
      expect(formulaRegistry.getCount()).toBeGreaterThanOrEqual(106);
    });

    it('should execute SUM through registry', () => {
      const sum = formulaRegistry.get('SUM')!;
      const result = sum.execute([1, 2, 3, 4, 5], { cellValues: new Map() });
      expect(result).toBe(15);
    });

    it('should execute IF through registry', () => {
      const ifFn = formulaRegistry.get('IF')!;
      const result = ifFn.execute([true, 'yes', 'no'], { cellValues: new Map() });
      expect(result).toBe('yes');
    });

    it('should execute CONCATENATE through registry', () => {
      const concat = formulaRegistry.get('CONCATENATE')!;
      const result = concat.execute(['Hello', ' ', 'World'], { cellValues: new Map() });
      expect(result).toBe('Hello World');
    });

    it('should execute financial functions through registry', () => {
      const sln = formulaRegistry.get('SLN')!;
      const result = sln.execute([10000, 1000, 10], { cellValues: new Map() });
      expect(result).toBe(900);
    });

    it('should have all categories represented', () => {
      const categories = new Set(formulaRegistry.getAll().map(f => f.category));
      expect(categories.has('math-trig')).toBe(true);
      expect(categories.has('statistical')).toBe(true);
      expect(categories.has('lookup-reference')).toBe(true);
      expect(categories.has('text')).toBe(true);
      expect(categories.has('date-time')).toBe(true);
      expect(categories.has('logical')).toBe(true);
      expect(categories.has('financial')).toBe(true);
      expect(categories.has('information')).toBe(true);
      expect(categories.has('dynamic-array')).toBe(true);
    });
  });

  describe('Conversion Service Integration', () => {
    const conversionService = new ConversionService();

    it('should convert date formats', () => {
      const result = conversionService.convertDateFormat('15/03/2024', 'DD/MM/YYYY', 'YYYY-MM-DD');
      expect(result).toBe('2024-03-15');
    });

    it('should convert currencies', () => {
      const result = conversionService.convertCurrency(100, 'USD', 'SAR');
      expect(result.result).toBe(375);
      expect(result.rate).toBe(3.75);
    });

    it('should normalize text', () => {
      const result = conversionService.normalizeTextFormat('  Hello   World  ');
      expect(result.normalized).toBe('Hello World');
    });

    it('should detect Arabic text', () => {
      const result = conversionService.normalizeTextFormat('مرحبا');
      expect(result.detectedLanguage).toBe('ar');
    });

    it('should detect English text', () => {
      const result = conversionService.normalizeTextFormat('Hello');
      expect(result.detectedLanguage).toBe('en');
    });
  });

  describe('Formula Workers Integration', () => {
    const workersService = new FormulaWorkersService();

    it('should evaluate batch of simple expressions', async () => {
      const results = await workersService.evaluateBatch([
        { id: '1', expression: '42' },
        { id: '2', expression: '=100' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].result).toBe(42);
      expect(results[0].id).toBe('1');
    });
  });

  describe('Formula Intelligence Integration', () => {
    const intelligenceService = new FormulaIntelligenceService();

    it('should simplify redundant IF', () => {
      const result = intelligenceService.simplifyFormula('IF(A1>5, TRUE, FALSE)');
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.changes[0]).toContain('Removed redundant IF');
    });

    it('should suggest IFS for nested IFs', () => {
      const result = intelligenceService.simplifyFormula('IF(A1>10,IF(A1>20,IF(A1>30,"D","C"),"B"),"A")');
      expect(result.changes.some(c => c.includes('IFS'))).toBe(true);
    });
  });

  describe('Formula Chaining', () => {
    it('should chain INDEX + MATCH', () => {
      const ctx: FormulaContext = { cellValues: new Map() };
      const matchFn = formulaRegistry.get('MATCH')!;
      const indexFn = formulaRegistry.get('INDEX')!;

      const lookupArray = ['Apple', 'Banana', 'Cherry'];
      const position = matchFn.execute(['Banana', lookupArray, 0], ctx);
      expect(position).toBe(2);

      const dataArray = [[100], [200], [300]];
      const result = indexFn.execute([dataArray, position, 1], ctx);
      expect(result).toBe(200);
    });

    it('should chain SUM + IF logic', () => {
      const ctx: FormulaContext = { cellValues: new Map() };
      const sumFn = formulaRegistry.get('SUM')!;
      const ifFn = formulaRegistry.get('IF')!;

      const total = sumFn.execute([10, 20, 30], ctx);
      const result = ifFn.execute([(total as number) > 50, 'High', 'Low'], ctx);
      expect(result).toBe('High');
    });
  });
});
