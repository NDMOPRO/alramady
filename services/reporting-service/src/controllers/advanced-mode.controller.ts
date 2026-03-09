import { Request, Response, NextFunction } from 'express';
import { reportAdvancedModeService } from '../services/advanced-mode.service';
import { logger } from '../utils/logger';

export class ReportAdvancedModeController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await reportAdvancedModeService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        cacheStrategy: req.query.cacheStrategy as string,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportAdvancedModeService.getById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportAdvancedModeService.create(req.body);
      logger.info('Report advanced-mode created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportAdvancedModeService.update(req.params.id, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await reportAdvancedModeService.remove(req.params.id);
      res.status(200).json({ success: true, message: 'Advanced report deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async executeQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportAdvancedModeService.executeQuery(req.params.id, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { formats } = req.body;
      const data = await reportAdvancedModeService.generate(req.params.id, formats);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const reportAdvancedModeController = new ReportAdvancedModeController();
