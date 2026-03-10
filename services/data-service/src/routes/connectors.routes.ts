import { Router, Request, Response, NextFunction } from 'express';
import { ConnectorRegistry } from '../connectors';
import { ConnectorType } from '../connectors/connector.interface';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

const registry = new ConnectorRegistry(prisma);
const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

// List available connector types
router.get('/types', (_req: Request, res: Response) => {
  const connectors = registry.listConnectors();
  res.json({ success: true, data: connectors });
});

// List active connections for tenant
router.get('/connections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.tenantId;
    const userId = req.query.userId as string | undefined;
    const connections = await registry.listConnections(tenantId, userId);
    res.json({ success: true, data: connections });
  } catch (error) {
    next(error);
  }
});

// Get OAuth authorization URL
router.get('/auth/:type', (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.params.type! as ConnectorType;
    const tenantId = req.tenant!.tenantId;
    const userId = req.tenant!.userId;
    const authUrl = registry.getAuthUrl(type, tenantId, userId);
    res.json({ success: true, data: { authUrl } });
  } catch (error) {
    next(error);
  }
});

// OAuth callback handler
router.get('/callback/:type', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.params.type! as ConnectorType;
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state parameter' });
      return;
    }

    const result = await registry.handleCallback(type, code, state);
    logger.info('Connector callback successful', { type, connectionId: result.connectionId });

    // Redirect to frontend success page
    res.redirect(`/data/sources?connected=${type}&connectionId=${result.connectionId}`);
  } catch (error) {
    next(error);
  }
});

// Test a connection
router.post('/connections/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.tenantId;
    const connectionId = req.params.id!;

    const connection = await prisma.connectorConnection.findFirst({
      where: { id: connectionId, tenantId },
    });

    if (!connection) {
      res.status(404).json({ error: 'اتصال غير موجود' });
      return;
    }

    const connector = registry.getConnector(connection.connectorType as ConnectorType);
    const token = await registry.getValidToken(connectionId, tenantId);
    const isValid = await connector.testConnection(token);

    res.json({ success: true, data: { isValid, connectorType: connection.connectorType } });
  } catch (error) {
    next(error);
  }
});

// List files from a connection
router.get('/connections/:id/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.tenantId;
    const connectionId = req.params.id!;

    const connection = await prisma.connectorConnection.findFirst({
      where: { id: connectionId, tenantId },
    });

    if (!connection) {
      res.status(404).json({ error: 'اتصال غير موجود' });
      return;
    }

    const connector = registry.getConnector(connection.connectorType as ConnectorType);
    const token = await registry.getValidToken(connectionId, tenantId);

    const result = await connector.listFiles(token, {
      folderId: req.query.folderId as string,
      query: req.query.query as string,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
      pageToken: req.query.pageToken as string,
    });

    // Update last used timestamp
    await prisma.connectorConnection.update({
      where: { id: connectionId },
      data: { lastUsedAt: new Date() },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Import data from a connection
router.post('/connections/:id/import', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.tenantId;
    const connectionId = req.params.id!;
    const { fileId, options } = req.body;

    if (!fileId) {
      res.status(400).json({ error: 'fileId مطلوب' });
      return;
    }

    const connection = await prisma.connectorConnection.findFirst({
      where: { id: connectionId, tenantId },
    });

    if (!connection) {
      res.status(404).json({ error: 'اتصال غير موجود' });
      return;
    }

    const connector = registry.getConnector(connection.connectorType as ConnectorType);
    const token = await registry.getValidToken(connectionId, tenantId);

    const result = await connector.importData(token, fileId);

    await prisma.connectorConnection.update({
      where: { id: connectionId },
      data: { lastUsedAt: new Date() },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Download a file from a connection
router.get('/connections/:id/download/:fileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.tenantId;
    const connectionId = req.params.id!;
    const fileId = req.params.fileId!;

    const connection = await prisma.connectorConnection.findFirst({
      where: { id: connectionId, tenantId },
    });

    if (!connection) {
      res.status(404).json({ error: 'اتصال غير موجود' });
      return;
    }

    const connector = registry.getConnector(connection.connectorType as ConnectorType);
    const token = await registry.getValidToken(connectionId, tenantId);

    const buffer = await connector.downloadFile(token, fileId);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

// Revoke a connection
router.delete('/connections/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.tenantId;
    const connectionId = req.params.id!;

    await registry.revokeConnection(connectionId, tenantId);
    res.json({ success: true, message: 'تم إلغاء الاتصال بنجاح' });
  } catch (error) {
    next(error);
  }
});

export default router;
