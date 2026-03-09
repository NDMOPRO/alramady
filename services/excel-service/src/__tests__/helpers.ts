import type { FormulaContext } from '../types/formula.types.js';

export function createFormulaContext(cells?: Record<string, any>): FormulaContext {
  const cellValues = new Map<string, any>();
  if (cells) {
    for (const [key, value] of Object.entries(cells)) {
      cellValues.set(key, value);
    }
  }
  return { cellValues };
}

export function createRangeValues(data: any[][]): any[][] {
  return data;
}

export function createMockWorkbook(overrides?: Record<string, any>) {
  return {
    id: 'test-workbook-id',
    tenant_id: 'test-tenant',
    dataset_id: null,
    name: 'Test Workbook',
    sheets_json: {},
    formulas_json: {},
    created_by: 'test-user',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

export function createMockSheet(name: string, data: any[][] = []) {
  return {
    name,
    data,
    columnWidths: new Map<number, number>(),
    rowHeights: new Map<number, number>(),
    mergedCells: [],
    frozenPane: null,
  };
}

export function expectError(fn: () => any, errorMessage: string) {
  expect(fn).toThrow(errorMessage);
}

export function expectApproxEqual(actual: number, expected: number, precision: number = 6) {
  expect(actual).toBeCloseTo(expected, precision);
}
