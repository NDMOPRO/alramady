import { Request, Response, NextFunction } from 'express';
import { excelMatchingService } from '../services/excel-matching.service.js';
import { fingerprintService } from '../services/fingerprint.service.js';

export class ExcelMatchingController {
  async extractDimensions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const dimensions = await excelMatchingService.extractDimensions(id);
      res.json({ success: true, data: { dimensions } });
    } catch (error) {
      next(error);
    }
  }

  async extractStructure(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const structure = await excelMatchingService.extractStructure(id);
      res.json({ success: true, data: { structure } });
    } catch (error) {
      next(error);
    }
  }

  async getFingerprint(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const fingerprint = await fingerprintService.generateFingerprint(id);
      res.json({ success: true, data: { fingerprint } });
    } catch (error) {
      next(error);
    }
  }

  async compareWorkbooks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sourceId, targetId } = req.body;
      const report = await excelMatchingService.compareAndScore(sourceId, targetId);
      res.json({ success: true, data: { report } });
    } catch (error) {
      next(error);
    }
  }

  async matchScore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sourceId, targetId } = req.body;
      const fp1 = await fingerprintService.generateFingerprint(sourceId);
      const fp2 = await fingerprintService.generateFingerprint(targetId);
      const comparison = fingerprintService.compareFingerprints(fp1, fp2);
      res.json({ success: true, data: comparison });
    } catch (error) {
      next(error);
    }
  }

  async replicateWorkbook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sourceId } = req.body;
      const result = await excelMatchingService.replicateWorkbook(sourceId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async brandCompliance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workbookId, brand } = req.body;
      const result = await fingerprintService.verifyBrandCompliance(workbookId, brand);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const excelMatchingController = new ExcelMatchingController();
