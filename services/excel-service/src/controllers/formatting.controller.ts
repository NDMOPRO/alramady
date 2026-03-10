import { Request, Response, NextFunction } from 'express';
import { FormattingService } from '../services/formatting.service';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

const formattingService = new FormattingService();

export class FormattingController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.organizationId;
      const workbooks = await prisma.workbook.findMany({
        where: { tenantId },
        take: Number(req.query.limit) || 20,
        skip: ((Number(req.query.page) || 1) - 1) * (Number(req.query.limit) || 20),
        orderBy: { createdAt: 'desc' },
      });
      const total = await prisma.workbook.count({ where: { tenantId } });
      res.status(200).json({ success: true, data: workbooks, total });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workbook = await prisma.workbook.findUniqueOrThrow({ where: { id: req.params.id! } });
      res.status(200).json({ success: true, data: workbook });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workbook = await prisma.workbook.create({
        data: {
          name: req.body.name || 'Untitled',
          tenantId: req.user!.organizationId || req.body.tenantId,
          createdBy: req.user!.userId || 'system',
          sheetsJson: req.body.sheetsJson || [],
          formulasJson: req.body.formulasJson || {},
        },
      });
      logger.info('Formatting workbook created', { workbookId: workbook.id, name: workbook.name });
      res.status(201).json({ success: true, data: workbook });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workbook = await prisma.workbook.update({
        where: { id: req.params.id! },
        data: req.body,
      });
      logger.info('Formatting workbook updated', { workbookId: req.params.id! });
      res.status(200).json({ success: true, data: workbook });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await prisma.workbook.delete({ where: { id: req.params.id! } });
      logger.info('Formatting workbook deleted', { workbookId: req.params.id! });
      res.status(200).json({ success: true, message: 'Formatting workbook deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async applyFormatting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workbookId, sheetName, range, styles } = req.body;
      const result = await formattingService.setCellFormat(
        workbookId, typeof sheetName === 'number' ? sheetName : 0, range, styles
      );
      logger.info('Formatting applied', { workbookId, sheetName, range });
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async applyConditionalFormatting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workbookId, sheetName, range, conditionalRules } = req.body;
      const result = await formattingService.setConditionalFormat(
        workbookId, typeof sheetName === 'number' ? sheetName : 0, range, conditionalRules
      );
      logger.info('Conditional formatting applied', { workbookId, sheetName, range });
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async clearFormatting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workbookId, sheetName, range } = req.body;
      const result = await formattingService.setCellStyle(
        workbookId, typeof sheetName === 'number' ? sheetName : 0, range, {}
      );
      logger.info('Formatting cleared', { workbookId, sheetName, range });
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const formattingController = new FormattingController();
