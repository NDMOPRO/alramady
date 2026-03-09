import { Request, Response, NextFunction } from 'express';
import { reportPostEditService } from '../services/post-edit.service';
import { logger } from '../utils/logger';

export class ReportPostEditController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await reportPostEditService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        reportId: req.query.reportId as string,
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
      const data = await reportPostEditService.getById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportPostEditService.create(req.body);
      logger.info('Report post-edit created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportPostEditService.update(req.params.id, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await reportPostEditService.remove(req.params.id);
      res.status(200).json({ success: true, message: 'Report post-edit deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async publish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportPostEditService.publish(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async revert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportPostEditService.revert(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportPostEditService.getHistory(req.params.reportId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async applyWatermark(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportPostEditService.applyWatermark(req.params.id, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const reportPostEditController = new ReportPostEditController();
