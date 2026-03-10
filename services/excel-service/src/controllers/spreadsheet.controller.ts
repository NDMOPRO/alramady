import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { spreadsheetService } from '../services/spreadsheet.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

export class SpreadsheetController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const { name, sheets } = req.body;
      if (!name) { res.status(400).json({ error: 'Name is required' }); return; }
      const result = await spreadsheetService.createWorkbook(name, tenantId, userId, sheets);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async open(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const result = await spreadsheetService.openWorkbook(file.buffer, file.originalname, tenantId, userId);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId as string;
      const { page, limit, search } = req.query;
      const result = await spreadsheetService.listWorkbooks(tenantId, {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        search: search as string,
      });
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  }

  async getCell(req: Request, res: Response, next: NextFunction) {
    try {
      const { sheet, row, col } = req.query;
      const result = await spreadsheetService.getCell(req.params.id!, sheet as string, Number(row), Number(col));
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async setCell(req: Request, res: Response, next: NextFunction) {
    try {
      const { sheet, row, col, value, formula } = req.body;
      const result = await spreadsheetService.setCell(req.params.id!, sheet, Number(row), Number(col), value, formula);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async evaluateFormula(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { formula } = req.body;
      if (!formula) { res.status(400).json({ error: 'Formula is required' }); return; }
      const result = spreadsheetService.evaluateFormula(formula);
      res.json({ success: true, data: { formula, result } });
    } catch (error) { next(error); }
  }

  async evaluateAll(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await spreadsheetService.evaluateAllFormulas(req.params.id!);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async addSheet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'Sheet name is required' }); return; }
      const result = await spreadsheetService.addSheet(req.params.id!, name);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async deleteSheet(req: Request, res: Response, next: NextFunction) {
    try {
      const { sheetIndex } = req.params;
      const result = await spreadsheetService.deleteSheet(req.params.id!, Number(sheetIndex));
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async exportWorkbook(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await spreadsheetService.exportWorkbook(req.params.id!);
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (error) { next(error); }
  }

  async formatCells(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sheet, range, style } = req.body;
      if (!sheet || !range) { res.status(400).json({ error: 'Sheet and range are required' }); return; }
      const result = await spreadsheetService.formatCells(req.params.id!, sheet, range, style || {});
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  getUploadMiddleware() {
    return upload.single('file');
  }
}

export const spreadsheetController = new SpreadsheetController();
