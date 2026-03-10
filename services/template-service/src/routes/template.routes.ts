import { Router, Request, Response, NextFunction } from 'express';
import {
  createTemplate,
  renderTemplate,
  previewTemplate,
  listTemplates,
  duplicateTemplate,
  createFromExisting,
  addVariable,
  validateTemplate,
  getGallery,
  rateTemplate,
} from '../services/template-manager.service.js';
import { PrismaClient } from '@prisma/client';
import winston from 'winston';

const router = Router();
const prisma = new PrismaClient();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'template-routes' },
  transports: [new winston.transports.Console()],
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

// POST /templates - Create a new template
router.post(
  '/templates',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);
      const userId = extractUserId(req);
      const { name, type, engine, content, variables, category } = req.body;

      if (!name || !type || !engine || !content) {
        res.status(400).json({
          success: false,
          error: 'Name, type, engine, and content are required fields',
        });
        return;
      }

      const result = await createTemplate(
        name,
        type,
        engine,
        content,
        variables || [],
        category || 'general',
        tenantId,
        userId
      );

      logger.info('Template created via API', { templateId: result.id });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /templates/gallery - Get template gallery (must be before /:id)
router.get(
  '/templates/gallery',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);
      const type = req.query.type as string | undefined;
      const category = req.query.category as string | undefined;

      const result = await getGallery(tenantId, type, category);

      res.status(200).json({
        success: true,
        data: result.templates,
        stats: result.stats,
        availableCategories: result.availableCategories,
        availableTypes: result.availableTypes,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /templates - List templates with filters
router.get(
  '/templates',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);
      const type = req.query.type as string | undefined;
      const category = req.query.category as string | undefined;

      const pagination = {
        page: parseInt(req.query.page as string, 10) || 1,
        limit: parseInt(req.query.limit as string, 10) || 20,
      };

      const result = await listTemplates(tenantId, type, category, pagination);

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

// GET /templates/:id - Get a single template
router.get(
  '/templates/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templateId = req.params.id!;

      if (!templateId) {
        res.status(400).json({
          success: false,
          error: 'Template ID is required',
        });
        return;
      }

      const template = await prisma.template.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        res.status(404).json({
          success: false,
          error: `Template not found with id: ${templateId}`,
        });
        return;
      }

      if (template.deletedAt) {
        res.status(410).json({
          success: false,
          error: 'Template has been deleted',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /templates/:id - Update a template
router.put(
  '/templates/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templateId = req.params.id!;
      const { name, content, variables, category, isPublished } = req.body;

      if (!templateId) {
        res.status(400).json({
          success: false,
          error: 'Template ID is required',
        });
        return;
      }

      const existingTemplate = await prisma.template.findUnique({
        where: { id: templateId },
      });

      if (!existingTemplate) {
        res.status(404).json({
          success: false,
          error: `Template not found with id: ${templateId}`,
        });
        return;
      }

      if (existingTemplate.deletedAt) {
        res.status(410).json({
          success: false,
          error: 'Cannot update a deleted template',
        });
        return;
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (name !== undefined) updateData.name = name;
      if (content !== undefined) updateData.content = content;
      if (variables !== undefined) updateData.variables = variables;
      if (category !== undefined) updateData.category = category;
      if (isPublished !== undefined) updateData.isPublished = isPublished;

      if (content !== undefined) {
        updateData.version = (existingTemplate.version || 1) + 1;
      }

      const updatedTemplate = await prisma.template.update({
        where: { id: templateId },
        data: updateData,
      });

      logger.info('Template updated via API', {
        templateId,
        fieldsUpdated: Object.keys(updateData).filter((k) => k !== 'updatedAt'),
      });

      res.status(200).json({
        success: true,
        data: updatedTemplate,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /templates/:id - Delete a template (soft delete)
router.delete(
  '/templates/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templateId = req.params.id!;

      if (!templateId) {
        res.status(400).json({
          success: false,
          error: 'Template ID is required',
        });
        return;
      }

      const template = await prisma.template.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        res.status(404).json({
          success: false,
          error: `Template not found with id: ${templateId}`,
        });
        return;
      }

      if (template.deletedAt) {
        res.status(410).json({
          success: false,
          error: 'Template is already deleted',
        });
        return;
      }

      const deletedTemplate = await prisma.template.update({
        where: { id: templateId },
        data: {
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info('Template deleted via API', { templateId });

      res.status(200).json({
        success: true,
        data: {
          id: deletedTemplate.id,
          name: deletedTemplate.name,
          deletedAt: deletedTemplate.deletedAt,
          message: 'Template successfully deleted',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /templates/:id/render - Render a template with data
router.post(
  '/templates/:id/render',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templateId = req.params.id!;
      const { data } = req.body;

      if (!templateId) {
        res.status(400).json({
          success: false,
          error: 'Template ID is required',
        });
        return;
      }

      if (!data || typeof data !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Data object is required in request body',
        });
        return;
      }

      const result = await renderTemplate(templateId, data);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /templates/:id/preview - Preview a template
router.post(
  '/templates/:id/preview',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templateId = req.params.id!;
      const { previewData } = req.body;

      if (!templateId) {
        res.status(400).json({
          success: false,
          error: 'Template ID is required',
        });
        return;
      }

      const result = await previewTemplate(templateId, previewData);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /templates/:id/duplicate - Duplicate a template
router.post(
  '/templates/:id/duplicate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = extractUserId(req);
      const templateId = req.params.id!;

      if (!templateId) {
        res.status(400).json({
          success: false,
          error: 'Template ID is required',
        });
        return;
      }

      const result = await duplicateTemplate(templateId, userId);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /templates/from-existing/:documentId - Create template from document
router.post(
  '/templates/from-existing/:documentId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);
      const userId = extractUserId(req);
      const documentId = req.params.documentId!;

      if (!documentId) {
        res.status(400).json({
          success: false,
          error: 'Document ID is required',
        });
        return;
      }

      const result = await createFromExisting(documentId, tenantId, userId);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /templates/:id/variables - Add a variable to a template
router.post(
  '/templates/:id/variables',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templateId = req.params.id!;
      const { name, type, defaultValue } = req.body;

      if (!templateId) {
        res.status(400).json({
          success: false,
          error: 'Template ID is required',
        });
        return;
      }

      if (!name || !type) {
        res.status(400).json({
          success: false,
          error: 'Variable name and type are required',
        });
        return;
      }

      const result = await addVariable(templateId, name, type, defaultValue);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /templates/:id/validate - Validate a template
router.post(
  '/templates/:id/validate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templateId = req.params.id!;

      if (!templateId) {
        res.status(400).json({
          success: false,
          error: 'Template ID is required',
        });
        return;
      }

      const result = await validateTemplate(templateId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /templates/:id/rate - Rate a template
router.post(
  '/templates/:id/rate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = extractUserId(req);
      const templateId = req.params.id!;
      const { rating } = req.body;

      if (!templateId) {
        res.status(400).json({
          success: false,
          error: 'Template ID is required',
        });
        return;
      }

      if (rating === undefined || rating === null) {
        res.status(400).json({
          success: false,
          error: 'Rating value is required (1-5)',
        });
        return;
      }

      const numericRating = Number(rating);
      if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
        res.status(400).json({
          success: false,
          error: 'Rating must be a number between 1 and 5',
        });
        return;
      }

      const result = await rateTemplate(templateId, numericRating, userId);

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
