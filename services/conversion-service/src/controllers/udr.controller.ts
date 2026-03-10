import { Request, Response, NextFunction } from 'express';
import { udrService } from '../services/udr.service';
import { logger } from '../utils/logger';

export class UdrController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const sourceFormat = req.query.sourceFormat as string | undefined;

      const result = await udrService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        tenantId: req.user!.organizationId,
        sourceFormat,
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
      const udr = await udrService.getById(id);

      res.status(200).json({
        success: true,
        data: udr,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const udr = await udrService.create({
        tenant_id: req.user!.organizationId || req.body.tenantId,
        source_format: req.body.documentType || req.body.sourceFormat,
        source_path: req.body.sourcePath || `udr://${req.body.documentName}`,
        output_path: req.body.outputPath,
      });

      logger.info('UDR document created', { jobId: udr.id, sourceFormat: udr.sourceFormat });

      res.status(201).json({
        success: true,
        data: udr,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const udr = await udrService.update(id, {
        source_format: req.body.documentType || req.body.sourceFormat,
        source_path: req.body.sourcePath,
        output_path: req.body.outputPath,
        status: req.body.status,
      });

      logger.info('UDR document updated', { jobId: id });

      res.status(200).json({
        success: true,
        data: udr,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await udrService.delete(id);

      logger.info('UDR document deleted', { jobId: id });

      res.status(200).json({
        success: true,
        message: 'UDR document deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async convertToUdr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sourcePath, sourceFormat } = req.body;
      const tenantId = req.user!.organizationId || req.body.tenantId;

      const result = await udrService.convertToUdr(sourcePath, sourceFormat, tenantId);

      logger.info('Document converted to UDR', { jobId: result.job.id, sourceFormat });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async convertFromUdr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { udrPath, targetFormat } = req.body;
      const tenantId = req.user!.organizationId || req.body.tenantId;

      const result = await udrService.convertFromUdr(udrPath, targetFormat, tenantId);

      logger.info('UDR converted to target format', { jobId: result.job.id, targetFormat });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSchema(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schema = await udrService.getUdrSchema();

      res.status(200).json({
        success: true,
        data: schema,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const udrController = new UdrController();
