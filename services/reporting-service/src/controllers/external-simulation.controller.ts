import { Request, Response, NextFunction } from 'express';
import { reportExternalSimulationService } from '../services/external-simulation.service';
import { logger } from '../utils/logger';

export class ReportExternalSimulationController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await reportExternalSimulationService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        reportId: req.query.reportId as string,
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
      const data = await reportExternalSimulationService.getById(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportExternalSimulationService.create(req.body);
      logger.info('Report external simulation created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportExternalSimulationService.update(req.params.id!, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await reportExternalSimulationService.remove(req.params.id!);
      res.status(200).json({ success: true, message: 'Report external simulation deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportExternalSimulationService.execute(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await reportExternalSimulationService.getResults(req.params.id!);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const reportExternalSimulationController = new ReportExternalSimulationController();
