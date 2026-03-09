import '../setup';
import request from 'supertest';
import express from 'express';
import { validate, paginationSchema, uuidParamSchema, easyModeCreateSchema } from '../../middleware/validation';

function buildApp() {
  const app = express();
  app.use(express.json());

  app.get(
    '/test-pagination',
    validate(paginationSchema, 'query'),
    (req, res) => {
      res.json({ success: true, query: req.query });
    },
  );

  app.get(
    '/test-uuid/:id',
    validate(uuidParamSchema, 'params'),
    (req, res) => {
      res.json({ success: true, params: req.params });
    },
  );

  app.post(
    '/test-create',
    validate(easyModeCreateSchema, 'body'),
    (req, res) => {
      res.json({ success: true, body: req.body });
    },
  );

  return app;
}

describe('Validation Middleware', () => {
  const app = buildApp();

  describe('paginationSchema', () => {
    it('should apply defaults for missing params', async () => {
      const res = await request(app).get('/test-pagination');

      expect(res.status).toBe(200);
      expect(res.body.query.page).toBe(1);
      expect(res.body.query.limit).toBe(20);
      expect(res.body.query.sortOrder).toBe('desc');
    });

    it('should parse valid pagination params', async () => {
      const res = await request(app).get('/test-pagination?page=3&limit=50&sortOrder=asc');

      expect(res.status).toBe(200);
      expect(res.body.query.page).toBe(3);
      expect(res.body.query.limit).toBe(50);
      expect(res.body.query.sortOrder).toBe('asc');
    });

    it('should reject limit > 100', async () => {
      const res = await request(app).get('/test-pagination?limit=200');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject negative page', async () => {
      const res = await request(app).get('/test-pagination?page=-1');

      expect(res.status).toBe(400);
    });
  });

  describe('uuidParamSchema', () => {
    it('should accept valid UUID', async () => {
      const res = await request(app).get('/test-uuid/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(200);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app).get('/test-uuid/not-a-uuid');

      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
    });
  });

  describe('easyModeCreateSchema', () => {
    it('should validate valid create body', async () => {
      const res = await request(app)
        .post('/test-create')
        .send({ name: 'Test Dashboard' });

      expect(res.status).toBe(200);
      expect(res.body.body.name).toBe('Test Dashboard');
      expect(res.body.body.dashboardType).toBe('standard');
      expect(res.body.body.isPublic).toBe(false);
    });

    it('should reject empty name', async () => {
      const res = await request(app)
        .post('/test-create')
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post('/test-create')
        .send({ description: 'no name' });

      expect(res.status).toBe(400);
    });

    it('should apply default values', async () => {
      const res = await request(app)
        .post('/test-create')
        .send({ name: 'Dash' });

      expect(res.status).toBe(200);
      expect(res.body.body.autoRefresh).toBe(false);
      expect(res.body.body.tags).toEqual([]);
    });
  });
});
