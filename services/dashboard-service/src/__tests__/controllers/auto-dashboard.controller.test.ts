import '../setup';
import request from 'supertest';
import express from 'express';
import { AutoDashboardController } from '../../controllers/auto-dashboard.controller';
import { mockPrisma } from '../helpers/mock-prisma';
import { errorHandler } from '../../middleware/errorHandler';

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

function buildApp() {
  const app = express();
  app.use(express.json());

  const controller = new AutoDashboardController();
  app.post('/analyze-data', (req, res, next) => controller.analyzeData(req, res, next));
  app.use(errorHandler);

  return app;
}

describe('AutoDashboardController', () => {
  const app = buildApp();

  describe('POST /analyze-data', () => {
    it('returns real analysis output from persisted dataset schema and rows', async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          {
            id: '35c425ab-6937-4fa1-995f-a9c17fd9632d',
            name: 'analysis-surface',
            schema_json: JSON.stringify([
              { name: 'report_date', dataType: 'date', nullable: false, position: 0 },
              { name: 'region', dataType: 'string', nullable: false, position: 1 },
              { name: 'revenue', dataType: 'integer', nullable: false, position: 2 },
              { name: 'orders', dataType: 'integer', nullable: false, position: 3 },
            ]),
          },
        ])
        .mockResolvedValueOnce([
          { data: { report_date: '2026-03-01', region: 'Riyadh', revenue: 1200, orders: 12 } },
          { data: { report_date: '2026-03-02', region: 'Jeddah', revenue: 1450, orders: 15 } },
          { data: { report_date: '2026-03-03', region: 'Dammam', revenue: 980, orders: 10 } },
        ]);

      const response = await request(app)
        .post('/analyze-data')
        .send({
          datasetId: '35c425ab-6937-4fa1-995f-a9c17fd9632d',
          preferredChartTypes: ['line_chart', 'bar_chart'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.dataProfile.rowCount).toBe(3);
      expect(response.body.data.dataProfile.numericColumns).toContain('revenue');
      expect(response.body.data.kpiRecommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ column: 'revenue', formula: 'SUM' }),
        ]),
      );
      expect(response.body.data.chartRecommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ widgetType: 'line_chart', xColumn: 'report_date', yColumn: 'revenue' }),
          expect.objectContaining({ widgetType: 'bar_chart', xColumn: 'region', yColumn: 'revenue' }),
        ]),
      );
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
        1,
        'SELECT id, name, schema_json::text AS schema_json FROM datasets WHERE id = $1',
        '35c425ab-6937-4fa1-995f-a9c17fd9632d',
      );
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
        2,
        'SELECT data FROM data_rows WHERE dataset_id = $1 ORDER BY row_index ASC LIMIT 1000',
        '35c425ab-6937-4fa1-995f-a9c17fd9632d',
      );
    });

    it('returns 400 when datasetId is missing', async () => {
      const response = await request(app)
        .post('/analyze-data')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('datasetId is required');
    });
  });
});
