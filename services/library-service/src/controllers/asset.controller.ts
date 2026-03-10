import { Request, Response, NextFunction } from 'express';
import { assetService } from '../services/asset.service';

export class AssetController {
  async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const result = await assetService.uploadAsset(file.buffer, file.originalname, tenantId, userId);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await assetService.getAsset(req.params.id!, tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const { page, limit, search, assetType } = req.query;
      const result = await assetService.listAssets(tenantId, {
        page: Number(page) || 1, limit: Number(limit) || 20,
        search: search as string, assetType: assetType as string,
      });
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await assetService.deleteAsset(req.params.id!, tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async createFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const { name, parentId } = req.body;
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const result = await assetService.createFolder(name, parentId || null, tenantId);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async getFolderTree(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await assetService.getFolderTree(tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }
}

export const assetController = new AssetController();
