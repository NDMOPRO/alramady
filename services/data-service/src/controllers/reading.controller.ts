import { Request, Response, NextFunction } from 'express';
import { readingService } from '../services/reading.service';
import { logger } from '../utils/logger';

export class ReadingController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const datasetId = req.query.datasetId as string | undefined;
      const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

      const result = await readingService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        datasetId,
        isActive,
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
      const session = await readingService.getById(id);

      res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const session = await readingService.create(req.body);

      logger.info('Reading session created', {
        sessionId: session.id,
        datasetId: req.body.datasetId,
      });

      res.status(201).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const session = await readingService.update(id, req.body);

      logger.info('Reading session updated', { sessionId: id });

      res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await readingService.delete(id);

      logger.info('Reading session deleted', { sessionId: id });

      res.status(200).json({
        success: true,
        message: 'Reading session deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const readingController = new ReadingController();
