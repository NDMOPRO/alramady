import { Request, Response, NextFunction } from 'express';
import { universalService } from '../services/universal.service';
import { logger } from '../utils/logger';

export class UniversalController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const status = req.query.status as string | undefined;

      const result = await universalService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        tenantId: req.user?.organizationId,
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
      const job = await universalService.getById(id);

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
      const job = await universalService.create({
        tenantId: req.user?.organizationId || req.body.tenantId,
        sourcePath: req.body.sourcePath,
        targetFormat: req.body.targetFormat,
        outputPath: req.body.outputPath,
      });

      logger.info('Universal conversion job created', {
        jobId: job.id,
        sourceFormat: job.sourceFormat,
        targetFormat: job.targetFormat,
      });

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
      const job = await universalService.update(id, {
        targetFormat: req.body.targetFormat,
        outputPath: req.body.outputPath,
        status: req.body.status,
      });

      logger.info('Universal conversion job updated', { jobId: id });

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
      await universalService.delete(id);

      logger.info('Universal conversion job deleted', { jobId: id });

      res.status(200).json({
        success: true,
        message: 'Universal conversion job deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async convert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        sourcePath, targetFormat,
        preserveFormatting, preserveImages, preserveLinks,
        ocrEnabled, ocrLanguage, quality,
      } = req.body;
      const tenantId = req.user?.organizationId || req.body.tenantId;

      const result = await universalService.convert(sourcePath, targetFormat, tenantId, {
        preserveFormatting,
        preserveImages,
        preserveLinks,
        ocrEnabled,
        ocrLanguage,
        quality,
      });

      logger.info('Universal conversion executed', {
        jobId: result.job.id,
        sourceFormat: result.job.sourceFormat,
        targetFormat: result.job.targetFormat,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async batchConvert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { files } = req.body;
      const tenantId = req.user?.organizationId || req.body.tenantId;

      const result = await universalService.batchConvert(files, tenantId);

      logger.info('Batch universal conversion executed', {
        total: result.total,
        successful: result.successful,
        failed: result.failed,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const universalController = new UniversalController();
