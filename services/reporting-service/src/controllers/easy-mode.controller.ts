import { Request, Response, NextFunction } from 'express';
import { reportEasyModeService } from '../services/easy-mode.service';
import { logger } from '../utils/logger';

export class ReportEasyModeController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await reportEasyModeService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        reportType: req.query.reportType as string,
        outputFormat: req.query.outputFormat as string,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportEasyModeService.getById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportEasyModeService.create(req.body);
      logger.info('Report easy-mode created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportEasyModeService.update(req.params.id, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await reportEasyModeService.remove(req.params.id);
      res.status(200).json({ success: true, message: 'Report deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async duplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportEasyModeService.duplicate(req.params.id);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { outputFormat } = req.body;
      const data = await reportEasyModeService.generate(req.params.id, outputFormat);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async schedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportEasyModeService.schedule(req.params.id, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async preview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportEasyModeService.preview(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async exportReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format } = req.body;
      const data = await reportEasyModeService.exportReport(req.params.id, format || 'pdf');
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const reportEasyModeController = new ReportEasyModeController();
