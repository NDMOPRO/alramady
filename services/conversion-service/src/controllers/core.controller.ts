import { Request, Response, NextFunction } from 'express';
import { coreService } from '../services/core.service';
import { logger } from '../utils/logger';

export class CoreController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const status = req.query.status as string | undefined;
      const sourceFormat = req.query.sourceFormat as string | undefined;
      const targetFormat = req.query.targetFormat as string | undefined;

      const result = await coreService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        tenantId: req.user?.organizationId,
        status,
        sourceFormat,
        targetFormat,
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
      const job = await coreService.getById(id);

      res.status(200).json({
        success: true,
        data: job,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const job = await coreService.create({
        tenantId: req.user?.organizationId || req.body.tenantId,
        sourceFormat: req.body.sourceFormat,
        targetFormat: req.body.targetFormat,
        sourcePath: req.body.sourcePath,
        outputPath: req.body.outputPath,
      });

      logger.info('Conversion job created', { jobId: job.id, sourceFormat: job.sourceFormat, targetFormat: job.targetFormat });

      res.status(201).json({
        success: true,
        data: job,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const job = await coreService.update(id, {
        sourceFormat: req.body.sourceFormat,
        targetFormat: req.body.targetFormat,
        sourcePath: req.body.sourcePath,
        outputPath: req.body.outputPath,
        status: req.body.status,
      });

      logger.info('Conversion job updated', { jobId: id });

      res.status(200).json({
        success: true,
        data: job,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await coreService.delete(id);

      logger.info('Conversion job deleted', { jobId: id });

      res.status(200).json({
        success: true,
        message: 'Conversion job deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async startConversion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const job = await coreService.startConversion(id);

      logger.info('Conversion job started', { jobId: id });

      res.status(200).json({
        success: true,
        data: job,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelConversion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const job = await coreService.cancelConversion(id);

      logger.info('Conversion job cancelled', { jobId: id });

      res.status(200).json({
        success: true,
        data: job,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const coreController = new CoreController();
