import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';

import * as nlpEngine from '../services/nlp-engine.service.js';
import * as generativeAi from '../services/generative-ai.service.js';
import * as ragEngine from '../services/rag-engine.service.js';
import * as dataAnalysisAi from '../services/data-analysis-ai.service.js';
import * as promptManagement from '../services/prompt-management.service.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'text/csv', 'text/markdown', 'application/json', 'application/xml', 'text/html'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|doc|txt|md|csv|json|xml|html)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ========================
// NLP Routes
// ========================

const nlpAnalyzeSchema = z.object({
  text: z.string().min(1).max(100000),
});

router.post('/nlp/analyze', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { text } = nlpAnalyzeSchema.parse(req.body);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await nlpEngine.analyzeText(text, tenantId, userId);
  res.json({ success: true, data: result });
}));

const nlpTextSchema = z.object({
  text: z.string().min(1).max(100000),
});

router.post('/nlp/entities', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { text } = nlpTextSchema.parse(req.body);
  const result = await nlpEngine.extractEntities(text);
  res.json({ success: true, data: { entities: result } });
}));

router.post('/nlp/sentiment', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { text } = nlpTextSchema.parse(req.body);
  const result = await nlpEngine.analyzeSentiment(text);
  res.json({ success: true, data: result });
}));

const keywordsSchema = z.object({
  text: z.string().min(1).max(100000),
  count: z.number().int().min(1).max(50).optional().default(10),
});

router.post('/nlp/keywords', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { text, count } = keywordsSchema.parse(req.body);
  const result = await nlpEngine.extractKeywords(text, count);
  res.json({ success: true, data: { keywords: result } });
}));

const summarizeSchema = z.object({
  text: z.string().min(1).max(100000),
  maxLength: z.number().int().min(50).max(5000).optional().default(500),
  style: z.enum(['extractive', 'abstractive']).optional().default('abstractive'),
});

router.post('/nlp/summarize', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { text, maxLength, style } = summarizeSchema.parse(req.body);
  const result = await nlpEngine.summarizeText(text, maxLength, style);
  res.json({ success: true, data: result });
}));

const classifySchema = z.object({
  text: z.string().min(1).max(100000),
  categories: z.array(z.string().min(1)).min(2).max(50),
});

router.post('/nlp/classify', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { text, categories } = classifySchema.parse(req.body);
  const result = await nlpEngine.classifyText(text, categories);
  res.json({ success: true, data: { classifications: result } });
}));

router.post('/nlp/detect-language', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { text } = nlpTextSchema.parse(req.body);
  const result = await nlpEngine.detectLanguage(text);
  res.json({ success: true, data: result });
}));

// ========================
// Generative AI Routes
// ========================

const generateTextSchema = z.object({
  prompt: z.string().min(1).max(50000),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(50).max(4096).optional(),
  systemPrompt: z.string().max(10000).optional(),
});

router.post('/generate/text', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = generateTextSchema.parse(req.body);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await generativeAi.generateText(
    body.prompt,
    { temperature: body.temperature, maxTokens: body.maxTokens, systemPrompt: body.systemPrompt },
    tenantId,
    userId
  );
  res.json({ success: true, data: result });
}));

const generateReportSchema = z.object({
  data: z.any(),
  instructions: z.string().min(1).max(10000),
});

router.post('/generate/report', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { data, instructions } = generateReportSchema.parse(req.body);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await generativeAi.generateReport(data, instructions, tenantId, userId);
  res.json({ success: true, data: result });
}));

router.post('/generate/insights/:datasetId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const datasetId = z.string().uuid().parse(req.params.datasetId);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await generativeAi.generateInsights(datasetId, tenantId, userId);
  res.json({ success: true, data: result });
}));

const recommendationsSchema = z.object({
  context: z.any(),
});

router.post('/generate/recommendations', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { context } = recommendationsSchema.parse(req.body);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await generativeAi.generateRecommendations(context, tenantId, userId);
  res.json({ success: true, data: result });
}));

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.string().min(1),
    content: z.string().min(1),
  })).min(1),
  sessionId: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(50).max(4096).optional(),
  systemPrompt: z.string().max(10000).optional(),
});

router.post('/generate/chat', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = chatSchema.parse(req.body);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await generativeAi.chatCompletion(
    body.messages,
    { sessionId: body.sessionId, temperature: body.temperature, maxTokens: body.maxTokens, systemPrompt: body.systemPrompt },
    tenantId,
    userId
  );
  res.json({ success: true, data: result });
}));

const streamSchema = z.object({
  messages: z.array(z.object({
    role: z.string().min(1),
    content: z.string().min(1),
  })).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(50).max(4096).optional(),
  systemPrompt: z.string().max(10000).optional(),
});

router.post('/generate/stream', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = streamSchema.parse(req.body);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const stream = generativeAi.streamCompletion(
    body.messages,
    { temperature: body.temperature, maxTokens: body.maxTokens, systemPrompt: body.systemPrompt }
  );

  try {
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.write(`data: ${JSON.stringify({ error: message || 'Stream error' })}\n\n`);
  } finally {
    res.end();
  }
}));

// ========================
// RAG Routes
// ========================

const createKbSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
});

router.post('/rag/knowledge-bases', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { name, description } = createKbSchema.parse(req.body);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await ragEngine.createKnowledgeBase(name, description, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.get('/rag/knowledge-bases', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.organizationId || req.user!.userId;
  const result = await ragEngine.listKnowledgeBases(tenantId);
  res.json({ success: true, data: result });
}));

router.get('/rag/knowledge-bases/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const kbId = z.string().uuid().parse(req.params.id);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const result = await ragEngine.getKnowledgeBase(kbId, tenantId);

  if (!result) {
    res.status(404).json({ success: false, error: 'Knowledge base not found' });
    return;
  }

  res.json({ success: true, data: result });
}));

router.post('/rag/knowledge-bases/:id/ingest', authMiddleware, upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const kbId = z.string().uuid().parse(req.params.id);
  const tenantId = req.user!.organizationId || req.user!.userId;

  if (!req.file) {
    res.status(400).json({ success: false, error: 'File is required', code: 'FILE_REQUIRED' });
    return;
  }

  const result = await ragEngine.ingestDocument(kbId, req.file.buffer, req.file.originalname, tenantId);
  res.json({ success: true, data: result });
}));

const queryKbSchema = z.object({
  question: z.string().min(1).max(5000),
  topK: z.number().int().min(1).max(20).optional().default(5),
});

router.post('/rag/knowledge-bases/:id/query', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const kbId = z.string().uuid().parse(req.params.id);
  const { question, topK } = queryKbSchema.parse(req.body);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await ragEngine.queryKnowledgeBase(kbId, question, topK, tenantId, userId);
  res.json({ success: true, data: result });
}));

const hybridSearchSchema = z.object({
  query: z.string().min(1).max(5000),
  topK: z.number().int().min(1).max(50).optional().default(10),
});

router.post('/rag/knowledge-bases/:id/hybrid-search', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const kbId = z.string().uuid().parse(req.params.id);
  const { query, topK } = hybridSearchSchema.parse(req.body);
  const result = await ragEngine.hybridSearch(kbId, query, topK);
  res.json({ success: true, data: { results: result } });
}));

const embedSchema = z.object({
  text: z.string().min(1).max(30000),
});

router.post('/rag/embed', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { text } = embedSchema.parse(req.body);
  const embedding = await ragEngine.generateEmbedding(text);
  res.json({ success: true, data: { embedding, dimensions: embedding.length } });
}));

// ========================
// Data AI Routes
// ========================

const analyzeDatasetSchema = z.object({
  question: z.string().min(1).max(5000),
});

router.post('/data-ai/analyze/:datasetId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const datasetId = z.string().uuid().parse(req.params.datasetId);
  const { question } = analyzeDatasetSchema.parse(req.body);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await dataAnalysisAi.analyzeDataset(datasetId, question, tenantId, userId);
  res.json({ success: true, data: result });
}));

router.post('/data-ai/patterns/:datasetId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const datasetId = z.string().uuid().parse(req.params.datasetId);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await dataAnalysisAi.detectPatterns(datasetId, tenantId, userId);
  res.json({ success: true, data: result });
}));

const predictSchema = z.object({
  column: z.string().min(1),
  periods: z.number().int().min(1).max(100).optional().default(10),
});

router.post('/data-ai/predict/:datasetId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const datasetId = z.string().uuid().parse(req.params.datasetId);
  const { column, periods } = predictSchema.parse(req.body);
  const result = await dataAnalysisAi.predictTrend(datasetId, column, periods);
  res.json({ success: true, data: result });
}));

router.get('/data-ai/suggest-viz/:datasetId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const datasetId = z.string().uuid().parse(req.params.datasetId);
  const result = await dataAnalysisAi.suggestVisualizations(datasetId);
  res.json({ success: true, data: { visualizations: result } });
}));

const nlToQuerySchema = z.object({
  query: z.string().min(1).max(5000),
});

router.post('/data-ai/nl-to-query', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { query } = nlToQuerySchema.parse(req.body);
  const datasetId = z.string().uuid().parse(req.body.datasetId);
  const result = await dataAnalysisAi.naturalLanguageToQuery(query, datasetId);
  res.json({ success: true, data: result });
}));

// ========================
// Prompt Management Routes
// ========================

const createPromptSchema = z.object({
  name: z.string().min(1).max(200),
  template: z.string().min(1).max(50000),
  variables: z.array(z.string()).optional().default([]),
  category: z.string().min(1).max(100).optional().default('general'),
});

router.post('/prompts', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = createPromptSchema.parse(req.body);
  const tenantId = req.user!.organizationId || req.user!.userId;
  const userId = req.user!.userId;
  const result = await promptManagement.createPrompt(body.name, body.template, body.variables, body.category, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.get('/prompts', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const tenantId = req.user!.organizationId || req.user!.userId;
  const result = await promptManagement.listPrompts(category, tenantId);
  res.json({ success: true, data: { prompts: result, total: result.length } });
}));

const testPromptSchema = z.object({
  variables: z.record(z.string(), z.string()),
});

router.post('/prompts/:id/test', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const promptId = z.string().uuid().parse(req.params.id);
  const { variables } = testPromptSchema.parse(req.body);
  const result = await promptManagement.testPrompt(promptId, variables);
  res.json({ success: true, data: result });
}));

const optimizePromptSchema = z.object({
  examples: z.array(z.object({
    input: z.any(),
    expectedOutput: z.string().min(1),
  })).min(1).max(20),
});

router.post('/prompts/:id/optimize', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const promptId = z.string().uuid().parse(req.params.id);
  const { examples } = optimizePromptSchema.parse(req.body);
  const result = await promptManagement.optimizePrompt(promptId, examples as Array<{ input: unknown; expectedOutput: string }>);
  res.json({ success: true, data: result });
}));

const versionPromptSchema = z.object({
  description: z.string().min(1).max(1000),
});

router.post('/prompts/:id/version', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const promptId = z.string().uuid().parse(req.params.id);
  const { description } = versionPromptSchema.parse(req.body);
  const result = await promptManagement.versionPrompt(promptId, description);
  res.json({ success: true, data: result });
}));

export default router;
