import { Request, Response, NextFunction } from 'express';
import { postEditService } from '../services/post-edit.service';
import { logger } from '../utils/logger';

export class PostEditController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await postEditService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        dashboardId: req.query.dashboardId as string,
        editType: req.query.editType as string,
        isPublished: req.query.isPublished === 'true' ? true : req.query.isPublished === 'false' ? false : undefined,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await postEditService.getById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await postEditService.create(req.body);
      logger.info('Post edit created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await postEditService.update(req.params.id, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await postEditService.remove(req.params.id);
      res.status(200).json({ success: true, message: 'Post edit deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async publish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await postEditService.publish(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async revert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await postEditService.revert(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.05: Change chart type
  async changeChartType(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { widgetId } = req.params;
      const { newType } = req.body;
      const data = await postEditService.changeChartType(widgetId, newType);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.05: Change aggregation
  async changeAggregation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { widgetId } = req.params;
      const { aggregation } = req.body;
      const data = await postEditService.changeAggregation(widgetId, aggregation);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.05: Get version history
  async getVersionHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId } = req.params;
      const data = await postEditService.getVersionHistory(dashboardId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.05: Clone dashboard
  async cloneDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId } = req.params;
      const userId = req.user?.userId || req.user?.id || 'a0000000-0000-0000-0000-000000000001';
      const data = await postEditService.cloneDashboard(dashboardId, userId);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.05: Save state
  async saveState(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId } = req.params;
      const { filters } = req.body;
      const data = await postEditService.saveState(dashboardId, filters);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.05: Rebind dashboard data
  async rebindDashboardData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId } = req.params;
      const { newDatasetId } = req.body;
      const data = await postEditService.rebindDashboardData(dashboardId, newDatasetId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.05: Add element
  async addElement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId } = req.params;
      const data = await postEditService.addElement({ ...req.body, dashboardId });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.05: Delete element
  async deleteElement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId, widgetId } = req.params;
      const data = await postEditService.deleteElement(widgetId, dashboardId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const postEditController = new PostEditController();
