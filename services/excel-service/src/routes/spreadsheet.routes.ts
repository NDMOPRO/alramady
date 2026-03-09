import { Router } from 'express';
import multer from 'multer';
import { spreadsheetController } from '../controllers/spreadsheet.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.use(authMiddleware);

router.get('/', (req, res, next) => spreadsheetController.list(req, res, next));
router.post('/', (req, res, next) => spreadsheetController.create(req, res, next));
router.post('/upload', upload.single('file'), (req, res, next) => spreadsheetController.open(req, res, next));
router.get('/:id/cell', (req, res, next) => spreadsheetController.getCell(req, res, next));
router.put('/:id/cell', (req, res, next) => spreadsheetController.setCell(req, res, next));
router.post('/:id/formula', (req, res, next) => spreadsheetController.evaluateFormula(req, res, next));
router.post('/:id/evaluate-all', (req, res, next) => spreadsheetController.evaluateAll(req, res, next));
router.post('/:id/sheets', (req, res, next) => spreadsheetController.addSheet(req, res, next));
router.delete('/:id/sheets/:sheetIndex', (req, res, next) => spreadsheetController.deleteSheet(req, res, next));
router.get('/:id/export', (req, res, next) => spreadsheetController.exportWorkbook(req, res, next));
router.put('/:id/format', (req, res, next) => spreadsheetController.formatCells(req, res, next));

export default router;
