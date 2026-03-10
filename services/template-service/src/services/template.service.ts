import Handlebars from 'handlebars';
import Mustache from 'mustache';
import ejs from 'ejs';
import nunjucks from 'nunjucks';
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

const nunjucksEnv = nunjucks.configure({ autoescape: true, trimBlocks: true });

interface TemplateVariable {
  name: string;
  type: string;
  defaultValue?: unknown;
}

interface TemplateJsonConfig {
  content: string;
  variables: TemplateVariable[];
  engine: string;
}

export class TemplateService {

  async createTemplate(name: string, category: string, engine: string, content: string, variables: TemplateVariable[], tenantId: string, userId: string) {
    const validEngines = ['handlebars', 'mustache', 'ejs', 'nunjucks'];
    if (!validEngines.includes(engine)) throw new Error(`Invalid engine. Use: ${validEngines.join(', ')}`);

    this.validateTemplateSyntax(content, engine);

    const template = await prisma.template.create({
      data: {
        tenantId,
        name,
        category: category as string,
        engine,
        templateJson: { content, variables, engine } as unknown as Prisma.InputJsonValue,
        isSystem: false,
        createdBy: userId,
      },
    });

    return { id: template.id, name, category, engine, variableCount: variables.length };
  }

  async renderTemplate(templateId: string, data: Record<string, unknown>) {
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) throw new Error('Template not found');

    const config = template.templateJson as unknown as TemplateJsonConfig;
    const content = config.content;
    const engine = config.engine || template.engine || 'handlebars';

    let rendered: string;

    switch (engine) {
      case 'handlebars': {
        const compiled = Handlebars.compile(content);
        rendered = compiled(data);
        break;
      }
      case 'mustache': {
        rendered = Mustache.render(content, data);
        break;
      }
      case 'ejs': {
        rendered = ejs.render(content, data);
        break;
      }
      case 'nunjucks': {
        rendered = nunjucksEnv.renderString(content, data);
        break;
      }
      default:
        throw new Error(`Unknown template engine: ${engine}`);
    }

    await prisma.template.update({
      where: { id: templateId },
      data: { usageCount: { increment: 1 } },
    });

    return { templateId, engine, rendered, renderedLength: rendered.length };
  }

  async previewTemplate(templateId: string, previewData?: Record<string, unknown>) {
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) throw new Error('Template not found');

    const config = template.templateJson as unknown as TemplateJsonConfig;
    const variables = config.variables || [];
    const preview = previewData || this.generatePreviewData(variables);

    return this.renderTemplate(templateId, preview);
  }

  async listTemplates(tenantId: string, options: { page?: number; limit?: number; category?: string; search?: string }) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { OR: [{ tenantId }, { isSystem: true }] };
    if (options.category) where.category = options.category;
    if (options.search) where.name = { contains: options.search, mode: 'insensitive' };

    const [templates, total] = await Promise.all([
      prisma.template.findMany({ where, skip, take: limit, orderBy: { usageCount: 'desc' } }),
      prisma.template.count({ where }),
    ]);

    return {
      data: templates.map(t => ({
        id: t.id,
        name: t.name,
        category: t.category,
        engine: t.engine,
        isSystem: t.isSystem,
        usageCount: t.usageCount,
        createdAt: t.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async duplicateTemplate(templateId: string, tenantId: string, userId: string) {
    const original = await prisma.template.findUnique({ where: { id: templateId } });
    if (!original) throw new Error('Template not found');

    const copy = await prisma.template.create({
      data: {
        tenantId,
        name: `${original.name} (Copy)`,
        category: original.category,
        engine: original.engine,
        templateJson: original.templateJson as Prisma.InputJsonValue,
        isSystem: false,
        createdBy: userId,
      },
    });

    return { id: copy.id, name: copy.name, category: copy.category };
  }

  async validateTemplate(templateId: string) {
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) throw new Error('Template not found');

    const config = template.templateJson as unknown as TemplateJsonConfig;
    const content = config.content;
    const engine = config.engine || template.engine || 'handlebars';

    try {
      this.validateTemplateSyntax(content, engine);
      return { valid: true, engine, message: 'Template syntax is valid' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, engine, error: message };
    }
  }

  private validateTemplateSyntax(content: string, engine: string) {
    switch (engine) {
      case 'handlebars':
        Handlebars.precompile(content);
        break;
      case 'mustache':
        Mustache.parse(content);
        break;
      case 'ejs':
        ejs.compile(content);
        break;
      case 'nunjucks':
        nunjucksEnv.renderString(content, {});
        break;
    }
  }

  private generatePreviewData(variables: TemplateVariable[]): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const v of variables) {
      const name = v.name || String(v);
      switch (v.type || 'string') {
        case 'number': data[name] = 42; break;
        case 'boolean': data[name] = true; break;
        case 'date': data[name] = new Date().toISOString(); break;
        case 'array': data[name] = ['Item 1', 'Item 2', 'Item 3']; break;
        default: data[name] = `Sample ${name}`;
      }
    }
    return data;
  }
}

export const templateService = new TemplateService();
