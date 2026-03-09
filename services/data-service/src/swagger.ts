/**
 * Swagger/OpenAPI Documentation — Rasid Platform
 * توثيق API تلقائي باستخدام swagger-jsdoc و swagger-ui-express
 */

import swaggerJsdoc from 'swagger-jsdoc';
import { Express } from 'express';

const swaggerDefinition: swaggerJsdoc.OAS3Definition = {
  openapi: '3.0.3',
  info: {
    title: 'Rasid Platform API',
    version: '1.0.0',
    description: 'منصة راصد — نظام تشغيل ذكي للمستندات والبيانات',
    contact: {
      name: 'Rasid Team',
      email: 'api@rasid.sa',
    },
    license: {
      name: 'Proprietary',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
          code: { type: 'string' },
        },
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: {} },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          },
        },
      },
      DataTable: {
        type: 'object',
        properties: {
          columns: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'object' } },
        },
      },
      ConnectorType: {
        type: 'string',
        enum: [
          'salesforce', 'google_drive', 'notion', 'airtable', 'jira',
          'slack', 'dropbox', 'hubspot', 'outlook', 'teams',
          'google_forms', 'google_slides', 'google_docs',
          'zapier', 'make', 'youtube', 'typeform',
          'powerbi', 'canva', 'figma', 'miro', 'calendly', 'amplitude',
        ],
      },
      FileUpload: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          filename: { type: 'string' },
          mimeType: { type: 'string' },
          size: { type: 'integer' },
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
        },
      },
      ConversionJob: {
        type: 'object',
        properties: {
          jobId: { type: 'string', format: 'uuid' },
          sourceFormat: { type: 'string' },
          targetFormat: { type: 'string' },
          status: { type: 'string', enum: ['queued', 'processing', 'completed', 'failed'] },
          progress: { type: 'integer', minimum: 0, maximum: 100 },
        },
      },
      Dashboard: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string' },
          widgets: { type: 'array', items: { type: 'object' } },
          layout: { type: 'object' },
          theme: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Report: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          type: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Presentation: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          slides: { type: 'array', items: { type: 'object' } },
          theme: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      TranslationProject: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          sourceLocale: { type: 'string' },
          targetLocales: { type: 'array', items: { type: 'string' } },
          progress: { type: 'number' },
        },
      },
      AuditLog: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          action: { type: 'string' },
          userId: { type: 'string' },
          tenantId: { type: 'string' },
          resource: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          metadata: { type: 'object' },
        },
      },
    },
    parameters: {
      TenantId: {
        name: 'X-Tenant-Id',
        in: 'header',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Tenant identifier',
      },
      PageParam: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', default: 1, minimum: 1 },
      },
      PageSizeParam: {
        name: 'pageSize',
        in: 'query',
        schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  tags: [
    { name: 'Data & Files', description: 'محرك البيانات والملفات' },
    { name: 'Connectors', description: 'الموصلات الخارجية' },
    { name: 'Excel', description: 'محرك Excel' },
    { name: 'Dashboards', description: 'لوحات المؤشرات' },
    { name: 'Reports', description: 'التقارير' },
    { name: 'Presentations', description: 'العروض التقديمية' },
    { name: 'Localization', description: 'التعريب والترجمة' },
    { name: 'Conversion', description: 'تحويل الصيغ' },
    { name: 'AI Intelligence', description: 'الذكاء الاصطناعي' },
    { name: 'Governance', description: 'الحوكمة والصلاحيات' },
    { name: 'Auth', description: 'المصادقة والتفويض' },
  ],
  paths: {
    '/connectors/types': {
      get: {
        tags: ['Connectors'],
        summary: 'List available connector types',
        responses: {
          '200': {
            description: 'List of connector types',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/ConnectorType' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/connectors/connections': {
      get: {
        tags: ['Connectors'],
        summary: 'List active connections for tenant',
        parameters: [{ $ref: '#/components/parameters/TenantId' }],
        responses: {
          '200': { description: 'Active connections list' },
        },
      },
    },
    '/connectors/auth/{type}': {
      get: {
        tags: ['Connectors'],
        summary: 'Get OAuth authorization URL',
        parameters: [
          { name: 'type', in: 'path', required: true, schema: { $ref: '#/components/schemas/ConnectorType' } },
        ],
        responses: {
          '200': { description: 'Authorization URL' },
        },
      },
    },
    '/connectors/{connectionId}/fetch': {
      post: {
        tags: ['Connectors'],
        summary: 'Fetch data from a connection',
        parameters: [
          { name: 'connectionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  resource: { type: 'string' },
                  params: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Fetched data' },
        },
      },
    },
    '/data/upload': {
      post: {
        tags: ['Data & Files'],
        summary: 'Upload a file for processing',
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Upload result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FileUpload' },
              },
            },
          },
        },
      },
    },
    '/data/upload/resumable/init': {
      post: {
        tags: ['Data & Files'],
        summary: 'Initialize a resumable upload session',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  filename: { type: 'string' },
                  totalSize: { type: 'integer' },
                  mimeType: { type: 'string' },
                },
                required: ['filename', 'totalSize', 'mimeType'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Upload session initialized' },
        },
      },
    },
    '/data/tables': {
      get: {
        tags: ['Data & Files'],
        summary: 'List data tables',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/PageSizeParam' },
        ],
        responses: {
          '200': { description: 'Data tables list' },
        },
      },
    },
    '/conversion/convert': {
      post: {
        tags: ['Conversion'],
        summary: 'Convert file between formats',
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  targetFormat: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Conversion job created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConversionJob' },
              },
            },
          },
        },
      },
    },
    '/dashboards': {
      get: {
        tags: ['Dashboards'],
        summary: 'List dashboards',
        responses: {
          '200': { description: 'Dashboard list' },
        },
      },
      post: {
        tags: ['Dashboards'],
        summary: 'Create a new dashboard',
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Dashboard' },
            },
          },
        },
        responses: {
          '201': { description: 'Dashboard created' },
        },
      },
    },
    '/reports': {
      get: {
        tags: ['Reports'],
        summary: 'List reports',
        responses: { '200': { description: 'Report list' } },
      },
      post: {
        tags: ['Reports'],
        summary: 'Create a new report',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Report' } } },
        },
        responses: { '201': { description: 'Report created' } },
      },
    },
    '/presentations': {
      get: {
        tags: ['Presentations'],
        summary: 'List presentations',
        responses: { '200': { description: 'Presentation list' } },
      },
      post: {
        tags: ['Presentations'],
        summary: 'Create a new presentation',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Presentation' } } },
        },
        responses: { '201': { description: 'Presentation created' } },
      },
    },
    '/localization/projects': {
      get: {
        tags: ['Localization'],
        summary: 'List translation projects',
        responses: { '200': { description: 'Translation project list' } },
      },
    },
    '/localization/translate': {
      post: {
        tags: ['Localization'],
        summary: 'Translate text',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  sourceLang: { type: 'string' },
                  targetLang: { type: 'string' },
                },
                required: ['text', 'targetLang'],
              },
            },
          },
        },
        responses: { '200': { description: 'Translation result' } },
      },
    },
    '/ai/query': {
      post: {
        tags: ['AI Intelligence'],
        summary: 'Ask AI a question about your data',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  dataSourceId: { type: 'string' },
                  language: { type: 'string', default: 'ar' },
                },
                required: ['query'],
              },
            },
          },
        },
        responses: { '200': { description: 'AI analysis result' } },
      },
    },
    '/ai/sql-preview': {
      post: {
        tags: ['AI Intelligence'],
        summary: 'Preview generated SQL before execution',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  schema: { type: 'object' },
                },
                required: ['query'],
              },
            },
          },
        },
        responses: { '200': { description: 'SQL preview with explanation' } },
      },
    },
    '/governance/audit': {
      get: {
        tags: ['Governance'],
        summary: 'Get audit logs',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/PageSizeParam' },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'userId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Audit logs',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedResponse' },
              },
            },
          },
        },
      },
    },
    '/governance/ai-shutdown': {
      post: {
        tags: ['Governance'],
        summary: 'Activate global AI shutdown',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reason: { type: 'string' },
                  scope: { type: 'string', enum: ['global', 'tenant', 'engine'] },
                  engines: { type: 'array', items: { type: 'string' } },
                },
                required: ['reason', 'scope'],
              },
            },
          },
        },
        responses: { '200': { description: 'Shutdown activated' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate user',
        security: [],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Authentication successful' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  refreshToken: { type: 'string' },
                },
                required: ['refreshToken'],
              },
            },
          },
        },
        responses: { '200': { description: 'Token refreshed' } },
      },
    },
  },
};

export function getSwaggerSpec(): object {
  return swaggerDefinition;
}

export async function setupSwagger(app: Express): Promise<void> {
  const swaggerUi = await import('swagger-ui-express');
  const spec = getSwaggerSpec();
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customCss: `
      .swagger-ui .topbar { background-color: #1a1a2e; }
      .swagger-ui .info .title { color: #16213e; }
      body { direction: ltr; }
    `,
    customSiteTitle: 'Rasid API Documentation',
    customfavIcon: '/favicon.ico',
  }));
  app.get('/api-docs.json', (_req, res) => {
    res.json(spec);
  });
}
