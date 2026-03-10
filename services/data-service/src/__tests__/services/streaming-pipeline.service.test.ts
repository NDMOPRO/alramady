import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock winston logger
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return {
    createLogger: jest.fn().mockReturnValue(mockLogger),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      json: jest.fn(),
      colorize: jest.fn(),
      simple: jest.fn(),
    },
    transports: {
      Console: jest.fn(),
    },
  };
});

// Mock fs
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs') as typeof import('fs');
  return {
    ...actualFs,
    createReadStream: jest.fn(),
    statSync: jest.fn().mockReturnValue({ size: 1024 }),
  };
});

// Mock Prisma
const mockAuditLogCreate = jest.fn().mockResolvedValue({ id: 'audit-1' } as never);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    auditLog: { create: mockAuditLogCreate },
  })),
}));

import { StreamingPipelineService } from '../../services/streaming-pipeline.service';

describe('StreamingPipelineService', () => {
  let service: StreamingPipelineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StreamingPipelineService();
  });

  describe('parseCSVLine', () => {
    // Access private method via any cast for testing
    function parseLine(line: string): string[] {
      return (service as unknown as { parseCSVLine: (line: string) => string[] }).parseCSVLine(line);
    }

    it('should parse simple comma-separated values', () => {
      const result = parseLine('Alice,30,Riyadh');
      expect(result).toEqual(['Alice', '30', 'Riyadh']);
    });

    it('should parse quoted fields with commas inside', () => {
      const result = parseLine('"Smith, John",25,"New York, NY"');
      expect(result).toEqual(['Smith, John', '25', 'New York, NY']);
    });

    it('should handle escaped quotes (double-double quotes)', () => {
      const result = parseLine('"He said ""hello""",42');
      expect(result).toEqual(['He said "hello"', '42']);
    });

    it('should handle empty fields', () => {
      const result = parseLine('Alice,,Riyadh');
      expect(result).toEqual(['Alice', '', 'Riyadh']);
    });

    it('should handle single value', () => {
      const result = parseLine('hello');
      expect(result).toEqual(['hello']);
    });

    it('should trim whitespace around values', () => {
      const result = parseLine(' Alice , 30 , Riyadh ');
      expect(result).toEqual(['Alice', '30', 'Riyadh']);
    });
  });

  describe('inferType', () => {
    function infer(value: string): string | number | boolean | null {
      return (service as unknown as { inferType: (v: string) => string | number | boolean | null }).inferType(value);
    }

    it('should infer numbers', () => {
      expect(infer('42')).toBe(42);
      expect(infer('3.14')).toBe(3.14);
      expect(infer('-10')).toBe(-10);
    });

    it('should infer booleans', () => {
      expect(infer('true')).toBe(true);
      expect(infer('false')).toBe(false);
    });

    it('should infer null for empty strings and null keywords', () => {
      expect(infer('')).toBeNull();
      expect(infer('null')).toBeNull();
      expect(infer('NULL')).toBeNull();
    });

    it('should return string for non-numeric, non-boolean values', () => {
      expect(infer('hello')).toBe('hello');
      expect(infer('Riyadh')).toBe('Riyadh');
    });

    it('should strip surrounding quotes from strings', () => {
      expect(infer('"quoted"')).toBe('quoted');
    });
  });

  describe('createIngestionPipeline', () => {
    it('should return three stages: validate, normalize, store', () => {
      const stages = service.createIngestionPipeline('tenant-1', 'ds-1');

      expect(stages).toHaveLength(3);
      expect(stages[0].name).toBe('validate');
      expect(stages[1].name).toBe('normalize');
      expect(stages[2].name).toBe('store');
    });

    it('validate stage should filter out completely empty rows', async () => {
      const stages = service.createIngestionPipeline('tenant-1', 'ds-1');
      const validateStage = stages[0];

      const batch = [
        { name: 'Alice', age: 30 },
        { name: null, age: null, city: '' },
        { name: 'Bob', age: 25 },
        { name: '', age: undefined, city: '' },
      ];

      const result = await validateStage.transform(batch as Record<string, any>[]);

      // Only rows that have at least one non-null, non-empty value survive
      expect(result.length).toBe(2);
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Bob');
    });

    it('normalize stage should lowercase and trim keys, trim string values', async () => {
      const stages = service.createIngestionPipeline('tenant-1', 'ds-1');
      const normalizeStage = stages[1];

      const batch = [
        { 'Full Name': '  Alice  ', 'Age Group': 30 },
      ];

      const result = await normalizeStage.transform(batch as Record<string, any>[]);

      expect(result[0]).toHaveProperty('full_name', 'Alice');
      expect(result[0]).toHaveProperty('age_group', 30);
    });

    it('store stage should create audit log entry', async () => {
      const stages = service.createIngestionPipeline('tenant-1', 'ds-1');
      const storeStage = stages[2];

      const batch = [{ name: 'Alice' }];
      const result = await storeStage.transform(batch as Record<string, any>[]);

      expect(result).toEqual(batch);
      expect(mockAuditLogCreate).toHaveBeenCalled();
    });
  });

  describe('createTransformPipeline', () => {
    it('should apply uppercase transform', async () => {
      const stages = service.createTransformPipeline([
        { type: 'uppercase', column: 'name', params: {} },
      ]);

      const result = await stages[0].transform([
        { name: 'alice', age: 30 },
        { name: 'bob', age: 25 },
      ]);

      expect(result[0].name).toBe('ALICE');
      expect(result[1].name).toBe('BOB');
    });

    it('should apply lowercase transform', async () => {
      const stages = service.createTransformPipeline([
        { type: 'lowercase', column: 'city', params: {} },
      ]);

      const result = await stages[0].transform([
        { city: 'RIYADH' },
        { city: 'JEDDAH' },
      ]);

      expect(result[0].city).toBe('riyadh');
      expect(result[1].city).toBe('jeddah');
    });

    it('should apply round transform', async () => {
      const stages = service.createTransformPipeline([
        { type: 'round', column: 'price', params: {} },
      ]);

      const result = await stages[0].transform([
        { price: 3.14159 },
        { price: 2.71828 },
      ]);

      expect(result[0].price).toBe(3.14);
      expect(result[1].price).toBe(2.72);
    });

    it('should apply fill_null transform', async () => {
      const stages = service.createTransformPipeline([
        { type: 'fill_null', column: 'status', params: { defaultValue: 'unknown' } },
      ]);

      const result = await stages[0].transform([
        { status: null, id: 1 },
        { status: 'active', id: 2 },
        { status: undefined, id: 3 },
      ]);

      expect(result[0].status).toBe('unknown');
      expect(result[1].status).toBe('active');
      expect(result[2].status).toBe('unknown');
    });

    it('should apply filter transform with eq operator', async () => {
      const stages = service.createTransformPipeline([
        { type: 'filter', column: 'status', params: { operator: 'eq', value: 'active' } },
      ]);

      const result = await stages[0].transform([
        { status: 'active', id: 1 },
        { status: 'inactive', id: 2 },
        { status: 'active', id: 3 },
      ]);

      expect(result).toHaveLength(2);
      expect(result.every((r) => r.status === 'active')).toBe(true);
    });

    it('should apply filter transform with gt operator', async () => {
      const stages = service.createTransformPipeline([
        { type: 'filter', column: 'amount', params: { operator: 'gt', value: 50 } },
      ]);

      const result = await stages[0].transform([
        { amount: 30 },
        { amount: 60 },
        { amount: 100 },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].amount).toBe(60);
      expect(result[1].amount).toBe(100);
    });

    it('should not modify non-matching column types', async () => {
      const stages = service.createTransformPipeline([
        { type: 'uppercase', column: 'name', params: {} },
      ]);

      const result = await stages[0].transform([
        { name: 42, age: 30 },
      ]);

      // numeric name is not a string, should remain unchanged
      expect(result[0].name).toBe(42);
    });

    it('should pass through for unknown transform type', async () => {
      const stages = service.createTransformPipeline([
        { type: 'unknown_op', column: 'x', params: {} },
      ]);

      const batch = [{ x: 'hello' }];
      const result = await stages[0].transform(batch);

      expect(result).toEqual(batch);
    });
  });
});

describe('StreamingPipelineService — no fake code', () => {
  it('service source has no mock/placeholder patterns', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require.resolve('../../services/streaming-pipeline.service'),
      'utf-8'
    );
    expect(source).not.toMatch(/Math\.random\(\)/);
    expect(source).not.toMatch(/sampleData/);
    expect(source).not.toMatch(/mockData/);
    expect(source).not.toMatch(/TODO/);
    expect(source).not.toMatch(/FIXME/);
    expect(source).not.toMatch(/placeholder/i);
  });
});
