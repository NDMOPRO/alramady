import { Request, Response, NextFunction } from 'express';
import { mixedFilesService } from '../services/mixed-files.service';
import { logger } from '../utils/logger';

export class MixedFilesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const datasetId = req.query.datasetId as string | undefined;
      const fileType = req.query.fileType as string | undefined;
      const status = req.query.status as string | undefined;

      const result = await mixedFilesService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        datasetId,
        fileType,
        status,
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
      const entry = await mixedFilesService.getById(id);

      res.status(200).json({
        success: true,
        data: entry,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const entry = await mixedFilesService.create(req.body);

      logger.info('Mixed file entry created', {
        entryId: entry.id,
        datasetId: req.body.datasetId,
        fileName: req.body.fileName,
      });

      res.status(201).json({
        success: true,
        data: entry,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const entry = await mixedFilesService.update(id, req.body);

      logger.info('Mixed file entry updated', { entryId: id });

      res.status(200).json({
        success: true,
        data: entry,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await mixedFilesService.delete(id);

      logger.info('Mixed file entry deleted', { entryId: id });

      res.status(200).json({
        success: true,
        message: 'Mixed file entry deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const mixedFilesController = new MixedFilesController();
