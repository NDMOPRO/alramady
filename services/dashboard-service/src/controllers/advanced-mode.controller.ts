import { Request, Response, NextFunction } from 'express';
import { advancedModeService } from '../services/advanced-mode.service';
import { logger } from '../utils/logger';

export class AdvancedModeController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await advancedModeService.list({
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
      const data = await advancedModeService.getById(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await advancedModeService.create(req.body);
      logger.info('Advanced-mode dashboard created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await advancedModeService.update(req.params.id!, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await advancedModeService.remove(req.params.id!);
      res.status(200).json({ success: true, message: 'Advanced-mode dashboard deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/dashboard/advanced/:id/query
   * Execute a custom SQL query against the data warehouse.
   */
  async executeQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dashboardId = req.params.id!;
      const { query, params, timeout, maxRows } = req.body;

      if (!query) {
        res.status(400).json({ success: false, error: 'query is required' });
        return;
      }

      const data = await advancedModeService.executeQuery(dashboardId, {
        query,
        params,
        timeout,
        maxRows,
      });

      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/dashboard/advanced/bind-data-source
   * Bind a custom data source to a widget.
   */
  async bindDataSource(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await advancedModeService.bindDataSource(req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/dashboard/advanced/layout
   * Apply advanced canvas layout with z-index, locking, visibility.
   */
  async applyAdvancedLayout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await advancedModeService.applyAdvancedLayout(req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/dashboard/advanced/conditional-formatting
   * Apply conditional formatting rules to a widget.
   */
  async applyConditionalFormatting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await advancedModeService.applyConditionalFormatting(req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/dashboard/advanced/computed-field
   * Create a computed/calculated field.
   */
  async createComputedField(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await advancedModeService.createComputedField(req.body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const advancedModeController = new AdvancedModeController();
