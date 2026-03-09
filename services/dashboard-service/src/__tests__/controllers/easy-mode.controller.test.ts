import '../setup';
import request from 'supertest';
import express from 'express';
import { EasyModeController } from '../../controllers/easy-mode.controller';
import { mockPrisma } from '../helpers/mock-prisma';
import { buildEasyMode } from '../helpers/factories';
import { errorHandler } from '../../middleware/errorHandler';

// Build test app with easy-mode routes
function buildApp() {
  const app = express();
  app.use(express.json());

  const controller = new EasyModeController();

  app.get('/easy-mode', (req, res, next) => controller.list(req, res, next));
  app.get('/easy-mode/:id', (req, res, next) => controller.getById(req, res, next));
  app.post('/easy-mode', (req, res, next) => controller.create(req, res, next));
  app.put('/easy-mode/:id', (req, res, next) => controller.update(req, res, next));
  app.delete('/easy-mode/:id', (req, res, next) => controller.remove(req, res, next));
  app.post('/easy-mode/:id/duplicate', (req, res, next) => controller.duplicate(req, res, next));
  app.post('/easy-mode/:id/publish', (req, res, next) => controller.publish(req, res, next));

  app.use(errorHandler);
  return app;
}

describe('EasyModeController', () => {
  const app = buildApp();

  describe('GET /easy-mode', () => {
    it('should return 200 with paginated list', async () => {
      const dashboards = [buildEasyMode(), buildEasyMode()];
      mockPrisma.dashboardEasyMode.findMany.mockResolvedValue(dashboards);
      mockPrisma.dashboardEasyMode.count.mockResolvedValue(2);

      const res = await request(app).get('/easy-mode');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should pass query params to service', async () => {
      mockPrisma.dashboardEasyMode.findMany.mockResolvedValue([]);
      mockPrisma.dashboardEasyMode.count.mockResolvedValue(0);

      const res = await request(app).get('/easy-mode?page=2&limit=10&search=test');

      expect(res.status).toBe(200);
      expect(mockPrisma.dashboardEasyMode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('GET /easy-mode/:id', () => {
    it('should return 200 with dashboard', async () => {
      const dashboard = buildEasyMode({ id: 'test-1' });
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(dashboard);

      const res = await request(app).get('/easy-mode/test-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('test-1');
    });

    it('should return 404 for missing id', async () => {
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/easy-mode/missing');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /easy-mode', () => {
    it('should return 201 on create', async () => {
      const created = buildEasyMode({ name: 'New Dashboard' });
      mockPrisma.dashboardEasyMode.create.mockResolvedValue(created);

      const res = await request(app)
        .post('/easy-mode')
        .send({ name: 'New Dashboard' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /easy-mode/:id', () => {
    it('should return 200 on update', async () => {
      const existing = buildEasyMode({ id: 'test-1' });
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(existing);
      mockPrisma.dashboardEasyMode.update.mockResolvedValue({ ...existing, name: 'Updated' });

      const res = await request(app)
        .put('/easy-mode/test-1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /easy-mode/:id', () => {
    it('should return 200 on delete', async () => {
      mockPrisma.dashboardEasyMode.findUnique.mockResolvedValue(buildEasyMode({ id: 'test-1' }));
      mockPrisma.dashboardEasyMode.delete.mockResolvedValue({ id: 'test-1' });

      const res = await request(app).delete('/easy-mode/test-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /easy-mode/:id/publish', () => {
    it('should publish dashboard', async () => {
      const published = buildEasyMode({ id: 'test-1', isPublic: true });
      mockPrisma.dashboardEasyMode.update.mockResolvedValue(published);

      const res = await request(app).post('/easy-mode/test-1/publish');

      expect(res.status).toBe(200);
      expect(res.body.data.isPublic).toBe(true);
    });
  });
});
