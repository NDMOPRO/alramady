import { Request, Response, NextFunction } from 'express';
import { sourcesService } from '../services/sources.service';

export class SourcesController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const { page, limit, search, format, sortBy, sortDir } = req.query;
      const result = await sourcesService.listDatasets(tenantId, {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        search: search as string,
        format: format as string,
        sortBy: sortBy as string,
        sortDir: (sortDir as 'asc' | 'desc') || 'desc',
      });
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await sourcesService.getDataset(req.params.id!, tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async getRows(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const { page, limit, sortBy, sortDir } = req.query;
      const filters = req.body?.filters || {};
      const result = await sourcesService.getDatasetRows(req.params.id!, tenantId, {
        page: Number(page) || 1,
        limit: Number(limit) || 50,
        sortBy: sortBy as string,
        sortDir: (sortDir as 'asc' | 'desc') || 'asc',
        filters,
      });
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await sourcesService.deleteDataset(req.params.id!, tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async exportCSV(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await sourcesService.exportCSV(req.params.id!, tenantId, req.query as Record<string, string | undefined>);
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (error) { next(error); }
  }

  async exportExcel(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await sourcesService.exportExcel(req.params.id!, tenantId);
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (error) { next(error); }
  }

  async exportJSON(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await sourcesService.exportJSON(req.params.id!, tenantId, req.query as Record<string, string | undefined>);
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (error) { next(error); }
  }

  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const { q } = req.query;
      if (!q) { res.status(400).json({ error: 'Search query required' }); return; }
      const result = await sourcesService.searchDatasets(tenantId, q as string);
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  }

  async statistics(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await sourcesService.getStatistics(req.params.id!, tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }
}

export const sourcesController = new SourcesController();
