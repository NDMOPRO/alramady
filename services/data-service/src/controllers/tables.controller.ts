import { Request, Response, NextFunction } from 'express';
import { tablesService } from '../services/tables.service';
import { logger } from '../utils/logger';

export class TablesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const datasetId = req.query.datasetId as string | undefined;
      const viewType = req.query.viewType as string | undefined;

      const result = await tablesService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        datasetId,
        viewType,
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
      const view = await tablesService.getById(id);

      res.status(200).json({
        success: true,
        data: view,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const view = await tablesService.create(req.body);

      logger.info('Table view created', {
        viewId: view.id,
        datasetId: req.body.datasetId,
        name: req.body.name,
      });

      res.status(201).json({
        success: true,
        data: view,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const view = await tablesService.update(id, req.body);

      logger.info('Table view updated', { viewId: id });

      res.status(200).json({
        success: true,
        data: view,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await tablesService.delete(id);

      logger.info('Table view deleted', { viewId: id });

      res.status(200).json({
        success: true,
        message: 'Table view deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const tablesController = new TablesController();
