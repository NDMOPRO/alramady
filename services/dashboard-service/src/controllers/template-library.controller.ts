import { Request, Response, NextFunction } from 'express';
import { templateLibraryService } from '../services/template-library.service';
import { logger } from '../utils/logger';

export class TemplateLibraryController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = req.query;
      const result = await templateLibraryService.list({
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
        category: req.query.category as string,
        isPremium: req.query.isPremium === 'true' ? true : req.query.isPremium === 'false' ? false : undefined,
        isPublic: req.query.isPublic === 'true' ? true : req.query.isPublic === 'false' ? false : undefined,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await templateLibraryService.getById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await templateLibraryService.create(req.body);
      logger.info('Template created', { id: data.id });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await templateLibraryService.update(req.params.id, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await templateLibraryService.remove(req.params.id);
      res.status(200).json({ success: true, message: 'Template deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async duplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await templateLibraryService.duplicate(req.params.id);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await templateLibraryService.getCategories();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async applyTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { targetDashboardId } = req.body;
      const data = await templateLibraryService.applyTemplate(req.params.id, targetDashboardId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.06: Save dashboard as template
  async saveAsTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await templateLibraryService.saveAsTemplate(req.body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.06: Create from template
  async createFromTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId || req.user?.id || 'a0000000-0000-0000-0000-000000000001';
      const tenantId = req.user?.tenantId || req.user?.organizationId || 'a0000000-0000-0000-0000-000000000001';
      const data = await templateLibraryService.createFromTemplate({
        ...req.body,
        userId,
        tenantId,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.06: Compare dashboards
  async compareDashboards(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dashboardId1, dashboardId2 } = req.body;
      const data = await templateLibraryService.compareDashboards(dashboardId1, dashboardId2);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // E03.06: Auto-generate KPIs
  async autoGenerateKPIs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { datasetId } = req.params;
      const data = await templateLibraryService.autoGenerateKPIs(datasetId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const templateLibraryController = new TemplateLibraryController();
