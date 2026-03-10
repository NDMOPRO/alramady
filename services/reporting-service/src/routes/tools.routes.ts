import { Router, type Request, type Response } from 'express';
import { executeReportTool } from '../services/report-ultra-engine.service.js';

const router = Router();

function statusForError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /contract violation|schema|validation/i.test(message) ? 422 : 500;
}

router.post('/execute', async (req: Request, res: Response) => {
  try {
    const result = await executeReportTool(req.body);
    res.status(result.status === 'ok' ? 200 : 400).json(result);
  } catch (error) {
    res.status(statusForError(error)).json({
      status: 'failed',
      error: error instanceof Error ? error.message : 'report tool execution failed',
    });
  }
});

export default router;
