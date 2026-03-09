import { Router, Request, Response } from 'express';
import { SmartObserverService } from '../services/smart-observer.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const observerService = new SmartObserverService();

// POST /observer/command — Process a natural language command
router.post('/command', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.tenantId || !user?.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const { query, sessionId } = req.body;

    if (!query?.trim()) {
      res.status(400).json({ success: false, error: 'Query is required' });
      return;
    }

    const result = await observerService.processCommand(
      query.trim(),
      user.tenantId,
      user.userId,
      sessionId,
    );

    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /observer/sessions — List user sessions
router.get('/sessions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.tenantId || !user?.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const sessions = await observerService.listSessions(user.tenantId, user.userId);
    res.json({ success: true, data: sessions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /observer/sessions/:id/history — Get session history
router.get('/sessions/:id/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const history = await observerService.getSessionHistory(req.params.id, user.userId);
    res.json({ success: true, data: history });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
