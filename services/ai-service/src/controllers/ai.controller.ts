import { Request, Response, NextFunction } from 'express';
import { nlpService } from '../services/nlp.service';
import { ragService } from '../services/rag.service';

export class AIController {
  async analyzeText(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const { text } = req.body;
      if (!text) { res.status(400).json({ error: 'text is required' }); return; }
      const result = await nlpService.analyzeText(text, tenantId, userId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async extractEntities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const { text } = req.body;
      if (!text) { res.status(400).json({ error: 'text is required' }); return; }
      const result = await nlpService.extractEntities(text, tenantId, userId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async analyzeSentiment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const { text } = req.body;
      if (!text) { res.status(400).json({ error: 'text is required' }); return; }
      const result = await nlpService.analyzeSentiment(text, tenantId, userId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async summarize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text, maxLength, style } = req.body;
      if (!text) { res.status(400).json({ error: 'text is required' }); return; }
      const result = await nlpService.summarizeText(text, maxLength, style);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async classify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text, categories } = req.body;
      if (!text || !categories) { res.status(400).json({ error: 'text and categories required' }); return; }
      const result = await nlpService.classifyText(text, categories);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async detectLanguage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text } = req.body;
      if (!text) { res.status(400).json({ error: 'text is required' }); return; }
      const result = await nlpService.detectLanguage(text);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const { messages, model, temperature, maxTokens } = req.body;
      if (!messages || !Array.isArray(messages)) { res.status(400).json({ error: 'messages array required' }); return; }
      const result = await nlpService.chatCompletion(messages, tenantId, userId, { model, temperature, maxTokens });
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async generateInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const { datasetId } = req.params;
      const result = await nlpService.generateInsights(datasetId, tenantId, userId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async createKnowledgeBase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const { name, description } = req.body;
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const result = await ragService.createKnowledgeBase(name, description || '', tenantId);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async ingestDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { knowledgeBaseId } = req.params;
      const { text, metadata } = req.body;
      if (!text) { res.status(400).json({ error: 'text is required' }); return; }
      const result = await ragService.ingestDocument(knowledgeBaseId, text, metadata);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async queryKnowledgeBase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const { knowledgeBaseId } = req.params;
      const { question, topK } = req.body;
      if (!question) { res.status(400).json({ error: 'question is required' }); return; }
      const result = await ragService.queryKnowledgeBase(knowledgeBaseId, question, tenantId, userId, topK);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async listKnowledgeBases(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await ragService.listKnowledgeBases(tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async deleteKnowledgeBase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ragService.deleteKnowledgeBase(req.params.knowledgeBaseId!);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }
}

export const aiController = new AIController();
