import { Request, Response, NextFunction } from 'express';
import { professionalFormattingService } from '../services/professional-formatting.service.js';
import { culturalFormattingService } from '../services/cultural-formatting.service.js';
import { documentStructureService } from '../services/document-structure.service.js';

export class ProfessionalFormattingController {
  async oneButtonFormat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const options = req.body;
      const result = await professionalFormattingService.applyProfessionalFormat(id, options);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async applyTheme(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { theme } = req.body;
      const result = await professionalFormattingService.applyTheme(id, theme);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async applyBrand(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const brand = req.body;
      const result = await professionalFormattingService.applyBrandIdentity(id, brand);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async applyCultural(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { sheet, range, locale, type } = req.body;

      let result;
      switch (type) {
        case 'date':
          result = await culturalFormattingService.applyCulturalDateFormat(id, sheet, range, locale);
          break;
        case 'currency':
          result = await culturalFormattingService.applyCulturalCurrencyFormat(id, sheet, range, locale);
          break;
        case 'number':
          result = await culturalFormattingService.applyCulturalNumberFormat(id, sheet, range, locale);
          break;
        default:
          result = await culturalFormattingService.applyCulturalDateFormat(id, sheet, range, locale);
      }

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async applyRTL(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { sheet } = req.body;
      const result = await culturalFormattingService.applyRTLLayout(id, sheet);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async generateCoverPage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const config = req.body;
      const result = await documentStructureService.generateCoverPage(id, config);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async generateSummaryPage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await documentStructureService.generateSummaryPage(id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async generateIndexPage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await documentStructureService.generateIndexPage(id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async convertToTable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { sheet, range, tableName } = req.body;
      const result = await professionalFormattingService.convertRangeToTable(id, sheet, range, tableName);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async accessibilityCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await professionalFormattingService.checkAccessibility(id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async designValidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const constraints = req.body;
      const result = await professionalFormattingService.validateDesignConstraints(id, constraints);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async extractCF(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, sheet } = req.params;
      const result = await professionalFormattingService.extractConditionalFormatting(id, sheet);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async replicateCF(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { targetId } = req.body;
      const result = await professionalFormattingService.replicateConditionalFormatting(id, targetId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async renameSheet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await documentStructureService.smartRenameSheets(id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async reorderSheets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { order } = req.body;
      const result = await documentStructureService.reorderSheets(id, order);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async applyWatermark(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { text } = req.body;
      const result = await professionalFormattingService.applyWatermark(id, text);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async exportTheme(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await professionalFormattingService.exportTheme(id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async importTheme(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const theme = req.body;
      const result = await professionalFormattingService.importTheme(id, theme);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const professionalFormattingController = new ProfessionalFormattingController();
