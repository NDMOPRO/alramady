import { Request, Response, NextFunction } from 'express';
import { columnsService } from '../services/columns.service';
import { logger } from '../utils/logger';

export class ColumnsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'asc', search } = req.query;
      const datasetId = req.query.datasetId as string | undefined;
      const dataType = req.query.dataType as string | undefined;

      const result = await columnsService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        datasetId,
        dataType,
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
      const column = await columnsService.getById(id);

      res.status(200).json({
        success: true,
        data: column,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const column = await columnsService.create(req.body);

      logger.info('Dataset column created', {
        columnId: column.id,
        datasetId: req.body.datasetId,
        name: req.body.name,
      });

      res.status(201).json({
        success: true,
        data: column,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const column = await columnsService.update(id, req.body);

      logger.info('Dataset column updated', { columnId: id });

      res.status(200).json({
        success: true,
        data: column,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await columnsService.delete(id);

      logger.info('Dataset column deleted', { columnId: id });

      res.status(200).json({
        success: true,
        message: 'Dataset column deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const columnsController = new ColumnsController();
