import { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboard.service';

export class DashboardController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const { name, layout } = req.body;
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const result = await dashboardService.createDashboard(name, tenantId, userId, layout);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await dashboardService.getDashboard(req.params.id!, tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const { page, limit, search } = req.query;
      const result = await dashboardService.listDashboards(tenantId, { page: Number(page) || 1, limit: Number(limit) || 20, search: search as string });
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  }

  async addWidget(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, config, datasetId, position } = req.body;
      if (!type || !position) { res.status(400).json({ error: 'type and position required' }); return; }
      const result = await dashboardService.addWidget(req.params.id!, { type, config: config || {}, datasetId, position });
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async renderChart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, data, config } = req.body;
      if (!type || !data) { res.status(400).json({ error: 'type and data required' }); return; }
      const imageBuffer = await dashboardService.renderChart(type, data, config);
      res.setHeader('Content-Type', 'image/png');
      res.send(imageBuffer);
    } catch (error) { next(error); }
  }

  async renderWidgetChart(req: Request, res: Response, next: NextFunction) {
    try {
      const imageBuffer = await dashboardService.renderWidgetChart(req.params.widgetId!);
      res.setHeader('Content-Type', 'image/png');
      res.send(imageBuffer);
    } catch (error) { next(error); }
  }

  async exportPDF(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const pdfBuffer = await dashboardService.exportToPDF(req.params.id!, tenantId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="dashboard.pdf"`);
      res.send(pdfBuffer);
    } catch (error) { next(error); }
  }

  async deleteWidget(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await dashboardService.deleteWidget(req.params.id!, req.params.widgetId!);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await dashboardService.deleteDashboard(req.params.id!, tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async duplicate(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const result = await dashboardService.duplicateDashboard(req.params.id!, tenantId, userId);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }
}

export const dashboardController = new DashboardController();
