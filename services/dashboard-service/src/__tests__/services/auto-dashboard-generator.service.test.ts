import '../setup';
import { autoDashboardGeneratorService } from '../../services/auto-dashboard-generator.service';

jest.mock('d3', () => {
  const toNumbers = (values: unknown[]) => values.map(Number).filter(Number.isFinite);
  const sorted = (values: number[]) => [...values].sort((a, b) => a - b);

  return {
    sum: (values: unknown[]) => toNumbers(values).reduce((total, value) => total + value, 0),
    mean: (values: unknown[]) => {
      const numbers = toNumbers(values);
      if (numbers.length === 0) return undefined;
      return numbers.reduce((total, value) => total + value, 0) / numbers.length;
    },
    min: (values: unknown[]) => {
      const numbers = toNumbers(values);
      return numbers.length > 0 ? Math.min(...numbers) : undefined;
    },
    max: (values: unknown[]) => {
      const numbers = toNumbers(values);
      return numbers.length > 0 ? Math.max(...numbers) : undefined;
    },
    median: (values: unknown[]) => {
      const numbers = sorted(toNumbers(values));
      if (numbers.length === 0) return undefined;
      const middle = Math.floor(numbers.length / 2);
      return numbers.length % 2 === 0
        ? (numbers[middle - 1] + numbers[middle]) / 2
        : numbers[middle];
    },
    deviation: (values: unknown[]) => {
      const numbers = toNumbers(values);
      if (numbers.length < 2) return 0;
      const mean = numbers.reduce((total, value) => total + value, 0) / numbers.length;
      const variance = numbers.reduce((total, value) => total + (value - mean) ** 2, 0) / (numbers.length - 1);
      return Math.sqrt(variance);
    },
  };
});

describe('AutoDashboardGeneratorService', () => {
  describe('analysis engine', () => {
    it('profiles rows and recommends KPIs and charts from real dataset values', () => {
      const rows = [
        { report_date: '2026-03-01', region: 'Riyadh', revenue: 1200, orders: 12, margin: 0.32 },
        { report_date: '2026-03-02', region: 'Jeddah', revenue: 1450, orders: 15, margin: 0.35 },
        { report_date: '2026-03-03', region: 'Dammam', revenue: 980, orders: 10, margin: 0.28 },
        { report_date: '2026-03-04', region: 'Riyadh', revenue: 1600, orders: 18, margin: 0.4 },
      ];

      const profile = autoDashboardGeneratorService.profileData(rows, [
        { name: 'report_date', dataType: 'date' },
        { name: 'region', dataType: 'string' },
        { name: 'revenue', dataType: 'integer' },
        { name: 'orders', dataType: 'integer' },
        { name: 'margin', dataType: 'float' },
      ]);
      const kpis = autoDashboardGeneratorService.detectKPIs(profile);
      const charts = autoDashboardGeneratorService.recommendCharts(profile, ['line_chart', 'bar_chart']);

      expect(profile.rowCount).toBe(4);
      expect(profile.columnCount).toBe(5);
      expect(profile.dateColumns).toContain('report_date');
      expect(profile.numericColumns).toEqual(expect.arrayContaining(['revenue', 'orders', 'margin']));
      expect(profile.columns.find((column) => column.name === 'revenue')?.stats?.sum).toBe(5230);
      expect(kpis).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ column: 'revenue', formula: 'SUM' }),
          expect.objectContaining({ column: 'orders', formula: 'SUM' }),
        ]),
      );
      expect(charts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ widgetType: 'line_chart', xColumn: 'report_date', yColumn: 'revenue' }),
          expect.objectContaining({ widgetType: 'bar_chart', xColumn: 'region', yColumn: 'revenue' }),
        ]),
      );
    });
  });
});
