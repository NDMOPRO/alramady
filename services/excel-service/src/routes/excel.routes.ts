import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { spreadsheetEngineService } from '../services/spreadsheet-engine.service';
import { formulaEngineService } from '../services/formula-engine.service';
import { formattingService } from '../services/formatting.service';
import { advancedOperationsService } from '../services/advanced-operations.service';
import { logger } from '../utils/logger';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
});

// --- Zod schemas ---

const createWorkbookSchema = z.object({
  name: z.string().min(1).max(255),
  sheets: z.array(z.object({
    name: z.string().min(1).max(64),
    data: z.array(z.array(z.any())).optional(),
  })).min(1),
  tenantId: z.string().min(1),
});

const addSheetSchema = z.object({
  name: z.string().min(1).max(64),
  data: z.array(z.array(z.any())).optional(),
});

const setCellSchema = z.object({
  value: z.any(),
  formula: z.string().optional(),
});

const rangeQuerySchema = z.object({
  startRow: z.coerce.number().int().positive(),
  startCol: z.coerce.number().int().positive(),
  endRow: z.coerce.number().int().positive(),
  endCol: z.coerce.number().int().positive(),
});

const mergeSchema = z.object({
  startRow: z.number().int().positive(),
  startCol: z.number().int().positive(),
  endRow: z.number().int().positive(),
  endCol: z.number().int().positive(),
});

const freezeSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
});

const parseFormulaSchema = z.object({
  formula: z.string().min(1),
});

const evaluateFormulaSchema = z.object({
  formula: z.string().min(1),
  cellContext: z.record(z.any()),
});

const recalculateSchema = z.object({
  row: z.number().int().positive(),
  col: z.number().int().positive(),
});

const numberFormatSchema = z.object({
  sheet: z.number().int().positive(),
  range: z.string().min(1),
  format: z.object({
    numFmt: z.string().optional(),
    dateFormat: z.string().optional(),
  }),
});

const styleSchema = z.object({
  sheet: z.number().int().positive(),
  range: z.string().min(1),
  style: z.object({
    font: z.any().optional(),
    fill: z.any().optional(),
    border: z.any().optional(),
    alignment: z.any().optional(),
  }),
});

const conditionalFormatSchema = z.object({
  sheet: z.number().int().positive(),
  range: z.string().min(1),
  rules: z.array(z.object({
    type: z.string(),
    operator: z.string(),
    value: z.any(),
    style: z.any(),
  })),
});

const validationSchema = z.object({
  sheet: z.number().int().positive(),
  range: z.string().min(1),
  validation: z.object({
    type: z.string(),
    values: z.array(z.string()).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
});

const chartSchema = z.object({
  sheet: z.number().int().positive(),
  chartConfig: z.any(),
});

const pageSetupSchema = z.object({
  sheet: z.number().int().positive(),
  setup: z.object({
    orientation: z.string().optional(),
    paperSize: z.number().optional(),
    margins: z.any().optional(),
  }),
});

const pivotSchema = z.object({
  sourceSheet: z.number().int().positive(),
  config: z.object({
    rowFields: z.array(z.string()).min(1),
    colField: z.string().min(1),
    valueField: z.string().min(1),
    aggFunc: z.string().min(1),
  }),
});

const sortSchema = z.object({
  sheet: z.number().int().positive(),
  range: z.string().min(1),
  sortColumns: z.array(z.object({
    column: z.number().int().positive(),
    order: z.enum(['asc', 'desc']),
  })).min(1),
});

const filterSchema = z.object({
  sheet: z.number().int().positive(),
  range: z.string().min(1),
  filters: z.record(z.array(z.any())),
});

const findReplaceSchema = z.object({
  find: z.string().min(1),
  replace: z.string(),
  options: z.object({
    matchCase: z.boolean().optional(),
    wholeWord: z.boolean().optional(),
    regex: z.boolean().optional(),
  }).optional(),
});

const protectSchema = z.object({
  sheet: z.number().int().positive(),
  password: z.string().min(1),
  permissions: z.object({
    selectLockedCells: z.boolean().optional(),
    selectUnlockedCells: z.boolean().optional(),
  }).optional(),
});

const compareSchema = z.object({
  id1: z.string().min(1),
  id2: z.string().min(1),
});

// --- Helper for async route handlers ---

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ============================================================================
// WORKBOOK ROUTES
// ============================================================================

router.post(
  '/workbooks',
  authMiddleware,
  validate(createWorkbookSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, sheets, tenantId } = req.body;
    const userId = req.user?.userId || 'anonymous';
    const result = await spreadsheetEngineService.createWorkbook(name, sheets, tenantId, userId);
    logger.info('Workbook created via API', { workbookId: result.workbookId });
    res.status(201).json({
      success: true,
      data: { workbookId: result.workbookId, size: result.buffer.length },
    });
  })
);

router.post(
  '/workbooks/open',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }
    const tenantId = req.body.tenantId || req.user?.organizationId || 'default';
    const userId = req.user?.userId || 'anonymous';
    const result = await spreadsheetEngineService.openWorkbook(
      req.file.buffer,
      req.file.originalname,
      tenantId,
      userId
    );
    logger.info('Workbook opened via API', { workbookId: result.workbookId });
    res.status(200).json({ success: true, data: result });
  })
);

router.get(
  '/workbooks/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const buffer = await spreadsheetEngineService.saveWorkbook(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="workbook-${id}.xlsx"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.status(200).send(buffer);
  })
);

router.put(
  '/workbooks/:id/save',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const buffer = await spreadsheetEngineService.saveWorkbook(id);
    res.status(200).json({
      success: true,
      data: { workbookId: id, size: buffer.length, savedAt: new Date().toISOString() },
    });
  })
);

// ============================================================================
// SHEET ROUTES
// ============================================================================

router.post(
  '/workbooks/:id/sheets',
  authMiddleware,
  validate(addSheetSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, data } = req.body;
    const result = await spreadsheetEngineService.addSheet(id, name, data);
    res.status(201).json({ success: true, data: result });
  })
);

router.delete(
  '/workbooks/:id/sheets/:sheetIndex',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id, sheetIndex } = req.params;
    const result = await spreadsheetEngineService.deleteSheet(id, parseInt(sheetIndex, 10));
    res.status(200).json({ success: true, data: result });
  })
);

// ============================================================================
// CELL ROUTES
// ============================================================================

router.get(
  '/workbooks/:id/cells/:sheet/:row/:col',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id, sheet, row, col } = req.params;
    const result = await spreadsheetEngineService.getCell(
      id,
      parseInt(sheet, 10),
      parseInt(row, 10),
      parseInt(col, 10)
    );
    res.status(200).json({ success: true, data: result });
  })
);

router.put(
  '/workbooks/:id/cells/:sheet/:row/:col',
  authMiddleware,
  validate(setCellSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id, sheet, row, col } = req.params;
    const { value, formula } = req.body;
    const result = await spreadsheetEngineService.setCell(
      id,
      parseInt(sheet, 10),
      parseInt(row, 10),
      parseInt(col, 10),
      value,
      formula
    );
    res.status(200).json({ success: true, data: result });
  })
);

router.get(
  '/workbooks/:id/range/:sheet',
  authMiddleware,
  validate(rangeQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id, sheet } = req.params;
    const { startRow, startCol, endRow, endCol } = req.query as Record<string, string | undefined>;
    const result = await spreadsheetEngineService.getCellRange(
      id,
      parseInt(sheet, 10),
      parseInt(startRow, 10),
      parseInt(startCol, 10),
      parseInt(endRow, 10),
      parseInt(endCol, 10)
    );
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/workbooks/:id/merge/:sheet',
  authMiddleware,
  validate(mergeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id, sheet } = req.params;
    const { startRow, startCol, endRow, endCol } = req.body;
    const result = await spreadsheetEngineService.mergeCells(
      id,
      parseInt(sheet, 10),
      startRow,
      startCol,
      endRow,
      endCol
    );
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/workbooks/:id/autofit/:sheet',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id, sheet } = req.params;
    const result = await spreadsheetEngineService.autoFitColumns(id, parseInt(sheet, 10));
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/workbooks/:id/freeze/:sheet',
  authMiddleware,
  validate(freezeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id, sheet } = req.params;
    const { row, col } = req.body;
    const result = await spreadsheetEngineService.freezePanes(id, parseInt(sheet, 10), row, col);
    res.status(200).json({ success: true, data: result });
  })
);

// ============================================================================
// FORMULA ROUTES
// ============================================================================

router.post(
  '/formulas/parse',
  authMiddleware,
  validate(parseFormulaSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { formula } = req.body;
    const result = formulaEngineService.parseFormula(formula);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/formulas/evaluate',
  authMiddleware,
  validate(evaluateFormulaSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { formula, cellContext } = req.body;
    const contextMap = new Map<string, unknown>(Object.entries(cellContext));
    const result = formulaEngineService.evaluateFormula(formula, contextMap);
    res.status(200).json({ success: true, data: result });
  })
);

router.get(
  '/formulas/dependencies/:id/:sheet',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id, sheet } = req.params;
    const graph = await formulaEngineService.buildDependencyGraph(id, parseInt(sheet, 10));
    const graphObj: Record<string, unknown> = {};
    for (const [key, node] of graph) {
      graphObj[key] = {
        cell: node.cell,
        dependsOn: node.dependsOn,
        dependedBy: node.dependedBy,
        formula: node.formula,
      };
    }
    res.status(200).json({ success: true, data: { nodeCount: graph.size, graph: graphObj } });
  })
);

router.post(
  '/formulas/recalculate/:id/:sheet',
  authMiddleware,
  validate(recalculateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id, sheet } = req.params;
    const { row, col } = req.body;
    const result = await formulaEngineService.recalculate(id, parseInt(sheet, 10), { row, col });
    res.status(200).json({ success: true, data: { changes: result, changeCount: result.length } });
  })
);

router.get(
  '/formulas/circular/:id/:sheet',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id, sheet } = req.params;
    const result = await formulaEngineService.detectCircularReference(id, parseInt(sheet, 10));
    res.status(200).json({ success: true, data: result });
  })
);

// ============================================================================
// FORMATTING ROUTES
// ============================================================================

router.put(
  '/format/:id/number',
  authMiddleware,
  validate(numberFormatSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sheet, range, format } = req.body;
    const result = await formattingService.setCellFormat(id, sheet, range, format);
    res.status(200).json({ success: true, data: result });
  })
);

router.put(
  '/format/:id/style',
  authMiddleware,
  validate(styleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sheet, range, style } = req.body;
    const result = await formattingService.setCellStyle(id, sheet, range, style);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/format/:id/conditional',
  authMiddleware,
  validate(conditionalFormatSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sheet, range, rules } = req.body;
    const result = await formattingService.setConditionalFormat(id, sheet, range, rules);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/format/:id/validation',
  authMiddleware,
  validate(validationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sheet, range, validation } = req.body;
    const result = await formattingService.setDataValidation(id, sheet, range, validation);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/format/:id/chart',
  authMiddleware,
  validate(chartSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sheet, chartConfig } = req.body;
    const result = await formattingService.addChart(id, sheet, chartConfig);
    res.status(200).json({ success: true, data: result });
  })
);

router.put(
  '/format/:id/page-setup',
  authMiddleware,
  validate(pageSetupSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sheet, setup } = req.body;
    const result = await formattingService.setPageSetup(id, sheet, setup);
    res.status(200).json({ success: true, data: result });
  })
);

// ============================================================================
// ADVANCED OPERATIONS ROUTES
// ============================================================================

router.post(
  '/advanced/:id/pivot',
  authMiddleware,
  validate(pivotSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sourceSheet, config } = req.body;
    const result = await advancedOperationsService.pivotTable(id, sourceSheet, config);
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/advanced/:id/sort',
  authMiddleware,
  validate(sortSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sheet, range, sortColumns } = req.body;
    const result = await advancedOperationsService.sortRange(id, sheet, range, sortColumns);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/advanced/:id/filter',
  authMiddleware,
  validate(filterSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sheet, range, filters } = req.body;
    const result = await advancedOperationsService.filterRange(id, sheet, range, filters);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/advanced/:id/find-replace',
  authMiddleware,
  validate(findReplaceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { find, replace, options } = req.body;
    const result = await advancedOperationsService.findReplace(id, find, replace, options || {});
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/advanced/:id/protect',
  authMiddleware,
  validate(protectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sheet, password, permissions } = req.body;
    const result = await advancedOperationsService.protectSheet(id, sheet, password, permissions || {});
    res.status(200).json({ success: true, data: result });
  })
);

router.get(
  '/advanced/compare',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const id1 = req.query.id1 as string;
    const id2 = req.query.id2 as string;
    if (!id1 || !id2) {
      res.status(400).json({ success: false, error: 'Both id1 and id2 query parameters are required' });
      return;
    }
    const result = await advancedOperationsService.compareWorkbooks(id1, id2);
    res.status(200).json({ success: true, data: result });
  })
);

export default router;
