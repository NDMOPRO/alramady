import { Request, Response, NextFunction } from 'express';
import { visualProcessingService } from '../services/visual-processing.service';
import { logger } from '../utils/logger';

export class VisualProcessingController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const datasetId = req.query.datasetId as string | undefined;
      const status = req.query.status as string | undefined;
      const processingType = req.query.processingType as string | undefined;

      const result = await visualProcessingService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        datasetId,
        status,
        processingType,
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
      const processing = await visualProcessingService.getById(id);

      res.status(200).json({
        success: true,
        data: processing,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const processing = await visualProcessingService.create(req.body);

      logger.info('Visual processing created', {
        processingId: processing.id,
        datasetId: req.body.datasetId,
        processingType: req.body.processingType,
      });

      res.status(201).json({
        success: true,
        data: processing,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const processing = await visualProcessingService.update(id, req.body);

      logger.info('Visual processing updated', { processingId: id, status: req.body.status });

      res.status(200).json({
        success: true,
        data: processing,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await visualProcessingService.delete(id);

      logger.info('Visual processing deleted', { processingId: id });

      res.status(200).json({
        success: true,
        message: 'Visual processing deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const visualProcessingController = new VisualProcessingController();
