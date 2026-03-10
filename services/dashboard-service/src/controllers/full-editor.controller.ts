import { Request, Response, NextFunction } from 'express';
import { fullEditorService } from '../services/full-editor.service';
import { logger } from '../utils/logger';

export class FullEditorController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await fullEditorService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        dashboardId: req.query.dashboardId as string,
        editorMode: req.query.editorMode as string,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await fullEditorService.getById(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await fullEditorService.create(req.body);
      logger.info('Full editor session created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await fullEditorService.update(req.params.id!, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await fullEditorService.remove(req.params.id!);
      res.status(200).json({ success: true, message: 'Full editor session deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async saveSnapshot(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await fullEditorService.saveSnapshot(req.params.id!, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.04: Resize widget element
  async resizeElement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { widgetId, dashboardId, newSize } = req.body;
      const data = await fullEditorService.resizeElement({ widgetId, dashboardId, newSize });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.04: Share interactive link
  async shareInteractiveLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId } = req.params;
      const { expiresHours } = req.body;
      const data = await fullEditorService.shareInteractiveLink(dashboardId, expiresHours);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.04: Convert to report
  async convertToReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId } = req.params;
      const userId = req.user!.userId || req.user!.id! || 'a0000000-0000-0000-0000-000000000001';
      const data = await fullEditorService.convertToReport(dashboardId, userId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.04: Rebind widget element
  async rebindElement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await fullEditorService.rebindElement(req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.04: Add canvas formula
  async addCanvasFormula(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { widgetId } = req.params;
      const { expression, resultColumn } = req.body;
      const data = await fullEditorService.addCanvasFormula(widgetId, { expression, resultColumn });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.04: Export dashboard
  async exportDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId } = req.params;
      const { format } = req.body;
      const data = await fullEditorService.exportDashboard(dashboardId, format);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const fullEditorController = new FullEditorController();
