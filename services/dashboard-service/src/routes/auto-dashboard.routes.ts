import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { autoDashboardController } from '../controllers/auto-dashboard.controller';

const router = Router();

// Feature #1: Easy mode - auto-generate from existing dataset
router.post(
  '/auto-generate',
  authMiddleware,
  autoDashboardController.generateFromDataset.bind(autoDashboardController)
);

// Feature #6: Upload Excel file and get a complete dashboard (BullMQ)
router.post(
  '/upload-and-generate',
  authMiddleware,
  autoDashboardController.uploadAndGenerate.bind(autoDashboardController)
);

// Feature #2 & #3: Analyze data and return chart/KPI recommendations
router.post(
  '/analyze-data',
  authMiddleware,
  autoDashboardController.analyzeData.bind(autoDashboardController)
);

// Job status polling
router.get(
  '/job-status/:jobId',
  authMiddleware,
  autoDashboardController.getJobStatus.bind(autoDashboardController)
);

export default router;
