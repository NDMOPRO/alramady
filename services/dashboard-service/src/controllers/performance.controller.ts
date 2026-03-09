import { Request, Response, NextFunction } from 'express';
import { performanceService } from '../services/performance.service';
import { logger } from '../utils/logger';

export class PerformanceController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await performanceService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        dashboardId: req.query.dashboardId as string,
        metricType: req.query.metricType as string,
        status: req.query.status as string,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await performanceService.getById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await performanceService.create(req.body);
      logger.info('Performance metric created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await performanceService.update(req.params.id, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await performanceService.remove(req.params.id);
      res.status(200).json({ success: true, message: 'Performance metric deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await performanceService.getSummary(req.params.dashboardId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async optimize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await performanceService.optimize(req.params.dashboardId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.08: Get semantic layer
  async getSemanticLayer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await performanceService.getSemanticLayer(req.params.dashboardId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.08: Precompute aggregations
  async precomputeAggregations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await performanceService.precomputeAggregations(req.params.dashboardId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.08: Get optimized data
  async getOptimizedData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { datasetId, column, aggregation, maxPoints } = req.body;
      const data = await performanceService.getOptimizedData(
        { datasetId, column, aggregation },
        maxPoints,
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.08: Batch process
  async batchProcess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { operations } = req.body;
      const data = await performanceService.batchProcess(operations);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const performanceController = new PerformanceController();
