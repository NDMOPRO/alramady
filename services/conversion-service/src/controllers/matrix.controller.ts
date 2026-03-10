import { Request, Response, NextFunction } from 'express';
import { matrixService } from '../services/matrix.service';
import { logger } from '../utils/logger';

export class MatrixController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const sourceFormat = req.query.sourceFormat as string | undefined;
      const targetFormat = req.query.targetFormat as string | undefined;

      const result = await matrixService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        tenantId: req.user!.organizationId,
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
      const entry = await matrixService.getById(id);

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
      const entry = await matrixService.create({
        tenantId: req.user!.organizationId || req.body.tenantId,
        sourceFormat: req.body.sourceFormat,
        targetFormat: req.body.targetFormat,
        sourcePath: req.body.sourcePath || `matrix://${req.body.sourceFormat}-to-${req.body.targetFormat}`,
      });

      logger.info('Matrix entry created', {
        jobId: entry.id,
        sourceFormat: entry.sourceFormat,
        targetFormat: entry.targetFormat,
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
      const entry = await matrixService.update(id, {
        sourceFormat: req.body.sourceFormat,
        targetFormat: req.body.targetFormat,
        sourcePath: req.body.sourcePath,
        outputPath: req.body.outputPath,
        status: req.body.status,
      });

      logger.info('Matrix entry updated', { jobId: id });

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
      await matrixService.delete(id);

      logger.info('Matrix entry deleted', { jobId: id });

      res.status(200).json({
        success: true,
        message: 'Matrix entry deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getSupportedConversions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matrix = await matrixService.getSupportedConversions();

      res.status(200).json({
        success: true,
        data: matrix,
      });
    } catch (error) {
      next(error);
    }
  }

  async checkSupport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sourceFormat = req.query.source as string;
      const targetFormat = req.query.target as string;

      if (!sourceFormat || !targetFormat) {
        res.status(400).json({
          success: false,
          error: 'Both source and target format query parameters are required',
          code: 'MISSING_PARAMS',
        });
        return;
      }

      const result = await matrixService.checkConversionSupport(sourceFormat, targetFormat);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await matrixService.getConversionStats(req.user!.organizationId);

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const matrixController = new MatrixController();
