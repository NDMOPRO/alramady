import { Request, Response, NextFunction } from 'express';
import { classificationService } from '../services/classification.service';
import { logger } from '../utils/logger';

export class ClassificationController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const fileType = req.query.fileType as string | undefined;
      const classifiedType = req.query.classifiedType as string | undefined;

      const result = await classificationService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        fileType,
        classifiedType,
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
      const classification = await classificationService.getById(id);

      res.status(200).json({
        success: true,
        data: classification,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const classification = await classificationService.create(req.body);

      logger.info('File classification created', {
        classificationId: classification.id,
        fileName: req.body.fileName,
        classifiedType: req.body.classifiedType,
      });

      res.status(201).json({
        success: true,
        data: classification,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const classification = await classificationService.update(id, req.body);

      logger.info('File classification updated', { classificationId: id });

      res.status(200).json({
        success: true,
        data: classification,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await classificationService.delete(id);

      logger.info('File classification deleted', { classificationId: id });

      res.status(200).json({
        success: true,
        message: 'File classification deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const classificationController = new ClassificationController();
