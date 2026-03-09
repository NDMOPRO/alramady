import { Request, Response, NextFunction } from 'express';
import { cleansingService } from '../services/cleansing.service';

export class CleansingController {
  async removeDuplicates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { columns, threshold } = req.body;
      if (!columns || !Array.isArray(columns) || columns.length === 0) {
        res.status(400).json({ error: 'columns array is required' });
        return;
      }
      const result = await cleansingService.removeDuplicates(req.params.id, columns, threshold);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async handleMissing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { column, strategy } = req.body;
      if (!column || !strategy) { res.status(400).json({ error: 'column and strategy required' }); return; }
      const validStrategies = ['mean', 'median', 'mode', 'forward', 'backward', 'drop', 'interpolate'];
      if (!validStrategies.includes(strategy)) { res.status(400).json({ error: `Invalid strategy. Use: ${validStrategies.join(', ')}` }); return; }
      const result = await cleansingService.handleMissing(req.params.id, column, strategy);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async normalize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { column, method } = req.body;
      if (!column || !method) { res.status(400).json({ error: 'column and method required' }); return; }
      const result = await cleansingService.normalizeValues(req.params.id, column, method);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async detectOutliers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { column, method } = req.body;
      if (!column) { res.status(400).json({ error: 'column required' }); return; }
      const result = await cleansingService.detectOutliers(req.params.id, column, method);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async validateTypes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await cleansingService.validateDataTypes(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async trimWhitespace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await cleansingService.trimWhitespace(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }
}

export const cleansingController = new CleansingController();
