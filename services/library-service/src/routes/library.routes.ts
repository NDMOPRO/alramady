import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  uploadAsset,
  getAsset,
  deleteAsset,
  listAssets,
  searchAssets,
  generateThumbnail,
  moveAsset,
  downloadAssetFile,
} from '../services/asset-manager.service.js';
import {
  createFolder,
  getFolderTree,
  moveFolder,
  deleteFolder,
} from '../services/folder-manager.service.js';
import winston from 'winston';

const router = Router();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'library-routes' },
  transports: [new winston.transports.Console()],
});

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600', 10),
    files: 1,
  },
});

function extractTenantId(req: Request): string {
  const tenantId =
    (req.headers['x-tenant-id'] as string) ||
    (req.query.tenantId as string);
  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }
  return tenantId;
}

function extractUserId(req: Request): string {
  const userId =
    (req.headers['x-user-id'] as string) ||
    (req.query.userId as string);
  if (!userId) {
    throw new Error('User ID is required');
  }
  return userId;
}

// POST /assets - Upload an asset
router.post(
  '/assets',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);
      const userId = extractUserId(req);

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file provided in the request',
        });
        return;
      }

      const metadata = {
        description: req.body.description || undefined,
        tags: req.body.tags
          ? Array.isArray(req.body.tags)
            ? req.body.tags
            : req.body.tags.split(',').map((t: string) => t.trim())
          : undefined,
      };

      const result = await uploadAsset(
        req.file.buffer,
        req.file.originalname,
        metadata,
        tenantId,
        userId
      );

      logger.info('Asset uploaded via API', { assetId: result.id });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /assets - List assets with filters and pagination
router.get(
  '/assets',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);

      const filters = {
        type: req.query.type as string | undefined,
        search: req.query.search as string | undefined,
        folderId: req.query.folderId as string | undefined,
      };

      const pagination = {
        page: parseInt(req.query.page as string, 10) || 1,
        limit: parseInt(req.query.limit as string, 10) || 20,
      };

      const result = await listAssets(tenantId, filters, pagination);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /assets/search - Search assets
router.get(
  '/assets/search',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);
      const query = req.query.q as string;

      if (!query || query.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Search query parameter "q" is required',
        });
        return;
      }

      const result = await searchAssets(query, tenantId);

      res.status(200).json({
        success: true,
        data: result.results,
        query: result.query,
        totalResults: result.totalResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /assets/:id - Get a single asset
router.get(
  '/assets/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assetId = req.params.id;

      if (!assetId) {
        res.status(400).json({
          success: false,
          error: 'Asset ID is required',
        });
        return;
      }

      const result = await getAsset(assetId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /assets/:id/download - Stream the real asset payload through library-service
router.get(
  '/assets/:id/download',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assetId = req.params.id;
      const tenantId = extractTenantId(req);

      if (!assetId) {
        res.status(400).json({
          success: false,
          error: 'Asset ID is required',
        });
        return;
      }

      const result = await downloadAssetFile(assetId, tenantId);

      res.setHeader('Content-Type', result.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', String(result.fileSize));
      res.setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(result.name)}`
      );

      result.stream.on('error', next);
      result.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /assets/:id - Delete an asset
router.delete(
  '/assets/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assetId = req.params.id;
      const userId = extractUserId(req);

      if (!assetId) {
        res.status(400).json({
          success: false,
          error: 'Asset ID is required',
        });
        return;
      }

      const result = await deleteAsset(assetId, userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /assets/:id/move - Move an asset to a different folder
router.put(
  '/assets/:id/move',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assetId = req.params.id;
      const { folderId } = req.body;

      if (!assetId) {
        res.status(400).json({
          success: false,
          error: 'Asset ID is required',
        });
        return;
      }

      if (!folderId) {
        res.status(400).json({
          success: false,
          error: 'Target folder ID is required in request body',
        });
        return;
      }

      const result = await moveAsset(assetId, folderId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /assets/:id/thumbnail - Generate thumbnail for an asset
router.post(
  '/assets/:id/thumbnail',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assetId = req.params.id;
      const size = parseInt(req.body.size as string, 10) || 200;

      if (!assetId) {
        res.status(400).json({
          success: false,
          error: 'Asset ID is required',
        });
        return;
      }

      const asset = await getAsset(assetId);

      if (!asset.mimeType.startsWith('image/')) {
        res.status(400).json({
          success: false,
          error: 'Thumbnails can only be generated for image assets',
        });
        return;
      }

      const https = await import('https');
      const http = await import('http');

      const fileBuffer = await new Promise<Buffer>((resolve, reject) => {
        const protocol = asset.downloadUrl.startsWith('https') ? https : http;
        protocol.get(asset.downloadUrl, (response: { on: (event: string, cb: (data: Buffer) => void) => void }) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        });
      });

      const thumbnailBuffer = await generateThumbnail(fileBuffer, size);

      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(thumbnailBuffer.length));
      res.set('Cache-Control', 'public, max-age=3600');
      res.status(200).send(thumbnailBuffer);
    } catch (error) {
      next(error);
    }
  }
);

// POST /folders - Create a new folder
router.post(
  '/folders',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);
      const userId = extractUserId(req);
      const { name, parentId } = req.body;

      if (!name || name.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Folder name is required',
        });
        return;
      }

      const result = await createFolder(
        name,
        parentId || null,
        tenantId,
        userId
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /folders/tree - Get folder hierarchy tree
router.get(
  '/folders/tree',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);
      const tree = await getFolderTree(tenantId);

      res.status(200).json({
        success: true,
        data: tree,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /folders/:id/move - Move a folder
router.put(
  '/folders/:id/move',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const folderId = req.params.id;
      const { newParentId } = req.body;

      if (!folderId) {
        res.status(400).json({
          success: false,
          error: 'Folder ID is required',
        });
        return;
      }

      const result = await moveFolder(folderId, newParentId || null);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /folders/:id - Delete a folder
router.delete(
  '/folders/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const folderId = req.params.id;

      if (!folderId) {
        res.status(400).json({
          success: false,
          error: 'Folder ID is required',
        });
        return;
      }

      const result = await deleteFolder(folderId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
