import { Router, type Request, type Response } from 'express';
import { executeSlidesTool } from '../services/gamma-engine.service.js';

const router = Router();

function statusForError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /contract violation|schema|validation/i.test(message) ? 422 : 500;
}

router.post('/execute', async (req: Request, res: Response) => {
  try {
    const result = await executeSlidesTool(req.body);
    res.status(result.status === 'ok' ? 200 : 400).json(result);
  } catch (error) {
    res.status(statusForError(error)).json({
      status: 'failed',
      error: error instanceof Error ? error.message : 'presentation tool execution failed',
    });
  }
});

export default router;
