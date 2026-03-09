import type { FormulaFunction, FormulaCategory } from '../types/formula.types.js';

class FormulaRegistry {
  private functions = new Map<string, FormulaFunction>();

  register(fn: FormulaFunction): void {
    this.functions.set(fn.name.toUpperCase(), fn);
  }

  registerAll(fns: FormulaFunction[]): void {
    for (const fn of fns) {
      this.register(fn);
    }
  }

  get(name: string): FormulaFunction | undefined {
    return this.functions.get(name.toUpperCase());
  }

  has(name: string): boolean {
    return this.functions.has(name.toUpperCase());
  }

  getAll(): FormulaFunction[] {
    return Array.from(this.functions.values());
  }

  getByCategory(category: FormulaCategory): FormulaFunction[] {
    return this.getAll().filter((fn) => fn.category === category);
  }

  getVolatile(): FormulaFunction[] {
    return this.getAll().filter((fn) => fn.isVolatile);
  }

  getNames(): string[] {
    return Array.from(this.functions.keys());
  }

  getCount(): number {
    return this.functions.size;
  }

  toJSON(): Array<{ name: string; category: string; description: string; minArgs: number; maxArgs: number; isVolatile: boolean }> {
    return this.getAll().map((fn) => ({
      name: fn.name,
      category: fn.category,
      description: fn.description,
      minArgs: fn.minArgs,
      maxArgs: fn.maxArgs,
      isVolatile: fn.isVolatile,
    }));
  }
}

export const formulaRegistry = new FormulaRegistry();
