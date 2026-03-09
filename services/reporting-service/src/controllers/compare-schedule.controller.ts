import { Request, Response, NextFunction } from 'express';
import { compareScheduleService } from '../services/compare-schedule.service';
import { logger } from '../utils/logger';

export class CompareScheduleController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await compareScheduleService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        comparisonType: req.query.comparisonType as string,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        status: req.query.status as string,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await compareScheduleService.getById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await compareScheduleService.create(req.body);
      logger.info('Compare schedule created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await compareScheduleService.update(req.params.id, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await compareScheduleService.remove(req.params.id);
      res.status(200).json({ success: true, message: 'Compare schedule deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await compareScheduleService.execute(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await compareScheduleService.getResults(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async activate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await compareScheduleService.activate(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await compareScheduleService.deactivate(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const compareScheduleController = new CompareScheduleController();
