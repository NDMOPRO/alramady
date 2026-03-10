import { Request, Response, NextFunction } from 'express';
import { dragElementsService } from '../services/drag-elements.service';
import { logger } from '../utils/logger';

export class DragElementsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await dragElementsService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        dashboardId: req.query.dashboardId as string,
        elementType: req.query.elementType as string,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dragElementsService.getById(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dragElementsService.create(req.body);
      logger.info('Drag element created', { id: (data as any).id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dragElementsService.update(req.params.id!, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await dragElementsService.remove(req.params.id!);
      res.status(200).json({ success: true, message: 'Drag element deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async batchUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId, elements } = req.body;
      const data = await dragElementsService.batchUpdate(dashboardId, elements);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async reorder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId, elementIds } = req.body;
      const data = await dragElementsService.reorder(dashboardId, elementIds);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.03: Drop and bind element to data
  async dropAndBind(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dragElementsService.dropAndBind(req.body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.03: Link elements for cross-filtering
  async linkElements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dragElementsService.linkElements(req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.03: Configure drill-down
  async configureDrillDown(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { levels } = req.body;
      const data = await dragElementsService.configureDrillDown(req.params.id!, levels);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.03: Configure alerts
  async configureAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dragElementsService.configureAlert(req.params.id!, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.03: Export element to presentation
  async exportToPresentation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId, presentationId, slideIndex } = req.body;
      const data = await dragElementsService.exportToPresentation({
        elementId: req.params.id!,
        dashboardId,
        presentationId,
        slideIndex,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.03: Update single element position
  async updatePosition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId, position } = req.body;
      const data = await dragElementsService.updatePosition(req.params.id!, dashboardId, position);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const dragElementsController = new DragElementsController();
