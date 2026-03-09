import { Request, Response, NextFunction } from 'express';
import { formulaRegistry } from '../utils/formula-registry.js';
import { formulaIntelligenceService } from '../services/formula-intelligence.service.js';
import { formulaWorkersService } from '../services/formula-workers.service.js';
import { aiIntegrationService } from '../services/ai-integration.service.js';
import { conversionService } from '../services/conversion.service.js';

export class FormulaV2Controller {
  async callFunction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.params;
      const { args, context } = req.body;
      const fn = formulaRegistry.get(name);

      if (!fn) {
        res.status(404).json({ success: false, error: `Function ${name} not found` });
        return;
      }

      const cellValues = new Map(Object.entries(context || {}));
      const result = fn.execute(args || [], { cellValues });

      res.json({ success: true, data: { function: name, result } });
    } catch (error) {
      next(error);
    }
  }

  async listFunctions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const functions = formulaRegistry.toJSON();
      res.json({
        success: true,
        data: { functions, total: functions.length },
      });
    } catch (error) {
      next(error);
    }
  }

  async evaluateBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { formulas } = req.body;
      const results = await formulaWorkersService.evaluateBatch(formulas);
      res.json({ success: true, data: { results } });
    } catch (error) {
      next(error);
    }
  }

  async optimizeFormulas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, sheet } = req.params;
      const optimizations = await formulaIntelligenceService.optimizeFormulas(id, sheet);
      res.json({ success: true, data: { optimizations } });
    } catch (error) {
      next(error);
    }
  }

  async detectErrors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, sheet } = req.params;
      const errors = await formulaIntelligenceService.detectFormulaErrors(id, sheet);
      res.json({ success: true, data: { errors } });
    } catch (error) {
      next(error);
    }
  }

  async extractBusinessLogic(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { sheet } = req.body;
      const model = await formulaIntelligenceService.extractBusinessLogic(id, sheet || 'Sheet1');
      res.json({ success: true, data: { model } });
    } catch (error) {
      next(error);
    }
  }

  async nlToFormula(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text, context } = req.body;
      const result = await aiIntegrationService.naturalLanguageToFormula(text, context);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async formulaToNl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { formula, locale } = req.body;
      const result = await aiIntegrationService.formulaToNaturalLanguage(formula, locale);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async generateDAX(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { formula, context } = req.body;
      const result = await aiIntegrationService.generateDAX(formula, context);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async generateLookML(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { structure } = req.body;
      const result = await aiIntegrationService.generateLookML(structure);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async convertDate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { value, fromFormat, toFormat, calendar } = req.body;
      const result = conversionService.convertDateFormat(value, fromFormat, toFormat, calendar);
      res.json({ success: true, data: { result } });
    } catch (error) {
      next(error);
    }
  }

  async convertCurrency(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { amount, from, to, rate } = req.body;
      const result = conversionService.convertCurrency(amount, from, to, rate);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const formulaV2Controller = new FormulaV2Controller();
