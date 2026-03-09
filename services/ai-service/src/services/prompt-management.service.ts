import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-service', module: 'prompt-management' },
  transports: [new winston.transports.Console()],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

export async function createPrompt(
  name: string,
  template: string,
  variables: string[],
  category: string,
  tenantId: string,
  userId: string
): Promise<{ id: string; name: string; version: number }> {
  logger.info('Creating prompt template', { name, category, tenantId, userId, variableCount: variables.length });

  if (!name || name.trim().length === 0) {
    throw new Error('Prompt name is required');
  }
  if (!template || template.trim().length === 0) {
    throw new Error('Prompt template is required');
  }

  const detectedVars = template.match(/\{\{(\w+)\}\}/g)?.map((v: string) => v.replace(/\{\{|\}\}/g, '')) || [];
  const allVariables = [...new Set([...variables, ...detectedVars])];

  const promptId = uuidv4();
  const prompt = await prisma.prompt.create({
    data: {
      id: promptId,
      name: name.trim(),
      description: `Prompt template for ${category}`,
      template,
      variables: JSON.stringify(allVariables),
      category: category || 'general',
      tenantId: tenantId,
      createdBy: userId,
      version: 1,
      isActive: true,
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.promptVersion.create({
    data: {
      id: uuidv4(),
      promptId: promptId,
      version: 1,
      template,
      variables: JSON.stringify(allVariables),
      description: 'Initial version',
      createdBy: userId,
      createdAt: new Date(),
    },
  });

  logger.info('Prompt template created', { promptId, name, version: 1, variables: allVariables });
  return { id: prompt.id, name: prompt.name, version: 1 };
}

export async function testPrompt(
  promptId: string,
  variables: Record<string, string>
): Promise<{ renderedPrompt: string; response: string; tokensUsed: number; latencyMs: number }> {
  const startTime = Date.now();
  logger.info('Testing prompt', { promptId, variableCount: Object.keys(variables).length });

  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
  if (!prompt) {
    throw new Error(`Prompt ${promptId} not found`);
  }

  let renderedPrompt = (prompt as Record<string, unknown>).template as string;
  const templateVariables: string[] = JSON.parse((prompt as Record<string, unknown>).variables || '[]');

  for (const varName of templateVariables) {
    const value = variables[varName];
    if (value !== undefined && value !== null) {
      const regex = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
      renderedPrompt = renderedPrompt.replace(regex, String(value));
    }
  }

  const unreplacedVars = renderedPrompt.match(/\{\{(\w+)\}\}/g);
  if (unreplacedVars && unreplacedVars.length > 0) {
    logger.warn('Unreplaced variables in prompt', { vars: unreplacedVars });
  }

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [{ role: 'user', content: renderedPrompt }],
    temperature: 0.7,
    max_tokens: 2048,
  });

  const responseText = response.choices[0]?.message?.content || '';
  const tokensUsed = response.usage?.total_tokens || 0;
  const latencyMs = Date.now() - startTime;

  await prisma.prompt.update({
    where: { id: promptId },
    data: {
      usageCount: { increment: 1 },
      updatedAt: new Date(),
    },
  });

  logger.info('Prompt test complete', { promptId, tokensUsed, latencyMs });
  return { renderedPrompt, response: responseText, tokensUsed, latencyMs };
}

export async function optimizePrompt(
  promptId: string,
  examples: Array<{ input: unknown; expectedOutput: string }>
): Promise<{ originalPrompt: string; optimizedPrompt: string; improvements: string[]; estimatedImpact: string }> {
  logger.info('Optimizing prompt', { promptId, exampleCount: examples.length });

  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
  if (!prompt) {
    throw new Error(`Prompt ${promptId} not found`);
  }

  const originalTemplate = (prompt as Record<string, unknown>).template as string;

  const examplesStr = examples.slice(0, 10).map((ex, i) => {
    const inputStr = typeof ex.input === 'string' ? ex.input : JSON.stringify(ex.input);
    return `Example ${i + 1}:\nInput: ${inputStr.substring(0, 500)}\nExpected Output: ${ex.expectedOutput.substring(0, 500)}`;
  }).join('\n\n');

  const systemPrompt = `You are a prompt engineering expert. Analyze the current prompt template and the examples of desired behavior, then suggest an improved version.
Focus on:
1. Clarity and specificity of instructions
2. Better structuring of the output format
3. Adding relevant constraints and guardrails
4. Improving consistency with the expected outputs
5. Reducing ambiguity

Return a JSON object:
{
  "optimizedPrompt": "<improved prompt template, keeping {{variable}} slots intact>",
  "improvements": ["<list of specific improvements made>"],
  "estimatedImpact": "<high|medium|low> - estimated quality improvement"
}
Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Current prompt template:\n${originalTemplate}\n\nExamples of desired behavior:\n${examplesStr}` },
    ],
    temperature: 0.4,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for prompt optimization');
  }

  const parsed = JSON.parse(content);

  logger.info('Prompt optimization complete', {
    promptId,
    improvementCount: parsed.improvements?.length || 0,
    estimatedImpact: parsed.estimatedImpact,
  });

  return {
    originalPrompt: originalTemplate,
    optimizedPrompt: String(parsed.optimizedPrompt || originalTemplate),
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map(String) : [],
    estimatedImpact: String(parsed.estimatedImpact || 'medium'),
  };
}

export async function versionPrompt(
  promptId: string,
  description: string
): Promise<{ promptId: string; version: number; versionId: string }> {
  logger.info('Versioning prompt', { promptId, description: description.substring(0, 100) });

  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
  if (!prompt) {
    throw new Error(`Prompt ${promptId} not found`);
  }

  const currentVersion = (prompt as Record<string, unknown>).version as number;
  const newVersion = currentVersion + 1;
  const versionId = uuidv4();

  await prisma.promptVersion.create({
    data: {
      id: versionId,
      promptId: promptId,
      version: newVersion,
      template: (prompt as Record<string, unknown>).template,
      variables: (prompt as Record<string, unknown>).variables,
      description: description || `Version ${newVersion}`,
      createdBy: (prompt as Record<string, unknown>).createdBy as string,
      createdAt: new Date(),
    },
  });

  await prisma.prompt.update({
    where: { id: promptId },
    data: {
      version: newVersion,
      updatedAt: new Date(),
    },
  });

  logger.info('Prompt versioned', { promptId, version: newVersion, versionId });
  return { promptId, version: newVersion, versionId };
}

export async function listPrompts(
  category?: string,
  tenantId?: string
): Promise<Array<{ id: string; name: string; category: string; version: number; usageCount: number; isActive: boolean; createdAt: Date }>> {
  logger.info('Listing prompts', { category, tenantId });

  const where: Record<string, unknown> = {};
  if (category) {
    where.category = category;
  }
  if (tenantId) {
    where.tenantId = tenantId;
  }

  const prompts = await prisma.prompt.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  const result = prompts.map((p: Record<string, unknown>) => ({
    id: p.id,
    name: p.name,
    category: p.category || 'general',
    version: p.version || 1,
    usageCount: p.usageCount || 0,
    isActive: p.isActive !== false,
    createdAt: p.createdAt as Date,
  }));

  logger.info('Prompts listed', { count: result.length, category, tenantId });
  return result;
}
