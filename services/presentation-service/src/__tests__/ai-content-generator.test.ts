// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';

const mockResponse = {
  choices: [{
    message: {
      content: JSON.stringify({
        title: 'Test Title',
        body: 'Body text',
        bulletPoints: ['Point 1', 'Point 2'],
        speakerNotes: 'Speaker notes here',
        suggestedVisuals: ['Chart'],
        notes: 'Detailed notes',
        rewritten: 'Rewritten text here',
        changes: ['Improved clarity'],
        suggestions: [{ title: 'Idea 1', description: 'Description', relevance: 0.9 }],
        relatedTopics: ['Topic A'],
        summary: 'Executive summary',
        keyFindings: ['Finding 1'],
        recommendations: ['Rec 1'],
        metrics: [{ name: 'Revenue', value: '1M', trend: 'up' }],
        narrative: 'Data narrative',
        sections: [{ heading: 'S1', content: 'C1' }],
        optimized: 'Optimized text',
        seoScore: 85,
        keywordDensity: { test: 2.5 },
        score: 90,
        issues: [{ severity: 'low', description: 'Minor issue', suggestion: 'Fix it' }],
        altTextSuggestions: [],
        suggestedType: 'bar',
        reasoning: 'Bar chart best for comparison',
        alternatives: [{ type: 'line', score: 0.7 }],
        dataMapping: { xAxis: 'month', yAxis: 'value', series: ['revenue'] },
        anomalies: [{ field: 'sales', value: '-100', expected: '100+', severity: 'high', suggestion: 'Check data' }],
        dataQuality: 75,
        objectives: ['Obj 1'],
        quiz: [{ question: 'Q1?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }],
        posts: [{ text: 'Post text', hashtags: ['#tech'], suggestedImage: 'Tech image', platform: 'linkedin' }],
        content: 'Financial content',
        projections: [{ period: 'Q1', value: 1000000, confidence: 0.85 }],
        insights: ['Insight 1'],
        risks: ['Risk 1'],
        sentiment: { score: 0.8, label: 'positive' },
        entities: [{ text: 'Riyadh', type: 'location', confidence: 0.95 }],
        keywords: ['AI', 'business'],
        readabilityScore: 80,
        language: 'ar',
        translated: 'Translated text',
        sourceLanguage: 'en',
        workflow: [{ step: 1, action: 'Review', responsible: 'Manager', duration: '1 day' }],
        approvalPath: ['Manager', 'Director'],
        estimatedTime: '3 days',
      }),
    },
  }],
  usage: { total_tokens: 100 },
};

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn().mockResolvedValue(mockResponse) } },
    images: {
      generate: jest.fn().mockResolvedValue({
        data: [{ url: 'https://example.com/image.png', revised_prompt: 'revised prompt' }],
      }),
    },
  })),
}));

import * as aiContent from '../services/ai-content-generator.service.js';

describe('AI Content Generator Service', () => {
  describe('generateSlideContent', () => {
    it('should generate slide content for a topic', async () => {
      const result = await aiContent.generateSlideContent('AI in Business');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('body');
      expect(result).toHaveProperty('bulletPoints');
      expect(result).toHaveProperty('speakerNotes');
      expect(result).toHaveProperty('suggestedVisuals');
    });

    it('should accept tone and language options', async () => {
      const result = await aiContent.generateSlideContent('Digital Marketing', {
        tone: 'creative',
        language: 'ar',
      });
      expect(result.title).toBeDefined();
    });
  });

  describe('generateSpeakerNotes', () => {
    it('should generate speaker notes', async () => {
      const notes = await aiContent.generateSpeakerNotes('Slide about AI applications');
      expect(typeof notes).toBe('string');
      expect(notes.length).toBeGreaterThan(0);
    });
  });

  describe('rewriteContent', () => {
    it('should rewrite content with specified action', async () => {
      const result = await aiContent.rewriteContent('Original text here', {
        action: 'formalize',
        tone: 'executive',
      });
      expect(result).toHaveProperty('original', 'Original text here');
      expect(result).toHaveProperty('rewritten');
      expect(result).toHaveProperty('changes');
    });

    it('should support summarize action', async () => {
      const result = await aiContent.rewriteContent('Long text to summarize', { action: 'summarize' });
      expect(result.rewritten).toBeDefined();
    });

    it('should support expand action', async () => {
      const result = await aiContent.rewriteContent('Brief text', { action: 'expand' });
      expect(result.rewritten).toBeDefined();
    });
  });

  describe('suggestContent', () => {
    it('should suggest content ideas', async () => {
      const result = await aiContent.suggestContent('Digital transformation strategy');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('relatedTopics');
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('generateExecutiveSummary', () => {
    it('should generate executive summary', async () => {
      const result = await aiContent.generateExecutiveSummary('Long report content here...');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('keyFindings');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('metrics');
    });
  });

  describe('generateNarrative', () => {
    it('should generate data narrative', async () => {
      const result = await aiContent.generateNarrative('Revenue: Q1=100K, Q2=150K, Q3=200K');
      expect(result).toHaveProperty('narrative');
      expect(result).toHaveProperty('sections');
    });
  });

  describe('optimizeForSEO', () => {
    it('should optimize content for SEO', async () => {
      const result = await aiContent.optimizeForSEO('Article about AI', ['artificial intelligence', 'AI']);
      expect(result).toHaveProperty('optimized');
      expect(result).toHaveProperty('seoScore');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('keywordDensity');
    });
  });

  describe('checkAccessibility', () => {
    it('should check content accessibility', async () => {
      const result = await aiContent.checkAccessibility('<h1>Title</h1><img src="test.png">');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('altTextSuggestions');
    });
  });

  describe('generateImage', () => {
    it('should generate image from prompt', async () => {
      const result = await aiContent.generateImage('A modern office building');
      expect(result).toHaveProperty('imageUrl');
      expect(result).toHaveProperty('revisedPrompt');
    });

    it('should accept style options', async () => {
      const result = await aiContent.generateImage('Abstract art', { style: 'artistic', quality: 'hd' });
      expect(result.imageUrl).toBeDefined();
    });
  });

  describe('generateIcon', () => {
    it('should generate icon', async () => {
      const result = await aiContent.generateIcon('settings gear');
      expect(result).toHaveProperty('iconUrl');
      expect(result).toHaveProperty('description');
    });
  });

  describe('suggestChartType', () => {
    it('should suggest chart type for data', async () => {
      const result = await aiContent.suggestChartType('Month,Revenue\nJan,100\nFeb,150\nMar,200');
      expect(result).toHaveProperty('suggestedType');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('alternatives');
      expect(result).toHaveProperty('dataMapping');
    });
  });

  describe('detectAnomalies', () => {
    it('should detect data anomalies', async () => {
      const result = await aiContent.detectAnomalies('Sales: 100, 150, -500, 200, 180');
      expect(result).toHaveProperty('anomalies');
      expect(result).toHaveProperty('dataQuality');
    });
  });

  describe('generateTrainingContent', () => {
    it('should generate training content', async () => {
      const result = await aiContent.generateTrainingContent('Data Privacy', { level: 'beginner' });
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('objectives');
      expect(result).toHaveProperty('sections');
    });

    it('should include quiz when format is quiz', async () => {
      const result = await aiContent.generateTrainingContent('Cybersecurity', { format: 'quiz' });
      expect(result).toHaveProperty('quiz');
    });
  });

  describe('generateSocialContent', () => {
    it('should generate social media content', async () => {
      const result = await aiContent.generateSocialContent('Product Launch');
      expect(result).toHaveProperty('posts');
      expect(result.posts.length).toBeGreaterThan(0);
    });
  });

  describe('generateFinancialContent', () => {
    it('should generate financial analysis', async () => {
      const result = await aiContent.generateFinancialContent('Revenue: 1M, Costs: 600K', { type: 'analysis' });
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('projections');
      expect(result).toHaveProperty('insights');
      expect(result).toHaveProperty('risks');
    });
  });

  describe('analyzeText', () => {
    it('should analyze text with NLP', async () => {
      const result = await aiContent.analyzeText('This is great news for the company in Riyadh');
      expect(result).toHaveProperty('sentiment');
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('keywords');
      expect(result).toHaveProperty('readabilityScore');
      expect(result).toHaveProperty('wordCount');
    });
  });

  describe('translateContent', () => {
    it('should translate content', async () => {
      const result = await aiContent.translateContent('Hello World', 'ar');
      expect(result).toHaveProperty('translated');
      expect(result).toHaveProperty('sourceLanguage');
      expect(result).toHaveProperty('wordCount');
    });

    it('should accept glossary', async () => {
      const result = await aiContent.translateContent('Machine Learning model', 'ar', {
        glossary: { 'Machine Learning': 'تعلم الآلة' },
      });
      expect(result.translated).toBeDefined();
    });
  });

  describe('suggestWorkflow', () => {
    it('should suggest workflow', async () => {
      const result = await aiContent.suggestWorkflow('Quarterly report approval process');
      expect(result).toHaveProperty('workflow');
      expect(result).toHaveProperty('approvalPath');
      expect(result).toHaveProperty('estimatedTime');
      expect(result.workflow.length).toBeGreaterThan(0);
    });
  });
});
