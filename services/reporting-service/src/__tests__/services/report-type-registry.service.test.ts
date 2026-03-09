import '../mocks/logger';

import { ReportTypeRegistry } from '../../services/report-type-registry.service';
import type { ReportCategory } from '../../services/report-type-registry.service';

describe('ReportTypeRegistry', () => {
  let registry: ReportTypeRegistry;

  beforeEach(() => {
    registry = new ReportTypeRegistry();
  });

  // ── getAllTypes() ───────────────────────────────────────────────────────

  describe('getAllTypes()', () => {
    it('should return all 26 report types', () => {
      const types = registry.getAllTypes();

      expect(types).toHaveLength(26);
    });

    it('should return types with required properties', () => {
      const types = registry.getAllTypes();

      for (const t of types) {
        expect(t).toHaveProperty('id');
        expect(t).toHaveProperty('name');
        expect(t).toHaveProperty('description');
        expect(t).toHaveProperty('category');
        expect(t).toHaveProperty('defaultTemplate');
        expect(t).toHaveProperty('chartTypes');
        expect(t).toHaveProperty('requiredFields');
        expect(t).toHaveProperty('optionalFields');
      }
    });

    it('should include types from all expected categories', () => {
      const types = registry.getAllTypes();
      const categories = new Set(types.map((t) => t.category));

      expect(categories).toContain('Financial');
      expect(categories).toContain('Sales');
      expect(categories).toContain('HR');
      expect(categories).toContain('Operations');
      expect(categories).toContain('Compliance');
      expect(categories).toContain('Marketing');
      expect(categories).toContain('IT');
      expect(categories).toContain('Executive');
    });
  });

  // ── getTypeById() ──────────────────────────────────────────────────────

  describe('getTypeById()', () => {
    it('should return the type when found', () => {
      const result = registry.getTypeById('financial-summary');

      expect(result).toBeDefined();
      expect(result!.id).toBe('financial-summary');
      expect(result!.name).toBe('Financial Summary');
      expect(result!.category).toBe('Financial');
    });

    it('should return undefined for non-existent type', () => {
      const result = registry.getTypeById('non-existent-type');

      expect(result).toBeUndefined();
    });

    it('should return correct data for various type IDs', () => {
      const salesPipeline = registry.getTypeById('sales-pipeline');
      expect(salesPipeline).toBeDefined();
      expect(salesPipeline!.category).toBe('Sales');

      const hrHeadcount = registry.getTypeById('hr-headcount');
      expect(hrHeadcount).toBeDefined();
      expect(hrHeadcount!.category).toBe('HR');

      const executiveDashboard = registry.getTypeById('executive-dashboard');
      expect(executiveDashboard).toBeDefined();
      expect(executiveDashboard!.category).toBe('Executive');
    });
  });

  // ── getTypesByCategory() ──────────────────────────────────────────────

  describe('getTypesByCategory()', () => {
    it('should return correct Financial types', () => {
      const financialTypes = registry.getTypesByCategory('Financial');

      expect(financialTypes.length).toBe(5);
      expect(financialTypes.every((t) => t.category === 'Financial')).toBe(true);
      const ids = financialTypes.map((t) => t.id);
      expect(ids).toContain('financial-summary');
      expect(ids).toContain('financial-balance-sheet');
      expect(ids).toContain('financial-cashflow');
      expect(ids).toContain('financial-profit-loss');
      expect(ids).toContain('financial-budget-variance');
    });

    it('should return correct Sales types', () => {
      const salesTypes = registry.getTypesByCategory('Sales');

      expect(salesTypes.length).toBe(4);
      expect(salesTypes.every((t) => t.category === 'Sales')).toBe(true);
    });

    it('should return correct HR types', () => {
      const hrTypes = registry.getTypesByCategory('HR');

      expect(hrTypes.length).toBe(4);
      expect(hrTypes.every((t) => t.category === 'HR')).toBe(true);
    });

    it('should return correct Operations types', () => {
      const opsTypes = registry.getTypesByCategory('Operations');

      expect(opsTypes.length).toBe(3);
    });

    it('should return correct Compliance types', () => {
      const complianceTypes = registry.getTypesByCategory('Compliance');

      expect(complianceTypes.length).toBe(3);
    });

    it('should return correct Marketing types', () => {
      const marketingTypes = registry.getTypesByCategory('Marketing');

      expect(marketingTypes.length).toBe(3);
    });

    it('should return correct IT types', () => {
      const itTypes = registry.getTypesByCategory('IT');

      expect(itTypes.length).toBe(2);
    });

    it('should return correct Executive types', () => {
      const execTypes = registry.getTypesByCategory('Executive');

      expect(execTypes.length).toBe(2);
    });

    it('should return empty array for invalid category', () => {
      const result = registry.getTypesByCategory('NonExistent' as ReportCategory);

      expect(result).toEqual([]);
    });
  });

  // ── getDefaultSections() ──────────────────────────────────────────────

  describe('getDefaultSections()', () => {
    it('should return sections for a valid type', () => {
      const sections = registry.getDefaultSections('financial-summary');

      expect(sections).toBeDefined();
      expect(sections!.length).toBe(4);
      expect(sections![0]).toHaveProperty('id');
      expect(sections![0]).toHaveProperty('title');
      expect(sections![0]).toHaveProperty('type');
      expect(sections![0]).toHaveProperty('order');
    });

    it('should return sections ordered by order field', () => {
      const sections = registry.getDefaultSections('financial-cashflow');

      expect(sections).toBeDefined();
      for (let i = 0; i < sections!.length - 1; i++) {
        expect(sections![i].order).toBeLessThan(sections![i + 1].order);
      }
    });

    it('should return undefined for non-existent type', () => {
      const sections = registry.getDefaultSections('does-not-exist');

      expect(sections).toBeUndefined();
    });

    it('should include various section types', () => {
      const sections = registry.getDefaultSections('financial-summary');
      const types = sections!.map((s) => s.type);

      expect(types).toContain('text');
      expect(types).toContain('chart');
      expect(types).toContain('table');
      expect(types).toContain('summary');
    });
  });

  // ── getRecommendedCharts() ────────────────────────────────────────────

  describe('getRecommendedCharts()', () => {
    it('should return chart types for a valid report type', () => {
      const charts = registry.getRecommendedCharts('financial-summary');

      expect(charts).toBeDefined();
      expect(charts!.length).toBeGreaterThan(0);
      expect(charts).toContain('bar');
      expect(charts).toContain('line');
      expect(charts).toContain('pie');
      expect(charts).toContain('waterfall');
    });

    it('should return undefined for non-existent type', () => {
      const charts = registry.getRecommendedCharts('unknown-type');

      expect(charts).toBeUndefined();
    });

    it('should return funnel chart for sales-pipeline', () => {
      const charts = registry.getRecommendedCharts('sales-pipeline');

      expect(charts).toContain('funnel');
    });

    it('should return gauge chart for executive-dashboard', () => {
      const charts = registry.getRecommendedCharts('executive-dashboard');

      expect(charts).toContain('gauge');
    });
  });
});
