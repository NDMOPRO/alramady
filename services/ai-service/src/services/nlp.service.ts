import * as nlpEngine from './nlp-engine.service';
import { chatCompletion, generateInsights } from './generative-ai.service';

export const nlpService = {
  analyzeText: (text: string, tenantId?: string, userId?: string) =>
    nlpEngine.analyzeText(text, tenantId || '', userId || ''),

  extractEntities: (text: string, _tenantId?: string, _userId?: string) =>
    nlpEngine.extractEntities(text),

  analyzeSentiment: (text: string, _tenantId?: string, _userId?: string) =>
    nlpEngine.analyzeSentiment(text),

  summarizeText: (text: string, maxLength?: number, style?: string) =>
    nlpEngine.summarizeText(
      text,
      maxLength ?? 500,
      (style ?? 'abstractive') as 'extractive' | 'abstractive',
    ),

  classifyText: (text: string, categories: string[]) =>
    nlpEngine.classifyText(text, categories),

  detectLanguage: (text: string) =>
    nlpEngine.detectLanguage(text),

  chatCompletion: (
    messages: Array<{ role: string; content: string }>,
    tenantId?: string,
    userId?: string,
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ) => chatCompletion(messages, options || {}, tenantId || '', userId || ''),

  generateInsights: (datasetId: string, tenantId?: string, userId?: string) =>
    generateInsights(datasetId, tenantId || '', userId || ''),
};
