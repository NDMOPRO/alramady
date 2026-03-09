import { Request, Response, NextFunction } from 'express';
import { modesService } from '../services/modes.service.js';

export class ModesV2Controller {
  async oneButtonFormat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      // Import dynamically to avoid circular dependency
      const { professionalFormattingService } = await import('../services/professional-formatting.service.js');
      const result = await professionalFormattingService.applyProfessionalFormat(id, {
        autoFreezeHeader: true,
        autoFilter: true,
        alternateRowColors: true,
        professionalFonts: true,
        professionalBorders: true,
        autoAlign: true,
        theme: 'corporate-blue',
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async detectMode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await (modesService as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>).detectRecommendedMode(id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getFeatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, mode } = req.params;
      const result = await (modesService as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>).getAvailableFeatures(mode);
      res.json({ success: true, data: { features: result } });
    } catch (error) {
      next(error);
    }
  }

  async setDetailLevel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { level } = req.body;
      const result = await (modesService as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>).selectDetailLevel(id, level);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async dragDrop(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const operation = req.body;
      const result = await (modesService as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>).dragAndDropReorder(id, operation);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const modesV2Controller = new ModesV2Controller();
