import { Router } from 'express';
import multer from 'multer';
import { importController } from '../controllers/import.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// GET /import — list import history
router.get('/', (req, res, next) => importController.listImports(req, res, next));

// GET /import/:id — get import status
router.get('/:id', (req, res, next) => importController.getImportStatus(req, res, next));

// POST /import/single — import single file (all types)
router.post('/single', upload.single('file'), (req, res, next) => importController.importFile(req, res, next));

// POST /import/batch — import multiple files
router.post('/batch', upload.array('files', 100), (req, res, next) => importController.batchImport(req, res, next));

// POST /import/url — import from URL
router.post('/url', (req, res, next) => importController.importFromURL(req, res, next));

// POST /import/preview — preview file structure before import
router.post('/preview', upload.single('file'), (req, res, next) => importController.previewFile(req, res, next));

export default router;
