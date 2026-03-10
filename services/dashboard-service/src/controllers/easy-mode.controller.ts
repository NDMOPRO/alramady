import { Request, Response, NextFunction } from 'express';
import { easyModeService } from '../services/easy-mode.service';
import { logger } from '../utils/logger';

export class EasyModeController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const dashboardType = req.query.dashboardType as string | undefined;

      const result = await easyModeService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        dashboardType,
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await easyModeService.getById(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await easyModeService.create(req.body);
      logger.info('Easy-mode dashboard created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await easyModeService.update(req.params.id!, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await easyModeService.remove(req.params.id!);
      res.status(200).json({ success: true, message: 'Easy-mode dashboard deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async duplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await easyModeService.duplicate(req.params.id!);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async publish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await easyModeService.publish(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const easyModeController = new EasyModeController();
