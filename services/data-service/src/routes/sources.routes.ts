import { Router } from 'express';
import { sourcesController } from '../controllers/sources.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);

router.get('/', (req, res, next) => sourcesController.list(req, res, next));
router.get('/search', (req, res, next) => sourcesController.search(req, res, next));
router.get('/:id', (req, res, next) => sourcesController.get(req, res, next));
router.get('/:id/rows', (req, res, next) => sourcesController.getRows(req, res, next));
router.get('/:id/statistics', (req, res, next) => sourcesController.statistics(req, res, next));
router.get('/:id/export/csv', (req, res, next) => sourcesController.exportCSV(req, res, next));
router.get('/:id/export/excel', (req, res, next) => sourcesController.exportExcel(req, res, next));
router.get('/:id/export/json', (req, res, next) => sourcesController.exportJSON(req, res, next));
router.delete('/:id', (req, res, next) => sourcesController.delete(req, res, next));

export default router;
