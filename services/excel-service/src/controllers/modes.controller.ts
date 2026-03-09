import { Request, Response, NextFunction } from 'express';
import { modesService } from '../services/modes.service';
import { logger } from '../utils/logger';

export class ModesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const workbookId = req.query.workbookId as string | undefined;

      const result = await modesService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        workbookId,
        tenantId: req.user?.organizationId,
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
      const mode = await modesService.getById(id);

      res.status(200).json({
        success: true,
        data: mode,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mode = await modesService.create({
        ...req.body,
        tenant_id: req.user?.organizationId || req.body.tenantId,
        created_by: req.user?.userId || 'system',
      });

      logger.info('Mode workbook created', { workbookId: mode.id, name: mode.name });

      res.status(201).json({
        success: true,
        data: mode,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const mode = await modesService.update(id, req.body);

      logger.info('Mode workbook updated', { workbookId: id });

      res.status(200).json({
        success: true,
        data: mode,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await modesService.delete(id);

      logger.info('Mode workbook deleted', { workbookId: id });

      res.status(200).json({
        success: true,
        message: 'Mode workbook deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async switchMode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workbookId, modeName } = req.body;
      const result = await modesService.switchMode(workbookId, modeName);

      logger.info('Mode switched', { workbookId, modeName });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getModeConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const config = await modesService.getModeConfig(id);

      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateModeConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workbookId, modeName, config } = req.body;
      const result = await modesService.updateModeConfig(workbookId, modeName, config);

      logger.info('Mode config updated', { workbookId, modeName });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const modesController = new ModesController();
