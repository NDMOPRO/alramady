jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../utils/formula-registry', () => {
  const mockRegistry = {
    get: jest.fn(),
    has: jest.fn(),
    register: jest.fn(),
  };
  return { formulaRegistry: mockRegistry };
});

import { FormulaWorkersService } from '../../services/formula-workers.service.js';
import { formulaRegistry } from '../../utils/formula-registry.js';

const mockRegistry = formulaRegistry as jest.Mocked<typeof formulaRegistry>;

describe('FormulaWorkersService', () => {
  let service: FormulaWorkersService;

  beforeEach(() => {
    service = new FormulaWorkersService();
    jest.clearAllMocks();
  });

  describe('evaluateBatch', () => {
    it('should evaluate simple numeric expressions', async () => {
      mockRegistry.get.mockReturnValue(undefined);

      const results = await service.evaluateBatch([
        { id: '1', expression: '42' },
        { id: '2', expression: '=100' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('1');
      expect(results[0].result).toBe(42);
      expect(results[0].error).toBeUndefined();
      expect(results[1].id).toBe('2');
      expect(results[1].result).toBe(100);
    });

    it('should return string for non-numeric, non-function expressions', async () => {
      mockRegistry.get.mockReturnValue(undefined);

      const results = await service.evaluateBatch([
        { id: '1', expression: 'hello' },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].result).toBe('hello');
    });

    it('should call a registered function from the registry', async () => {
      const mockFn = {
        name: 'SUM',
        execute: jest.fn().mockReturnValue(15),
        category: 'math',
        description: 'Sum values',
        minArgs: 1,
        maxArgs: 255,
        isVolatile: false,
      };
      mockRegistry.get.mockImplementation((name: string) => {
        if (name === 'SUM') return mockFn as any;
        return undefined;
      });

      const results = await service.evaluateBatch([
        { id: '1', expression: '=SUM(5, 10)' },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].result).toBe(15);
      expect(mockFn.execute).toHaveBeenCalled();
    });

    it('should handle errors in formula evaluation gracefully', async () => {
      mockRegistry.get.mockImplementation((name: string) => {
        if (name === 'FAIL') {
          return {
            name: 'FAIL',
            execute: () => { throw new Error('Division by zero'); },
            category: 'math',
            description: 'Failing function',
            minArgs: 0,
            maxArgs: 0,
            isVolatile: false,
          } as any;
        }
        return undefined;
      });

      const results = await service.evaluateBatch([
        { id: '1', expression: '=FAIL()' },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
      expect(results[0].result).toBeNull();
      expect(results[0].error).toBe('Division by zero');
    });

    it('should include executionTimeMs for each result', async () => {
      mockRegistry.get.mockReturnValue(undefined);

      const results = await service.evaluateBatch([
        { id: '1', expression: '99' },
      ]);

      expect(results[0].executionTimeMs).toBeDefined();
      expect(typeof results[0].executionTimeMs).toBe('number');
      expect(results[0].executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle an empty batch', async () => {
      const results = await service.evaluateBatch([]);
      expect(results).toEqual([]);
    });

    it('should process multiple formulas in a batch', async () => {
      mockRegistry.get.mockReturnValue(undefined);

      const batch = [
        { id: 'a', expression: '1' },
        { id: 'b', expression: '2' },
        { id: 'c', expression: '3' },
      ];
      const results = await service.evaluateBatch(batch);

      expect(results).toHaveLength(3);
      expect(results[0].result).toBe(1);
      expect(results[1].result).toBe(2);
      expect(results[2].result).toBe(3);
    });
  });
});
