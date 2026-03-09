import { Request, Response, NextFunction } from 'express';
import { reportTemplateLibraryService } from '../services/template-library.service';
import { logger } from '../utils/logger';

export class ReportTemplateLibraryController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await reportTemplateLibraryService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        category: req.query.category as string,
        isPremium: req.query.isPremium === 'true' ? true : req.query.isPremium === 'false' ? false : undefined,
        isPublic: req.query.isPublic === 'true' ? true : req.query.isPublic === 'false' ? false : undefined,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportTemplateLibraryService.getById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportTemplateLibraryService.create(req.body);
      logger.info('Report template created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportTemplateLibraryService.update(req.params.id, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await reportTemplateLibraryService.remove(req.params.id);
      res.status(200).json({ success: true, message: 'Report template deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async duplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportTemplateLibraryService.duplicate(req.params.id);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportTemplateLibraryService.getCategories();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async applyTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { targetReportId } = req.body;
      const data = await reportTemplateLibraryService.applyTemplate(req.params.id, targetReportId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const reportTemplateLibraryController = new ReportTemplateLibraryController();
