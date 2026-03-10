import handlebars from 'handlebars';
import Mustache from 'mustache';
import ejs from 'ejs';
import nunjucks from 'nunjucks';
import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'crypto';
import winston from 'winston';

const prisma = new PrismaClient();

const nunjucksEnv = nunjucks.configure({ autoescape: true, noCache: true });

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'template-manager' },
  transports: [new winston.transports.Console()],
});

type TemplateType = 'report' | 'dashboard' | 'presentation' | 'infographic' | 'email';
type EngineType = 'handlebars' | 'mustache' | 'ejs' | 'nunjucks';

interface TemplateVariable {
  name: string;
  type: string;
  defaultValue?: unknown;
}

export async function createTemplate(
  name: string,
  type: TemplateType,
  engine: EngineType,
  content: string,
  variables: TemplateVariable[],
  category: string,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  if (!name || name.trim().length === 0) {
    throw new Error('Template name cannot be empty');
  }

  if (!content || content.trim().length === 0) {
    throw new Error('Template content cannot be empty');
  }

  const validTypes: TemplateType[] = ['report', 'dashboard', 'presentation', 'infographic', 'email'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid template type. Must be one of: ${validTypes.join(', ')}`);
  }

  const validEngines: EngineType[] = ['handlebars', 'mustache', 'ejs', 'nunjucks'];
  if (!validEngines.includes(engine)) {
    throw new Error(`Invalid engine. Must be one of: ${validEngines.join(', ')}`);
  }

  const compilationResult = compileWithEngine(engine, content);
  if (!compilationResult.success) {
    throw new Error(`Template syntax error (${engine}): ${compilationResult.error}`);
  }

  const templateId = crypto.randomUUID();

  const template = await prisma.template.create({
    data: {
      id: templateId,
      name: name.trim(),
      type: type,
      engine: engine,
      content: content,
      variables: variables as unknown as Prisma.InputJsonValue[],
      category: category,
      tenantId: tenantId,
      userId: userId,
      version: 1,
      isPublished: false,
      usageCount: 0,
      averageRating: 0,
      ratingCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info('Template created', {
    templateId: template.id,
    name: template.name,
    type: template.type,
    engine: template.engine,
    variableCount: variables.length,
    tenantId,
  });

  return {
    id: template.id,
    name: template.name,
    type: template.type,
    engine: template.engine,
    category: template.category,
    variables: template.variables,
    version: template.version,
    isPublished: template.isPublished,
    createdAt: template.createdAt,
  };
}

function compileWithEngine(
  engine: EngineType,
  content: string
): { success: boolean; error?: string } {
  try {
    switch (engine) {
      case 'handlebars': {
        handlebars.precompile(content);
        return { success: true };
      }
      case 'mustache': {
        Mustache.parse(content);
        return { success: true };
      }
      case 'ejs': {
        ejs.compile(content);
        return { success: true };
      }
      case 'nunjucks': {
        nunjucks.compile(content, nunjucksEnv);
        return { success: true };
      }
      default:
        return { success: false, error: `Unknown engine: ${engine}` };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function renderTemplate(
  templateId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new Error(`Template not found with id: ${templateId}`);
  }

  if (template.deletedAt) {
    throw new Error(`Template has been deleted: ${templateId}`);
  }

  const engine = template.engine as EngineType;
  const content = template.content;
  let renderedOutput: string;

  switch (engine) {
    case 'handlebars': {
      const compiledTemplate = handlebars.compile(content);
      renderedOutput = compiledTemplate(data);
      break;
    }
    case 'mustache': {
      renderedOutput = Mustache.render(content, data);
      break;
    }
    case 'ejs': {
      renderedOutput = ejs.render(content, data);
      break;
    }
    case 'nunjucks': {
      renderedOutput = nunjucks.renderString(content, data);
      break;
    }
    default:
      throw new Error(`Unsupported rendering engine: ${engine}`);
  }

  await prisma.template.update({
    where: { id: templateId },
    data: {
      usageCount: { increment: 1 },
      updatedAt: new Date(),
    },
  });

  logger.info('Template rendered', {
    templateId,
    engine,
    outputLength: renderedOutput.length,
    dataKeys: Object.keys(data),
  });

  return {
    templateId: template.id,
    templateName: template.name,
    engine: engine,
    rendered: renderedOutput,
    renderedAt: new Date().toISOString(),
    dataKeysUsed: Object.keys(data),
  };
}

export async function previewTemplate(
  templateId: string,
  previewData?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new Error(`Template not found with id: ${templateId}`);
  }

  let dataToUse: Record<string, unknown>;

  if (previewData && Object.keys(previewData).length > 0) {
    dataToUse = previewData;
  } else {
    dataToUse = generatePreviewDataFromVariables(
      template.variables as unknown as TemplateVariable[]
    );
  }

  const engine = template.engine as EngineType;
  let renderedPreview: string;

  try {
    switch (engine) {
      case 'handlebars': {
        const compiled = handlebars.compile(template.content);
        renderedPreview = compiled(dataToUse);
        break;
      }
      case 'mustache': {
        renderedPreview = Mustache.render(template.content, dataToUse);
        break;
      }
      case 'ejs': {
        renderedPreview = ejs.render(template.content, dataToUse);
        break;
      }
      case 'nunjucks': {
        renderedPreview = nunjucks.renderString(template.content, dataToUse);
        break;
      }
      default:
        throw new Error(`Unsupported engine: ${engine}`);
    }
  } catch (renderError) {
    throw new Error(
      `Preview rendering failed: ${(renderError as Error).message}`
    );
  }

  logger.info('Template preview generated', {
    templateId,
    engine,
    usedPreviewData: !previewData,
    previewLength: renderedPreview.length,
  });

  return {
    templateId: template.id,
    templateName: template.name,
    engine: engine,
    preview: renderedPreview,
    previewDataUsed: dataToUse,
    generatedAt: new Date().toISOString(),
  };
}

function generatePreviewDataFromVariables(
  variables: TemplateVariable[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (!variables || !Array.isArray(variables)) {
    return result;
  }

  for (const variable of variables) {
    if (variable.defaultValue !== undefined && variable.defaultValue !== null) {
      result[variable.name] = variable.defaultValue;
      continue;
    }

    switch (variable.type.toLowerCase()) {
      case 'string':
        result[variable.name] = `Sample ${variable.name}`;
        break;
      case 'number':
        result[variable.name] = 42;
        break;
      case 'boolean':
        result[variable.name] = true;
        break;
      case 'date':
        result[variable.name] = new Date().toISOString().split('T')[0];
        break;
      case 'array':
        result[variable.name] = ['Item 1', 'Item 2', 'Item 3'];
        break;
      case 'object':
        result[variable.name] = { key: 'value', nested: true };
        break;
      default:
        result[variable.name] = `Sample ${variable.name}`;
        break;
    }
  }

  return result;
}

export async function listTemplates(
  tenantId: string,
  type?: string,
  category?: string,
  pagination?: { page: number; limit: number }
): Promise<Record<string, unknown>> {
  const page = pagination?.page ? Math.max(1, pagination.page) : 1;
  const limit = pagination?.limit
    ? Math.min(100, Math.max(1, pagination.limit))
    : 20;
  const skip = (page - 1) * limit;

  const whereClause: Record<string, unknown> = {
    tenantId: tenantId,
    deletedAt: null,
  };

  if (type) {
    whereClause.type = type;
  }

  if (category) {
    whereClause.category = category;
  }

  const [templates, totalCount] = await Promise.all([
    prisma.template.findMany({
      where: whereClause,
      skip: skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        engine: true,
        category: true,
        version: true,
        isPublished: true,
        usageCount: true,
        averageRating: true,
        ratingCount: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.template.count({ where: whereClause }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  logger.info('Templates listed', {
    tenantId,
    page,
    limit,
    totalCount,
    typeFilter: type,
    categoryFilter: category,
  });

  return {
    data: templates,
    pagination: {
      page: page,
      limit: limit,
      totalCount: totalCount,
      totalPages: totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function duplicateTemplate(
  templateId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const originalTemplate = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!originalTemplate) {
    throw new Error(`Template not found with id: ${templateId}`);
  }

  if (originalTemplate.deletedAt) {
    throw new Error(`Cannot duplicate a deleted template: ${templateId}`);
  }

  const newId = crypto.randomUUID();
  const duplicatedName = `Copy of ${originalTemplate.name}`;

  const duplicatedTemplate = await prisma.template.create({
    data: {
      id: newId,
      name: duplicatedName,
      type: originalTemplate.type,
      engine: originalTemplate.engine,
      content: originalTemplate.content,
      variables: originalTemplate.variables as unknown as Prisma.InputJsonValue[],
      category: originalTemplate.category,
      tenantId: originalTemplate.tenantId,
      userId: userId,
      version: 1,
      isPublished: false,
      usageCount: 0,
      averageRating: 0,
      ratingCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info('Template duplicated', {
    originalId: templateId,
    newId: duplicatedTemplate.id,
    newName: duplicatedName,
    userId,
  });

  return {
    id: duplicatedTemplate.id,
    name: duplicatedTemplate.name,
    type: duplicatedTemplate.type,
    engine: duplicatedTemplate.engine,
    category: duplicatedTemplate.category,
    originalTemplateId: templateId,
    createdAt: duplicatedTemplate.createdAt,
  };
}

export async function createFromExisting(
  documentId: string,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error(`Document not found with id: ${documentId}`);
  }

  const documentContent = document.content as string || '';

  const variablePatterns = [
    { regex: /\b\d{4}-\d{2}-\d{2}\b/g, name: 'date', type: 'date' },
    { regex: /\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g, name: 'fullName', type: 'string' },
    { regex: /\b\d+\.\d{2}\b/g, name: 'amount', type: 'number' },
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, name: 'email', type: 'string' },
    { regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, name: 'phone', type: 'string' },
  ];

  let templateContent = documentContent;
  const extractedVariables: TemplateVariable[] = [];
  const usedNames = new Set<string>();

  for (const pattern of variablePatterns) {
    const matches = documentContent.match(pattern.regex);
    if (matches && matches.length > 0) {
      let varName = pattern.name;
      let counter = 1;
      while (usedNames.has(varName)) {
        varName = `${pattern.name}${counter}`;
        counter++;
      }
      usedNames.add(varName);

      templateContent = templateContent.replace(
        pattern.regex,
        `{{${varName}}}`
      );

      extractedVariables.push({
        name: varName,
        type: pattern.type,
        defaultValue: matches[0],
      });
    }
  }

  const newId = crypto.randomUUID();

  const template = await prisma.template.create({
    data: {
      id: newId,
      name: `Template from ${document.title || documentId}`,
      type: 'report',
      engine: 'handlebars',
      content: templateContent,
      variables: extractedVariables as unknown as Prisma.InputJsonValue[],
      category: 'auto-generated',
      tenantId: tenantId,
      userId: userId,
      version: 1,
      isPublished: false,
      usageCount: 0,
      averageRating: 0,
      ratingCount: 0,
      sourceDocumentId: documentId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info('Template created from existing document', {
    templateId: template.id,
    documentId,
    variablesExtracted: extractedVariables.length,
    tenantId,
  });

  return {
    id: template.id,
    name: template.name,
    type: template.type,
    engine: template.engine,
    sourceDocumentId: documentId,
    variables: extractedVariables,
    variableCount: extractedVariables.length,
    createdAt: template.createdAt,
  };
}

export async function addVariable(
  templateId: string,
  name: string,
  type: string,
  defaultValue?: unknown
): Promise<Record<string, unknown>> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new Error(`Template not found with id: ${templateId}`);
  }

  if (template.deletedAt) {
    throw new Error(`Cannot modify a deleted template: ${templateId}`);
  }

  const existingVariables = (template.variables as unknown as TemplateVariable[]) || [];

  const duplicateVar = existingVariables.find(
    (v: TemplateVariable) => v.name === name
  );
  if (duplicateVar) {
    throw new Error(
      `Variable "${name}" already exists in template ${templateId}`
    );
  }

  const newVariable: TemplateVariable = {
    name: name,
    type: type,
    defaultValue: defaultValue !== undefined ? defaultValue : undefined,
  };

  const updatedVariables = [...existingVariables, newVariable];

  const updatedTemplate = await prisma.template.update({
    where: { id: templateId },
    data: {
      variables: updatedVariables as unknown as Prisma.InputJsonValue[],
      updatedAt: new Date(),
    },
  });

  logger.info('Variable added to template', {
    templateId,
    variableName: name,
    variableType: type,
    totalVariables: updatedVariables.length,
  });

  return {
    templateId: updatedTemplate.id,
    variableAdded: newVariable,
    totalVariables: updatedVariables.length,
    allVariables: updatedVariables,
  };
}

export async function validateTemplate(templateId: string): Promise<Record<string, unknown>> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new Error(`Template not found with id: ${templateId}`);
  }

  const engine = template.engine as EngineType;
  const content = template.content;
  const errors: string[] = [];
  const warnings: string[] = [];

  const compilationResult = compileWithEngine(engine, content);

  if (!compilationResult.success) {
    errors.push(`Compilation error: ${compilationResult.error}`);
  }

  const variables = (template.variables as unknown as TemplateVariable[]) || [];

  for (const variable of variables) {
    const varPatterns: Record<string, RegExp> = {
      handlebars: new RegExp(`\\{\\{\\s*${variable.name}\\s*\\}\\}`, 'g'),
      mustache: new RegExp(`\\{\\{\\s*${variable.name}\\s*\\}\\}`, 'g'),
      ejs: new RegExp(`<%[=-]?\\s*${variable.name}\\s*%>`, 'g'),
      nunjucks: new RegExp(`\\{\\{\\s*${variable.name}\\s*\\}\\}`, 'g'),
    };

    const pattern = varPatterns[engine];
    if (pattern && !pattern.test(content)) {
      warnings.push(
        `Variable "${variable.name}" is defined but not used in template content`
      );
    }
  }

  if (content.trim().length === 0) {
    errors.push('Template content is empty');
  }

  if (content.length > 1000000) {
    warnings.push('Template content exceeds 1MB, which may impact performance');
  }

  const isValid = errors.length === 0;

  logger.info('Template validated', {
    templateId,
    engine,
    isValid,
    errorCount: errors.length,
    warningCount: warnings.length,
  });

  return {
    templateId: template.id,
    templateName: template.name,
    engine: engine,
    isValid: isValid,
    errors: errors,
    warnings: warnings,
    validatedAt: new Date().toISOString(),
  };
}

export async function getGallery(
  tenantId: string,
  type?: string,
  category?: string
): Promise<Record<string, unknown>> {
  const whereClause: Record<string, unknown> = {
    tenantId: tenantId,
    deletedAt: null,
    isPublished: true,
  };

  if (type) {
    whereClause.type = type;
  }

  if (category) {
    whereClause.category = category;
  }

  const templates = await prisma.template.findMany({
    where: whereClause,
    orderBy: [
      { averageRating: 'desc' },
      { usageCount: 'desc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      name: true,
      type: true,
      engine: true,
      category: true,
      version: true,
      usageCount: true,
      averageRating: true,
      ratingCount: true,
      thumbnailUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const categories = [...new Set(templates.map((t) => t.category))].filter(Boolean);
  const types = [...new Set(templates.map((t) => t.type))].filter(Boolean);

  const totalUsageCount = templates.reduce(
    (sum, t) => sum + (t.usageCount || 0),
    0
  );
  const averageOverallRating =
    templates.length > 0
      ? templates.reduce((sum, t) => sum + (t.averageRating || 0), 0) /
        templates.length
      : 0;

  logger.info('Gallery retrieved', {
    tenantId,
    templateCount: templates.length,
    typeFilter: type,
    categoryFilter: category,
  });

  return {
    templates: templates,
    totalCount: templates.length,
    availableCategories: categories,
    availableTypes: types,
    stats: {
      totalTemplates: templates.length,
      totalUsageCount: totalUsageCount,
      averageRating: Math.round(averageOverallRating * 100) / 100,
    },
  };
}

export async function rateTemplate(
  templateId: string,
  rating: number,
  userId: string
): Promise<Record<string, unknown>> {
  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }

  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new Error(`Template not found with id: ${templateId}`);
  }

  if (template.deletedAt) {
    throw new Error(`Cannot rate a deleted template: ${templateId}`);
  }

  const existingRating = await prisma.templateRating.findFirst({
    where: {
      templateId: templateId,
      userId: userId,
    },
  });

  if (existingRating) {
    await prisma.templateRating.update({
      where: { id: existingRating.id },
      data: {
        rating: rating,
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.templateRating.create({
      data: {
        id: crypto.randomUUID(),
        templateId: templateId,
        userId: userId,
        rating: rating,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  const allRatings = await prisma.templateRating.findMany({
    where: { templateId: templateId },
    select: { rating: true },
  });

  const totalRatings = allRatings.length;
  const sumRatings = allRatings.reduce((sum, r) => sum + r.rating, 0);
  const newAverage = totalRatings > 0 ? sumRatings / totalRatings : 0;

  const updatedTemplate = await prisma.template.update({
    where: { id: templateId },
    data: {
      averageRating: Math.round(newAverage * 100) / 100,
      ratingCount: totalRatings,
      updatedAt: new Date(),
    },
  });

  logger.info('Template rated', {
    templateId,
    rating,
    userId,
    newAverage: updatedTemplate.averageRating,
    totalRatings,
  });

  return {
    templateId: updatedTemplate.id,
    userRating: rating,
    averageRating: updatedTemplate.averageRating,
    ratingCount: updatedTemplate.ratingCount,
    message: existingRating ? 'Rating updated' : 'Rating submitted',
  };
}
