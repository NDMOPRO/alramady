import { Request, Response, NextFunction } from 'express';
import { templateService } from '../services/template.service';

export class TemplateController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const { name, category, engine, content, variables } = req.body;
      if (!name || !category || !engine || !content) {
        res.status(400).json({ error: 'name, category, engine, content required' });
        return;
      }
      const result = await templateService.createTemplate(name, category, engine, content, variables || [], tenantId, userId);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async render(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { data } = req.body;
      if (!data) {
        res.status(400).json({ error: 'data is required' });
        return;
      }
      const result = await templateService.renderTemplate(req.params.id!, data);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async preview(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await templateService.previewTemplate(req.params.id!, req.body?.previewData);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const { page, limit, category, search } = req.query;
      const result = await templateService.listTemplates(tenantId, {
        page: Number(page) || 1, limit: Number(limit) || 20,
        category: category as string, search: search as string,
      });
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  }

  async duplicate(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const result = await templateService.duplicateTemplate(req.params.id!, tenantId, userId);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async validate(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await templateService.validateTemplate(req.params.id!);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }
}

export const templateController = new TemplateController();
