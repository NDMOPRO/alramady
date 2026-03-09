import { Request, Response, NextFunction } from 'express';
import { formulasService } from '../services/formulas.service';
import { logger } from '../utils/logger';

export class FormulasController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const workbookId = req.query.workbookId as string | undefined;

      const result = await formulasService.list({
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
      const formula = await formulasService.getById(id);

      res.status(200).json({
        success: true,
        data: formula,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const formula = await formulasService.create({
        ...req.body,
        tenant_id: req.user?.organizationId || req.body.tenantId,
        created_by: req.user?.userId || 'system',
      });

      logger.info('Formula workbook created', { workbookId: formula.id, name: formula.name });

      res.status(201).json({
        success: true,
        data: formula,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const formula = await formulasService.update(id, req.body);

      logger.info('Formula workbook updated', { workbookId: id });

      res.status(200).json({
        success: true,
        data: formula,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await formulasService.delete(id);

      logger.info('Formula workbook deleted', { workbookId: id });

      res.status(200).json({
        success: true,
        message: 'Formula workbook deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async executeFormula(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workbookId, cellRef, expression } = req.body;
      const result = await formulasService.executeFormula(workbookId, cellRef, expression);

      logger.info('Formula executed', { workbookId, cellRef });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async batchExecute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workbookId, formulas } = req.body;
      const result = await formulasService.batchExecute(workbookId, formulas);

      logger.info('Batch formulas executed', { workbookId, count: formulas.length });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const formulasController = new FormulasController();
