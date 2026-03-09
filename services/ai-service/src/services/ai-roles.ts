import OpenAI from 'openai';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { v4 as uuidv4 } from 'uuid';

// ─── Schemas ──────────────────────────────────────────────────────────

const ListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().optional(),
});

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  roleKey: z.string().min(1).max(100),
  description: z.string().optional().default(''),
  systemPrompt: z.string().min(10),
  capabilities: z.array(z.string()).optional().default([]),
  createdBy: z.string().uuid().optional(),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  systemPrompt: z.string().min(10).optional(),
  capabilities: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

const AssignRoleSchema = z.object({
  roleId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
});

const ExecuteWithRoleSchema = z.object({
  roleId: z.string().uuid(),
  input: z.string().min(1).max(10000),
  dataContext: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  language: z.enum(['ar', 'en']).optional(),
});

// ─── Interfaces ───────────────────────────────────────────────────────

interface AIRole {
  id: string;
  roleKey: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  systemPrompt: string;
  capabilities: string[];
  icon: string;
}

interface RoleExecutionResult {
  id: string;
  roleId: string;
  roleKey: string;
  input: string;
  output: string;
  confidence: number;
  tokensUsed: number;
  processingMs: number;
  sessionId: string;
}

// ─── OpenAI Client ────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ─── Built-in Roles ──────────────────────────────────────────────────

const BUILT_IN_ROLES: AIRole[] = [
  {
    id: 'role-data-analyst',
    roleKey: 'data_analyst',
    nameAr: 'محلل بيانات',
    nameEn: 'Data Analyst',
    descriptionAr: 'تركيز على الأرقام والإحصائيات وتحليل البيانات الكمية',
    descriptionEn: 'Focuses on numbers, statistics, and quantitative data analysis',
    systemPrompt: `You are an expert Data Analyst for the RASID platform. Your focus is on quantitative analysis.
- Always provide specific numbers, percentages, and statistical measures
- Identify trends, patterns, and outliers in data
- Create data-driven conclusions backed by evidence
- Suggest appropriate visualizations for the data
- If data is insufficient, clearly state what additional data is needed
- Support both Arabic and English responses based on the input language`,
    capabilities: ['statistical_analysis', 'trend_detection', 'visualization_suggestion', 'data_profiling', 'correlation_analysis'],
    icon: 'chart-bar',
  },
  {
    id: 'role-quality-auditor',
    roleKey: 'quality_auditor',
    nameAr: 'مدقق جودة',
    nameEn: 'Quality Auditor',
    descriptionAr: 'تركيز على اكتشاف الأخطاء والتناقضات وضمان جودة البيانات',
    descriptionEn: 'Focuses on error detection, inconsistencies, and data quality assurance',
    systemPrompt: `You are an expert Quality Auditor for the RASID platform. Your focus is on data quality.
- Identify data quality issues: missing values, duplicates, inconsistencies, format errors
- Flag suspicious or anomalous data points
- Assess data completeness and accuracy
- Suggest data cleaning and standardization steps
- Evaluate data against common quality dimensions (accuracy, completeness, consistency, timeliness)
- Provide quality scores and improvement recommendations
- Support both Arabic and English responses`,
    capabilities: ['data_validation', 'anomaly_detection', 'quality_scoring', 'cleaning_recommendations', 'consistency_checks'],
    icon: 'shield-check',
  },
  {
    id: 'role-management-consultant',
    roleKey: 'management_consultant',
    nameAr: 'مستشار إداري',
    nameEn: 'Management Consultant',
    descriptionAr: 'تركيز على التوصيات الاستراتيجية واتخاذ القرارات الإدارية',
    descriptionEn: 'Focuses on strategic recommendations and management decision-making',
    systemPrompt: `You are an expert Management Consultant for the RASID platform. Your focus is on strategic advisory.
- Provide actionable business recommendations based on data insights
- Frame analysis in business context (ROI, market position, competitive advantage)
- Suggest strategic initiatives with priority, timeline, and expected impact
- Identify risks and mitigation strategies
- Perform SWOT analysis when appropriate
- Translate technical findings into executive-level insights
- Support both Arabic and English responses`,
    capabilities: ['strategic_recommendations', 'swot_analysis', 'risk_assessment', 'executive_summary', 'action_planning'],
    icon: 'briefcase',
  },
  {
    id: 'role-financial-analyst',
    roleKey: 'financial_analyst',
    nameAr: 'محلل مالي',
    nameEn: 'Financial Analyst',
    descriptionAr: 'تركيز على التحليل المالي والميزانيات والتدفقات النقدية',
    descriptionEn: 'Focuses on financial analysis, budgets, and cash flows',
    systemPrompt: `You are an expert Financial Analyst for the RASID platform. Your focus is on financial analysis.
- Analyze financial statements, ratios, and KPIs
- Assess profitability, liquidity, and solvency
- Identify financial trends and forecast future performance
- Evaluate budget variances and cost optimization opportunities
- Provide investment and resource allocation recommendations
- Use standard financial terminology (Arabic and English)
- Support both Arabic and English responses`,
    capabilities: ['financial_ratios', 'budget_analysis', 'cash_flow_analysis', 'profitability_assessment', 'financial_forecasting'],
    icon: 'banknotes',
  },
  {
    id: 'role-hr-analyst',
    roleKey: 'hr_analyst',
    nameAr: 'محلل موارد بشرية',
    nameEn: 'HR Analyst',
    descriptionAr: 'تركيز على تحليل بيانات الموارد البشرية والأداء الوظيفي',
    descriptionEn: 'Focuses on HR data analysis and workforce performance',
    systemPrompt: `You are an expert HR Analyst for the RASID platform. Your focus is on human resources analytics.
- Analyze workforce metrics: turnover, retention, satisfaction, productivity
- Identify patterns in hiring, performance reviews, and compensation
- Assess training effectiveness and skill gaps
- Provide talent management recommendations
- Evaluate diversity and inclusion metrics
- Support Saudi labor law context where relevant
- Support both Arabic and English responses`,
    capabilities: ['workforce_analytics', 'turnover_analysis', 'performance_metrics', 'compensation_analysis', 'talent_management'],
    icon: 'users',
  },
  {
    id: 'role-report-writer',
    roleKey: 'report_writer',
    nameAr: 'كاتب تقارير',
    nameEn: 'Report Writer',
    descriptionAr: 'تركيز على كتابة تقارير احترافية وملخصات تنفيذية',
    descriptionEn: 'Focuses on writing professional reports and executive summaries',
    systemPrompt: `You are an expert Report Writer for the RASID platform. Your focus is on professional document creation.
- Write clear, structured, and professional reports
- Create executive summaries that highlight key findings
- Organize information with proper headings, sections, and flow
- Include data citations and evidence-based conclusions
- Adapt tone and detail level to the target audience
- Format output in clean markdown
- Support both Arabic and English responses`,
    capabilities: ['executive_summary', 'report_structuring', 'professional_writing', 'data_storytelling', 'audience_adaptation'],
    icon: 'document-text',
  },
];

// ─── CRUD Functions ───────────────────────────────────────────────────

export async function list(params: Record<string, unknown>) {
  const validated = ListParamsSchema.parse(params);
  const skip = (validated.page - 1) * validated.limit;

  const where: Record<string, unknown> = {};
  if (validated.search) {
    where.OR = [
      { name: { contains: validated.search, mode: 'insensitive' } },
      { roleKey: { contains: validated.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.aiRole.findMany({
      where,
      skip,
      take: validated.limit,
      orderBy: { [validated.sortBy]: validated.sortOrder },
    }),
    prisma.aiRole.count({ where }),
  ]);

  return { data, total, page: validated.page, limit: validated.limit };
}

export async function getById(id: string) {
  const validId = z.string().uuid().parse(id);

  const cached = await cacheGet<Record<string, unknown>>(`ai-role:${validId}`);
  if (cached) return cached;

  const record = await prisma.aiRole.findUniqueOrThrow({ where: { id: validId } });
  await cacheSet(`ai-role:${validId}`, record, 600);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const validated = CreateSchema.parse(data);
  const id = uuidv4();

  const record = await prisma.aiRole.create({
    data: {
      id,
      name: validated.name,
      roleKey: validated.roleKey,
      description: validated.description,
      systemPrompt: validated.systemPrompt,
      capabilities: JSON.stringify(validated.capabilities),
      isActive: true,
      createdBy: validated.createdBy || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info('AI role created', { id, roleKey: validated.roleKey });
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const validId = z.string().uuid().parse(id);
  const validated = UpdateSchema.parse(data);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (validated.name !== undefined) updateData.name = validated.name;
  if (validated.description !== undefined) updateData.description = validated.description;
  if (validated.systemPrompt !== undefined) updateData.systemPrompt = validated.systemPrompt;
  if (validated.capabilities !== undefined) updateData.capabilities = JSON.stringify(validated.capabilities);
  if (validated.isActive !== undefined) updateData.isActive = validated.isActive;

  const record = await prisma.aiRole.update({
    where: { id: validId },
    data: updateData,
  });

  await cacheDel(`ai-role:${validId}`);
  return record;
}

export async function remove(id: string) {
  const validId = z.string().uuid().parse(id);
  await prisma.aiRole.delete({ where: { id: validId } });
  await cacheDel(`ai-role:${validId}`);
  logger.info('AI role deleted', { id: validId });
  return { deleted: true, id: validId };
}

// ─── Get Available Roles ──────────────────────────────────────────────

export async function getAvailableRoles(): Promise<AIRole[]> {
  const cached = await cacheGet<AIRole[]>('ai-roles:available');
  if (cached) return cached;

  // Merge built-in roles with custom roles from DB
  const customRoles = await prisma.aiRole.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  const customMapped: AIRole[] = customRoles.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    roleKey: String(r.roleKey),
    nameAr: String(r.name),
    nameEn: String(r.name),
    descriptionAr: String(r.description || ''),
    descriptionEn: String(r.description || ''),
    systemPrompt: String(r.systemPrompt),
    capabilities: (() => {
      try {
        const caps = r.capabilities;
        if (typeof caps === 'string') return JSON.parse(caps) as string[];
        if (Array.isArray(caps)) return caps.map(String);
        return [];
      } catch {
        return [];
      }
    })(),
    icon: 'cog',
  }));

  const allRoles = [...BUILT_IN_ROLES, ...customMapped];
  await cacheSet('ai-roles:available', allRoles, 300);
  return allRoles;
}

// ─── Assign Role to Session ───────────────────────────────────────────

export async function assignRole(
  body: Record<string, unknown>,
  userId: string | undefined,
): Promise<{ sessionId: string; roleId: string; roleKey: string; roleName: string }> {
  const validated = AssignRoleSchema.parse(body);
  const sessionId = validated.sessionId || uuidv4();
  const safeUserId = userId || '';

  // Find role (built-in or custom)
  const allRoles = await getAvailableRoles();
  const role = allRoles.find((r) => r.id === validated.roleId);

  if (!role) {
    throw new Error(`AI role not found: ${validated.roleId}`);
  }

  // Persist session-role assignment
  await prisma.aiRoleAssignment.upsert({
    where: { id: sessionId },
    create: {
      id: sessionId,
      userId: safeUserId,
      roleId: role.id,
      roleKey: role.roleKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      roleId: role.id,
      roleKey: role.roleKey,
      updatedAt: new Date(),
    },
  });

  logger.info('Role assigned to session', { sessionId, roleId: role.id, roleKey: role.roleKey });

  return {
    sessionId,
    roleId: role.id,
    roleKey: role.roleKey,
    roleName: role.nameEn,
  };
}

// ─── Execute with Role ────────────────────────────────────────────────

export async function executeWithRole(
  body: Record<string, unknown>,
  userId: string | undefined,
): Promise<RoleExecutionResult> {
  const validated = ExecuteWithRoleSchema.parse(body);
  const startTime = Date.now();
  const executionId = uuidv4();
  const sessionId = validated.sessionId || uuidv4();
  const safeUserId = userId || '';

  logger.info('Executing with role', { executionId, roleId: validated.roleId, sessionId });

  // Find role
  const allRoles = await getAvailableRoles();
  const role = allRoles.find((r) => r.id === validated.roleId);

  if (!role) {
    throw new Error(`AI role not found: ${validated.roleId}`);
  }

  // Build messages with role system prompt
  const languageHint = validated.language === 'ar'
    ? '\nRespond in Arabic (العربية).'
    : validated.language === 'en'
      ? '\nRespond in English.'
      : '';

  const systemContent = `${role.systemPrompt}${languageHint}`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
  ];

  // Add data context if provided
  if (validated.dataContext) {
    messages.push({
      role: 'system',
      content: `--- DATA CONTEXT ---\n${validated.dataContext.substring(0, 8000)}`,
    });
  }

  // Add conversation history from session
  const previousExecutions = await prisma.aiRoleExecution.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  for (const prev of previousExecutions) {
    const typed = prev as Record<string, unknown>;
    messages.push({ role: 'user', content: String(typed.input) });
    messages.push({ role: 'assistant', content: String(typed.output) });
  }

  messages.push({ role: 'user', content: validated.input });

  // Execute
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages,
    temperature: 0.3,
    max_tokens: 3000,
  });

  const output = response.choices[0]?.message?.content || '';
  const totalTokens = response.usage?.total_tokens || 0;
  const processingMs = Date.now() - startTime;

  const finishReason = response.choices[0]?.finish_reason;
  let confidence = 0.85;
  if (finishReason === 'stop') confidence = 0.92;
  else if (finishReason === 'length') confidence = 0.6;

  // Persist execution
  await prisma.aiRoleExecution.create({
    data: {
      id: executionId,
      userId: safeUserId,
      sessionId,
      roleId: role.id,
      roleKey: role.roleKey,
      input: validated.input,
      output,
      confidence,
      tokensUsed: totalTokens,
      processingMs,
      model: DEFAULT_MODEL,
      createdAt: new Date(),
    },
  });

  logger.info('Role execution complete', {
    executionId,
    roleKey: role.roleKey,
    processingMs,
    totalTokens,
    confidence,
  });

  return {
    id: executionId,
    roleId: role.id,
    roleKey: role.roleKey,
    input: validated.input,
    output,
    confidence,
    tokensUsed: totalTokens,
    processingMs,
    sessionId,
  };
}
