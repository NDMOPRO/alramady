import { Request, Response, NextFunction } from 'express';
import { externalSimulationService } from '../services/external-simulation.service';
import { logger } from '../utils/logger';

export class ExternalSimulationController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await externalSimulationService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        dashboardId: req.query.dashboardId as string,
        simulationType: req.query.simulationType as string,
        status: req.query.status as string,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await externalSimulationService.getById(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await externalSimulationService.create(req.body);
      logger.info('External simulation created', { id: (data as any).id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await externalSimulationService.update(req.params.id!, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await externalSimulationService.remove(req.params.id!);
      res.status(200).json({ success: true, message: 'External simulation deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await externalSimulationService.execute(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await externalSimulationService.cancel(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await externalSimulationService.getResults(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.07: Simulate from image
  async simulateFromImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId! || req.user!.organizationId || 'a0000000-0000-0000-0000-000000000001';
      const userId = req.user!.userId || req.user!.id! || 'a0000000-0000-0000-0000-000000000001';
      const { imageAnalysis, datasetId } = req.body;
      const data = await externalSimulationService.simulateFromImage({
        tenantId,
        userId,
        imageAnalysis,
        datasetId,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.07: Generate chart from prompt
  async generateChartFromPrompt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { prompt, datasetId } = req.body;
      const data = await externalSimulationService.generateChartFromPrompt({ prompt, datasetId });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.07: Simulate large dataset performance
  async simulateLargeDatasetPerformance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { datasetId } = req.params;
      const data = await externalSimulationService.simulateLargeDatasetPerformance(datasetId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.07: Extract design tokens
  async extractDesignTokens(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { imageAnalysis } = req.body;
      const data = externalSimulationService.extractDesignTokens(imageAnalysis);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const externalSimulationController = new ExternalSimulationController();
