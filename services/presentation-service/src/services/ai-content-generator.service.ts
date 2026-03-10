import OpenAI from 'openai';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-content-generator' },
  transports: [new winston.transports.Console()],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

// ─── Text Content Generation ─────────────────────────────────

export type WritingTone = 'formal' | 'casual' | 'creative' | 'executive' | 'academic' | 'friendly' | 'technical';
export type ContentType = 'slide' | 'report' | 'email' | 'article' | 'social' | 'summary' | 'proposal' | 'training';

export interface ContentGenerationOptions {
  tone?: WritingTone;
  language?: string;
  targetAudience?: string;
  wordCount?: number;
  contentType?: ContentType;
  industry?: string;
  keywords?: string[];
  seoOptimize?: boolean;
}

export async function generateSlideContent(
  topic: string,
  options: ContentGenerationOptions = {}
): Promise<{
  title: string;
  body: string;
  bulletPoints: string[];
  speakerNotes: string;
  suggestedVisuals: string[];
}> {
  const tone = options.tone || 'professional';
  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a presentation content expert. Generate slide content in ${language} with a ${tone} tone.
Return ONLY valid JSON:
{
  "title": "Slide title (max 8 words)",
  "body": "Main paragraph content",
  "bulletPoints": ["point1", "point2", "point3"],
  "speakerNotes": "Detailed speaker notes (3-5 sentences)",
  "suggestedVisuals": ["visual suggestion 1", "visual suggestion 2"]
}`,
      },
      { role: 'user', content: `Generate slide content for: ${topic}` },
    ],
    max_tokens: 1500,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  logger.info('Slide content generated', { topic, tone, language });
  return {
    title: result.title || topic,
    body: result.body || '',
    bulletPoints: result.bulletPoints || [],
    speakerNotes: result.speakerNotes || '',
    suggestedVisuals: result.suggestedVisuals || [],
  };
}

export async function generateSpeakerNotes(
  slideContent: string,
  options: { language?: string; detailLevel?: 'brief' | 'standard' | 'detailed' } = {}
): Promise<string> {
  const language = options.language || 'ar';
  const detailLevel = options.detailLevel || 'standard';

  const wordCounts: Record<string, string> = { brief: '50-80', standard: '100-150', detailed: '200-300' };

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Generate speaker notes in ${language} (${wordCounts[detailLevel]} words). Include talking points, transitions, and timing. Return JSON: {"notes": "..."}`,
      },
      { role: 'user', content: `Slide content:\n${slideContent}` },
    ],
    max_tokens: 1000,
    temperature: 0.6,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return result.notes || '';
}

// ─── Text Rewriting & Enhancement ────────────────────────────

export async function rewriteContent(
  text: string,
  options: {
    tone?: WritingTone;
    targetAudience?: string;
    action: 'rewrite' | 'summarize' | 'expand' | 'simplify' | 'formalize' | 'make_creative';
    language?: string;
  }
): Promise<{ original: string; rewritten: string; changes: string[] }> {
  const actionPrompts: Record<string, string> = {
    rewrite: 'Rewrite this text while preserving the meaning but improving clarity and flow',
    summarize: 'Summarize this text concisely, keeping only the key points',
    expand: 'Expand this text with more details, examples, and explanations',
    simplify: 'Simplify this text using plain language accessible to a general audience',
    formalize: 'Rewrite this text in a formal, professional tone suitable for executive communication',
    make_creative: 'Rewrite this text in a creative, engaging, and compelling way',
  };

  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a professional editor. ${actionPrompts[options.action]}.
${options.targetAudience ? `Target audience: ${options.targetAudience}` : ''}
${options.tone ? `Tone: ${options.tone}` : ''}
Language: ${language}
Return JSON: {"rewritten": "...", "changes": ["change1", "change2"]}`,
      },
      { role: 'user', content: text },
    ],
    max_tokens: 2000,
    temperature: 0.6,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  logger.info('Content rewritten', { action: options.action, originalLength: text.length });
  return {
    original: text,
    rewritten: result.rewritten || text,
    changes: result.changes || [],
  };
}

// ─── Content Suggestions & Ideas ─────────────────────────────

export async function suggestContent(
  context: string,
  options: { type?: string; count?: number; language?: string } = {}
): Promise<{
  suggestions: { title: string; description: string; relevance: number }[];
  relatedTopics: string[];
}> {
  const count = options.count || 5;
  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Generate ${count} content suggestions in ${language}. Return JSON:
{
  "suggestions": [{"title": "...", "description": "...", "relevance": 0.95}],
  "relatedTopics": ["topic1", "topic2"]
}`,
      },
      { role: 'user', content: `Context: ${context}` },
    ],
    max_tokens: 2000,
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    suggestions: result.suggestions || [],
    relatedTopics: result.relatedTopics || [],
  };
}

// ─── Executive Summary Generation ────────────────────────────

export async function generateExecutiveSummary(
  content: string,
  options: { language?: string; maxWords?: number; includeRecommendations?: boolean } = {}
): Promise<{
  summary: string;
  keyFindings: string[];
  recommendations: string[];
  metrics: { name: string; value: string; trend: string }[];
}> {
  const language = options.language || 'ar';
  const maxWords = options.maxWords || 200;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Generate an executive summary in ${language} (max ${maxWords} words). Return JSON:
{
  "summary": "Executive summary text",
  "keyFindings": ["finding1", "finding2"],
  "recommendations": ["rec1", "rec2"],
  "metrics": [{"name": "metric", "value": "value", "trend": "up|down|stable"}]
}`,
      },
      { role: 'user', content: content.substring(0, 6000) },
    ],
    max_tokens: 2000,
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    summary: result.summary || '',
    keyFindings: result.keyFindings || [],
    recommendations: result.recommendations || [],
    metrics: result.metrics || [],
  };
}

// ─── Narrative/Story Generation ──────────────────────────────

export async function generateNarrative(
  data: string,
  options: { style?: 'story' | 'analytical' | 'persuasive'; language?: string } = {}
): Promise<{ narrative: string; sections: { heading: string; content: string }[] }> {
  const style = options.style || 'analytical';
  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Transform data into a ${style} narrative in ${language}. Return JSON:
{
  "narrative": "Full narrative text",
  "sections": [{"heading": "Section", "content": "Content"}]
}`,
      },
      { role: 'user', content: `Data to narrate:\n${data.substring(0, 4000)}` },
    ],
    max_tokens: 3000,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return { narrative: result.narrative || '', sections: result.sections || [] };
}

// ─── SEO Optimization ────────────────────────────────────────

export async function optimizeForSEO(
  content: string,
  keywords: string[],
  options: { language?: string } = {}
): Promise<{
  optimized: string;
  seoScore: number;
  suggestions: string[];
  keywordDensity: Record<string, number>;
}> {
  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Optimize content for SEO in ${language}. Target keywords: ${keywords.join(', ')}.
Return JSON:
{
  "optimized": "SEO-optimized text",
  "seoScore": 85,
  "suggestions": ["suggestion1"],
  "keywordDensity": {"keyword": 2.5}
}`,
      },
      { role: 'user', content: content },
    ],
    max_tokens: 2000,
    temperature: 0.4,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    optimized: result.optimized || content,
    seoScore: result.seoScore || 0,
    suggestions: result.suggestions || [],
    keywordDensity: result.keywordDensity || {},
  };
}

// ─── Accessibility Check ─────────────────────────────────────

export async function checkAccessibility(
  content: string,
  options: { language?: string } = {}
): Promise<{
  score: number;
  issues: { severity: 'high' | 'medium' | 'low'; description: string; suggestion: string }[];
  altTextSuggestions: { element: string; suggestedAlt: string }[];
}> {
  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Audit content for accessibility (WCAG 2.1 AA). Language: ${language}.
Return JSON:
{
  "score": 85,
  "issues": [{"severity": "high|medium|low", "description": "issue", "suggestion": "fix"}],
  "altTextSuggestions": [{"element": "image description", "suggestedAlt": "alt text"}]
}`,
      },
      { role: 'user', content: content },
    ],
    max_tokens: 2000,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    score: result.score || 0,
    issues: result.issues || [],
    altTextSuggestions: result.altTextSuggestions || [],
  };
}

// ─── AI Image Generation ─────────────────────────────────────

export async function generateImage(
  prompt: string,
  options: {
    style?: 'realistic' | 'illustration' | 'cartoon' | 'artistic' | 'cinematic' | 'minimalist';
    size?: '1024x1024' | '1792x1024' | '1024x1792';
    quality?: 'standard' | 'hd';
  } = {}
): Promise<{ imageUrl: string; revisedPrompt: string }> {
  const style = options.style || 'realistic';
  const size = options.size || '1024x1024';
  const quality = options.quality || 'standard';

  const styledPrompt = `${prompt}. Style: ${style}, high quality, professional`;

  const response = await openai.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL || 'dall-e-3',
    prompt: styledPrompt,
    n: 1,
    size: size,
    quality: quality,
  });

  const imageUrl = response.data?.[0]?.url || '';
  const revisedPrompt = response.data?.[0]?.revised_prompt || styledPrompt;

  logger.info('Image generated', { style, size, quality, promptLength: prompt.length });
  return { imageUrl, revisedPrompt };
}

export async function editImage(
  imageBase64: string,
  editPrompt: string,
  options: { action: 'modify' | 'remove_bg' | 'upscale' | 'restore' | 'remove_text' | 'change_color' } = { action: 'modify' }
): Promise<{ result: string; action: string }> {
  // Use GPT-4V for image analysis + DALL-E for regeneration
  const actionDescriptions: Record<string, string> = {
    modify: 'Modify the image based on the description',
    remove_bg: 'Remove the background from the image',
    upscale: 'Enhance and upscale the image quality',
    restore: 'Restore and repair the damaged image',
    remove_text: 'Remove all text overlays from the image',
    change_color: 'Change the color scheme of the image',
  };

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Analyze this image and describe what it would look like after: ${actionDescriptions[options.action]}.
Additional instructions: ${editPrompt}
Return JSON: {"description": "detailed description of the modified image", "modifications": ["change1", "change2"]}`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `${actionDescriptions[options.action]}: ${editPrompt}` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}`, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const analysis = JSON.parse(completion.choices[0]?.message?.content || '{}');

  // Regenerate with DALL-E based on the analysis
  const regenerated = await generateImage(analysis.description || editPrompt, { style: 'realistic', quality: 'hd' });

  logger.info('Image edited', { action: options.action });
  return { result: regenerated.imageUrl, action: options.action };
}

// ─── AI Icon & Visual Generation ─────────────────────────────

export async function generateIcon(
  description: string,
  options: { style?: 'flat' | 'outlined' | '3d' | 'filled'; color?: string; size?: number } = {}
): Promise<{ iconUrl: string; description: string }> {
  const style = options.style || 'flat';
  const color = options.color || '#1a73e8';

  const result = await generateImage(
    `Simple ${style} icon: ${description}. Single icon on transparent background, ${color} color, clean design, no text`,
    { style: 'minimalist', size: '1024x1024' }
  );

  return { iconUrl: result.imageUrl, description };
}

// ─── Smart Chart Suggestion ──────────────────────────────────

export async function suggestChartType(
  data: string,
  options: { language?: string } = {}
): Promise<{
  suggestedType: string;
  reasoning: string;
  alternatives: { type: string; score: number }[];
  dataMapping: { xAxis: string; yAxis: string; series: string[] };
}> {
  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Analyze data and suggest the best chart type in ${language}. Return JSON:
{
  "suggestedType": "bar|line|pie|doughnut|area|scatter|radar|treemap|funnel|gauge",
  "reasoning": "Why this chart type",
  "alternatives": [{"type": "...", "score": 0.8}],
  "dataMapping": {"xAxis": "field", "yAxis": "field", "series": ["field1"]}
}`,
      },
      { role: 'user', content: `Data:\n${data.substring(0, 3000)}` },
    ],
    max_tokens: 1000,
    temperature: 0.4,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    suggestedType: result.suggestedType || 'bar',
    reasoning: result.reasoning || '',
    alternatives: result.alternatives || [],
    dataMapping: result.dataMapping || { xAxis: '', yAxis: '', series: [] },
  };
}

// ─── Anomaly Detection ───────────────────────────────────────

export async function detectAnomalies(
  data: string,
  options: { language?: string } = {}
): Promise<{
  anomalies: { field: string; value: string; expected: string; severity: string; suggestion: string }[];
  dataQuality: number;
}> {
  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Detect anomalies and data quality issues in ${language}. Return JSON:
{
  "anomalies": [{"field": "...", "value": "...", "expected": "...", "severity": "high|medium|low", "suggestion": "..."}],
  "dataQuality": 85
}`,
      },
      { role: 'user', content: `Data:\n${data.substring(0, 4000)}` },
    ],
    max_tokens: 2000,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    anomalies: result.anomalies || [],
    dataQuality: result.dataQuality || 0,
  };
}

// ─── Training Content Generation ─────────────────────────────

export async function generateTrainingContent(
  topic: string,
  options: {
    level?: 'beginner' | 'intermediate' | 'advanced';
    format?: 'slides' | 'quiz' | 'handbook' | 'scenario';
    language?: string;
  } = {}
): Promise<{
  title: string;
  objectives: string[];
  sections: { heading: string; content: string; activity?: string }[];
  quiz?: { question: string; options: string[]; correctAnswer: number }[];
}> {
  const level = options.level || 'intermediate';
  const format = options.format || 'slides';
  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Generate ${level}-level training content in ${format} format, language: ${language}. Return JSON:
{
  "title": "Training Title",
  "objectives": ["obj1", "obj2"],
  "sections": [{"heading": "Section", "content": "Content", "activity": "Optional activity"}],
  "quiz": [{"question": "Q?", "options": ["A", "B", "C", "D"], "correctAnswer": 0}]
}`,
      },
      { role: 'user', content: `Training topic: ${topic}` },
    ],
    max_tokens: 4000,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    title: result.title || topic,
    objectives: result.objectives || [],
    sections: result.sections || [],
    quiz: result.quiz || undefined,
  };
}

// ─── Social Media Content ────────────────────────────────────

export async function generateSocialContent(
  topic: string,
  options: {
    platform?: 'twitter' | 'linkedin' | 'instagram' | 'facebook';
    count?: number;
    language?: string;
    includeHashtags?: boolean;
  } = {}
): Promise<{
  posts: { text: string; hashtags: string[]; suggestedImage: string; platform: string }[];
}> {
  const platform = options.platform || 'linkedin';
  const count = options.count || 3;
  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Generate ${count} ${platform} posts in ${language}. Return JSON:
{
  "posts": [{"text": "post text", "hashtags": ["#tag1"], "suggestedImage": "image description", "platform": "${platform}"}]
}`,
      },
      { role: 'user', content: `Topic: ${topic}` },
    ],
    max_tokens: 2000,
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return { posts: result.posts || [] };
}

// ─── Financial Content ───────────────────────────────────────

export async function generateFinancialContent(
  data: string,
  options: {
    type: 'forecast' | 'analysis' | 'model' | 'strategy';
    language?: string;
  }
): Promise<{
  content: string;
  projections: { period: string; value: number; confidence: number }[];
  insights: string[];
  risks: string[];
}> {
  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Generate ${options.type} financial content in ${language}. Return JSON:
{
  "content": "Financial analysis text",
  "projections": [{"period": "Q1 2026", "value": 1000000, "confidence": 0.85}],
  "insights": ["insight1"],
  "risks": ["risk1"]
}`,
      },
      { role: 'user', content: `Financial data:\n${data.substring(0, 4000)}` },
    ],
    max_tokens: 3000,
    temperature: 0.4,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    content: result.content || '',
    projections: result.projections || [],
    insights: result.insights || [],
    risks: result.risks || [],
  };
}

// ─── NLP Analysis ────────────────────────────────────────────

export async function analyzeText(
  text: string,
  options: { language?: string } = {}
): Promise<{
  sentiment: { score: number; label: string };
  entities: { text: string; type: string; confidence: number }[];
  keywords: string[];
  readabilityScore: number;
  language: string;
  wordCount: number;
}> {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Perform NLP analysis. Return JSON:
{
  "sentiment": {"score": 0.75, "label": "positive|negative|neutral"},
  "entities": [{"text": "entity", "type": "person|org|location|date|number", "confidence": 0.95}],
  "keywords": ["keyword1"],
  "readabilityScore": 75,
  "language": "detected language code"
}`,
      },
      { role: 'user', content: text.substring(0, 3000) },
    ],
    max_tokens: 2000,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    sentiment: result.sentiment || { score: 0, label: 'neutral' },
    entities: result.entities || [],
    keywords: result.keywords || [],
    readabilityScore: result.readabilityScore || 0,
    language: result.language || options.language || 'unknown',
    wordCount: text.split(/\s+/).length,
  };
}

// ─── Translate Content ───────────────────────────────────────

export async function translateContent(
  text: string,
  targetLanguage: string,
  options: { preserveFormatting?: boolean; glossary?: Record<string, string> } = {}
): Promise<{ translated: string; sourceLanguage: string; wordCount: number }> {
  const glossaryInstructions = options.glossary
    ? `Use this glossary: ${JSON.stringify(options.glossary)}`
    : '';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Translate to ${targetLanguage}. ${glossaryInstructions}
${options.preserveFormatting ? 'Preserve all formatting, bullet points, and line breaks.' : ''}
Return JSON: {"translated": "...", "sourceLanguage": "detected lang code"}`,
      },
      { role: 'user', content: text },
    ],
    max_tokens: 4000,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    translated: result.translated || '',
    sourceLanguage: result.sourceLanguage || 'unknown',
    wordCount: (result.translated || '').split(/\s+/).length,
  };
}

// ─── Workflow Suggestion ─────────────────────────────────────

export async function suggestWorkflow(
  description: string,
  options: { language?: string } = {}
): Promise<{
  workflow: { step: number; action: string; responsible: string; duration: string }[];
  approvalPath: string[];
  estimatedTime: string;
}> {
  const language = options.language || 'ar';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Design a workflow in ${language}. Return JSON:
{
  "workflow": [{"step": 1, "action": "...", "responsible": "...", "duration": "..."}],
  "approvalPath": ["role1", "role2"],
  "estimatedTime": "estimated total time"
}`,
      },
      { role: 'user', content: description },
    ],
    max_tokens: 2000,
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    workflow: result.workflow || [],
    approvalPath: result.approvalPath || [],
    estimatedTime: result.estimatedTime || '',
  };
}
