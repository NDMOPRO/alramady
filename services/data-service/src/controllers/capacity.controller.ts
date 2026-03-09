import { Request, Response, NextFunction } from 'express';
import { capacityService } from '../services/capacity.service';
import { logger } from '../utils/logger';

export class CapacityController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const tier = req.query.tier as string | undefined;

      const result = await capacityService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        tier,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const quota = await capacityService.getById(id);

      res.status(200).json({
        success: true,
        data: quota,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const quota = await capacityService.create(req.body);

      logger.info('Storage quota created', { quotaId: quota.id });

      res.status(201).json({
        success: true,
        data: quota,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const quota = await capacityService.update(id, req.body);

      logger.info('Storage quota updated', { quotaId: id });

      res.status(200).json({
        success: true,
        data: quota,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await capacityService.delete(id);

      logger.info('Storage quota deleted', { quotaId: id });

      res.status(200).json({
        success: true,
        message: 'Storage quota deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const capacityController = new CapacityController();
