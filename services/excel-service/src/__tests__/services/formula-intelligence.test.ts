// Mock setup must come before imports
jest.mock('../../utils/prisma', () => ({
  prisma: {
    workbook: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { FormulaIntelligenceService } from '../../services/formula-intelligence.service.js';

describe('FormulaIntelligenceService', () => {
  let service: FormulaIntelligenceService;

  beforeEach(() => {
    service = new FormulaIntelligenceService();
    jest.clearAllMocks();
  });

  describe('simplifyFormula', () => {
    it('should remove redundant IF(cond, TRUE, FALSE) and return cond', () => {
      const result = service.simplifyFormula('IF(A1>10, TRUE, FALSE)');
      expect(result.simplified).toBe('A1>10');
      expect(result.changes).toContain('Removed redundant IF(cond, TRUE, FALSE) → cond');
    });

    it('should replace IF(cond, FALSE, TRUE) with NOT(cond)', () => {
      const result = service.simplifyFormula('IF(A1>10, FALSE, TRUE)');
      expect(result.simplified).toBe('NOT(A1>10)');
      expect(result.changes).toContain('Replaced IF(cond, FALSE, TRUE) → NOT(cond)');
    });

    it('should suggest replacing nested IFs with IFS when more than 3 IFs', () => {
      const formula = 'IF(A1>10, IF(A1>20, IF(A1>30, IF(A1>40, "big", "medium"), "small"), "tiny"), "none")';
      const result = service.simplifyFormula(formula);
      expect(result.changes).toContain('Consider replacing nested IFs with IFS() function');
    });

    it('should not suggest IFS for 3 or fewer nested IFs', () => {
      const formula = 'IF(A1>10, IF(A1>20, "big", "medium"), "small")';
      const result = service.simplifyFormula(formula);
      const ifsChange = result.changes.find((c) => c.includes('IFS()'));
      expect(ifsChange).toBeUndefined();
    });

    it('should suggest replacing VLOOKUP with XLOOKUP', () => {
      const result = service.simplifyFormula('VLOOKUP(A1, B1:C10, 2, FALSE)');
      expect(result.changes).toContain('Consider replacing VLOOKUP with XLOOKUP for better flexibility');
    });

    it('should return no changes for a simple formula', () => {
      const result = service.simplifyFormula('SUM(A1:A10)');
      expect(result.simplified).toBe('SUM(A1:A10)');
      expect(result.changes).toHaveLength(0);
    });
  });

  describe('detectBottlenecks', () => {
    let prismaMock: any;

    beforeEach(async () => {
      const prismaModule = await import('../../utils/prisma.js');
      prismaMock = (prismaModule as any).prisma;
    });

    it('should detect INDIRECT as a high severity bottleneck', async () => {
      prismaMock.workbook.findUnique.mockResolvedValue({
        id: 'wb1',
        sheets_json: {
          sheets: [
            {
              name: 'Sheet1',
              cells: {
                A1: { formula: 'INDIRECT("B" & ROW())' },
              },
            },
          ],
        },
      });

      const bottlenecks = await service.detectBottlenecks('wb1', 'Sheet1');
      expect(bottlenecks.length).toBeGreaterThanOrEqual(1);
      const indirect = bottlenecks.find((b) => b.issue.includes('INDIRECT'));
      expect(indirect).toBeDefined();
      expect(indirect!.severity).toBe('high');
    });

    it('should detect OFFSET as a high severity bottleneck', async () => {
      prismaMock.workbook.findUnique.mockResolvedValue({
        id: 'wb1',
        sheets_json: {
          sheets: [
            {
              name: 'Sheet1',
              cells: {
                A1: { formula: 'SUM(OFFSET(A1, 1, 0, 5, 1))' },
              },
            },
          ],
        },
      });

      const bottlenecks = await service.detectBottlenecks('wb1', 'Sheet1');
      const offset = bottlenecks.find((b) => b.issue.includes('OFFSET'));
      expect(offset).toBeDefined();
      expect(offset!.severity).toBe('high');
    });

    it('should detect multiple VLOOKUPs in one cell as medium severity', async () => {
      prismaMock.workbook.findUnique.mockResolvedValue({
        id: 'wb1',
        sheets_json: {
          sheets: [
            {
              name: 'Sheet1',
              cells: {
                A1: { formula: 'VLOOKUP(A1, B:C, 2, 0) + VLOOKUP(A1, D:E, 2, 0)' },
              },
            },
          ],
        },
      });

      const bottlenecks = await service.detectBottlenecks('wb1', 'Sheet1');
      const multiVlookup = bottlenecks.find((b) => b.issue.includes('Multiple VLOOKUP'));
      expect(multiVlookup).toBeDefined();
      expect(multiVlookup!.severity).toBe('medium');
    });

    it('should return empty array when workbook not found', async () => {
      prismaMock.workbook.findUnique.mockResolvedValue(null);

      const bottlenecks = await service.detectBottlenecks('nonexistent', 'Sheet1');
      expect(bottlenecks).toEqual([]);
    });

    it('should return empty array when sheet has no formulas', async () => {
      prismaMock.workbook.findUnique.mockResolvedValue({
        id: 'wb1',
        sheets_json: {
          sheets: [
            {
              name: 'Sheet1',
              cells: {
                A1: { value: 'hello' },
              },
            },
          ],
        },
      });

      const bottlenecks = await service.detectBottlenecks('wb1', 'Sheet1');
      expect(bottlenecks).toEqual([]);
    });
  });
});
