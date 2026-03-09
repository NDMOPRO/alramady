import { formulaRegistry } from '../../utils/formula-registry.js';
import '../../services/formula-functions/index.js';

describe('Formula Registry', () => {
  it('should have registered all formula functions', () => {
    expect(formulaRegistry.getCount()).toBeGreaterThan(100);
  });

  it('should find SUM function', () => {
    const sum = formulaRegistry.get('SUM');
    expect(sum).toBeDefined();
    expect(sum!.name).toBe('SUM');
    expect(sum!.category).toBe('math-trig');
  });

  it('should find functions case-insensitively', () => {
    expect(formulaRegistry.get('sum')).toBeDefined();
    expect(formulaRegistry.get('Sum')).toBeDefined();
    expect(formulaRegistry.get('SUM')).toBeDefined();
  });

  it('should return undefined for unknown function', () => {
    expect(formulaRegistry.get('NOTAFUNCTION')).toBeUndefined();
  });

  it('should list all function names', () => {
    const names = formulaRegistry.getNames();
    expect(names).toContain('SUM');
    expect(names).toContain('AVERAGE');
    expect(names).toContain('VLOOKUP');
    expect(names).toContain('IF');
    expect(names).toContain('PMT');
    expect(names).toContain('NOW');
    expect(names).toContain('SORT');
  });

  it('should get functions by category', () => {
    const mathFns = formulaRegistry.getByCategory('math-trig');
    expect(mathFns.length).toBeGreaterThan(10);
    mathFns.forEach(fn => expect(fn.category).toBe('math-trig'));

    const textFns = formulaRegistry.getByCategory('text');
    expect(textFns.length).toBeGreaterThan(15);
  });

  it('should identify volatile functions', () => {
    const volatile = formulaRegistry.getVolatile();
    expect(volatile.length).toBeGreaterThan(0);
    const names = volatile.map(fn => fn.name);
    expect(names).toContain('NOW');
    expect(names).toContain('TODAY');
    expect(names).toContain('RANDARRAY');
  });

  it('should serialize to JSON', () => {
    const json = formulaRegistry.toJSON();
    expect(Array.isArray(json)).toBe(true);
    expect(json[0]).toHaveProperty('name');
    expect(json[0]).toHaveProperty('category');
    expect(json[0]).toHaveProperty('description');
    expect(json[0]).toHaveProperty('minArgs');
    expect(json[0]).toHaveProperty('maxArgs');
  });
});
