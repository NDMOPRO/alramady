import { Request, Response, NextFunction } from 'express';
import { matchingService } from '../services/matching.service';
import { logger } from '../utils/logger';

export class MatchingController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const workbookId = req.query.workbookId as string | undefined;

      const result = await matchingService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        workbookId,
        tenantId: req.user!.organizationId,
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
      const matching = await matchingService.getById(id);

      res.status(200).json({
        success: true,
        data: matching,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matching = await matchingService.create({
        ...req.body,
        tenant_id: req.user!.organizationId || req.body.tenantId,
        created_by: req.user!.userId || 'system',
      });

      logger.info('Matching workbook created', { workbookId: matching.id, name: matching.name });

      res.status(201).json({
        success: true,
        data: matching,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const matching = await matchingService.update(id, req.body);

      logger.info('Matching workbook updated', { workbookId: id });

      res.status(200).json({
        success: true,
        data: matching,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await matchingService.delete(id);

      logger.info('Matching workbook deleted', { workbookId: id });

      res.status(200).json({
        success: true,
        message: 'Matching workbook deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async executeMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workbookId, sourceSheetName, targetSheetName, matchColumns, matchStrategy } = req.body;
      const result = await matchingService.executeMatch(
        workbookId, sourceSheetName, targetSheetName, matchColumns, matchStrategy
      );

      logger.info('Match executed', { workbookId, sourceSheetName, targetSheetName });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMatchResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const results = await matchingService.getMatchResults(id);

      res.status(200).json({
        success: true,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  }

  async deduplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workbookId, sheetName, columns } = req.body;
      const result = await matchingService.deduplicateSheet(workbookId, sheetName, columns);

      logger.info('Deduplication executed', { workbookId, sheetName });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const matchingController = new MatchingController();
